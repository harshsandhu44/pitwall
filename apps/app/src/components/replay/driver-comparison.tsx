"use client";

import { alignLaps, type LapTelemetry, lapGaps, type ReplayDriver, type ReplayLap, sectorDeltas, type TimingRow } from "@pitwall/shared";
import { type ReactNode, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { EmptyState, ErrorState } from "@/components/data/query-state";
import { type ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApi } from "@/lib/api";
import { fmtGap, fmtLap } from "@/lib/format";
import { Tyre } from "./timing-tower";

function Picker({ label, value, items, onChange, className = "w-52" }: { label: string; value: string; items: { value: string; label: string }[]; onChange: (v: string) => void; className?: string }) {
  return (
    <Select items={items} value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger aria-label={label} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** "+0.123", "−0.045", "0.000". */
const fmtDelta = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(3)}`);
/** A team colour at about 15% opacity, for tinting a cell. */
const tint = (colour: string | null | undefined) => (colour && /^#[0-9a-f]{6}$/i.test(colour) ? { backgroundColor: `${colour}26` } : undefined);

type Pair = [ReplayDriver, ReplayDriver];

/** Two drivers side by side, using only laps completed by `t` (Infinity when live). */
export function DriverComparison({
  sessionKey,
  drivers,
  laps,
  rows,
  t,
  pair,
  onPair,
}: {
  sessionKey: number;
  drivers: ReplayDriver[];
  laps: Record<number, ReplayLap[]>;
  rows: TimingRow[];
  t: number;
  pair: [number, number];
  onPair: (p: [number, number]) => void;
}) {
  const [a, b] = pair;
  const da = drivers.find((d) => d.number === a);
  const db = drivers.find((d) => d.number === b);
  if (!da || !db) return <EmptyState>Choose two drivers.</EmptyState>;

  const done = (n: number) => (laps[n] ?? []).filter((l) => l.start !== null && l.duration !== null && l.start + l.duration * 1000 <= t);
  const la = done(a);
  const lb = done(b);
  const config: ChartConfig = { a: { label: da.acronym, color: da.colour ?? "var(--chart-1)" }, b: { label: db.acronym, color: db.colour ?? "var(--chart-3)" } };
  const items = drivers.map((d) => ({ value: String(d.number), label: `${d.acronym} · ${d.name}` }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Picker label="First driver" value={String(a)} items={items} onChange={(n) => onPair([Number(n), b])} />
        <Picker label="Second driver" value={String(b)} items={items} onChange={(n) => onPair([a, Number(n)])} />
      </div>

      <table className="w-full text-xs">
        <caption className="sr-only">The two drivers now</caption>
        <thead className="text-muted-foreground">
          <tr className="text-left">
            <th className="font-normal">Driver</th>
            <th className="font-normal">Pos</th>
            <th className="font-normal">Gap</th>
            <th className="font-normal">Last lap</th>
            <th className="font-normal">Best lap</th>
            <th className="font-normal">Tyre</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {([
            [da, la],
            [db, lb],
          ] as const).map(([drv, list]) => {
            const r = rows.find((x) => x.driver === drv.number);
            return (
              <tr key={drv.number}>
                <td className="font-medium">{drv.acronym}</td>
                <td>{r?.position ?? "—"}</td>
                <td>{r?.position === 1 ? "Leader" : fmtGap(r?.gap ?? null)}</td>
                <td>{fmtLap(list.at(-1)?.duration ?? null)}</td>
                <td>{fmtLap(list.length ? Math.min(...list.map((l) => l.duration!)) : null)}</td>
                <td>
                  <Tyre compound={r?.compound ?? null} age={r?.tyreAge ?? null} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <Tabs defaultValue="gap">
        <TabsList variant="line" className="mb-3">
          <TabsTrigger value="gap">Gap</TabsTrigger>
          <TabsTrigger value="sectors">Sectors</TabsTrigger>
          <TabsTrigger value="laps">Lap times</TabsTrigger>
          <TabsTrigger value="telemetry">Telemetry</TabsTrigger>
        </TabsList>
        <TabsContent value="gap">
          <GapChart pair={[da, db]} la={la} lb={lb} config={config} />
        </TabsContent>
        <TabsContent value="sectors">
          <SectorTable pair={[da, db]} la={la} lb={lb} />
        </TabsContent>
        <TabsContent value="laps">
          <LapChart la={la} lb={lb} config={config} />
        </TabsContent>
        <TabsContent value="telemetry">
          <Telemetry sessionKey={sessionKey} pair={[da, db]} la={la} lb={lb} config={config} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GapChart({ pair: [da, db], la, lb, config }: { pair: Pair; la: ReplayLap[]; lb: ReplayLap[]; config: ChartConfig }) {
  // Lap-time deltas split by who was quicker, so each bar takes that driver's colour.
  const data = lapGaps(la, lb)
    .filter((g) => g.gap !== null || g.delta !== null)
    .map((g) => ({ ...g, a: g.delta !== null && g.delta < 0 ? g.delta : null, b: g.delta !== null && g.delta >= 0 ? g.delta : null }));
  if (data.length < 2) return <EmptyState>The gap appears once both drivers have completed laps.</EmptyState>;
  const last = data.findLast((g) => g.gap !== null);
  return (
    <div className="space-y-1">
      <p className="text-xs">
        {last && (
          <>
            After lap {last.lap}: <span className="font-mono font-semibold tabular-nums">{Math.abs(last.gap!).toFixed(3)} s</span>,{" "}
            {last.gap! > 0 ? `${da.acronym} behind ${db.acronym}` : `${da.acronym} ahead of ${db.acronym}`}
          </>
        )}
      </p>
      <ChartContainer config={{ gap: { label: "Gap", color: "var(--foreground)" } }} className="aspect-auto h-40 w-full">
        <LineChart data={data} syncId="gap" margin={{ left: 0, right: 8, top: 8 }} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="lap" tickLine={false} axisLine={false} hide />
          <YAxis tickLine={false} axisLine={false} width={48} reversed tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v}`} />
          <ReferenceLine y={0} stroke="var(--border)" />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => `Lap ${p?.[0]?.payload?.lap}`} formatter={(v) => `${da.acronym} ${fmtDelta(Number(v))} s to ${db.acronym}`} />} />
          <Line dataKey="gap" stroke="var(--color-gap)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
        </LineChart>
      </ChartContainer>
      <ChartContainer config={config} className="aspect-auto h-24 w-full">
        <BarChart data={data} syncId="gap" margin={{ left: 0, right: 8 }} accessibilityLayer>
          <XAxis dataKey="lap" tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tickLine={false} axisLine={false} width={48} domain={[-2, 2]} allowDataOverflow tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v}`} />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => `Lap ${p?.[0]?.payload?.lap}`} formatter={(v) => `Lap time ${fmtDelta(Number(v))} s`} />} />
          <Bar dataKey="a" stackId="d" fill="var(--color-a)" isAnimationActive={false} />
          <Bar dataKey="b" stackId="d" fill="var(--color-b)" isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
      <p className="text-xs text-muted-foreground">
        Top: {da.acronym}&apos;s gap to {db.acronym} at the line after each lap (higher on the chart: {da.acronym} ahead). Bars: lap-time difference,
        coloured for whoever was quicker that lap; pit laps run off the scale.
      </p>
    </div>
  );
}

function SectorTable({ pair: [da, db], la, lb }: { pair: Pair; la: ReplayLap[]; lb: ReplayLap[] }) {
  const s = sectorDeltas(la, lb);
  if (!s.laps.length) return <EmptyState>Sector times appear once both drivers have completed a lap.</EmptyState>;
  const quicker = (v: number | null) => (v === null || v === 0 ? undefined : tint(v < 0 ? da.colour : db.colour));
  const lapDelta = (lap: number) => {
    const [x, y] = [la.find((l) => l.lap === lap)?.duration, lb.find((l) => l.lap === lap)?.duration];
    return x != null && y != null ? x - y : null;
  };
  return (
    <div className="space-y-2">
      <table className="w-full text-xs">
        <caption className="sr-only">
          Sector time differences, {da.acronym} minus {db.acronym}, over the last {s.laps.length} laps both completed
        </caption>
        <thead className="text-muted-foreground">
          <tr className="text-right">
            <th className="text-left font-normal">Lap</th>
            <th className="font-normal">S1</th>
            <th className="font-normal">S2</th>
            <th className="font-normal">S3</th>
            <th className="font-normal">Lap</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {s.laps.map((l) => (
            <tr key={l.lap} className="h-6 text-right">
              <td className="text-left">{l.lap}</td>
              {l.sectors.map((v, i) => (
                <td key={i} style={quicker(v)}>
                  {fmtDelta(v)}
                </td>
              ))}
              <td style={quicker(lapDelta(l.lap))}>{fmtDelta(lapDelta(l.lap))}</td>
            </tr>
          ))}
          {([da, db] as const).map((d, k) => (
            <tr key={d.number} className="h-6 border-t text-right text-muted-foreground">
              <td className="text-left font-sans">Best {d.acronym}</td>
              {s.best[k]!.map((v, i) => (
                <td key={i}>{v?.toFixed(3) ?? "—"}</td>
              ))}
              <td>{fmtLap(s.best[k]!.every((v) => v !== null) ? s.best[k]!.reduce((x, y) => x! + y!, 0) : null)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground">
        {da.acronym} minus {db.acronym}, in seconds; negative means {da.acronym} was quicker. Cells are tinted in the quicker driver&apos;s colour. The best
        rows add up to each driver&apos;s ideal lap.
      </p>
    </div>
  );
}

function LapChart({ la, lb, config }: { la: ReplayLap[]; lb: ReplayLap[]; config: ChartConfig }) {
  const laps = [...new Set([...la, ...lb].map((l) => l.lap))].sort((x, y) => x - y);
  const data = laps.map((lap) => ({ lap, a: la.find((l) => l.lap === lap)?.duration ?? null, b: lb.find((l) => l.lap === lap)?.duration ?? null }));
  if (data.length < 2) return <EmptyState>Lap times appear once both drivers have completed laps.</EmptyState>;
  const fastest = Math.min(...[...la, ...lb].map((l) => l.duration!));
  return (
    <div className="space-y-1">
      <ChartContainer config={config} className="aspect-auto h-56 w-full">
        <LineChart data={data} margin={{ left: 0, right: 8, top: 8 }} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="lap" tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={64}
            domain={[Math.floor(fastest - 1), Math.ceil(fastest * 1.12)]}
            allowDataOverflow
            tickFormatter={(v: number) => fmtLap(v)}
          />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => `Lap ${p?.[0]?.payload?.lap}`} formatter={(v, name) => `${config[name as "a"]?.label} ${fmtLap(Number(v))}`} />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Line dataKey="a" stroke="var(--color-a)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
          <Line dataKey="b" stroke="var(--color-b)" strokeDasharray="6 3" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
        </LineChart>
      </ChartContainer>
      <p className="text-xs text-muted-foreground">Laps more than 12% slower than the fastest shown (pit stops, safety car) run off the top of the chart.</p>
    </div>
  );
}

const FASTEST = "fastest";

function Telemetry({ sessionKey, pair: [da, db], la, lb, config }: { sessionKey: number; pair: Pair; la: ReplayLap[]; lb: ReplayLap[]; config: ChartConfig }) {
  const [choice, setChoice] = useState(FASTEST);
  const fastest = (laps: ReplayLap[]) => laps.reduce<ReplayLap | null>((m, l) => (!m || l.duration! < m.duration! ? l : m), null)?.lap ?? null;
  const both = la.filter((l) => lb.some((o) => o.lap === l.lap)).map((l) => l.lap);
  // A chosen lap that's no longer offered (other drivers picked) falls back to the fastest laps.
  const pick = choice !== FASTEST && both.includes(Number(choice)) ? Number(choice) : null;
  const [lapA, lapB] = pick !== null ? [pick, pick] : [fastest(la), fastest(lb)];
  const url = (n: number, lap: number | null) => (lap === null ? null : `/api/replay/${sessionKey}/telemetry?driver=${n}&lap=${lap}`);
  const ta = useApi<LapTelemetry>(url(da.number, lapA));
  const tb = useApi<LapTelemetry>(url(db.number, lapB));
  if (lapA === null || lapB === null) return <EmptyState>Telemetry appears once both drivers have completed a lap.</EmptyState>;

  const items = [{ value: FASTEST, label: "Each driver's fastest lap" }, ...[...both].reverse().map((l) => ({ value: String(l), label: `Lap ${l}` }))];
  const err = ta.error ?? tb.error;
  const [a, b] = [ta.data?.data, tb.data?.data];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Picker label="Lap to compare" value={pick === null ? FASTEST : String(pick)} items={items} onChange={setChoice} className="w-56" />
        <span className="text-muted-foreground">
          {da.acronym} lap {lapA}
          {a && ` (${fmtLap(a.duration)})`} vs {db.acronym} lap {lapB}
          {b && ` (${fmtLap(b.duration)})`}
        </span>
      </div>
      {err ? (
        <ErrorState error={err} onRetry={() => void (ta.error ? ta.refetch() : tb.refetch())} />
      ) : !a || !b ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <TelemetryCharts a={a} b={b} pair={[da, db]} config={config} />
      )}
      <p className="text-xs text-muted-foreground">
        OpenF1 car data, about four samples a second, so short braking points can fall between samples. Distance is estimated from speed. Delta: time{" "}
        {da.acronym} is behind {db.acronym} at that point of the lap.
      </p>
    </div>
  );
}

function TelemetryCharts({ a, b, pair: [da, db], config }: { a: LapTelemetry; b: LapTelemetry; pair: Pair; config: ChartConfig }) {
  const { rows, sectors } = alignLaps(a, b);
  const pct = (d: number) => `${Math.round(d * 100)}%`;
  const x = (show: boolean) => <XAxis dataKey="d" type="number" domain={[0, 1]} tickLine={false} axisLine={false} hide={!show} tickFormatter={pct} ticks={[0, 0.25, 0.5, 0.75, 1]} />;
  const marks = sectors.map((s, i) => <ReferenceLine key={i} x={s} stroke="var(--muted-foreground)" strokeDasharray="2 3" label={{ value: `S${i + 2}`, position: "insideTopLeft", fontSize: 10 }} />);
  const tip = (unit: string, digits = 0) => (
    <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => `${pct(p?.[0]?.payload?.d ?? 0)} of the lap`} formatter={(v, name) => `${config[name as "a"]?.label ?? "Delta"} ${Number(v).toFixed(digits)}${unit}`} />} />
  );
  const pairLines = (key: "Speed" | "Throttle" | "Brake" | "Gear", step = false) => (
    <>
      <Line dataKey={`a${key}`} name="a" stroke="var(--color-a)" strokeWidth={1.5} dot={false} isAnimationActive={false} type={step ? "stepAfter" : "linear"} />
      <Line dataKey={`b${key}`} name="b" stroke="var(--color-b)" strokeDasharray="5 3" strokeWidth={1.5} dot={false} isAnimationActive={false} type={step ? "stepAfter" : "linear"} />
    </>
  );
  const chart = (label: string, className: string, body: ReactNode, show = false) => (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <ChartContainer config={{ ...config, delta: { label: "Delta", color: "var(--foreground)" } }} className={`aspect-auto w-full ${className}`}>
        <LineChart data={rows} syncId="telemetry" margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          {x(show)}
          {marks}
          {body}
        </LineChart>
      </ChartContainer>
    </div>
  );
  return (
    <div className="space-y-1" role="img" aria-label={`Telemetry: ${da.acronym} lap ${a.lap} against ${db.acronym} lap ${b.lap}; ${da.acronym} ends ${fmtDelta(rows.at(-1)!.delta)} s`}>
      {chart(
        `Delta (s), above 0: ${da.acronym} behind`,
        "h-24",
        <>
          <YAxis tickLine={false} axisLine={false} width={40} tickFormatter={(v: number) => v.toFixed(1)} />
          <ReferenceLine y={0} stroke="var(--border)" />
          {tip(" s", 3)}
          <Line dataKey="delta" stroke="var(--color-delta)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </>,
      )}
      {chart(
        "Speed (km/h)",
        "h-40",
        <>
          <YAxis tickLine={false} axisLine={false} width={40} domain={["dataMin - 10", "dataMax + 10"]} tickFormatter={(v: number) => String(Math.round(v))} />
          {tip(" km/h")}
          {pairLines("Speed")}
        </>,
      )}
      {chart(
        "Throttle (%)",
        "h-20",
        <>
          <YAxis tickLine={false} axisLine={false} width={40} domain={[0, 100]} ticks={[0, 100]} />
          {tip("%")}
          {pairLines("Throttle")}
        </>,
      )}
      {chart(
        "Brake",
        "h-14",
        <>
          <YAxis tickLine={false} axisLine={false} width={40} domain={[0, 100]} ticks={[]} />
          {tip("")}
          {pairLines("Brake", true)}
        </>,
      )}
      {chart(
        "Gear",
        "h-20",
        <>
          <YAxis tickLine={false} axisLine={false} width={40} domain={[1, 8]} ticks={[2, 4, 6, 8]} />
          {tip("")}
          {pairLines("Gear", true)}
          <ChartLegend content={<ChartLegendContent />} />
        </>,
        true,
      )}
    </div>
  );
}
