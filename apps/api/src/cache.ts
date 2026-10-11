import type { ApiResponse, Source } from "@pitwall/shared";
import { UpstreamError } from "./upstream";

export interface CachePolicy {
  key: string;
  source: Source;
  /** Seconds the payload counts as fresh. */
  ttl: number;
  /** Write the last good payload to D1 as a fallback (default true). Off for bulky/derived data. */
  persist?: boolean;
}

interface Entry<T> {
  data: T;
  fetchedAt: number;
}

const MAX_SNAPSHOT_BYTES = 1_500_000; // D1 rows top out at 2MB

// ponytail: per-isolate dedupe of concurrent loads. The Cache API is per data centre; D1 snapshots
// are global, so a fresh snapshot stops other data centres from refetching the same upstream data.
const inflight = new Map<string, Promise<Entry<unknown>>>();

const cacheRequest = (key: string) => new Request(`https://cache.pitwall.internal/${encodeURI(key)}`);

function envelope<T>(p: CachePolicy, entry: Entry<T>, status: "ok" | "stale", cache: ApiResponse<T>["cache"]): ApiResponse<T> {
  return {
    status,
    data: entry.data,
    source: p.source,
    fetchedAt: new Date(entry.fetchedAt).toISOString(),
    observedAt: null,
    cache,
    maxAgeSeconds: p.ttl,
  };
}

export function failure<T>(source: Source, e: unknown, maxAgeSeconds = 0): ApiResponse<T> {
  const notFound = e instanceof UpstreamError && e.kind === "not_found";
  const invalid = e instanceof UpstreamError && e.kind === "invalid";
  return {
    status: notFound ? "not_found" : invalid ? "error" : "unavailable",
    data: null,
    source,
    fetchedAt: null,
    observedAt: null,
    cache: "none",
    maxAgeSeconds,
    reason: e instanceof Error ? e.message : "unknown error",
  };
}

/** Kept for 2×ttl so stale entries can be served while revalidating. */
function putCache<T>(ctx: ExecutionContext, p: CachePolicy, entry: Entry<T>) {
  const body = JSON.stringify(entry);
  ctx.waitUntil(
    caches.default.put(
      cacheRequest(p.key),
      new Response(body, { headers: { "Cache-Control": `max-age=${p.ttl * 2}`, "Content-Type": "application/json" } }),
    ),
  );
  return body;
}

function load<T>(env: Env, ctx: ExecutionContext, p: CachePolicy, loader: () => Promise<T>): Promise<Entry<T>> {
  let pending = inflight.get(p.key) as Promise<Entry<T>> | undefined;
  if (pending) return pending;
  pending = (async () => {
    const entry: Entry<T> = { data: await loader(), fetchedAt: Date.now() };
    const body = putCache(ctx, p, entry);
    if (p.persist !== false && body.length <= MAX_SNAPSHOT_BYTES) {
      ctx.waitUntil(
        env.DB.prepare(
          `INSERT INTO upstream_snapshot (key, source, payload, fetched_at) VALUES (?1, ?2, ?3, ?4)
           ON CONFLICT(key) DO UPDATE SET source = ?2, payload = ?3, fetched_at = ?4`,
        )
          .bind(p.key, p.source, JSON.stringify(entry.data), entry.fetchedAt)
          .run()
          .catch((e) => console.error("snapshot write failed", p.key, e)),
      );
    }
    return entry;
  })().finally(() => inflight.delete(p.key));
  inflight.set(p.key, pending);
  return pending;
}

async function readSnapshot<T>(env: Env, key: string): Promise<Entry<T> | null> {
  try {
    const row = await env.DB.prepare("SELECT payload, fetched_at FROM upstream_snapshot WHERE key = ?1")
      .bind(key)
      .first<{ payload: string; fetched_at: number }>();
    return row ? { data: JSON.parse(row.payload) as T, fetchedAt: row.fetched_at } : null;
  } catch (e) {
    console.error("snapshot read failed", key, e);
    return null;
  }
}

/** A newer D1 snapshot (written by the cron or another data centre) beats another upstream call. */
async function refresh<T>(env: Env, ctx: ExecutionContext, p: CachePolicy, loader: () => Promise<T>) {
  const snapshot = p.persist !== false ? await readSnapshot<T>(env, p.key) : null;
  if (snapshot && Date.now() - snapshot.fetchedAt <= p.ttl * 1000) putCache(ctx, p, snapshot);
  else await load(env, ctx, p, loader);
}

/**
 * Cache API (fresh → hit; expired → serve stale and revalidate in the background) → D1 snapshot (shared
 * across data centres; fresh → hit, expired → serve stale and revalidate) → upstream load (deduped)
 * → otherwise an error envelope. Only a key with no snapshot at all waits on the upstream.
 */
export async function cached<T>(
  env: Env,
  ctx: ExecutionContext,
  p: CachePolicy,
  loader: () => Promise<T>,
): Promise<ApiResponse<T>> {
  const hit = await caches.default.match(cacheRequest(p.key));
  if (hit) {
    const entry = await hit.json<Entry<T>>();
    if (Date.now() - entry.fetchedAt <= p.ttl * 1000) return envelope(p, entry, "ok", "hit");
    ctx.waitUntil(refresh(env, ctx, p, loader).catch(() => {}));
    return envelope(p, entry, "stale", "stale");
  }
  const snapshot = p.persist !== false ? await readSnapshot<T>(env, p.key) : null;
  if (snapshot) {
    if (Date.now() - snapshot.fetchedAt <= p.ttl * 1000) {
      putCache(ctx, p, snapshot);
      return envelope(p, snapshot, "ok", "hit");
    }
    ctx.waitUntil(load(env, ctx, p, loader).catch(() => {}));
    return envelope(p, snapshot, "stale", "stale");
  }
  try {
    return envelope(p, await load(env, ctx, p, loader), "ok", "miss");
  } catch (e) {
    return failure(p.source, e, p.ttl);
  }
}

/** Unwraps a cached call for composing endpoints; rethrows so the outer cache can fall back. */
export function must<T>(res: ApiResponse<T>): T {
  if (res.data === null) {
    throw new UpstreamError(
      res.source === "pitwall" ? "jolpica" : res.source,
      res.status === "not_found" ? "not_found" : "network",
      res.reason ?? res.status,
    );
  }
  return res.data;
}

