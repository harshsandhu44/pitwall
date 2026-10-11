import { describe, expect, it } from "vitest";
import { carAt, timingAt, trackStatus, windowStart } from "./replay";
import type { PositionWindow, SessionReplay } from "./types";

const series = { t: [0, 250, 500, 3000], x: [0, 100, 200, 900], y: [0, 0, 0, 0] };

describe("carAt", () => {
  it("returns recorded samples exactly and nothing before the first one", () => {
    expect(carAt(series, 250)).toEqual({ x: 100, y: 0, kind: "sample" });
    expect(carAt(series, -1)).toBeNull();
  });

  it("interpolates only between samples less than a second apart", () => {
    expect(carAt(series, 125)).toEqual({ x: 50, y: 0, kind: "interpolated" });
    // 500 → 3000 is a 2.5 s hole: hold the last sample and flag it
    expect(carAt(series, 1500)).toEqual({ x: 200, y: 0, kind: "stale" });
    expect(carAt(series, 4500)).toEqual({ x: 900, y: 0, kind: "stale" });
  });

  it("can show raw samples only", () => {
    expect(carAt(series, 125, false)).toEqual({ x: 0, y: 0, kind: "sample" });
    expect(carAt(series, 1600, false)).toEqual({ x: 200, y: 0, kind: "stale" });
  });
});

it("aligns windows to fixed minute boundaries", () => {
  expect(windowStart(1_716_732_059_999)).toBe(1_716_732_000_000);
});

describe("timingAt", () => {
  const T = 1_000_000;
  const replay = {
    drivers: [
      { number: 1, acronym: "VER", name: "", team: null, colour: null, driverId: null },
      { number: 16, acronym: "LEC", name: "", team: null, colour: null, driverId: null },
    ],
    positions: [
      { driver: 1, t: T, position: 1 },
      { driver: 16, t: T, position: 2 },
      { driver: 16, t: T + 50_000, position: 1 },
      { driver: 1, t: T + 50_000, position: 2 },
    ],
    laps: {
      16: [
        { lap: 1, start: T, duration: 80, sectors: [null, null, null], pitOut: false },
        { lap: 2, start: T + 80_000, duration: 75.5, sectors: [null, null, null], pitOut: false },
      ],
    },
    stints: { 16: [{ stint: 1, lapStart: 1, lapEnd: 30, compound: "MEDIUM", ageAtStart: 3 }] },
    pits: [{ driver: 16, t: T + 10_000, lap: 1, laneSeconds: 20 }],
  } as unknown as SessionReplay;
  const w: PositionWindow = { from: T + 60_000, to: T + 120_000, cars: {}, intervals: { 16: { t: [1_000, 5_000], gap: [0, "+1 LAP"], interval: [0, 1.2] } } };

  it("uses only data published by the cursor time", () => {
    const [p1, p2] = timingAt(replay, w, T + 90_000);
    expect(p1).toMatchObject({ driver: 16, position: 1, lap: 2, lastLap: 80, bestLap: 80, compound: "MEDIUM", tyreAge: 4, pits: 1, gap: "+1 LAP", interval: 1.2 });
    expect(p2).toMatchObject({ driver: 1, position: 2, lap: null, lastLap: null, compound: null, pits: 0, gap: null });
  });

  it("does not leak later positions or completed laps", () => {
    expect(timingAt(replay, null, T + 40_000)[0]).toMatchObject({ driver: 1, position: 1 });
    expect(timingAt(replay, null, T + 79_000)[0]).toMatchObject({ driver: 16, lap: 1, lastLap: null, gap: null });
  });
});

describe("trackStatus", () => {
  const rc = (t: number, category: string, flag: string | null, message: string) => ({ t, lap: null, category, flag, driver: null, message });
  // Shapes as OpenF1 publishes them (Australia 2025).
  const msgs = [
    rc(1, "Flag", "GREEN", "GREEN LIGHT - PIT EXIT OPEN"),
    rc(2, "Flag", "YELLOW", "YELLOW IN TRACK SECTOR 17"),
    rc(3, "Flag", "DOUBLE YELLOW", "DOUBLE YELLOW IN TRACK SECTOR 10"),
    rc(4, "SafetyCar", null, "SAFETY CAR DEPLOYED"),
    rc(5, "Other", null, "INCIDENT INVOLVING CAR 14 (ALO) NOTED - SAFETY CAR INFRINGEMENT"),
    rc(6, "SafetyCar", null, "SAFETY CAR IN THIS LAP"),
    rc(7, "Flag", "CLEAR", "TRACK CLEAR"),
    rc(8, "SafetyCar", null, "VIRTUAL SAFETY CAR DEPLOYED"),
    rc(9, "SafetyCar", null, "VIRTUAL SAFETY CAR ENDING"),
    rc(10, "Flag", "GREEN", "GREEN FLAG"),
    rc(11, "Flag", "RED", "RED FLAG"),
    rc(12, "Flag", "GREEN", "GREEN LIGHT - PIT EXIT OPEN"),
    rc(13, "Flag", "BLUE", "WAVED BLUE FLAG FOR CAR 77 (BOT) TIMED AT 20:38:16"),
    rc(14, "Flag", "CHEQUERED", "CHEQUERED FLAG"),
  ];
  const at = (t: number) => trackStatus(msgs, t).label;

  it("follows flags and neutralisations in order", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map(at)).toEqual([
      "Green flag",
      "Green flag",
      "Yellow S17",
      "Double yellow S10, S17",
      "Safety car",
      "Safety car",
      "Safety car in this lap",
      "Green flag",
      "Virtual safety car",
      "Virtual safety car ending",
      "Green flag",
      "Red flag",
      "Green flag",
      "Green flag",
      "Chequered flag",
    ]);
  });

  it("clears one sector's yellow without touching the others", () => {
    const m = [msgs[1]!, msgs[2]!, rc(5, "Flag", "CLEAR", "CLEAR IN TRACK SECTOR 17")];
    expect(trackStatus(m, 9)).toEqual({ kind: "yellow", label: "Double yellow S10", sectors: [10] });
  });
});
