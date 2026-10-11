import {
  type ClassificationEntry,
  type Constructor,
  type ConstructorStanding,
  type Driver,
  type DriverStanding,
  type GrandPrix,
  type PositionWindow,
  type QualifyingEntry,
  type RaceWeekendResults,
  type ReplayDriver,
  type ReplaySession,
  type SeasonResults,
  type SessionKind,
  type SessionReplay,
  type Standings,
  WINDOW_MS,
} from "@pitwall/shared";
import { z } from "zod";
import { circuitAt, constructorFor, driverFor, driverIdFor } from "../openf1-map";
import { fetchJson, UpstreamError } from "../upstream";

const BASE = "https://api.openf1.org/v1";
/** OpenF1's data starts with the 2023 season, which is where Pitwall switches from Jolpica to OpenF1. */
export const FIRST_SEASON = 2023;
/** Samples fetched either side of a window so interpolation never needs a neighbouring window. */
const OVERLAP_MS = 1_000;

// ---- Upstream schemas (only the fields we use) ----

const n = z.number().nullish();
const Session = z.object({
  session_key: z.number(),
  session_name: z.string(),
  session_type: z.string(),
  date_start: z.string(),
  date_end: z.string(),
  meeting_key: z.number(),
  circuit_short_name: z.string(),
  country_name: z.string(),
  is_cancelled: z.boolean().nullish(),
});
const Meeting = z.object({ meeting_key: z.number(), meeting_name: z.string(), date_start: z.string(), is_cancelled: z.boolean().nullish() });
const ODriver = z.object({
  session_key: z.number(),
  driver_number: z.number(),
  name_acronym: z.string().nullish(),
  full_name: z.string().nullish(),
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
  team_name: z.string().nullish(),
  team_colour: z.string().nullish(),
});
const Lap = z.object({
  driver_number: z.number(),
  lap_number: z.number(),
  date_start: z.string().nullish(),
  lap_duration: n,
  duration_sector_1: n,
  duration_sector_2: n,
  duration_sector_3: n,
  is_pit_out_lap: z.boolean().nullish(),
});
const Stint = z.object({
  driver_number: z.number(),
  stint_number: z.number(),
  lap_start: n,
  lap_end: n,
  compound: z.string().nullish(),
  tyre_age_at_start: n,
});
const Pit = z.object({ date: z.string(), driver_number: z.number(), lap_number: n, pit_duration: n });
const RaceControl = z.object({
  date: z.string(),
  lap_number: n,
  category: z.string(),
  flag: z.string().nullish(),
  driver_number: n,
  message: z.string(),
});
const Weather = z.object({
  date: z.string(),
  air_temperature: n,
  track_temperature: n,
  humidity: n,
  wind_speed: n,
  wind_direction: n,
  rainfall: n,
});
const Position = z.object({ date: z.string(), driver_number: z.number(), position: z.number() });
const Location = z.object({ date: z.string(), driver_number: z.number(), x: z.number(), y: z.number(), z: n });
const Gap = z.union([z.number(), z.string()]).nullish();
// Qualifying sessions report per-stage arrays ([Q1, Q2, Q3]); races report single values.
const SessionResult = z.object({
  session_key: z.number(),
  driver_number: z.number(),
  position: z.union([z.number(), z.string()]).nullish(),
  number_of_laps: n,
  points: n,
  dnf: z.boolean().nullish(),
  dns: z.boolean().nullish(),
  dsq: z.boolean().nullish(),
  duration: z.union([z.number(), z.array(z.number().nullable())]).nullish(),
  gap_to_leader: z.union([Gap, z.array(Gap)]).nullish(),
});
const Interval = z.object({ date: z.string(), driver_number: z.number(), gap_to_leader: Gap, interval: Gap });
// Keyed by the session that set the grid: qualifying for the race, sprint qualifying for the sprint.
const StartingGrid = z.object({ session_key: z.number(), driver_number: z.number(), position: z.number() });
const ChampionshipDriver = z.object({ meeting_key: z.number(), session_key: z.number(), driver_number: z.number(), position_current: n, points_current: z.number() });
const ChampionshipTeam = z.object({ meeting_key: z.number(), session_key: z.number(), team_name: z.string(), position_current: n, points_current: z.number() });

