// Port of apps/app/src/components/pages/profile-view.tsx, in the web's phone layout.
import {
  type ApiResponse,
  average,
  type CareerSeason,
  type ClassificationEntry,
  type ConstructorProfile,
  driverName,
  type DriverProfile,
  type DriverStanding,
  formatPoints,
  type SeasonResults,
  seasonStats,
  type Standings,
  type Stats,
  sumStats,
  titles,
} from "@pitwall/shared";
import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { ErrorState, QueryState, SourceNote } from "@/components/data";
import { Headshot, Stat } from "@/components/racing";
import { Label, PageHeader, Panel, Row, Screen, Skeleton, T, TextLink } from "@/components/ui";
import { apiGet, useApi } from "@/lib/api";
import { useSeason } from "@/lib/hooks";

type Kind = "drivers" | "teams";
const ID = /^[a-z0-9_]{1,64}$/;
/** OpenF1 seasons: cheap to add up, unlike Jolpica's rate-limited history. */
const TOTALS_FROM = 2023;

const avg = (sum: number, n: number) => {
  const a = average(sum, n);
  return a === null ? "—" : a.toFixed(1);
};

function Head({ cells }: { cells: [string, number | undefined][] }) {
  return (
    <Row style={{ minHeight: 28 }}>
      {cells.map(([label, width]) => (
        <T key={label} f="medium" s={12} c="mutedForeground" style={{ width, flex: width ? undefined : 1, textAlign: width ? "right" : "left" }}>
          {label}
        </T>
      ))}
    </Row>
  );
}

function CareerTable({ career, seasonsTotal, kind, id }: { career: CareerSeason[]; seasonsTotal: number; kind: Kind; id: string }) {
  const page = kind === "drivers" ? "/driver" : "/team";
  return (
    <View style={{ gap: 8 }}>
      <View accessibilityLabel="Championship result per season">
        <Head cells={[["Season", undefined], ["Pos", 48], ["Pts", 64], ["Wins", 48]]} />
        {career.map((c) => (
          <Row key={c.season}>
            <View style={{ flex: 1 }}>
              <TextLink href={{ pathname: page, params: { id, season: c.season } }} f="mono">{c.season}</TextLink>
            </View>
            <T f="mono" style={{ width: 48, textAlign: "right" }}>{c.positionText}</T>
            <T f="mono" style={{ width: 64, textAlign: "right" }}>{formatPoints(c.points)}</T>
            <T f="mono" style={{ width: 48, textAlign: "right" }}>{c.wins}</T>
          </Row>
        ))}
      </View>
      {seasonsTotal > career.length && (
        <T s={12} c="mutedForeground">
          Showing championship results for the most recent seasons only ({seasonsTotal} seasons entered in total).
        </T>
      )}
    </View>
  );
}

function StatRow({ label, stats }: { label: string; stats: Stats }) {
  // OpenF1 season results carry no grid or fastest laps: those cells are left out, not shown as 0.
  const all: [string, string | number | null][] = [
    ["Starts", stats.starts],
    ["Wins", stats.wins],
    ["Podiums", stats.podiums],
    ["Grid P1", stats.gridP1],
    ["Fastest laps", stats.fastestLaps],
    ["Points finishes", stats.pointsFinishes],
    ["DNFs", stats.dnfs],
    ["Best finish", stats.bestFinish === null ? "—" : `P${stats.bestFinish}`],
    ["Avg grid", stats.gridP1 === null ? null : avg(stats.gridSum, stats.gridCount)],
    ["Avg finish", avg(stats.finishSum, stats.finishCount)],
  ];
  const cells = all.filter((c): c is [string, string | number] => c[1] !== null);
  return (
    <View accessibilityLabel={label} style={{ gap: 6 }}>
      <Label>{label}</Label>
      <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 8 }}>
        {cells.map(([k, v]) => (
          <Stat key={k} label={k} value={v} s={18} style={{ width: "33.33%" }} />
        ))}
      </View>
    </View>
  );
}

/** Every OpenF1-era season added up; nothing until all of them load, so the totals are never partial. */
function SinceTotals({ seasons, filter }: { seasons: number[]; filter: (e: ClassificationEntry) => boolean }) {
  const queries = useQueries({
    queries: seasons.map((season) => {
      // Same key as useApi, so the standings screen and this profile share the cache.
      const path = `/api/results?season=${season}`;
      return { queryKey: [path], queryFn: ({ signal }: { signal: AbortSignal }) => apiGet<SeasonResults>(path, signal) };
    }),
  });
  if (queries.some((q) => q.isError)) return <T s={12} c="mutedForeground">Totals since {TOTALS_FROM} are unavailable right now.</T>;
  if (queries.some((q) => !q.data?.data)) return <Skeleton height={56} />;
  const stats = sumStats(queries.map((q) => seasonStats(q.data!.data!, filter)));
  return <StatRow label={`Since ${TOTALS_FROM} (${seasons.length} seasons)`} stats={stats} />;
}

