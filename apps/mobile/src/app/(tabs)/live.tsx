// Port of apps/app/src/components/pages/live-view.tsx: the dashboard's panels stacked in a fixed order. The track
// map, driver comparison, team radio, alerts and 3D stay web-only for now.
import type { LiveStatus, LiveTimingSnapshot } from "@pitwall/shared";
import { formatSessionTime, nextSession, penaltyLabel, pendingPenalties, SESSION_LABEL, stewardsAt, trackStatus } from "@pitwall/shared";
import { useIsFocused } from "expo-router";
import { CalendarDays, History } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Linking, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { ErrorState, QueryState, SourceNote } from "@/components/data";
import { Championship, DriverFocus, Penalties, RaceControlFeed, SessionStatus, TimingTower, TrackWeather, TyreStrip } from "@/components/live";
import { RaceCountdown } from "@/components/racing";
import { Badge, Button, PageHeader, Panel, Screen, Skeleton, T, TextLink } from "@/components/ui";
import { useApi, WEB_URL } from "@/lib/api";
import { useCalendar, useNow, useSeasons } from "@/lib/hooks";
import { useTheme } from "@/theme/theme";

type Streaming = Extract<LiveStatus, { state: "LIVE" | "DELAYED" }>;
const streaming = (s: LiveStatus | undefined): s is Streaming => s?.state === "LIVE" || s?.state === "DELAYED";

export default function Live() {
  // Every 3 s while a session streams; every 30 s otherwise, to notice when one starts. Tabs stay mounted, so
  // polling stops while another tab is showing (the web page unmounts instead).
  const focused = useIsFocused();
  const status = useApi<LiveStatus>("/api/live/session", (res) => focused && (streaming(res?.data ?? undefined) ? 3_000 : 30_000));
  const live = status.data?.data ?? undefined;
  const on = streaming(live);
  // The weekend a streaming session belongs to is the calendar's in-window race (no extra requests).
  const calendar = useCalendar(useSeasons().data?.data?.[0] ?? null);
  const now = useNow();
  const weekend = on && calendar.data?.data ? nextSession(calendar.data.data, now)?.race : null;
  return (
    <Screen>
      <PageHeader
        title={on ? `${live.session.meetingName} · ${live.session.name}` : "Live"}
        description={on ? "Live timing for the session on track right now" : "Live timing appears here while a session is on track."}
      >
        {weekend && (
          <Button variant="outline" icon={CalendarDays} label="Weekend" href={{ pathname: "/race", params: { season: weekend.season, round: weekend.round } }} />
        )}
      </PageHeader>
      <QueryState query={status} loading={<Skeleton height={256} />}>
        {(s, res) =>
          streaming(s) ? (
            <LiveTiming live={s} />
          ) : s.state !== "UNAVAILABLE" ? (
            <ErrorState error={new Error(`Unexpected live state "${s.state}".`)} />
          ) : (
            <>
              <Panel
                title={s.reason === "no_session" ? "No live session" : "Live timing unavailable"}
                description={s.reason === "feed_unavailable" ? <Badge variant="outline">Feed unreachable</Badge> : undefined}
              >
                <View style={{ gap: 12 }}>
                  <T>{s.detail}</T>
                  {s.latestReplay && (
                    <Button
                      variant="outline"
                      icon={History}
                      label={`Replay ${s.latestReplay.meetingName} · ${s.latestReplay.name}`}
                      onPress={() =>
                        Linking.openURL(`${WEB_URL}/replay?season=${new Date(s.latestReplay!.start).getUTCFullYear()}&session=${s.latestReplay!.key}`)
                      }
                    />
                  )}
                </View>
              </Panel>
              <Panel title="Next session" description="From the published calendar">
                {s.next ? (
                  <View style={{ gap: 12 }}>
                    <TextLink href={{ pathname: "/race", params: { season: s.next.race.season, round: s.next.race.round } }}>{s.next.race.name}</TextLink>
                    <RaceCountdown next={{ race: s.next.race, session: s.next.session, state: s.next.inWindow ? "in_window" : "upcoming" }} />
                    <T s={12} c="mutedForeground">
                      {SESSION_LABEL[s.next.session.kind]} · {formatSessionTime(s.next.session)}
                    </T>
                    {s.next.inWindow && (
                      <T s={12} c="mutedForeground">
                        The scheduled slot is open; that doesn&apos;t confirm the session is running. Follow it on official Formula 1 channels.
                      </T>
                    )}
                  </View>
                ) : (
                  <T c="mutedForeground">No upcoming session found in the calendar.</T>
                )}
              </Panel>
              <SourceNote res={res} />
            </>
          )
        }
      </QueryState>
    </Screen>
  );
}

