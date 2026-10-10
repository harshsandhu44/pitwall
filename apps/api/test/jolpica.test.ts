import { describe, expect, it } from "vitest";
import { toGrandPrix, toPoints } from "../src/providers/jolpica";
import calendar2026 from "./fixtures/calendar-2026.json";

const races = calendar2026.MRData.RaceTable.Races;

describe("toGrandPrix", () => {
  it("normalizes a conventional weekend with circuit registry data", () => {
    const gp = toGrandPrix(races[0]!);
    expect(gp).toMatchObject({ season: 2026, round: 1, name: "Australian Grand Prix" });
    expect(gp.circuit).toEqual({
      id: "albert_park",
      name: "Albert Park Grand Prix Circuit",
      locality: "Melbourne",
      country: "Australia",
      lat: -37.8497,
      lon: 144.968,
      timezone: "Australia/Melbourne",
      layout: { id: "melbourne-2", lengthKm: 5.278 },
    });
    expect(gp.sessions.map((s) => s.kind)).toEqual(["FP1", "FP2", "FP3", "QUALIFYING", "RACE"]);
    expect(gp.sessions.at(-1)).toEqual({ kind: "RACE", date: "2026-03-08", start: "2026-03-08T04:00:00Z" });
  });

  it("orders a sprint weekend chronologically", () => {
    const gp = toGrandPrix(races[1]!);
    expect(gp.sessions.map((s) => s.kind)).toEqual(["FP1", "SPRINT_QUALIFYING", "SPRINT", "QUALIFYING", "RACE"]);
  });

  it("maps the 2023 SprintShootout and keeps date-only sessions without inventing a time", () => {
    const base = races[0]!;
    const gp = toGrandPrix({
      ...base,
      season: "1985",
      round: "3",
      time: undefined,
      FirstPractice: undefined,
      SecondPractice: undefined,
      ThirdPractice: undefined,
      Qualifying: undefined,
      SprintShootout: { date: "1985-04-01" },
    });
    expect(gp.sessions).toEqual([
      { kind: "SPRINT_QUALIFYING", date: "1985-04-01", start: null },
      { kind: "RACE", date: "2026-03-08", start: null },
    ]);
    // Registry has no layout for this season/round pairing at albert_park.
    expect(gp.circuit.layout).toBeNull();
  });
});

describe("toPoints", () => {
  it("keeps fractional points and rejects garbage", () => {
    expect(toPoints("4.5")).toBe(4.5);
    expect(toPoints("0")).toBe(0);
    expect(() => toPoints("abc")).toThrow();
  });
});
