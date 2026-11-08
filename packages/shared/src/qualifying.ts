import type { ReplayLap, SessionReplay } from "./types";

// ---- Qualifying: Q1/Q2/Q3 (or SQ1-3) from race control and laps ----
// Everything here is judged at a time `t` from records published by then, the same rule the race timing follows.

type Message = SessionReplay["raceControl"][number];

export interface QualiSegment {
  phase: number;
  /** "Q1"… or "SQ1"… */
  label: string;
  start: number;
  /** "SESSION FINISHED"; a segment can end under a red flag, without a chequered flag. */
  end: number | null;
  /** Green-light running between red flags; the segment clock only runs inside these. */
  running: { from: number; to: number | null }[];
  lengthMs: number;
}

/** What qualifying needs from race control. Live sends it whole, since a snapshot carries only the latest 20 messages. */
export interface QualiContext {
  segments: QualiSegment[];
  /** Lap times deleted (on) or reinstated (off) by race control, matched by car and time. */
  deleted: { t: number; driver: number; ms: number; on: boolean }[];
}

const MIN = 60_000;
const lengths = (sessionName: string) => (/sprint/i.test(sessionName) ? [12, 10, 8] : [18, 15, 12]).map((m) => m * MIN);

/** Segments from the SessionStatus messages (STARTED / ABORTED for a red flag / FINISHED) and deleted lap times. */
export function qualifyingContext(messages: Message[], sessionName: string): QualiContext {
  const segments: QualiSegment[] = [];
  const deleted: QualiContext["deleted"] = [];
  const prefix = /sprint/i.test(sessionName) ? "SQ" : "Q";
  for (const m of messages) {
    const cur = segments.at(-1);
    const run = cur?.running.at(-1);
    if (m.category === "SessionStatus") {
      if (/SESSION STARTED/.test(m.message)) {
        if (!cur || cur.end !== null) {
          const phase = segments.length + 1;
          if (phase > 3) continue;
          segments.push({ phase, label: `${prefix}${phase}`, start: m.t, end: null, running: [{ from: m.t, to: null }], lengthMs: lengths(sessionName)[phase - 1]! });
        } else if (run && run.to !== null) cur.running.push({ from: m.t, to: null });
      } else if (/SESSION (ABORTED|FINISHED)/.test(m.message) && cur && cur.end === null) {
        if (run && run.to === null) run.to = m.t;
        if (/FINISHED/.test(m.message)) cur.end = m.t;
      }
    }
    // OpenF1's "LAP n" in these messages is one ahead of its own lap numbers, so match on the time instead.
    const d = /CAR (\d+) \([A-Z]{3}\) TIME (\d+):(\d+\.\d+) (DELETED|REINSTATED)/.exec(m.message);
    if (d) deleted.push({ t: m.t, driver: Number(d[1]), ms: Math.round((Number(d[2]) * 60 + Number(d[3])) * 1000), on: d[4] === "DELETED" });
  }
  return { segments, deleted };
}

/** Cars dropped per knockout segment: (cars − 10) / 2, i.e. 5 of 20, 6 of 22. */
export const knockoutCount = (cars: number) => Math.max(0, Math.floor((cars - 10) / 2));

/** out: pit-out lap. push / slow: judged on sector pace. unknown: on a lap, no sector yet. null: not on a lap. */
export type LapState = "out" | "push" | "slow" | "unknown" | null;

export interface QualiRow {
  driver: number;
  position: number;
  best: number | null;
  /** Seconds behind P1's best in this segment. */
  gap: number | null;
  /** The best lap's sectors. */
  sectors: (number | null)[];
  sectorMark: ("session" | "personal" | null)[];
  /** Completed laps in this segment. */
  laps: number;
  /** Phase this car went out in (an earlier, finished segment). */
  out: number | null;
  /** Below the knockout line in this segment: projected while it runs, final once it's done. */
  danger: boolean;
  state: LapState;
}

export interface Improvement {
  t: number;
  phase: number;
  driver: number;
  time: number;
  /** Place before the lap (null: no time yet) and after. */
  from: number | null;
  to: number;
  /** Cars this lap pushed below the knockout line. */
  knocked: number[];
}

