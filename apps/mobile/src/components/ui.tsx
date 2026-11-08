// Ports of apps/app/src/components/ui/* plus the page header: square shapes, one cut corner, a red stripe.
import { type Href, Link } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, type StyleProp, Text, type TextProps, View, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { Rise, Stripe } from "@/lib/motion";
import { useTheme } from "@/theme/theme";
import { type Colors, CUT, type Font, font } from "@/theme/tokens";

type Colour = keyof Colors | (string & {});

/** Text in the app's type: `f` font cut, `s` size, `c` a token name or a colour. */
export function T({
  f = "regular",
  s = 14,
  c = "foreground",
  upper,
  track,
  lh,
  style,
  ...props
}: TextProps & { f?: Font; s?: number; c?: Colour; upper?: boolean; track?: number; lh?: number }) {
  const { c: colors } = useTheme();
  return (
    <Text
      {...props}
      style={[
        {
          fontFamily: font[f],
          fontSize: s,
          color: colors[c as keyof Colors] ?? c,
          textTransform: upper ? "uppercase" : undefined,
          letterSpacing: track,
          lineHeight: lh,
        },
        style,
      ]}
    />
  );
}

/** Small caps label: `text-xs font-semibold tracking-wider uppercase text-muted-foreground`. */
export const Label = (props: TextProps & { c?: Colour }) => <T f="semibold" s={11} c="mutedForeground" upper track={0.6} {...props} />;

/**
 * The cut corner: a triangle in the colour behind the shape hides the corner, and a hairline runs along the cut.
 * `on` is that colour (the page by default).
 */
export function Cut({ size = CUT, on, line = true }: { size?: number; on?: string; line?: boolean }) {
  const { c } = useTheme();
  const len = size * Math.SQRT2;
  return (
    <>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: -1,
          right: -1,
          borderTopWidth: size + 1,
          borderLeftWidth: size + 1,
          borderTopColor: on ?? c.background,
          borderLeftColor: "transparent",
        }}
      />
      {line && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: size / 2 - 1.25,
            right: size / 2 - len / 2 - 0.5,
            width: len,
            height: 1.5,
            backgroundColor: c.border,
            transform: [{ rotate: "45deg" }],
          }}
        />
      )}
    </>
  );
}

