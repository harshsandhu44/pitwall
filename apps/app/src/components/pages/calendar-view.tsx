"use client";

import { PreviewCard } from "@base-ui/react/preview-card";
import { type ClassificationEntry, finalAt, type GrandPrix, type RaceWeekendResults, scheduleState } from "@pitwall/shared";
import Link from "next/link";
import { type ReactElement, useRef } from "react";
import { QueryState, SourceNote } from "@/components/data/query-state";
import { CircuitOutline } from "@/components/racing/circuit-outline";
import { TeamMark } from "@/components/racing/team-mark";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/api";
import { driverName, formatDateRange, formatSessionTime } from "@/lib/format";
import { useCalendar, useNow, useSeason } from "@/lib/hooks";
import { Arrive } from "@/lib/motion";
import { cn } from "@/lib/utils";

function Podium({ title, entries, season }: { title: string; entries: ClassificationEntry[]; season: number }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{title}</p>
      {entries.length ? (
        <ol className="space-y-1" aria-label={`${title} podium`}>
          {entries.slice(0, 3).map((e) => (
            <li key={e.driver.id || e.number} className="flex items-baseline gap-2 text-sm">
              <span className={cn("w-4 font-mono tabular-nums", e.positionText === "1" ? "font-bold text-live" : "text-muted-foreground")}>{e.positionText}</span>
              <span className="min-w-0 flex-1 truncate font-medium">
                <TeamMark id={e.constructor.id} season={season} />
                {driverName(e.driver)}
              </span>
              <span className="font-mono text-xs text-muted-foreground tabular-nums">{e.time ?? e.status}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">No results yet.</p>
      )}
    </div>
  );
}

/** Mounted only while the preview is open, so each round is fetched on first hover (the race page reuses it). */
function Podiums({ race }: { race: GrandPrix }) {
  const weekend = useApi<RaceWeekendResults>(`/api/races/${race.round}?season=${race.season}`);
  const now = useNow();
  return (
    <QueryState query={weekend} loading={<Skeleton className="h-36 w-full" aria-busy="true" aria-label="Loading" />}>
      {(r) => (
        <div className="space-y-3">
          <Podium title="Grand Prix" entries={r.results} season={race.season} />
          {race.sessions.some((s) => s.kind === "SPRINT") && <Podium title="Sprint" entries={r.sprint} season={race.season} />}
          {now !== null && now < finalAt(race) && <Badge variant="outline">Provisional</Badge>}
        </div>
      )}
    </QueryState>
  );
}

/** Hover or focus preview of the weekend's podiums. Mouse and keyboard only: on touch the card just links. */
function PodiumPreview({ race, children }: { race: GrandPrix; children: ReactElement }) {
  return (
    <PreviewCard.Root>
      <PreviewCard.Trigger delay={300} render={children} />
      <PreviewCard.Portal>
        <PreviewCard.Positioner sideOffset={8} className="isolate z-50">
          <PreviewCard.Popup className="w-72 origin-(--transform-origin) border bg-popover p-3 text-popover-foreground shadow-md transition-[transform,opacity] duration-150 data-ending-style:scale-98 data-ending-style:opacity-0 data-starting-style:scale-98 data-starting-style:opacity-0 motion-reduce:transition-none">
            <Podiums race={race} />
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  );
}

export function CalendarView() {
  const { season } = useSeason();
  // Late in the season the next race is a long scroll down on phones: start there, once per visit.
  const scrolled = useRef(false);
  const scrollToNext = (el: HTMLLIElement | null) => {
    if (!el || scrolled.current) return;
    scrolled.current = true;
    if (el.getBoundingClientRect().bottom > window.innerHeight) el.scrollIntoView?.({ block: "center" });
  };
  const calendar = useCalendar(season);
  const now = useNow();
  return (
    <QueryState query={calendar}>
      {(races, res) => {
        const nextRound =
          now === null ? null : races.find((r) => r.sessions.some((s) => ["upcoming", "in_window"].includes(scheduleState(s, now))))?.round;
        return (
          <Arrive className="space-y-3">
            <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {races.map((race) => {
                const raceSession = race.sessions.find((s) => s.kind === "RACE")!;
                const done = now !== null && scheduleState(raceSession, now) === "finished";
                const isNext = race.round === nextRound;
                const scored =
                  now !== null && race.sessions.some((s) => (s.kind === "RACE" || s.kind === "SPRINT") && scheduleState(s, now) === "finished");
                const card = (
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
                      <p className="font-mono text-xs text-muted-foreground tabular-nums">
                        Race {now === null ? "…" : formatSessionTime(raceSession)}
                      </p>
                    </div>
                    <CircuitOutline circuit={race.circuit} className="w-16 shrink-0 self-center" />
                  </Link>
                );
                return (
                  <li key={race.round} ref={isNext ? scrollToNext : undefined} data-rise>
                    {scored ? <PodiumPreview race={race}>{card}</PodiumPreview> : card}
                  </li>
                );
              })}
            </ol>
            {!races.length && <p className="text-sm text-muted-foreground">No races published for {season}.</p>}
            <SourceNote res={res} />
          </Arrive>
        );
      }}
    </QueryState>
  );
}
