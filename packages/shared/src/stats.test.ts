import { describe, expect, it } from "vitest";
import { roster, seasonStats, sumStats, titles } from "./stats";
import type { CareerSeason, ClassificationEntry, SeasonResults } from "./types";

const entry = (driver: string, team: string, positionText: string, grid: number | null, points = 0, fl = false) =>
  ({
    position: /^\d+$/.test(positionText) ? Number(positionText) : null,
    positionText,
    number: null,
    driver: { id: driver, givenName: driver, familyName: driver },
    constructor: { id: team, name: team },
    grid,
    points,
    status: "",
    fastestLap: fl ? { rank: 1, lap: null, time: null } : null,
  }) as ClassificationEntry;

// "law" drives for rb, then swaps to red_bull; "sub" does one race.
const results: SeasonResults = {
  season: 2025,
  races: [
    { round: 1, name: "A", results: [entry("ver", "red_bull", "1", 1, 25, true), entry("law", "rb", "R", 12), entry("tsu", "red_bull", "W", null)] },
    { round: 2, name: "B", results: [entry("ver", "red_bull", "3", 0, 15), entry("law", "red_bull", "8", 6, 4), entry("sub", "rb", "11", 15)] },
  ],
};

describe("seasonStats", () => {
  const ver = seasonStats(results, (e) => e.driver.id === "ver");

  it("counts wins, podiums, grid P1 and fastest laps; a pit-lane start has no grid slot", () => {
    expect(ver).toMatchObject({ starts: 2, wins: 1, podiums: 2, pointsFinishes: 2, gridP1: 1, fastestLaps: 1, dnfs: 0, bestFinish: 1 });
    expect([ver.gridSum, ver.gridCount, ver.finishSum, ver.finishCount]).toEqual([1, 1, 4, 2]);
  });

  it("counts a retirement as a start and a DNF, and a non-starter not at all", () => {
    expect(seasonStats(results, (e) => e.driver.id === "law")).toMatchObject({ starts: 2, dnfs: 1, bestFinish: 8 });
    expect(seasonStats(results, (e) => e.driver.id === "tsu").starts).toBe(0);
  });

  it("reports grid P1 and fastest laps as unknown when the season has neither (OpenF1)", () => {
    const bare = { ...results, races: results.races.map((r) => ({ ...r, results: r.results.map((e) => ({ ...e, grid: null, fastestLap: null })) })) };
    const s = seasonStats(bare, (e) => e.driver.id === "ver");
    expect([s.gridP1, s.fastestLaps, s.wins]).toEqual([null, null, 1]);
    expect(sumStats([ver, s]).gridP1).toBeNull();
  });

  it("adds seasons", () => {
    const s = sumStats([ver, ver]);
    expect(s).toMatchObject({ starts: 4, wins: 2, bestFinish: 1, finishSum: 8 });
  });
});

it("lists every starter under each team they started for", () => {
  const r = roster(results);
  expect(r.map((t) => [t.constructor.id, t.drivers.map((d) => `${d.driver.id}:${d.starts}`)])).toEqual([
    ["red_bull", ["ver:2", "law:1"]],
    ["rb", ["law:1", "sub:1"]],
  ]);
});

it("counts titles and marks a capped career", () => {
  const c = (season: number, position: number | null) => ({ season, position }) as CareerSeason;
  expect(titles([c(2024, 1), c(2023, 2)], 2)).toEqual({ count: 1, best: 1, since: null });
  expect(titles([c(2024, 3), c(2001, 1)], 75)).toEqual({ count: 1, best: 1, since: 2001 });
});
