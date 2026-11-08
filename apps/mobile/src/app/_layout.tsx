import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { Stack } from "expo-router/stack";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Preloader } from "@/components/shell";
import { ApiError } from "@/lib/api";
import { SeasonProvider } from "@/lib/hooks";
import { ThemeProvider, useTheme } from "@/theme/theme";
import { font, FONT_FILES } from "@/theme/tokens";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded] = useFonts(FONT_FILES);
  // Same defaults as apps/app/src/app/providers.tsx.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            // Don't hammer a provider that said "not found" or returned bad data.
            retry: (count, e) =>
              count < 1 && !(e instanceof ApiError && (e.response?.status === "not_found" || e.response?.status === "error")),
          },
        },
      }),
  );
  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);
  if (!loaded) return null;
  return (
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <SeasonProvider>
          <Navigation />
          <Preloader />
        </SeasonProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

function Navigation() {
  const { c, isDark } = useTheme();
  const base = isDark ? DarkTheme : DefaultTheme;
  return (
    <NavThemeProvider value={{ ...base, colors: { ...base.colors, background: c.background, card: c.background, text: c.foreground, border: c.border, primary: c.live } }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerTintColor: c.foreground,
          headerStyle: { backgroundColor: c.background },
          headerTitleStyle: { fontFamily: font.display, fontSize: 13 },
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: c.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="race" options={{ title: "WEEKEND" }} />
        <Stack.Screen name="driver" options={{ title: "DRIVER" }} />
        <Stack.Screen name="team" options={{ title: "TEAM" }} />
      </Stack>
    </NavThemeProvider>
  );
}
