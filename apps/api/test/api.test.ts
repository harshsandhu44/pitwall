import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { ApiResponse } from "@pitwall/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { resetUpstreamState } from "../src/upstream";
import calendar2026 from "./fixtures/calendar-2026.json";
import standings1985 from "./fixtures/driver-standings-1985.json";
import resultsPage0 from "./fixtures/results-2026-page0.json";

type Upstream = (url: URL) => Response | Promise<Response>;
let upstream: Upstream;
let calls: string[];

beforeEach(() => {
  resetUpstreamState();
  calls = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push(url.pathname + url.search);
    return upstream(url);
  });
});
afterEach(() => vi.restoreAllMocks());

const ok = (body: unknown) => Response.json(body);

async function get<T = unknown>(path: string, headers: HeadersInit = {}) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://api.test${path}`, { headers }), env, ctx);
  await waitOnExecutionContext(ctx);
  return { status: res.status, headers: res.headers, body: (await res.json()) as ApiResponse<T> };
}

// Each test uses its own season so Cache API entries never leak between tests.
const calendarFor = (season: number) => ({
  ...calendar2026,
  MRData: {
    ...calendar2026.MRData,
    RaceTable: { ...calendar2026.MRData.RaceTable, Races: calendar2026.MRData.RaceTable.Races.map((r) => ({ ...r, season: String(season) })) },
  },
});

