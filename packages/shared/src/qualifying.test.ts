import { describe, expect, it } from "vitest";
import { knockoutCount, qualifyingAt, qualifyingContext } from "./qualifying";
import type { ReplayLap, SessionReplay } from "./types";

const MIN = 60_000;
const T = 1_000_000;
const rc = (t: number, category: string, message: string, flag: string | null = null) => ({ t: T + t, lap: null, category, flag, driver: null, message });
// Shaped like São Paulo 2024: Q1 red-flagged after 5 minutes and restarted, Q2 ending under a red flag.
const messages: SessionReplay["raceControl"] = [
  rc(0, "SessionStatus", "SESSION STARTED"),
  rc(5 * MIN, "Flag", "RED FLAG", "RED"),
  rc(5 * MIN, "SessionStatus", "SESSION ABORTED"),
  rc(10 * MIN, "SessionStatus", "SESSION STARTED"),
  rc(23 * MIN, "SessionStatus", "SESSION FINISHED"),
  rc(30 * MIN, "SessionStatus", "SESSION STARTED"),
  rc(44 * MIN, "SessionStatus", "SESSION ABORTED"),
  rc(46 * MIN, "SessionStatus", "SESSION FINISHED"),
  rc(50 * MIN, "SessionStatus", "SESSION STARTED"),
  rc(62 * MIN, "SessionStatus", "SESSION FINISHED"),
];
const lap = (n: number, start: number, duration: number | null, sectors: (number | null)[], pitOut = false): ReplayLap => ({
  lap: n,
  start: T + start,
  duration,
  sectors,
  pitOut,
});
// 14 cars: two go out in each of Q1 and Q2.
const drivers = Array.from({ length: 14 }, (_, i) => ({ number: i + 1 }));
const split = (d: number) => [d * 0.3, d * 0.4, d * 0.3];

describe("qualifyingContext", () => {
  it("numbers segments by SESSION FINISHED and keeps red-flag stops out of the running time", () => {
    const { segments } = qualifyingContext(messages, "Qualifying");
    expect(segments.map((s) => [s.label, s.start - T, s.end! - T, s.lengthMs / MIN])).toEqual([
      ["Q1", 0, 23 * MIN, 18],
      ["Q2", 30 * MIN, 46 * MIN, 15],
      ["Q3", 50 * MIN, 62 * MIN, 12],
    ]);
    expect(segments[0]!.running.map((r) => [r.from - T, r.to! - T])).toEqual([
      [0, 5 * MIN],
      [10 * MIN, 23 * MIN],
    ]);
    expect(qualifyingContext(messages, "Sprint Qualifying").segments.map((s) => [s.label, s.lengthMs / MIN])).toEqual([
      ["SQ1", 12],
      ["SQ2", 10],
      ["SQ3", 8],
    ]);
  });

  it("matches deleted and reinstated lap times by car and time", () => {
    const { deleted } = qualifyingContext(
      [rc(1, "Other", "CAR 44 (HAM) TIME 1:19.550 DELETED - TRACK LIMITS AT TURN 10 LAP 3 16:02:21"), rc(2, "Other", "CAR 44 (HAM) TIME 1:19.550 REINSTATED")],
      "Qualifying",
    );
    expect(deleted.map((d) => [d.driver, d.ms, d.on])).toEqual([
      [44, 79_550, true],
      [44, 79_550, false],
    ]);
  });
});

it("knocks out (cars − 10) / 2 per segment", () => {
  expect([20, 22, 14, 10].map(knockoutCount)).toEqual([5, 6, 2, 0]);
});