export interface OnLap {
  driver: number;
  /** Sectors set so far on the current lap. */
  sectors: number[];
  /** Over the same sectors of P1's and the last safe car's best laps; null without a comparison. */
  toP1: number | null;
  toCutoff: number | null;
  /** Place the lap would take at this pace. */
  wouldBe: number | null;
}

export interface QualiState {
  /** Segments started by `t`, with their ends only once published. */
  segments: QualiSegment[];
  current: QualiSegment | null;
  /** Estimated time left in the current segment (ms); null when the estimate doesn't hold up. */
  timeLeft: number | null;
  clockRunning: boolean;
  knockout: number;
  /** Per started segment: the order, then cars out in earlier segments. */
  standings: QualiRow[][];
  /** Per started segment: true once no lap begun before its end is still running. */
  final: boolean[];
  /** Newest first. */
  improvements: Improvement[];
  onLap: OnLap[];
}

/** Laps with no recorded duration (aborted at the flag) stop counting as running after this. */
const OPEN_CAP_MS = 5 * MIN;
const PUSH = 1.05;

const lapEnd = (l: ReplayLap) => (l.start !== null && l.duration !== null ? l.start + l.duration * 1000 : null);
/** Sectors set by `t`. */
const revealed = (l: ReplayLap, t: number) => {
  const out: number[] = [];
  let at = l.start!;
  for (const s of l.sectors) {
    if (s === null || (at += s * 1000) > t) break;
    out.push(s);
  }
  return out;
};

