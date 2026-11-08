"use client";

import type { LapState, QualiState, ReplayDriver, TimingRow } from "@pitwall/shared";
import { Fragment, useState } from "react";
import { EmptyState } from "@/components/data/query-state";
import { TeamEmblem } from "@/components/racing/team-mark";
import { SECTOR_MARK, Tyre, useRowGlide } from "@/components/replay/timing-tower";
import type { CarMark } from "@/components/replay/track-canvas";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { fmtGap, fmtLap } from "@/lib/format";
import { cn } from "@/lib/utils";

const RUN: Record<NonNullable<LapState>, string> = { push: "Push", unknown: "On lap", out: "Out lap", slow: "Slow" };

/** The timing rows in qualifying order, with the segment's best as the best lap: for focus, comparison and the status bar. */
export function qualiTiming(q: QualiState, rows: TimingRow[]): TimingRow[] {
  const by = new Map(rows.map((r) => [r.driver, r]));
  const order = q.standings.at(-1);
  if (!order) return rows;
  return order.flatMap((o) => {
    const r = by.get(o.driver);
    return r ? [{ ...r, position: o.position, bestLap: o.best }] : [];
  });
}

/** On the map: cars not on a push lap fade; a push lap from the drop zone gets a red ring. */
export function carMarks(q: QualiState): Map<number, CarMark> {
  const out = new Map<number, CarMark>();
  for (const r of q.standings.at(-1) ?? []) {
    if (r.state === "push" && r.danger) out.set(r.driver, "danger");
    else if (r.state !== "push" && r.state !== "unknown") out.set(r.driver, "dim");
  }
  return out;
}

/**
 * The qualifying tower: one segment's order by best lap, a knockout line at the cutoff, then the cars already out.
 * It follows the segment under way; picking an earlier one shows how it finished (as far as `t` has got).
 */
export function QualifyingTower({
  q,
  timing,
  drivers,
  selected,
  onSelect,
  compact = false,
  caption,
}: {
  q: QualiState;
  /** For each car's tyre. */
  timing: TimingRow[];
  drivers: Map<number, ReplayDriver>;
  selected: number | null;
  onSelect: (n: number | null) => void;
  /** The narrow 3D side panel: no sectors, laps or run column. */
  compact?: boolean;
  caption: string;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const last = q.standings.length - 1;
  const i = picked !== null && picked < last ? picked : last;
  const rows = q.standings[i] ?? [];
  const body = useRowGlide(rows);
  const seg = q.segments[i];
  if (!seg) return <EmptyState>Qualifying hasn&apos;t started at this point.</EmptyState>;
  const final = q.final[i]!;
  const running = rows.filter((r) => r.out === null).length;
  const safe = seg.phase < 3 ? running - q.knockout : null;
  const tyre = new Map(timing.map((r) => [r.driver, r]));
  const cols = compact ? 5 : 10;
  const num = "text-right font-mono tabular-nums";
  return (
    <div className="space-y-2">
      {q.segments.length > 1 && (
        <ToggleGroup
          value={[String(i)]}
          onValueChange={(v: string[]) => v[0] && setPicked(Number(v[0]) === last ? null : Number(v[0]))}
          aria-label="Qualifying segment"
          variant="outline"
          size="sm"
        >
          {q.segments.map((s, k) => (
            <ToggleGroupItem key={s.phase} value={String(k)} className="font-mono text-[11px]">
              {s.label}
              {k === last && q.current?.end === null && <span className="sr-only"> (under way)</span>}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
      <Table className="text-xs">
        <caption className="sr-only">
          {caption}: {seg.label}
          {final ? ", final order" : ""}
        </caption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">Pos</TableHead>
            <TableHead>Driver</TableHead>
            <TableHead className="text-right">Best</TableHead>
            <TableHead className="text-right">Gap</TableHead>
            {!compact && ["S1", "S2", "S3"].map((h) => <TableHead key={h} className="text-right">{h}</TableHead>)}
            {!compact && <TableHead className="text-right"><abbr title={`Laps completed in ${seg.label}`}>Laps</abbr></TableHead>}
            <TableHead>Tyre</TableHead>
            {!compact && <TableHead>Run</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody ref={body}>
          {rows.map((r, k) => {
            const d = drivers.get(r.driver);
            const sel = r.driver === selected;
            const outIn = r.out ?? (final && r.danger ? seg.phase : null);
            const t = tyre.get(r.driver);
            return (
              <Fragment key={r.driver}>
                {safe !== null && k === safe && r.out === null && (
                  <TableRow aria-hidden className="border-0 hover:bg-transparent">
                    <TableCell colSpan={cols} className="h-auto p-0">
                      <div className="flex items-center gap-2 py-0.5 text-[10px] font-semibold text-loss uppercase">
                        <span className="h-px flex-1 border-t border-dashed border-loss" />
                        Knockout
                        <span className="h-px flex-1 border-t border-dashed border-loss" />
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                <TableRow
                  data-driver={r.driver}
                  data-state={sel ? "selected" : undefined}
                  className={cn(outIn !== null && "text-muted-foreground", r.out !== null && rows[k - 1]?.out === null && "border-t-2")}
                >
                  <TableCell className={cn("font-mono tabular-nums", r.position === 1 && outIn === null && "font-bold text-live", r.danger && outIn === null && "text-loss")}>
                    {r.position}
                    {r.danger && outIn === null && (
                      <>
                        <span aria-hidden> ▼</span>
                        <span className="sr-only"> (in the drop zone)</span>
                      </>
                    )}
                  </TableCell>
                  <TableCell>
                    <button type="button" aria-pressed={sel} onClick={() => onSelect(sel ? null : r.driver)} className="inline-flex items-center gap-1.5 hover:text-live hover:underline">
                      <TeamEmblem id={d?.teamId} colour={d?.colour ?? null} className={cn("mr-0", outIn !== null && "opacity-50")} />
                      <span className="font-mono font-medium">{d?.acronym ?? r.driver}</span>
                      <span className="sr-only">{d?.name}</span>
                    </button>
                  </TableCell>
                  <TableCell className={num}>{fmtLap(r.best)}</TableCell>
                  <TableCell className={cn(num, outIn !== null && "font-sans")}>
                    {outIn !== null ? `Out ${q.segments[outIn - 1]?.label ?? `Q${outIn}`}` : r.position === 1 ? "" : fmtGap(r.gap)}
                  </TableCell>
                  {!compact &&
                    [0, 1, 2].map((s) => {
                      const mark = outIn === null ? r.sectorMark[s] : null;
                      return (
                        <TableCell key={s} className={cn(num, mark && SECTOR_MARK[mark])}>
                          {r.sectors[s]?.toFixed(3) ?? "—"}
                          {mark && <span className="sr-only">{mark === "session" ? ` (fastest of ${seg.label})` : " (personal best)"}</span>}
                        </TableCell>
                      );
                    })}
                  {!compact && <TableCell className={num}>{r.laps}</TableCell>}
                  <TableCell>
                    <Tyre compound={t?.compound ?? null} age={t?.tyreAge ?? null} />
                  </TableCell>
                  {!compact && (
                    <TableCell className={cn("whitespace-nowrap", r.state === "push" && "font-medium text-live", r.state !== "push" && "text-muted-foreground")}>
                      {i === last && r.state ? RUN[r.state] : ""}
                    </TableCell>
                  )}
                </TableRow>
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
