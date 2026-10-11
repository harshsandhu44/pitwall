import type { TimingRow } from "./replay";
import type { GrandPrix, ReplayDriver, ReplaySession, SessionReplay, WeekendSession } from "./types";

// ---- Live timing contract ----
// Live data comes from OpenF1's sponsor feed through one shared connection in the API. Recorded data is
// REPLAY and must never be labelled LIVE or DELAYED.

export type LiveState = "LIVE" | "DELAYED" | "REPLAY" | "UNAVAILABLE";

export interface LiveSessionRef {
  key: number;
  meetingName: string;
  name: string;
}

/** No session in its live window; in one but no timing yet; or the live feed can't be reached. */
export type LiveUnavailableReason = "no_session" | "no_data_yet" | "feed_unavailable";

export type LiveStatus =
  | { state: "LIVE" | "DELAYED"; session: LiveSessionRef; observedAt: string; delaySeconds: number; timing: LiveTimingSnapshot }
  | { state: "REPLAY"; replay: ReplaySession }
  | {
      state: "UNAVAILABLE";
      reason: LiveUnavailableReason;
      detail: string;
      /** From the published calendar; `inWindow` means the slot is open, not that the session is confirmed running. */
      next: { race: GrandPrix; session: WeekendSession; inWindow: boolean } | null;
      latestReplay: ReplaySession | null;
    };

/** Every snapshot carries the source's observation time; freshness is judged from it, never from fetch time. */
export interface LiveTimingSnapshot {
  session: LiveSessionRef & { type: string };
  observedAt: string;
  drivers: ReplayDriver[];
  rows: TimingRow[];
  /** Newest last. */
  raceControl: SessionReplay["raceControl"];
}

export interface LivePositionsSnapshot {
  session: LiveSessionRef;
  observedAt: string;
  cars: { driver: number; x: number; y: number; t: string }[];
}

/** Older than this, live data is shown as DELAYED. */
export const LIVE_MAX_AGE_MS = 15_000;
