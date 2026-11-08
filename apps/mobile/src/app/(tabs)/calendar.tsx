// Port of apps/app/src/components/pages/calendar-view.tsx. The web previews podiums on hover; here a finished
// round's podium opens on tap, so each round is still fetched only when asked for.
import {
  type ClassificationEntry,
  driverName,
  finalAt,
  formatDateRange,
  formatSessionTime,
  type GrandPrix,
  type RaceWeekendResults,
  scheduleState,
} from "@pitwall/shared";
import { Link } from "expo-router";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";
import { QueryState, SourceNote } from "@/components/data";
import { CircuitOutline, TeamMark } from "@/components/racing";
import { Badge, Label, PageHeader, Screen, Skeleton, T } from "@/components/ui";
import { useApi } from "@/lib/api";
import { useCalendar, useNow, useSeason } from "@/lib/hooks";
import { useRiseIn } from "@/lib/motion";
import { useTheme } from "@/theme/theme";

function Podium({ title, entries, season }: { title: string; entries: ClassificationEntry[]; season: number }) {
  return (
    <View style={{ gap: 6 }}>
      <Label>{title}</Label>
      {entries.length ? (
        entries.slice(0, 3).map((e) => (
          <View key={e.driver.id || e.number} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <T f={e.positionText === "1" ? "monoSemibold" : "mono"} c={e.positionText === "1" ? "live" : "mutedForeground"} style={{ width: 16 }}>
              {e.positionText}
            </T>
            <TeamMark id={e.constructor.id} season={season} />
            <T f="medium" numberOfLines={1} style={{ flex: 1 }}>{driverName(e.driver)}</T>
            <T f="mono" s={12} c="mutedForeground">{e.time ?? e.status}</T>
          </View>
        ))
      ) : (
        <T c="mutedForeground">No results yet.</T>
      )}
    </View>
  );
}

/** Mounted only once opened, so each round is fetched on demand (the race screen reuses it). */
function Podiums({ race }: { race: GrandPrix }) {
  const weekend = useApi<RaceWeekendResults>(`/api/races/${race.round}?season=${race.season}`);
  const now = useNow();
  return (
    <QueryState query={weekend} loading={<Skeleton height={144} />}>
      {(r) => (
        <View style={{ gap: 12 }}>
          <Podium title="Grand Prix" entries={r.results} season={race.season} />
          {race.sessions.some((s) => s.kind === "SPRINT") && <Podium title="Sprint" entries={r.sprint} season={race.season} />}
          {now < finalAt(race) && <Badge variant="outline">Provisional</Badge>}
        </View>
      )}
    </QueryState>
  );
}

function RaceCard({ race, isNext }: { race: GrandPrix; isNext: boolean }) {
  const { c } = useTheme();
  const now = useNow();
  const [open, setOpen] = useState(false);
  const raceSession = race.sessions.find((s) => s.kind === "RACE")!;
  const done = scheduleState(raceSession, now) === "finished";
  const scored = race.sessions.some((s) => (s.kind === "RACE" || s.kind === "SPRINT") && scheduleState(s, now) === "finished");
  return (
    <View style={{ borderWidth: 1, borderColor: isNext ? c.live : c.border, borderLeftWidth: isNext ? 4 : 1, backgroundColor: isNext ? `${c.live}14` : c.card }}>
      <Link href={{ pathname: "/race", params: { season: race.season, round: race.round } }} asChild>
        <Pressable accessibilityRole="link" style={({ pressed }) => ({ flexDirection: "row", gap: 12, padding: 12, backgroundColor: pressed ? c.muted : undefined })}>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <T f="mono" s={12} c="mutedForeground">R{String(race.round).padStart(2, "0")}</T>
              {isNext && <Badge>Next</Badge>}
              {done && <Badge variant="secondary">Completed</Badge>}
              {race.sessions.some((s) => s.kind === "SPRINT") && <Badge variant="outline">Sprint</Badge>}
            </View>
            <T f="semibold" numberOfLines={1} c={done ? "mutedForeground" : "foreground"}>{race.name}</T>
            <T s={12} c="mutedForeground" numberOfLines={1}>
              {race.circuit.locality}, {race.circuit.country}
            </T>
            <T f="mono" s={12} c={done ? "mutedForeground" : "foreground"}>{formatDateRange(race.sessions)}</T>
            <T f="mono" s={12} c="mutedForeground">Race {formatSessionTime(raceSession)}</T>
          </View>
          <View style={{ justifyContent: "center" }}>
            <CircuitOutline circuit={race.circuit} size={64} />
          </View>
        </Pressable>
      </Link>
      {scored && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            onPress={() => setOpen(!open)}
            style={{ minHeight: 44, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 4, borderTopWidth: 1, borderTopColor: c.border }}
          >
            <T f="medium" s={12}>Podium</T>
            {open ? <ChevronUp size={14} color={c.foreground} /> : <ChevronDown size={14} color={c.foreground} />}
          </Pressable>
          {open && (
            <View style={{ padding: 12, paddingTop: 0 }}>
              <Podiums race={race} />
            </View>
          )}
        </>
      )}
    </View>
  );
}

export default function Calendar() {
  const { season } = useSeason();
  const calendar = useCalendar(season);
  const now = useNow();
  const riseIn = useRiseIn();
  return (
    <Screen>
      <PageHeader title={`${season ?? ""} Calendar`} description="Every Grand Prix weekend of the season. Race start times are in your time zone." />
      <QueryState query={calendar}>
        {(races, res) => {
          const nextRound = races.find((r) => r.sessions.some((s) => ["upcoming", "in_window"].includes(scheduleState(s, now))))?.round;
          return (
            <View style={{ gap: 12 }}>
              {races.map((race, i) => (
                <Animated.View key={race.round} entering={riseIn(i, races.length)}>
                  <RaceCard race={race} isNext={race.round === nextRound} />
                </Animated.View>
              ))}
              {!races.length && <T c="mutedForeground">No races published for {season}.</T>}
              <SourceNote res={res} />
            </View>
          );
        }}
      </QueryState>
    </Screen>
  );
}
