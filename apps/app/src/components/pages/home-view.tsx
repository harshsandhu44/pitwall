"use client";

import {
  type ConstructorStanding,
  type DriverStanding,
  lastFinishedRace,
  type LiveStatus,
  nextSession,
  type NextSession,
  type PointsProgression,
  type RaceWeekendResults,
  scheduleState,
  SESSION_LABEL,
  type Standings,
} from "@pitwall/shared";
import { ArrowRightIcon, RadioTowerIcon } from "lucide-react";
import Link from "next/link";
import { QueryState, SourceNote } from "@/components/data/query-state";
import { CircuitScene } from "@/components/racing/circuit-scene";
import { ProvisionalNote } from "@/components/racing/provisional-note";
import { RaceCountdown } from "@/components/racing/race-countdown";
import { WeatherConditions } from "@/components/weather/weather-conditions-card";
import { ConstructorStandingsTable } from "@/components/standings/constructor-standings-table";
import { DriverStandingsTable } from "@/components/standings/driver-standings-table";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/api";
import { driverName, formatDateRange, formatSessionTime } from "@/lib/format";
import { useCalendar, useNow, useSeasons } from "@/lib/hooks";
import { Arrive, useArrival } from "@/lib/motion";
import { cn } from "@/lib/utils";

// Mirrors the hero's size so nothing below it jumps when the calendar arrives.
function HeroSkeleton() {
  return <Skeleton className="h-[640px] w-full sm:h-[340px]" aria-busy="true" aria-label="Loading" />;
}

/** Shown in the hero while a session streams: the session and the top three, linking to the live page. */
function LiveBand({ live }: { live: Extract<LiveStatus, { state: "LIVE" | "DELAYED" }> }) {
  const drivers = new Map(live.timing.drivers.map((d) => [d.number, d]));
  const ref = useArrival<HTMLAnchorElement>();
  return (
    <Link ref={ref} href="/live" className="group panel-cut block space-y-4 bg-primary p-5 text-primary-foreground sm:p-6">
      <p className="flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
        <span aria-hidden className="size-2 rounded-full bg-current motion-safe:animate-live-pulse" />
        {live.state === "LIVE" ? "Live now" : `Live, delayed ${live.delaySeconds} s`}
      </p>
      <h2 className="overflow-hidden pb-1 font-display-italic text-3xl leading-[1.1] font-black tracking-tight uppercase sm:text-5xl">
        <span data-title className="block">
          {live.session.meetingName} · {live.session.name}
        </span>
      </h2>
      <ol className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-sm" aria-label="Top three">
        {live.timing.rows.slice(0, 3).map((r) => (
          <li key={r.driver}>
            P{r.position} {drivers.get(r.driver)?.acronym ?? r.driver}
          </li>
        ))}
      </ol>
      <p className="flex items-center gap-1 text-sm font-semibold underline-offset-4 group-hover:underline">
        Open live timing <ArrowRightIcon aria-hidden className="size-4" />
      </p>
    </Link>
  );
}

