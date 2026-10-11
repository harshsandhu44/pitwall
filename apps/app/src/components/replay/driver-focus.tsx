import type { ReplayDriver, TimingRow } from "@pitwall/shared";
import { EmptyState } from "@/components/data/query-state";
import { Tyre } from "@/components/replay/timing-tower";
import { fmtGap, fmtLap } from "@/lib/format";

/** One driver up close: the selected row of the timing tower, plus the cars either side of them. */
export function DriverFocus({
  rows,
  drivers,
  selected,
  intervals,
}: {
  rows: TimingRow[];
  drivers: Map<number, ReplayDriver>;
  selected: number | null;
  /** Gaps only exist for races and sprints. */
  intervals: boolean;
}) {
  const i = rows.findIndex((r) => r.driver === selected);
  const r = rows[i];
  if (!r) return <EmptyState>Select a driver in Timing or on the track map.</EmptyState>;
  const d = drivers.get(r.driver);
  const ahead = rows[i - 1];
  const behind = rows[i + 1];
  const name = (row: TimingRow | undefined) => (row ? (drivers.get(row.driver)?.acronym ?? row.driver) : null);
  const stats: [string, React.ReactNode][] = [
    ...(intervals
      ? ([
          [`Gap ahead${ahead ? ` (${name(ahead)})` : ""}`, ahead ? fmtGap(r.interval) : "Leading"],
          [`Gap behind${behind ? ` (${name(behind)})` : ""}`, behind ? fmtGap(behind.interval) : "—"],
          ["To leader", r.position === 1 ? "—" : fmtGap(r.gap)],
        ] as [string, React.ReactNode][])
      : []),
    ["Last lap", fmtLap(r.lastLap)],
    ["Best lap", fmtLap(r.bestLap)],
    ["Lap", r.lap ?? "—"],
    ["Tyre", <Tyre key="t" compound={r.compound} age={r.tyreAge} />],
    ["Pit visits", r.pits],
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="font-display text-4xl leading-none font-black tabular-nums">P{r.position ?? "—"}</span>
        <span aria-hidden className="h-10 w-1.5 bg-muted-foreground/40" style={d?.colour ? { backgroundColor: d.colour } : undefined} />
        <div className="min-w-0">
          <p className="truncate font-semibold">{d?.name ?? `Car ${r.driver}`}</p>
          <p className="truncate text-xs text-muted-foreground">
            #{r.driver}
            {d?.team && ` · ${d.team}`}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {stats.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="truncate text-[11px] text-muted-foreground uppercase">{k}</dt>
            <dd className="font-mono tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
