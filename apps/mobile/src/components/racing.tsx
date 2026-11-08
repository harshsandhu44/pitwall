// Ports of apps/app/src/components/racing/* and the small shared bits (tyre, wind, position change).
import {
  type Circuit,
  compass,
  finalAt,
  fmtSpeed,
  formatCountdown,
  formatSessionTime,
  type GrandPrix,
  type NextSession,
  scheduleState,
  SESSION_LABEL,
} from "@pitwall/shared";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { ArrowDown, ArrowUp, Navigation } from "lucide-react-native";
import { type ReactNode, useState } from "react";
import { type StyleProp, View, type ViewStyle } from "react-native";
import { SvgXml } from "react-native-svg";
import { useApi, WEB_URL } from "@/lib/api";
import { useNow } from "@/lib/hooks";
import { Rolling } from "@/lib/motion";
import { useTheme } from "@/theme/theme";
import { font } from "@/theme/tokens";
import { Badge, T } from "./ui";

/** Small team-colour bar next to a team name; neutral when OpenF1 has no colour (before 2023). */
export function TeamMark({ id, season, colour, height = 12 }: { id?: string; season?: number; colour?: string | null; height?: number }) {
  const { c } = useTheme();
  // Only looked up when no colour is given (the same query every table shares).
  const colours = useApi<Record<string, string>>(colour === undefined && id && season ? `/api/team-colours?season=${season}` : null).data?.data;
  const fill = colour ?? (id ? colours?.[id] : undefined);
  return <View style={{ width: 4, height, borderRadius: 2, backgroundColor: fill ?? `${c.mutedForeground}66` }} />;
}

/** formula1.com cutout (2023 on), or the race number in team colour when there's none or it fails to load. */
export function Headshot({ src, number, colour, size }: { src?: string; number: number | null; colour?: string; size: number }) {
  const { c } = useTheme();
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return <Image source={src} onError={() => setFailed(true)} contentFit="contain" contentPosition="bottom" style={{ width: size, height: size }} />;
  }
  return (
    <View style={{ width: size, height: size, justifyContent: "flex-end", alignItems: "flex-end", paddingRight: 4 }}>
      <T f="displayItalic" s={size * 0.4} lh={size * 0.45} c={colour ?? c.mutedForeground}>
        {number ?? ""}
      </T>
    </View>
  );
}

/** Change since the previous round. Renders nothing when unknown. */
export function PositionChange({ prev, curr }: { prev: number | null | undefined; curr: number | null | undefined }) {
  const { c } = useTheme();
  if (prev == null || curr == null) return null;
  const delta = prev - curr;
  if (delta === 0) return <T c="mutedForeground" accessibilityLabel="no change">–</T>;
  const Icon = delta > 0 ? ArrowUp : ArrowDown;
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }} accessibilityLabel={`${delta > 0 ? "up" : "down"} ${Math.abs(delta)}`}>
      <Icon size={12} color={c.foreground} />
      <T f="mono" s={11}>{Math.abs(delta)}</T>
    </View>
  );
}

/** Previous and current position for a subject from a progression series. */
export function lastTwo(positions: (number | null)[] | undefined) {
  if (!positions || positions.length < 2) return { prev: null, curr: null };
  return { prev: positions.at(-2) ?? null, curr: positions.at(-1) ?? null };
}

// Pirelli's conventional compound colours (Tailwind red-500, yellow-400, green-500, blue-500); the letter always shows.
export const COMPOUND: Record<string, { letter: string; colour: string | null; text: string }> = {
  SOFT: { letter: "S", colour: "#ef4444", text: "#ffffff" },
  MEDIUM: { letter: "M", colour: "#facc15", text: "#000000" },
  HARD: { letter: "H", colour: null, text: "#000000" },
  INTERMEDIATE: { letter: "I", colour: "#22c55e", text: "#000000" },
  WET: { letter: "W", colour: "#3b82f6", text: "#ffffff" },
};

export function Tyre({ compound, age }: { compound: string | null; age: number | null }) {
  const { c } = useTheme();
  if (!compound) return <T c="mutedForeground">—</T>;
  const k = COMPOUND[compound];
  const ring = k ? (k.colour ?? c.foreground) : c.mutedForeground;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }} accessibilityLabel={`${compound.toLowerCase()}${age !== null ? `, ${age} laps` : ""}`}>
      <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: ring, alignItems: "center", justifyContent: "center" }}>
        <T f="monoSemibold" s={9} c={ring}>{k?.letter ?? "?"}</T>
      </View>
      {age !== null && <T f="mono" s={11} c="mutedForeground">{age}</T>}
    </View>
  );
}

