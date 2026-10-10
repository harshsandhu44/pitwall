"use client";

import { LoaderCircleIcon, PauseIcon, PlayIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { fmtClock, fmtElapsed } from "@/lib/format";
import { type ClockState, SPEEDS, type Speed } from "@/lib/replay-clock";

export function PlaybackControls({
  state,
  range,
  onPlay,
  onPause,
  onSeek,
  onSpeed,
}: {
  state: ClockState;
  range: { start: number; end: number };
  onPlay: () => void;
  onPause: () => void;
  onSeek: (t: number) => void;
  onSpeed: (s: Speed) => void;
}) {
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
    </div>
  );
}
