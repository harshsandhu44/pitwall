"use client";

import type { LiveStatus, LiveTimingSnapshot } from "@pitwall/shared";
import { nextSession, penaltyLabel, pendingPenalties, SESSION_LABEL, stewardsAt, trackStatus } from "@pitwall/shared";
import { BoxIcon, CalendarDaysIcon, HistoryIcon, RadioTowerIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorState, QueryState, SourceNote } from "@/components/data/query-state";
import { PanelGrid } from "@/components/dashboard/panel-grid";
import { PRESETS } from "@/components/dashboard/presets";
import { PageHeader } from "@/components/pages/page-header";
import { RaceCountdown } from "@/components/racing/race-countdown";
import { Championship } from "@/components/replay/championship";
import { DriverComparison } from "@/components/replay/driver-comparison";
import { DriverFocus } from "@/components/replay/driver-focus";
import { Penalties } from "@/components/replay/penalties";
import { RaceControlFeed } from "@/components/replay/race-control-feed";
import { SessionStatus } from "@/components/replay/session-status";
import { TimingTower, TowerColumnsMenu } from "@/components/replay/timing-tower";
import { battlesOf, TrackCanvas } from "@/components/replay/track-canvas";
import { TrackWeather } from "@/components/replay/track-weather";
import { TyreStrip } from "@/components/replay/tyre-strip";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/api";
import { formatSessionTime } from "@/lib/format";
import { useCalendar, useNow, useSeasons } from "@/lib/hooks";

export const streaming = (s: LiveStatus | undefined) => s?.state === "LIVE" || s?.state === "DELAYED";
const liveTitle = (s: LiveStatus) => (s.state === "LIVE" || s.state === "DELAYED" ? `${s.session.meetingName} · ${s.session.name}` : "Live");

