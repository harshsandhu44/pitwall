"use client";

import {
  type ApiResponse,
  penaltyLabel,
  pendingPenalties,
  type PositionWindow,
  type ReplaySession,
  type SessionReplay,
  stewardsAt,
  timingAt,
  trackStatus,
  WINDOW_MS,
  windowStart,
} from "@pitwall/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BoxIcon, CalendarDaysIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { EmptyState, ErrorState, QueryState, SourceNote } from "@/components/data/query-state";
import { PanelGrid } from "@/components/dashboard/panel-grid";
import { PRESETS } from "@/components/dashboard/presets";
import { PageHeader } from "@/components/pages/page-header";
import { DriverComparison } from "@/components/replay/driver-comparison";
import { DriverFocus } from "@/components/replay/driver-focus";
import { Championship } from "@/components/replay/championship";
import { Penalties } from "@/components/replay/penalties";
import { PlaybackControls, replayMarkers } from "@/components/replay/playback-controls";
import { RaceControlFeed } from "@/components/replay/race-control-feed";
import { SessionStatus } from "@/components/replay/session-status";
import { TimingTower, TowerColumnsMenu } from "@/components/replay/timing-tower";
import { battlesOf, TrackCanvas } from "@/components/replay/track-canvas";
import { TrackWeather } from "@/components/replay/track-weather";
import { TyreStrip } from "@/components/replay/tyre-strip";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/api";
import { useCalendar, useReplay, useReplaySessions, useSeason, weekendOf } from "@/lib/hooks";
import { fmtClock } from "@/lib/format";
import { useReplayClock } from "@/lib/replay-clock";

const FIRST_SEASON = 2023;

