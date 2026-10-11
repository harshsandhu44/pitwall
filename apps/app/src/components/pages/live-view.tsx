"use client";

import type { LiveStatus, LiveTimingSnapshot } from "@pitwall/shared";
import { SESSION_LABEL } from "@pitwall/shared";
import { RadioTowerIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorState, QueryState, SourceNote } from "@/components/data/query-state";
import { PageHeader } from "@/components/pages/page-header";
import { RaceCountdown } from "@/components/racing/race-countdown";
import { RaceControlFeed } from "@/components/replay/race-control-feed";
import { TimingTower } from "@/components/replay/timing-tower";
import { TrackCanvas } from "@/components/replay/track-canvas";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/api";
import { formatSessionTime } from "@/lib/format";

const streaming = (s: LiveStatus | undefined) => s?.state === "LIVE" || s?.state === "DELAYED";

/** Live timing from OpenF1 while a session is on; otherwise what's next and the latest replay. */
export function LiveView() {
  // Every 3 s while a session streams; every 30 s otherwise, to notice when one starts.
  const status = useApi<LiveStatus>("/api/live/session", (res) => (streaming(res?.data ?? undefined) ? 3_000 : 30_000));
  return (
    <>
      <PageHeader title="Live" description="Live timing for the session on track right now" />
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
                  <CardDescription>
                    <Badge variant="outline" role="status">
                      Status: unavailable
                    </Badge>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p>{live.detail}</p>
                  {live.latestReplay && (
                    <p>
                      Latest recorded session:{" "}
                      <Link
                        className="font-medium underline"
                        href={`/replay?season=${new Date(live.latestReplay.start).getUTCFullYear()}&session=${live.latestReplay.key}`}
                      >
                        {live.latestReplay.meetingName} · {live.latestReplay.name}
                      </Link>
                    </p>
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
                      <Link href={`/race?season=${live.next.race.season}&round=${live.next.race.round}`} className="font-medium hover:underline">
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
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RadioTowerIcon aria-hidden className="size-4" />
            {t.session.meetingName} · {t.session.name}
          </CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2">
            <Badge variant={live.state === "LIVE" ? "default" : "outline"} role="status">
              {live.state === "LIVE" ? "Live" : `Delayed · last update ${live.delaySeconds} s ago`}
            </Badge>
            <span>OpenF1 timing, a few seconds behind the track</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TimingTower
            rows={t.rows}
            drivers={new Map(t.drivers.map((d) => [d.number, d]))}
            selected={selected}
            onSelect={setSelected}
            intervals={t.session.type === "Race"}
            caption={`Live timing for ${t.session.meetingName} ${t.session.name}, from OpenF1`}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Race control</CardTitle>
        </CardHeader>
        <CardContent>
          <RaceControlFeed messages={t.raceControl} t={Infinity} />
        </CardContent>
      </Card>
      <LiveTrack timing={t} selected={selected} />
    </div>
  );
}

/** Cars are drawn this far behind the newest location sample, so they move smoothly between 3 s polls. */
const MAP_DELAY_MS = 5_000;

function LiveTrack({ timing, selected }: { timing: LiveTimingSnapshot; selected: number | null }) {
  const [follow, setFollow] = useState(false);
  const positions = useRef(timing.positions);
  const anchor = useRef({ t: timing.positions.to - MAP_DELAY_MS, at: 0 });
  useEffect(() => {
    positions.current = timing.positions;
    // ponytail: re-anchored on every poll, so a late poll nudges the cars; smooth it if that shows.
    anchor.current = { t: timing.positions.to - MAP_DELAY_MS, at: performance.now() };
  }, [timing.positions]);
  const time = useCallback(() => anchor.current.t + performance.now() - anchor.current.at, []);
  const getWindow = useCallback(() => positions.current, []);
  const outlineBy = timing.track && timing.drivers.find((d) => d.number === timing.track!.driver);
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Track</CardTitle>
        <CardDescription>
          {timing.track
            ? `Outline traced from ${outlineBy?.acronym ?? timing.track.driver}'s lap ${timing.track.lap} earlier this weekend. Cars are about ${MAP_DELAY_MS / 1000} s behind the timing. Drag to pan.`
            : `No earlier session this weekend to trace an outline from; cars are drawn on OpenF1's x/y coordinates, about ${MAP_DELAY_MS / 1000} s behind the timing.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <TrackCanvas
          track={timing.track}
          drivers={timing.drivers}
          time={time}
          getWindow={getWindow}
          selected={selected}
          follow={follow && selected !== null}
          interpolate
        />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={follow} disabled={selected === null} onChange={(e) => setFollow(e.target.checked)} className="accent-foreground" />
          Follow selected driver
        </label>
      </CardContent>
    </Card>
  );
}
