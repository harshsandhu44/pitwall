import type { CloudGrid, HourlySeries, ModelConditions, WeatherForecast } from "@pitwall/shared";
import { z } from "zod";
import { fetchJson } from "../upstream";

const BASE = "https://api.open-meteo.com/v1/forecast";

const HOURLY = {
  temperature: "temperature_2m",
  apparentTemperature: "apparent_temperature",
  humidity: "relative_humidity_2m",
  precipitation: "precipitation",
  precipitationProbability: "precipitation_probability",
  windSpeed: "wind_speed_10m",
  windDirection: "wind_direction_10m",
  windGusts: "wind_gusts_10m",
  cloudCover: "cloud_cover",
  cloudLow: "cloud_cover_low",
  cloudMid: "cloud_cover_mid",
  cloudHigh: "cloud_cover_high",
  weatherCode: "weather_code",
} as const satisfies Record<Exclude<keyof HourlySeries, "time">, string>;

const CURRENT = {
  temperature: "temperature_2m",
  apparentTemperature: "apparent_temperature",
  humidity: "relative_humidity_2m",
  precipitation: "precipitation",
  windSpeed: "wind_speed_10m",
  windDirection: "wind_direction_10m",
  windGusts: "wind_gusts_10m",
  cloudCover: "cloud_cover",
  weatherCode: "weather_code",
} as const satisfies Record<Exclude<keyof ModelConditions, "time">, string>;

const column = z.array(z.number().nullable());
const unix = z.array(z.number());

const ForecastResponse = z.object({
  latitude: z.number(),
  longitude: z.number(),
  elevation: z.number().nullable().optional(),
  current: z
    .object({ time: z.number() })
    .extend(Object.fromEntries(Object.values(CURRENT).map((k) => [k, z.number().nullable()])))
    .optional(),
  hourly: z.object({ time: unix }).extend(Object.fromEntries(Object.values(HOURLY).map((k) => [k, column]))),
});

const iso = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString();

export function toForecast(circuitId: string, lat: number, lon: number, r: z.infer<typeof ForecastResponse>): WeatherForecast {
  const h = r.hourly as Record<string, (number | null)[]> & { time: number[] };
  const n = h.time.length;
  for (const k of Object.values(HOURLY)) {
    if (h[k]!.length !== n) throw new Error(`hourly ${k} has ${h[k]!.length} values, expected ${n}`);
  }
  const c = r.current as (Record<string, number | null> & { time: number }) | undefined;
  return {
    circuitId,
    lat,
    lon,
    modelLat: r.latitude,
    modelLon: r.longitude,
    elevation: r.elevation ?? null,
    current: c
      ? ({
          time: iso(c.time),
          ...Object.fromEntries(Object.entries(CURRENT).map(([ours, theirs]) => [ours, c[theirs] ?? null])),
        } as ModelConditions)
      : null,
    hourly: {
      time: h.time.map(iso),
      ...Object.fromEntries(Object.entries(HOURLY).map(([ours, theirs]) => [ours, h[theirs]!])),
    } as HourlySeries,
  };
}

export async function forecast(circuitId: string, lat: number, lon: number, ua: string) {
  const url = new URL(BASE);
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("hourly", Object.values(HOURLY).join(","));
  url.searchParams.set("current", Object.values(CURRENT).join(","));
  url.searchParams.set("forecast_days", "16");
  url.searchParams.set("timezone", "GMT");
  url.searchParams.set("timeformat", "unixtime");
  return toForecast(circuitId, lat, lon, await fetchJson("open-meteo", url.toString(), ForecastResponse, ua));
}

// ---- Cloud/wind grid ----

export const GRID_SIZE = 7; // 7×7 points
export const GRID_SPACING = 0.25; // degrees ≈ 28 km: close to the coarser global models, so cells don't overstate detail

const GRID_VARS = {
  total: "cloud_cover",
  low: "cloud_cover_low",
  mid: "cloud_cover_mid",
  high: "cloud_cover_high",
  windSpeed: "wind_speed_10m",
  windDirection: "wind_direction_10m",
  windGusts: "wind_gusts_10m",
} as const;

const GridPoint = z.object({
  latitude: z.number(),
  longitude: z.number(),
  hourly: z.object({ time: unix }).extend(Object.fromEntries(Object.values(GRID_VARS).map((k) => [k, column]))),
});

/** Requested grid point coordinates, row-major from the south-west corner. */
export function gridPoints(lat: number, lon: number, size = GRID_SIZE, spacing = GRID_SPACING) {
  const half = (size - 1) / 2;
  const round = (x: number) => Math.round(x * 1e4) / 1e4;
  const out: { lat: number; lon: number }[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) out.push({ lat: round(lat + (r - half) * spacing), lon: round(lon + (c - half) * spacing) });
  }
  return out;
}

export function toCloudGrid(circuitId: string, lat: number, lon: number, points: z.infer<typeof GridPoint>[]): CloudGrid {
  const requested = gridPoints(lat, lon);
  if (points.length !== requested.length) throw new Error(`grid returned ${points.length} points, expected ${requested.length}`);
  const time = (points[0]!.hourly as { time: number[] }).time;
  return {
    circuitId,
    center: { lat, lon },
    spacingDeg: GRID_SPACING,
    time: time.map(iso),
    cells: points.map((p, i) => {
      const h = p.hourly as Record<string, (number | null)[]> & { time: number[] };
      if (h.time.length !== time.length) throw new Error("grid points disagree on forecast steps");
      return {
        ...requested[i]!,
        modelLat: p.latitude,
        modelLon: p.longitude,
        cloud: { total: h[GRID_VARS.total]!, low: h[GRID_VARS.low]!, mid: h[GRID_VARS.mid]!, high: h[GRID_VARS.high]! },
        windSpeed: h[GRID_VARS.windSpeed]!,
        windDirection: h[GRID_VARS.windDirection]!,
        windGusts: h[GRID_VARS.windGusts]!,
      };
    }),
  };
}

/** One multi-location request; 3-hourly steps for 7 days keeps the payload ~120 KB. */
export async function cloudGrid(circuitId: string, lat: number, lon: number, ua: string) {
  const pts = gridPoints(lat, lon);
  const url = new URL(BASE);
  url.searchParams.set("latitude", pts.map((p) => p.lat).join(","));
  url.searchParams.set("longitude", pts.map((p) => p.lon).join(","));
  url.searchParams.set("hourly", Object.values(GRID_VARS).join(","));
  url.searchParams.set("forecast_days", "7");
  url.searchParams.set("temporal_resolution", "hourly_3");
  url.searchParams.set("timezone", "GMT");
  url.searchParams.set("timeformat", "unixtime");
  return toCloudGrid(circuitId, lat, lon, await fetchJson("open-meteo", url.toString(), z.array(GridPoint), ua));
}
