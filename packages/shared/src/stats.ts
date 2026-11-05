import type { CareerSeason, ClassificationEntry, Constructor, Driver, SeasonResults } from "./types";

/** Grand Prix (not sprint) counts for one driver or team. Averages are kept as sums so seasons add up. */
export interface Stats {
  starts: number;
  wins: number;
  podiums: number;
  pointsFinishes: number;
  /** Started from grid slot 1: pole, unless a penalty reshuffled the grid. Null when the source has no grid (OpenF1 season results). */
  gridP1: number | null;
  /** Null when the source has no fastest laps (OpenF1 season results). */
  fastestLaps: number | null;
  /** Started but not classified: retired, disqualified, not classified. */
  dnfs: number;
  bestFinish: number | null;
  gridSum: number;
  gridCount: number;
  finishSum: number;
  finishCount: number;
}

const EMPTY: Stats = {
  starts: 0, wins: 0, podiums: 0, pointsFinishes: 0, gridP1: 0, fastestLaps: 0, dnfs: 0,
  bestFinish: null, gridSum: 0, gridCount: 0, finishSum: 0, finishCount: 0,
};

/** W = did not start, F = failed to qualify: in the classification, but no start. */
export const isStart = (e: ClassificationEntry) => e.positionText !== "W" && e.positionText !== "F";

export function seasonStats(results: SeasonResults, filter: (e: ClassificationEntry) => boolean): Stats {
  const all = results.races.flatMap((r) => r.results);
  const s = { ...EMPTY };
  // Unknown is not zero: a season without the data says so rather than "0 poles".
  if (!all.some((e) => e.grid !== null)) s.gridP1 = null;
  if (!all.some((e) => e.fastestLap !== null)) s.fastestLaps = null;
  for (const race of results.races) {
    for (const e of race.results) {
      if (!filter(e) || !isStart(e)) continue;
      s.starts++;
      if (e.grid === 1 && s.gridP1 !== null) s.gridP1++;
      // Grid 0 is a pit-lane start, null unknown: neither is a grid slot.
      if (e.grid) {
        s.gridSum += e.grid;
        s.gridCount++;
      }
      if (e.fastestLap?.rank === 1 && s.fastestLaps !== null) s.fastestLaps++;
      if (e.points > 0) s.pointsFinishes++;
      const pos = /^\d+$/.test(e.positionText) ? Number(e.positionText) : null;
      if (pos === null) {
        s.dnfs++;
        continue;
      }
      if (pos === 1) s.wins++;
      if (pos <= 3) s.podiums++;
      s.bestFinish = s.bestFinish === null ? pos : Math.min(s.bestFinish, pos);
      s.finishSum += pos;
      s.finishCount++;
    }
  }
  return s;
}

export function sumStats(list: Stats[]): Stats {
  return list.reduce(
    (a, b) => {
      const out: Record<keyof Stats, number | null> = { ...a };
      for (const k of Object.keys(b) as (keyof Stats)[]) {
        // Unknown in any season makes the total unknown.
        out[k] = a[k] === null || b[k] === null ? null : a[k] + b[k];
      }
      out.bestFinish = a.bestFinish === null ? b.bestFinish : b.bestFinish === null ? a.bestFinish : Math.min(a.bestFinish, b.bestFinish);
      return out as Stats;
    },
    { ...EMPTY },
  );
}

export const average = (sum: number, count: number) => (count ? sum / count : null);

export interface RosterTeam {
  constructor: Constructor;
  /** Most starts for this team first. */
  drivers: { driver: Driver; starts: number }[];
}

/** Everyone who started a Grand Prix, under each team they started for. Teams in order of first appearance. */
export function roster(results: SeasonResults): RosterTeam[] {
  const teams = new Map<string, { constructor: Constructor; drivers: Map<string, { driver: Driver; starts: number }> }>();
  for (const race of results.races) {
    for (const e of race.results) {
      if (!isStart(e)) continue;
      // Unmapped OpenF1 teams and drivers have id "".
      const tk = e.constructor.id || e.constructor.name;
      const team = teams.get(tk) ?? { constructor: e.constructor, drivers: new Map() };
      teams.set(tk, team);
      const dk = e.driver.id || `#${e.number}`;
      const d = team.drivers.get(dk) ?? { driver: e.driver, starts: 0 };
      d.starts++;
      team.drivers.set(dk, d);
    }
  }
  return [...teams.values()].map((t) => ({ constructor: t.constructor, drivers: [...t.drivers.values()].sort((a, b) => b.starts - a.starts) }));
}

/** Championships won within `career`; `since` is set when career covers fewer seasons than were entered. */
export function titles(career: CareerSeason[], seasonsTotal: number) {
  const best = career.reduce<number | null>((b, c) => (c.position === null ? b : b === null ? c.position : Math.min(b, c.position)), null);
  return {
    count: career.filter((c) => c.position === 1).length,
    best,
    since: seasonsTotal > career.length && career.length ? career.at(-1)!.season : null,
  };
}
