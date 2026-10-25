"use client";

import type { CloudGrid, GrandPrix, RadarFrames, ReplaySession, SessionReplay, WeatherForecast } from "@pitwall/shared";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useSyncExternalStore } from "react";
import { useApi } from "./api";

/** Seasons, newest first. */
export const useSeasons = () => useApi<number[]>("/api/seasons");

/**
 * The selected season lives in `?season=` so links are shareable.
 * Falls back to the current season.
 */
export function useSeason() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const seasons = useSeasons();
  const fromUrl = Number(params.get("season"));
  const latest = seasons.data?.data?.[0] ?? null;
  const season = Number.isInteger(fromUrl) && fromUrl >= 1950 ? fromUrl : latest;

  const setSeason = useCallback(
    (next: number) => {
      // A round or a recorded session belongs to one season: another season's round N is a different race.
      if (pathname === "/race") return router.push(`/calendar?season=${next}`);
      const p = new URLSearchParams(params);
      p.set("season", String(next));
      p.delete("session");
      router.push(`${pathname}?${p}`);
    },
    [params, pathname, router],
  );
  return { season, latest, isCurrent: season !== null && season === latest, setSeason };
}

export const useCalendar = (season: number | null) => useApi<GrandPrix[]>(season ? `/api/calendar?season=${season}` : null);

/**
 * The Grand Prix a recorded session belongs to, matched by date (a day either side of the weekend):
 * OpenF1's meeting names don't always match Jolpica's race names.
 */
export function weekendOf(races: GrandPrix[], start: string) {
  const t = Date.parse(start);
  return races.find((r) => {
    const times = r.sessions.map((s) => Date.parse(s.start ?? s.date));
    return t >= Math.min(...times) - 86_400_000 && t <= Math.max(...times) + 86_400_000;
  });
}

// A shared clock: one interval for every subscriber; null during SSR/prerender so nothing time-dependent hydrates.
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
export const useNow = () =>
  useSyncExternalStore(
    subscribe,
    () => now,
    () => null,
  );

export const useForecast = (circuitId: string | null) =>
  useApi<WeatherForecast>(circuitId ? `/api/weather/forecast?circuit=${circuitId}` : null);
export const useCloudGrid = (circuitId: string | null) =>
  useApi<CloudGrid>(circuitId ? `/api/weather/cloud-grid?circuit=${circuitId}` : null);
export const useRadar = () => useApi<RadarFrames>("/api/weather/radar");

/** Constructor id → "#RRGGBB" from OpenF1 (2023 onward; empty before). */
export const useTeamColours = (season: number) => useApi<Record<string, string>>(`/api/team-colours?season=${season}`);

export const useReplaySessions = (season: number | null) =>
  useApi<ReplaySession[]>(season !== null && season >= 2023 ? `/api/replay/sessions?season=${season}` : null);
export const useReplay = (key: number | null) => useApi<SessionReplay>(key === null ? null : `/api/replay/${key}`);
