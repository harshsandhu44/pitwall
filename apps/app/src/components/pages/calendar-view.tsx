"use client";

import { scheduleState } from "@pitwall/shared";
import Link from "next/link";
import { QueryState, SourceNote } from "@/components/data/query-state";
import { CircuitOutline } from "@/components/racing/circuit-outline";
import { Badge } from "@/components/ui/badge";
import { formatDateRange } from "@/lib/format";
import { useCalendar, useNow, useSeason } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export function CalendarView() {
  const { season } = useSeason();
  const calendar = useCalendar(season);
  const now = useNow();
  return (
    <QueryState query={calendar}>
      {(races, res) => {
        const nextRound =
          now === null ? null : races.find((r) => r.sessions.some((s) => ["upcoming", "in_window"].includes(scheduleState(s, now))))?.round;
        return (
          <div className="space-y-3">
            <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {races.map((race) => {
                const raceSession = race.sessions.find((s) => s.kind === "RACE")!;
                const done = now !== null && scheduleState(raceSession, now) === "finished";
                const isNext = race.round === nextRound;
                return (
                  <li key={race.round}>
                    <Link
                      href={`/race?season=${race.season}&round=${race.round}`}
                      className={cn(
                        "flex h-full gap-3 border bg-card p-3 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50",
                        isNext && "border-l-4 border-live bg-live/8",
                        done && "text-muted-foreground",
                      )}
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground tabular-nums">R{String(race.round).padStart(2, "0")}</span>
                          {isNext && <Badge>Next</Badge>}
                          {done && <Badge variant="secondary">Completed</Badge>}
                          {race.sessions.some((s) => s.kind === "SPRINT") && <Badge variant="outline">Sprint</Badge>}
                        </div>
                        <p className={cn("truncate font-semibold", !done && "text-foreground")}>{race.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {race.circuit.locality}, {race.circuit.country}
                        </p>
                        <p className="font-mono text-xs tabular-nums">{formatDateRange(race.sessions)}</p>
                      </div>
                      <CircuitOutline circuit={race.circuit} className="w-16 shrink-0 self-center" />
                    </Link>
                  </li>
                );
              })}
            </ol>
            {!races.length && <p className="text-sm text-muted-foreground">No races published for {season}.</p>}
            <SourceNote res={res} />
          </div>
        );
      }}
    </QueryState>
  );
}
