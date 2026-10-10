import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";

/** Change since the previous round, from official per-round standings. Renders nothing when unknown. */
export function PositionChange({ prev, curr }: { prev: number | null | undefined; curr: number | null | undefined }) {
  if (prev == null || curr == null) return null;
  const delta = prev - curr;
  if (delta === 0) return <span className="text-muted-foreground" aria-label="no change">–</span>;
  const Icon = delta > 0 ? ArrowUpIcon : ArrowDownIcon;
  return (
    <span className="inline-flex items-center font-mono text-[11px] tabular-nums" aria-label={`${delta > 0 ? "up" : "down"} ${Math.abs(delta)}`}>
      <Icon aria-hidden className="size-3" />
      {Math.abs(delta)}
    </span>
  );
}

/** Previous and current position for a subject from a progression series. */
export function lastTwo(positions: (number | null)[] | undefined) {
  if (!positions || positions.length < 2) return { prev: null, curr: null };
  return { prev: positions.at(-2) ?? null, curr: positions.at(-1) ?? null };
}