function Picker({ label, value, items, onChange, className }: { label: string; value: string; items: { value: string; label: string }[]; onChange: (v: string) => void; className?: string }) {
  return (
    <Select items={items} value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger aria-label={label} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ReplayView() {
  const { season, latest, setSeason } = useSeason();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const sessions = useReplaySessions(season);
  const calendar = useCalendar(season);
  const setSession = (key: number) => {
    const p = new URLSearchParams(params);
    p.set("session", String(key));
    router.replace(`${pathname}?${p}`, { scroll: false });
  };

  if (season === null) return <Skeleton className="h-96 w-full" />;
  const loading = (
    <>
      <Skeleton className="mb-5 h-[73px] w-full" />
      <Skeleton className="h-96 w-full" />
    </>
  );
  if (season < FIRST_SEASON) {
    return (
      <>
        <PageHeader title="Replay" description="Recorded sessions from OpenF1" />
        <EmptyState>
          OpenF1&apos;s free recordings start with the {FIRST_SEASON} season.{" "}
          {latest !== null && (
            <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setSeason(latest)}>
              Show {latest}
            </Button>
          )}
        </EmptyState>
      </>
    );
  }

  return (
    <QueryState query={sessions} loading={loading}>
      {(list) => {
        if (!list.length) {
          return (
            <>
              <PageHeader title="Replay" description="Recorded sessions from OpenF1" />
              <EmptyState>No finished sessions recorded for {season} yet. Sessions appear here about two hours after they end.</EmptyState>
            </>
          );
        }
        const selected: ReplaySession =
          list.find((s) => String(s.key) === params.get("session")) ?? [...list].reverse().find((s) => s.type === "Race") ?? list.at(-1)!;
        const meetings = [...new Map(list.map((s) => [s.meetingKey, s.meetingName])).entries()];
        const inMeeting = list.filter((s) => s.meetingKey === selected.meetingKey);
        const weekend = calendar.data?.data ? weekendOf(calendar.data.data, selected.start) : undefined;
        return (
          <>
            <PageHeader
              title={`Replay · ${selected.meetingName}`}
              description={`${selected.name} · ${selected.circuit}, ${selected.country} · ${new Date(selected.start).toLocaleDateString(undefined, { dateStyle: "medium" })}`}
            >
              <div className="flex w-full gap-2 sm:w-auto">
                <Picker
                  label="Grand Prix"
                  className="min-w-0 flex-1 sm:w-60 sm:flex-none"
                  value={String(selected.meetingKey)}
                  items={meetings.map(([k, name]) => ({ value: String(k), label: name }))}
                  onChange={(v) => {
                    const m = list.filter((s) => String(s.meetingKey) === v);
                    setSession(([...m].reverse().find((s) => s.type === "Race") ?? m.at(-1)!).key);
                  }}
                />
                <Picker
                  label="Session"
                  className="w-32 shrink-0 sm:w-40"
                  value={String(selected.key)}
                  items={inMeeting.map((s) => ({ value: String(s.key), label: s.name }))}
                  onChange={(v) => setSession(Number(v))}
                />
                <Link
                  href={`/replay/3d?season=${season}&session=${selected.key}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  aria-label="Watch in 3D"
                >
                  <BoxIcon aria-hidden />
                  <span className="hidden sm:inline">3D</span>
                </Link>
                {weekend && (
                  <Link
                    href={`/race?season=${weekend.season}&round=${weekend.round}`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                    aria-label={`${weekend.name} weekend page`}
                  >
                    <CalendarDaysIcon aria-hidden />
                    <span className="hidden sm:inline">Weekend</span>
                  </Link>
                )}
              </div>
            </PageHeader>
            <ReplayLoader key={selected.key} sessionKey={selected.key} />
          </>
        );
      }}
    </QueryState>
  );
}

function ReplayLoader({ sessionKey }: { sessionKey: number }) {
  const replay = useReplay(sessionKey);
  return (
    <QueryState
      query={replay}
      loading={
        <div className="space-y-2">
          <Skeleton className="h-96 w-full" />
          <p className="text-xs text-muted-foreground">Loading the session from OpenF1. The first load of a session takes several seconds.</p>
        </div>
      }
    >
      {(r, res) => <Player replay={r} res={res} />}
    </QueryState>
  );
}

/** Playback of a recorded session: the clock, and the position windows around it, fetched and buffered ahead. */
export function useReplayPlayback(replay: SessionReplay) {
  const qc = useQueryClient();
  const key = replay.session.key;
  const path = useCallback((from: number) => `/api/replay/${key}/window?from=${from}`, [key]);
  const windowQuery = useCallback(
    (from: number) => ({
      queryKey: [path(from)],
      queryFn: ({ signal }: { signal: AbortSignal }) => apiGet<PositionWindow>(path(from), signal),
      staleTime: Infinity,
      // ponytail: windows behind the cursor are dropped after a minute unobserved; that's the eviction policy.
      gcTime: 60_000,
    }),
    [path],
  );
  const getWindow = useCallback((t: number) => qc.getQueryData<ApiResponse<PositionWindow>>([path(windowStart(t))])?.data ?? null, [qc, path]);
  const ready = useCallback((t: number) => getWindow(t) !== null, [getWindow]);

  const clock = useReplayClock(replay.range, ready);
  const t = clock.state.t;
  // The React Compiler memoizes this, so the track map's draw loop isn't restarted on every render.
  const time = () => clock.ref.current.t;
  const cur = windowStart(t);
  const current = useQuery(windowQuery(cur));

  // Buffer the next two windows (2 minutes of session time) while the current one plays.
  useEffect(() => {
    for (const k of [1, 2]) {
      const from = cur + k * WINDOW_MS;
      if (from <= replay.range.end) void qc.prefetchQuery(windowQuery(from));
    }
  }, [cur, qc, replay.range.end, windowQuery]);
  return { clock, t, time, getWindow, current };
}

function Player({ replay, res }: { replay: SessionReplay; res: ApiResponse<SessionReplay> }) {
  const key = replay.session.key;
  const { clock, t, time, getWindow, current } = useReplayPlayback(replay);
  const [selected, setSelected] = useState<number | null>(null);
  const [follow, setFollow] = useState(false);
  const [interpolate, setInterpolate] = useState(true);
  const rows = timingAt(replay, current.data?.data ?? null, t);
  const [pair, setPair] = useState<[number, number] | null>(null);
  const shownPair: [number, number] = pair ?? [rows[0]?.driver ?? replay.drivers[0]!.number, rows[1]?.driver ?? replay.drivers[1]?.number ?? replay.drivers[0]!.number];
  const drivers = new Map(replay.drivers.map((d) => [d.number, d]));
  const race = replay.session.type === "Race";
  const stewards = stewardsAt(replay.raceControl, t);
  const penalties = new Map([...pendingPenalties(stewards)].map(([n, p]) => [n, penaltyLabel(p)!]));
  const markers = replayMarkers(replay);

  return (
    <div className="space-y-4">
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">Recorded replay · not live</Badge>
        Positions are OpenF1 location samples (about four a second per car). Timing shows only what had been published at the replay position.
      </p>
      <PanelGrid
        id="replay"
        panels={[
          {
            id: "status",
            title: "Session",
            layout: { x: 0, y: 0, w: 12, h: 3, minW: 4, minH: 3 },
            content: (
              <SessionStatus
                status={trackStatus(replay.raceControl, t)}
                rows={rows}
                drivers={drivers}
                freshness={<span className="font-mono text-xs text-muted-foreground tabular-nums">At {fmtClock(t)}</span>}
              />
            ),
          },
          {
            id: "track",
            title: "Track",
            description: replay.track
              ? `Outline traced from ${drivers.get(replay.track.driver)?.acronym ?? replay.track.driver}'s lap ${replay.track.lap}. Drag to pan, click a car to select it.`
              : "No clean lap to trace an outline from; cars are drawn on OpenF1's recorded x/y coordinates.",
            layout: { x: 0, y: 3, w: 7, h: 15, minW: 4, minH: 8 },
            content: (
              <div className="flex h-full min-h-72 flex-col gap-3">
                <div className="min-h-0 flex-1">
                  <TrackCanvas
                    track={replay.track}
                    drivers={replay.drivers}
                    time={time}
                    getWindow={getWindow}
                    selected={selected}
                    follow={follow && selected !== null}
                    interpolate={interpolate}
                    battles={race ? battlesOf(rows) : undefined}
                    onSelect={(n) => setSelected((s) => (s === n ? null : n))}
                  />
                </div>
                {current.isError && <ErrorState error={current.error} onRetry={() => current.refetch()} />}
                <p className="text-xs text-muted-foreground">
                  Solid dot: a recorded sample{interpolate ? ", or a straight line between two samples less than 1 s apart" : ""}. Dashed ring: no sample for over
                  a second, shown at the last recorded spot. Tail: the last two seconds.{race ? " Red dashed link: under a second behind the car ahead." : ""}
                </p>
              </div>
            ),
          },
          {
            id: "timing",
            title: "Timing",
            description: race ? "Gaps update about every 4 s in the recording." : "Gaps are only recorded for races and sprints.",
            layout: { x: 7, y: 3, w: 5, h: 19, minW: 3, minH: 6 },
            menu: <TowerColumnsMenu intervals={race} />,
            content: <TimingTower rows={rows} drivers={drivers} selected={selected} onSelect={setSelected} intervals={race} penalties={penalties} />,
          },
          {
            id: "comparison",
            title: "Driver comparison",
            layout: { x: 0, y: 18, w: 7, h: 16, minW: 4, minH: 6 },
            content: (
              <DriverComparison sessionKey={key} drivers={replay.drivers} laps={replay.laps} rows={rows} t={t} pair={shownPair} onPair={setPair} />
            ),
          },
          {
            id: "focus",
            title: "Driver focus",
            phoneAfter: "timing",
            layout: { x: 7, y: 22, w: 5, h: 6, minW: 3, minH: 4 },
            content: <DriverFocus rows={rows} drivers={drivers} selected={selected} intervals={race} />,
          },
          {
            id: "penalties",
            title: "Penalties",
            description: "Penalties, investigations, deleted laps and warnings published so far.",
            layout: { x: 7, y: 28, w: 5, h: 8, minW: 3, minH: 4 },
            content: <Penalties items={stewards} drivers={drivers} selected={selected} onSelect={setSelected} />,
          },
          {
            id: "tyres",
            title: "Tyres",
            description: "Stints so far in running order, with laps on the current set and the compounds used.",
            layout: { x: 0, y: 34, w: 7, h: 10, minW: 4, minH: 5 },
            content: <TyreStrip rows={rows} drivers={drivers} stints={replay.stints} selected={selected} onSelect={setSelected} />,
          },
          {
            id: "championship",
            title: "Championship",
            layout: { x: 7, y: 36, w: 5, h: 12, minW: 3, minH: 5 },
            content: (
              <Championship
                season={new Date(replay.session.start).getUTCFullYear()}
                sessionKey={key}
                projected={race}
                sprint={replay.session.name === "Sprint"}
                rows={rows}
                drivers={replay.drivers}
              />
            ),
          },
          {
            id: "race-control",
            title: "Race control",
            layout: { x: 0, y: 44, w: 7, h: 6, minW: 3, minH: 3 },
            content: <RaceControlFeed messages={replay.raceControl} t={t} limit={20} />,
          },
          {
            id: "weather",
            title: "Track weather",
            layout: { x: 7, y: 48, w: 5, h: 5, minW: 3, minH: 3 },
            content: <TrackWeather weather={replay.weather} t={t} />,
          },
        ]}
        presets={PRESETS}
        footer={
          // Outside the panels: hiding or scrolling past the Track panel never loses playback. Sits above the phone tab bar.
          <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 space-y-2 border bg-background/95 p-3 backdrop-blur md:bottom-0">
            <PlaybackControls
              state={clock.state}
              range={replay.range}
              onPlay={clock.play}
              onPause={clock.pause}
              onSeek={clock.seek}
              onSpeed={clock.setSpeed}
              markers={markers}
            />
            <div className="flex flex-wrap gap-4 text-xs">
              <label className="inline-flex min-h-8 items-center gap-1.5">
                <input type="checkbox" checked={interpolate} onChange={(e) => setInterpolate(e.target.checked)} className="accent-primary" />
                Interpolate between samples
              </label>
              <label className="inline-flex min-h-8 items-center gap-1.5">
                <input type="checkbox" checked={follow} disabled={selected === null} onChange={(e) => setFollow(e.target.checked)} className="accent-primary" />
                Follow selected driver
              </label>
            </div>
          </div>
        }
      />
      <SourceNote res={res} />
    </div>
  );
}
