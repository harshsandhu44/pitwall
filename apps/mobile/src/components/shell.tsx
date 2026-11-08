// The app shell, after apps/app/src/components/layout/*: header with wordmark, season and theme; the phone tab bar;
// the start lights.
import { nextSession } from "@pitwall/shared";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { CalendarDays, Check, ChevronDown, House, Moon, RadioTower, Sun, Trophy, Users } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import Animated, { FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCalendar, useNow, useSeason, useSeasons } from "@/lib/hooks";
import { useTheme } from "@/theme/theme";
import { T } from "./ui";

export const TABS = {
  live: { label: "Live", icon: RadioTower },
  index: { label: "Home", icon: House },
  calendar: { label: "Calendar", icon: CalendarDays },
  standings: { label: "Standings", icon: Trophy },
  grid: { label: "Grid", icon: Users },
} as const;

/** Home and Live are always about the newest season, so there's nothing to select there. */
const FIXED = new Set(["index", "live"]);

function Wordmark() {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 6, height: 16, backgroundColor: c.live }} />
      <T f="displayBlack" s={16} upper track={-0.4}>Pitwall</T>
    </View>
  );
}

function SeasonPicker() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const seasons = useSeasons().data?.data ?? [];
  const { season, setSeason } = useSeason();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Season ${season ?? ""}, change`}
        disabled={!seasons.length}
        onPress={() => setOpen(true)}
        style={{ minHeight: 44, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: c.border }}
      >
        <T f="mono" s={13}>{season ?? "Season"}</T>
        <ChevronDown size={14} color={c.mutedForeground} />
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable accessibilityLabel="Close" style={{ flex: 1, backgroundColor: "#00000066" }} onPress={() => setOpen(false)} />
        <View style={{ maxHeight: "60%", backgroundColor: c.popover, borderTopWidth: 2, borderTopColor: c.live, paddingBottom: insets.bottom }}>
          <T f="display" s={13} upper track={0.33} style={{ padding: 16 }}>Season</T>
          <ScrollView>
            {seasons.map((s) => (
              <Pressable
                key={s}
                accessibilityRole="button"
                accessibilityState={{ selected: s === season }}
                onPress={() => {
                  setSeason(s);
                  setOpen(false);
                }}
                style={({ pressed }) => ({
                  minHeight: 44,
                  paddingHorizontal: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderTopWidth: 1,
                  borderTopColor: c.border,
                  backgroundColor: pressed ? c.muted : undefined,
                })}
              >
                <T f={s === season ? "monoSemibold" : "mono"} s={15} c={s === season ? "live" : "foreground"}>{s}</T>
                {s === season && <Check size={16} color={c.live} />}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

export function AppHeader({ route }: { route: string }) {
  const { c, isDark, setMode } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: c.background, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <View style={{ height: 56, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Wordmark />
        <View style={{ flex: 1 }} />
        {!FIXED.has(route) && <SeasonPicker />}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Toggle light and dark theme"
          onPress={() => setMode(isDark ? "light" : "dark")}
          style={({ pressed }) => ({ width: 44, height: 44, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? c.muted : undefined })}
        >
          {isDark ? <Sun size={16} color={c.foreground} /> : <Moon size={16} color={c.foreground} />}
        </Pressable>
      </View>
    </View>
  );
}

/** A session is in its scheduled slot, judged from the calendar: no extra requests. */
function useSessionInWindow() {
  const calendar = useCalendar(useSeasons().data?.data?.[0] ?? null);
  const now = useNow();
  return !!calendar.data?.data && nextSession(calendar.data.data, now)?.state === "in_window";
}

function LiveDot() {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (!reduce) o.value = withRepeat(withTiming(0.35, { duration: 800 }), -1, true);
  }, [o, reduce]);
  const pulse = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ position: "absolute", top: -2, right: -4, width: 8, height: 8, borderRadius: 4, backgroundColor: c.live }, pulse]} />;
}

/** The web's phone tab bar: caps labels, a red rule over the current tab, a dot on Live while a session is on. */
export function TabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const inWindow = useSessionInWindow();
  return (
    <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.background, paddingBottom: insets.bottom }}>
      {state.routes.map((route, i) => {
        const tab = TABS[route.name as keyof typeof TABS];
        if (!tab) return null;
        const active = state.index === i;
        const dot = route.name === "live" && inWindow;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${tab.label}${dot ? " (a session is scheduled now)" : ""}`}
            onPress={() => {
              const e = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
              if (!active && !e.defaultPrevented) navigateToTab(route.key);
            }}
            style={{ flex: 1, alignItems: "center", gap: 2, paddingVertical: 6, borderTopWidth: 2, marginTop: -1, borderTopColor: active ? c.live : "transparent" }}
          >
            <View>
              <tab.icon size={20} color={active ? c.foreground : c.mutedForeground} />
              {dot && <LiveDot />}
            </View>
            <T f="semibold" s={11} upper track={0.3} c={active ? "foreground" : "mutedForeground"}>
              {tab.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Five start lights come on one by one, go out together, then the app shows. Once per launch. */
export function Preloader() {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const [lit, setLit] = useState(0);
  const [done, setDone] = useState(reduce);
  useEffect(() => {
    if (reduce) return;
    const timers = [0, 1, 2, 3, 4].map((i) => setTimeout(() => setLit(i + 1), 120 + i * 160));
    timers.push(setTimeout(() => setLit(0), 950), setTimeout(() => setDone(true), 1150));
    return () => timers.forEach(clearTimeout);
  }, [reduce]);
  if (done) return null;
  const off = `${c.mutedForeground}38`;
  return (
    <Animated.View
      exiting={FadeOut.duration(300)}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 50, backgroundColor: c.background, alignItems: "center", justifyContent: "center", gap: 32 }}
    >
      <Wordmark />
      <View style={{ flexDirection: "row", gap: 8 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={{ gap: 8, padding: 8, borderWidth: 1, borderColor: c.border, backgroundColor: c.card }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: i < lit ? c.live : off }} />
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: i < lit ? c.live : off }} />
          </View>
        ))}
      </View>
    </Animated.View>
  );
}
