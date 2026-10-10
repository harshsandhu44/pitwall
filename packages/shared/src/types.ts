// Domain models shared by the API Worker and the app.
// `null` always means "the source did not provide this value" — never a guess.

export type Source = "jolpica" | "openf1" | "open-meteo" | "rainviewer" | "pitwall";

/** ok: fresh data. stale: older than its freshness window (served as fallback or while revalidating). */
export type Availability = "ok" | "stale" | "not_found" | "unavailable" | "error";
export type CacheStatus = "hit" | "miss" | "stale" | "fallback" | "none";

export interface ApiResponse<T> {
  status: Availability;
  data: T | null;
  source: Source;
  /** When Pitwall retrieved the payload from the upstream (ISO). */
  fetchedAt: string | null;
  /** Observation/event time when it differs from fetchedAt (ISO). */
  observedAt: string | null;
  cache: CacheStatus;
  /** How long after fetchedAt the data counts as fresh. */
  maxAgeSeconds: number;
  reason?: string;
}

export interface Driver {
  id: string;
  code: string | null;
  number: number | null;
  givenName: string;
  familyName: string;
  nationality: string | null;
  dateOfBirth: string | null;
  url: string | null;
}

export interface Constructor {
  id: string;
  name: string;
  nationality: string | null;
  url: string | null;
}

export interface CircuitLayout {
  /** f1db layout id, e.g. "melbourne-2"; asset lives at /circuits/<id>.svg */
  id: string;
  lengthKm: number | null;
}

export interface Circuit {
  id: string;
  name: string;
  locality: string;
  country: string;
  lat: number;
  lon: number;
  /** IANA zone; null when not in the registry. */
  timezone: string | null;
  layout: CircuitLayout | null;
}

export type SessionKind =
  | "FP1"
  | "FP2"
  | "FP3"
  | "SPRINT_QUALIFYING"
  | "SPRINT"
  | "QUALIFYING"
  | "RACE";

export interface WeekendSession {
  kind: SessionKind;
  /** YYYY-MM-DD (UTC) */
  date: string;
  /** ISO start instant; null when the source only has a date. */
  start: string | null;
}

export interface GrandPrix {
  season: number;
  round: number;
  name: string;
  url: string | null;
  circuit: Circuit;
  /** Sorted by start. Always contains the RACE session. */
  sessions: WeekendSession[];
}

export interface DriverStanding {
  position: number | null;
  positionText: string;
  points: number;
  wins: number;
  driver: Driver;
  constructors: Constructor[];
}

export interface ConstructorStanding {
  position: number | null;
  positionText: string;
  points: number;
  wins: number;
  constructor: Constructor;
}

export interface Standings<T> {
  season: number;
  /** Round the standings are valid after. */
  round: number;
  entries: T[];
}

export interface ClassificationEntry {
  position: number | null;
  positionText: string;
  number: number | null;
  driver: Driver;
  constructor: Constructor;
  grid: number | null;
  laps: number | null;
  status: string;
  points: number;
  time: string | null;
  millis: number | null;
  fastestLap: { rank: number | null; lap: number | null; time: string | null } | null;
}

export interface QualifyingEntry {
  position: number | null;
  number: number | null;
  driver: Driver;
  constructor: Constructor;
  q1: string | null;
  q2: string | null;
  q3: string | null;
}

export interface RaceWeekendResults {
  race: GrandPrix;
  results: ClassificationEntry[];
  qualifying: QualifyingEntry[];
  sprint: ClassificationEntry[];
}

/** One row per race with its classification, used for matrices and recent form. */
export interface SeasonResults {
  season: number;
  races: { round: number; name: string; results: ClassificationEntry[] }[];
}

/** Cumulative points after each completed round, taken from official per-round standings. */
export interface PointsProgression {
  season: number;
  rounds: { round: number; name: string }[];
  drivers: { driver: Driver; points: (number | null)[]; positions: (number | null)[] }[];
  constructors: { constructor: Constructor; points: (number | null)[]; positions: (number | null)[] }[];
}

export interface CareerSeason {
  season: number;
  position: number | null;
  positionText: string;
  points: number;
  wins: number;
  constructors: Constructor[];
}

export interface DriverProfile {
  driver: Driver;
  /** Every season entered, newest first. */
  seasons: number[];
  /** Final standings for the most recent seasons (capped; see seasonsTotal). */
  career: CareerSeason[];
  seasonsTotal: number;
}

export interface ConstructorProfile {
  constructor: Constructor;
  seasons: number[];
  career: CareerSeason[];
  seasonsTotal: number;
}