type Raw<S extends z.ZodType> = z.infer<S>[];

/** OpenF1 answers an empty result with 404 {"detail":"No results found."}; treat that as an empty list. */
async function list<S extends z.ZodType>(endpoint: string, query: string, row: S, ua: string): Promise<Raw<S>> {
  try {
    return await fetchJson("openf1", `${BASE}/${endpoint}?${query}`, z.array(row), ua);
  } catch (e) {
    if (e instanceof UpstreamError && e.kind === "not_found") return [];
    throw e;
  }
}

const iso = (ms: number) => new Date(ms).toISOString();
const between = (from: number, to: number) => `date%3E=${iso(from)}&date%3C${iso(to)}`;
const byTime = <T extends { t: number }>(a: T, b: T) => a.t - b.t;
const groupBy = <T, K extends number>(rows: T[], key: (r: T) => K) => {
  const out = {} as Record<K, T[]>;
  for (const r of rows) (out[key(r)] ??= []).push(r);
  return out;
};

// ---- Normalizers ----

/** Every session that isn't cancelled, oldest first, named after its meeting. */
function toSessions(sessions: Raw<typeof Session>, meetings: { meeting_key: number; meeting_name: string }[]): ReplaySession[] {
  const names = new Map(meetings.map((m) => [m.meeting_key, m.meeting_name]));
  return sessions
    .filter((s) => !s.is_cancelled)
    .map((s) => ({
      key: s.session_key,
      meetingKey: s.meeting_key,
      meetingName: names.get(s.meeting_key) ?? s.country_name,
      name: s.session_name,
      type: s.session_type,
      circuit: s.circuit_short_name,
      country: s.country_name,
      start: new Date(s.date_start).toISOString(),
      end: new Date(s.date_end).toISOString(),
    }))
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function toDrivers(raw: Raw<typeof ODriver>, season: number): ReplayDriver[] {
  const seen = new Set<number>();
  return raw.flatMap((d) => {
    if (seen.has(d.driver_number)) return [];
    seen.add(d.driver_number);
    const acronym = d.name_acronym ?? String(d.driver_number);
    return [
      {
        number: d.driver_number,
        acronym,
        name: d.first_name && d.last_name ? `${d.first_name} ${d.last_name}` : (d.full_name ?? acronym),
        team: d.team_name ?? null,
        colour: d.team_colour && /^[0-9a-f]{6}$/i.test(d.team_colour) ? `#${d.team_colour}` : null,
        driverId: driverIdFor(season, d.driver_number),
      },
    ];
  });
}

export interface ReplayRaw {
  session: Raw<typeof Session>[number];
  meetingName: string;
  drivers: ReplayDriver[];
  laps: Raw<typeof Lap>;
  stints: Raw<typeof Stint>;
  pits: Raw<typeof Pit>;
  raceControl: Raw<typeof RaceControl>;
  weather: Raw<typeof Weather>;
  positions: Raw<typeof Position>;
}

export function toReplay(r: ReplayRaw): Omit<SessionReplay, "track"> {
  const laps = groupBy(
    r.laps.map((l) => ({
      driver: l.driver_number,
      lap: l.lap_number,
      start: l.date_start ? Date.parse(l.date_start) : null,
      duration: l.lap_duration ?? null,
      sectors: [l.duration_sector_1 ?? null, l.duration_sector_2 ?? null, l.duration_sector_3 ?? null] as [number | null, number | null, number | null],
      pitOut: l.is_pit_out_lap ?? false,
    })),
    (l) => l.driver,
  );
  const lapEnds = r.laps.flatMap((l) => (l.date_start && l.lap_duration ? [Date.parse(l.date_start) + l.lap_duration * 1000] : []));
  return {
    session: toSessions([r.session], [{ meeting_key: r.session.meeting_key, meeting_name: r.meetingName }])[0]!,
    range: { start: Date.parse(r.session.date_start), end: Math.max(Date.parse(r.session.date_end), ...lapEnds) },
    drivers: r.drivers,
    laps: Object.fromEntries(
      Object.entries(laps).map(([d, ls]) => [d, ls.sort((a, b) => a.lap - b.lap).map(({ driver: _, ...l }) => l)]),
    ),
    stints: Object.fromEntries(
      Object.entries(
        groupBy(
          r.stints.flatMap((s) =>
            s.lap_start == null || s.lap_end == null
              ? []
              : [{ driver: s.driver_number, stint: s.stint_number, lapStart: s.lap_start, lapEnd: s.lap_end, compound: s.compound ?? null, ageAtStart: s.tyre_age_at_start ?? null }],
          ),
          (s) => s.driver,
        ),
      ).map(([d, ss]) => [d, ss.sort((a, b) => a.stint - b.stint).map(({ driver: _, ...s }) => s)]),
    ),
    pits: r.pits.map((p) => ({ driver: p.driver_number, t: Date.parse(p.date), lap: p.lap_number ?? null, laneSeconds: p.pit_duration ?? null })).sort(byTime),
    positions: r.positions.map((p) => ({ driver: p.driver_number, t: Date.parse(p.date), position: p.position })).sort(byTime),
    raceControl: r.raceControl
      .map((m) => ({ t: Date.parse(m.date), lap: m.lap_number ?? null, category: m.category, flag: m.flag ?? null, driver: m.driver_number ?? null, message: m.message }))
      .sort(byTime),
    weather: r.weather
      .map((w) => ({
        t: Date.parse(w.date),
        air: w.air_temperature ?? null,
        track: w.track_temperature ?? null,
        humidity: w.humidity ?? null,
        windSpeed: w.wind_speed ?? null,
        windDirection: w.wind_direction ?? null,
        rainfall: w.rainfall == null ? null : w.rainfall > 0,
      }))
      .sort(byTime),
  };
}

// OpenF1 reports (0, 0, 0) when it has no fix for a car.
const hasFix = (l: { x: number; y: number; z?: number | null }) => !(l.x === 0 && l.y === 0 && !l.z);

/** Fastest clean lap across the field; its recorded positions trace the circuit in the cars' coordinate space. */
export function outlineLap(laps: SessionReplay["laps"]) {
  let best: { driver: number; lap: number; start: number; duration: number } | null = null;
  for (const [d, ls] of Object.entries(laps)) {
    for (const l of ls) {
      if (l.pitOut || l.start === null || l.duration === null || l.lap === 1) continue;
      if (!best || l.duration < best.duration) best = { driver: Number(d), lap: l.lap, start: l.start, duration: l.duration };
    }
  }
  return best;
}

export function toWindow(from: number, loc: Raw<typeof Location>, iv: Raw<typeof Interval>): PositionWindow {
  const cars: PositionWindow["cars"] = {};
  for (const [d, rows] of Object.entries(groupBy(loc.filter(hasFix), (l) => l.driver_number))) {
    const s = rows.map((l) => ({ t: Date.parse(l.date) - from, x: l.x, y: l.y })).sort(byTime);
    cars[Number(d)] = { t: s.map((p) => p.t), x: s.map((p) => p.x), y: s.map((p) => p.y) };
  }
  const intervals: PositionWindow["intervals"] = {};
  for (const [d, rows] of Object.entries(groupBy(iv, (l) => l.driver_number))) {
    const s = rows.map((l) => ({ t: Date.parse(l.date) - from, gap: l.gap_to_leader ?? null, interval: l.interval ?? null })).sort(byTime);
    intervals[Number(d)] = { t: s.map((p) => p.t), gap: s.map((p) => p.gap), interval: s.map((p) => p.interval) };
  }
  return { from, to: from + WINDOW_MS, cars, intervals };
}

// ---- Classifications ----

type Person = { driver: Driver; constructor: Constructor };
type DriverRow = Raw<typeof ODriver>[number];

/** Jolpica identity for each car in a set of OpenF1 driver rows (the first row per car wins). */
function peopleFor(season: number, rows: DriverRow[]): Map<number, Person> {
  const people = new Map<number, Person>();
  for (const r of rows) {
    if (!people.has(r.driver_number)) {
      people.set(r.driver_number, { driver: driverFor(season, r.driver_number, r), constructor: constructorFor(season, r.team_name) });
    }
  }
  return people;
}

const unknownCar = (season: number, n: number): Person => ({ driver: driverFor(season, n, undefined), constructor: constructorFor(season, null) });
const lapTime = (s: number | null | undefined) => (s == null ? null : `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, "0")}`);
/** Jolpica style: "1:31:44.742", or "39:48.162" under an hour. */
const raceTime = (s: number) => {
  const m = `${(s % 60).toFixed(3).padStart(6, "0")}`;
  return s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${m}` : `${Math.floor(s / 60)}:${m}`;
};
const numericPosition = (r: { position?: number | string | null }) => (typeof r.position === "number" ? r.position : null);
const byPosition = (a: { position?: number | string | null }, b: { position?: number | string | null }) =>
  (numericPosition(a) ?? 999) - (numericPosition(b) ?? 999);

export function toClassification(
  season: number,
  rows: Raw<typeof SessionResult>,
  people: Map<number, Person>,
  grid = new Map<number, number>(),
): ClassificationEntry[] {
  return [...rows]
    .sort((a, b) => byPosition(a, b) || (b.number_of_laps ?? 0) - (a.number_of_laps ?? 0))
    .map((r) => {
      const position = numericPosition(r);
      const gap = Array.isArray(r.gap_to_leader) ? null : (r.gap_to_leader ?? null);
      const duration = typeof r.duration === "number" ? r.duration : null;
      return {
        position,
        // Ergast/Jolpica conventions for unclassified finishers.
        positionText: position !== null ? String(position) : r.dsq ? "D" : r.dns ? "W" : r.dnf ? "R" : typeof r.position === "string" ? r.position : "N",
        number: r.driver_number,
        ...(people.get(r.driver_number) ?? unknownCar(season, r.driver_number)),
        grid: grid.get(r.driver_number) ?? null,
        laps: r.number_of_laps ?? null,
        status: r.dsq ? "Disqualified" : r.dns ? "Did not start" : r.dnf ? "Retired" : typeof gap === "string" ? gap.replace("LAPS", "Laps").replace("LAP", "Lap") : "Finished",
        points: r.points ?? 0,
        time: position === 1 && duration !== null ? raceTime(duration) : typeof gap === "number" && gap > 0 ? `+${gap.toFixed(3)}` : null,
        millis: null,
        fastestLap: null,
      };
    });
}

export function toQualifying(season: number, rows: Raw<typeof SessionResult>, people: Map<number, Person>): QualifyingEntry[] {
  return [...rows].sort(byPosition).map((r) => {
    const q = Array.isArray(r.duration) ? r.duration : [];
    return {
      position: numericPosition(r),
      number: r.driver_number,
      ...(people.get(r.driver_number) ?? unknownCar(season, r.driver_number)),
      q1: lapTime(q[0]),
      q2: lapTime(q[1]),
      q3: lapTime(q[2]),
    };
  });
}

// ---- Fetchers ----

export async function replay(key: number, ua: string): Promise<SessionReplay> {
  const q = `session_key=${key}`;
  const [session] = await list("sessions", q, Session, ua);
  if (!session) throw new UpstreamError("openf1", "not_found", `no OpenF1 session ${key}`);
  // Sequential: the free tier allows 3 requests/s, and fetchJson paces them anyway.
  const meeting = (await list("meetings", `meeting_key=${session.meeting_key}`, Meeting, ua))[0];
  const base = toReplay({
    session,
    meetingName: meeting?.meeting_name ?? session.country_name,
    drivers: toDrivers(await list("drivers", q, ODriver, ua), new Date(session.date_start).getUTCFullYear()),
    laps: await list("laps", q, Lap, ua),
    stints: await list("stints", q, Stint, ua),
    pits: await list("pit", q, Pit, ua),
    raceControl: await list("race_control", q, RaceControl, ua),
    weather: await list("weather", q, Weather, ua),
    positions: await list("position", q, Position, ua),
  });
  const lap = outlineLap(base.laps);
  let track: SessionReplay["track"] = null;
  if (lap) {
    const pts = (await list("location", `${q}&driver_number=${lap.driver}&${between(lap.start, lap.start + lap.duration * 1000)}`, Location, ua))
      .filter(hasFix)
      .sort((a, b) => a.date.localeCompare(b.date));
    // Too few samples can't describe a circuit; show no outline rather than a misleading one.
    if (pts.length >= 50) track = { driver: lap.driver, lap: lap.lap, x: pts.map((p) => p.x), y: pts.map((p) => p.y) };
  }
  return { ...base, track };
}

export async function positionWindow(key: number, from: number, withIntervals: boolean, ua: string) {
  const q = `session_key=${key}&${between(from - OVERLAP_MS, from + WINDOW_MS + OVERLAP_MS)}`;
  const loc = await list("location", q, Location, ua);
  const iv = withIntervals ? await list("intervals", q, Interval, ua) : [];
  return toWindow(from, loc, iv);
}

// ---- Seasons from 2023: calendar, standings and results ----
// Each unit below is cached separately and kept small: the Workers Free plan allows 10 ms of CPU per request,
// and a whole season of OpenF1 drivers or results is ~1 MB of JSON. Season-wide queries are filtered to race
// sessions by repeating `session_key` (OpenF1 ORs repeated parameters).

const SESSION_KIND: Record<string, SessionKind> = {
  "Practice 1": "FP1",
  "Practice 2": "FP2",
  "Practice 3": "FP3",
  "Sprint Qualifying": "SPRINT_QUALIFYING",
  "Sprint Shootout": "SPRINT_QUALIFYING", // 2023 name
  Sprint: "SPRINT",
  Qualifying: "QUALIFYING",
  Race: "RACE",
};

export interface Schedule {
  /** Grands Prix by date; the round is the position in this list. Testing and cancelled meetings are left out. */
  meetings: { key: number; name: string; round: number }[];
  /** Every session that isn't cancelled, testing included, oldest first. */
  sessions: ReplaySession[];
}

export async function schedule(season: number, ua: string): Promise<Schedule> {
  const sessions = await list("sessions", `year=${season}`, Session, ua);
  const meetings = await list("meetings", `year=${season}`, Meeting, ua);
  const gps = meetings
    .filter((m) => !m.is_cancelled && !/test/i.test(m.meeting_name))
    .sort((a, b) => a.date_start.localeCompare(b.date_start))
    .map((m, i) => ({ key: m.meeting_key, name: m.meeting_name, round: i + 1 }));
  return { meetings: gps, sessions: toSessions(sessions, meetings) };
}

const finishedRaces = (s: Schedule, now: number) => s.sessions.filter((x) => x.name === "Race" && Date.parse(x.end) < now);

export function toCalendar(season: number, s: Schedule): GrandPrix[] {
  return s.meetings.flatMap((m) => {
    const sessions = s.sessions
      .filter((x) => x.meetingKey === m.key && SESSION_KIND[x.name])
      .map((x) => ({ kind: SESSION_KIND[x.name]!, date: x.start.slice(0, 10), start: x.start }));
    if (!sessions.some((x) => x.kind === "RACE")) return [];
    const circuit = circuitAt(season, m.round);
    if (!circuit) {
      throw new UpstreamError("openf1", "invalid", `no circuit registered for ${season} round ${m.round}; re-run scripts/gen-circuits.mjs`);
    }
    return [{ season, round: m.round, name: m.name, url: null, circuit, sessions }];
  });
}

export interface Championship {
  drivers: { session: number; number: number; position: number | null; points: number }[];
  teams: { session: number; team: string; position: number | null; points: number }[];
  /** Winner of every session, practice included; callers pick the races. */
  winners: { session: number; number: number }[];
}

/** Championship positions after every race and sprint of the season (OpenF1 beta), plus session winners. */
export async function championship(s: Schedule, ua: string): Promise<Championship> {
  const keys = new Set(s.meetings.map((m) => m.key));
  if (!keys.size) return { drivers: [], teams: [], winners: [] };
  // Meeting keys of other seasons can fall inside the range; the filters below drop them.
  const range = `meeting_key%3E=${Math.min(...keys)}&meeting_key%3C=${Math.max(...keys)}`;
  const inSeason = (r: { meeting_key: number }) => keys.has(r.meeting_key);
  const drivers = (await list("championship_drivers", range, ChampionshipDriver, ua)).filter(inSeason);
  const teams = (await list("championship_teams", range, ChampionshipTeam, ua)).filter(inSeason);
  const sessions = new Set(s.sessions.map((x) => x.key));
  const winners = (await list("session_result", `${range}&position=1`, SessionResult, ua)).filter((r) => sessions.has(r.session_key));
  return {
    drivers: drivers.map((r) => ({ session: r.session_key, number: r.driver_number, position: r.position_current ?? null, points: r.points_current })),
    teams: teams.map((r) => ({ session: r.session_key, team: r.team_name, position: r.position_current ?? null, points: r.points_current })),
    winners: winners.map((r) => ({ session: r.session_key, number: r.driver_number })),
  };
}

export interface SeasonRaces {
  drivers: DriverRow[];
  results: Raw<typeof SessionResult>;
}

/** Drivers (with their team that day) and classifications of every finished race of the season. */
export async function seasonRaces(s: Schedule, now: number, ua: string): Promise<SeasonRaces> {
  const keys = finishedRaces(s, now).map((x) => `session_key=${x.key}`).join("&");
  if (!keys) return { drivers: [], results: [] };
  return { drivers: await list("drivers", keys, ODriver, ua), results: await list("session_result", keys, SessionResult, ua) };
}

type AnyStandings = Standings<DriverStanding> | Standings<ConstructorStanding>;

/**
 * Standings after `round` (null = latest), from the last session of that round with championship data, so a
 * sprint counts before the race is run. Wins are race wins only, as in Jolpica.
 */
export function toStandings(
  type: "drivers" | "constructors",
  season: number,
  round: number | null,
  s: Schedule,
  c: Championship,
  races: SeasonRaces,
): AnyStandings {
  const session = new Map(s.sessions.map((x) => [x.key, x]));
  const roundOf = new Map(s.meetings.map((m) => [m.key, m.round]));
  const rows = type === "drivers" ? c.drivers : c.teams;
  const last = [...new Set(rows.map((r) => r.session))]
    .map((k) => ({ key: k, start: session.get(k)?.start ?? "", round: roundOf.get(session.get(k)?.meetingKey ?? -1) ?? 0 }))
    .filter((x) => x.round > 0 && (round === null || x.round === round))
    .sort((a, b) => a.start.localeCompare(b.start))
    .at(-1);
  if (!last) return { season, round: 0, entries: [] };

  const racesSoFar = new Set(
    s.sessions.filter((x) => x.name === "Race" && x.start <= last.start).map((x) => x.key),
  );
  const teamIn = new Map(races.drivers.map((d) => [`${d.session_key}/${d.driver_number}`, d.team_name]));
  const wins = new Map<string | number, number>();
  for (const w of c.winners) {
    if (!racesSoFar.has(w.session)) continue;
    const k = type === "drivers" ? w.number : constructorFor(season, teamIn.get(`${w.session}/${w.number}`)).name;
    wins.set(k, (wins.get(k) ?? 0) + 1);
  }
  const byPosition = <T extends { position: number | null }>(a: T, b: T) => (a.position ?? 999) - (b.position ?? 999);
  const standing = (r: { position: number | null; points: number }) => ({
    position: r.position,
    positionText: r.position === null ? "-" : String(r.position),
    points: r.points,
  });

  if (type === "constructors") {
    return {
      season,
      round: last.round,
      entries: c.teams
        .filter((r) => r.session === last.key)
        .sort(byPosition)
        .map((r) => {
          const constructor = constructorFor(season, r.team);
          return { ...standing(r), wins: wins.get(constructor.name) ?? 0, constructor };
        }),
    };
  }
  const seen = races.drivers.filter((d) => racesSoFar.has(d.session_key));
  return {
    season,
    round: last.round,
    entries: c.drivers
      .filter((r) => r.session === last.key)
      .sort(byPosition)
      .map((r) => {
        const mine = seen.filter((d) => d.driver_number === r.number);
        const constructors = [...new Map(mine.map((d) => constructorFor(season, d.team_name)).map((t) => [t.name, t])).values()];
        return { ...standing(r), wins: wins.get(r.number) ?? 0, driver: driverFor(season, r.number, mine.at(-1)), constructors };
      }),
  };
}

export function toSeasonResults(season: number, s: Schedule, races: SeasonRaces): SeasonResults {
  return {
    season,
    races: s.meetings.flatMap((m) => {
      const race = s.sessions.find((x) => x.meetingKey === m.key && x.name === "Race");
      const rows = race ? races.results.filter((r) => r.session_key === race.key) : [];
      if (!race || !rows.length) return [];
      const people = peopleFor(season, races.drivers.filter((d) => d.session_key === race.key));
      return [{ round: m.round, name: m.name, results: toClassification(season, rows, people) }];
    }),
  };
}

/** Constructor id → "#RRGGBB" from the latest race's entry list. */
export function toTeamColours(season: number, races: SeasonRaces) {
  const latest = Math.max(...races.drivers.map((d) => d.session_key));
  const colours: Record<string, string> = {};
  for (const d of races.drivers.filter((x) => x.session_key === latest)) {
    const id = constructorFor(season, d.team_name).id;
    if (id && d.team_colour && /^[0-9a-f]{6}$/i.test(d.team_colour)) colours[id] ??= `#${d.team_colour}`;
  }
  return colours;
}

