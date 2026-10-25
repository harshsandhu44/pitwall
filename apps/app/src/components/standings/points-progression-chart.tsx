"use client";

import type { PointsProgression } from "@pitwall/shared";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/data/query-state";
import { type ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
// The theme's chart palette is tonal, so lines also differ by dash pattern.
const DASHES = ["", "6 3", "2 3", "8 3 2 3", "1 2"];
const MAX_SERIES = 5;

export function PointsProgressionChart({ progression, type }: { progression: PointsProgression; type: "drivers" | "constructors" }) {
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
  const config: ChartConfig = Object.fromEntries(shown.map((s, i) => [s.id, { label: s.label, color: COLORS[i % COLORS.length] }]));
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
              strokeDasharray={DASHES[i % DASHES.length]}
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
