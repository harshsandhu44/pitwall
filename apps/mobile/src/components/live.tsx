// Ports of apps/app/src/components/replay/* for the phone Live screen: session status, timing tower, driver focus,
// race control, penalties, tyres, track weather and the championship as it stands.
import {
  type ChampionshipBase,
  fmtClock,
  fmtGap,
  fmtLap,
  fmtPct,
  fmtTemp,
  lastAtOrBefore,
  type ProjectedEntry,
  projectStandings,
  type ReplayDriver,
  type ReplayStint,
  type SessionReplay,
  type StewardsItem,
  type StewardsKind,
  type TimingRow,
  type TrackStatus,
} from "@pitwall/shared";
import { type ReactNode, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { LinearTransition, useReducedMotion } from "react-native-reanimated";
import { useApi } from "@/lib/api";
import { useTheme } from "@/theme/theme";
import { EmptyState, QueryState } from "./data";
import { COMPOUND, Stat, TeamMark, Tyre, Wind } from "./racing";
import { Badge, Row, Segmented, Skeleton, T } from "./ui";

type Drivers = Map<number, ReplayDriver>;
const acronym = (drivers: Drivers, n: number) => drivers.get(n)?.acronym ?? String(n);

/** The broadcast "status bar": what the track is doing, who leads, and how fresh the data is. */
export function SessionStatus({ status, rows, drivers, freshness }: { status: TrackStatus; rows: TimingRow[]; drivers: Drivers; freshness: ReactNode }) {
  const { c, isDark } = useTheme();
  // Flag colours are data colours, like team colours: they mean what the marshals' flags mean.
  const yellow = { bg: "#f5c518", fg: "#12151a" };
  const flag: Record<TrackStatus["kind"], { bg: string; fg: string }> = {
    green: { bg: c.gain, fg: isDark ? "#0e1013" : "#ffffff" },
    yellow,
    vsc: yellow,
    sc: yellow,
    red: { bg: c.primary, fg: c.primaryForeground },
    chequered: { bg: c.foreground, fg: c.background },
  };
  const leader = rows.find((r) => r.position === 1) ?? rows[0];
  const d = leader && drivers.get(leader.driver);
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "stretch", gap: 24 }}>
        <View accessibilityLiveRegion="polite" style={{ paddingHorizontal: 12, paddingVertical: 8, justifyContent: "center", backgroundColor: flag[status.kind].bg }}>
          <T f="displayBlack" s={18} upper track={-0.45} c={flag[status.kind].fg}>{status.label}</T>
        </View>
        <Stat
          label="LEADER"
          value={
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <TeamMark colour={d?.colour} height={16} />
              <T f="monoSemibold" s={18}>{d?.acronym ?? "—"}</T>
            </View>
          }
        />
        <Stat label="LAP" s={18} value={<T f="monoSemibold" s={18}>{leader?.lap ?? "—"}</T>} />
      </View>
      {freshness}
    </View>
  );
}