/** Card: square, hairline border, cut top-right corner; title with the red stripe flush to the edge. */
export function Panel({
  title,
  eyebrow,
  description,
  action,
  footer,
  children,
  style,
}: {
  title?: ReactNode;
  /** Small text above the title (CardDescription placed first on the web). */
  eyebrow?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  return (
    <View style={[{ borderWidth: 1, borderColor: c.border, backgroundColor: c.card, paddingVertical: 16, gap: 16 }, style]}>
      {(title || eyebrow || description) && (
        <View style={{ paddingHorizontal: 16, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <View style={{ flex: 1, gap: 4 }}>
            {eyebrow && <T s={12} c="mutedForeground">{eyebrow}</T>}
            {title && <PanelTitle>{title}</PanelTitle>}
            {description && (typeof description === "string" ? <T s={12} c="mutedForeground" lh={18}>{description}</T> : description)}
          </View>
          {action}
        </View>
      )}
      {children !== undefined && <View style={{ paddingHorizontal: 16 }}>{children}</View>}
      {footer && <View style={{ paddingHorizontal: 16 }}>{footer}</View>}
      <Cut />
    </View>
  );
}

/** Broadcast header: expanded caps with a signal-red stripe flush to the panel edge. */
export function PanelTitle({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return (
    <T f="display" s={13} lh={20} upper track={0.33} style={{ marginLeft: -16, paddingLeft: 13, borderLeftWidth: 3, borderLeftColor: c.live }}>
      {children}
    </T>
  );
}

type ButtonProps = {
  label: string;
  icon?: LucideIcon;
  variant?: "default" | "outline" | "ghost";
  onPress?: () => void;
  href?: Href;
  /** Colour behind the button, for the cut corner of the filled variant. */
  on?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/** Filled buttons get a small cut corner; every button keeps a 44 pt touch target. */
export function Button({ label, icon: Icon, variant = "default", onPress, href, on, accessibilityLabel, style }: ButtonProps) {
  const { c } = useTheme();
  const filled = variant === "default";
  const fg = filled ? c.primaryForeground : c.foreground;
  const body = (
    <Pressable
      onPress={onPress}
      accessibilityRole={href ? "link" : "button"}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        {
          minHeight: 44,
          paddingHorizontal: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          alignSelf: "flex-start",
          backgroundColor: filled ? c.primary : pressed ? c.muted : "transparent",
          borderWidth: variant === "outline" ? 1 : 0,
          borderColor: c.border,
          transform: [{ translateY: pressed ? 1 : 0 }],
          opacity: filled && pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {Icon && <Icon size={14} color={fg} />}
      <T f="medium" s={12} c={fg}>
        {label}
      </T>
      {filled && <Cut size={6} on={on ?? c.card} line={false} />}
    </Pressable>
  );
  return href ? (
    <Link href={href} asChild>
      {body}
    </Link>
  ) : (
    body
  );
}

export function Badge({ children, variant = "default" }: { children: ReactNode; variant?: "default" | "secondary" | "outline" }) {
  const { c } = useTheme();
  const bg = variant === "default" ? c.primary : variant === "secondary" ? c.secondary : "transparent";
  return (
    <View
      style={{
        height: 20,
        paddingHorizontal: 6,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        alignSelf: "flex-start",
        backgroundColor: bg,
        borderWidth: variant === "outline" ? 1 : 0,
        borderColor: c.border,
      }}
    >
      {typeof children === "string" ? (
        <T f="semibold" s={10} upper track={0.5} c={variant === "default" ? c.primaryForeground : "foreground"}>
          {children}
        </T>
      ) : (
        children
      )}
    </View>
  );
}

export function Skeleton({ height, style }: { height: number; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (!reduce) o.value = withRepeat(withTiming(0.5, { duration: 1000 }), -1, true);
  }, [o, reduce]);
  const pulse = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View accessibilityLabel="Loading" style={[{ height, backgroundColor: c.muted }, pulse, style]} />;
}

/** In-screen tabs (the web's TabsList): the active one sits on the page with a red underline. */
export function Segmented<V extends string>({ value, onChange, items }: { value: V; onChange: (v: V) => void; items: { value: V; label: string }[] }) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: "row", flexWrap: "wrap", backgroundColor: c.muted, padding: 3, alignSelf: "flex-start" }}>
      {items.map((i) => {
        const active = i.value === value;
        return (
          <Pressable
            key={i.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(i.value)}
            style={{
              minHeight: 38,
              paddingHorizontal: 12,
              justifyContent: "center",
              backgroundColor: active ? c.background : "transparent",
              borderBottomWidth: 2,
              borderBottomColor: active ? c.live : "transparent",
            }}
          >
            <T f="medium" s={12} c={active ? "foreground" : "mutedForeground"}>
              {i.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Page title: the widest italic cut, rising out of its line, over a short red stripe on the rule. */
export function PageHeader({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ marginBottom: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: c.border, gap: 12 }}>
      <View style={{ gap: 4 }}>
        <Rise>
          <T f="displayItalic" s={24} lh={28} upper track={-0.6} accessibilityRole="header" style={{ paddingBottom: 2 }}>
            {title}
          </T>
        </Rise>
        {description && <T s={13} c="mutedForeground" lh={19}>{description}</T>}
      </View>
      {children}
      <Stripe style={{ position: "absolute", bottom: -1, left: 0, height: 2, width: 64, backgroundColor: c.live }} />
    </View>
  );
}

/** Text that navigates: the web's `hover:text-live hover:underline` links. */
export function TextLink({ href, children, ...t }: { href: Href; children: ReactNode } & Parameters<typeof T>[0]) {
  return (
    <Link href={href} asChild>
      <T accessibilityRole="link" f="medium" {...t}>
        {children}
      </T>
    </Link>
  );
}

/** A table row: hairline below, cells in a line. */
export function Row({ children, style, selected }: { children: ReactNode; style?: StyleProp<ViewStyle>; selected?: boolean }) {
  const { c } = useTheme();
  return (
    <View
      style={[
        { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 36, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.border },
        selected && { backgroundColor: c.muted },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** A page: scrolls, page padding, and pull to refresh (the browser's reload) refetches what's on screen. */
export function Screen({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  const client = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = () => {
    setRefreshing(true);
    client.refetchQueries({ type: "active" }).finally(() => setRefreshing(false));
  };
  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={{ padding: 12, gap: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.live} colors={[c.live]} />}
    >
      {children}
    </ScrollView>
  );
}
