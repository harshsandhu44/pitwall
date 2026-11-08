"use client";

import { qualifyingContext, type SessionReplay, stewardsAt } from "@pitwall/shared";
import { FlagIcon, LoaderCircleIcon, PauseIcon, PlayIcon } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fmtClock, fmtElapsed } from "@/lib/format";
import { type ClockState, SPEEDS, type Speed } from "@/lib/replay-clock";
import { cn } from "@/lib/utils";

export type MarkerGroup = "flags" | "sc" | "yellow" | "penalty" | "radio" | "laps";
export interface Marker {
  t: number;
  kind: "green" | "red" | "chequered" | "sc" | "vsc" | "sc-end" | "yellow" | "penalty" | "radio" | "lap" | "segment";
  group: MarkerGroup;
  label: string;
  /** Team radio: the clip. */
  url?: string;
}

const GROUPS: { id: MarkerGroup; label: string }[] = [
  { id: "flags", label: "Start, red and chequered flags" },
  { id: "sc", label: "Safety car" },
  { id: "yellow", label: "Yellow flags" },
  { id: "penalty", label: "Penalties" },
  { id: "radio", label: "Team radio" },
  { id: "laps", label: "Laps" },
];

// Dots: flag colours for the flags (safety cars count as yellow), the theme's foreground for the rest, laps faint.
const MARK: Record<Marker["kind"], string> = {
  green: "bg-gain",
  red: "bg-live",
  yellow: "bg-yellow-400",
  sc: "bg-yellow-400",
  vsc: "bg-yellow-400",
  "sc-end": "bg-yellow-400",
  chequered: "bg-foreground",
  penalty: "bg-foreground",
  radio: "bg-foreground",
  lap: "bg-foreground/40",
  segment: "bg-foreground/40",
};

/**
 * What happened in the session, for the timeline: starts and restarts, red and chequered flags, safety cars coming and going,
 * yellow flags (those close together as one), penalties, team radio, and every fifth lap of the leader (qualifying: each segment's start).
 */
export function replayMarkers(r: SessionReplay): Marker[] {
  const out: Marker[] = [];
  const quali = r.session.type === "Qualifying";
  const segments = quali ? qualifyingContext(r.raceControl, r.session.name).segments : [];
  let started = false;
  let yellow: { m: Marker; sectors: Set<string>; double: boolean; last: number } | null = null;
  for (const m of r.raceControl) {
    const lap = m.lap !== null ? `, lap ${m.lap}` : "";
    const add = (kind: Marker["kind"], group: MarkerGroup, label: string) => out.push({ t: m.t, kind, group, label: label + lap });
    if (m.category === "SessionStatus" && m.message === "SESSION STARTED") {
      // A qualifying segment's start has its own marker.
      if (!segments.some((s) => s.start === m.t)) add("green", "flags", started ? "Restart" : "Start");
      started = true;
    } else if (m.category === "Flag" && m.message === "TRACK CLEAR") add("green", "flags", "Track clear");
    else if (m.category === "Flag" && m.flag === "RED") add("red", "flags", "Red flag");
    else if (m.category === "Flag" && m.flag === "CHEQUERED") add("chequered", "flags", "Chequered flag");
    else if (m.category === "SafetyCar" && /^SAFETY CAR DEPLOYED/.test(m.message)) add("sc", "sc", "Safety car");
    else if (m.category === "SafetyCar" && /VIRTUAL SAFETY CAR DEPLOYED/.test(m.message)) add("vsc", "sc", "Virtual safety car");
    else if (m.category === "SafetyCar" && /SAFETY CAR IN THIS LAP/.test(m.message)) add("sc-end", "sc", "Safety car in this lap");
    else if (m.category === "SafetyCar" && /VIRTUAL SAFETY CAR ENDING/.test(m.message)) add("sc-end", "sc", "Virtual safety car ending");
    else if (m.category === "Flag" && (m.flag === "YELLOW" || m.flag === "DOUBLE YELLOW")) {
      const sector = /SECTOR (\d+)/.exec(m.message)?.[1];
      if (!yellow || m.t - yellow.last > 30_000) {
        yellow = { m: { t: m.t, kind: "yellow", group: "yellow", label: "" }, sectors: new Set(), double: false, last: m.t };
        out.push(yellow.m);
      }
      yellow.last = m.t;
      yellow.double ||= m.flag === "DOUBLE YELLOW";
      if (sector) yellow.sectors.add(sector);
      const ss = [...yellow.sectors].sort((a, b) => Number(a) - Number(b));
      yellow.m.label = `${yellow.double ? "Double yellow" : "Yellow flag"}${ss.length ? `, sector${ss.length > 1 ? "s" : ""} ${ss.join(", ")}` : ""}`;
    }
  }
  // Markers are navigation, so the whole session's penalties show, not just those published by the cursor.
  for (const p of stewardsAt(r.raceControl, Infinity)) if (p.kind === "penalty") out.push({ t: p.t, kind: "penalty", group: "penalty", label: `Penalty: ${p.text}` });
  for (const c of r.radio ?? []) out.push({ t: c.t, kind: "radio", group: "radio", label: `${r.drivers.find((d) => d.number === c.driver)?.acronym ?? c.driver} team radio`, url: c.url });
  if (quali) for (const s of segments) out.push({ t: s.start, kind: "segment", group: "laps", label: `${s.label} starts` });
  else {
    const starts = new Map<number, number>();
    for (const l of Object.values(r.laps).flat()) if (l.start !== null && l.start < (starts.get(l.lap) ?? Infinity)) starts.set(l.lap, l.start);
    for (const [lap, t] of starts) if (lap === 1 || lap % 5 === 0) out.push({ t, kind: "lap", group: "laps", label: `Lap ${lap}` });
  }
  return out.sort((a, b) => a.t - b.t);
}

