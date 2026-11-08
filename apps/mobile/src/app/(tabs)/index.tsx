// Port of apps/app/src/components/pages/home-view.tsx (+ champion band, weather conditions). Always the newest season.
import {
  type ConstructorStanding,
  type DecidedTitle,
  decidedTitle,
  driverName,
  type DriverStanding,
  fmtMm,
  fmtPct,
  fmtTemp,
  formatDateRange,
  formatHour,
  formatSessionTime,
  type GrandPrix,
  lastFinishedRace,
  type LiveStatus,
  nextSession,
  type NextSession,
  type PointsProgression,
  type RaceWeekendResults,
  scheduleState,
  SESSION_LABEL,
  sessionWeather,
  type Standings,
  weatherLabel,
} from "@pitwall/shared";
import { Link } from "expo-router";
import { ArrowRight, RadioTower } from "lucide-react-native";
import { Pressable, useWindowDimensions, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { QueryState, SourceNote } from "@/components/data";
import { CircuitOutline, Headshot, ProvisionalNote, RaceCountdown, Stat, Wind } from "@/components/racing";
import { ConstructorStandingsTable, DriverStandingsTable } from "@/components/standings";
import { Button, Cut, Label, Panel, Screen, Skeleton, T, TextLink } from "@/components/ui";
import { useApi } from "@/lib/api";
import { useCalendar, useForecast, useNow, useSeasons, useTeamColours } from "@/lib/hooks";
import { CountUp, Rise, Stripe } from "@/lib/motion";
import { useTheme } from "@/theme/theme";

const decided = (racesLeft: number) => (racesLeft === 0 ? "Season complete" : `Decided with ${racesLeft} race${racesLeft === 1 ? "" : "s"} to go`);

/** Announces the season's champions, each once the title can't be lost. Renders nothing until one is decided. */
function ChampionBand({ season }: { season: number }) {
  const races = useCalendar(season).data?.data;
  const drivers = useApi<Standings<DriverStanding>>(`/api/standings/drivers?season=${season}`).data?.data;
  const constructors = useApi<Standings<ConstructorStanding>>(`/api/standings/constructors?season=${season}`).data?.data;
  const colours = useTeamColours(season).data?.data ?? {};
  const driver = races && drivers ? decidedTitle(drivers, races, "drivers") : null;
  const team = races && constructors ? decidedTitle(constructors, races, "constructors") : null;
  if (!driver && !team) return null;
  return <Band season={season} driver={driver} team={team} colours={colours} />;
}

function Band({
  season,
  driver,
  team,
  colours,
}: {
  season: number;
  driver: DecidedTitle<DriverStanding> | null;
  team: DecidedTitle<ConstructorStanding> | null;
  colours: Record<string, string>;
}) {
  const { c } = useTheme();
  const d = driver?.champion;
  const driverTeam = d?.constructors.at(-1);
  const colour = colours[driverTeam?.id ?? team?.champion.constructor.id ?? ""];
  return (
    <View accessibilityLabel={`${season} champions`} style={{ flexDirection: "row", borderWidth: 1, borderColor: c.border, backgroundColor: c.card, overflow: "hidden" }}>
      {/* Team colour wash behind the portrait side. */}
      <Svg style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}>
        <Defs>
          <LinearGradient id="wash" x1="1" y1="0" x2="0" y2="0">
            <Stop offset="0" stopColor={colour ?? c.muted} stopOpacity={0.22} />
            <Stop offset="0.6" stopColor={colour ?? c.muted} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#wash)" />
      </Svg>
      <Stripe vertical style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 4, backgroundColor: colour ?? c.live }} />
      <View style={{ flex: 1, gap: 20, padding: 20, paddingLeft: 24, justifyContent: "center" }}>
        {driver && d && (
          <View style={{ gap: 4 }}>
            <Label>{season} World Champion</Label>
            <Rise>
              <TextLink href={{ pathname: "/driver", params: { id: d.driver.id, season } }} f="displayItalic" s={26} lh={30} upper track={-0.6}>
                {driverName(d.driver)}
              </TextLink>
            </Rise>
            <T f="mono" s={13}>
              {driverTeam && `${driverTeam.name} · `}
              <CountUp value={d.points} /> pts
            </T>
            <T s={12} c="mutedForeground">{decided(driver.racesLeft)}</T>
          </View>
        )}
        {team && (
          <View style={{ gap: 4 }}>
            <Label>{season} Constructors&apos; Champion</Label>
            <Rise>
              <TextLink href={{ pathname: "/team", params: { id: team.champion.constructor.id, season } }} f="displayItalic" s={driver ? 18 : 26} lh={driver ? 22 : 30} upper track={-0.5}>
                {team.champion.constructor.name}
              </TextLink>
            </Rise>
            <T f="mono" s={13}>
              <CountUp value={team.champion.points} /> pts
            </T>
            <T s={12} c="mutedForeground">{decided(team.racesLeft)}</T>
          </View>
        )}
      </View>
      {d && (
        <View style={{ alignSelf: "flex-end" }}>
          <Headshot src={d.headshot} number={d.driver.number} colour={colour} size={128} />
        </View>
      )}
      <Cut />
    </View>
  );
}

