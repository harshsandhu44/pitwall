import { describe, expect, it } from "vitest";
import { alignLaps, lapDistance, lapGaps, sectorDeltas } from "./compare";
import type { LapTelemetry, ReplayLap } from "./types";

const lap = (n: number, start: number | null, duration: number | null, sectors: (number | null)[] = [null, null, null]) =>
  ({ lap: n, start, duration, sectors, pitOut: false }) as ReplayLap;

describe("lapGaps", () => {
  // A starts 1 s behind and loses 0.5 s a lap.
  const a = [lap(1, 0, null), lap(2, 91_000, 80.5), lap(3, 171_500, 80.5)];
  const b = [lap(1, 0, null), lap(2, 90_000, 80), lap(3, 170_000, 80)];

  it("is the gap at the line after each lap, growing by the lap delta", () => {
    expect(lapGaps(a, b)).toEqual([
      { lap: 1, gap: 1, delta: null },
      { lap: 2, gap: 1.5, delta: 0.5 },
      { lap: 3, gap: 2, delta: 0.5 },
    ]);
  });

  it("leaves a lap without a time or a next lap unknown", () => {
    expect(lapGaps([lap(1, 0, null)], b)[0]).toEqual({ lap: 1, gap: null, delta: null });
  });
});

it("compares sectors over the laps both completed", () => {
  const a = [lap(1, 0, 80, [25, 30, 25]), lap(2, 80_000, 79, [24.5, 30, 24.5]), lap(3, 159_000, null)];
  const b = [lap(1, 0, 80, [25.2, 29.8, 25]), lap(2, 80_000, 80, [25, 30, null])];
  const s = sectorDeltas(a, b);
  expect(s.laps.map((l) => l.sectors.map((x) => (x === null ? null : Math.round(x * 10) / 10)))).toEqual([[-0.2, 0.2, 0], [-0.5, 0, null]]);
  expect(s.best).toEqual([[24.5, 30, 24.5], [25, 29.8, 25]]);
});

describe("telemetry", () => {
  const tel = (speed: number[], dt = 250): LapTelemetry => ({
    driver: 1,
    lap: 1,
    duration: ((speed.length - 1) * dt) / 1000,
    sectors: [0.25, 0.25, null],
    t: speed.map((_, i) => i * dt),
    speed,
    throttle: speed.map(() => 100),
    brake: speed.map(() => 0),
    gear: speed.map(() => 8),
  });

  it("gives a straight line of distance at constant speed", () => {
    expect(lapDistance(tel([300, 300, 300, 300, 300]))).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it("shows no delta for a lap against itself, and the time difference by the line for a slower one", () => {
    const fast = tel([300, 300, 300, 300, 300]);
    expect(alignLaps(fast, fast, 11).rows.every((r) => r.delta === 0)).toBe(true);
    const slow = tel([300, 300, 300, 300, 300], 300);
    const { rows, sectors } = alignLaps(slow, fast, 11);
    expect(rows.at(-1)!.delta).toBeCloseTo(0.2);
    expect(rows[5]!.delta).toBeCloseTo(0.1);
    expect(sectors[0]).toBeCloseTo(0.25 / 1.2);
    expect(sectors[1]).toBeCloseTo(0.5 / 1.2);
  });

  it("ends on the lap-time difference even when samples miss the line", () => {
    const a = { ...tel([300, 300, 300, 300]), t: [100, 400, 700, 900], duration: 1.05 };
    const b = { ...tel([300, 300, 300, 300]), t: [50, 300, 600, 850], duration: 0.95 };
    const { rows } = alignLaps(a, b, 11);
    expect(rows[0]!.delta).toBe(0);
    expect(rows.at(-1)!.delta).toBeCloseTo(0.1);
  });
});
