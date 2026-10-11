import type {
  ClassificationEntry,
  Constructor,
  ConstructorStanding,
  Driver,
  DriverStanding,
  GrandPrix,
  QualifyingEntry,
  SessionKind,
  Standings,
  WeekendSession,
} from "@pitwall/shared";
import { z } from "zod";
import { circuitFor } from "../circuits";
import { fetchJson } from "../upstream";

const BASE = "https://api.jolpi.ca/ergast/f1";
const PAGE = 100; // Jolpica's maximum page size

// ---- Upstream schemas (only the fields we use) ----

const int = (s: string | undefined) => {
  if (s === undefined || s === "") return null;
  const n = Number(s);
  return Number.isInteger(n) ? n : null;
};

const JDriver = z.object({
  driverId: z.string(),
  permanentNumber: z.string().optional(),
  code: z.string().optional(),
  url: z.string().optional(),
  givenName: z.string(),
  familyName: z.string(),
  dateOfBirth: z.string().optional(),
  nationality: z.string().optional(),
});
const JConstructor = z.object({
  constructorId: z.string(),
  url: z.string().optional(),
  name: z.string(),
  nationality: z.string().optional(),
});
const JDateTime = z.object({ date: z.string(), time: z.string().optional() });
const JCircuit = z.object({
  circuitId: z.string(),
  circuitName: z.string(),
  Location: z.object({ lat: z.string(), long: z.string(), locality: z.string(), country: z.string() }),
});
const JResult = z.object({
  number: z.string().optional(),
  position: z.string().optional(),
  positionText: z.string(),
  points: z.string(),
  Driver: JDriver,
  Constructor: JConstructor,
  grid: z.string().optional(),
  laps: z.string().optional(),
  status: z.string(),
  Time: z.object({ millis: z.string().optional(), time: z.string() }).optional(),
  FastestLap: z
    .object({
      rank: z.string().optional(),
      lap: z.string().optional(),
      Time: z.object({ time: z.string() }).optional(),
    })
    .optional(),
});
const JQualifying = z.object({
  number: z.string().optional(),
  position: z.string().optional(),
  Driver: JDriver,
  Constructor: JConstructor,
  Q1: z.string().optional(),
  Q2: z.string().optional(),
  Q3: z.string().optional(),
});
const JRace = z.object({
  season: z.string(),
  round: z.string(),
  url: z.string().optional(),
  raceName: z.string(),
  Circuit: JCircuit,
  date: z.string(),
  time: z.string().optional(),
  FirstPractice: JDateTime.optional(),
  SecondPractice: JDateTime.optional(),
  ThirdPractice: JDateTime.optional(),
  Qualifying: JDateTime.optional(),
  Sprint: JDateTime.optional(),
  SprintQualifying: JDateTime.optional(),
  SprintShootout: JDateTime.optional(), // 2023 name for sprint qualifying
  Results: z.array(JResult).optional(),
  QualifyingResults: z.array(JQualifying).optional(),
  SprintResults: z.array(JResult).optional(),
});
type JRace = z.infer<typeof JRace>;

const page = <T extends z.ZodRawShape>(shape: T) =>
  z.object({
    MRData: z.object({ total: z.string(), limit: z.string(), offset: z.string() }).extend(shape),
  });

const RaceTable = page({ RaceTable: z.object({ Races: z.array(JRace) }) });
const SeasonTable = page({ SeasonTable: z.object({ Seasons: z.array(z.object({ season: z.string() })) }) });
const JDriverStanding = z.object({
  position: z.string().optional(),
  positionText: z.string(),
  points: z.string(),
  wins: z.string(),
  Driver: JDriver,
  Constructors: z.array(JConstructor),
});
const JConstructorStanding = z.object({
  position: z.string().optional(),
  positionText: z.string(),
  points: z.string(),
  wins: z.string(),
  Constructor: JConstructor,
});
const StandingsTable = page({
  StandingsTable: z.object({
    StandingsLists: z.array(
      z.object({
        season: z.string(),
        round: z.string(),
        DriverStandings: z.array(JDriverStanding).optional(),
        ConstructorStandings: z.array(JConstructorStanding).optional(),
      }),
    ),
  }),
});
const DriverTable = page({ DriverTable: z.object({ Drivers: z.array(JDriver) }) });
const ConstructorTable = page({ ConstructorTable: z.object({ Constructors: z.array(JConstructor) }) });

