import type { SessionReplay } from "./types";

type Message = SessionReplay["raceControl"][number];

export type StewardsKind = "penalty" | "served" | "investigation" | "cleared" | "deleted" | "warning";

export interface StewardsItem {
  t: number;
  lap: number | null;
  kind: StewardsKind;
  /** Car numbers named in the message. */
  drivers: number[];
  text: string;
}

// Order matters: "PENALTY SERVED - 5 SECOND TIME PENALTY" is served, a "NO FURTHER ACTION" correction is cleared.
const KINDS: [StewardsKind, RegExp][] = [
  ["served", /PENALTY SERVED/],
  ["cleared", /NO FURTHER (ACTION|INVESTIGATION)/],
  ["penalty", /PENALTY FOR|DISQUALIFIED|REPRIMAND/],
  ["deleted", /\bDELETED\b/],
  ["warning", /BLACK AND WHITE FLAG/],
  ["investigation", /UNDER INVESTIGATION|WILL BE INVESTIGATED|\bNOTED\b/],
];

const kindOf = (message: string) => KINDS.find(([, re]) => re.test(message))?.[0] ?? null;

/** Stewards' decisions, race-director notes, deleted laps and black-and-white flags. */
export const isStewards = (m: Message) => kindOf(m.message) !== null;

/** Stewards' items published at or before `t`, oldest first. */
export function stewardsAt(messages: Message[], t: number): StewardsItem[] {
  const out: StewardsItem[] = [];
  for (const m of messages) {
    if (m.t > t) break;
    const kind = kindOf(m.message);
    if (!kind) continue;
    const drivers = [...m.message.matchAll(/\b(\d{1,2}) \([A-Z]{3}\)/g)].map((x) => Number(x[1]));
    out.push({ t: m.t, lap: m.lap, kind, drivers: drivers.length ? drivers : m.driver !== null ? [m.driver] : [], text: m.message.replace(/^FIA STEWARDS: /, "") });
  }
  return out;
}

const penaltyOf = (text: string) => {
  if (/GRID/.test(text)) return null; // served at a later race
  const seconds = Number(/(\d+) SECOND TIME PENALTY/.exec(text)?.[1]) || 0;
  const other = /DRIVE THROUGH/.test(text) ? "DT" : /STOP ?(\/|AND)? ?GO/.test(text) ? "SG" : /DISQUALIFIED/.test(text) ? "DSQ" : null;
  return seconds || other ? { seconds, other } : null;
};

/** Time and drive-through/stop-go penalties not yet served, per car. Grid penalties and reprimands are left out. */
export function pendingPenalties(items: StewardsItem[]) {
  const out = new Map<number, { seconds: number; other: string[] }>();
  for (const i of items) {
    const p = (i.kind === "penalty" || i.kind === "served") && penaltyOf(i.text);
    const car = i.drivers[0];
    if (!p || car === undefined) continue;
    const cur = out.get(car) ?? { seconds: 0, other: [] };
    const sign = i.kind === "served" ? -1 : 1;
    cur.seconds = Math.max(0, cur.seconds + sign * p.seconds);
    if (p.other) {
      const at = cur.other.indexOf(p.other);
      if (sign > 0) cur.other.push(p.other);
      else if (at >= 0) cur.other.splice(at, 1);
    }
    if (cur.seconds || cur.other.length) out.set(car, cur);
    else out.delete(car);
  }
  return out;
}

/** "+10s", "DT", "+5s DT"; null when nothing is pending. */
export const penaltyLabel = (p: { seconds: number; other: string[] } | undefined) =>
  p ? [p.seconds ? `+${p.seconds}s` : "", ...p.other].filter(Boolean).join(" ") || null : null;
