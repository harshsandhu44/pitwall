"use client";

import { type SessionReplay, stewardsAt } from "@pitwall/shared";
import { LoaderCircleIcon, PauseIcon, PlayIcon } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { fmtClock, fmtElapsed } from "@/lib/format";
import { type ClockState, SPEEDS, type Speed } from "@/lib/replay-clock";
import { cn } from "@/lib/utils";

export interface Marker {
  t: number;
  kind: "sc" | "vsc" | "red" | "penalty" | "lap";
  label: string;
}

const MARK: Record<Marker["kind"], string> = {
  sc: "h-3 w-1.5 bg-yellow-400",
  vsc: "h-3 w-1.5 bg-yellow-400/60",
  red: "h-3 w-1.5 bg-live",
  penalty: "h-2 w-1.5 rounded-full bg-foreground",
  lap: "h-1.5 w-px bg-muted-foreground/60",
};

/** Safety cars, red flags, penalties and every fifth lap of the leader, for the timeline. */
export function replayMarkers(r: SessionReplay): Marker[] {
  const out: Marker[] = [];
  for (const m of r.raceControl) {
    const lap = m.lap !== null ? `, lap ${m.lap}` : "";
    if (m.category === "SafetyCar" && /^SAFETY CAR DEPLOYED/.test(m.message)) out.push({ t: m.t, kind: "sc", label: `Safety car${lap}` });
    else if (m.category === "SafetyCar" && /VIRTUAL SAFETY CAR DEPLOYED/.test(m.message)) out.push({ t: m.t, kind: "vsc", label: `Virtual safety car${lap}` });
    else if (m.category === "Flag" && m.flag === "RED") out.push({ t: m.t, kind: "red", label: `Red flag${lap}` });
  }
  // Markers are navigation, so the whole session's penalties show, not just those published by the cursor.
  for (const p of stewardsAt(r.raceControl, Infinity)) if (p.kind === "penalty") out.push({ t: p.t, kind: "penalty", label: `Penalty: ${p.text}` });
  const starts = new Map<number, number>();
  for (const l of Object.values(r.laps).flat()) if (l.start !== null && l.start < (starts.get(l.lap) ?? Infinity)) starts.set(l.lap, l.start);
  for (const [lap, t] of starts) if (lap === 1 || lap % 5 === 0) out.push({ t, kind: "lap", label: `Lap ${lap}` });
  return out.sort((a, b) => a.t - b.t);
}

const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) && !(el instanceof HTMLInputElement && el.type === "range");

export function PlaybackControls({
  state,
  range,
  onPlay,
  onPause,
  onSeek,
  onSpeed,
  markers = [],
}: {
  state: ClockState;
  range: { start: number; end: number };
  onPlay: () => void;
  onPause: () => void;
  onSeek: (t: number) => void;
  onSpeed: (s: Speed) => void;
  markers?: Marker[];
}) {
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
      {markers.length > 0 && (
        <ol aria-label="Session events" className="relative -mt-1 h-3">
          {markers.map((m) => (
            // The range thumb is inset about 8 px at each end; the ticks follow it.
            <li key={`${m.kind}-${m.t}`} className="absolute top-0" style={{ left: `calc(0.5rem + (100% - 1rem) * ${frac(m.t)})` }}>
              <button
                type="button"
                title={`${m.label} (${fmtClock(m.t)})`}
                aria-label={`Jump to ${m.label}`}
                onClick={() => onSeek(m.t)}
                className={cn("block -translate-x-1/2 hover:scale-150 focus-visible:outline-2 focus-visible:outline-ring", MARK[m.kind])}
              />
            </li>
          ))}
        </ol>
      )}
      <p className="hidden text-[11px] text-muted-foreground md:block">
        Keys: <kbd className="font-mono">Space</kbd> play/pause · <kbd className="font-mono">←</kbd> <kbd className="font-mono">→</kbd> 10 s (Shift: 1 min) ·{" "}
        <kbd className="font-mono">[</kbd> <kbd className="font-mono">]</kbd> speed
      </p>
    </div>
  );
}