describe("qualifyingAt", () => {
  const ctx = qualifyingContext(messages, "Qualifying");

  it("estimates the segment clock, paused under a red flag", () => {
    const at = (t: number) => qualifyingAt({ drivers, laps: {} }, ctx, T + t);
    expect(at(-1).current).toBeNull();
    expect([at(2 * MIN), at(7 * MIN), at(12 * MIN)].map((s) => [s.timeLeft! / MIN, s.clockRunning])).toEqual([
      [16, true],
      [13, false],
      [11, true],
    ]);
    expect(at(24 * MIN)).toMatchObject({ timeLeft: 0, clockRunning: false });
    // Q2 ran 14 minutes, then finished under the red flag.
    expect(at(45 * MIN)).toMatchObject({ timeLeft: MIN, clockRunning: false });
  });

  // Every car does one Q1 lap starting a minute in, car n in 70 + n/10 s.
  const q1 = Object.fromEntries(drivers.map((d) => [d.number, [lap(1, MIN, 70 + d.number / 10, split(70 + d.number / 10))]]));

  it("ranks by best valid lap, ties to the earlier time, and drops deleted laps once published", () => {
    const laps = { ...q1, 3: [lap(1, MIN - 1000, 70.2, split(70.2))] }; // same time as car 2, set a second earlier
    const deletion = { t: T + 4 * MIN, driver: 1, ms: 70_100, on: true };
    const order = (t: number) => qualifyingAt({ drivers, laps }, { ...ctx, deleted: [deletion] }, T + t).standings[0]!.map((r) => r.driver);
    expect(order(3 * MIN).slice(0, 3)).toEqual([1, 3, 2]);
    expect(order(5 * MIN).slice(0, 2)).toEqual([3, 2]);
    expect(order(5 * MIN).at(-1)).toBe(1); // no valid time left
  });

  it("projects the drop zone during a segment, then carries the eliminated cars into the next", () => {
    const during = qualifyingAt({ drivers, laps: q1 }, ctx, T + 3 * MIN);
    expect(during.standings[0]!.filter((r) => r.danger).map((r) => r.driver)).toEqual([13, 14]);
    expect(during.final).toEqual([false]);
    expect(during.standings[0]![1]).toMatchObject({ driver: 2, position: 2, best: 70.2, laps: 1 });
    expect(during.standings[0]![1]!.gap).toBeCloseTo(0.1);

    const q2 = qualifyingAt({ drivers, laps: q1 }, ctx, T + 31 * MIN);
    expect(q2.final).toEqual([true, false]);
    const rows = q2.standings[1]!;
    expect(rows).toHaveLength(14);
    expect(rows.slice(-2).map((r) => [r.driver, r.position, r.out])).toEqual([
      [13, 13, 1],
      [14, 14, 1],
    ]);
    expect(rows.filter((r) => r.danger)).toHaveLength(2); // the bottom two of the 12 still running, none with a time yet
  });

  it("reports improvements, including cars pushed below the line", () => {
    const laps = { ...q1, 14: [...q1[14]!, lap(2, 3 * MIN, 69.9, split(69.9))] };
    const [latest] = qualifyingAt({ drivers, laps }, ctx, T + 5 * MIN).improvements;
    expect(latest).toMatchObject({ driver: 14, from: 14, to: 1, knocked: [12] });
  });

  it("tells push laps from out-laps and slow laps by the sectors set so far", () => {
    const laps = {
      ...q1,
      1: [...q1[1]!, lap(2, 4 * MIN, null, [21.0, null, null])], // S1 at P1 pace
      2: [...q1[2]!, lap(2, 4 * MIN, null, [25.0, null, null])], // S1 well off it: cooling down
      3: [...q1[3]!, lap(2, 4 * MIN, null, [null, null, null], true)],
      4: [...q1[4]!, lap(2, 4 * MIN, null, [21.0, null, null])],
    };
    const s = qualifyingAt({ drivers, laps }, ctx, T + 4 * MIN + 10_000); // 10 s in: no sector set yet
    expect([1, 2, 3].map((n) => s.standings[0]!.find((r) => r.driver === n)!.state)).toEqual(["unknown", "unknown", "out"]);
    const later = qualifyingAt({ drivers, laps }, ctx, T + 4 * MIN + 26_000);
    expect([1, 2, 3, 5].map((n) => later.standings[0]!.find((r) => r.driver === n)!.state)).toEqual(["push", "slow", "out", null]);
    const car4 = later.onLap.find((o) => o.driver === 4)!;
    expect(car4.sectors).toEqual([21]);
    expect(car4.toP1).toBeCloseTo(21 - 70.1 * 0.3);
    expect(car4.wouldBe).toBe(1); // 70.1 + (21 − 21.03) = 70.07 beats every best so far
  });
});
