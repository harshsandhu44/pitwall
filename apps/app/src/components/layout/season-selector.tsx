"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePathname } from "next/navigation";
import { useSeason, useSeasons } from "@/lib/hooks";

/** The selected season, for page titles ("2026 Calendar"); nothing until it's known. */
export function SeasonLabel() {
  const { season } = useSeason();
  return season ? `${season} ` : null;
}

/** Home and Live are always about the newest season, so there's nothing to select there. */
const FIXED = new Set(["/", "/live"]);

export function SeasonSelector() {
  const seasons = useSeasons();
  const { season, setSeason } = useSeason();
  const pathname = usePathname();
  const list = seasons.data?.data ?? [];
  const items = list.map((s) => ({ value: String(s), label: String(s) }));
  if (FIXED.has(pathname)) return null;
  return (
    <Select
      items={items}
      value={season ? String(season) : null}
      onValueChange={(v) => v && setSeason(Number(v))}
      disabled={!list.length}
    >
      <SelectTrigger aria-label="Season" className="w-24 font-mono tabular-nums">
        <SelectValue placeholder="Season" />
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value} className="font-mono tabular-nums">
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
