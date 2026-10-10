import type { RadarFrames } from "@pitwall/shared";
import { z } from "zod";
import { fetchJson } from "../upstream";

const Maps = z.object({
  host: z.literal("https://tilecache.rainviewer.com"),
  radar: z.object({ past: z.array(z.object({ time: z.number(), path: z.string().regex(/^\/v2\/radar\/[0-9a-f]+$/) })) }),
});

/** Free tier since 2026-01-01: Universal Blue (2) only, max zoom 7, past ~2 h at 10 min, no nowcast. */
export async function radar(ua: string): Promise<RadarFrames> {
  const r = await fetchJson("rainviewer", "https://api.rainviewer.com/public/weather-maps.json", Maps, ua);
  return {
    host: r.host,
    frames: r.radar.past.map((f) => ({ time: new Date(f.time * 1000).toISOString(), path: f.path })),
    maxZoom: 7,
    colorScheme: 2,
  };
}
