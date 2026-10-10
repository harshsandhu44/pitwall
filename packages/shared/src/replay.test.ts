import { describe, expect, it } from "vitest";
import { carAt, timingAt, windowStart } from "./replay";
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
