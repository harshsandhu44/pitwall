import { createExecutionContext, createScheduledController, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { ApiResponse, RaceWeekendResults } from "@pitwall/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { resetUpstreamState } from "../src/upstream";
import calendar2026 from "./fixtures/calendar-2026.json";
import sg from "./fixtures/singapore-2026-provisional.json";

const empty = { MRData: { total: "0", limit: "100", offset: "0", RaceTable: { season: "2026", Races: [] } } };
let calls: URL[];

function upstream(openf1Up: boolean) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    const p = url.pathname;
    if (url.host === "api.jolpi.ca") {
      if (p.endsWith("/driverStandings.json")) return Response.json(sg.standings);
      if (p.endsWith("/seasons.json")) return Response.json({ MRData: { total: "1", limit: "100", offset: "0", SeasonTable: { Seasons: [{ season: "2026" }] } } });
      if (p.endsWith("/2026.json")) return Response.json(calendar2026);
      return Response.json(empty); // round 17 results, qualifying and sprint: not published yet
    }
    if (!openf1Up) return new Response("down", { status: 503 });
    if (p === "/v1/sessions") return Response.json(sg.sessions);
    if (p === "/v1/meetings") return Response.json(sg.meetings);
    if (p === "/v1/drivers") return Response.json(sg.drivers);
    if (p === "/v1/session_result") return Response.json(sg.session_result[url.searchParams.get("session_key") as keyof typeof sg.session_result]);
    return new Response("not mocked", { status: 500 });
  });
}

beforeEach(() => {
  resetUpstreamState({ paced: false });
  calls = [];
  // Saturday evening of the Singapore weekend: qualifying done, race tomorrow, Jolpica not updated.
  vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-10-10T20:00:00Z") });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function get<T>(path: string) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://api.test${path}`), env, ctx);
  await waitOnExecutionContext(ctx);
  return { status: res.status, body: (await res.json()) as ApiResponse<T> };
}

describe("race results fallback", () => {
  it("fills finished sessions Jolpica hasn't published from OpenF1, marked as provisional", async () => {
    upstream(true);
    const { status, body } = await get<RaceWeekendResults>("/api/races/17?season=2026");
    expect(status).toBe(200);
    const w = body.data!;
    expect(w.fromOpenF1).toEqual(["sprint", "qualifying", "sprintQualifying"]);
    expect(w.results).toEqual([]); // the race hasn't happened

    const q = w.qualifying;
    expect(q[0]).toMatchObject({ position: 1, driver: { id: "max_verstappen" }, constructor: { id: "red_bull" }, q1: "1:33.241", q2: "1:31.639", q3: "1:31.373" });
    // OpenF1 reports Hadjar's position as "RT": unclassified, listed last.
    expect(q.at(-1)).toMatchObject({ position: null, driver: { id: "hadjar" }, q1: null });
    // Jolpica lists Lawson's 2026 teams as ["rb", "red_bull"]; OpenF1's team name resolves the current one.
    const team = (id: string) => q.find((e) => e.driver.id === id)?.constructor.id;
    expect([team("lawson"), team("hadjar"), team("arvid_lindblad")]).toEqual(["rb", "red_bull", "rb"]);
    expect(q.every((e) => e.driver.id && e.constructor.id)).toBe(true);

    const s = w.sprint;
    expect(s[0]).toMatchObject({ positionText: "1", time: "39:48.162", points: 8, laps: 20, status: "Finished" });
    expect(s[1]!.time).toMatch(/^\+\d+\.\d{3}$/);
    const out = s.filter((e) => e.position === null);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((e) => e.positionText === "R" && e.status === "Retired" && e.time === null)).toBe(true);

    expect(w.sprintQualifying[0]).toMatchObject({ position: 1, q1: "1:33.477", q2: "1:32.701", q3: "1:31.156" });
    expect(calls.some((u) => u.pathname === "/v1/session_result" && u.searchParams.get("session_key") === "11388")).toBe(false);
  });

  it("maps team colours to the right constructors for drivers who changed teams", async () => {
    upstream(true);
    const { body } = await get<Record<string, string>>("/api/team-colours?season=2026");
    expect(body.data).toMatchObject({ red_bull: "#4781D7", rb: "#6C98FF" });
  });

  it("cron refreshes the current season into D1 snapshots for every data centre", async () => {
    upstream(true);
    const ctx = createExecutionContext();
    await worker.scheduled!(createScheduledController({ cron: "*/10 * * * *" }), env, ctx);
    await waitOnExecutionContext(ctx);
    const { results } = await env.DB.prepare("SELECT key FROM upstream_snapshot").all<{ key: string }>();
    expect(results.map((r) => r.key)).toEqual(
      expect.arrayContaining(["seasons", "calendar/2026", "standings/drivers/2026/latest", "standings/drivers/2026/15", "progression/drivers/2026", "race/v2/2026/16"]),
    );
  });
});
