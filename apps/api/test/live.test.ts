import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { ApiResponse, LiveStatus } from "@pitwall/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { resetUpstreamState } from "../src/upstream";
import { openf1Mock } from "./openf1-mock";

const meeting = (key: number, name: string, start: string) => ({ meeting_key: key, meeting_name: name, date_start: start, year: 2026, is_cancelled: false });
const session = (key: number, meeting: number, name: string, start: string, end: string) => ({
  session_key: key, session_name: name, session_type: name, date_start: start, date_end: end, meeting_key: meeting,
  circuit_short_name: "Somewhere", country_name: "Somewhere", year: 2026, is_cancelled: false,
});
const openf1 = openf1Mock({
  meetings: [meeting(1, "Australian Grand Prix", "2026-03-06T01:30:00Z"), meeting(2, "Chinese Grand Prix", "2026-03-13T03:30:00Z")],
  sessions: [
    session(9693, 1, "Race", "2026-03-08T04:00:00Z", "2026-03-08T06:00:00Z"),
    session(9701, 2, "Sprint", "2026-03-14T03:00:00Z", "2026-03-14T04:00:00Z"),
    session(9705, 2, "Race", "2026-03-15T07:00:00Z", "2026-03-15T09:00:00Z"),
  ],
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
    return openf1(url);
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
    expect(live.next).toMatchObject({ race: { name: "Chinese Grand Prix", circuit: { id: "shanghai" } }, session: { kind: "SPRINT" } });
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
