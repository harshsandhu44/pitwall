import type { GrandPrix, SessionKind, WeekendSession } from "./types";

/** Typical session lengths, used only to decide whether a session is "probably underway". */
const DURATION_MIN: Record<SessionKind, number> = {
  FP1: 60,
  FP2: 60,
  FP3: 60,
  SPRINT_QUALIFYING: 45,
  SPRINT: 60,
  QUALIFYING: 60,
  RACE: 120,
};

export const SESSION_LABEL: Record<SessionKind, string> = {
  FP1: "Practice 1",
  FP2: "Practice 2",
  FP3: "Practice 3",
  SPRINT_QUALIFYING: "Sprint Qualifying",
  SPRINT: "Sprint",
  QUALIFYING: "Qualifying",
  RACE: "Race",
};

export type ScheduleState = "upcoming" | "in_window" | "finished" | "unknown";

/**
 * Where a session sits relative to `now`, based on the published schedule only.
 * "in_window" means the scheduled slot is open — not a confirmation the session is running.
 */
export function scheduleState(s: WeekendSession, now: number = Date.now()): ScheduleState {
  if (!s.start) return "unknown";
  const start = Date.parse(s.start);
  const end = start + DURATION_MIN[s.kind] * 60_000;
  if (now < start) return "upcoming";
  if (now < end) return "in_window";
  return "finished";
}

export interface NextSession {
  race: GrandPrix;
  session: WeekendSession;
  state: "upcoming" | "in_window";
}

/** First session in the calendar that is in its window or still upcoming. */
export function nextSession(calendar: GrandPrix[], now: number = Date.now()): NextSession | null {
  for (const race of calendar) {
    for (const session of race.sessions) {
      const state = scheduleState(session, now);
      if (state === "upcoming" || state === "in_window") return { race, session, state };
    }
  }
  return null;
}

/** Most recent race whose RACE session has finished per the schedule. */
export function lastFinishedRace(calendar: GrandPrix[], now: number = Date.now()): GrandPrix | null {
  let last: GrandPrix | null = null;
  for (const race of calendar) {
    const r = race.sessions.find((s) => s.kind === "RACE");
    if (r && scheduleState(r, now) === "finished") last = race;
  }
  return last;
}
