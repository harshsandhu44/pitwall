"use client";

import {
  type ConstructorStanding,
  type DriverStanding,
  lastFinishedRace,
  nextSession,
  type PointsProgression,
  type RaceWeekendResults,
  type Standings,
} from "@pitwall/shared";
import { ArrowRightIcon, TimerIcon } from "lucide-react";
import Link from "next/link";
import { QueryState, SourceNote } from "@/components/data/query-state";
import { CircuitOutline } from "@/components/racing/circuit-outline";
import { ProvisionalNote } from "@/components/racing/provisional-note";
import { RaceCountdown } from "@/components/racing/race-countdown";
import { SessionSchedule } from "@/components/racing/session-schedule";
import { WeatherConditions } from "@/components/weather/weather-conditions-card";
import { ConstructorStandingsTable } from "@/components/standings/constructor-standings-table";
import { DriverStandingsTable } from "@/components/standings/driver-standings-table";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/api";
import { driverName, formatDateRange } from "@/lib/format";
import { useCalendar, useNow, useSeasons } from "@/lib/hooks";

// Placeholders mirror the loaded cards' sizes (mobile / desktop) so nothing below them jumps when data arrives.
function NextUpSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          <div className="space-y-1">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-9 w-full sm:h-4" />
          </div>
          <Skeleton className="h-[52px] w-40" />
        </div>
        <Skeleton className="mx-auto size-32 sm:size-40" />
      </div>
      {/* Header row + five sessions */}
      <Skeleton className="h-[181px] w-full" />
      <Skeleton className="h-[18px] w-32" />
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
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardDescription>Next up</CardDescription>
          <CardTitle>Grand Prix weekend</CardTitle>
        </CardHeader>
        <CardContent>
          {calendarLoading ? (
            <NextUpSkeleton />
          ) : (
            <QueryState query={calendar}>
              {(races, res) => {
                const next = nextSession(races, now);
                if (!next) return <p className="text-sm text-muted-foreground">The {season} season is complete. The next calendar hasn&apos;t been published yet.</p>;
                const { race } = next;
                return (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                      <div className="space-y-3">
                        <div>
                          <Link href={`/race?season=${race.season}&round=${race.round}`} className="text-lg font-semibold hover:underline">
                            {race.name}
                          </Link>
                          <p className="text-sm text-muted-foreground">
                            Round {race.round} · {race.circuit.name}, {race.circuit.locality}, {race.circuit.country} · {formatDateRange(race.sessions)}
                          </p>
                        </div>
                        <RaceCountdown next={next} />
                        {next.state === "in_window" && (
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <TimerIcon aria-hidden className="size-3.5" />
                            <span>
                              Live timing isn&apos;t available from any free, permitted source.{" "}
                              <Link href="/live" className="font-medium text-foreground underline">
                                Live status and latest replay
                              </Link>
                            </span>
                          </p>
                        )}
                      </div>
                      <CircuitOutline circuit={race.circuit} className="mx-auto w-32 sm:w-40" />
                    </div>
                    <SessionSchedule race={race} />
                    <SourceNote res={res} />
                  </div>
                );
              }}
            </QueryState>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardDescription>Weather</CardDescription>
          <CardTitle>{nextRace ? nextRace.circuit.locality : "—"}</CardTitle>
          {nextRace && (
            <CardAction>
              <Link href={`/weather?round=${nextRace.round}`} className="text-xs hover:underline">Weather detail</Link>
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

      <Card>
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
                          <span className="flex-1 font-medium">{driverName(e.driver)}</span>
                          <span className="font-mono text-xs text-muted-foreground tabular-nums">{e.time ?? e.status}</span>
                        </li>
                      ))}
                    </ol>
                    {(() => {
                      const fl = r.results.find((e) => e.fastestLap?.rank === 1);
                      return fl?.fastestLap?.time ? (
                        <p className="text-xs text-muted-foreground">
                          Fastest lap: <span className="text-foreground">{driverName(fl.driver)}</span>{" "}
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

      <Card>
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

      <Card>
        <CardHeader>
          <CardDescription>{season} championship</CardDescription>
          <CardTitle>Constructors</CardTitle>
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
    </div>
  );
}
