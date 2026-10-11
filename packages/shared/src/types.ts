// Domain models shared by the API Worker and the app.
// `null` always means "the source did not provide this value" — never a guess.

export type Source = "jolpica" | "openf1" | "open-meteo" | "rainviewer" | "pitwall";

/** ok: fresh data. stale: older than its freshness window, served while revalidating. */
export type Availability = "ok" | "stale" | "not_found" | "unavailable" | "error";
export type CacheStatus = "hit" | "miss" | "stale" | "none";

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

export type ResultSession = "results" | "qualifying" | "sprint" | "sprintQualifying";

export interface RaceWeekendResults {
  race: GrandPrix;
  results: ClassificationEntry[];
  qualifying: QualifyingEntry[];
  sprint: ClassificationEntry[];
  /** Sprint qualifying / shootout. Jolpica doesn't publish it, so it only comes from OpenF1 (2023 onward). */
  sprintQualifying: QualifyingEntry[];
  /**
   * Classifications taken from OpenF1 timing data because Jolpica hadn't published them: provisional,
   * before any later stewards' decisions. Drivers or teams that couldn't be matched to Jolpica have id "".
   */
  fromOpenF1: ResultSession[];
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

// ---- Weather ----

/** Hourly model forecast (Open-Meteo). Columns align with `time`; null = value not provided by the model. */
export interface HourlySeries {
  time: string[];
  temperature: (number | null)[];
  apparentTemperature: (number | null)[];
  humidity: (number | null)[];
  precipitation: (number | null)[];
  precipitationProbability: (number | null)[];
  windSpeed: (number | null)[];
  windDirection: (number | null)[];
  windGusts: (number | null)[];
  cloudCover: (number | null)[];
  cloudLow: (number | null)[];
  cloudMid: (number | null)[];
  cloudHigh: (number | null)[];
  weatherCode: (number | null)[];
}

/** Open-Meteo "current" values: a model analysis for the last 15-minute step, not a station measurement. */
export interface ModelConditions {
  time: string;
  temperature: number | null;
  apparentTemperature: number | null;
  humidity: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  windGusts: number | null;
  cloudCover: number | null;
  weatherCode: number | null;
}

export interface WeatherForecast {
  circuitId: string;
  /** Requested coordinates (the circuit). */
  lat: number;
  lon: number;
  /** Centre of the model grid cell actually used. */
  modelLat: number;
  modelLon: number;
  elevation: number | null;
  current: ModelConditions | null;
  hourly: HourlySeries;
  /** Units: °C, %, mm, km/h, degrees (direction the wind comes from). */
}

export type CloudLevel = "total" | "low" | "mid" | "high";

/** Forecast cloud cover and wind on a coarse grid around a circuit, one model cell per point. */
export interface CloudGrid {
  circuitId: string;
  center: { lat: number; lon: number };
  spacingDeg: number;
  /** Forecast steps (ISO), shared by every cell. */
  time: string[];
  cells: {
    lat: number;
    lon: number;
    modelLat: number;
    modelLon: number;
    cloud: Record<CloudLevel, (number | null)[]>;
    windSpeed: (number | null)[];
    windDirection: (number | null)[];
    windGusts: (number | null)[];
  }[];
}

/** Observed precipitation radar frames (RainViewer). Past frames only; no nowcast is available. */
export interface RadarFrames {
  host: string;
  frames: { time: string; path: string }[];
  maxZoom: number;
  colorScheme: number;
}

// ---- Replay (OpenF1 historical data, 2023 onward) ----
// Times are epoch milliseconds unless named otherwise. Track x/y are OpenF1's own unitless coordinates.

export interface ReplaySession {
  key: number;
  meetingKey: number;
  meetingName: string;
  /** "Race", "Sprint", "Qualifying", "Practice 1", … */
  name: string;
  /** OpenF1 session_type ("Race" covers sprints too). */
  type: string;
  circuit: string;
  country: string;
  /** Scheduled window (ISO). */
  start: string;
  end: string;
}

export interface ReplayDriver {
  number: number;
  acronym: string;
  name: string;
  team: string | null;
  /** "#RRGGBB" from OpenF1, null when not published. */
  colour: string | null;
  /** Jolpica driver id when it could be matched by code or number. */
  driverId: string | null;
}

export interface ReplayLap {
  lap: number;
  start: number | null;
  /** Seconds. */
  duration: number | null;
  sectors: [number | null, number | null, number | null];
  pitOut: boolean;
}

export interface ReplayStint {
  stint: number;
  lapStart: number;
  lapEnd: number;
  compound: string | null;
  ageAtStart: number | null;
}

export interface SessionReplay {
  session: ReplaySession;
  /** Playback range: scheduled start to the later of the scheduled end and the last recorded lap. */
  range: { start: number; end: number };
  drivers: ReplayDriver[];
  /** Keyed by driver number, sorted by lap. */
  laps: Record<number, ReplayLap[]>;
  stints: Record<number, ReplayStint[]>;
  /** Pit-lane visits (includes red-flag entries), sorted by time. */
  pits: { driver: number; t: number; lap: number | null; laneSeconds: number | null }[];
  /** Official running-order changes, sorted by time. */
  positions: { driver: number; t: number; position: number }[];
  raceControl: { t: number; lap: number | null; category: string; flag: string | null; driver: number | null; message: string }[];
  /** Track-side observations. Wind in m/s as published. */
  weather: {
    t: number;
    air: number | null;
    track: number | null;
    humidity: number | null;
    windSpeed: number | null;
    windDirection: number | null;
    rainfall: boolean | null;
  }[];
  /** Outline traced from one driver's recorded positions on their fastest lap; null without a usable lap. */
  track: { driver: number; lap: number; x: number[]; y: number[] } | null;
}

/** Recorded car positions for one fixed window. Sample times are ms offsets from `from` (may be <0 or ≥ window: 1 s overlap each side). */
export interface PositionWindow {
  from: number;
  to: number;
  cars: Record<number, { t: number[]; x: number[]; y: number[] }>;
  /** Races and sprints only: seconds, or text such as "+1 LAP". */
  intervals: Record<number, { t: number[]; gap: (number | string | null)[]; interval: (number | string | null)[] }>;
}
