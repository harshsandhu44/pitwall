// Port of apps/app/src/components/pages/roster-view.tsx: the season's drivers, or its teams, with their stats.
import {
  type ConstructorStanding,
  driverName,
  type DriverStanding,
  formatPoints,
  isStart,
  roster,
  type RosterTeam,
  type SeasonResults,
  seasonStats,
  type Standings,
} from "@pitwall/shared";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";
import { EmptyState, QueryState, SourceNote } from "@/components/data";
import { Headshot, Stat, TeamMark } from "@/components/racing";
import { Cut, PageHeader, Screen, Segmented, Skeleton, T, TextLink } from "@/components/ui";
import { useApi } from "@/lib/api";
import { useSeason, useTeamColours } from "@/lib/hooks";
import { useRiseIn } from "@/lib/motion";
import { useTheme } from "@/theme/theme";

type Kind = "drivers" | "teams";

/** Standings position for sorting; anyone not in the standings goes last. */
const rank = (pos: number | null | undefined) => pos ?? Number.MAX_SAFE_INTEGER;

const Loading = () => (
  <View style={{ gap: 12 }} accessibilityLabel="Loading">
    {Array.from({ length: 6 }, (_, i) => (
      <Skeleton key={i} height={128} />
    ))}
  </View>
);

function DriverTiles({ season, results, drivers }: { season: number; results: SeasonResults; drivers?: Standings<DriverStanding> }) {
  const { c } = useTheme();
  const riseIn = useRiseIn();
  const colours = useTeamColours(season).data?.data ?? {};
  const standing = new Map(drivers?.entries.map((e) => [e.driver.id, e]));
  // One tile per driver, with every team they started for in the order they raced for it.
  const byDriver = new Map<string, { driver: RosterTeam["drivers"][number]["driver"]; teams: RosterTeam["constructor"][] }>();
  for (const race of results.races) {
    for (const e of race.results) {
      if (!isStart(e)) continue;
      const key = e.driver.id || `#${e.number}`;
      const row = byDriver.get(key) ?? { driver: e.driver, teams: [] };
      if (!row.teams.some((t) => t.id === e.constructor.id && t.name === e.constructor.name)) row.teams.push(e.constructor);
      byDriver.set(key, row);
    }
  }
  const tiles = [...byDriver.values()].sort((a, b) => rank(standing.get(a.driver.id)?.position) - rank(standing.get(b.driver.id)?.position));

  return (
    <View style={{ gap: 12 }}>
      {tiles.map(({ driver, teams }, i) => {
        const st = standing.get(driver.id);
        const s = seasonStats(results, (e) => e.driver.id === driver.id);
        const colour = colours[teams.at(-1)?.id ?? ""];
        const body = (pressed: boolean) => (
          <View style={{ flexDirection: "row", gap: 12, padding: 12, borderWidth: 1, borderColor: pressed ? c.live : c.border, backgroundColor: c.card }}>
            <View style={{ alignSelf: "flex-end", backgroundColor: `${c.muted}66` }}>
              <Headshot src={st?.headshot} number={driver.number} colour={colour} size={80} />
            </View>
            <View style={{ flex: 1, gap: 8 }}>
              <View style={{ gap: 2 }}>
                <T f="mono" s={12} c="mutedForeground">
                  {st?.position ? `P${st.position}` : "—"}
                  {driver.number !== null && ` · #${driver.number}`}
                </T>
                <T f="semibold" numberOfLines={1}>{driverName(driver)}</T>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <TeamMark colour={colours[teams.at(-1)?.id ?? ""]} />
                  <T s={12} c="mutedForeground" numberOfLines={1} style={{ flex: 1 }}>{teams.map((t) => t.name).join(" / ")}</T>
                </View>
              </View>
              <View style={{ flexDirection: "row" }}>
                <Stat style={{ flex: 1 }} label="Pts" value={st ? formatPoints(st.points) : "—"} />
                <Stat style={{ flex: 1 }} label="Wins" value={s.wins} />
                <Stat style={{ flex: 1 }} label="Podiums" value={s.podiums} />
                <Stat style={{ flex: 1 }} label="Starts" value={s.starts} />
              </View>
            </View>
            <Cut />
          </View>
        );
        return (
          <Animated.View key={driver.id || `${driver.givenName} ${driver.familyName}`} entering={riseIn(i, tiles.length)}>
            {/* Unmapped OpenF1 drivers have no profile to link to. */}
            {driver.id ? (
              <Link href={{ pathname: "/driver", params: { id: driver.id, season } }} asChild>
                <Pressable accessibilityRole="link">{({ pressed }) => body(pressed)}</Pressable>
              </Link>
            ) : (
              body(false)
            )}
          </Animated.View>
        );
      })}
    </View>
  );
}

