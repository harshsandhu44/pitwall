"use client";

import { type GrandPrix, type RaceWeekendResults, scheduleState } from "@pitwall/shared";
import { ChevronLeftIcon, ChevronRightIcon, HistoryIcon, RadioTowerIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EmptyState, ErrorState, QueryState, SourceNote } from "@/components/data/query-state";
import { PageHeader } from "@/components/pages/page-header";
import { CircuitOutline } from "@/components/racing/circuit-outline";
import { ClassificationTable, QualifyingTable } from "@/components/racing/classification-table";
import { ProvisionalNote } from "@/components/racing/provisional-note";
import { SessionSchedule } from "@/components/racing/session-schedule";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RaceWeather } from "@/components/weather/race-weather";
import { useApi } from "@/lib/api";
import { formatDateRange, formatHour } from "@/lib/format";
import { useCalendar, useNow, useReplaySessions, useSeasons } from "@/lib/hooks";

const TABS = ["results", "weather", "sessions"] as const;
type Tab = (typeof TABS)[number];

export function RaceView() {
  const params = useSearchParams();
  const season = Number(params.get("season"));
  const round = Number(params.get("round"));
  const valid = Number.isInteger(season) && season >= 1950 && Number.isInteger(round) && round >= 1;
  const weekend = useApi<RaceWeekendResults>(valid ? `/api/races/${round}?season=${season}` : null);
  const calendar = useCalendar(valid ? season : null);
  const router = useRouter();
  const pathname = usePathname();
  // Forecasts only exist for the newest season; recorded sessions only from 2023.
  const newest = useSeasons().data?.data?.[0];
  const shown = TABS.filter((t) => t === "results" || (t === "weather" ? season === newest : season >= 2023));
  const asked = params.get("tab") as Tab;
  const tab: Tab = shown.includes(asked) ? asked : "results";
  const setTab = (v: Tab) => {
    const p = new URLSearchParams(params);
    p.set("tab", v);
    router.replace(`${pathname}?${p}`, { scroll: false });
  };

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
        const firstResult = results.length ? "race" : qualifying.length ? "qualifying" : sprint.length ? "sprint" : sprintQualifying.length ? "sprintQualifying" : "race";
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
            <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
              <TabsList className="mb-4" variant="line">
                <TabsTrigger value="results">Results</TabsTrigger>
                {shown.includes("weather") && <TabsTrigger value="weather">Weather</TabsTrigger>}
                {shown.includes("sessions") && <TabsTrigger value="sessions">Sessions</TabsTrigger>}
              </TabsList>
              <TabsContent value="results">
                <div className="grid gap-4 lg:grid-cols-3">
                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle>Classification</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {[results, qualifying, sprint, sprintQualifying].some((x) => x.length > 0) && <ProvisionalNote race={race} className="mb-3" />}
                      <Tabs defaultValue={firstResult}>
                        <TabsList className="mb-3 flex-wrap">
                          <TabsTrigger value="race">Race</TabsTrigger>
                          <TabsTrigger value="qualifying">Qualifying</TabsTrigger>
                          {(sprint.length > 0 || race.sessions.some((s) => s.kind === "SPRINT")) && <TabsTrigger value="sprint">Sprint</TabsTrigger>}
                          {(sprintQualifying.length > 0 || race.sessions.some((s) => s.kind === "SPRINT_QUALIFYING")) && (
                            <TabsTrigger value="sprintQualifying">Sprint Qualifying</TabsTrigger>
                          )}
                        </TabsList>
                        <TabsContent value="race">
                          <ClassificationTable entries={results} season={race.season} caption={`${race.name} race classification`} />
                        </TabsContent>
                        <TabsContent value="qualifying">
                          <QualifyingTable entries={qualifying} season={race.season} caption={`${race.name} qualifying classification`} />
                        </TabsContent>
                        <TabsContent value="sprint">
                          <ClassificationTable entries={sprint} season={race.season} caption={`${race.name} sprint classification`} />
                        </TabsContent>
                        <TabsContent value="sprintQualifying">
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
              </TabsContent>
              {shown.includes("weather") && (
                <TabsContent value="weather">
                  <NowGate>{(now) => <RaceWeather race={race} now={now} />}</NowGate>
                </TabsContent>
              )}
              {shown.includes("sessions") && (
                <TabsContent value="sessions">
                  <WeekendSessions race={race} />
                </TabsContent>
              )}
            </Tabs>
          </>
        );
      }}
    </QueryState>
  );
}

/** Weather needs the current time, which is only known on the client. */
function NowGate({ children }: { children: (now: number) => React.ReactNode }) {
  const now = useNow();
  return now === null ? <Skeleton className="h-96 w-full" /> : children(now);
}

/** This weekend's OpenF1 sessions: replay links once recorded, the live page while one is scheduled. */
function WeekendSessions({ race }: { race: GrandPrix }) {
  const sessions = useReplaySessions(race.season);
  const now = useNow();
  // Match by date rather than name: OpenF1's meeting names don't always match Jolpica's race names.
  const times = race.sessions.map((s) => Date.parse(s.start ?? s.date));
  const from = Math.min(...times) - 86_400_000;
  const to = Math.max(...times) + 86_400_000;
  const live = now !== null && race.sessions.some((s) => scheduleState(s, now) === "in_window");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sessions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {live && (
          <Link href="/live" className="flex items-center gap-2 bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground uppercase">
            <RadioTowerIcon aria-hidden className="size-4" />
            A session is scheduled now: open live timing
          </Link>
        )}
        <QueryState query={sessions} loading={<Skeleton className="h-40 w-full" />}>
          {(list, res) => {
            const mine = list.filter((s) => Date.parse(s.start) >= from && Date.parse(s.start) <= to);
            return mine.length ? (
              <div className="space-y-2">
                <ul className="divide-y">
                  {mine.map((s) => (
                    <li key={s.key}>
                      <Link
                        href={`/replay?season=${race.season}&session=${s.key}`}
                        className="flex items-center gap-3 py-2.5 hover:bg-muted/50 focus-visible:bg-muted/50"
                      >
                        <HistoryIcon aria-hidden className="size-4 text-muted-foreground" />
                        <span className="flex-1 font-medium">{s.name}</span>
                        <span className="font-mono text-xs text-muted-foreground tabular-nums">{formatHour(s.start)}</span>
                        <span className="text-xs font-semibold text-live uppercase">Replay</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <SourceNote res={res} />
              </div>
            ) : (
              <EmptyState>No recorded sessions for this weekend yet. Sessions appear about two hours after they end.</EmptyState>
            );
          }}
        </QueryState>
      </CardContent>
    </Card>
  );
}