function LiveBadge({ live }: { live: Streaming }) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (!reduce) o.value = withRepeat(withTiming(0.35, { duration: 800 }), -1, true);
  }, [o, reduce]);
  const pulse = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }} accessibilityRole="text">
      <Badge variant={live.state === "LIVE" ? "default" : "outline"}>
        {live.state === "LIVE" ? (
          <>
            <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.primaryForeground }, pulse]} />
            <T f="semibold" s={10} upper track={0.5} c={c.primaryForeground}>Live</T>
          </>
        ) : (
          <T f="semibold" s={10} upper track={0.5}>{`Delayed · last update ${live.delaySeconds} s ago`}</T>
        )}
      </Badge>
      <T s={12} c="mutedForeground">OpenF1 timing, a few seconds behind the track</T>
    </View>
  );
}

function LiveTiming({ live }: { live: Streaming }) {
  const [selected, setSelected] = useState<number | null>(null);
  const t = live.timing;
  const drivers = new Map(t.drivers.map((d) => [d.number, d]));
  const race = t.session.type === "Race";
  // ponytail: a live DO can serve the previous API version for minutes after a deploy; fall back to what it sends.
  const old = t as Partial<LiveTimingSnapshot>;
  const status = old.status ?? trackStatus(t.raceControl, Infinity);
  const stewards = stewardsAt(old.stewards ?? t.raceControl, Infinity);
  const stints = old.stints ?? {};
  const penalties = new Map([...pendingPenalties(stewards)].map(([n, p]) => [n, penaltyLabel(p)!]));
  return (
    <>
      <Panel title="Session">
        <SessionStatus status={status} rows={t.rows} drivers={drivers} freshness={<LiveBadge live={live} />} />
      </Panel>
      <Panel title="Timing" description="Tap a driver to follow them below.">
        <TimingTower rows={t.rows} drivers={drivers} selected={selected} onSelect={setSelected} intervals={race} penalties={penalties} />
      </Panel>
      <Panel title="Driver focus">
        <DriverFocus rows={t.rows} drivers={drivers} selected={selected} intervals={race} />
      </Panel>
      <Panel title="Race control">
        <RaceControlFeed messages={t.raceControl} limit={20} />
      </Panel>
      <Panel title="Penalties" description="Penalties, investigations, deleted laps and warnings so far.">
        <Penalties items={stewards} drivers={drivers} selected={selected} onSelect={setSelected} />
      </Panel>
      <Panel title="Tyres" description="Stints so far in running order, with laps on the current set and the compounds used.">
        <TyreStrip rows={t.rows} drivers={drivers} stints={stints} selected={selected} onSelect={setSelected} />
      </Panel>
      <Panel title="Track weather">
        <TrackWeather weather={t.weather ?? []} />
      </Panel>
      <Panel title="Championship">
        <Championship
          season={new Date(t.observedAt).getUTCFullYear()}
          sessionKey={t.session.key}
          projected={race}
          sprint={t.session.name === "Sprint"}
          rows={t.rows}
          drivers={t.drivers}
        />
      </Panel>
    </>
  );
}
