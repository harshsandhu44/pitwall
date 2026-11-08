// Mirror of apps/app/src/app/globals.css (:root and .dark). Change both together.

export const light = {
  // Daytime broadcast: white panels on a cool grey page, the same signal red.
  background: "#eef0f3",
  foreground: "#12151a",
  card: "#ffffff",
  popover: "#ffffff",
  primary: "#c8232b",
  primaryForeground: "#fdfdfd",
  secondary: "#e4e7ec",
  muted: "#e9ecf0",
  mutedForeground: "#565e6b",
  destructive: "#c8232b",
  border: "#d5d9e0",
  input: "#c9ced6",
  // Signal red for stripes, the LIVE marker and red text; 4.5:1 or better on card.
  live: "#d1242a",
  raised: "#f5f6f8",
  gain: "#0b7a40",
  loss: "#d1242a",
  // Timing purple: the session's fastest sector.
  purple: "#8a2be2",
};

export type Colors = typeof light;

export const dark: Colors = {
  // Pit wall: graphite with a cool tint, hairlines instead of shadows.
  background: "#0e1013",
  foreground: "#e8eaed",
  card: "#15181d",
  popover: "#1c2027",
  primary: "#c8232b",
  primaryForeground: "#fdfdfd",
  secondary: "#232831",
  muted: "#1c2027",
  mutedForeground: "#959dab",
  destructive: "#f0484b",
  border: "#262b33",
  input: "#2f353f",
  live: "#f0484b",
  raised: "#1c2027",
  gain: "#3ccf7f",
  loss: "#f0484b",
  purple: "#c084fc",
};

/** Panels are square with one cut top-right corner of this size. */
export const CUT = 12;

/**
 * Static cuts of the web's variable fonts (Archivo wdth 100/125, Geist Mono), keyed by the names useFonts loads.
 * "display" is the web's font-display (font-stretch 125%).
 */
export const FONT_FILES = {
  "Archivo-Regular": require("../../assets/fonts/Archivo-Regular.ttf"),
  "Archivo-Medium": require("../../assets/fonts/Archivo-Medium.ttf"),
  "Archivo-SemiBold": require("../../assets/fonts/Archivo-SemiBold.ttf"),
  "Archivo-Bold": require("../../assets/fonts/Archivo-Bold.ttf"),
  "ArchivoExpanded-ExtraBold": require("../../assets/fonts/ArchivoExpanded-ExtraBold.ttf"),
  "ArchivoExpanded-Black": require("../../assets/fonts/ArchivoExpanded-Black.ttf"),
  "ArchivoExpanded-BlackItalic": require("../../assets/fonts/ArchivoExpanded-BlackItalic.ttf"),
  "GeistMono-Regular": require("../../assets/fonts/GeistMono-Regular.ttf"),
  "GeistMono-Medium": require("../../assets/fonts/GeistMono-Medium.ttf"),
  "GeistMono-SemiBold": require("../../assets/fonts/GeistMono-SemiBold.ttf"),
};

export const font = {
  regular: "Archivo-Regular",
  medium: "Archivo-Medium",
  semibold: "Archivo-SemiBold",
  bold: "Archivo-Bold",
  display: "ArchivoExpanded-ExtraBold",
  displayBlack: "ArchivoExpanded-Black",
  displayItalic: "ArchivoExpanded-BlackItalic",
  mono: "GeistMono-Regular",
  monoMedium: "GeistMono-Medium",
  monoSemibold: "GeistMono-SemiBold",
} satisfies Record<string, keyof typeof FONT_FILES>;

export type Font = keyof typeof font;
