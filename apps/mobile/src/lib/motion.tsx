// Arrival motion, after apps/app/src/lib/motion.tsx (GSAP there, Reanimated here). Everything is static under
// reduced motion. Layout animations run on mount only, so a refetch never replays them.
import { type ReactNode, useEffect, useState } from "react";
import { type StyleProp, Text, type TextStyle, View, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  type EntryAnimationsValues,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

const expoOut = Easing.out(Easing.exp);
const power3Out = Easing.out(Easing.poly(4));

/** The title rises out of its own line box (web: [data-title]). */
export function Rise({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  return (
    <View style={[{ overflow: "hidden" }, style]}>
      <Animated.View
        entering={
          reduce
            ? undefined
            : (v: EntryAnimationsValues) => {
                "worklet";
                return {
                  initialValues: { transform: [{ translateY: v.targetHeight * 1.1 }] },
                  animations: { transform: [{ translateY: withTiming(0, { duration: 900, easing: expoOut }) }] },
                };
              }
        }
      >
        {children}
      </Animated.View>
    </View>
  );
}

/** The red stripe wipes in along its axis (web: [data-stripe] / [data-stripe-y]). */
export function Stripe({ style, vertical }: { style: StyleProp<ViewStyle>; vertical?: boolean }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    p.value = withDelay(100, withTiming(1, { duration: 800, easing: expoOut }));
  }, [p]);
  const animated = useAnimatedStyle(() => ({ transform: [vertical ? { scaleY: p.value } : { scaleX: p.value }] }));
  return <Animated.View style={[style, { transformOrigin: vertical ? "top" : "left" }, animated]} />;
}

/**
 * Rows, cards and panels stagger up and in (web: [data-rise]). A fixed total stagger, so a 20-row table
 * arrives as fast as a 3-row one.
 */
export function useRiseIn() {
  const reduce = useReducedMotion();
  return (i: number, n: number) => {
    if (reduce) return undefined;
    const delay = n > 1 ? (i * 350) / (n - 1) : 0;
    return () => {
      "worklet";
      return {
        initialValues: { opacity: 0, transform: [{ translateY: 14 }] },
        animations: {
          opacity: withDelay(delay, withTiming(1, { duration: 550, easing: power3Out })),
          transform: [{ translateY: withDelay(delay, withTiming(0, { duration: 550, easing: power3Out })) }],
        },
      };
    };
  };
}

/** A number that counts up from zero on first mount, and lands on the latest value. */
export function CountUp({ value, format = String }: { value: number; format?: (n: number) => string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState<number | null>(reduce ? null : 0);
  useEffect(() => {
    if (reduce) return;
    const start = Date.now();
    let frame = requestAnimationFrame(function tick() {
      const t = Math.min(1, (Date.now() - start) / 900);
      setShown(t < 1 ? Math.round(value * (1 - (1 - t) ** 3)) : null);
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
    // ponytail: first mount only, like the web; a refetch mid-count still ends on `value` (null = show value).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <>{format(shown ?? value)}</>;
}

/** Text whose changed characters roll in from above (the countdown's digits). */
export function Rolling({ text, style }: { text: string; style: StyleProp<TextStyle> }) {
  const reduce = useReducedMotion();
  // Nothing rolls on first mount; after that only changed characters mount, so only they roll.
  const [initial] = useState(text);
  const animate = !reduce && text !== initial;
  const roll = () => {
    "worklet";
    return {
      initialValues: { opacity: 0, transform: [{ translateY: -20 }] },
      animations: {
        opacity: withTiming(1, { duration: 250 }),
        transform: [{ translateY: withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) }) }],
      },
    };
  };
  return (
    <View style={{ flexDirection: "row", overflow: "hidden" }}>
      {[...text].map((c, i) => (
        // Keyed by place and character: a changed digit remounts and rolls in.
        <Animated.View key={`${i}-${c}`} entering={animate ? roll : undefined}>
          <Text style={style}>{c}</Text>
        </Animated.View>
      ))}
    </View>
  );
}
