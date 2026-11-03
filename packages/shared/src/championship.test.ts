import { describe, expect, it } from "vitest";
import { decidedTitle, projectStandings } from "./championship";
import type { TimingRow } from "./replay";
import type { GrandPrix, ReplayDriver, Standings } from "./types";

const row = (driver: number, position: number, bestLap: number | null = null) => ({ driver, position, bestLap }) as TimingRow;
const driver = (number: number, team: string) => ({ number, team }) as ReplayDriver;
const drivers = [driver(1, "Red Bull Racing"), driver(4, "McLaren"), driver(81, "McLaren"), driver(30, "Racing Bulls")];
const base = {
  drivers: [
    { number: 1, points: 100 },
    { number: 4, points: 90 },
    { number: 81, points: 80 },
  ],
  teams: [
    { team: "McLaren", points: 170 },
    { team: "Red Bull Racing", points: 120 },
  ],
};

describe("projectStandings", () => {
  it("adds race points for the running order and re-ranks", () => {
    const p = projectStandings(base, [row(81, 1), row(4, 2), row(1, 10)], drivers, false, 2025);
    expect(p.drivers.map((d) => [d.key, d.points, d.added, d.position, d.moved])).toEqual([
      [4, 108, 18, 1, 1],
      [81, 105, 25, 2, 1],
      [1, 101, 1, 3, -2],
    ]);
  });

  it("ranks by points, keeping the earlier order on a tie, and counts a rookie from zero", () => {
    const p = projectStandings(base, [row(81, 1), row(4, 2), row(1, 3), row(30, 4)], drivers, false, 2025);
    // 1: 115, 4: 108, 81: 105, 30: 12
    expect(p.drivers.map((d) => d.key)).toEqual([1, 4, 81, 30]);
    expect(p.drivers.find((d) => d.key === 30)).toMatchObject({ points: 12, moved: 0, position: 4 });
    const tie = projectStandings({ drivers: [{ number: 1, points: 10 }, { number: 4, points: 2 }], teams: [] }, [row(4, 2)], drivers, true, 2025);
    // 4 gets 7 sprint points: 9 vs 10, still behind
    expect(tie.drivers.map((d) => [d.key, d.points])).toEqual([[1, 10], [4, 9]]);
    const level = projectStandings({ drivers: [{ number: 1, points: 10 }, { number: 4, points: 3 }], teams: [] }, [row(4, 2)], drivers, true, 2025);
    expect(level.drivers.map((d) => [d.key, d.points, d.moved])).toEqual([[1, 10, 0], [4, 10, 0]]);
  });

  it("uses sprint points and sums teams", () => {
    const p = projectStandings(base, [row(4, 1), row(81, 2), row(1, 9)], drivers, true, 2025);
    expect(p.drivers.find((d) => d.key === 1)!.added).toBe(0);
    expect(p.teams[0]).toMatchObject({ key: "McLaren", points: 185, added: 15, position: 1 });
  });

  it("gives the fastest-lap point up to 2024, to a top-10 race finisher only", () => {
    const rows = [row(1, 1, 80), row(4, 2, 79.5), row(81, 11, 79)];
    expect(projectStandings(base, rows, drivers, false, 2024).drivers.find((d) => d.key === 4)!.added).toBe(18);
    expect(projectStandings(base, [row(1, 1, 80), row(4, 2, 79.5)], drivers, false, 2024).drivers.find((d) => d.key === 4)!.added).toBe(19);
    expect(projectStandings(base, [row(1, 1, 80), row(4, 2, 79.5)], drivers, false, 2025).drivers.find((d) => d.key === 4)!.added).toBe(18);
    expect(projectStandings(base, [row(1, 1, 80), row(4, 2, 79.5)], drivers, true, 2024).drivers.find((d) => d.key === 4)!.added).toBe(7);
  });
});

describe("decidedTitle", () => {
  const weekend = (round: number, sprint = false) =>
    ({ round, sessions: [...(sprint ? [{ kind: "SPRINT" }] : []), { kind: "RACE" }] }) as GrandPrix;
  // Rounds 1-3; round 3 is a sprint weekend.
  const cal = [weekend(1), weekend(2), weekend(3, true)];
  const table = (round: number, points: number[], extra: Partial<Standings<{ points: number }>> = {}) => ({
    season: 2026,
    round,
    entries: points.map((p) => ({ points: p })),
    ...extra,
  });

  it("calls it only when the lead beats every point left", () => {
    // After round 2: round 3 has 8 + 25 = 33 for a driver.
    expect(decidedTitle(table(2, [100, 66]), cal, "drivers")).toEqual({ champion: { points: 100 }, racesLeft: 1 });
    expect(decidedTitle(table(2, [100, 67]), cal, "drivers")).toBeNull(); // exactly 33: countback, wait
    expect(decidedTitle(table(3, [101, 100]), cal, "drivers")).toEqual({ champion: { points: 101 }, racesLeft: 0 });
  });

  it("counts the race of a round whose standings only include the sprint", () => {
    expect(decidedTitle(table(3, [100, 80], { throughSprint: true }), cal, "drivers")).toBeNull();
    expect(decidedTitle(table(3, [100, 74], { throughSprint: true }), cal, "drivers")).toEqual({ champion: { points: 100 }, racesLeft: 1 });
  });

  it("lets a team take first and second, and adds the fastest lap up to 2024", () => {
    // Constructors: 15 + 43 = 58 left after round 2.
    expect(decidedTitle(table(2, [200, 142]), cal, "constructors")).toBeNull();
    expect(decidedTitle(table(2, [200, 141]), cal, "constructors")).not.toBeNull();
    expect(decidedTitle(table(2, [100, 66], { season: 2024 }), cal, "drivers")).toBeNull(); // 34 left
  });

  it("waits for a first round and a second entry beats nobody", () => {
    expect(decidedTitle(table(0, []), cal, "drivers")).toBeNull();
    expect(decidedTitle(table(3, [10]), cal, "drivers")).toEqual({ champion: { points: 10 }, racesLeft: 0 });
  });
});