/** Live timing from OpenF1 while a session is on; otherwise what's next and the latest replay. */
export function LiveView() {
  // Every 3 s while a session streams; every 30 s otherwise, to notice when one starts.
  const status = useApi<LiveStatus>("/api/live/session", (res) => (streaming(res?.data ?? undefined) ? 3_000 : 30_000));
  const on = streaming(status.data?.data ?? undefined);
  // The weekend a streaming session belongs to is the calendar's in-window race (no extra requests: the header loads it).
  const calendar = useCalendar(useSeasons().data?.data?.[0] ?? null);
  const now = useNow();
  const weekend = on && calendar.data?.data && now !== null ? nextSession(calendar.data.data, now)?.race : null;
  return (
    <>
      <PageHeader
        title={status.data?.data ? liveTitle(status.data.data) : "Live"}
        description={on ? "Live timing for the session on track right now" : "Live timing appears here while a session is on track."}
      >
        {on && (
          <Link href="/live/3d" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <BoxIcon aria-hidden /> 3D
          </Link>
        )}
        {weekend && (
          <Link href={`/race?season=${weekend.season}&round=${weekend.round}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <CalendarDaysIcon aria-hidden /> Weekend
          </Link>
        )}
      </PageHeader>
      <QueryState query={status} loading={<Skeleton className="h-64 w-full" />}>
        {(live, res) =>
          live.state === "LIVE" || live.state === "DELAYED" ? (
            <LiveTiming live={live} />
          ) : live.state !== "UNAVAILABLE" ? (
            <ErrorState error={new Error(`Unexpected live state "${live.state}".`)} />
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <RadioTowerIcon aria-hidden className="size-4" />
                    {live.reason === "no_session" ? "No live session" : "Live timing unavailable"}
                  </CardTitle>
                  {live.reason === "feed_unavailable" && (
                    <CardDescription>
                      <Badge variant="outline" role="status">
                        Feed unreachable
                      </Badge>
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p>{live.detail}</p>
                  {live.latestReplay && (
                    <Link
                      className={buttonVariants({ variant: "outline" })}
                      href={`/replay?season=${new Date(live.latestReplay.start).getUTCFullYear()}&session=${live.latestReplay.key}`}
                    >
                      <HistoryIcon aria-hidden />
                      Replay {live.latestReplay.meetingName} · {live.latestReplay.name}
                    </Link>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Next session</CardTitle>
                  <CardDescription>From the published calendar</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {live.next ? (
                    <>
                      <Link href={`/race?season=${live.next.race.season}&round=${live.next.race.round}`} className="font-medium hover:text-live hover:underline">
                        {live.next.race.name}
                      </Link>
                      <RaceCountdown next={{ race: live.next.race, session: live.next.session, state: live.next.inWindow ? "in_window" : "upcoming" }} />
                      <p className="text-xs text-muted-foreground">
                        {SESSION_LABEL[live.next.session.kind]} · {formatSessionTime(live.next.session)}
                      </p>
                      {live.next.inWindow && (
                        <p className="text-xs text-muted-foreground">
                          The scheduled slot is open; that doesn&apos;t confirm the session is running. Follow it on official Formula 1 channels.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No upcoming session found in the calendar.</p>
                  )}
                </CardContent>
              </Card>
              <div className="lg:col-span-3">
                <SourceNote res={res} />
              </div>
            </div>
          )
        }
      </QueryState>
    </>
  );
}

function LiveTiming({ live }: { live: Extract<LiveStatus, { state: "LIVE" | "DELAYED" }> }) {
  const [selected, setSelected] = useState<number | null>(null);
  const t = live.timing;
  const drivers = new Map(t.drivers.map((d) => [d.number, d]));
  const race = t.session.type === "Race";
  const toggle = (n: number | null) => setSelected((s) => (s === n ? null : n));
  const outlineBy = t.track && drivers.get(t.track.driver);
  // ponytail: a live DO can serve the previous API version for minutes after a deploy; fall back to what it sends.
  const old = t as Partial<LiveTimingSnapshot>;
  const status = old.status ?? trackStatus(t.raceControl, Infinity);
  const stewards = stewardsAt(old.stewards ?? t.raceControl, Infinity);
  const [laps, stints] = [old.laps ?? {}, old.stints ?? {}];
  const penalties = new Map([...pendingPenalties(stewards)].map(([n, p]) => [n, penaltyLabel(p)!]));
  const [pair, setPair] = useState<[number, number] | null>(null);
  const shownPair: [number, number] = pair ?? [t.rows[0]?.driver ?? t.drivers[0]!.number, t.rows[1]?.driver ?? t.drivers[1]?.number ?? t.drivers[0]!.number];
  return (
    <PanelGrid
      id="live"
      presets={PRESETS}
      panels={[
        {
          id: "status",
          title: "Session",
          layout: { x: 0, y: 0, w: 12, h: 3, minW: 4, minH: 3 },
          content: (
            <SessionStatus
              status={status}
              rows={t.rows}
              drivers={drivers}
              freshness={
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant={live.state === "LIVE" ? "default" : "outline"} role="status">
                    {live.state === "LIVE" && <span aria-hidden className="size-1.5 rounded-full bg-current motion-safe:animate-live-pulse" />}
                    {live.state === "LIVE" ? "Live" : `Delayed · last update ${live.delaySeconds} s ago`}
                  </Badge>
                  OpenF1 timing, a few seconds behind the track
                </div>
              }
            />
          ),
        },
        {
          id: "track",
          title: "Track",
          description: t.track
            ? `Outline traced from ${outlineBy?.acronym ?? t.track.driver}'s lap ${t.track.lap} earlier this weekend. Cars are about ${MAP_DELAY_MS / 1000} s behind the timing. Drag to pan, click a car to select it.`
            : `No earlier session this weekend to trace an outline from; cars are drawn on OpenF1's x/y coordinates, about ${MAP_DELAY_MS / 1000} s behind the timing.`,
          layout: { x: 0, y: 3, w: 7, h: 12, minW: 4, minH: 6 },
          content: <LiveTrack timing={t} selected={selected} onSelect={toggle} />,
        },
        {
          id: "timing",
          title: "Timing",
          layout: { x: 7, y: 3, w: 5, h: 18, minW: 3, minH: 6 },
          menu: <TowerColumnsMenu intervals={race} />,
          content: (
            <TimingTower
              rows={t.rows}
              drivers={drivers}
              selected={selected}
              onSelect={setSelected}
              intervals={race}
              penalties={penalties}
              caption={`Live timing for ${t.session.meetingName} ${t.session.name}, from OpenF1`}
            />
          ),
        },
        {
          id: "focus",
          title: "Driver focus",
          phoneAfter: "timing",
          layout: { x: 0, y: 15, w: 4, h: 6, minW: 3, minH: 4 },
          content: <DriverFocus rows={t.rows} drivers={drivers} selected={selected} intervals={race} />,
        },
        {
          id: "race-control",
          title: "Race control",
          layout: { x: 4, y: 15, w: 3, h: 6, minW: 3, minH: 3 },
          content: <RaceControlFeed messages={t.raceControl} t={Infinity} limit={20} />,
        },
        {
          id: "weather",
          title: "Track weather",
          layout: { x: 7, y: 21, w: 5, h: 4, minW: 3, minH: 3 },
          content: <TrackWeather weather={t.weather ?? []} t={Infinity} />,
        },
        {
          id: "comparison",
          title: "Driver comparison",
          layout: { x: 0, y: 21, w: 7, h: 16, minW: 4, minH: 6 },
          content: <DriverComparison sessionKey={t.session.key} drivers={t.drivers} laps={laps} rows={t.rows} t={Infinity} pair={shownPair} onPair={setPair} />,
        },
        {
          id: "penalties",
          title: "Penalties",
          description: "Penalties, investigations, deleted laps and warnings so far.",
          layout: { x: 7, y: 25, w: 5, h: 8, minW: 3, minH: 4 },
          content: <Penalties items={stewards} drivers={drivers} selected={selected} onSelect={setSelected} />,
        },
        {
          id: "tyres",
          title: "Tyres",
          description: "Stints so far in running order, with laps on the current set and the compounds used.",
          layout: { x: 0, y: 37, w: 7, h: 10, minW: 4, minH: 5 },
          content: <TyreStrip rows={t.rows} drivers={drivers} stints={stints} selected={selected} onSelect={setSelected} />,
        },
        {
          id: "championship",
          title: "Championship",
          layout: { x: 7, y: 33, w: 5, h: 12, minW: 3, minH: 5 },
          content: (
            <Championship
              season={new Date(t.observedAt).getUTCFullYear()}
              sessionKey={t.session.key}
              projected={race}
              sprint={t.session.name === "Sprint"}
              rows={t.rows}
              drivers={t.drivers}
            />
          ),
        },
      ]}
    />
  );
}

