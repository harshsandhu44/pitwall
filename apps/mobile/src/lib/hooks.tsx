import type { GrandPrix, WeatherForecast } from "@pitwall/shared";
import { createContext, type ReactNode, useContext, useState, useSyncExternalStore } from "react";
import { useApi } from "./api";

/** Seasons, newest first. */
export const useSeasons = () => useApi<number[]>("/api/seasons");
export const useCalendar = (season: number | null) => useApi<GrandPrix[]>(season ? `/api/calendar?season=${season}` : null);
export const useForecast = (circuitId: string | null) =>
  useApi<WeatherForecast>(circuitId ? `/api/weather/forecast?circuit=${circuitId}` : null);
/** Constructor id → "#RRGGBB" from OpenF1 (2023 onward; empty before). */
export const useTeamColours = (season: number) => useApi<Record<string, string>>(`/api/team-colours?season=${season}`);

// The web keeps the season in ?season=; here one choice is shared by every tab and resets on launch.
const SeasonContext = createContext<{ chosen: number | null; setSeason: (s: number) => void }>({ chosen: null, setSeason: () => {} });

export function SeasonProvider({ children }: { children: ReactNode }) {
  const [chosen, setSeason] = useState<number | null>(null);
  return <SeasonContext value={{ chosen, setSeason }}>{children}</SeasonContext>;
}

/** The chosen season, falling back to the newest. */
export function useSeason() {
  const { chosen, setSeason } = useContext(SeasonContext);
  const latest = useSeasons().data?.data?.[0] ?? null;
  const season = chosen ?? latest;
  return { season, latest, isCurrent: season !== null && season === latest, setSeason };
}

// A shared clock: one interval for every subscriber.
const listeners = new Set<() => void>();
let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;
function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(cb);
    if (!listeners.size) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}
export const useNow = () => useSyncExternalStore(subscribe, () => now);
