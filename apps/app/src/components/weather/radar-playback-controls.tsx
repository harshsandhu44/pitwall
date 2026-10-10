"use client";

import { PauseIcon, PlayIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatAge } from "@/lib/format";

export function RadarPlaybackControls({
  frames,
  index,
  playing,
  opacity,
  now,
  onIndex,
  onPlaying,
  onOpacity,
}: {
  frames: { time: string }[];
  index: number;
  playing: boolean;
  opacity: number;
  now: number | null;
  onIndex: (i: number) => void;
  onPlaying: (p: boolean) => void;
  onOpacity: (o: number) => void;
}) {
  const frame = frames[index];
  if (!frame) return <p className="text-xs text-muted-foreground">No radar frames available right now.</p>;
  const time = new Date(frame.time).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <Button size="icon-sm" variant="outline" aria-label={playing ? "Pause radar" : "Play radar"} aria-pressed={playing} onClick={() => onPlaying(!playing)}>
        {playing ? <PauseIcon aria-hidden /> : <PlayIcon aria-hidden />}
      </Button>
      <label className="flex min-w-48 flex-1 items-center gap-2">
        <span className="sr-only">Radar frame</span>
        <input
          type="range"
          min={0}
          max={frames.length - 1}
          step={1}
          value={index}
          onChange={(e) => {
            onPlaying(false);
            onIndex(Number(e.target.value));
          }}
          aria-valuetext={`Observed ${time}`}
          className="w-full accent-foreground"
        />
      </label>
      <p className="font-mono tabular-nums" aria-live={playing ? "off" : "polite"}>
        Observed {time}
        {now !== null && <span className="text-muted-foreground"> ({formatAge(frame.time, now)})</span>}
        {index === frames.length - 1 && <span className="text-muted-foreground"> · latest</span>}
      </p>
      <label className="flex items-center gap-2">
        <span className="text-muted-foreground">Opacity</span>
        <input
          type="range"
          min={0.2}
          max={1}
          step={0.1}
          value={opacity}
          onChange={(e) => onOpacity(Number(e.target.value))}
          className="w-20 accent-foreground"
        />
      </label>
    </div>
  );
}