/** Cars are drawn this far behind the newest location sample, so they move smoothly between 3 s polls. */
export const MAP_DELAY_MS = 5_000;

/** The live positions as a playback clock MAP_DELAY_MS behind the newest sample, for the track map. */
export function useLivePositions(timing: LiveTimingSnapshot) {
  const positions = useRef(timing.positions);
  const anchor = useRef({ t: timing.positions.to - MAP_DELAY_MS, at: 0 });
  useEffect(() => {
    positions.current = timing.positions;
    // ponytail: re-anchored on every poll, so a late poll nudges the cars; smooth it if that shows.
    anchor.current = { t: timing.positions.to - MAP_DELAY_MS, at: performance.now() };
  }, [timing.positions]);
  const time = useCallback(() => anchor.current.t + performance.now() - anchor.current.at, []);
  const getWindow = useCallback(() => positions.current, []);
  return { time, getWindow };
}

function LiveTrack({ timing, selected, onSelect }: { timing: LiveTimingSnapshot; selected: number | null; onSelect: (n: number) => void }) {
  const [follow, setFollow] = useState(false);
  const { time, getWindow } = useLivePositions(timing);
  return (
    <div className="flex h-full min-h-72 flex-col gap-2">
      <div className="min-h-0 flex-1">
        <TrackCanvas
          track={timing.track}
          drivers={timing.drivers}
          time={time}
          getWindow={getWindow}
          selected={selected}
          follow={follow && selected !== null}
          interpolate
          battles={timing.session.type === "Race" ? battlesOf(timing.rows) : undefined}
          onSelect={onSelect}
        />
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={follow} disabled={selected === null} onChange={(e) => setFollow(e.target.checked)} className="accent-primary" />
        Follow selected driver
      </label>
    </div>
  );
}
