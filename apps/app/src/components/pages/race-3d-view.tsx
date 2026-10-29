"use client";

import { type LiveStatus, type LiveTimingSnapshot, type SessionReplay, timingAt } from "@pitwall/shared";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { EmptyState, QueryState } from "@/components/data/query-state";
import { PageHeader } from "@/components/pages/page-header";
import { MAP_DELAY_MS, streaming, useLivePositions } from "@/components/pages/live-view";
import { useReplayPlayback } from "@/components/pages/replay-view";
import { DriverFocus } from "@/components/replay/driver-focus";
import { PlaybackControls, replayMarkers } from "@/components/replay/playback-controls";
import { RaceControlFeed } from "@/components/replay/race-control-feed";
import { RaceStage3D } from "@/components/replay/race-stage-3d";
import { type Column, TimingTower } from "@/components/replay/timing-tower";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/api";
import { useReplay } from "@/lib/hooks";

// The tower in a narrow side panel: the columns that fit beside the driver.
const columns = (race: boolean): Column[] => (race ? ["int", "tyre", "gained"] : ["best", "tyre"]);

/** /replay/3d?session=: a recorded session on the 3D circuit. */
export function Replay3DView() {
  const key = Number(useSearchParams().get("session"));
  const replay = useReplay(Number.isInteger(key) && key > 0 ? key : null);
  if (!(Number.isInteger(key) && key > 0)) {
    return (
      <>
        <PageHeader title="Replay in 3D" />
        <EmptyState>
          Choose a session on{" "}
          <Link href="/replay" className="underline underline-offset-4 hover:text-live">
            Replay
          </Link>
          , then open it in 3D.
        </EmptyState>
      </>
    );
  }
  return (
    <QueryState
      query={replay}
      loading={
        <div className="space-y-2">
          <Skeleton className="h-[70dvh] w-full" />
          <p className="text-xs text-muted-foreground">Loading the session from OpenF1. The first load of a session takes several seconds.</p>
        </div>
      }
    >
      {(r) => <Replay3D replay={r} />}
    </QueryState>
  );
}

function Replay3D({ replay }: { replay: SessionReplay }) {
  const { clock, t, time, getWindow, current } = useReplayPlayback(replay);
  const [selected, setSelected] = useState<number | null>(null);
  const rows = timingAt(replay, current.data?.data ?? null, t);
  const drivers = new Map(replay.drivers.map((d) => [d.number, d]));
  const race = replay.session.type === "Race";
  // Someone is always in focus: the leader until you pick a car.
  const shown = selected ?? rows[0]?.driver ?? null;
  const s = replay.session;
  return (
    <RaceStage3D
      title={s.meetingName}
      description={`${s.name} · ${s.circuit} · ${new Date(s.start).toLocaleDateString(undefined, { dateStyle: "medium" })} · recorded OpenF1 data`}
      badge={<Badge variant="outline">Replay</Badge>}
      dashboard={`/replay?season=${new Date(s.start).getUTCFullYear()}&session=${s.key}`}
      track={replay.track}
      drivers={replay.drivers}
      time={time}
      getWindow={getWindow}
      rows={rows}
      race={race}
      selected={shown}
      onSelect={setSelected}
      tower={<TimingTower rows={rows} drivers={drivers} selected={shown} onSelect={setSelected} intervals={race} only={columns(race)} />}
      focus={<DriverFocus rows={rows} drivers={drivers} selected={shown} intervals={race} />}
      feed={<RaceControlFeed messages={replay.raceControl} t={t} limit={20} />}
      playback={
        <PlaybackControls
          state={clock.state}
          range={replay.range}
          onPlay={clock.play}
          onPause={clock.pause}
          onSeek={clock.seek}
          onSpeed={clock.setSpeed}
          markers={replayMarkers(replay)}
        />
      }
    />
  );
}

/** /live/3d: the session on track now, on the 3D circuit. */
export function Live3DView() {
  const status = useApi<LiveStatus>("/api/live/session", (res) => (streaming(res?.data ?? undefined) ? 3_000 : 30_000));
  return (
    <QueryState query={status} loading={<Skeleton className="h-[70dvh] w-full" />}>
      {(live) =>
        live.state === "LIVE" || live.state === "DELAYED" ? (
          <Live3D live={live} timing={live.timing} />
        ) : (
          <>
            <PageHeader title="Live in 3D" />
            <EmptyState>
              No session is on track right now.{" "}
              <Link href="/live" className="underline underline-offset-4 hover:text-live">
                Live
              </Link>{" "}
              shows what&apos;s next.
            </EmptyState>
          </>
        )
      }
    </QueryState>
  );
}

function Live3D({ live, timing: t }: { live: Extract<LiveStatus, { state: "LIVE" | "DELAYED" }>; timing: LiveTimingSnapshot }) {
  const { time, getWindow } = useLivePositions(t);
  const [selected, setSelected] = useState<number | null>(null);
  const drivers = new Map(t.drivers.map((d) => [d.number, d]));
  const race = t.session.type === "Race";
  const shown = selected ?? t.rows[0]?.driver ?? null;
  return (
    <RaceStage3D
      title={`${t.session.meetingName} · ${t.session.name}`}
      description={`Live from OpenF1. Cars are about ${MAP_DELAY_MS / 1000} s behind the timing.`}
      badge={
        <Badge variant={live.state === "LIVE" ? "default" : "outline"} role="status">
          {live.state === "LIVE" ? "Live" : `Delayed · ${live.delaySeconds} s`}
        </Badge>
      }
      dashboard="/live"
      track={t.track}
      drivers={t.drivers}
      time={time}
      getWindow={getWindow}
      rows={t.rows}
      race={race}
      selected={shown}
      onSelect={setSelected}
      tower={
        <TimingTower
          rows={t.rows}
          drivers={drivers}
          selected={shown}
          onSelect={setSelected}
          intervals={race}
          only={columns(race)}
          caption={`Live timing for ${t.session.meetingName} ${t.session.name}, from OpenF1`}
        />
      }
      focus={<DriverFocus rows={t.rows} drivers={drivers} selected={shown} intervals={race} />}
      feed={<RaceControlFeed messages={t.raceControl} t={Infinity} limit={20} />}
    />
  );
}