export function qualifyingAt(
  input: { drivers: { number: number }[]; laps: SessionReplay["laps"] },
  ctx: QualiContext,
  t: number,
): QualiState {
  const knockout = knockoutCount(input.drivers.length);
  const segments = ctx.segments
    .filter((s) => s.start <= t)
    .map((s) => ({
      ...s,
      end: s.end !== null && s.end <= t ? s.end : null,
      running: s.running.filter((r) => r.from <= t).map((r) => ({ from: r.from, to: r.to !== null && r.to <= t ? r.to : null })),
    }));
  const deleted = new Set<string>();
  for (const d of ctx.deleted) {
    if (d.t > t) break;
    const k = `${d.driver}/${d.ms}`;
    if (d.on) deleted.add(k);
    else deleted.delete(k);
  }
  const segmentOf = (start: number) => [...segments].reverse().find((s) => s.start <= start && (s.end === null || start <= s.end)) ?? null;

  // Every lap with its segment, end (if done by t), and whether it's running at t.
  type Lap = ReplayLap & { driver: number; seg: QualiSegment | null; end: number | null; open: boolean };
  const all: Lap[] = [];
  for (const d of input.drivers) {
    const ls = (input.laps[d.number] ?? []).filter((l) => l.start !== null && l.start <= t);
    ls.forEach((l, i) => {
      const e = lapEnd(l);
      const closes = e ?? Math.min(ls[i + 1]?.start ?? Infinity, l.start! + OPEN_CAP_MS);
      all.push({ ...l, driver: d.number, seg: segmentOf(l.start!), end: e !== null && e <= t ? e : null, open: t < closes });
    });
  }
  const valid = (l: Lap) => l.end !== null && l.duration !== null && !deleted.has(`${l.driver}/${Math.round(l.duration * 1000)}`);

  const standings: QualiRow[][] = [];
  const final: boolean[] = [];
  const improvements: Improvement[] = [];
  let participants = input.drivers.map((d) => d.number);
  const outIn = new Map<number, { phase: number; position: number }>();
  let sectorBest = [Infinity, Infinity, Infinity];

  for (const seg of segments) {
    const laps = all.filter((l) => l.seg === seg && participants.includes(l.driver));
    const safe = seg.phase < 3 ? participants.length - knockout : Infinity;
    // Sector bests from sectors set by t, the push-lap yardstick and the purple marks.
    sectorBest = [0, 1, 2].map((i) => Math.min(...laps.map((l) => revealed(l, t)[i] ?? Infinity)));
    const best = new Map<number, Lap>();
    const order = () =>
      [...participants].sort((a, b) => {
        const x = best.get(a);
        const y = best.get(b);
        if (!x || !y) return x ? -1 : y ? 1 : a - b;
        return x.duration! - y.duration! || x.end! - y.end!;
      });
    for (const l of laps.filter(valid).sort((a, b) => a.end! - b.end!)) {
      const prev = best.get(l.driver);
      if (prev && prev.duration! <= l.duration!) continue;
      const before = order();
      best.set(l.driver, l);
      const after = order();
      improvements.push({
        t: l.end!,
        phase: seg.phase,
        driver: l.driver,
        time: l.duration!,
        from: prev ? before.indexOf(l.driver) + 1 : null,
        to: after.indexOf(l.driver) + 1,
        knocked: after.filter((n, i) => n !== l.driver && i >= safe && before.indexOf(n) < safe && best.has(n)),
      });
    }
    const ranked = order();
    const p1 = best.get(ranked[0]!);
    const done = seg.end !== null && !all.some((l) => l.open && l.start! <= seg.end!);
    final.push(done);
    const rows: QualiRow[] = ranked.map((n, i) => {
      const b = best.get(n);
      const own = [0, 1, 2].map((k) => Math.min(...laps.filter((l) => l.driver === n && l.end !== null).map((l) => l.sectors[k] ?? Infinity)));
      return {
        driver: n,
        position: i + 1,
        best: b?.duration ?? null,
        gap: b && p1 ? b.duration! - p1.duration! : null,
        sectors: b?.sectors ?? [null, null, null],
        sectorMark: (b?.sectors ?? [null, null, null]).map((s, k) => (s === null ? null : s <= sectorBest[k]! ? "session" : s <= own[k]! ? "personal" : null)),
        laps: laps.filter((l) => l.driver === n && l.end !== null).length,
        out: null,
        danger: i >= safe,
        state: null,
      };
    });
    const earlier = [...outIn.entries()]
      .sort((a, b) => a[1].position - b[1].position)
      .map(([n, o]): QualiRow => {
        const prev = standings[o.phase - 1]!.find((r) => r.driver === n)!;
        return { ...prev, out: o.phase, danger: false, state: null };
      });
    standings.push([...rows, ...earlier]);
    // A segment that's over decides who goes through, even before the next one has started.
    if (seg.end !== null && seg.phase < 3) {
      rows.slice(safe).forEach((r) => outIn.set(r.driver, { phase: seg.phase, position: r.position }));
      participants = ranked.slice(0, safe);
    }
  }

  const current = segments.at(-1) ?? null;
  const last = standings.at(-1) ?? [];
  // Lap state and live progress, against the current segment.
  const onLap: OnLap[] = [];
  for (const r of last) {
    const l = [...all].reverse().find((x) => x.driver === r.driver && x.open);
    if (!l || r.out !== null) continue;
    const s = revealed(l, t);
    r.state = l.pitOut ? "out" : !s.length ? "unknown" : s.every((x, i) => !(x > sectorBest[i]! * PUSH)) ? "push" : "slow";
    if (r.state !== "push" && r.state !== "unknown") continue;
    const versus = (row: QualiRow | undefined) => {
      if (!row || row.best === null || !s.length || row.sectors.slice(0, s.length).some((x) => x === null)) return null;
      return s.reduce((a, b) => a + b, 0) - row.sectors.slice(0, s.length).reduce<number>((a, b) => a + b!, 0);
    };
    const inSeg = last.filter((x) => x.out === null);
    const toP1 = versus(inSeg[0]);
    const safe = current && current.phase < 3 ? inSeg.length - knockout : null;
    const projected = toP1 !== null ? inSeg[0]!.best! + toP1 : null;
    onLap.push({
      driver: r.driver,
      sectors: s,
      toP1,
      toCutoff: safe !== null ? versus(inSeg[safe - 1]) : null,
      wouldBe: projected === null ? null : 1 + inSeg.filter((x) => x.driver !== r.driver && x.best !== null && x.best <= projected).length,
    });
  }

  let timeLeft: number | null = null;
  let clockRunning = false;
  if (current) {
    const used = current.running.reduce((a, r) => a + (r.to ?? t) - r.from, 0);
    clockRunning = current.end === null && current.running.at(-1)?.to === null;
    timeLeft = current.end !== null ? 0 : current.lengthMs - used >= 0 ? current.lengthMs - used : null;
  }

  return { segments, current, timeLeft, clockRunning, knockout, standings, final, improvements: improvements.reverse(), onLap };
}