function TeamBlocks({
  season,
  results,
  teams,
  constructors,
  drivers,
}: {
  season: number;
  results: SeasonResults;
  teams: RosterTeam[];
  constructors?: Standings<ConstructorStanding>;
  drivers?: Standings<DriverStanding>;
}) {
  const { c } = useTheme();
  const riseIn = useRiseIn();
  const colours = useTeamColours(season).data?.data ?? {};
  const standing = new Map(constructors?.entries.map((e) => [e.constructor.id, e]));
  const headshots = new Map(drivers?.entries.map((e) => [e.driver.id, e.headshot]));
  const sorted = [...teams].sort((a, b) => rank(standing.get(a.constructor.id)?.position) - rank(standing.get(b.constructor.id)?.position));

  return (
    <View style={{ gap: 12 }}>
      {sorted.map(({ constructor: team, drivers: teamDrivers }, i) => {
        const st = standing.get(team.id);
        const s = seasonStats(results, (e) => e.constructor.id === team.id);
        const colour = colours[team.id];
        // Regulars did most of the season; anyone with under a third of the team's top tally is a stand-in.
        const regular = Math.max(...teamDrivers.map((d) => d.starts)) / 3;
        return (
          <Animated.View key={team.id || team.name} entering={riseIn(i, sorted.length)}>
            <View accessibilityLabel={team.name} style={{ gap: 12, padding: 16, paddingLeft: 20, borderWidth: 1, borderColor: c.border, backgroundColor: c.card }}>
              <View style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 4, backgroundColor: colour ?? `${c.mutedForeground}66` }} />
              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                {team.id ? (
                  <TextLink href={{ pathname: "/team", params: { id: team.id, season } }} f="displayBlack" s={16} upper track={-0.4}>
                    {team.name}
                  </TextLink>
                ) : (
                  <T f="displayBlack" s={16} upper track={-0.4}>{team.name}</T>
                )}
                <T f="mono" s={13}>
                  {st?.position ? <T f="mono" s={13} c="mutedForeground">P{st.position} · </T> : null}
                  {st ? `${formatPoints(st.points)} pts` : ""}
                </T>
              </View>
              <View style={{ flexDirection: "row" }}>
                <Stat style={{ flex: 1 }} label="Wins" value={s.wins} />
                <Stat style={{ flex: 1 }} label="Podiums" value={s.podiums} />
                <Stat style={{ flex: 1 }} label="Points finishes" value={s.pointsFinishes} />
                <Stat style={{ flex: 1 }} label="DNFs" value={s.dnfs} />
              </View>
              <View style={{ gap: 6 }}>
                {teamDrivers.map(({ driver, starts }) => {
                  const sub = starts < regular;
                  return (
                    <View key={driver.id || `#${driver.number}`} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      {!sub && (
                        <View style={{ backgroundColor: `${c.muted}66` }}>
                          <Headshot src={headshots.get(driver.id)} number={driver.number} colour={colour} size={36} />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        {driver.id ? (
                          <TextLink href={{ pathname: "/driver", params: { id: driver.id, season } }} f="regular" s={sub ? 12 : 14} c={sub ? "mutedForeground" : "foreground"} numberOfLines={1}>
                            {driverName(driver)}
                          </TextLink>
                        ) : (
                          <T s={sub ? 12 : 14} c={sub ? "mutedForeground" : "foreground"} numberOfLines={1}>{driverName(driver)}</T>
                        )}
                      </View>
                      <T f="mono" s={sub ? 12 : 14} c={sub ? "mutedForeground" : "foreground"}>
                        {starts} start{starts === 1 ? "" : "s"}
                      </T>
                    </View>
                  );
                })}
              </View>
              <Cut />
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

export default function Grid() {
  const { season } = useSeason();
  const [kind, setKind] = useState<Kind>("drivers");
  const s = season ? `season=${season}` : null;
  const results = useApi<SeasonResults>(s && `/api/results?${s}`);
  const drivers = useApi<Standings<DriverStanding>>(s && `/api/standings/drivers?${s}`);
  const constructors = useApi<Standings<ConstructorStanding>>(s && kind === "teams" ? `/api/standings/constructors?${s}` : null);

  return (
    <Screen>
      <PageHeader
        title={`${season ?? ""} ${kind === "drivers" ? "Drivers" : "Teams"}`}
        description="Grand Prix starts, wins and podiums. Points are the championship's, sprints included."
      >
        <Segmented
          value={kind}
          onChange={setKind}
          items={[
            { value: "drivers", label: "Drivers" },
            { value: "teams", label: "Teams" },
          ]}
        />
      </PageHeader>
      <QueryState query={results} loading={<Loading />}>
        {(r, res) => {
          const teams = roster(r);
          if (!season) return null;
          if (!teams.length) return <EmptyState>No races in {season} yet. Pick {season - 1} from the season menu.</EmptyState>;
          return (
            <View style={{ gap: 12 }}>
              {kind === "drivers" ? (
                <DriverTiles season={season} results={r} drivers={drivers.data?.data ?? undefined} />
              ) : (
                <TeamBlocks season={season} results={r} teams={teams} constructors={constructors.data?.data ?? undefined} drivers={drivers.data?.data ?? undefined} />
              )}
              <SourceNote res={res} />
            </View>
          );
        }}
      </QueryState>
    </Screen>
  );
}