// ---- Normalizers ----

export const toDriver = (d: z.infer<typeof JDriver>): Driver => ({
  id: d.driverId,
  code: d.code ?? null,
  number: int(d.permanentNumber),
  givenName: d.givenName,
  familyName: d.familyName,
  nationality: d.nationality ?? null,
  dateOfBirth: d.dateOfBirth ?? null,
  url: d.url ?? null,
});

export const toConstructor = (c: z.infer<typeof JConstructor>): Constructor => ({
  id: c.constructorId,
  name: c.name,
  nationality: c.nationality ?? null,
  url: c.url ?? null,
});

/** Points can be fractional (half points); never coerce to integers. */
export const toPoints = (s: string) => {
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`invalid points value "${s}"`);
  return n;
};

const session = (kind: SessionKind, dt: z.infer<typeof JDateTime> | undefined): WeekendSession | null =>
  dt ? { kind, date: dt.date, start: dt.time ? `${dt.date}T${dt.time}` : null } : null;

export function toGrandPrix(r: JRace): GrandPrix {
  const season = Number(r.season);
  const round = Number(r.round);
  const sessions = [
    session("FP1", r.FirstPractice),
    session("FP2", r.SecondPractice),
    session("FP3", r.ThirdPractice),
    session("SPRINT_QUALIFYING", r.SprintQualifying ?? r.SprintShootout),
    session("SPRINT", r.Sprint),
    session("QUALIFYING", r.Qualifying),
    session("RACE", { date: r.date, time: r.time }),
  ].filter((s): s is WeekendSession => s !== null);
  // Sort by start, falling back to date for date-only sessions; ties keep weekend order.
  sessions.sort((a, b) => (a.start ?? a.date).localeCompare(b.start ?? b.date));
  return {
    season,
    round,
    name: r.raceName,
    url: r.url ?? null,
    circuit: circuitFor(r.Circuit, season, round),
    sessions,
  };
}

export const toClassification = (r: z.infer<typeof JResult>): ClassificationEntry => ({
  position: int(r.position),
  positionText: r.positionText,
  number: int(r.number),
  driver: toDriver(r.Driver),
  constructor: toConstructor(r.Constructor),
  grid: int(r.grid),
  laps: int(r.laps),
  status: r.status,
  points: toPoints(r.points),
  time: r.Time?.time ?? null,
  millis: int(r.Time?.millis),
  fastestLap: r.FastestLap
    ? { rank: int(r.FastestLap.rank), lap: int(r.FastestLap.lap), time: r.FastestLap.Time?.time ?? null }
    : null,
});

const toQualifying = (q: z.infer<typeof JQualifying>): QualifyingEntry => ({
  position: int(q.position),
  number: int(q.number),
  driver: toDriver(q.Driver),
  constructor: toConstructor(q.Constructor),
  q1: q.Q1 || null,
  q2: q.Q2 || null,
  q3: q.Q3 || null,
});

// ---- Fetchers ----

const get = <T>(path: string, schema: z.ZodType<T>, ua: string) => fetchJson("jolpica", `${BASE}/${path}`, schema, ua);

/** Fetch every page of a race-table endpoint and merge partial races that span pages. */
async function allRaces(path: string, ua: string): Promise<JRace[]> {
  const races = new Map<string, JRace>();
  for (let offset = 0; ; offset += PAGE) {
    const res = await get(`${path}.json?limit=${PAGE}&offset=${offset}`, RaceTable, ua);
    for (const r of res.MRData.RaceTable.Races) {
      const prev = races.get(r.round);
      races.set(
        r.round,
        prev
          ? {
              ...prev,
              Results: [...(prev.Results ?? []), ...(r.Results ?? [])],
              QualifyingResults: [...(prev.QualifyingResults ?? []), ...(r.QualifyingResults ?? [])],
              SprintResults: [...(prev.SprintResults ?? []), ...(r.SprintResults ?? [])],
            }
          : r,
      );
    }
    if (offset + PAGE >= Number(res.MRData.total)) break;
  }
  return [...races.values()].sort((a, b) => Number(a.round) - Number(b.round));
}