/** Shown in the hero while a session streams: the session and the top three, linking to the live tab. */
function LiveBand({ live }: { live: Extract<LiveStatus, { state: "LIVE" | "DELAYED" }> }) {
  const { c } = useTheme();
  const drivers = new Map(live.timing.drivers.map((d) => [d.number, d]));
  return (
    <Link href="/live" asChild>
      <Pressable accessibilityRole="link" style={{ backgroundColor: c.primary, padding: 20, gap: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.primaryForeground }} />
          <T f="semibold" s={12} upper track={0.6} c={c.primaryForeground}>
            {live.state === "LIVE" ? "Live now" : `Live, delayed ${live.delaySeconds} s`}
          </T>
        </View>
        <Rise>
          <T f="displayItalic" s={28} lh={32} upper track={-0.7} c={c.primaryForeground}>
            {live.session.meetingName} · {live.session.name}
          </T>
        </Rise>
        <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 24, rowGap: 4 }} accessibilityLabel="Top three">
          {live.timing.rows.slice(0, 3).map((r) => (
            <T key={r.driver} f="mono" c={c.primaryForeground}>
              P{r.position} {drivers.get(r.driver)?.acronym ?? r.driver}
            </T>
          ))}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <T f="semibold" c={c.primaryForeground}>Open live timing</T>
          <ArrowRight size={16} color={c.primaryForeground} />
        </View>
        <Cut line={false} />
      </Pressable>
    </Link>
  );
}

/** The next weekend: name, countdown, outline and the session strip. */
function Hero({ next }: { next: NextSession }) {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const now = useNow();
  const { race } = next;
  // Polled only while the calendar says a session is in its slot, to switch the hero to the live band.
  const live = useApi<LiveStatus>(next.state === "in_window" ? "/api/live/session" : null, () => 30_000).data?.data;
  if (live?.state === "LIVE" || live?.state === "DELAYED") return <LiveBand live={live} />;
  return (
    <View style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.card }}>
      <View style={{ padding: 20, paddingLeft: 24, gap: 16 }}>
        <Stripe vertical style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 4, backgroundColor: c.live }} />
        <View style={{ gap: 4 }}>
          <Label>
            Round {race.round} · {race.circuit.locality}, {race.circuit.country} · {formatDateRange(race.sessions)}
          </Label>
          <Rise>
            <TextLink href={{ pathname: "/race", params: { season: race.season, round: race.round } }} f="displayItalic" s={30} lh={34} upper track={-0.75}>
              {race.name}
            </TextLink>
          </Rise>
        </View>
        <RaceCountdown next={next} size={36} />
        {next.state === "in_window" && <Button label="Open live timing" icon={RadioTower} href="/live" />}
        <View style={{ alignItems: "center" }}>
          <CircuitOutline circuit={race.circuit} size={Math.min(width - 80, 280)} />
        </View>
      </View>
      <View accessibilityLabel="Sessions" style={{ flexDirection: "row", flexWrap: "wrap", borderTopWidth: 1, borderTopColor: c.border }}>
        {race.sessions.map((s) => {
          const state = scheduleState(s, now);
          return (
            <View
              key={s.kind}
              style={{ width: "50%", gap: 2, paddingHorizontal: 16, paddingVertical: 12, borderRightWidth: 1, borderBottomWidth: 1, borderColor: c.border, backgroundColor: state === "in_window" ? `${c.live}1f` : undefined }}
            >
              <Label>{SESSION_LABEL[s.kind]}</Label>
              <T f="mono" s={13}>{formatSessionTime(s)}</T>
              <T s={12} c="mutedForeground">{state === "finished" ? "Done" : state === "in_window" ? "Scheduled now" : " "}</T>
            </View>
          );
        })}
      </View>
      <Cut />
    </View>
  );
}

