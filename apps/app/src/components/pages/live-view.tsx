"use client";

import type { LiveStatus } from "@pitwall/shared";
import { SESSION_LABEL } from "@pitwall/shared";
import { RadioTowerIcon } from "lucide-react";
import Link from "next/link";
import { ErrorState, QueryState, SourceNote } from "@/components/data/query-state";
import { PageHeader } from "@/components/pages/page-header";
import { RaceCountdown } from "@/components/racing/race-countdown";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/api";
import { formatSessionTime } from "@/lib/format";

/** Live timing status. Pitwall has no permitted free live source, so this explains that and points elsewhere. */
export function LiveView() {
  const status = useApi<LiveStatus>("/api/live/session");
  return (
    <>
      <PageHeader title="Live" description="Live timing status for the current race weekend" />
      <QueryState query={status} loading={<Skeleton className="h-64 w-full" />}>
        {(live, res) =>
          live.state !== "UNAVAILABLE" ? (
            // The API never reports anything else today; don't pretend to render live data we have no view for.
            <ErrorState error={new Error(`Unexpected live state "${live.state}".`)} />
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <RadioTowerIcon aria-hidden className="size-4" />
                    Live timing unavailable
                  </CardTitle>
                  <CardDescription>
                    <Badge variant="outline" role="status">
                      Status: unavailable
                    </Badge>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p>{live.detail}</p>
                  <p className="text-muted-foreground">
                    Positions, gaps and lap times are never shown as live here, and recorded sessions are always labelled as replays.
                  </p>
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