// The groups shown, one saved set for every replay. Team radio starts off: some sessions have hundreds of clips.
const DOT = 10; // px: a dot and its gap
const TALL = 3; // dots in a stack; beyond that the last becomes "+N"

/**
 * Markers (sorted by t) grouped into stacks: one closer than a dot to a stack's first marker joins it. `at` maps a time
 * to 0–1 along the bar, clamped, so clips before the session pin to the start. `width` is the bar in px; 0 stacks nothing.
 */
export function stackMarkers<T extends { t: number }>(markers: T[], at: (t: number) => number, width: number) {
  const stacks: { x: number; items: T[] }[] = [];
  for (const m of markers) {
    const x = Math.min(1, Math.max(0, at(m.t)));
    const last = stacks.at(-1);
    if (last && width && (x - last.x) * width < DOT) last.items.push(m);
    else stacks.push({ x, items: [m] });
  }
  return stacks;
}

const KEY = "pitwall.markers.v1";
const DEFAULT = JSON.stringify(GROUPS.map((g) => g.id).filter((g) => g !== "radio"));
const listeners = new Set<() => void>();
let saved: string | null = null;
function read() {
  if (saved !== null) return saved;
  try {
    saved = localStorage.getItem(KEY);
  } catch {
    // storage blocked: defaults
  }
  return (saved ??= DEFAULT);
}
function useMarkerGroups() {
  const shown = new Set<MarkerGroup>(JSON.parse(useSyncExternalStore((cb) => (listeners.add(cb), () => listeners.delete(cb)), read, () => DEFAULT)));
  const toggle = (g: MarkerGroup, on: boolean) => {
    saved = JSON.stringify(GROUPS.map((x) => x.id).filter((x) => (x === g ? on : shown.has(x))));
    try {
      localStorage.setItem(KEY, saved);
    } catch {
      // per-viewer convenience only
    }
    for (const l of listeners) l();
  };
  return { shown, toggle };
}

export const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) && !(el instanceof HTMLInputElement && el.type === "range");

