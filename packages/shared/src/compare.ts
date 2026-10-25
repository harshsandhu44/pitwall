import type { LapTelemetry, ReplayLap } from "./types";

/** When a lap ended (ms): its start plus its time, or the next lap's start when no time was published. */
function ends(laps: ReplayLap[]) {
  const out = new Map<number, number>();
  laps.forEach((l, i) => {
    const next = laps[i + 1];
    const end = l.start !== null && l.duration !== null ? l.start + l.duration * 1000 : next?.lap === l.lap + 1 ? next.start : null;
    if (end !== null) out.set(l.lap, end);
  });
  return out;
}

/**
 * Per lap: `gap`, seconds A crossed the line after B at the end of that lap (negative: A ahead), and
 * `delta`, A's lap time minus B's. Null where either is unknown.
 */
export function lapGaps(a: ReplayLap[], b: ReplayLap[]) {
  const [ea, eb] = [ends(a), ends(b)];
  const time = (laps: ReplayLap[], n: number) => laps.find((l) => l.lap === n)?.duration ?? null;
  const laps = [...new Set([...ea.keys(), ...eb.keys()])].sort((x, y) => x - y);
  return laps.map((lap) => {
    const [ta, tb] = [time(a, lap), time(b, lap)];
    return {
      lap,
      gap: ea.has(lap) && eb.has(lap) ? (ea.get(lap)! - eb.get(lap)!) / 1000 : null,
      delta: ta !== null && tb !== null ? ta - tb : null,
    };
  });
}

/** Sector deltas (A minus B, seconds) over the last `n` laps both completed, and each driver's best sectors. */
export function sectorDeltas(a: ReplayLap[], b: ReplayLap[], n = 5) {
  const byLap = new Map(b.map((l) => [l.lap, l]));
  const both = a.filter((l) => l.duration !== null && byLap.get(l.lap)?.duration != null).slice(-n);
  const best = (laps: ReplayLap[]) =>
    [0, 1, 2].map((i) => Math.min(...laps.map((l) => l.sectors[i] ?? Infinity))).map((v) => (v === Infinity ? null : v));
  return {
    laps: both.map((l) => {
      const o = byLap.get(l.lap)!;
      return { lap: l.lap, sectors: [0, 1, 2].map((i) => (l.sectors[i] != null && o.sectors[i] != null ? l.sectors[i]! - o.sectors[i]! : null)) };
    }),
    best: [best(a), best(b)],
  };
}

/** Distance along the lap (0–1) at each sample, from integrating speed. ponytail: ~3.7 Hz samples, so it's an estimate. */
export function lapDistance(tel: Pick<LapTelemetry, "t" | "speed">) {
  const d = [0];
  for (let i = 1; i < tel.t.length; i++) d.push(d[i - 1]! + ((tel.speed[i - 1]! + tel.speed[i]!) / 2) * (tel.t[i]! - tel.t[i - 1]!));
  const total = d.at(-1) || 1;
  return d.map((x) => x / total);
}

/** Linear interpolation of ys at x over ascending xs, clamped to the ends. */
function lerp(xs: number[], ys: number[], x: number) {
  if (x <= xs[0]!) return ys[0]!;
  let i = 1;
  while (i < xs.length - 1 && xs[i]! < x) i++;
  const [x0, x1] = [xs[i - 1]!, xs[i]!];
  return x1 === x0 ? ys[i]! : ys[i - 1]! + ((ys[i]! - ys[i - 1]!) * (x - x0)) / (x1 - x0);
}

/** Samples rarely fall on the line: pin the trace to the lap's start (0) and its timed end, holding the nearest sample. */
function anchored(tel: LapTelemetry): LapTelemetry {
  const end = tel.duration * 1000;
  const keys = ["speed", "throttle", "brake", "gear"] as const;
  const out = { ...tel, t: [0, ...tel.t.filter((t) => t > 0 && t < end), end] };
  const inside = tel.t.map((t, i) => [t, i] as const).filter(([t]) => t > 0 && t < end).map(([, i]) => i);
  const [first, last] = [inside[0] ?? 0, inside.at(-1) ?? tel.t.length - 1];
  for (const k of keys) out[k] = [tel[k][first]!, ...inside.map((i) => tel[k][i]!), tel[k][last]!];
  return out;
}

/**
 * Two laps on one distance grid of `n` points: both drivers' traces, and `delta`, seconds A is behind B
 * at that point. `sectors` are A's sector ends as lap fractions, for reference lines.
 */
export function alignLaps(rawA: LapTelemetry, rawB: LapTelemetry, n = 300) {
  const [a, b] = [anchored(rawA), anchored(rawB)];
  const [da, db] = [lapDistance(a), lapDistance(b)];
  const rows = Array.from({ length: n }, (_, k) => {
    const d = k / (n - 1);
    const at = (tel: LapTelemetry, dist: number[], key: "speed" | "throttle" | "brake" | "gear") => lerp(dist, tel[key], d);
    return {
      d,
      delta: (lerp(da, a.t, d) - lerp(db, b.t, d)) / 1000,
      aSpeed: at(a, da, "speed"),
      bSpeed: at(b, db, "speed"),
      aThrottle: at(a, da, "throttle"),
      bThrottle: at(b, db, "throttle"),
      aBrake: at(a, da, "brake"),
      bBrake: at(b, db, "brake"),
      aGear: Math.round(at(a, da, "gear")),
      bGear: Math.round(at(b, db, "gear")),
    };
  });
  const [s1, s2] = a.sectors;
  const sectors = s1 !== null && s2 !== null ? [s1, s1 + s2].map((s) => lerp(a.t, da, s * 1000)) : [];
  return { rows, sectors };
}
