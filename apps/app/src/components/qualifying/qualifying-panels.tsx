"use client";

import type { QualiState, ReplayDriver, ReplayStint, TimingRow, TrackStatus } from "@pitwall/shared";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/data/query-state";
import type { PanelDef } from "@/components/dashboard/panel-grid";
import { DriverFocus } from "@/components/replay/driver-focus";
import { SessionStatus } from "@/components/replay/session-status";
import { Tyre } from "@/components/replay/timing-tower";
import { Badge } from "@/components/ui/badge";
import { fmtClock, fmtDelta, fmtLap } from "@/lib/format";
import { cn } from "@/lib/utils";
import { QualifyingTower } from "./qualifying-tower";

const acronym = (drivers: Map<number, ReplayDriver>, n: number) => drivers.get(n)?.acronym ?? String(n);

/** Each lap that set a driver's best in its segment, newest first, with the cars it pushed below the line. */
export function ImprovementsFeed({ q, drivers, limit = 20 }: { q: QualiState; drivers: Map<number, ReplayDriver>; limit?: number }) {
  const items = q.improvements.slice(0, limit);
  if (!items.length) return <EmptyState>No lap times yet at this point.</EmptyState>;
  return (
    <ol className="space-y-2 text-xs">
      {items.map((i) => (
        <li key={`${i.t}-${i.driver}`} className="space-y-0.5 motion-safe:animate-slide-in">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-mono tabular-nums">{fmtClock(i.t)}</span>
            <Badge variant="outline" className="h-4 px-1 text-[10px]">
              {q.segments[i.phase - 1]?.label}
            </Badge>
          </div>
          <p>
            <span className="font-mono font-medium">{acronym(drivers, i.driver)}</span> <span className="font-mono tabular-nums">{fmtLap(i.time)}</span>{" "}
            {i.from === null ? (
              <>first time, P{i.to}</>
            ) : i.from === i.to ? (
              <>improves, holds P{i.to}</>
            ) : (
              <>
                P{i.from} to P{i.to} <span className="text-gain">▲{i.from - i.to}</span>
              </>
            )}
          </p>
          {i.knocked.length > 0 && <p className="text-loss">Pushes {i.knocked.map((n) => acronym(drivers, n)).join(", ")} into the drop zone</p>}
        </li>
      ))}
    </ol>
  );
}

