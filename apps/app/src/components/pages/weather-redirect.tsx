"use client";

import { nextSession } from "@pitwall/shared";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { LoadingRows } from "@/components/data/query-state";
import { useCalendar, useNow, useSeasons } from "@/lib/hooks";

/** Weather moved onto the weekend page; old /weather?round=N links land on that round's Weather tab. */
export function WeatherRedirect() {
  const router = useRouter();
  const round = Number(useSearchParams().get("round")) || null;
  const season = useSeasons().data?.data?.[0] ?? null;
  const calendar = useCalendar(round ? null : season);
  const now = useNow();
  const races = calendar.data?.data;
  const target = round ?? (races && now !== null ? (nextSession(races, now)?.race ?? races.at(-1))?.round : undefined);
  useEffect(() => {
    if (season && target) router.replace(`/race?season=${season}&round=${target}&tab=weather`);
  }, [router, season, target]);
  return <LoadingRows />;
}