/** Model conditions now and the forecast at the next session start for the next race's circuit. */
function WeatherConditions({ race }: { race: GrandPrix }) {
  const { c: colors } = useTheme();
  const forecast = useForecast(race.circuit.id);
  const now = useNow();
  return (
    <QueryState query={forecast} loading={<Skeleton height={229} />}>
      {(f, res) => {
        const c = f.current;
        const next = nextSession([race], now);
        const s = next ? sessionWeather(f.hourly, next.session) : null;
        return (
          <View style={{ gap: 12 }}>
            {c && (
              <View style={{ gap: 2 }}>
                <T s={12} c="mutedForeground">Model estimate for {formatHour(c.time)} · not a track measurement</T>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 12 }}>
                  <T f="monoSemibold" s={24}>{fmtTemp(c.temperature)}</T>
                  <T>{weatherLabel(c.weatherCode)}</T>
                </View>
                <T s={12} c="mutedForeground">
                  Feels {fmtTemp(c.apparentTemperature)} · humidity {fmtPct(c.humidity)} · cloud {fmtPct(c.cloudCover)}
                </T>
                <Wind speed={c.windSpeed} direction={c.windDirection} gusts={c.windGusts} />
              </View>
            )}
            {next && (
              <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }}>
                <T s={12} c="mutedForeground">Forecast for {SESSION_LABEL[next.session.kind]}</T>
                {s?.atStart ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 8 }}>
                    <Stat style={{ width: "50%" }} s={12} label="At start" value={`${fmtTemp(s.atStart.temperature)}, ${weatherLabel(s.atStart.weatherCode)}`} />
                    <Stat style={{ width: "50%" }} s={12} label="Rain chance" value={`up to ${fmtPct(s.maxPrecipitationProbability)}`} />
                    <Stat style={{ width: "50%" }} s={12} label="Rain total" value={fmtMm(s.totalPrecipitation)} />
                    <Stat style={{ width: "50%" }} label="Wind" value={<Wind speed={s.atStart.windSpeed} direction={s.atStart.windDirection} />} />
                  </View>
                ) : (
                  <T s={12} c="mutedForeground">Not available yet. Hourly forecasts reach about 16 days ahead.</T>
                )}
              </View>
            )}
            <SourceNote res={res} />
          </View>
        );
      }}
    </QueryState>
  );
}

function RecentRace({ last }: { last: GrandPrix }) {
  const recent = useApi<RaceWeekendResults>(`/api/races/${last.round}?season=${last.season}`);
  return (
    <QueryState query={recent} loading={<Skeleton height={130} />}>
      {(r, res) => {
        if (!r.results.length) return <T c="mutedForeground">Results haven&apos;t been published yet.</T>;
        const fl = r.results.find((e) => e.fastestLap?.rank === 1);
        const name = (e: (typeof r.results)[number]) =>
          e.driver.id ? (
            <TextLink href={{ pathname: "/driver", params: { id: e.driver.id, season: r.race.season } }}>{driverName(e.driver)}</TextLink>
          ) : (
            <T f="medium">{driverName(e.driver)}</T>
          );
        return (
          <View style={{ gap: 12 }}>
            <ProvisionalNote race={r.race} />
            <View style={{ gap: 6 }} accessibilityLabel="Podium">
              {r.results.slice(0, 3).map((e) => (
                <View key={e.driver.id} style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                  <T f={e.positionText === "1" ? "monoSemibold" : "mono"} c={e.positionText === "1" ? "live" : "mutedForeground"} style={{ width: 28 }}>
                    P{e.positionText}
                  </T>
                  <View style={{ flex: 1 }}>{name(e)}</View>
                  <T f="mono" s={12} c="mutedForeground">{e.time ?? e.status}</T>
                </View>
              ))}
            </View>
            {fl?.fastestLap?.time && (
              <T s={12} c="mutedForeground">
                Fastest lap: <T s={12}>{driverName(fl.driver)}</T> <T f="mono" s={12}>{fl.fastestLap.time}</T> (lap {fl.fastestLap.lap ?? "?"})
              </T>
            )}
            <SourceNote res={res} />
          </View>
        );
      }}
    </QueryState>
  );
}

