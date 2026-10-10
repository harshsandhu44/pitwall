import type { HourlySeries, WeekendSession } from "./types";

/** WMO weather interpretation codes as used by Open-Meteo. */
const WMO: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

export const weatherLabel = (code: number | null) => (code === null ? "Unknown" : (WMO[code] ?? `Code ${code}`));

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
/** Compass point the wind blows from. */
export const compass = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]!;

/** Cloud cover in 20% bands: the model's spatial/temporal uncertainty doesn't justify finer steps. */
export function cloudBand(pct: number | null): 0 | 1 | 2 | 3 | 4 | 5 | null {
  if (pct === null || Number.isNaN(pct)) return null;
  if (pct < 5) return 0;
  return Math.min(5, Math.ceil(Math.min(pct, 100) / 20)) as 1 | 2 | 3 | 4 | 5;
}

export interface SessionWeather {
  /** Forecast hour at (or just before) the session start. */
  atStart: Record<Exclude<keyof HourlySeries, "time">, number | null> & { time: string } | null;
  /** Hours from start through the typical session length, inclusive. */
  hours: number;
  maxPrecipitationProbability: number | null;
  totalPrecipitation: number | null;
  temperatureRange: [number, number] | null;
  maxWindSpeed: number | null;
  maxGusts: number | null;
  /** Forecast hours (ISO) in the window with ≥ `wetThreshold`% rain probability or measurable precipitation. */
  wetHours: string[];
}

const SESSION_HOURS: Record<WeekendSession["kind"], number> = {
  FP1: 1, FP2: 1, FP3: 1, SPRINT_QUALIFYING: 1, SPRINT: 1, QUALIFYING: 1, RACE: 2,
};

const nums = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null);
const max = (xs: (number | null)[]) => (nums(xs).length ? Math.max(...nums(xs)) : null);

/**
 * Summarise the hourly forecast across a session's scheduled window.
 * Returns null when the forecast doesn't reach the session (or the start time is unknown).
 */
export function sessionWeather(h: HourlySeries, s: WeekendSession, wetThreshold = 30): SessionWeather | null {
  if (!s.start) return null;
  const start = Date.parse(s.start);
  const times = h.time.map(Date.parse);
  // Last forecast hour at or before the start.
  let i = -1;
  for (let k = 0; k < times.length; k++) if (times[k]! <= start) i = k;
  const hours = SESSION_HOURS[s.kind];
  if (i < 0 || times[i]! + 3_600_000 <= start || i + hours >= times.length) return null;

  const range = <K extends Exclude<keyof HourlySeries, "time">>(k: K) => h[k].slice(i, i + hours + 1);
  const temps = nums(range("temperature"));
  const precip = nums(range("precipitation"));
  const atStart = Object.fromEntries(
    (Object.keys(h) as (keyof HourlySeries)[]).map((k) => [k, h[k][i] ?? null]),
  ) as SessionWeather["atStart"];
  return {
    atStart,
    hours,
    maxPrecipitationProbability: max(range("precipitationProbability")),
    totalPrecipitation: precip.length ? Math.round(precip.reduce((a, b) => a + b, 0) * 10) / 10 : null,
    temperatureRange: temps.length ? [Math.min(...temps), Math.max(...temps)] : null,
    maxWindSpeed: max(range("windSpeed")),
    maxGusts: max(range("windGusts")),
    wetHours: h.time
      .slice(i, i + hours + 1)
      .filter((_, k) => (h.precipitationProbability[i + k] ?? 0) >= wetThreshold || (h.precipitation[i + k] ?? 0) >= 0.1),
  };
}
