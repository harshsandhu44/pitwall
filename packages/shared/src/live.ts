import type { TimingRow } from "./replay";
import type { GrandPrix, ReplaySession, WeekendSession } from "./types";

// ---- Live timing contract ----
// Provider-independent shapes a live adapter would fill. No adapter exists: OpenF1 live data is paid
// and Formula 1's own timing feed isn't licensed for redistribution, so the API only ever reports
// UNAVAILABLE. Recorded data is REPLAY and must never be labelled LIVE or DELAYED.

export type LiveState = "LIVE" | "DELAYED" | "REPLAY" | "UNAVAILABLE";

export interface LiveSessionRef {
  key: number;
  meetingName: string;
  name: string;
}

export type LiveStatus =
  | { state: "LIVE" | "DELAYED"; session: LiveSessionRef; observedAt: string; delaySeconds: number }
  | { state: "REPLAY"; replay: ReplaySession }
  | {
      state: "UNAVAILABLE";
      reason: "no_permitted_free_source";
      detail: string;
      /** From the published calendar; `inWindow` means the slot is open, not that the session is confirmed running. */
      next: { race: GrandPrix; session: WeekendSession; inWindow: boolean } | null;
      latestReplay: ReplaySession | null;
    };

/** Every snapshot carries the source's observation time; freshness is judged from it, never from fetch time. */
export interface LiveTimingSnapshot {
  session: LiveSessionRef;
  observedAt: string;
  lap: number | null;
  totalLaps: number | null;
  trackStatus: string | null;
  rows: TimingRow[];
}

export interface LivePositionsSnapshot {
  session: LiveSessionRef;
  observedAt: string;
  cars: { driver: number; x: number; y: number; t: string }[];
}

export const LIVE_UNAVAILABLE_DETAIL =
  "No free source permits redistributing live Formula 1 timing. OpenF1 live data needs a paid subscription and Formula 1's own feed isn't licensed for reuse, so Pitwall shows recorded replays instead.";
