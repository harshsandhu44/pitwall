"use client";

import type { ReplayDriver, SessionReplay } from "@pitwall/shared";
import { PauseIcon, PlayIcon } from "lucide-react";
import { useRef, useState } from "react";
import { EmptyState } from "@/components/data/query-state";
import { fmtClock } from "@/lib/format";

/** Team-radio clips published up to `t`, newest first. One clip plays at a time; nothing plays by itself. */
export function TeamRadio({ clips, drivers, t }: { clips: SessionReplay["radio"]; drivers: Map<number, ReplayDriver>; t: number }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const shown = clips.filter((c) => c.t <= t).reverse();
  const toggle = (url: string) => {
    const a = audio.current!;
    if (playing === url) return a.pause();
    a.src = url;
    void a.play().catch(() => setPlaying(null));
  };
  return (
    <>
      {/* Changing the source fires pause before play, so the playing clip is whatever started last. */}
      <audio ref={audio} preload="none" onPlay={(e) => setPlaying(e.currentTarget.src)} onPause={() => setPlaying(null)} onEnded={() => setPlaying(null)} />
      {!clips.length ? (
        <EmptyState>No team radio published for this session.</EmptyState>
      ) : !shown.length ? (
        <EmptyState>No team radio yet at this point.</EmptyState>
      ) : (
        <ol className="space-y-1 text-xs">
          {shown.map((c) => {
            const d = drivers.get(c.driver);
            const name = d?.acronym ?? String(c.driver);
            const on = playing === c.url;
            return (
              <li key={`${c.t}-${c.driver}`} className="flex items-center gap-2">
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={`${on ? "Pause" : "Play"} ${name} team radio, ${fmtClock(c.t)}`}
                  onClick={() => toggle(c.url)}
                  className="inline-flex size-6 shrink-0 items-center justify-center border hover:border-live hover:text-live aria-pressed:border-live aria-pressed:text-live"
                >
                  {on ? <PauseIcon aria-hidden className="size-3" /> : <PlayIcon aria-hidden className="size-3" />}
                </button>
                <span aria-hidden className="h-2.5 w-1 rounded-full bg-muted-foreground/40" style={d?.colour ? { backgroundColor: d.colour } : undefined} />
                <span className="font-mono font-medium">{name}</span>
                <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{fmtClock(c.t)}</span>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
