import type { PositionWindow, ReplayLap, SessionReplay } from "./types";

/** Position data is served in fixed, aligned windows so every viewer shares the same cached chunks. */
export const WINDOW_MS = 60_000;
/** Samples arrive roughly every 0.25 s; past this gap we stop interpolating and show the last sample as stale. */
export const MAX_SAMPLE_GAP_MS = 1_000;

export const windowStart = (t: number) => Math.floor(t / WINDOW_MS) * WINDOW_MS;

/** Index of the last element whose time is ≤ t, or -1. `ts` must be sorted. */
export function lastAtOrBefore(ts: number[], t: number) {
  let lo = 0;
  let hi = ts.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ts[mid]! <= t) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best;
}

export type CarFix = { x: number; y: number; kind: "sample" | "interpolated" | "stale" };

/**
 * Where a car was at `offset` (ms from the window start), from recorded samples only.
 * Interpolates linearly between two samples ≤ MAX_SAMPLE_GAP_MS apart; otherwise holds the last
 * sample and marks it stale. Returns null before the first sample.
 */
export function carAt(series: { t: number[]; x: number[]; y: number[] }, offset: number, interpolate = true): CarFix | null {
  const i = lastAtOrBefore(series.t, offset);
  if (i < 0) return null;
  const t0 = series.t[i]!;
  const x0 = series.x[i]!;
  const y0 = series.y[i]!;
  const j = i + 1;
  const hasNext = j < series.t.length && series.t[j]! - t0 <= MAX_SAMPLE_GAP_MS;
  if (offset === t0) return { x: x0, y: y0, kind: "sample" };
  if (!hasNext) return { x: x0, y: y0, kind: offset - t0 <= MAX_SAMPLE_GAP_MS && !interpolate ? "sample" : "stale" };
  if (!interpolate) return { x: x0, y: y0, kind: "sample" };
  const f = (offset - t0) / (series.t[j]! - t0);
  return { x: x0 + (series.x[j]! - x0) * f, y: y0 + (series.y[j]! - y0) * f, kind: "interpolated" };
}

export interface TimingRow {
  driver: number;
  position: number | null;
  gap: number | string | null;
  interval: number | string | null;
  lap: number | null;
  lastLap: number | null;
  bestLap: number | null;
  compound: string | null;
  tyreAge: number | null;
  pits: number;
}

function lapState(laps: ReplayLap[], t: number) {
  let lap: number | null = null;
  let lastLap: number | null = null;
  let bestLap: number | null = null;
  for (const l of laps) {
    if (l.start === null || l.start > t) continue;
    lap = l.lap;
    if (l.duration !== null && l.start + l.duration * 1000 <= t) {
      lastLap = l.duration;
      bestLap = bestLap === null ? l.duration : Math.min(bestLap, l.duration);
    }
  }
  return { lap, lastLap, bestLap };
}

/** The timing tower at time `t`, built only from records published at or before `t`. */
export function timingAt(r: SessionReplay, w: PositionWindow | null, t: number): TimingRow[] {
  const position = new Map<number, number>();
  for (const p of r.positions) {
    if (p.t > t) break;
    position.set(p.driver, p.position);
  }
  const rows = r.drivers.map((d): TimingRow => {
    const { lap, lastLap, bestLap } = lapState(r.laps[d.number] ?? [], t);
    const stint = lap === null ? undefined : (r.stints[d.number] ?? []).find((s) => s.lapStart <= lap && lap <= s.lapEnd);
    const iv = w?.intervals[d.number];
    const k = iv ? lastAtOrBefore(iv.t, t - w!.from) : -1;
    return {
      driver: d.number,
      position: position.get(d.number) ?? null,
      gap: k >= 0 ? iv!.gap[k]! : null,
      interval: k >= 0 ? iv!.interval[k]! : null,
      lap,
      lastLap,
      bestLap,
      compound: stint?.compound ?? null,
      tyreAge: stint && stint.ageAtStart !== null && lap !== null ? stint.ageAtStart + lap - stint.lapStart : null,
      pits: r.pits.filter((p) => p.driver === d.number && p.t <= t).length,
    };
  });
  return rows.sort((a, b) => (a.position ?? 99) - (b.position ?? 99) || a.driver - b.driver);
}

export interface TrackStatus {
  kind: "green" | "yellow" | "vsc" | "sc" | "red" | "chequered";
  /** "Green flag", "Double yellow S10", "Safety car in this lap"… */
  label: string;
  /** Track sectors under a yellow, ascending. */
  sectors: number[];
}

/**
 * Track status at `t` from race-control messages (sorted by time). Reads only the Flag and SafetyCar
 * categories, so stewards' notes that mention the safety car don't count.
 */
export function trackStatus(messages: SessionReplay["raceControl"], t: number): TrackStatus {
  let neutral: "sc" | "vsc" | null = null;
  let ending = false;
  let red = false;
  let chequered = false;
  const yellows = new Map<number, string>();
  for (const m of messages) {
    if (m.t > t) break;
    const sector = Number(/SECTOR (\d+)/.exec(m.message)?.[1]) || null;
    if (m.category === "SafetyCar") {
      if (/VIRTUAL SAFETY CAR DEPLOYED/.test(m.message)) [neutral, ending] = ["vsc", false];
      else if (/VIRTUAL SAFETY CAR ENDING/.test(m.message)) ending = true;
      else if (/SAFETY CAR DEPLOYED/.test(m.message)) [neutral, ending] = ["sc", false];
      else if (/SAFETY CAR IN THIS LAP/.test(m.message)) ending = true;
    } else if (m.category === "Flag") {
      if (m.flag === "RED") red = true;
      else if (m.flag === "CHEQUERED") chequered = true;
      else if (m.flag === "GREEN") [red, neutral] = [false, null];
      else if (m.flag === "CLEAR" && !sector) [neutral, red] = [null, false];
      if ((m.flag === "YELLOW" || m.flag === "DOUBLE YELLOW") && sector) yellows.set(sector, m.flag);
      if (m.flag === "CLEAR" && sector) yellows.delete(sector);
      if (m.flag === "CLEAR" && !sector) yellows.clear();
    }
  }
  const sectors = [...yellows.keys()].sort((a, b) => a - b);
  if (chequered) return { kind: "chequered", label: "Chequered flag", sectors: [] };
  if (red) return { kind: "red", label: "Red flag", sectors };
  if (neutral === "sc") return { kind: "sc", label: ending ? "Safety car in this lap" : "Safety car", sectors };
  if (neutral === "vsc") return { kind: "vsc", label: ending ? "Virtual safety car ending" : "Virtual safety car", sectors };
  if (sectors.length) {
    const double = [...yellows.values()].includes("DOUBLE YELLOW");
    return { kind: "yellow", label: `${double ? "Double yellow" : "Yellow"} ${sectors.map((s) => `S${s}`).join(", ")}`, sectors };
  }
  return { kind: "green", label: "Green flag", sectors: [] };
}
