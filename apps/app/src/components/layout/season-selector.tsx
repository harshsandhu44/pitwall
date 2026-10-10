"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSeason, useSeasons } from "@/lib/hooks";

export function SeasonSelector() {
  const seasons = useSeasons();
  const { season, setSeason } = useSeason();
  const list = seasons.data?.data ?? [];
  const items = list.map((s) => ({ value: String(s), label: String(s) }));
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
