import type { ReplayDriver, TimingRow, TrackStatus } from "@pitwall/shared";
import { fmtMinutes } from "@/lib/format";
import { useNow } from "@/lib/hooks";
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
  segment,
}: {
  status: TrackStatus;
  rows: TimingRow[];
  drivers: Map<number, ReplayDriver>;
  /** e.g. a LIVE badge, or the replay clock. */
  freshness: React.ReactNode;
  /** Qualifying: the segment and its clock, in place of the lap. */
  segment?: SegmentClockProps & { label: string };
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
          <dt className="text-[11px] text-muted-foreground uppercase">{segment ? "Fastest" : "Leader"}</dt>
          <dd className="flex items-center gap-1.5 font-mono text-lg font-semibold">
            <span aria-hidden className="h-4 w-1 bg-muted-foreground/40" style={d?.colour ? { backgroundColor: d.colour } : undefined} />
            {d?.acronym ?? "—"}
          </dd>
        </div>
        {segment ? (
          <div>
            <dt className="text-[11px] text-muted-foreground uppercase">{segment.label} left</dt>
            <dd className="font-mono text-lg font-semibold tabular-nums">
              <SegmentClock {...segment} />
            </dd>
          </div>
        ) : (
          <div>
            <dt className="text-[11px] text-muted-foreground uppercase">Lap</dt>
            <dd className="font-mono text-lg font-semibold tabular-nums">{leader?.lap ?? "—"}</dd>
          </div>
        )}
        <div className="self-center">{freshness}</div>
      </dl>
    </div>
  );
}

type SegmentClockProps = {
  /** ms; null when the estimate doesn't hold up. */
  timeLeft: number | null;
  running: boolean;
  /** Live: keep counting down from this instant. */
  since?: number;
};

/** OpenF1 doesn't publish the official clock: the segment's length minus its green-light running so far. */
function SegmentClock({ timeLeft, running, since }: SegmentClockProps) {
  const now = useNow();
  if (timeLeft === null) return <>—</>;
  const left = running && since !== undefined && now !== null ? timeLeft - Math.max(0, now - since) : timeLeft;
  return (
    <>
      {fmtMinutes(left)}{" "}
      <abbr
        title="Estimated: the segment's set length minus its green-flag running time, paused for red flags. OpenF1 doesn't publish the official clock."
        className="font-sans text-[11px] font-normal text-muted-foreground no-underline"
      >
        est.
      </abbr>
      {!running && left > 0 && <span className="ml-1 font-sans text-[11px] font-normal text-muted-foreground">paused</span>}
    </>
  );
}
