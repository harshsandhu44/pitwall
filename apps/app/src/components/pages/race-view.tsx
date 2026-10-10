"use client";

import type { RaceWeekendResults, ResultSession } from "@pitwall/shared";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ErrorState, QueryState, SourceNote } from "@/components/data/query-state";
import { PageHeader } from "@/components/pages/page-header";
import { CircuitOutline } from "@/components/racing/circuit-outline";
import { ClassificationTable, QualifyingTable } from "@/components/racing/classification-table";
import { SessionSchedule } from "@/components/racing/session-schedule";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApi } from "@/lib/api";
import { formatDateRange } from "@/lib/format";
import { useCalendar } from "@/lib/hooks";

/** Shown above a classification that came from OpenF1 instead of Jolpica. */
function OpenF1Note({ session, weekend }: { session: ResultSession; weekend: RaceWeekendResults }) {
  if (!(weekend.fromOpenF1 ?? []).includes(session)) return null;
  const sq = session === "sprintQualifying";
  return (
    <p className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <Badge variant="outline">{sq ? "OpenF1 timing data" : "Provisional · OpenF1"}</Badge>
      {sq
        ? "Jolpica doesn't publish sprint qualifying, so this comes from OpenF1's timing data."
        : "Jolpica hasn't published this yet. This is OpenF1's classification from timing data, before any later stewards' decisions, and is replaced by the official result once Jolpica publishes it."}
    </p>
  );
}

export function RaceView() {
  const params = useSearchParams();
  const season = Number(params.get("season"));
  const round = Number(params.get("round"));
  const valid = Number.isInteger(season) && season >= 1950 && Number.isInteger(round) && round >= 1;
  const weekend = useApi<RaceWeekendResults>(valid ? `/api/races/${round}?season=${season}` : null);
  const calendar = useCalendar(valid ? season : null);

  if (!valid) return <ErrorState error={new Error("This link is missing a valid season and round.")} />;
  const rounds = calendar.data?.data?.map((r) => r.round) ?? [];
  const nav = (r: number | undefined, label: string, Icon: typeof ChevronLeftIcon) =>
    r ? (
      <Link href={`/race?season=${season}&round=${r}`} className={buttonVariants({ variant: "outline", size: "sm" })} aria-label={`${label} round`}>
        <Icon aria-hidden />
        R{r}
      </Link>
    ) : null;

  return (
    <QueryState query={weekend} loading={<Skeleton className="h-96 w-full" />}>
      {(data, res) => {
        const { race, results, qualifying, sprint } = data;
        const sprintQualifying = data.sprintQualifying ?? [];
        // Open on the most significant session that has a classification.
        const tab = results.length ? "race" : qualifying.length ? "qualifying" : sprint.length ? "sprint" : sprintQualifying.length ? "sprintQualifying" : "race";
        return (
          <>
            <PageHeader
              title={`${race.season} ${race.name}`}
              description={`Round ${race.round} · ${race.circuit.name}, ${race.circuit.locality}, ${race.circuit.country} · ${formatDateRange(race.sessions)}`}
            >
              <div className="flex gap-2">
                {nav(rounds.filter((r) => r < round).at(-1), "Previous", ChevronLeftIcon)}
                {nav(rounds.find((r) => r > round), "Next", ChevronRightIcon)}
              </div>
            </PageHeader>
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Classification</CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue={tab}>
                    <TabsList className="mb-3 flex-wrap">
                      <TabsTrigger value="race">Race</TabsTrigger>
                      <TabsTrigger value="qualifying">Qualifying</TabsTrigger>
                      {(sprint.length > 0 || race.sessions.some((s) => s.kind === "SPRINT")) && <TabsTrigger value="sprint">Sprint</TabsTrigger>}
                      {(sprintQualifying.length > 0 || race.sessions.some((s) => s.kind === "SPRINT_QUALIFYING")) && (
                        <TabsTrigger value="sprintQualifying">Sprint Qualifying</TabsTrigger>
                      )}
                    </TabsList>
                    <TabsContent value="race">
                      <OpenF1Note session="results" weekend={data} />
                      <ClassificationTable entries={results} season={race.season} caption={`${race.name} race classification`} />
                    </TabsContent>
                    <TabsContent value="qualifying">
                      <OpenF1Note session="qualifying" weekend={data} />
                      <QualifyingTable entries={qualifying} season={race.season} caption={`${race.name} qualifying classification`} />
                    </TabsContent>
                    <TabsContent value="sprint">
                      <OpenF1Note session="sprint" weekend={data} />
                      <ClassificationTable entries={sprint} season={race.season} caption={`${race.name} sprint classification`} />
                    </TabsContent>
                    <TabsContent value="sprintQualifying">
                      <OpenF1Note session="sprintQualifying" weekend={data} />
                      <QualifyingTable entries={sprintQualifying} season={race.season} caption={`${race.name} sprint qualifying classification`} stage="SQ" />
                    </TabsContent>
                  </Tabs>
                  <div className="mt-3">
                    <SourceNote res={res} />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Weekend</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <CircuitOutline circuit={race.circuit} className="mx-auto w-40" />
                  {race.circuit.layout?.lengthKm && (
                    <p className="text-center text-xs text-muted-foreground">
                      Lap length <span className="font-mono text-foreground">{race.circuit.layout.lengthKm.toFixed(3)} km</span>
                    </p>
                  )}
                  <SessionSchedule race={race} />
                </CardContent>
              </Card>
            </div>
          </>
        );
      }}
    </QueryState>
  );
}
