import { describe, expect, it } from "vitest";
import { freshness } from "./freshness";
import { lastFinishedRace, nextSession, scheduleState } from "./session";
import type { GrandPrix } from "./types";

const circuit = { id: "x", name: "X", locality: "X", country: "X", lat: 0, lon: 0, timezone: null, layout: null };
const gp = (round: number, raceStart: string, qualiStart: string): GrandPrix => ({
  season: 2026,
  round,
  name: `GP ${round}`,
  url: null,
  circuit,
  sessions: [
    { kind: "QUALIFYING", date: qualiStart.slice(0, 10), start: qualiStart },
    { kind: "RACE", date: raceStart.slice(0, 10), start: raceStart },
  ],
});
const cal = [gp(1, "2026-03-08T04:00:00Z", "2026-03-07T05:00:00Z"), gp(2, "2026-03-15T07:00:00Z", "2026-03-14T07:00:00Z")];

describe("scheduleState", () => {
  it("handles boundaries and missing start", () => {
    const s = { kind: "RACE" as const, date: "2026-03-08", start: "2026-03-08T04:00:00Z" };
    expect(scheduleState(s, Date.parse("2026-03-08T03:59:59Z"))).toBe("upcoming");
    expect(scheduleState(s, Date.parse("2026-03-08T04:00:00Z"))).toBe("in_window");
    expect(scheduleState(s, Date.parse("2026-03-08T06:00:00Z"))).toBe("finished");
    expect(scheduleState({ ...s, start: null })).toBe("unknown");
  });
});

describe("nextSession / lastFinishedRace", () => {
  it("picks the session in its window, then the next upcoming one", () => {
    expect(nextSession(cal, Date.parse("2026-03-08T05:00:00Z"))).toMatchObject({ state: "in_window", race: { round: 1 } });
    expect(nextSession(cal, Date.parse("2026-03-09T00:00:00Z"))).toMatchObject({ state: "upcoming", race: { round: 2 }, session: { kind: "QUALIFYING" } });
    expect(nextSession(cal, Date.parse("2027-01-01T00:00:00Z"))).toBeNull();
  });
  it("finds the last finished race", () => {
    expect(lastFinishedRace(cal, Date.parse("2026-03-01T00:00:00Z"))).toBeNull();
    expect(lastFinishedRace(cal, Date.parse("2026-03-10T00:00:00Z"))?.round).toBe(1);
  });
});

describe("freshness", () => {
  it("compares age against maxAge", () => {
    const now = Date.parse("2026-01-01T00:10:00Z");
    expect(freshness({ fetchedAt: "2026-01-01T00:05:00Z", maxAgeSeconds: 600 }, now)).toBe("fresh");
    expect(freshness({ fetchedAt: "2026-01-01T00:00:00Z", maxAgeSeconds: 300 }, now)).toBe("stale");
    expect(freshness({ fetchedAt: null, maxAgeSeconds: 300 }, now)).toBe("unknown");
  });
});
