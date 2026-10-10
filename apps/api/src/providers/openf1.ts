import {
  type Driver,
  type PositionWindow,
  type ReplayDriver,
  type ReplaySession,
  type SessionReplay,
  WINDOW_MS,
} from "@pitwall/shared";
import { z } from "zod";
import { fetchJson, UpstreamError } from "../upstream";

const BASE = "https://api.openf1.org/v1";
/** OpenF1's free historical data starts with the 2023 season. */
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
const Meeting = z.object({ meeting_key: z.number(), meeting_name: z.string() });
const ODriver = z.object({
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
const Interval = z.object({ date: z.string(), driver_number: z.number(), gap_to_leader: Gap, interval: Gap });

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

/** Sessions that have finished at least `settleMs` ago, oldest first, named after their meeting. */
export function toSessions(sessions: Raw<typeof Session>, meetings: Raw<typeof Meeting>, now: number, settleMs: number): ReplaySession[] {
  const names = new Map(meetings.map((m) => [m.meeting_key, m.meeting_name]));
  return sessions
    .filter((s) => !s.is_cancelled && Date.parse(s.date_end) + settleMs < now)
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

/** Match OpenF1 drivers to Jolpica ids by three-letter code, then by number; ambiguous matches stay null. */
export function toDrivers(raw: Raw<typeof ODriver>, jolpica: Driver[]): ReplayDriver[] {
  const unique = <T>(xs: T[]) => (xs.length === 1 ? xs[0]! : null);
  const seen = new Set<number>();
  return raw.flatMap((d) => {
    if (seen.has(d.driver_number)) return [];
    seen.add(d.driver_number);
    const acronym = d.name_acronym ?? String(d.driver_number);
    const match = unique(jolpica.filter((j) => j.code === acronym)) ?? unique(jolpica.filter((j) => j.code === null && j.number === d.driver_number));
    return [
      {
        number: d.driver_number,
        acronym,
        name: d.first_name && d.last_name ? `${d.first_name} ${d.last_name}` : (d.full_name ?? acronym),
        team: d.team_name ?? null,
        colour: d.team_colour && /^[0-9a-f]{6}$/i.test(d.team_colour) ? `#${d.team_colour}` : null,
        driverId: match?.id ?? null,
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
    session: toSessions([r.session], [{ meeting_key: r.session.meeting_key, meeting_name: r.meetingName }], Infinity, -Infinity)[0]!,
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

// ---- Fetchers ----

export async function sessions(season: number, now: number, settleMs: number, ua: string) {
  const [s, m] = [await list("sessions", `year=${season}`, Session, ua), await list("meetings", `year=${season}`, Meeting, ua)];
  return toSessions(s, m, now, settleMs);
}

export const drivers = (key: number, ua: string) => list("drivers", `session_key=${key}`, ODriver, ua);

export async function replay(key: number, jolpicaDrivers: (season: number) => Promise<Driver[]>, ua: string): Promise<SessionReplay> {
  const q = `session_key=${key}`;
  const [session] = await list("sessions", q, Session, ua);
  if (!session) throw new UpstreamError("openf1", "not_found", `no OpenF1 session ${key}`);
  // Sequential: the free tier allows 3 requests/s, and fetchJson paces them anyway.
  const meeting = (await list("meetings", `meeting_key=${session.meeting_key}`, Meeting, ua))[0];
  const rawDrivers = await drivers(key, ua);
  const base = toReplay({
    session,
    meetingName: meeting?.meeting_name ?? session.country_name,
    drivers: toDrivers(rawDrivers, await jolpicaDrivers(new Date(session.date_start).getUTCFullYear())),
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