/** Fixed phone columns: position, driver, interval (races) or best lap, last lap, tyre, pending penalty. */
export function TimingTower({
  rows,
  drivers,
  selected,
  onSelect,
  intervals,
  penalties,
}: {
  rows: TimingRow[];
  drivers: Drivers;
  selected: number | null;
  onSelect: (n: number | null) => void;
  intervals: boolean;
  penalties: Map<number, string>;
}) {
  const reduce = useReducedMotion();
  const head = (label: string, width: number, align: "left" | "right" = "right") => (
    <T f="medium" s={11} c="mutedForeground" style={{ width, textAlign: align }}>{label}</T>
  );
  return (
    <View accessibilityLabel="Live timing, from OpenF1">
      <Row style={{ minHeight: 28 }}>
        {head("Pos", 28, "left")}
        <T f="medium" s={11} c="mutedForeground" style={{ flex: 1 }}>Driver</T>
        {head(intervals ? "Int" : "Best", 64)}
        {head("Last", 68)}
        {head("Tyre", 40, "left")}
        {head("Pen", 30)}
      </Row>
      {rows.map((r) => {
        const sel = r.driver === selected;
        const d = drivers.get(r.driver);
        const pen = penalties.get(r.driver);
        return (
          // Rows glide to their new place when the order changes.
          <Animated.View key={r.driver} layout={reduce ? undefined : LinearTransition.duration(450)}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: sel }}
              accessibilityLabel={`P${r.position ?? "—"} ${d?.name ?? r.driver}`}
              onPress={() => onSelect(sel ? null : r.driver)}
            >
              <Row selected={sel} style={{ gap: 4 }}>
                <T f={r.position === 1 ? "monoSemibold" : "mono"} s={12} c={r.position === 1 ? "live" : "foreground"} style={{ width: 28 }}>
                  {r.position ?? "—"}
                </T>
                <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <TeamMark colour={d?.colour} />
                  <T f="monoMedium" s={12} c={sel ? "live" : "foreground"}>{d?.acronym ?? r.driver}</T>
                </View>
                <T f="mono" s={12} style={{ width: 64, textAlign: "right" }}>
                  {intervals ? (r.position === 1 ? "—" : fmtGap(r.interval)) : fmtLap(r.bestLap)}
                </T>
                <T f="mono" s={12} style={{ width: 68, textAlign: "right" }}>{fmtLap(r.lastLap)}</T>
                <View style={{ width: 40 }}>
                  <Tyre compound={r.compound} age={r.tyreAge} />
                </View>
                <T f={pen ? "monoSemibold" : "mono"} s={12} c="live" style={{ width: 30, textAlign: "right" }}>{pen ?? ""}</T>
              </Row>
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

/** One driver up close: the selected tower row, plus the cars either side. */
export function DriverFocus({ rows, drivers, selected, intervals }: { rows: TimingRow[]; drivers: Drivers; selected: number | null; intervals: boolean }) {
  const i = rows.findIndex((r) => r.driver === selected);
  const r = rows[i];
  if (!r) return <EmptyState>Select a driver in Timing.</EmptyState>;
  const d = drivers.get(r.driver);
  const ahead = rows[i - 1];
  const behind = rows[i + 1];
  const stats: [string, ReactNode][] = [
    ...(intervals
      ? ([
          [`Gap ahead${ahead ? ` (${acronym(drivers, ahead.driver)})` : ""}`, ahead ? fmtGap(r.interval) : "Leading"],
          [`Gap behind${behind ? ` (${acronym(drivers, behind.driver)})` : ""}`, behind ? fmtGap(behind.interval) : "—"],
          ["To leader", r.position === 1 ? "—" : fmtGap(r.gap)],
        ] as [string, ReactNode][])
      : []),
    ["Last lap", fmtLap(r.lastLap)],
    ["Best lap", fmtLap(r.bestLap)],
    ["Lap", r.lap ?? "—"],
    ["Tyre", <Tyre key="t" compound={r.compound} age={r.tyreAge} />],
    ["Pit visits", r.pits],
  ];
  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <T f="displayBlack" s={36} lh={40}>P{r.position ?? "—"}</T>
        <View style={{ width: 6, height: 40, backgroundColor: d?.colour ?? undefined }} />
        <View style={{ flex: 1 }}>
          <T f="semibold" numberOfLines={1}>{d?.name ?? `Car ${r.driver}`}</T>
          <T s={12} c="mutedForeground" numberOfLines={1}>
            #{r.driver}
            {d?.team && ` · ${d.team}`}
          </T>
        </View>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 8 }}>
        {stats.map(([k, v]) => (
          <Stat key={k} label={k.toUpperCase()} value={typeof v === "string" || typeof v === "number" ? String(v) : v} style={{ width: "50%" }} />
        ))}
      </View>
    </View>
  );
}

/** Race-control messages, newest first. */
export function RaceControlFeed({ messages, limit = 20 }: { messages: SessionReplay["raceControl"]; limit?: number }) {
  const shown = messages.slice(-limit).reverse();
  if (!shown.length) return <EmptyState>No race-control messages yet at this point.</EmptyState>;
  return (
    <View style={{ gap: 8 }}>
      {shown.map((m) => (
        <View key={`${m.t}-${m.message}`} style={{ gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <T f="mono" s={11} c="mutedForeground">{fmtClock(m.t)}</T>
            {m.lap !== null && <T s={11} c="mutedForeground">Lap {m.lap}</T>}
            {m.flag && <Badge variant="outline">{m.flag}</Badge>}
          </View>
          <T s={12} lh={17}>{m.message}</T>
        </View>
      ))}
    </View>
  );
}

const KIND: Record<StewardsKind, { label: string; tone: "live" | "strong" | "plain" | "muted" }> = {
  penalty: { label: "Penalty", tone: "live" },
  served: { label: "Served", tone: "plain" },
  investigation: { label: "Investigation", tone: "strong" },
  cleared: { label: "No action", tone: "muted" },
  deleted: { label: "Lap deleted", tone: "muted" },
  warning: { label: "Black & white", tone: "strong" },
};

/** The stewards' decisions, investigations, deleted laps and warnings so far, newest first. */
export function Penalties({ items, drivers, selected, onSelect }: { items: StewardsItem[]; drivers: Drivers; selected: number | null; onSelect: (n: number | null) => void }) {
  const { c } = useTheme();
  if (!items.length) return <EmptyState>No stewards&apos; decisions yet.</EmptyState>;
  return (
    <View style={{ gap: 8 }}>
      {[...items].reverse().map((i) => {
        const k = KIND[i.kind];
        const quiet = k.tone === "muted";
        return (
          <View key={`${i.t}-${i.text}`} style={{ gap: 2 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <View
                style={{
                  paddingHorizontal: 4,
                  height: 16,
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: k.tone === "live" ? c.live : k.tone === "strong" ? `${c.foreground}66` : c.border,
                  backgroundColor: k.tone === "live" ? `${c.live}1a` : undefined,
                }}
              >
                <T f="semibold" s={10} upper c={k.tone === "live" ? "live" : quiet ? "mutedForeground" : "foreground"}>{k.label}</T>
              </View>
              <T f="mono" s={11} c="mutedForeground">{fmtClock(i.t)}</T>
              {i.lap !== null && <T s={11} c="mutedForeground">Lap {i.lap}</T>}
              {i.drivers.map((n) => (
                <Pressable
                  key={n}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selected === n }}
                  onPress={() => onSelect(selected === n ? null : n)}
                  hitSlop={8}
                  style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                >
                  <TeamMark colour={drivers.get(n)?.colour} height={10} />
                  <T f="monoMedium" s={11} c={selected === n ? "live" : "foreground"}>{acronym(drivers, n)}</T>
                </Pressable>
              ))}
            </View>
            <T s={12} lh={17} c={quiet ? "mutedForeground" : "foreground"}>{i.text}</T>
          </View>
        );
      })}
    </View>
  );
}

// Bar fills in Pirelli's colours; the hard (white) compound gets an outline so it shows on a light card.
const FILL: Record<string, string> = { SOFT: "#ef4444", MEDIUM: "#facc15", HARD: "#f5f5f5", INTERMEDIATE: "#22c55e", WET: "#3b82f6" };

/** Every driver's stints so far, in running order: one bar per stint, as long as its laps. */
export function TyreStrip({
  rows,
  drivers,
  stints,
  selected,
  onSelect,
}: {
  rows: TimingRow[];
  drivers: Drivers;
  stints: Record<number, ReplayStint[]>;
  selected: number | null;
  onSelect: (n: number | null) => void;
}) {
  const { c } = useTheme();
  const total = Math.max(1, ...rows.map((r) => r.lap ?? 0), ...Object.values(stints).flat().map((s) => s.lapEnd));
  // Each stint ends at its last lap so far; the latest runs to the current lap (live, lap_end lags a lap).
  const shown = rows.map((r) => {
    const all = stints[r.driver] ?? [];
    return {
      r,
      stints: all.filter((s) => r.lap !== null && s.lapStart <= r.lap).map((s) => ({ ...s, lapEnd: s === all.at(-1) ? r.lap! : Math.min(s.lapEnd, r.lap!) })),
    };
  });
  if (!shown.some((s) => s.stints.length)) return <EmptyState>Tyre stints appear once cars are on track.</EmptyState>;
  return (
    <View style={{ gap: 4 }}>
      {shown.map(({ r, stints: list }) => {
        const sel = r.driver === selected;
        const used = [...new Set(list.map((s) => s.compound).filter(Boolean))] as string[];
        return (
          <Pressable
            key={r.driver}
            accessibilityRole="button"
            accessibilityState={{ selected: sel }}
            accessibilityLabel={`${acronym(drivers, r.driver)}: ${list.map((s) => `${s.compound?.toLowerCase() ?? "unknown"} laps ${s.lapStart}-${s.lapEnd}`).join(", ")}`}
            onPress={() => onSelect(sel ? null : r.driver)}
            style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: sel ? c.muted : undefined }}
          >
            <T f="mono" s={12} c="mutedForeground" style={{ width: 22, textAlign: "right" }}>{r.position ?? "—"}</T>
            <T f="monoMedium" s={12} c={sel ? "live" : "foreground"} style={{ width: 34 }}>{acronym(drivers, r.driver)}</T>
            <View style={{ flex: 1, height: 16 }}>
              {list.map((s) => {
                const k = COMPOUND[s.compound ?? ""];
                return (
                  <View
                    key={s.stint}
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      left: `${((s.lapStart - 1) / total) * 100}%`,
                      width: `${((s.lapEnd - s.lapStart + 1) / total) * 100}%`,
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      borderRightWidth: 2,
                      borderRightColor: c.card,
                      backgroundColor: FILL[s.compound ?? ""] ?? `${c.mutedForeground}66`,
                      borderWidth: s.compound === "HARD" ? 1 : 0,
                      borderColor: `${c.foreground}66`,
                    }}
                  >
                    <T f="monoSemibold" s={9} c={k?.text ?? c.foreground}>{k?.letter ?? "?"}</T>
                  </View>
                );
              })}
            </View>
            <T f="mono" s={12} c="mutedForeground" style={{ width: 22, textAlign: "right" }}>{r.tyreAge ?? ""}</T>
            <T f="mono" s={10} c="mutedForeground" style={{ width: 32 }}>{used.map((x) => COMPOUND[x]?.letter ?? "?").join("")}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Latest track-side weather observation (OpenF1 publishes about one a minute). */
export function TrackWeather({ weather }: { weather: SessionReplay["weather"] }) {
  const w = weather[lastAtOrBefore(weather.map((x) => x.t), Infinity)];
  if (!w) return <EmptyState>No weather observation recorded yet at this point.</EmptyState>;
  const rows: [string, ReactNode][] = [
    ["Air", fmtTemp(w.air)],
    ["Track", fmtTemp(w.track)],
    ["Humidity", fmtPct(w.humidity)],
    ["Wind", <Wind key="w" speed={w.windSpeed === null ? null : w.windSpeed * 3.6} direction={w.windDirection} />],
    ["Rain", w.rainfall === null ? "—" : w.rainfall ? "Yes" : "No"],
  ];
  return (
    <View style={{ gap: 8 }}>
      {rows.map(([k, v]) => (
        <View key={k} style={{ flexDirection: "row" }}>
          <T s={12} c="mutedForeground" style={{ width: "50%" }}>{k}</T>
          {typeof v === "string" ? <T f="mono" s={12}>{v}</T> : v}
        </View>
      ))}
      <T s={12} c="mutedForeground">Observed at the track at {fmtClock(w.t)}.</T>
    </View>
  );
}

function Moved({ n }: { n: number }) {
  if (!n) return <T f="mono" s={12} c="mutedForeground">–</T>;
  return (
    <T f="mono" s={12} c={n > 0 ? "gain" : "loss"} accessibilityLabel={`${Math.abs(n)} places ${n > 0 ? "up" : "down"}`}>
      {n > 0 ? "▲" : "▼"}
      {Math.abs(n)}
    </T>
  );
}

function ChampTable<K extends string | number>({ entries, name, colour, live }: { entries: ProjectedEntry<K>[]; name: (k: K) => string; colour: (k: K) => string | null; live: boolean }) {
  return (
    <View>
      <Row style={{ minHeight: 28 }}>
        <T s={12} c="mutedForeground" style={{ width: 28 }}>Pos</T>
        {live && <T s={12} c="mutedForeground" style={{ width: 36 }}>+/−</T>}
        <T s={12} c="mutedForeground" style={{ flex: 1 }}>Name</T>
        <T s={12} c="mutedForeground" style={{ width: 48, textAlign: "right" }}>Pts</T>
        {live && <T s={12} c="mutedForeground" style={{ width: 36, textAlign: "right" }}>+</T>}
      </Row>
      {entries.map((e) => (
        <Row key={e.key} style={{ minHeight: 28, paddingVertical: 3 }}>
          <T f={e.position === 1 ? "monoSemibold" : "mono"} s={12} c={e.position === 1 ? "live" : "foreground"} style={{ width: 28 }}>{e.position}</T>
          {live && (
            <View style={{ width: 36 }}>
              <Moved n={e.moved} />
            </View>
          )}
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <TeamMark colour={colour(e.key)} />
            <T s={12} numberOfLines={1}>{name(e.key)}</T>
          </View>
          <T f="monoSemibold" s={12} style={{ width: 48, textAlign: "right" }}>{e.points}</T>
          {live && <T f="mono" s={12} c="mutedForeground" style={{ width: 36, textAlign: "right" }}>{e.added ? `+${e.added}` : ""}</T>}
        </Row>
      ))}
    </View>
  );
}

/** The championships as they would stand if the session finished in the current running order (races and sprints). */
export function Championship({
  season,
  sessionKey,
  projected,
  sprint,
  rows,
  drivers,
}: {
  season: number;
  sessionKey: number;
  projected: boolean;
  sprint: boolean;
  rows: TimingRow[];
  drivers: ReplayDriver[];
}) {
  const base = useApi<ChampionshipBase>(`/api/championship/before?season=${season}&session=${sessionKey}`);
  const [tab, setTab] = useState<"drivers" | "teams">("drivers");
  const byNumber = new Map(drivers.map((d) => [d.number, d]));
  return (
    <QueryState query={base} loading={<Skeleton height={192} />}>
      {(b) => {
        const p = projectStandings(b, projected ? rows : [], drivers, sprint, season);
        return (
          <View style={{ gap: 8 }}>
            <T s={12} c="mutedForeground">
              {projected ? "As it stands: points before this session plus the current running order." : "Before this session."}
            </T>
            <Segmented
              value={tab}
              onChange={setTab}
              items={[
                { value: "drivers", label: "Drivers" },
                { value: "teams", label: "Teams" },
              ]}
            />
            {tab === "drivers" ? (
              <ChampTable entries={p.drivers} live={projected} name={(n: number) => byNumber.get(n)?.acronym ?? String(n)} colour={(n: number) => byNumber.get(n)?.colour ?? null} />
            ) : (
              <ChampTable entries={p.teams} live={projected} name={(t: string) => t} colour={(t: string) => drivers.find((d) => d.team === t)?.colour ?? null} />
            )}
          </View>
        );
      }}
    </QueryState>
  );
}
