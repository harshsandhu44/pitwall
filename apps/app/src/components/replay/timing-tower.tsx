"use client";

import type { ReplayDriver, TimingRow } from "@pitwall/shared";
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { DropdownMenuCheckboxItem, DropdownMenuGroup, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { fmtGap, fmtLap } from "@/lib/format";

// Pirelli's conventional compound colours; the letter is always shown too.
export const COMPOUND: Record<string, { letter: string; className: string }> = {
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

/** Optional tower columns; Pos and Driver always show. `race`: only meaningful for races and sprints. */
const COLUMNS = [
  { id: "gap", label: "Gap to leader", race: true },
  { id: "int", label: "Interval", race: true },
  { id: "lap", label: "Lap" },
  { id: "last", label: "Last lap" },
  { id: "best", label: "Best lap" },
  { id: "sectors", label: "Last-lap sectors" },
  { id: "tyre", label: "Tyre" },
  { id: "pit", label: "Pit visits" },
  { id: "gained", label: "Places gained", race: true },
  { id: "penalty", label: "Penalty" },
] as const;
export type Column = (typeof COLUMNS)[number]["id"];

// One saved set for Live and Replay, shared by the tower and its menu.
const KEY = "pitwall.tower.columns.v1";
const DEFAULT = JSON.stringify(COLUMNS.map((c) => c.id).filter((c) => c !== "sectors"));
const listeners = new Set<() => void>();
let current: string | null = null;
function read() {
  if (current !== null) return current;
  try {
    current = localStorage.getItem(KEY);
  } catch {
    // storage blocked: defaults
  }
  // Phones start without the lap times, which don't fit beside the gaps.
  current ??= window.matchMedia("(max-width: 767px)").matches ? JSON.stringify(JSON.parse(DEFAULT).filter((c: Column) => c !== "last" && c !== "best")) : DEFAULT;
  return current;
}
function useColumns() {
  const shown = new Set<Column>(
    JSON.parse(
      useSyncExternalStore(
        (cb) => (listeners.add(cb), () => listeners.delete(cb)),
        read,
        () => DEFAULT,
      ),
    ),
  );
  const toggle = (c: Column, on: boolean) => {
    current = JSON.stringify(COLUMNS.map((x) => x.id).filter((x) => (x === c ? on : shown.has(x))));
    try {
      localStorage.setItem(KEY, current);
    } catch {
      // per-viewer convenience only
    }
    for (const l of listeners) l();
  };
  return { shown, toggle };
}

/** The tower's column checkboxes, for its panel menu. */
export function TowerColumnsMenu({ intervals }: { intervals: boolean }) {
  const { shown, toggle } = useColumns();
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>Columns</DropdownMenuLabel>
      {COLUMNS.filter((c) => intervals || !("race" in c)).map((c) => (
        <DropdownMenuCheckboxItem key={c.id} checked={shown.has(c.id)} onCheckedChange={(on) => toggle(c.id, on)}>
          {c.label}
        </DropdownMenuCheckboxItem>
      ))}
    </DropdownMenuGroup>
  );
}

const SECTOR_MARK = { session: "font-semibold text-purple", personal: "text-gain" } as const;

export function TimingTower({
  rows,
  drivers,
  selected,
  onSelect,
  intervals,
  caption = "Timing at the replay position, from recorded OpenF1 data",
  penalties,
  only,
}: {
  rows: TimingRow[];
  drivers: Map<number, ReplayDriver>;
  selected: number | null;
  onSelect: (n: number | null) => void;
  /** Gap/interval columns only make sense for races and sprints. */
  intervals: boolean;
  caption?: string;
  /** Pending penalty labels ("+5s", "DT") by car. */
  penalties?: Map<number, string>;
  /** These columns, instead of the viewer's saved set (a narrow panel). */
  only?: Column[];
}) {
  const saved = useColumns().shown;
  const shown = only ? new Set(only) : saved;
  const on = (c: (typeof COLUMNS)[number]) => shown.has(c.id) && (intervals || !("race" in c));
  const col = Object.fromEntries(COLUMNS.map((c) => [c.id, on(c)])) as Record<Column, boolean>;
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
  const num = "text-right font-mono tabular-nums";
  return (
    <Table className="text-xs">
      <caption className="sr-only">{caption}</caption>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8">Pos</TableHead>
          <TableHead>Driver</TableHead>
          {col.gap && <TableHead className="text-right">Gap</TableHead>}
          {col.int && <TableHead className="text-right"><abbr title="Interval to the car ahead">Int</abbr></TableHead>}
          {col.lap && <TableHead className="text-right">Lap</TableHead>}
          {col.last && <TableHead className="text-right">Last</TableHead>}
          {col.best && <TableHead className="text-right">Best</TableHead>}
          {col.sectors && ["S1", "S2", "S3"].map((h) => <TableHead key={h} className="text-right">{h}</TableHead>)}
          {col.tyre && <TableHead>Tyre</TableHead>}
          {col.pit && <TableHead className="text-right"><abbr title="Pit-lane visits, including red-flag entries">Pit</abbr></TableHead>}
          {col.gained && <TableHead className="text-right"><abbr title="Places gained since the start">+/−</abbr></TableHead>}
          {col.penalty && <TableHead className="text-right"><abbr title="Penalties not yet served">Pen</abbr></TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody ref={body}>
        {rows.map((r) => {
          const d = drivers.get(r.driver);
          const sel = r.driver === selected;
          const gained = r.position != null && r.startPosition != null ? r.startPosition - r.position : null;
          const pen = penalties?.get(r.driver);
          return (
            <TableRow key={r.driver} data-driver={r.driver} data-state={sel ? "selected" : undefined}>
              <TableCell className={`font-mono tabular-nums ${r.position === 1 ? "font-bold text-live" : ""}`}>{r.position ?? "—"}</TableCell>
              <TableCell>
                <button
                  type="button"
                  aria-pressed={sel}
                  onClick={() => onSelect(sel ? null : r.driver)}
                  className="inline-flex items-center gap-1.5 hover:text-live hover:underline"
                >
                  <span aria-hidden className="h-3 w-1 rounded-full bg-muted-foreground/40" style={d?.colour ? { backgroundColor: d.colour } : undefined} />
                  <span className="font-mono font-medium">{d?.acronym ?? r.driver}</span>
                  <span className="sr-only">{d?.name}</span>
                </button>
              </TableCell>
              {col.gap && <TableCell className={num}>{r.position === 1 ? "Leader" : fmtGap(r.gap)}</TableCell>}
              {col.int && <TableCell className={num}>{r.position === 1 ? "—" : fmtGap(r.interval)}</TableCell>}
              {col.lap && <TableCell className={num}>{r.lap ?? "—"}</TableCell>}
              {col.last && <TableCell className={num}>{fmtLap(r.lastLap)}</TableCell>}
              {col.best && <TableCell className={num}>{fmtLap(r.bestLap)}</TableCell>}
              {col.sectors &&
                [0, 1, 2].map((i) => {
                  const mark = r.sectorMark[i];
                  return (
                    <TableCell key={i} className={cn(num, mark && SECTOR_MARK[mark])}>
                      {r.sectors[i]?.toFixed(3) ?? "—"}
                      {mark && <span className="sr-only">{mark === "session" ? " (fastest of the session)" : " (personal best)"}</span>}
                    </TableCell>
                  );
                })}
              {col.tyre && (
                <TableCell>
                  <Tyre compound={r.compound} age={r.tyreAge} />
                </TableCell>
              )}
              {col.pit && <TableCell className={num}>{r.pits}</TableCell>}
              {col.gained && (
                <TableCell className={cn(num, gained !== null && gained > 0 && "text-gain", gained !== null && gained < 0 && "text-loss", gained === 0 && "text-muted-foreground")}>
                  {gained === null ? "—" : gained > 0 ? `+${gained}` : gained < 0 ? `−${-gained}` : "0"}
                </TableCell>
              )}
              {col.penalty && <TableCell className={cn(num, pen && "font-semibold text-live")}>{pen ?? ""}</TableCell>}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
