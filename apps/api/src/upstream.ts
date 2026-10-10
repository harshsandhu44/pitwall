import type { Source } from "@pitwall/shared";
import { z } from "zod";

export type UpstreamSource = Exclude<Source, "pitwall">;
export type UpstreamErrorKind = "timeout" | "network" | "http" | "rate_limited" | "invalid" | "not_found";

export class UpstreamError extends Error {
  constructor(
    readonly source: UpstreamSource,
    readonly kind: UpstreamErrorKind,
    message: string,
  ) {
    super(message);
  }
}

/** Minimum spacing between requests and per-request timeout for each provider. */
const POLICY: Record<UpstreamSource, { minIntervalMs: number; timeoutMs: number }> = {
  jolpica: { minIntervalMs: 260, timeoutMs: 8000 }, // ~4 req/s burst limit
  openf1: { minIntervalMs: 350, timeoutMs: 15000 },
  "open-meteo": { minIntervalMs: 100, timeoutMs: 8000 },
  rainviewer: { minIntervalMs: 100, timeoutMs: 5000 },
};

// ponytail: per-isolate pacing/backoff. Isolates don't share it; a Durable Object would make it global.
const pacing = new Map<UpstreamSource, { next: number; blockedUntil: number }>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function retryAfterSeconds(header: string | null): number {
  if (!header) return 60;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.max(0, secs);
  const at = Date.parse(header);
  return Number.isNaN(at) ? 60 : Math.max(0, (at - Date.now()) / 1000);
}

async function pace(source: UpstreamSource) {
  const s = pacing.get(source) ?? { next: 0, blockedUntil: 0 };
  pacing.set(source, s);
  const now = Date.now();
  if (s.blockedUntil > now) {
    throw new UpstreamError(source, "rate_limited", `backing off for ${Math.ceil((s.blockedUntil - now) / 1000)}s`);
  }
  const wait = Math.max(0, s.next - now);
  s.next = Math.max(now, s.next) + POLICY[source].minIntervalMs;
  if (wait) await sleep(wait);
}

/** Test hook: forget pacing/backoff state between tests. */
export function resetUpstreamState() {
  pacing.clear();
}

/**
 * GET JSON from an allow-listed provider and validate it.
 * One retry for network errors, timeouts and 5xx; a 429 sets a provider backoff from Retry-After
 * (retried once only when the wait is short).
 */
export async function fetchJson<T>(
  source: UpstreamSource,
  url: string,
  schema: z.ZodType<T>,
  userAgent: string,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const canRetry = attempt === 0;
    await pace(source);

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": userAgent, Accept: "application/json" },
        signal: AbortSignal.timeout(POLICY[source].timeoutMs),
      });
    } catch (e) {
      const kind = e instanceof Error && e.name === "TimeoutError" ? "timeout" : "network";
      if (canRetry) {
        await sleep(300);
        continue;
      }
      throw new UpstreamError(source, kind, `${kind} error`);
    }

    if (res.status === 429) {
      const wait = retryAfterSeconds(res.headers.get("retry-after"));
      if (canRetry && wait <= 2) {
        await sleep(wait * 1000);
        continue;
      }
      pacing.get(source)!.blockedUntil = Date.now() + wait * 1000;
      throw new UpstreamError(source, "rate_limited", `rate limited, retry after ${Math.ceil(wait)}s`);
    }
    if (res.status >= 500 && canRetry) {
      await sleep(300);
      continue;
    }
    if (res.status === 404) throw new UpstreamError(source, "not_found", "not found upstream");
    if (!res.ok) throw new UpstreamError(source, "http", `HTTP ${res.status}`);

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new UpstreamError(source, "invalid", "response is not JSON");
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new UpstreamError(source, "invalid", `unexpected response shape: ${z.prettifyError(parsed.error)}`);
    }
    return parsed.data;
  }
}
