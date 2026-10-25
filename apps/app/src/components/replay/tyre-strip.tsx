import type { ReplayDriver, ReplayStint, TimingRow } from "@pitwall/shared";
import { EmptyState } from "@/components/data/query-state";
import { cn } from "@/lib/utils";
import { COMPOUND } from "./timing-tower";

// Bar fills in Pirelli's colours; the hard (white) compound gets an outline so it shows on a light card.
const FILL: Record<string, string> = {
  SOFT: "bg-red-500 text-white",
  MEDIUM: "bg-yellow-400 text-black",
  HARD: "bg-neutral-100 text-black ring-1 ring-inset ring-foreground/40",
  INTERMEDIATE: "bg-green-500 text-black",
  WET: "bg-blue-500 text-white",
};

/**
 * Every driver's stints so far, in running order: one bar per stint, as long as its laps. Stints are cut at the
 * driver's current lap, so a replay never shows a stint's later end.
 */
export function TyreStrip({
  rows,
  drivers,
  stints,
  selected,
  onSelect,
}: {
  rows: TimingRow[];
  drivers: Map<number, ReplayDriver>;
  stints: Record<number, ReplayStint[]>;
  selected: number | null;
  onSelect: (n: number | null) => void;
}) {
  // Scale to the longest stint record (the race distance in a replay) or the leader's lap, whichever is more.
  const total = Math.max(1, ...rows.map((r) => r.lap ?? 0), ...Object.values(stints).flat().map((s) => s.lapEnd));
  // Each stint ends at its last lap so far; the latest runs to the current lap (live, lap_end lags a lap).
  const shown = rows.map((r) => {
    const all = stints[r.driver] ?? [];
    return {
      r,
      stints: all
        .filter((s) => r.lap !== null && s.lapStart <= r.lap)
        .map((s) => ({ ...s, lapEnd: s === all.at(-1) ? r.lap! : Math.min(s.lapEnd, r.lap!) })),
    };
  });
  if (!shown.some((s) => s.stints.length)) return <EmptyState>Tyre stints appear once cars are on track.</EmptyState>;
  return (
    <ol className="space-y-1 text-xs">
      {shown.map(({ r, stints: list }) => {
        const d = drivers.get(r.driver);
        const sel = r.driver === selected;
        const used = [...new Set(list.map((s) => s.compound).filter(Boolean))] as string[];
        return (
          <li key={r.driver} className={cn("flex items-center gap-2", sel && "bg-muted/60")}>
            <span className="w-6 text-right font-mono tabular-nums text-muted-foreground">{r.position ?? "—"}</span>
            <button
              type="button"
              aria-pressed={sel}
              onClick={() => onSelect(sel ? null : r.driver)}
              className="w-9 text-left font-mono font-medium hover:text-live hover:underline aria-pressed:text-live"
            >
              {d?.acronym ?? r.driver}
            </button>
            <div className="relative h-4 flex-1" aria-label={`${d?.acronym ?? r.driver}: ${list.map((s) => `${s.compound?.toLowerCase() ?? "unknown"} laps ${s.lapStart}-${s.lapEnd}`).join(", ")}`} role="img">
              {list.map((s) => {
                const end = s.lapEnd;
                return (
                  <span
                    key={s.stint}
                    title={`${s.compound ?? "Unknown"}: laps ${s.lapStart}-${end}`}
                    className={cn(
                      "absolute inset-y-0 flex items-center justify-center overflow-hidden border-r-2 border-card font-mono text-[9px] font-bold",
                      FILL[s.compound ?? ""] ?? "bg-muted-foreground/40",
                    )}
                    style={{ left: `${((s.lapStart - 1) / total) * 100}%`, width: `${((end - s.lapStart + 1) / total) * 100}%` }}
                  >
                    {COMPOUND[s.compound ?? ""]?.letter ?? "?"}
                  </span>
                );
              })}
            </div>
            <span className="w-6 text-right font-mono tabular-nums text-muted-foreground" title="Laps on the current set">
              {r.tyreAge ?? ""}
            </span>
            <span className="w-10 font-mono text-[10px] text-muted-foreground" title="Compounds used">
              {used.map((c) => COMPOUND[c]?.letter ?? "?").join("")}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