function SeasonRaces({ season, kind, id, results }: { season: number; kind: Kind; id: string; results: UseQueryResult<ApiResponse<SeasonResults>> }) {
  return (
    <QueryState query={results}>
      {(r) => {
        const rows = r.races.flatMap((race) =>
          race.results.filter((e) => (kind === "drivers" ? e.driver.id === id : e.constructor.id === id)).map((e) => ({ race, e })),
        );
        if (!rows.length) return <T c="mutedForeground">No race starts in {season}.</T>;
        return (
          <View accessibilityLabel={`${season} race results`}>
            <Head cells={[["Rd", 32], ["Grand Prix", undefined], ["Pos", 48], ["Pts", 40]]} />
            {rows.map(({ race, e }) => (
              <Row key={`${race.round}-${e.driver.id}`}>
                <T f="mono" style={{ width: 32 }}>{race.round}</T>
                <View style={{ flex: 1, gap: 2 }}>
                  <TextLink href={{ pathname: "/race", params: { season, round: race.round } }} f="regular" numberOfLines={1}>{race.name}</TextLink>
                  {kind === "teams" && <T s={12} c="mutedForeground">{e.driver.familyName}</T>}
                </View>
                <T f="mono" numberOfLines={1} style={{ width: 48, textAlign: "right" }}>{/^\d+$/.test(e.positionText) ? e.positionText : e.status}</T>
                <T f="mono" style={{ width: 40, textAlign: "right" }}>{formatPoints(e.points)}</T>
              </Row>
            ))}
          </View>
        );
      }}
    </QueryState>
  );
}

export function ProfileScreen({ kind }: { kind: Kind }) {
  const params = useLocalSearchParams<{ id: string; season?: string }>();
  const chosen = useSeason().season;
  const id = params.id ?? "";
  const season = Number(params.season) || chosen;
  const valid = ID.test(id);
  const profile = useApi<DriverProfile | ConstructorProfile>(valid ? `/api/${kind}/${id}` : null);
  return (
    <Screen>
      {!valid ? (
        <ErrorState error={new Error("This link is missing a valid id.")} />
      ) : (
        <QueryState
          query={profile}
          loading={
            <View style={{ gap: 16 }}>
              <Skeleton height={73} />
              <Skeleton height={384} />
            </View>
          }
        >
          {(p, res) => <Profile p={p} res={res} kind={kind} id={id} season={season} />}
        </QueryState>
      )}
    </Screen>
  );
}

function Profile({ p, res, kind, id, season }: { p: DriverProfile | ConstructorProfile; res: ApiResponse<DriverProfile | ConstructorProfile>; kind: Kind; id: string; season: number | null }) {
  const shownSeason = season && p.seasons.includes(season) ? season : p.seasons[0];
  const results = useApi<SeasonResults>(shownSeason ? `/api/results?season=${shownSeason}` : null);
  const isDriver = "driver" in p;
  // The headshot comes with OpenF1 standings, which the standings screen has usually cached already.
  const standings = useApi<Standings<DriverStanding>>(isDriver && shownSeason && shownSeason >= TOTALS_FROM ? `/api/standings/drivers?season=${shownSeason}` : null);
  const headshot = standings.data?.data?.entries.find((e) => e.driver.id === id)?.headshot;
  const filter = (e: ClassificationEntry) => (isDriver ? e.driver.id === id : e.constructor.id === id);
  const recent = p.seasons.filter((y) => y >= TOTALS_FROM);
  const t = titles(p.career, p.seasonsTotal);
  const title = isDriver ? driverName(p.driver) : p.constructor.name;
  const bits = isDriver
    ? [p.driver.code, p.driver.number !== null && `#${p.driver.number}`, p.driver.nationality, p.driver.dateOfBirth && `born ${p.driver.dateOfBirth}`]
    : [p.constructor.nationality];

  return (
    <>
      <PageHeader title={title} description={bits.filter(Boolean).join(" · ")}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 20 }}>
          <Stat
            label={isDriver ? "World titles" : "Constructors' titles"}
            value={
              <T f="mono" s={24}>
                {t.count}
                {t.since !== null && <T s={12} c="mutedForeground">{`  since ${t.since}`}</T>}
              </T>
            }
          />
          <Stat label="Best championship" s={24} value={t.best === null ? "—" : `P${t.best}`} />
          <View style={{ flex: 1 }} />
          {isDriver && headshot && <Headshot src={headshot} number={p.driver.number} size={96} />}
        </View>
      </PageHeader>
      {shownSeason && (
        <QueryState query={results} loading={<Skeleton height={56} />}>
          {(r) => <StatRow label={`${shownSeason} Grands Prix`} stats={seasonStats(r, filter)} />}
        </QueryState>
      )}
      {/* One OpenF1 season is just the row above. */}
      {recent.length > 1 && <SinceTotals seasons={recent} filter={filter} />}
      <Panel title="Championship history" description={`${p.seasons.length} season${p.seasons.length === 1 ? "" : "s"}, ${p.seasons.at(-1)}-${p.seasons[0]}`}>
        <View style={{ gap: 8 }}>
          <CareerTable career={p.career} seasonsTotal={p.seasonsTotal} kind={kind} id={id} />
          <SourceNote res={res} />
        </View>
      </Panel>
      {shownSeason && (
        <Panel title={`${shownSeason} races`} description={shownSeason !== season && season ? `No entries in ${season}; showing their latest season.` : undefined}>
          <SeasonRaces season={shownSeason} kind={kind} id={id} results={results} />
        </Panel>
      )}
    </>
  );
}
