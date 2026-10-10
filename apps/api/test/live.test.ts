import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { ApiResponse, LiveStatus } from "@pitwall/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { resetUpstreamState } from "../src/upstream";
import calendar2026 from "./fixtures/calendar-2026.json";

const seasons = { MRData: { total: "1", limit: "100", offset: "0", SeasonTable: { Seasons: [{ season: "2026" }] } } };
const session = (key: number, start: string, end: string) => ({
  session_key: key, session_name: "Race", session_type: "Race", date_start: start, date_end: end, meeting_key: 1,
  circuit_short_name: "Melbourne", country_name: "Australia", is_cancelled: false,
});
let calls: URL[];

beforeEach(() => {
  resetUpstreamState({ paced: false });
  calls = [];
  // Saturday of the Chinese GP weekend: the Australian race has been and gone.
  vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-03-14T00:00:00Z") });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function upstream(ok: boolean) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    if (!ok) return new Response("down", { status: 503 });
    if (url.pathname.endsWith("seasons.json")) return Response.json(seasons);
    if (url.host === "api.jolpi.ca") return Response.json(calendar2026);
    if (url.pathname === "/v1/sessions") return Response.json([session(9693, "2026-03-08T04:00:00Z", "2026-03-08T06:00:00Z")]);
    if (url.pathname === "/v1/meetings") return Response.json([{ meeting_key: 1, meeting_name: "Australian Grand Prix" }]);
    return new Response("not mocked", { status: 500 });
  });
}

async function get<T>(path: string) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://api.test${path}`), env, ctx);
  await waitOnExecutionContext(ctx);
  return { status: res.status, body: (await res.json()) as ApiResponse<T> };
}

describe("live", () => {
  // Runs first: later tests leave cached calendar/session data behind.
  it("still answers when the calendar and OpenF1 are down", async () => {
    upstream(false);
    const { status, body } = await get<LiveStatus>("/api/live/session");
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ state: "UNAVAILABLE", next: null, latestReplay: null });
  });

  it("reports UNAVAILABLE with the next scheduled session and the latest replay", async () => {
    upstream(true);
    const { status, body } = await get<LiveStatus>("/api/live/session");
    expect(status).toBe(200);
    const live = body.data!;
    expect(live.state).toBe("UNAVAILABLE");
    if (live.state !== "UNAVAILABLE") return;
    expect(live.reason).toBe("no_permitted_free_source");
    expect(live.next?.race.name).toBe("Chinese Grand Prix");
    expect(live.latestReplay).toMatchObject({ key: 9693, meetingName: "Australian Grand Prix" });
    // Never touches OpenF1 data endpoints that could be mistaken for live data.
    expect(calls.filter((u) => u.host === "api.openf1.org").map((u) => u.pathname).sort()).toEqual(["/v1/meetings", "/v1/sessions"]);
  });

  it.each(["timing", "positions"])("refuses %s with 503 and the reason, without calling any upstream", async (what) => {
    upstream(true);
    const { status, body } = await get(`/api/live/${what}`);
    expect(status).toBe(503);
    expect(body).toMatchObject({ status: "unavailable", data: null });
    expect(body.reason).toMatch(/^no_permitted_free_source/);
    expect(calls).toHaveLength(0);
  });
});