/** Every classification of one race weekend; sessions not run yet stay empty. */
export async function weekend(race: GrandPrix, meetingKey: number, s: Schedule, ua: string): Promise<RaceWeekendResults> {
  const q = `meeting_key=${meetingKey}`;
  const results = await list("session_result", q, SessionResult, ua);
  const drivers = await list("drivers", q, ODriver, ua);
  const grid = await list("starting_grid", q, StartingGrid, ua);
  const season = race.season;
  const rowsOf = (...names: string[]) => {
    const key = s.sessions.find((x) => x.meetingKey === meetingKey && names.includes(x.name))?.key;
    return {
      rows: results.filter((r) => r.session_key === key),
      // Each session's own entry list first, then the rest of the weekend's.
      people: peopleFor(season, [...drivers.filter((d) => d.session_key === key), ...drivers]),
      grid: new Map(grid.filter((g) => g.session_key === key).map((g) => [g.driver_number, g.position])),
    };
  };
  const qualifying = rowsOf("Qualifying");
  const sq = rowsOf("Sprint Qualifying", "Sprint Shootout");
  const race_ = rowsOf("Race");
  const sprint = rowsOf("Sprint");
  return {
    race,
    results: toClassification(season, race_.rows, race_.people, qualifying.grid),
    qualifying: toQualifying(season, qualifying.rows, qualifying.people),
    sprint: toClassification(season, sprint.rows, sprint.people, sq.grid),
    sprintQualifying: toQualifying(season, sq.rows, sq.people),
  };
}
