import type { TimingRow } from "./replay";
import type { ReplayDriver } from "./types";

export const RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
export const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];
/** The fastest-lap bonus (a top-10 finisher in the race, not sprints) was dropped from 2025. */
const FASTEST_LAP_UNTIL = 2024;

/** Championship points before a session (from /api/championship/before). Team names are OpenF1's, as in ReplayDriver.team. */
export interface ChampionshipBase {
  drivers: { number: number; points: number }[];
  teams: { team: string; points: number }[];
}

export interface ProjectedEntry<K> {
  key: K;
  points: number;
  /** Points this session would add if it finished now. */
  added: number;
  position: number;
  /** Places up (+) or down (-) against the standings before the session. */
  moved: number;
}

function rank<K>(base: Map<K, number>, added: Map<K, number>): ProjectedEntry<K>[] {
  const keys = [...new Set([...base.keys(), ...added.keys()])];
  // Ties keep the order they had before the session (ponytail: countback on results isn't modelled).
  const before = [...keys].sort((a, b) => (base.get(b) ?? 0) - (base.get(a) ?? 0));
  const was = new Map(before.map((k, i) => [k, i + 1]));
  return before
    .map((key) => ({ key, added: added.get(key) ?? 0, points: (base.get(key) ?? 0) + (added.get(key) ?? 0) }))
    .sort((a, b) => b.points - a.points || was.get(a.key)! - was.get(b.key)!)
    .map((e, i) => ({ ...e, position: i + 1, moved: was.get(e.key)! - (i + 1) }));
}

/** The standings if the session finished in the running order of `rows`. */
export function projectStandings(base: ChampionshipBase, rows: TimingRow[], drivers: ReplayDriver[], sprint: boolean, season: number) {
  const table = sprint ? SPRINT_POINTS : RACE_POINTS;
  const added = new Map<number, number>();
  for (const r of rows) if (r.position !== null && r.position <= table.length) added.set(r.driver, table[r.position - 1]!);
  if (!sprint && season <= FASTEST_LAP_UNTIL) {
    const fastest = rows.filter((r) => r.bestLap !== null).sort((a, b) => a.bestLap! - b.bestLap!)[0];
    if (fastest && fastest.position !== null && fastest.position <= 10) added.set(fastest.driver, (added.get(fastest.driver) ?? 0) + 1);
  }
  const team = new Map(drivers.map((d) => [d.number, d.team]));
  const teamAdded = new Map<string, number>();
  for (const [n, p] of added) {
    const t = team.get(n);
    if (t) teamAdded.set(t, (teamAdded.get(t) ?? 0) + p);
  }
  return {
    drivers: rank(new Map(base.drivers.map((d) => [d.number, d.points])), added),
    teams: rank(new Map(base.teams.map((t) => [t.team, t.points])), teamAdded),
  };
}
