"use client";

import type { ReplayDriver, TimingRow } from "@pitwall/shared";
import { useLayoutEffect, useRef } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { fmtGap, fmtLap } from "@/lib/format";

// Pirelli's conventional compound colours; the letter is always shown too.
const COMPOUND: Record<string, { letter: string; className: string }> = {
  SOFT: { letter: "S", className: "border-red-500 text-red-500" },
  MEDIUM: { letter: "M", className: "border-yellow-400 text-yellow-500" },
  HARD: { letter: "H", className: "border-foreground text-foreground" },
  INTERMEDIATE: { letter: "I", className: "border-green-500 text-green-500" },
  WET: { letter: "W", className: "border-blue-500 text-blue-500" },
};

export function Tyre({ compound, age }: { compound: string | null; age: number | null }) {
  if (!compound) return <span className="text-muted-foreground">—</span>;
  const c = COMPOUND[compound];
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span
        title={compound}
        className={cn("inline-flex size-4 items-center justify-center rounded-full border-2 font-mono text-[9px] font-bold", c?.className ?? "border-muted-foreground")}
      >
        <span aria-hidden>{c?.letter ?? "?"}</span>
        <span className="sr-only">{compound.toLowerCase()}</span>
      </span>
      {age !== null && <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{age}</span>}
    </span>
  );
}

export function TimingTower({
  rows,
  drivers,
  selected,
  onSelect,
  intervals,
  caption = "Timing at the replay position, from recorded OpenF1 data",
}: {
  rows: TimingRow[];
  drivers: Map<number, ReplayDriver>;
  selected: number | null;
  onSelect: (n: number | null) => void;
  /** Gap/interval columns only make sense for races and sprints. */
  intervals: boolean;
  caption?: string;
}) {
  const body = useRef<HTMLTableSectionElement>(null);
  const last = useRef(new Map<number, { top: number; position: number | null }>());
  // Rows glide to their new place, and a gained or lost place flashes the row's edge green or red.
  useLayoutEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const tr of body.current?.querySelectorAll<HTMLTableRowElement>("tr[data-driver]") ?? []) {
      const n = Number(tr.dataset.driver);
      const position = rows.find((r) => r.driver === n)?.position ?? null;
      const before = last.current.get(n);
      last.current.set(n, { top: tr.offsetTop, position });
      if (reduce || !before || !tr.animate) continue;
      if (before.top !== tr.offsetTop) {
        tr.animate([{ transform: `translateY(${before.top - tr.offsetTop}px)` }, { transform: "none" }], { duration: 450, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
      }
      if (before.position !== null && position !== null && before.position !== position) {
        const c = position < before.position ? "var(--gain)" : "var(--loss)";
        tr.animate([{ boxShadow: `inset 3px 0 0 ${c}` }, { boxShadow: `inset 3px 0 0 transparent` }], { duration: 1500, easing: "ease-out" });
      }
    }
  }, [rows]);
  return (
    <Table className="text-xs">
      <caption className="sr-only">{caption}</caption>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8">Pos</TableHead>
          <TableHead>Driver</TableHead>
          {intervals && <TableHead className="text-right">Gap</TableHead>}
          {intervals && <TableHead className="text-right">Int</TableHead>}
          <TableHead className="text-right">Lap</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Last</TableHead>
          <TableHead className="hidden text-right md:table-cell">Best</TableHead>
          <TableHead>Tyre</TableHead>
          <TableHead className="text-right" title="Pit-lane visits, including red-flag entries">Pit</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody ref={body}>
        {rows.map((r) => {
          const d = drivers.get(r.driver);
          const sel = r.driver === selected;
          return (
            <TableRow key={r.driver} data-driver={r.driver} data-state={sel ? "selected" : undefined}>
              <TableCell className="font-mono tabular-nums">{r.position ?? "—"}</TableCell>
              <TableCell>
                <button
                  type="button"
                  aria-pressed={sel}
                  onClick={() => onSelect(sel ? null : r.driver)}
                  className="inline-flex items-center gap-1.5 hover:underline"
                >
                  <span aria-hidden className="h-3 w-1 rounded-full bg-muted-foreground/40" style={d?.colour ? { backgroundColor: d.colour } : undefined} />
                  <span className="font-mono font-medium">{d?.acronym ?? r.driver}</span>
                  <span className="sr-only">{d?.name}</span>
                </button>
              </TableCell>
              {intervals && <TableCell className="text-right font-mono tabular-nums">{r.position === 1 ? "Leader" : fmtGap(r.gap)}</TableCell>}
              {intervals && <TableCell className="text-right font-mono tabular-nums">{r.position === 1 ? "—" : fmtGap(r.interval)}</TableCell>}
              <TableCell className="text-right font-mono tabular-nums">{r.lap ?? "—"}</TableCell>
              <TableCell className="hidden text-right font-mono tabular-nums sm:table-cell">{fmtLap(r.lastLap)}</TableCell>
              <TableCell className="hidden text-right font-mono tabular-nums md:table-cell">{fmtLap(r.bestLap)}</TableCell>
              <TableCell>
                <Tyre compound={r.compound} age={r.tyreAge} />
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">{r.pits}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
