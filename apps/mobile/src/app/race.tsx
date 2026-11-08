// Port of apps/app/src/components/pages/race-view.tsx, Results tab (+ classification-table.tsx). Weather and
// Sessions (replays) stay web-only for now.
import {
  type ClassificationEntry,
  driverName,
  formatDateRange,
  formatPoints,
  type QualifyingEntry,
  type RaceWeekendResults,
} from "@pitwall/shared";
import { useLocalSearchParams } from "expo-router";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { EmptyState, ErrorState, QueryState, SourceNote } from "@/components/data";
import { CircuitOutline, ProvisionalNote, SessionSchedule, TeamMark } from "@/components/racing";
import { Button, PageHeader, Panel, Row, Screen, Segmented, Skeleton, T, TextLink } from "@/components/ui";
import { useApi } from "@/lib/api";
import { useCalendar } from "@/lib/hooks";
import { useTheme } from "@/theme/theme";

/** Drivers missing from the OpenF1 identity map have id "": no profile to link to. */
function DriverCell({ e, season, team = true }: { e: ClassificationEntry | QualifyingEntry; season: number; team?: boolean }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      {e.driver.id ? (
        <TextLink href={{ pathname: "/driver", params: { id: e.driver.id, season } }} numberOfLines={1}>{driverName(e.driver)}</TextLink>
      ) : (
        <T f="medium" numberOfLines={1}>{driverName(e.driver)}</T>
      )}
      {team && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <TeamMark id={e.constructor.id} season={season} />
          <T s={12} c="mutedForeground" numberOfLines={1} style={{ flex: 1 }}>{e.constructor.name}</T>
        </View>
      )}
    </View>
  );
}

const key = (e: { driver: { id: string }; number: number | null }) => e.driver.id || `car-${e.number}`;

function ClassificationTable({ entries, season }: { entries: ClassificationEntry[]; season: number }) {
  if (!entries.length) return <EmptyState>Not published yet.</EmptyState>;
  return (
    <View>
      <Row style={{ minHeight: 28 }}>
        <T f="medium" s={12} c="mutedForeground" style={{ width: 32 }}>Pos</T>
        <T f="medium" s={12} c="mutedForeground" style={{ flex: 1 }}>Driver</T>
        <T f="medium" s={12} c="mutedForeground">Time / status</T>
        <T f="medium" s={12} c="mutedForeground" style={{ width: 36, textAlign: "right" }}>Pts</T>
      </Row>
      {entries.map((e) => (
        <Row key={key(e)}>
          <T f={e.positionText === "1" ? "monoSemibold" : "mono"} c={e.positionText === "1" ? "live" : "foreground"} style={{ width: 32 }}>
            {e.positionText}
          </T>
          <DriverCell e={e} season={season} />
          <View style={{ alignItems: "flex-end" }}>
            <T f="mono" s={12}>{e.time ?? e.status}</T>
            {e.fastestLap?.rank === 1 && <FastestLap />}
          </View>
          <T f="mono" style={{ width: 36, textAlign: "right" }}>{formatPoints(e.points)}</T>
        </Row>
      ))}
    </View>
  );
}

/** The web's inverted "FL" tag for the race's fastest lap. */
function FastestLap() {
  const { c } = useTheme();
  return (
    <View accessibilityLabel="Fastest lap of the race" style={{ paddingHorizontal: 4, backgroundColor: c.foreground }}>
      <T f="monoSemibold" s={10} c="background">FL</T>
    </View>
  );
}

function QualifyingTable({ entries, season, stage = "Q" }: { entries: QualifyingEntry[]; season: number; stage?: string }) {
  if (!entries.length) return <EmptyState>No qualifying classification available.</EmptyState>;
  return (
    <View>
      <Row style={{ minHeight: 28 }}>
        <T f="medium" s={12} c="mutedForeground" style={{ width: 32 }}>Pos</T>
        <T f="medium" s={12} c="mutedForeground" style={{ flex: 1 }}>Driver</T>
        {[1, 2, 3].map((n) => (
          <T key={n} f="medium" s={12} c="mutedForeground" style={{ width: 62, textAlign: "right" }}>{`${stage}${n}`}</T>
        ))}
      </Row>
      {entries.map((e) => (
        <Row key={key(e)}>
          <T f={e.position === 1 ? "monoSemibold" : "mono"} c={e.position === 1 ? "live" : "foreground"} style={{ width: 32 }}>
            {e.position ?? "—"}
          </T>
          <DriverCell e={e} season={season} team={false} />
          {[e.q1, e.q2, e.q3].map((t, i) => (
            <T key={i} f="mono" s={11} style={{ width: 62, textAlign: "right" }}>{t ?? "—"}</T>
          ))}
        </Row>
      ))}
    </View>
  );
}

