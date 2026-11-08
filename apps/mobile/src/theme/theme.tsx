import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { useColorScheme } from "react-native";
import { type Colors, dark, light } from "./tokens";

type Mode = "system" | "light" | "dark";
const KEY = "pitwall.theme";

const ThemeContext = createContext<{ c: Colors; isDark: boolean; setMode: (m: Mode) => void }>({
  c: light,
  isDark: false,
  setMode: () => {},
});

/** Follows the system until the toggle picks a side, as on the web (next-themes). */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<Mode>("system");
  useEffect(() => {
    AsyncStorage.getItem(KEY).then((m) => m === "light" || m === "dark" ? setModeState(m) : undefined, () => {});
  }, []);
  const setMode = (m: Mode) => {
    setModeState(m);
    AsyncStorage.setItem(KEY, m).catch(() => {});
  };
  const isDark = mode === "system" ? system === "dark" : mode === "dark";
  return <ThemeContext value={{ c: isDark ? dark : light, isDark, setMode }}>{children}</ThemeContext>;
}

export const useTheme = () => useContext(ThemeContext);