export async function calendar(season: number, ua: string): Promise<GrandPrix[]> {
  return (await allRaces(`${season}`, ua)).map(toGrandPrix);
}

export async function seasonResults(season: number, ua: string) {
  return (await allRaces(`${season}/results`, ua)).map((r) => ({
    round: Number(r.round),
    name: r.raceName,
    results: (r.Results ?? []).map(toClassification),
  }));
}

export async function raceResults(season: number, round: number, ua: string) {
  const [results, qualifying, sprint] = await Promise.all([
    allRaces(`${season}/${round}/results`, ua),
    allRaces(`${season}/${round}/qualifying`, ua),
    allRaces(`${season}/${round}/sprint`, ua),
  ]);
  return {
    results: (results[0]?.Results ?? []).map(toClassification),
    qualifying: (qualifying[0]?.QualifyingResults ?? []).map(toQualifying),
    sprint: (sprint[0]?.SprintResults ?? []).map(toClassification),
  };
}

/** `round` omitted = latest standings. An empty season (not started) returns round 0 and no entries. */
export async function driverStandings(season: number, round: number | null, ua: string): Promise<Standings<DriverStanding>> {
  const res = await get(`${season}/${round ?? ""}${round ? "/" : ""}driverStandings.json?limit=${PAGE}`, StandingsTable, ua);
  const list = res.MRData.StandingsTable.StandingsLists[0];
  return {
    season,
    round: list ? Number(list.round) : 0,
    entries: (list?.DriverStandings ?? []).map((s) => ({
      position: int(s.position),
      positionText: s.positionText,
      points: toPoints(s.points),
      wins: Number(s.wins),
      driver: toDriver(s.Driver),
      constructors: s.Constructors.map(toConstructor),
    })),
  };
}

export async function constructorStandings(
  season: number,
  round: number | null,
  ua: string,
): Promise<Standings<ConstructorStanding>> {
  const res = await get(`${season}/${round ?? ""}${round ? "/" : ""}constructorStandings.json?limit=${PAGE}`, StandingsTable, ua);
  const list = res.MRData.StandingsTable.StandingsLists[0];
  return {
    season,
    round: list ? Number(list.round) : 0,
    entries: (list?.ConstructorStandings ?? []).map((s) => ({
      position: int(s.position),
      positionText: s.positionText,
      points: toPoints(s.points),
      wins: Number(s.wins),
      constructor: toConstructor(s.Constructor),
    })),
  };
}

/** Driver or constructor identity plus the seasons they took part in (newest first). */
export async function subject(kind: "drivers" | "constructors", id: string, ua: string) {
  const [info, seasonList] = await Promise.all([
    kind === "drivers" ? get(`drivers/${id}.json`, DriverTable, ua) : get(`constructors/${id}.json`, ConstructorTable, ua),
    get(`${kind}/${id}/seasons.json?limit=${PAGE}`, SeasonTable, ua),
  ]);
  const seasons = seasonList.MRData.SeasonTable.Seasons.map((s) => Number(s.season)).sort((a, b) => b - a);
  if ("DriverTable" in info.MRData) {
    const d = info.MRData.DriverTable.Drivers[0];
    return d ? { driver: toDriver(d), seasons } : null;
  }
  const c = info.MRData.ConstructorTable.Constructors[0];
  return c ? { constructor: toConstructor(c), seasons } : null;
}

const CircuitTable = page({ CircuitTable: z.object({ Circuits: z.array(JCircuit) }) });

/** Circuit identity and coordinates (no season context, so no layout). */
export async function circuit(id: string, ua: string) {
  const c = (await get(`circuits/${id}.json`, CircuitTable, ua)).MRData.CircuitTable.Circuits[0];
  return c ? circuitFor(c, 0, 0) : null;
}
