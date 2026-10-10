"use client";

import type { HourlySeries } from "@pitwall/shared";
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { formatHour } from "@/lib/format";

export interface TimelineWindow {
  from: number;
  to: number;
  /** Highlighted span, e.g. a session's scheduled slot. */
  highlight?: { from: number; to: number; label: string };
}

type Row = { t: number } & Partial<Record<Exclude<keyof HourlySeries, "time">, number | null>>;

const PANELS: { title: string; unit: string; config: ChartConfig; bars?: string[]; right?: string[] }[] = [
  {
    title: "Temperature",
    unit: "°C",
    config: { temperature: { label: "Air", color: "var(--chart-1)" }, apparentTemperature: { label: "Feels like", color: "var(--chart-3)" } },
  },
  {
    title: "Rain",
    unit: "mm / %",
    config: { precipitation: { label: "Precipitation (mm)", color: "var(--chart-2)" }, precipitationProbability: { label: "Chance (%)", color: "var(--chart-1)" } },
    bars: ["precipitation"],
    right: ["precipitationProbability"],
  },
  {
    title: "Cloud cover",
    unit: "%",
    config: {
      cloudCover: { label: "Total", color: "var(--chart-1)" },
      cloudLow: { label: "Low", color: "var(--chart-2)" },
      cloudMid: { label: "Mid", color: "var(--chart-3)" },
      cloudHigh: { label: "High", color: "var(--chart-4)" },
    },
  },
  {
    title: "Wind & humidity",
    unit: "km/h / %",
    config: {
      windSpeed: { label: "Wind (km/h)", color: "var(--chart-1)" },
      windGusts: { label: "Gusts (km/h)", color: "var(--chart-3)" },
      humidity: { label: "Humidity (%)", color: "var(--chart-2)" },
    },
    right: ["humidity"],
  },
];
const DASHES = ["", "5 3", "2 3", "8 3 2 3"];

/** Hourly model forecast for a time window, one small chart per variable group. */
export function WeatherTimeline({ hourly, window, now }: { hourly: HourlySeries; window: TimelineWindow; now: number | null }) {
  const rows: Row[] = [];
  hourly.time.forEach((iso, i) => {
    const t = Date.parse(iso);
    if (t < window.from || t > window.to) return;
    const row: Row = { t };
    for (const k of Object.keys(hourly) as (keyof HourlySeries)[]) if (k !== "time") row[k] = hourly[k][i] ?? null;
    rows.push(row);
  });
  if (rows.length < 2) return <p className="text-sm text-muted-foreground">The hourly forecast doesn&apos;t cover this period.</p>;
  const tick = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {PANELS.map((p) => (
        <figure key={p.title} className="space-y-1">
          <figcaption className="text-xs font-medium">
            {p.title} <span className="font-normal text-muted-foreground">({p.unit})</span>
          </figcaption>
          <ChartContainer config={p.config} className="aspect-auto h-44 w-full">
            <ComposedChart data={rows} margin={{ left: 0, right: 0, top: 4 }} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={tick} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis yAxisId="l" tickLine={false} axisLine={false} width={32} />
              {p.right && <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tickLine={false} axisLine={false} width={28} />}
              {window.highlight && (
                <ReferenceArea yAxisId="l" x1={window.highlight.from} x2={window.highlight.to} fill="var(--foreground)" fillOpacity={0.08} label={{ value: window.highlight.label, position: "insideTop", fontSize: 10, fill: "var(--muted-foreground)" }} />
              )}
              {now !== null && now >= rows[0]!.t && now <= rows.at(-1)!.t && (
                <ReferenceLine yAxisId="l" x={now} stroke="var(--muted-foreground)" strokeDasharray="2 2" label={{ value: "now", fontSize: 10, fill: "var(--muted-foreground)", position: "insideTopLeft" }} />
              )}
              <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, payload) => (payload?.[0] ? formatHour(new Date(payload[0].payload.t).toISOString()) : "")} />} />
              <ChartLegend content={<ChartLegendContent />} />
              {Object.keys(p.config).map((key, i) =>
                p.bars?.includes(key) ? (
                  <Bar key={key} yAxisId="l" dataKey={key} fill={`var(--color-${key})`} isAnimationActive={false} />
                ) : (
                  <Line key={key} yAxisId={p.right?.includes(key) ? "r" : "l"} dataKey={key} type="monotone" stroke={`var(--color-${key})`} strokeDasharray={DASHES[i % DASHES.length]} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
                ),
              )}
            </ComposedChart>
          </ChartContainer>
        </figure>
      ))}
    </div>
  );
}
