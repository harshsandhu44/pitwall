import type { ReplayDriver, TimingRow, TrackStatus } from "@pitwall/shared";
import { cn } from "@/lib/utils";

// Flag colours are data colours, like team colours: they mean what the marshals' flags mean.
const FLAG: Record<TrackStatus["kind"], string> = {
  green: "bg-gain text-white dark:text-[#0e1013]",
  yellow: "bg-[#f5c518] text-[#12151a]",
  vsc: "bg-[#f5c518] text-[#12151a]",
  sc: "bg-[#f5c518] text-[#12151a]",
  red: "bg-primary text-primary-foreground",
  chequered: "bg-foreground text-background",
};

/** The broadcast "status bar": what the track is doing, who leads, and how fresh the data is. */
export function SessionStatus({
  status,
  rows,
  drivers,
  freshness,
}: {
  status: TrackStatus;
  rows: TimingRow[];
  drivers: Map<number, ReplayDriver>;
  /** e.g. a LIVE badge, or the replay clock. */
  freshness: React.ReactNode;
}) {
  const leader = rows.find((r) => r.position === 1) ?? rows[0];
  const d = leader && drivers.get(leader.driver);
  return (
    <div className="flex flex-wrap items-stretch gap-x-6 gap-y-3">
      <p aria-live="polite" className={cn("flex items-center px-3 py-2 font-display text-lg leading-none font-black tracking-tight uppercase", FLAG[status.kind])}>
        {status.label}
      </p>
      <dl className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <dt className="text-[11px] text-muted-foreground uppercase">Leader</dt>
          <dd className="flex items-center gap-1.5 font-mono text-lg font-semibold">
            <span aria-hidden className="h-4 w-1 bg-muted-foreground/40" style={d?.colour ? { backgroundColor: d.colour } : undefined} />
            {d?.acronym ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted-foreground uppercase">Lap</dt>
          <dd className="font-mono text-lg font-semibold tabular-nums">{leader?.lap ?? "—"}</dd>
        </div>
        <div className="self-center">{freshness}</div>
      </dl>
    </div>
  );
}