export function PlaybackControls({
  state,
  range,
  onPlay,
  onPause,
  onSeek,
  onSpeed,
  markers = [],
  onMarker,
}: {
  state: ClockState;
  range: { start: number; end: number };
  onPlay: () => void;
  onPause: () => void;
  onSeek: (t: number) => void;
  onSpeed: (s: Speed) => void;
  markers?: Marker[];
  /** After a marker click has sought to it, e.g. to play its radio clip. */
  onMarker?: (m: Marker) => void;
}) {
  const groups = useMarkerGroups();
  const present = GROUPS.filter((g) => markers.some((m) => m.group === g.id));
  const shown = markers.filter((m) => groups.shown.has(m.group));
  const [width, setWidth] = useState(0);
  // The range thumb is inset about 8 px at each end; the ticks follow it.
  const measure = (el: HTMLOListElement | null) => {
    if (!el) return;
    const resize = new ResizeObserver(() => setWidth(el.clientWidth - 16));
    resize.observe(el);
    return () => resize.disconnect();
  };
  // Space plays or pauses, the arrows seek 10 s (Shift: 1 min), [ and ] change speed. Not while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || (e.target as HTMLElement | null)?.closest?.("[role=menu],[role=listbox],[role=dialog]")) return;
      const seek = (ms: number) => onSeek(Math.min(range.end, Math.max(range.start, state.t + ms)));
      const speed = (by: number) => onSpeed(SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, SPEEDS.indexOf(state.speed) + by))]!);
      const run = { " ": () => (state.playing ? onPause() : onPlay()), ArrowLeft: () => seek(e.shiftKey ? -60_000 : -10_000), ArrowRight: () => seek(e.shiftKey ? 60_000 : 10_000), "[": () => speed(-1), "]": () => speed(1) }[e.key];
      if (!run) return;
      // The range input handles its own arrows, and a focused button its own Space.
      if (e.target instanceof HTMLInputElement && e.key.startsWith("Arrow")) return;
      if (e.key === " " && e.target instanceof HTMLElement && e.target.closest("button, a")) return;
      e.preventDefault();
      run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, range, onPlay, onPause, onSeek, onSpeed]);
  const frac = (t: number) => (t - range.start) / (range.end - range.start);
  const stacks = stackMarkers(shown, frac, width);
  const rows = Math.max(1, ...stacks.map((s) => Math.min(TALL, s.items.length)));
  const jump = (m: Marker) => {
    onSeek(m.t);
    onMarker?.(m);
  };
  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="icon-sm"
          variant="outline"
          aria-label={state.playing ? "Pause replay" : "Play replay"}
          aria-pressed={state.playing}
          onClick={state.playing ? onPause : onPlay}
        >
          {state.playing ? <PauseIcon aria-hidden /> : <PlayIcon aria-hidden />}
        </Button>
        <ToggleGroup
          value={[String(state.speed)]}
          onValueChange={(v: string[]) => v[0] && onSpeed(Number(v[0]) as Speed)}
          aria-label="Playback speed"
          variant="outline"
          size="sm"
        >
          {SPEEDS.map((s) => (
            <ToggleGroupItem key={s} value={String(s)} className="font-mono text-[11px]">
              {s}×
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {present.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
              <FlagIcon aria-hidden /> Events
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuGroup>
                <DropdownMenuLabel>On the timeline</DropdownMenuLabel>
                {present.map((g) => (
                  <DropdownMenuCheckboxItem key={g.id} checked={groups.shown.has(g.id)} onCheckedChange={(on) => groups.toggle(g.id, on)}>
                    {g.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <span className="font-mono tabular-nums">
          {fmtClock(state.t)} <span className="text-muted-foreground">(+{fmtElapsed(state.t - range.start)})</span>
        </span>
        <span aria-live="polite" className="inline-flex items-center gap-1 text-muted-foreground">
          {state.buffering && (
            <>
              <LoaderCircleIcon aria-hidden className="size-3 animate-spin" /> Loading recorded positions…
            </>
          )}
        </span>
      </div>
      <input
        type="range"
        min={range.start}
        max={range.end}
        step={1000}
        value={Math.round(state.t)}
        onChange={(e) => onSeek(Number(e.target.value))}
        aria-label="Replay position"
        aria-valuetext={`${fmtClock(state.t)}, ${fmtElapsed(state.t - range.start)} into the session`}
        className="w-full accent-foreground"
      />
      {shown.length > 0 && (
        <ol ref={measure} aria-label="Session events" className="relative -mt-1" style={{ height: rows * DOT + 2 }}>
          {stacks.flatMap((s, si) => {
            const left = `calc(0.5rem + (100% - 1rem) * ${s.x})`;
            const over = s.items.length > TALL;
            const dots = over ? s.items.slice(0, TALL - 1) : s.items;
            const rest = s.items.slice(TALL - 1);
            return [
              ...dots.map((m, row) => (
                <li key={`${m.kind}-${m.t}-${si}-${row}`} className="absolute" style={{ left, top: row * DOT + 2 }}>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          aria-label={`Jump to ${m.label}`}
                          onClick={() => jump(m)}
                          className={cn("block size-2 -translate-x-1/2 rounded-full hover:scale-150 focus-visible:outline-2 focus-visible:outline-ring", MARK[m.kind])}
                        />
                      }
                    />
                    <TooltipContent className="flex-col items-start gap-0.5">
                      <span className="font-medium">{m.label}</span>
                      <span className="font-mono tabular-nums opacity-70">
                        {fmtClock(m.t)} · {m.t < range.start ? "before the start" : `+${fmtElapsed(m.t - range.start)}`}
                      </span>
                      {m.url && <span className="opacity-70">Click to play</span>}
                    </TooltipContent>
                  </Tooltip>
                </li>
              )),
              over && (
                <li key={`more-${si}`} className="absolute" style={{ left, top: (TALL - 1) * DOT + 1 }}>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          aria-label={`${rest.length} more events. Jump to ${rest[0]!.label}`}
                          onClick={() => jump(rest[0]!)}
                          className="block -translate-x-1/2 rounded-full bg-muted px-1 font-mono text-[9px] leading-[10px] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          +{rest.length}
                        </button>
                      }
                    />
                    <TooltipContent className="flex-col items-start gap-0.5">
                      {rest.map((m, i) => (
                        <span key={i}>
                          {m.label} <span className="font-mono tabular-nums opacity-70">{fmtClock(m.t)}</span>
                        </span>
                      ))}
                      <span className="opacity-70">Click to jump to the first</span>
                    </TooltipContent>
                  </Tooltip>
                </li>
              ),
            ];
          })}
        </ol>
      )}
      <p className="hidden text-[11px] text-muted-foreground md:block">
        Keys: <Kbd>Space</Kbd> play/pause ·{" "}
        <KbdGroup>
          <Kbd>←</Kbd>
          <Kbd>→</Kbd>
        </KbdGroup>{" "}
        10 s (<Kbd>Shift</Kbd> 1 min) ·{" "}
        <KbdGroup>
          <Kbd>[</Kbd>
          <Kbd>]</Kbd>
        </KbdGroup>{" "}
        speed
      </p>
    </div>
  );
}
