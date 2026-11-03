"use client";

import type { PointsProgression } from "@pitwall/shared";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/data/query-state";
import { type ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTeamColours } from "@/lib/hooks";

// Team-mates share a colour, so the better-placed one is solid and the next dashed (a third, after a mid-season swap, dotted).
const DASHES = ["", "6 3", "2 3"];
// OpenF1 has no team colours before 2023: each team then gets its own grey, foreground first.
const GREYS = [100, 78, 60, 46, 36].map((p) => `color-mix(in oklab, var(--foreground) ${p}%, var(--background))`);
const MAX_SERIES = 5;

/**
 * Line colour and dash for each series, in order (best-placed first). `team` gives a series' team id;
 * team-mates share a colour and step through the dashes. Teams without a colour get a grey shade each.
 */
export function lineStyles(series: { id: string; team: string }[], colours: Record<string, string>) {
  const seen = new Map<string, number>();
  const greys = new Map<string, string>();
  return series.map(({ team }) => {
    const n = seen.get(team) ?? 0;
    seen.set(team, n + 1);
    if (!colours[team] && !greys.has(team)) greys.set(team, GREYS[greys.size % GREYS.length]!);
    return { color: colours[team] ?? greys.get(team)!, dash: DASHES[Math.min(n, DASHES.length - 1)]! };
  });
}

export function PointsProgressionChart({
  progression,
  type,
  teams = {},
}: {
  progression: PointsProgression;
  type: "drivers" | "constructors";
  /** Driver id to their latest constructor id; a driver missing here is treated as their own team. */
  teams?: Record<string, string>;
}) {
  const colours = useTeamColours(progression.season).data?.data ?? {};
  const series = useMemo(
    () =>
      (type === "drivers"
        ? progression.drivers.map((d) => ({ id: d.driver.id, label: d.driver.code ?? d.driver.familyName, points: d.points }))
        : progression.constructors.map((c) => ({ id: c.constructor.id, label: c.constructor.name, points: c.points }))
      ).sort((a, b) => (b.points.at(-1) ?? -1) - (a.points.at(-1) ?? -1)),
    [progression, type],
  );
  const [selected, setSelected] = useState<string[]>(() => series.slice(0, MAX_SERIES).map((s) => s.id));

  if (progression.rounds.length < 2) return <EmptyState>Points progression needs at least two completed rounds.</EmptyState>;

  const shown = series.filter((s) => selected.includes(s.id));
  const styles = lineStyles(
    shown.map((s) => ({ id: s.id, team: type === "drivers" ? (teams[s.id] ?? s.id) : s.id })),
    colours,
  );
  const config: ChartConfig = Object.fromEntries(shown.map((s, i) => [s.id, { label: s.label, color: styles[i]!.color, dash: styles[i]!.dash }]));
  const data = progression.rounds.map((r, i) => ({
    round: `R${r.round}`,
    name: r.name,
    ...Object.fromEntries(shown.map((s) => [s.id, s.points[i]])),
  }));

  return (
    <div className="space-y-3">
      <ToggleGroup
        multiple
        value={selected}
        onValueChange={(v: string[]) => setSelected(v.slice(-MAX_SERIES))}
        aria-label={`Choose up to ${MAX_SERIES} to compare`}
        className="flex-wrap"
        variant="outline"
        size="sm"
      >
        {series.slice(0, 20).map((s) => (
          <ToggleGroupItem key={s.id} value={s.id} className="font-mono text-[11px]">
            {s.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <ChartContainer config={config} className="aspect-auto h-72 w-full">
        <LineChart data={data} margin={{ left: 0, right: 8, top: 8 }} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="round" tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tickLine={false} axisLine={false} width={36} />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => p?.[0]?.payload?.name} />} />
          <ChartLegend content={<ChartLegendContent />} />
          {shown.map((s, i) => (
            <Line
              key={s.id}
              dataKey={s.id}
              type="monotone"
              stroke={`var(--color-${s.id})`}
              strokeDasharray={styles[i]!.dash}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ChartContainer>
      <p className="text-xs text-muted-foreground">
        Cumulative points after each round, from the official standings published for that round.
      </p>
    </div>
  );
}
