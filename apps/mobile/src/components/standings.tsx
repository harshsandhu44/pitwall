// Ports of apps/app/src/components/standings/{driver,constructor}-standings-table.tsx in the web's phone layout
// (team under the name, gap under the points). ponytail: no search or sort yet; add when the full list needs it.
import { type ConstructorStanding, driverName, type DriverStanding, formatPoints, type PointsProgression, type Standings } from "@pitwall/shared";
import { useMemo } from "react";
import { View } from "react-native";
import Animated from "react-native-reanimated";
import { CountUp, useRiseIn } from "@/lib/motion";
import { EmptyState } from "./data";
import { lastTwo, PositionChange, TeamMark } from "./racing";
import { Row, T, TextLink } from "./ui";

function Head({ cells }: { cells: [string, number | undefined, "left" | "right"][] }) {
  return (
    <Row style={{ minHeight: 28 }}>
      {cells.map(([label, width, align]) => (
        <T key={label} f="medium" s={12} c="mutedForeground" style={{ width, flex: width ? undefined : 1, textAlign: align }}>
          {label}
        </T>
      ))}
    </Row>
  );
}

function Pos({ text, leader, change }: { text: string; leader: boolean; change?: ReturnType<typeof lastTwo> }) {
  return (
    <View style={{ width: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingRight: 4 }}>
      <T f={leader ? "monoSemibold" : "mono"} c={leader ? "live" : "foreground"}>{text}</T>
      {change && <PositionChange {...change} />}
    </View>
  );
}

function Points({ points, leader, compact }: { points: number; leader: number; compact: boolean }) {
  return (
    <View style={{ width: 64, alignItems: "flex-end" }}>
      <T f="monoMedium">
        <CountUp value={points} format={formatPoints} />
      </T>
      {!compact && points !== leader && <T f="mono" s={12} c="mutedForeground">−{formatPoints(leader - points)}</T>}
    </View>
  );
}

export function DriverStandingsTable({ standings, progression, limit }: { standings: Standings<DriverStanding>; progression?: PointsProgression; limit?: number }) {
  const riseIn = useRiseIn();
  const changes = useMemo(() => {
    // Only trust the progression when it ends at the same round as these standings.
    if (!progression || progression.rounds.at(-1)?.round !== standings.round) return new Map<string, ReturnType<typeof lastTwo>>();
    return new Map(progression.drivers.map((d) => [d.driver.id, lastTwo(d.positions)]));
  }, [progression, standings.round]);
  if (!standings.entries.length) return <EmptyState>No driver standings yet for {standings.season}.</EmptyState>;
  const leader = standings.entries[0]!.points;
  const rows = limit ? standings.entries.slice(0, limit) : standings.entries;
  return (
    <View accessibilityLabel={`${standings.season} drivers' championship after round ${standings.round}`}>
      <Head cells={[["Pos", 52, "left"], ["Driver", undefined, "left"], ["Pts", 64, "right"]]} />
      {rows.map((e, i) => (
        <Animated.View key={e.driver.id} entering={riseIn(i, rows.length)}>
          <Row>
            <Pos text={e.positionText} leader={e.position === 1} change={changes.get(e.driver.id)} />
            <View style={{ flex: 1, gap: 2 }}>
              <T>
                <TextLink href={{ pathname: "/driver", params: { id: e.driver.id, season: standings.season } }}>{driverName(e.driver)}</TextLink>
                {e.driver.code && <T f="mono" s={11} c="mutedForeground">{`  ${e.driver.code}`}</T>}
              </T>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                {e.constructors.at(-1) && <TeamMark id={e.constructors.at(-1)!.id} season={standings.season} />}
                <T s={12} c="mutedForeground" numberOfLines={1} style={{ flex: 1 }}>
                  {e.constructors.map((c) => c.name).join(" / ")}
                </T>
              </View>
            </View>
            <Points points={e.points} leader={leader} compact={limit !== undefined} />
          </Row>
        </Animated.View>
      ))}
    </View>
  );
}

export function ConstructorStandingsTable({
  standings,
  progression,
  limit,
}: {
  standings: Standings<ConstructorStanding>;
  progression?: PointsProgression;
  limit?: number;
}) {
  const riseIn = useRiseIn();
  const changes = useMemo(() => {
    if (!progression || progression.rounds.at(-1)?.round !== standings.round) return new Map<string, ReturnType<typeof lastTwo>>();
    return new Map(progression.constructors.map((c) => [c.constructor.id, lastTwo(c.positions)]));
  }, [progression, standings.round]);
  if (!standings.entries.length) {
    return (
      <EmptyState>
        No constructors&apos; championship standings for {standings.season}
        {standings.season < 1958 ? ". The constructors' championship began in 1958." : " yet."}
      </EmptyState>
    );
  }
  const leader = standings.entries[0]!.points;
  const rows = limit ? standings.entries.slice(0, limit) : standings.entries;
  return (
    <View accessibilityLabel={`${standings.season} constructors' championship after round ${standings.round}`}>
      <Head cells={[["Pos", 52, "left"], ["Constructor", undefined, "left"], ["Pts", 64, "right"]]} />
      {rows.map((e, i) => (
        <Animated.View key={e.constructor.id} entering={riseIn(i, rows.length)}>
          <Row>
            <Pos text={e.positionText} leader={e.position === 1} change={changes.get(e.constructor.id)} />
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
              <TeamMark id={e.constructor.id} season={standings.season} />
              <TextLink href={{ pathname: "/team", params: { id: e.constructor.id, season: standings.season } }} style={{ flex: 1 }}>
                {e.constructor.name}
              </TextLink>
            </View>
            <Points points={e.points} leader={leader} compact={limit !== undefined} />
          </Row>
        </Animated.View>
      ))}
    </View>
  );
}