/** Wind with an arrow pointing where it blows to, plus the compass point it comes from. */
export function Wind({ speed, direction, gusts, s = 12 }: { speed: number | null; direction: number | null; gusts?: number | null; s?: number }) {
  const { c } = useTheme();
  if (speed === null) return <T s={s} c="mutedForeground">—</T>;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
      {direction !== null && <Navigation size={12} color={c.foreground} fill={c.foreground} style={{ transform: [{ rotate: `${direction + 180}deg` }] }} />}
      <T s={s}>{fmtSpeed(speed)}</T>
      {direction !== null && <T s={s} c="mutedForeground">from {compass(direction)}</T>}
      {gusts != null && <T s={s} c="mutedForeground">· gusts {Math.round(gusts)}</T>}
    </View>
  );
}

/**
 * Decorative layout (F1DB CC BY 4.0, or bacinger/f1-circuits MIT), loaded from the web app's /circuits and drawn
 * in the theme's foreground. Schematic only. ponytail: needs the network; bundle the SVGs if offline matters.
 */
export function CircuitOutline({ circuit, size }: { circuit: Circuit; size: number }) {
  const { c } = useTheme();
  const id = circuit.layout?.id;
  const svg = useQuery({
    queryKey: ["circuit", id],
    queryFn: () => fetch(`${WEB_URL}/circuits/${id}.svg`).then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status))))),
    enabled: !!id,
    staleTime: Infinity,
  }).data;
  if (!svg) return <View style={{ width: size, height: size }} />;
  const xml = svg.replace('width="500" height="500"', 'viewBox="0 0 500 500"').replace(/#fff\b/g, c.foreground);
  return (
    <View accessibilityRole="image" accessibilityLabel={`${circuit.name} layout`} style={{ opacity: 0.8 }}>
      <SvgXml xml={xml} width={size} height={size} />
    </View>
  );
}

export function RaceCountdown({ next, size = 30 }: { next: NextSession; size?: number }) {
  const now = useNow();
  const { c } = useTheme();
  const { session, state } = next;
  const label = SESSION_LABEL[session.kind];
  if (state === "in_window") {
    return (
      <T>
        <T f="medium">{label}</T> is in its scheduled window now.
      </T>
    );
  }
  if (!session.start) return <T c="mutedForeground">{label}</T>;
  const ms = Date.parse(session.start) - now;
  return (
    <View>
      <T s={12} c="mutedForeground">{label} starts in</T>
      {/* Announce once per minute at most, not every second. */}
      <View accessible accessibilityLabel={`${label} starts in ${formatCountdown(ms - (ms % 60_000))}`}>
        <Rolling text={formatCountdown(ms)} style={{ fontFamily: font.monoSemibold, fontSize: size, color: c.live, letterSpacing: -size * 0.025 }} />
      </View>
    </View>
  );
}

/** Session list in the viewer's time zone, with circuit-local time when the zone is known. */
export function SessionSchedule({ race }: { race: GrandPrix }) {
  const now = useNow();
  const { c } = useTheme();
  const tz = race.circuit.timezone;
  return (
    <View>
      {race.sessions.map((s) => {
        const state = scheduleState(s, now);
        return (
          <View key={s.kind} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T f="medium" s={12}>{SESSION_LABEL[s.kind]}</T>
              <T f="mono" s={12}>{formatSessionTime(s)}</T>
              {tz && s.start && <T f="mono" s={11} c="mutedForeground">Track {formatSessionTime(s, tz)}</T>}
            </View>
            {state === "finished" && <Badge variant="secondary">Done</Badge>}
            {state === "in_window" && <Badge>Scheduled now</Badge>}
            {!s.start && <T s={12} c="mutedForeground">time not published</T>}
          </View>
        );
      })}
    </View>
  );
}

/** Results stay provisional for a week after the race, while stewards' decisions and appeals can change them. */
export function ProvisionalNote({ race, style }: { race: GrandPrix; style?: StyleProp<ViewStyle> }) {
  const now = useNow();
  if (now >= finalAt(race)) return null;
  return (
    <View style={[{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }, style]}>
      <Badge variant="outline">Provisional</Badge>
      <T s={12} c="mutedForeground" style={{ flex: 1 }}>
        Results can still change after stewards&apos; decisions until{" "}
        {new Date(finalAt(race)).toLocaleDateString(undefined, { day: "numeric", month: "short" })}.
      </T>
    </View>
  );
}

/** A labelled figure: small muted label over a mono value (the web's dt/dd pairs). */
export function Stat({ label, value, s = 14, style }: { label: string; value: ReactNode; s?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap: 2 }, style]}>
      <T s={11} c="mutedForeground">{label}</T>
      {typeof value === "string" || typeof value === "number" ? <T f="mono" s={s}>{value}</T> : value}
    </View>
  );
}