type Session = "race" | "qualifying" | "sprint" | "sprintQualifying";

function Classification({ data }: { data: RaceWeekendResults }) {
  const { race, results, qualifying, sprint } = data;
  const sprintQualifying = data.sprintQualifying ?? [];
  // Open on the most significant session that has a classification.
  const first: Session = results.length ? "race" : qualifying.length ? "qualifying" : sprint.length ? "sprint" : sprintQualifying.length ? "sprintQualifying" : "race";
  const [session, setSession] = useState<Session>(first);
  const items: { value: Session; label: string }[] = [
    { value: "race", label: "Race" },
    { value: "qualifying", label: "Qualifying" },
    ...(sprint.length > 0 || race.sessions.some((s) => s.kind === "SPRINT") ? [{ value: "sprint" as const, label: "Sprint" }] : []),
    ...(sprintQualifying.length > 0 || race.sessions.some((s) => s.kind === "SPRINT_QUALIFYING")
      ? [{ value: "sprintQualifying" as const, label: "Sprint Qualifying" }]
      : []),
  ];
  return (
    <View style={{ gap: 12 }}>
      <Segmented value={session} onChange={setSession} items={items} />
      {session === "race" && <ClassificationTable entries={results} season={race.season} />}
      {session === "qualifying" && <QualifyingTable entries={qualifying} season={race.season} />}
      {session === "sprint" && <ClassificationTable entries={sprint} season={race.season} />}
      {session === "sprintQualifying" && <QualifyingTable entries={sprintQualifying} season={race.season} stage="SQ" />}
    </View>
  );
}

export default function Race() {
  const params = useLocalSearchParams<{ season: string; round: string }>();
  const { width } = useWindowDimensions();
  const season = Number(params.season);
  const round = Number(params.round);
  const valid = Number.isInteger(season) && season >= 1950 && Number.isInteger(round) && round >= 1;
  const weekend = useApi<RaceWeekendResults>(valid ? `/api/races/${round}?season=${season}` : null);
  const rounds = useCalendar(valid ? season : null).data?.data?.map((r) => r.round) ?? [];
  if (!valid) {
    return (
      <Screen>
        <ErrorState error={new Error("This link is missing a valid season and round.")} />
      </Screen>
    );
  }
  const prev = rounds.filter((r) => r < round).at(-1);
  const next = rounds.find((r) => r > round);
  return (
    <Screen>
      <QueryState
        query={weekend}
        loading={
          <View style={{ gap: 16 }}>
            <Skeleton height={73} />
            <Skeleton height={384} />
          </View>
        }
      >
        {(data, res) => {
          const { race, results, qualifying, sprint } = data;
          // Nothing classified yet: the schedule is what matters, so it leads.
          const upcoming = ![results, qualifying, sprint, data.sprintQualifying ?? []].some((x) => x.length > 0);
          const weekendPanel = (
            <Panel title="Weekend">
              <View style={{ gap: 16 }}>
                <View style={{ alignItems: "center" }}>
                  <CircuitOutline circuit={race.circuit} size={Math.min(width - 90, 260)} />
                </View>
                {race.circuit.layout?.lengthKm && (
                  <T s={12} c="mutedForeground" style={{ textAlign: "center" }}>
                    Lap length <T f="mono" s={12}>{race.circuit.layout.lengthKm.toFixed(3)} km</T>
                  </T>
                )}
                <SessionSchedule race={race} />
              </View>
            </Panel>
          );
          return (
            <>
              <PageHeader
                title={`${race.season} ${race.name}`}
                description={`Round ${race.round} · ${race.circuit.name}, ${race.circuit.locality}, ${race.circuit.country} · ${formatDateRange(race.sessions)}`}
              >
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {prev && <Button variant="outline" icon={ChevronLeft} label={`R${prev}`} accessibilityLabel="Previous round" href={{ pathname: "/race", params: { season, round: prev } }} />}
                  {next && <Button variant="outline" icon={ChevronRight} label={`R${next}`} accessibilityLabel="Next round" href={{ pathname: "/race", params: { season, round: next } }} />}
                </View>
              </PageHeader>
              {upcoming && weekendPanel}
              <Panel title="Classification">
                <View style={{ gap: 12 }}>
                  {!upcoming && <ProvisionalNote race={race} />}
                  <Classification data={data} />
                  <SourceNote res={res} />
                </View>
              </Panel>
              {!upcoming && weekendPanel}
            </>
          );
        }}
      </QueryState>
    </Screen>
  );
}