/** Cars on a push lap now: each sector as it's set, against P1's and the last safe car's best laps. */
export function OnLapNow({ q, drivers, selected, onSelect }: { q: QualiState; drivers: Map<number, ReplayDriver>; selected: number | null; onSelect: (n: number | null) => void }) {
  if (!q.onLap.length) return <EmptyState>No car on a push lap at this point.</EmptyState>;
  const vs = (v: number | null, what: string) =>
    v === null ? null : (
      <span className={cn("font-mono tabular-nums", v <= 0 ? "text-gain" : "text-loss")}>
        {fmtDelta(v)} <span className="font-sans text-muted-foreground">{what}</span>
      </span>
    );
  return (
    <ol className="space-y-2 text-xs">
      {q.onLap.map((o) => {
        const sel = o.driver === selected;
        return (
          <li key={o.driver} className={cn("flex flex-wrap items-baseline gap-x-3 gap-y-0.5", sel && "bg-muted/60")}>
            <button type="button" aria-pressed={sel} onClick={() => onSelect(sel ? null : o.driver)} className="w-9 text-left font-mono font-medium hover:text-live hover:underline aria-pressed:text-live">
              {acronym(drivers, o.driver)}
            </button>
            <span className="font-mono text-muted-foreground tabular-nums">
              {o.sectors.length ? o.sectors.map((s, k) => `S${k + 1} ${s.toFixed(3)}`).join("  ") : "Starting the lap"}
            </span>
            {vs(o.toP1, "to P1")}
            {vs(o.toCutoff, "to the cutoff")}
            {o.wouldBe !== null && <span className="font-medium">On for P{o.wouldBe}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** Each car's tyre sets so far, new or used, in qualifying order; the set it's on now is outlined. */
export function TyreSets({
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
  const shown = rows.map((r) => ({ r, sets: (stints[r.driver] ?? []).filter((s) => r.lap !== null && s.lapStart <= r.lap) }));
  if (!shown.some((s) => s.sets.length)) return <EmptyState>Tyre sets appear once cars are on track.</EmptyState>;
  return (
    <ol className="space-y-1 text-xs">
      {shown.map(({ r, sets }) => {
        const sel = r.driver === selected;
        return (
          <li key={r.driver} className={cn("flex items-center gap-2", sel && "bg-muted/60")}>
            <span className="w-6 text-right font-mono text-muted-foreground tabular-nums">{r.position ?? "—"}</span>
            <button type="button" aria-pressed={sel} onClick={() => onSelect(sel ? null : r.driver)} className="w-9 text-left font-mono font-medium hover:text-live hover:underline aria-pressed:text-live">
              {acronym(drivers, r.driver)}
            </button>
            <ol className="flex flex-wrap gap-1" aria-label={`${acronym(drivers, r.driver)}: ${sets.length} set${sets.length === 1 ? "" : "s"}`}>
              {sets.map((s, k) => {
                const fresh = s.ageAtStart === 0;
                const now = k === sets.length - 1;
                return (
                  <li
                    key={s.stint}
                    title={`${s.compound ?? "Unknown"}, ${fresh ? "new" : s.ageAtStart === null ? "age unknown" : `used (${s.ageAtStart} laps)`}${now ? ", on now" : ""}`}
                    className={cn("inline-flex h-5 items-center gap-0.5 border px-1 font-mono text-[10px]", now ? "border-foreground" : "border-transparent")}
                  >
                    <Tyre compound={s.compound} age={null} />
                    <span className="text-muted-foreground">{fresh ? "new" : "used"}</span>
                  </li>
                );
              })}
            </ol>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The qualifying dashboard's panels, shared by Live and Replay. `rows`: the timing rows in qualifying order (qualiTiming).
 * Panels that work the same as in a race come in ready-made.
 */
export function qualifyingPanels(p: {
  q: QualiState;
  rows: TimingRow[];
  drivers: Map<number, ReplayDriver>;
  stints: Record<number, ReplayStint[]>;
  selected: number | null;
  onSelect: (n: number | null) => void;
  status: TrackStatus;
  freshness: ReactNode;
  /** Live: the clock ticks on from this instant (the data's observation time). */
  clockSince?: number;
  caption: string;
  track: { description: ReactNode; content: ReactNode };
  comparison: ReactNode;
  penalties: ReactNode;
  raceControl: ReactNode;
  radio: ReactNode;
  weather: ReactNode;
}): PanelDef[] {
  const { q, rows, drivers, selected, onSelect } = p;
  const segment = q.current ? { label: q.current.label, timeLeft: q.timeLeft, running: q.clockRunning, since: p.clockSince } : undefined;
  return [
    {
      id: "status",
      title: "Session",
      layout: { x: 0, y: 0, w: 12, h: 3, minW: 4, minH: 3 },
      content: <SessionStatus status={p.status} rows={rows} drivers={drivers} freshness={p.freshness} segment={segment} />,
    },
    { id: "track", title: "Track", description: p.track.description, layout: { x: 0, y: 3, w: 6, h: 14, minW: 4, minH: 8 }, content: p.track.content },
    {
      id: "timing",
      title: "Timing",
      description: `Best lap in each segment, from the recorded laps, without deleted times. ${q.knockout} car${q.knockout === 1 ? "" : "s"} go${q.knockout === 1 ? "es" : ""} out in each of the first two segments.`,
      layout: { x: 6, y: 3, w: 6, h: 20, minW: 3, minH: 6 },
      content: <QualifyingTower q={q} timing={rows} drivers={drivers} selected={selected} onSelect={onSelect} caption={p.caption} />,
    },
    {
      id: "on-lap",
      title: "On a lap now",
      description: "Push laps under way, against P1 and the last safe place over the same sectors.",
      layout: { x: 0, y: 17, w: 6, h: 6, minW: 3, minH: 3 },
      content: <OnLapNow q={q} drivers={drivers} selected={selected} onSelect={onSelect} />,
    },
    {
      id: "improvements",
      title: "Improvements",
      layout: { x: 0, y: 23, w: 3, h: 9, minW: 3, minH: 4 },
      content: <ImprovementsFeed q={q} drivers={drivers} />,
    },
    {
      id: "focus",
      title: "Driver focus",
      phoneAfter: "timing",
      layout: { x: 3, y: 23, w: 3, h: 9, minW: 3, minH: 4 },
      content: <DriverFocus rows={rows} drivers={drivers} selected={selected} intervals={false} />,
    },
    {
      id: "tyres",
      title: "Tyre sets",
      description: "Sets used so far, new or used when fitted. The outlined set is the one on now.",
      layout: { x: 6, y: 23, w: 6, h: 9, minW: 3, minH: 4 },
      content: <TyreSets rows={rows} drivers={drivers} stints={p.stints} selected={selected} onSelect={onSelect} />,
    },
    { id: "comparison", title: "Driver comparison", layout: { x: 0, y: 32, w: 7, h: 16, minW: 4, minH: 6 }, content: p.comparison },
    {
      id: "penalties",
      title: "Penalties",
      description: "Penalties, investigations, deleted laps and warnings so far.",
      layout: { x: 7, y: 32, w: 5, h: 8, minW: 3, minH: 4 },
      content: p.penalties,
    },
    { id: "race-control", title: "Race control", layout: { x: 7, y: 40, w: 5, h: 8, minW: 3, minH: 3 }, content: p.raceControl },
    {
      id: "radio",
      title: "Team radio",
      description: "Clips as F1 publishes them: a selection only, and none for many sessions.",
      layout: { x: 0, y: 48, w: 7, h: 6, minW: 3, minH: 3 },
      content: p.radio,
    },
    { id: "weather", title: "Track weather", layout: { x: 7, y: 48, w: 5, h: 5, minW: 3, minH: 3 }, content: p.weather },
  ];
}
