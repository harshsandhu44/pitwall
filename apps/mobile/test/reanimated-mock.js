// Reanimated 4.7's own mock loads the real entry point, which throws under Jest ("setCSSEventHandler is not
// available"), and expo-router's testing library then falls back to an empty object. This covers what the app
// uses, with reduced motion on, so screens render their final, static state (as the web tests do under jsdom).
const { ScrollView, Text, View } = require("react-native");

const id = (v) => v;
const builder = () => {
  const b = { duration: () => b, delay: () => b };
  return b;
};
const Animated = { View, Text, ScrollView, createAnimatedComponent: id };

module.exports = {
  __esModule: true,
  default: Animated,
  ...Animated,
  Easing: { out: () => id, exp: id, cubic: id, poly: () => id },
  useReducedMotion: () => true,
  useSharedValue: (value) => ({ value }),
  useAnimatedStyle: (style) => style(),
  withTiming: id,
  withDelay: (_, v) => v,
  withRepeat: id,
  LinearTransition: builder(),
  FadeOut: builder(),
};
