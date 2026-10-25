"use client";

import type { ReplayDriver, SessionReplay, TimingRow } from "@pitwall/shared";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/data/query-state";
import { type ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtGap, fmtLap } from "@/lib/format";
import { Tyre } from "./timing-tower";

function DriverSelect({ label, value, drivers, onChange }: { label: string; value: number; drivers: ReplayDriver[]; onChange: (n: number) => void }) {
  const items = drivers.map((d) => ({ value: String(d.number), label: `${d.acronym} · ${d.name}` }));
  return (
    <Select items={items} value={String(value)} onValueChange={(v) => v && onChange(Number(v))}>
      <SelectTrigger aria-label={label} className="w-52">
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

/** Two drivers side by side, using only laps completed by the replay position. */
export function DriverComparison({
  replay,
  rows,
  t,
  pair,
  onPair,
}: {
  replay: SessionReplay;
  rows: TimingRow[];
  t: number;
  pair: [number, number];
  onPair: (p: [number, number]) => void;
}) {
  const [a, b] = pair;
  const da = replay.drivers.find((d) => d.number === a);
  const db = replay.drivers.find((d) => d.number === b);
  if (!da || !db) return <EmptyState>Choose two drivers.</EmptyState>;

  const done = (n: number) => (replay.laps[n] ?? []).filter((l) => l.start !== null && l.duration !== null && l.start + l.duration * 1000 <= t);
  const la = done(a);
  const lb = done(b);
  const laps = [...new Set([...la, ...lb].map((l) => l.lap))].sort((x, y) => x - y);
  const data = laps.map((lap) => ({ lap, a: la.find((l) => l.lap === lap)?.duration ?? null, b: lb.find((l) => l.lap === lap)?.duration ?? null }));
  const fastest = Math.min(...[...la, ...lb].map((l) => l.duration!));
  const config: ChartConfig = { a: { label: da.acronym, color: da.colour ?? "var(--chart-1)" }, b: { label: db.acronym, color: db.colour ?? "var(--chart-3)" } };

  const maxLap = Math.max(1, ...Object.values(replay.stints).flat().map((s) => s.lapEnd));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <DriverSelect label="First driver" value={a} drivers={replay.drivers} onChange={(n) => onPair([n, b])} />
        <DriverSelect label="Second driver" value={b} drivers={replay.drivers} onChange={(n) => onPair([a, n])} />
      </div>

      <table className="w-full text-xs">
        <caption className="sr-only">Comparison at the replay position</caption>
        <thead className="text-muted-foreground">
          <tr className="text-left">
            <th className="font-normal">Driver</th>
            <th className="font-normal">Pos</th>
            <th className="font-normal">Gap</th>
            <th className="font-normal">Last lap</th>
            <th className="hidden font-normal sm:table-cell">Sectors (last lap)</th>
            <th className="font-normal">Tyre</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {([
            [da, la],
            [db, lb],
          ] as const).map(([drv, done]) => {
            const r = rows.find((x) => x.driver === drv.number);
            const last = done.at(-1);
            return (
              <tr key={drv.number}>
                <td className="font-medium">{drv.acronym}</td>
                <td>{r?.position ?? "—"}</td>
                <td>{r?.position === 1 ? "Leader" : fmtGap(r?.gap ?? null)}</td>
                <td>{fmtLap(last?.duration ?? null)}</td>
                <td className="hidden sm:table-cell">{last ? last.sectors.map((x) => (x === null ? "—" : x.toFixed(3))).join(" / ") : "—"}</td>
                <td>
                  <Tyre compound={r?.compound ?? null} age={r?.tyreAge ?? null} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Tyre strategy (laps)</p>
        {[da, db].map((d) => {
          const lap = rows.find((r) => r.driver === d.number)?.lap ?? 0;
          return (
            <div key={d.number} className="flex items-center gap-2">
              <span className="w-8 font-mono text-[11px]">{d.acronym}</span>
              <div className="relative h-4 flex-1 rounded-sm bg-muted">
                {(replay.stints[d.number] ?? [])
                  .filter((s) => s.lapStart <= lap)
                  .map((s) => (
                    <span
                      key={s.stint}
                      title={`${s.compound ?? "Unknown"}: laps ${s.lapStart}–${Math.min(s.lapEnd, lap)}`}
                      className="absolute inset-y-0 flex items-center justify-center overflow-hidden border-r border-background bg-foreground/20 font-mono text-[9px]"
                      style={{ left: `${((s.lapStart - 1) / maxLap) * 100}%`, width: `${((Math.min(s.lapEnd, lap) - s.lapStart + 1) / maxLap) * 100}%` }}
                    >
                      {s.compound?.[0] ?? "?"}
                    </span>
                  ))}
              </div>
            </div>
          );
        })}
      </div>

      {data.length < 2 ? (
        <EmptyState>Lap times appear once both drivers have completed laps.</EmptyState>
      ) : (
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
      )}
    </div>
  );
}