/** The next weekend: name, countdown, outline and the session strip. */
function Hero({ next }: { next: NextSession }) {
  const { race } = next;
  const now = useNow();
  // Polled only while the calendar says a session is in its slot, to switch the hero to the live band.
  const live = useApi<LiveStatus>(next.state === "in_window" ? "/api/live/session" : null, () => 30_000).data?.data;
  const ref = useArrival<HTMLDivElement>();
  if (live?.state === "LIVE" || live?.state === "DELAYED") return <LiveBand live={live} />;
  return (
    <div ref={ref} className="panel-cut border bg-card">
      <div className="relative grid gap-6 p-5 pl-6 sm:grid-cols-[1fr_auto] sm:p-6 sm:pl-7">
        <span aria-hidden data-stripe-y className="absolute inset-y-0 left-0 w-1 origin-top bg-live" />
        <div className="min-w-0 space-y-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Round {race.round} · {race.circuit.locality}, {race.circuit.country} · {formatDateRange(race.sessions)}
            </p>
            <h2 className="overflow-hidden pb-1 font-display-italic text-3xl leading-[1.1] font-black tracking-tight text-balance uppercase sm:text-5xl">
              <Link data-title href={`/race?season=${race.season}&round=${race.round}`} className="block hover:underline">
                {race.name}
              </Link>
            </h2>
          </div>
          <RaceCountdown next={next} className="text-4xl sm:text-5xl" />
          {next.state === "in_window" && (
            <Link href="/live" className={buttonVariants({ size: "lg" })}>
              <RadioTowerIcon aria-hidden />
              Open live timing
            </Link>
          )}
        </div>
        <CircuitScene
          circuit={race.circuit}
          start={race.sessions.find((s) => s.kind === "RACE")?.start ?? null}
          className="aspect-[16/9] w-full sm:aspect-auto sm:h-full sm:min-h-52 sm:w-72 lg:w-[28rem]"
        />
      </div>
      <ol className="grid grid-cols-2 border-t sm:grid-cols-[repeat(auto-fit,minmax(0,1fr))]" aria-label="Sessions">
        {race.sessions.map((s) => {
          const state = now === null ? "unknown" : scheduleState(s, now);
          return (
            <li key={s.kind} data-rise className={cn("space-y-0.5 border-r border-b px-4 py-3 last:border-r-0 sm:border-b-0", state === "in_window" && "bg-live/12")}>
              <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{SESSION_LABEL[s.kind]}</p>
              <p className="font-mono text-sm tabular-nums">{now === null ? "…" : formatSessionTime(s)}</p>
              <p className="text-xs text-muted-foreground">{state === "finished" ? "Done" : state === "in_window" ? "Scheduled now" : "\u00a0"}</p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** The overview is always about the newest season. */
export function HomeView() {
  const season = useSeasons().data?.data?.[0] ?? null;
  const calendar = useCalendar(season);
  const now = useNow();
  const q = (path: string) => (season ? `${path}${path.includes("?") ? "&" : "?"}season=${season}` : null);
  const drivers = useApi<Standings<DriverStanding>>(q("/api/standings/drivers"));
  const constructors = useApi<Standings<ConstructorStanding>>(q("/api/standings/constructors"));
  const driverProgression = useApi<PointsProgression>(q("/api/standings/progression?type=drivers"));
  const constructorProgression = useApi<PointsProgression>(q("/api/standings/progression?type=constructors"));
  const last = calendar.data?.data && now !== null ? lastFinishedRace(calendar.data.data, now) : null;
  const nextRace = calendar.data?.data && now !== null ? (nextSession(calendar.data.data, now)?.race ?? null) : null;
  const recent = useApi<RaceWeekendResults>(last ? `/api/races/${last.round}?season=${last.season}` : null);
  // Also true while the season is still unknown (the calendar query is idle until then).
  const calendarLoading = calendar.isPending || now === null;

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Pitwall home</h1>
      {calendarLoading ? (
        <HeroSkeleton />
      ) : (
        <QueryState query={calendar}>
          {(races) => {
            const next = nextSession(races, now);
            return next ? (
              <Hero next={next} />
            ) : (
              <p className="border p-6 text-sm text-muted-foreground">The {season} season is complete. The next calendar hasn&apos;t been published yet.</p>
            );
          }}
        </QueryState>
      )}
      <Arrive className="grid gap-4 md:grid-cols-2">
      <Card data-rise>
        <CardHeader>
          <CardDescription>Weather</CardDescription>
          <CardTitle>{nextRace ? nextRace.circuit.locality : "—"}</CardTitle>
          {nextRace && (
            <CardAction>
              <Link href={`/race?season=${nextRace.season}&round=${nextRace.round}&tab=weather`} className="text-xs hover:underline">Weather detail</Link>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {nextRace ? (
            <WeatherConditions race={nextRace} />
          ) : calendarLoading ? (
            <Skeleton className="h-[229px] w-full" />
          ) : (
            <p className="text-sm text-muted-foreground">No upcoming race to forecast.</p>
          )}
        </CardContent>
      </Card>

      <Card data-rise>
        <CardHeader>
          <CardDescription>Most recent race</CardDescription>
          <CardTitle>{last?.name ?? "—"}</CardTitle>
        </CardHeader>
        <CardContent>
          {!last ? (
            calendarLoading ? <Skeleton className="h-[130px] w-full" /> : <p className="text-sm text-muted-foreground">No race has finished yet this season.</p>
          ) : (
            <QueryState query={recent} loading={<Skeleton className="h-[130px] w-full" />}>
              {(r, res) =>
                !r.results.length ? (
                  <p className="text-sm text-muted-foreground">Results haven&apos;t been published yet.</p>
                ) : (
                  <div className="space-y-3">
                    <ProvisionalNote race={r.race} />
                    <ol className="space-y-1.5" aria-label="Podium">
                      {r.results.slice(0, 3).map((e) => (
                        <li key={e.driver.id} className="flex items-baseline gap-2 text-sm">
                          <span className="w-5 font-mono text-muted-foreground tabular-nums">P{e.positionText}</span>
                          {e.driver.id ? (
                            <Link href={`/driver?id=${e.driver.id}&season=${r.race.season}`} className="flex-1 font-medium hover:underline">
                              {driverName(e.driver)}
                            </Link>
                          ) : (
                            <span className="flex-1 font-medium">{driverName(e.driver)}</span>
                          )}
                          <span className="font-mono text-xs text-muted-foreground tabular-nums">{e.time ?? e.status}</span>
                        </li>
                      ))}
                    </ol>
                    {(() => {
                      const fl = r.results.find((e) => e.fastestLap?.rank === 1);
                      return fl?.fastestLap?.time ? (
                        <p className="text-xs text-muted-foreground">
                          Fastest lap:{" "}
                          {fl.driver.id ? (
                            <Link href={`/driver?id=${fl.driver.id}&season=${r.race.season}`} className="text-foreground hover:underline">
                              {driverName(fl.driver)}
                            </Link>
                          ) : (
                            <span className="text-foreground">{driverName(fl.driver)}</span>
                          )}{" "}
                          <span className="font-mono tabular-nums">{fl.fastestLap.time}</span> (lap {fl.fastestLap.lap ?? "?"})
                        </p>
                      ) : null;
                    })()}
                    <SourceNote res={res} />
                  </div>
                )
              }
            </QueryState>
          )}
        </CardContent>
        {(last || calendarLoading) && (
          <CardFooter>
            {last ? (
              <Link href={`/race?season=${last.season}&round=${last.round}`} className="flex items-center gap-1 text-xs hover:underline">
                Full results <ArrowRightIcon aria-hidden className="size-3" />
              </Link>
            ) : (
              <Skeleton className="h-4 w-24" />
            )}
          </CardFooter>
        )}
      </Card>

      </Arrive>
      <Arrive className="grid gap-4 md:grid-cols-2">
      <Card data-rise>
        <CardHeader>
          <CardDescription>{season} championship</CardDescription>
          <CardTitle>Drivers</CardTitle>
          <CardAction>
            <Link href={`/standings?season=${season ?? ""}`} className="text-xs hover:underline">Full standings</Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          {drivers.isPending ? (
            // Mobile rows are taller: the team name sits under the driver.
            <Skeleton className="h-[304px] w-full sm:h-[230px]" />
          ) : (
            <QueryState query={drivers}>
              {(s, res) => (
                <div className="space-y-2">
                  <DriverStandingsTable standings={s} progression={driverProgression.data?.data ?? undefined} limit={5} />
                  <SourceNote res={res} />
                </div>
              )}
            </QueryState>
          )}
        </CardContent>
      </Card>

      <Card data-rise>
        <CardHeader>
          <CardDescription>{season} championship</CardDescription>
          <CardTitle>Constructors</CardTitle>
          <CardAction>
            <Link href={`/standings?season=${season ?? ""}&view=constructors`} className="text-xs hover:underline">Full standings</Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          {constructors.isPending ? (
            <Skeleton className="h-[230px] w-full" />
          ) : (
            <QueryState query={constructors}>
              {(s, res) => (
                <div className="space-y-2">
                  <ConstructorStandingsTable standings={s} progression={constructorProgression.data?.data ?? undefined} limit={5} />
                  <SourceNote res={res} />
                </div>
              )}
            </QueryState>
          )}
        </CardContent>
      </Card>
      </Arrive>
    </div>
  );
}
