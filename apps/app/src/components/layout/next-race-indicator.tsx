"use client";

import { nextSession, SESSION_LABEL } from "@pitwall/shared";
import Link from "next/link";
import { formatCountdown } from "@/lib/format";
import { useCalendar, useNow, useSeasons } from "@/lib/hooks";

/** Always about the newest season, regardless of the season being browsed. */
export function NextRaceIndicator() {
  const latest = useSeasons().data?.data?.[0] ?? null;
  const calendar = useCalendar(latest);
  const now = useNow();
  if (now === null || !calendar.data) return null;
  const next = nextSession(calendar.data.data ?? [], now);
  if (!next) return null;
  const { race, session, state } = next;
  return (
    <Link
      href={`/race?season=${race.season}&round=${race.round}`}
      className="hidden min-w-0 items-center gap-2 truncate rounded-md px-2 py-1 text-xs hover:bg-muted lg:flex"
    >
      <span className="truncate text-muted-foreground">{race.name}</span>
      <span className="font-medium">{SESSION_LABEL[session.kind]}</span>
      <span className="font-mono tabular-nums">
        {state === "in_window" ? "scheduled now" : session.start ? `in ${formatCountdown(Date.parse(session.start) - now)}` : session.date}
      </span>
    </Link>
  );
}
