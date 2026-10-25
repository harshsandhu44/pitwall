import type { ReplayDriver, StewardsItem, StewardsKind } from "@pitwall/shared";
import { EmptyState } from "@/components/data/query-state";
import { Badge } from "@/components/ui/badge";
import { fmtClock } from "@/lib/format";
import { cn } from "@/lib/utils";

const KIND: Record<StewardsKind, { label: string; className: string }> = {
  penalty: { label: "Penalty", className: "border-live bg-live/10 text-live" },
  served: { label: "Served", className: "" },
  investigation: { label: "Investigation", className: "border-foreground/40" },
  cleared: { label: "No action", className: "text-muted-foreground" },
  deleted: { label: "Lap deleted", className: "text-muted-foreground" },
  warning: { label: "Black & white", className: "border-foreground/40" },
};

/** The stewards' decisions, investigations, deleted laps and warnings published so far, newest first. */
export function Penalties({
  items,
  drivers,
  selected,
  onSelect,
}: {
  items: StewardsItem[];
  drivers: Map<number, ReplayDriver>;
  selected: number | null;
  onSelect: (n: number | null) => void;
}) {
  if (!items.length) return <EmptyState>No stewards&apos; decisions yet.</EmptyState>;
  return (
    <ol className="space-y-2 text-xs">
      {[...items].reverse().map((i) => (
        <li key={`${i.t}-${i.text}`} className={cn("space-y-0.5", i.kind === "cleared" || i.kind === "deleted" ? "text-muted-foreground" : "")}>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <Badge variant="outline" className={cn("h-4 px-1 text-[10px]", KIND[i.kind].className)}>
              {KIND[i.kind].label}
            </Badge>
            <span className="font-mono tabular-nums">{fmtClock(i.t)}</span>
            {i.lap !== null && <span>Lap {i.lap}</span>}
            {i.drivers.map((n) => {
              const d = drivers.get(n);
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={selected === n}
                  onClick={() => onSelect(selected === n ? null : n)}
                  className="inline-flex items-center gap-1 font-mono font-medium text-foreground hover:text-live hover:underline aria-pressed:text-live"
                >
                  <span aria-hidden className="h-2.5 w-1 rounded-full bg-muted-foreground/40" style={d?.colour ? { backgroundColor: d.colour } : undefined} />
                  {d?.acronym ?? n}
                </button>
              );
            })}
          </div>
          <p>{i.text}</p>
        </li>
      ))}
    </ol>
  );
}
