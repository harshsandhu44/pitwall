// Geometry for the 3D circuit (circuit-scene.ts): the F1DB outline as a centreline in metres, where
// the kerbs go, and which light the race runs under. Pure, so it's tested without a browser.

export type Pt = [number, number];
export type Sky = "day" | "golden" | "sunset" | "night";

/** Points this far apart along the lap, about. */
export const STEP_M = 10;

/** Path length of a closed polyline. */
export const lapLength = (pts: readonly Pt[]) =>
  pts.reduce((sum, [x, y], i) => {
    const [nx, ny] = pts[(i + 1) % pts.length]!;
    return sum + Math.hypot(nx - x, ny - y);
  }, 0);

/**
 * The outline (SVG units, y down) scaled so a lap is the real lap length, centred on the origin.
 * F1DB layouts are schematic but to shape, so one scale fits; without a length, 5 km.
 */
export function toMetres(pts: readonly Pt[], lengthKm: number | null): Pt[] {
  const k = ((lengthKm ?? 5) * 1000) / (lapLength(pts) || 1);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return pts.map(([x, y]) => [(x - cx) * k, (y - cy) * k]);
}

/** Unit normal at each point of a closed line, averaged over the segments either side; points right of travel. */
export const normals = (pts: readonly Pt[]): Pt[] =>
  pts.map((_, i) => {
    const [ax, ay] = pts[(i - 1 + pts.length) % pts.length]!;
    const [bx, by] = pts[(i + 1) % pts.length]!;
    const l = Math.hypot(bx - ax, by - ay) || 1;
    return [-(by - ay) / l, (bx - ax) / l];
  });

/**
 * Signed curvature (radians per metre) at each point, measured over w points either side, as the drive's
 * track.ts does. Positive bends right.
 */
export function curvature(pts: readonly Pt[], w = 3): number[] {
  const N = pts.length;
  const dir = (j: number) => {
    const [ax, ay] = pts[((j % N) + N) % N]!;
    const [bx, by] = pts[(((j + 1) % N) + N) % N]!;
    return Math.atan2(by - ay, bx - ax);
  };
  const step = lapLength(pts) / N;
  return pts.map((_, i) => {
    let turn = dir(i + w - 1) - dir(i - w);
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    return turn / (2 * w * step);
  });
}

/** Kerbs on corners tighter than this radius, as on the drive. */
export const KERB_R = 250;

/** Which points have kerbs: the corners. */
export const kerbs = (pts: readonly Pt[]) => curvature(pts).map((c) => Math.abs(c) > 1 / KERB_R);

/**
 * The light for a race starting at `start`, from the local hour at the circuit: Las Vegas, Singapore and Qatar
 * run at night, Bahrain into dusk, Abu Dhabi from sunset. ponytail: hour thresholds, not the sun's position;
 * a per-circuit override if one ever looks wrong.
 */
export function skyFor(start: string | null, timeZone: string | null): Sky {
  if (!start || !timeZone) return "day";
  const parts = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "numeric", hourCycle: "h23", timeZone }).formatToParts(new Date(start));
  const hour = Number(parts.find((p) => p.type === "hour")?.value) + Number(parts.find((p) => p.type === "minute")?.value) / 60;
  return hour < 16 ? "day" : hour < 18 ? "golden" : hour < 19 ? "sunset" : "night";
}

/**
 * Index of the point of a closed line nearest `p`. With `prev` (where it was last frame) it looks only a little
 * behind and ahead of it, which keeps a car on its own road where the lap crosses itself; it scans the whole
 * lap when there's no `prev` or nothing within `near` of it (the pit lane, a seek).
 */
export function nearestOnLap(pts: readonly Pt[], [x, y]: Pt, prev = -1, near = Infinity): number {
  const N = pts.length;
  let best = -1;
  let bd = Infinity;
  const scan = (j: number) => {
    const i = ((j % N) + N) % N;
    const d = (pts[i]![0] - x) ** 2 + (pts[i]![1] - y) ** 2;
    if (d < bd) [bd, best] = [d, i];
  };
  if (prev >= 0) for (let j = prev - 60; j <= prev + 90; j++) scan(j);
  if (best < 0 || bd > near * near) for (let j = 0; j < N; j++) scan(j);
  return best;
}
