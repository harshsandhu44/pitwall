"use client";

import { type LiveTimingSnapshot, type SessionReplay, stewardsAt, type StewardsKind, type TrackStatus, trackStatus } from "@pitwall/shared";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { type AlertKind, chime, say, unlock, type Voice } from "@/lib/sounds";

export interface Alert {
  kind: AlertKind;
  voice: Voice;
  title: string;
  body: string;
  /** Collapses repeats of the same notification. */
  tag: string;
}

const STEWARDS: Partial<Record<StewardsKind, [string, Voice]>> = {
  penalty: ["Penalty", "penalty"],
  investigation: ["Investigation", "investigation"],
  cleared: ["No further action", "cleared"],
};

/** The spoken status: its kind, told apart where race control says more (double yellow, SC or VSC ending). */
const statusVoice = (s: TrackStatus): Voice =>
  s.kind === "sc" && s.label !== "Safety car" ? "sc-ending"
  : s.kind === "vsc" && s.label !== "Virtual safety car" ? "vsc-ending"
  : s.kind === "yellow" && s.label.startsWith("Double") ? "double-yellow"
  : s.kind;
// The chime for a poll with several alerts: the most important one.
const PRIORITY: AlertKind[] = ["neutral", "flag", "stewards", "radio"];

/** What alerts read: a live snapshot, or a replay as it stood at the playback position. */
export type AlertView = Pick<LiveTimingSnapshot, "drivers" | "raceControl"> &
  Partial<Pick<LiveTimingSnapshot, "status" | "stewards" | "radio">> & { session: { key: number; name: string } };

// Status, stewards and radio may be missing: a live DO can serve the previous API version for minutes after
// a deploy, and replays derive them from race control.
const read = (s: AlertView) => ({
  status: s.status ?? trackStatus(s.raceControl, Infinity),
  stewards: stewardsAt(s.stewards ?? s.raceControl, Infinity),
  radio: s.radio ?? [],
});

/** A replay as it stood at `t`. */
const replayAt = (r: SessionReplay, t: number): AlertView => ({
  session: r.session,
  drivers: r.drivers,
  raceControl: r.raceControl.filter((m) => m.t <= t),
  radio: (r.radio ?? []).filter((c) => c.t <= t), // replays cached before radio have none
});

/**
 * What changed between two polls worth an alert: the track status (green, yellow, double yellow, VSC, SC and
 * their endings, red, chequered; not every sector yellow), new stewards' penalties, investigations and
 * clearances, and new team-radio clips. Most important first.
 */
export function alertsBetween(prev: AlertView, next: AlertView): Alert[] {
  const [a, b] = [read(prev), read(next)];
  const out: Alert[] = [];
  const voice = statusVoice(b.status);
  if (statusVoice(a.status) !== voice) {
    out.push({ kind: ["sc", "vsc", "red"].includes(b.status.kind) ? "neutral" : "flag", voice, title: b.status.label, body: next.session.name, tag: "track" });
  }
  const seen = new Set(a.stewards.map((i) => `${i.t}/${i.text}`));
  for (const i of b.stewards) {
    const [title, voice] = STEWARDS[i.kind] ?? [];
    if (title && voice && !seen.has(`${i.t}/${i.text}`)) out.push({ kind: "stewards", voice, title, body: i.text, tag: `stewards/${i.t}/${i.text}` });
  }
  const heard = new Set(a.radio.map((c) => `${c.t}/${c.driver}`));
  const drivers = new Map(next.drivers.map((d) => [d.number, d]));
  for (const c of b.radio) {
    if (heard.has(`${c.t}/${c.driver}`)) continue;
    out.push({ kind: "radio", voice: "radio", title: `Team radio · ${drivers.get(c.driver)?.acronym ?? c.driver}`, body: "New clip in the Team radio panel", tag: `radio/${c.t}/${c.driver}` });
  }
  return out.sort((x, y) => PRIORITY.indexOf(x.kind) - PRIORITY.indexOf(y.kind));
}

export type AlertMode = "off" | "chime" | "voice";

// Off by default; one setting for the live and replay pages. "on" is what the first version saved.
const KEY = "pitwall.alerts.v1";
const listeners = new Set<() => void>();
let mode: AlertMode | null = null;
function readMode(): AlertMode {
  if (mode === null) {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {
      // storage blocked: off
    }
    mode = saved === "voice" ? "voice" : saved === "chime" || saved === "on" ? "chime" : "off";
  }
  return mode;
}

export const useAlertMode = () =>
  useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    readMode,
    (): AlertMode => "off",
  );

/** Called from a click, so audio unlocks and the permission prompt is allowed. Plays a sample of the choice. */
export function setAlertMode(next: AlertMode) {
  if (next !== "off") {
    unlock();
    const ms = chime("flag");
    if (next === "voice") say("green", ms + 100);
    if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission().catch(() => {});
  }
  mode = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // per-viewer convenience only
  }
  for (const l of listeners) l();
}

// Saved as on from an earlier visit: audio stays locked until the first click or key on the page.
function useUnlockOnGesture(on: boolean) {
  useEffect(() => {
    if (!on) return;
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [on]);
}

/** One chime (then its clip, with voice on) for the most important alert; a notification for each while the tab is in the background. */
function fire(alerts: Alert[], mode: AlertMode) {
  const top = alerts[0];
  if (!top) return;
  const ms = chime(top.kind);
  if (mode === "voice") say(top.voice, ms + 100);
  if (!document.hidden || typeof Notification === "undefined" || Notification.permission !== "granted") return;
  for (const a of alerts) new Notification(a.title, { body: a.body, tag: a.tag });
}

/** Alerts for what changed since the previous poll. The first poll seen stays silent. */
export function useLiveAlerts(t: LiveTimingSnapshot) {
  const mode = useAlertMode();
  useUnlockOnGesture(mode !== "off");
  const prev = useRef<LiveTimingSnapshot | null>(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = t;
    if (mode !== "off" && before && before.session.key === t.session.key) fire(alertsBetween(before, t), mode);
  }, [t, mode]);
}

/** Longest step of the playback position that still counts as playing through, not a seek. */
const REPLAY_STEP_MS = 5_000;

/** Alerts as playback passes each event. Seeks, jumps and paused scrubbing stay silent. */
export function useReplayAlerts(replay: SessionReplay, t: number, playing: boolean) {
  const mode = useAlertMode();
  useUnlockOnGesture(mode !== "off");
  const prev = useRef<number | null>(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = t;
    if (mode === "off" || !playing || before === null || t <= before || t - before > REPLAY_STEP_MS) return;
    fire(alertsBetween(replayAt(replay, before), replayAt(replay, t)), mode);
  }, [replay, t, mode, playing]);
}
