import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
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
  it("keeps Jolpica's (empty) results when OpenF1 is down", async () => {
    upstream(false);
    const { status, body } = await get<RaceWeekendResults>("/api/races/17?season=2026");
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ qualifying: [], sprint: [], sprintQualifying: [], fromOpenF1: [] });
  });
});
