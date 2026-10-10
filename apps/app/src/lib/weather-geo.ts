import { type CloudGrid, type CloudLevel, cloudBand, compass } from "@pitwall/shared";

type Feature<G> = { type: "Feature"; geometry: G; properties: Record<string, string | number> };
export type FeatureCollection<G = unknown> = { type: "FeatureCollection"; features: Feature<G>[] };

/**
 * One square per grid point, spanning half the grid spacing each way, banded in 20% steps.
 * Cells are drawn as blocks (not smoothed) so the map shows the model's real resolution.
 */
export function cloudFeatures(grid: CloudGrid, step: number, level: CloudLevel): FeatureCollection<{ type: "Polygon"; coordinates: number[][][] }> {
  const h = grid.spacingDeg / 2;
  return {
    type: "FeatureCollection",
    features: grid.cells.flatMap((c) => {
      const pct = c.cloud[level][step] ?? null;
      const band = cloudBand(pct);
      if (band === null) return []; // unknown stays empty rather than looking clear
      const ring = [
        [c.lon - h, c.lat - h],
        [c.lon + h, c.lat - h],
        [c.lon + h, c.lat + h],
        [c.lon - h, c.lat + h],
        [c.lon - h, c.lat - h],
      ];
      return [{ type: "Feature" as const, geometry: { type: "Polygon" as const, coordinates: [ring] }, properties: { band, pct: pct! } }];
    }),
  };
}

/** Arrows at each grid point; `rot` points where the wind blows to (meteorological direction + 180°). */
export function windFeatures(grid: CloudGrid, step: number): FeatureCollection<{ type: "Point"; coordinates: number[] }> {
  return {
    type: "FeatureCollection",
    features: grid.cells.flatMap((c) => {
      const speed = c.windSpeed[step] ?? null;
      const dir = c.windDirection[step] ?? null;
      // Below ~1 km/h the direction is meaningless, so draw nothing rather than a confident arrow.
      if (speed === null || dir === null || speed < 1) return [];
      return [
        {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [c.lon, c.lat] },
          properties: { speed, rot: (dir + 180) % 360, label: `${Math.round(speed)} ${compass(dir)}` },
        },
      ];
    }),
  };
}

/** Index of the forecast step nearest to `t` (ms), or -1 if `t` is outside the grid's range. */
export function nearestStep(times: string[], t: number) {
  if (!times.length) return -1;
  const ms = times.map(Date.parse);
  const stepMs = ms.length > 1 ? ms[1]! - ms[0]! : 0;
  if (t < ms[0]! - stepMs / 2 || t > ms.at(-1)! + stepMs / 2) return -1;
  let best = 0;
  ms.forEach((m, i) => {
    if (Math.abs(m - t) < Math.abs(ms[best]! - t)) best = i;
  });
  return best;
}