export default function Home() {
  const season = useSeasons().data?.data?.[0] ?? null;
  const calendar = useCalendar(season);
  const now = useNow();
  const q = (path: string) => (season ? `${path}${path.includes("?") ? "&" : "?"}season=${season}` : null);
  const drivers = useApi<Standings<DriverStanding>>(q("/api/standings/drivers"));
  const constructors = useApi<Standings<ConstructorStanding>>(q("/api/standings/constructors"));
  const driverProgression = useApi<PointsProgression>(q("/api/standings/progression?type=drivers"));
  const constructorProgression = useApi<PointsProgression>(q("/api/standings/progression?type=constructors"));
  const races = calendar.data?.data;
  const last = races ? lastFinishedRace(races, now) : null;
  const nextRace = races ? (nextSession(races, now)?.race ?? null) : null;
  // Also true while the season is still unknown (the calendar query is idle until then).
  const calendarLoading = calendar.isPending;
  // Champions stay up through the off-season: until the new season has a finished race, they're last season's.
  const titleSeason = season === null || calendarLoading ? null : last ? season : season - 1;

  return (
    <Screen>
      {titleSeason !== null && <ChampionBand season={titleSeason} />}
      {calendarLoading ? (
        <Skeleton height={520} />
      ) : (
        <QueryState query={calendar}>
          {(list) => {
            const next = nextSession(list, now);
            return next ? (
              <Hero next={next} />
            ) : (
              <Panel>
                <T c="mutedForeground">The {season} season is complete. The next calendar hasn&apos;t been published yet.</T>
              </Panel>
            );
          }}
        </QueryState>
      )}

      <Panel
        eyebrow="Weather"
        title={nextRace ? nextRace.circuit.locality : "—"}
      >
        {nextRace ? (
          <WeatherConditions race={nextRace} />
        ) : calendarLoading ? (
          <Skeleton height={229} />
        ) : (
          <T c="mutedForeground">No upcoming race to forecast.</T>
        )}
      </Panel>

      <Panel
        eyebrow="Most recent race"
        title={last?.name ?? "—"}
        footer={
          last && (
            <TextLink href={{ pathname: "/race", params: { season: last.season, round: last.round } }} s={12}>
              Full results →
            </TextLink>
          )
        }
      >
        {last ? (
          <RecentRace last={last} />
        ) : calendarLoading ? (
          <Skeleton height={130} />
        ) : (
          <T c="mutedForeground">No race has finished yet this season.</T>
        )}
      </Panel>

      <Panel eyebrow={`${season ?? ""} championship`} title="Drivers" footer={<TextLink href="/standings" s={12}>Full standings →</TextLink>}>
        {drivers.isPending ? (
          <Skeleton height={304} />
        ) : (
          <QueryState query={drivers}>
            {(s, res) => (
              <View style={{ gap: 8 }}>
                <DriverStandingsTable standings={s} progression={driverProgression.data?.data ?? undefined} limit={5} />
                <SourceNote res={res} />
              </View>
            )}
          </QueryState>
        )}
      </Panel>

      <Panel eyebrow={`${season ?? ""} championship`} title="Constructors" footer={<TextLink href="/standings?view=constructors" s={12}>Full standings →</TextLink>}>
        {constructors.isPending ? (
          <Skeleton height={230} />
        ) : (
          <QueryState query={constructors}>
            {(s, res) => (
              <View style={{ gap: 8 }}>
                <ConstructorStandingsTable standings={s} progression={constructorProgression.data?.data ?? undefined} limit={5} />
                <SourceNote res={res} />
              </View>
            )}
          </QueryState>
        )}
      </Panel>
    </Screen>
  );
}
