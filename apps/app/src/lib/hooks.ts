"use client";

import type { GrandPrix } from "@pitwall/shared";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useSyncExternalStore } from "react";
import { useApi } from "./api";

/** Seasons, newest first. */
export const useSeasons = () => useApi<number[]>("/api/seasons");

/**
 * The selected season lives in `?season=` so links are shareable.
 * Falls back to the newest season Jolpica knows about.
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
      const p = new URLSearchParams(params);
      p.set("season", String(next));
      router.push(`${pathname}?${p}`);
    },
    [params, pathname, router],
  );
  return { season, latest, isCurrent: season !== null && season === latest, setSeason };
}

export const useCalendar = (season: number | null) => useApi<GrandPrix[]>(season ? `/api/calendar?season=${season}` : null);

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
