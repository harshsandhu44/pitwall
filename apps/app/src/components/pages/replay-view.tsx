"use client";

import { type ApiResponse, type PositionWindow, type ReplaySession, type SessionReplay, timingAt, WINDOW_MS, windowStart } from "@pitwall/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { EmptyState, ErrorState, QueryState, SourceNote } from "@/components/data/query-state";
import { PageHeader } from "@/components/pages/page-header";
import { DriverComparison } from "@/components/replay/driver-comparison";
import { PlaybackControls } from "@/components/replay/playback-controls";
import { RaceControlFeed } from "@/components/replay/race-control-feed";
import { TimingTower } from "@/components/replay/timing-tower";
import { TrackCanvas } from "@/components/replay/track-canvas";
import { TrackWeather } from "@/components/replay/track-weather";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/api";
import { useReplay, useReplaySessions, useSeason } from "@/lib/hooks";
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
  const setSession = (key: number) => {
    const p = new URLSearchParams(params);
    p.set("session", String(key));
    router.replace(`${pathname}?${p}`, { scroll: false });
  };

  if (season === null) return <Skeleton className="h-96 w-full" />;
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
    <QueryState query={sessions} loading={<Skeleton className="h-96 w-full" />}>
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

function Player({ replay, res }: { replay: SessionReplay; res: ApiResponse<SessionReplay> }) {
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
  const cur = windowStart(t);
  const current = useQuery(windowQuery(cur));

  // Buffer the next two windows (2 minutes of session time) while the current one plays.
  useEffect(() => {
    for (const k of [1, 2]) {
      const from = cur + k * WINDOW_MS;
      if (from <= replay.range.end) void qc.prefetchQuery(windowQuery(from));
    }
  }, [cur, qc, replay.range.end, windowQuery]);

  const [selected, setSelected] = useState<number | null>(null);
  const [follow, setFollow] = useState(false);
  const [interpolate, setInterpolate] = useState(true);
  const rows = timingAt(replay, current.data?.data ?? null, t);
  const [pair, setPair] = useState<[number, number] | null>(null);
  const shownPair: [number, number] = pair ?? [rows[0]?.driver ?? replay.drivers[0]!.number, rows[1]?.driver ?? replay.drivers[1]?.number ?? replay.drivers[0]!.number];
  const drivers = new Map(replay.drivers.map((d) => [d.number, d]));
  const race = replay.session.type === "Race";

  return (
    <div className="space-y-4">
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">Recorded replay · not live</Badge>
        Positions are OpenF1 location samples (about four a second per car). Timing shows only what had been published at the replay position.
      </p>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Track</CardTitle>
            <CardDescription>
              {replay.track
                ? `Outline traced from ${drivers.get(replay.track.driver)?.acronym ?? replay.track.driver}'s lap ${replay.track.lap}. Drag to pan.`
                : "No clean lap to trace an outline from; cars are drawn on OpenF1's recorded x/y coordinates."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <TrackCanvas replay={replay} clock={clock.ref} getWindow={getWindow} selected={selected} follow={follow && selected !== null} interpolate={interpolate} />
            {current.isError && <ErrorState error={current.error} onRetry={() => current.refetch()} />}
            <PlaybackControls state={clock.state} range={replay.range} onPlay={clock.play} onPause={clock.pause} onSeek={clock.seek} onSpeed={clock.setSpeed} />
            <div className="flex flex-wrap gap-4 text-xs">
              <label className="inline-flex items-center gap-1.5">
                <input type="checkbox" checked={interpolate} onChange={(e) => setInterpolate(e.target.checked)} className="accent-foreground" />
                Interpolate between samples
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input type="checkbox" checked={follow} disabled={selected === null} onChange={(e) => setFollow(e.target.checked)} className="accent-foreground" />
                Follow selected driver
              </label>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Solid dot: a recorded sample{interpolate ? ", or a straight line between two samples less than 1 s apart" : ""}. Dashed ring: no sample for over a
              second, shown at the last recorded spot. Select a driver in the timing tower to highlight them.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Timing</CardTitle>
            <CardDescription>{race ? "Gaps update about every 4 s in the recording." : "Gaps are only recorded for races and sprints."}</CardDescription>
          </CardHeader>
          <CardContent>
            <TimingTower rows={rows} drivers={drivers} selected={selected} onSelect={setSelected} intervals={race} />
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Driver comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <DriverComparison replay={replay} rows={rows} t={t} pair={shownPair} onPair={setPair} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Race control</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <RaceControlFeed messages={replay.raceControl} t={t} />
            <div className="space-y-2">
              <h2 className="text-sm font-medium">Track weather</h2>
              <TrackWeather weather={replay.weather} t={t} />
            </div>
          </CardContent>
        </Card>
      </div>
      <SourceNote res={res} />
    </div>
  );
}
