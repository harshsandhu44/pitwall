import type { TimingRow, TrackStatus } from "./replay";
import type { GrandPrix, PositionWindow, ReplayDriver, ReplaySession, SessionReplay, WeekendSession } from "./types";

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
  /** Newest last; the latest 20 only. */
  raceControl: SessionReplay["raceControl"];
  /** Flag and safety-car state, judged from every race-control message so far (not just the 20 sent). */
  status: TrackStatus;
  /** Outline from an earlier session of the same meeting (same coordinate space); null for the weekend's first. */
  track: SessionReplay["track"];
  /** The newest track-side weather observation (OpenF1 publishes about one a minute); empty until the first. */
  weather: SessionReplay["weather"];
  /** Car locations over the last ~10 s, ending at the newest sample. */
  positions: PositionWindow;
}

/** Older than this, live data is shown as DELAYED. */
export const LIVE_MAX_AGE_MS = 15_000;