describe("routes", () => {
  it("serves a calendar: miss, then cache hit without another upstream call", async () => {
    upstream = () => ok(calendarFor(2001));
    const first = await get<unknown[]>("/api/calendar?season=2001");
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ status: "ok", cache: "miss", source: "jolpica" });
    expect(first.body.data).toHaveLength(23);
    expect(calls).toEqual(["/ergast/f1/2001.json?limit=100&offset=0"]);

    const second = await get("/api/calendar?season=2001");
    expect(second.body).toMatchObject({ status: "ok", cache: "hit" });
    expect(calls).toHaveLength(1);
  });

  it("normalizes historical standings with missing driver codes and numbers", async () => {
    upstream = () => ok(standings1985);
    const { body } = await get<{ round: number; entries: { driver: { code: string | null; number: number | null }; points: number }[] }>(
      "/api/standings/drivers?season=1985",
    );
    expect(body.status).toBe("ok");
    expect(body.data!.round).toBe(16);
    expect(body.data!.entries[0]).toMatchObject({ points: 73, driver: { id: "prost", code: null, number: null } });
  });

  it("merges a race whose results span two pages", async () => {
    // Page 0 holds rounds 1–4 in full and the first 12 finishers of round 5.
    const races = resultsPage0.MRData.RaceTable.Races;
    const round5 = races.at(-1)!;
    const rest = races[0]!.Results.slice(12).map((r, i) => ({ ...r, position: String(13 + i), positionText: String(13 + i) }));
    const page = (offset: number, list: unknown[]) => ({
      MRData: { ...resultsPage0.MRData, total: "110", offset: String(offset), RaceTable: { ...resultsPage0.MRData.RaceTable, Races: list } },
    });
    upstream = (url) =>
      ok(url.searchParams.get("offset") === "0" ? page(0, races) : page(100, [{ ...round5, Results: rest }]));

    const { body } = await get<{ races: { round: number; results: unknown[] }[] }>("/api/results?season=2026");
    expect(calls).toEqual(["/ergast/f1/2026/results.json?limit=100&offset=0", "/ergast/f1/2026/results.json?limit=100&offset=100"]);
    expect(body.data!.races.map((r) => r.round)).toEqual([1, 2, 3, 4, 5]);
    expect(body.data!.races.at(-1)!.results).toHaveLength(22);
  });

  it("rejects invalid parameters with 400", async () => {
    upstream = () => ok({});
    expect((await get("/api/calendar?season=abc")).status).toBe(400);
    expect((await get("/api/standings/progression?season=2020&type=bogus")).status).toBe(400);
    expect((await get("/api/drivers/DROP%20TABLE")).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("returns 404 for unknown endpoints", async () => {
    expect((await get("/api/anything")).status).toBe(404);
  });
});

describe("upstream failures", () => {
  it("retries a 5xx once, then reports unavailable", async () => {
    upstream = () => new Response("boom", { status: 502 });
    const { status, body } = await get("/api/calendar?season=2002");
    expect(status).toBe(503);
    expect(body).toMatchObject({ status: "unavailable", data: null, reason: "HTTP 502" });
    expect(calls).toHaveLength(2);
  });

  it("recovers when the retry succeeds", async () => {
    let n = 0;
    upstream = () => (n++ === 0 ? new Response("boom", { status: 500 }) : ok(calendarFor(2003)));
    const { body } = await get("/api/calendar?season=2003");
    expect(body.status).toBe("ok");
    expect(calls).toHaveLength(2);
  });

  it("maps timeouts after one retry", async () => {
    upstream = () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    };
    const { body } = await get("/api/calendar?season=2004");
    expect(body).toMatchObject({ status: "unavailable", reason: "timeout error" });
    expect(calls).toHaveLength(2);
  });

  it("reports invalid upstream payloads as errors", async () => {
    upstream = () => ok({ MRData: { nope: true } });
    const { status, body } = await get("/api/calendar?season=2005");
    expect(status).toBe(502);
    expect(body.status).toBe("error");
    expect(body.reason).toMatch(/unexpected response shape/);
  });

  it("honours Retry-After on 429 and backs off without calling the provider again", async () => {
    upstream = () => new Response("slow down", { status: 429, headers: { "Retry-After": "30" } });
    const first = await get("/api/calendar?season=2006");
    expect(first.body).toMatchObject({ status: "unavailable", reason: "rate limited, retry after 30s" });
    expect(calls).toHaveLength(1);

    const second = await get("/api/calendar?season=2007");
    expect(second.body.status).toBe("unavailable");
    expect(second.body.reason).toMatch(/backing off/);
    expect(calls).toHaveLength(1);
  });

  it("falls back to the D1 snapshot (marked stale) when the cache is gone and the upstream fails", async () => {
    upstream = () => ok(calendarFor(2008));
    expect((await get("/api/calendar?season=2008")).body.status).toBe("ok");

    await caches.default.delete(new Request("https://cache.pitwall.internal/calendar/2008"));
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 31 * 86_400_000 }); // past the 30-day ttl
    upstream = () => new Response("down", { status: 503 });
    const { status, body } = await get<unknown[]>("/api/calendar?season=2008");
    vi.useRealTimers();
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "stale", cache: "fallback", reason: "HTTP 503" });
    expect(body.data).toHaveLength(23);
  });

  it("serves a fresh D1 snapshot on a Cache API miss without calling the provider (other data centres)", async () => {
    upstream = () => ok(calendarFor(2009));
    await get("/api/calendar?season=2009");
    await caches.default.delete(new Request("https://cache.pitwall.internal/calendar/2009"));
    const { body } = await get("/api/calendar?season=2009");
    expect(body).toMatchObject({ status: "ok", cache: "hit" });
    expect(calls).toHaveLength(1);
  });

  it("serves stale cache entries while revalidating in the background", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-10-10T00:00:00Z") });
    upstream = () => ok(calendarFor(2026));
    await get("/api/calendar?season=2026");
    vi.setSystemTime(Date.parse("2026-10-10T07:00:00Z")); // past the 6h ttl
    const { body } = await get("/api/calendar?season=2026");
    expect(body).toMatchObject({ status: "stale", cache: "stale" });
    expect(calls).toHaveLength(2); // background refresh
    vi.useRealTimers();
  });
});

describe("snapshot refresh", () => {
  it("revalidates a stale cache entry from a newer D1 snapshot instead of the provider", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2027-03-01T00:00:00Z") });
    upstream = () => ok(calendarFor(2027));
    await get("/api/calendar?season=2027");
    vi.setSystemTime(Date.parse("2027-03-01T07:00:00Z")); // past the 6h ttl
    // The cron (or another data centre) refreshed D1 a minute ago.
    await env.DB.prepare("UPDATE upstream_snapshot SET fetched_at = ?1 WHERE key = 'calendar/2027'").bind(Date.now() - 60_000).run();
    expect((await get("/api/calendar?season=2027")).body).toMatchObject({ status: "stale", cache: "stale" });
    const { body } = await get("/api/calendar?season=2027");
    vi.useRealTimers();
    expect(body).toMatchObject({ status: "ok", cache: "hit", fetchedAt: "2027-03-01T06:59:00.000Z" });
    expect(calls).toHaveLength(1);
  });
});

describe("CORS", () => {
  it("echoes allowed origins only", async () => {
    upstream = () => ok({});
    const allowed = await get("/api/health", { Origin: "http://localhost:3000" });
    expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
    const denied = await get("/api/health", { Origin: "https://evil.example" });
    expect(denied.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
