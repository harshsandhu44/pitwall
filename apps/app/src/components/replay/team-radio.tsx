"use client";

import type { ReplayDriver, SessionReplay } from "@pitwall/shared";
import { PauseIcon, PlayIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/data/query-state";
import { fmtClock } from "@/lib/format";

const mss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * Team-radio clips published up to `t`, newest first. One clip plays at a time, with a seek bar on its row; nothing plays by itself.
 * `cue`: a clip to play now (a timeline marker was clicked); `at` changes on each click, so the same clip can play again.
 */
export function TeamRadio({
  clips,
  drivers,
  t,
  cue,
}: {
  clips: SessionReplay["radio"];
  drivers: Map<number, ReplayDriver>;
  t: number;
  cue?: { url: string; at: number };
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState({ at: 0, of: 0 });
  const shown = clips.filter((c) => c.t <= t).reverse();
  const play = (url: string) => {
    const a = audio.current!;
    if (url !== current) {
      a.src = url;
      setCurrent(url);
      setTime({ at: 0, of: 0 });
    }
    void a.play().catch(() => setPlaying(false));
  };
  const toggle = (url: string) => (url === current && playing ? audio.current!.pause() : play(url));
  const cued = useRef(cue?.at);
  useEffect(() => {
    if (!cue || cue.at === cued.current) return;
    cued.current = cue.at;
    play(cue.url);
  });
  const sync = (a: HTMLAudioElement) => setTime({ at: a.currentTime, of: Number.isFinite(a.duration) ? a.duration : 0 });
  return (
    <>
      <audio
        ref={audio}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => sync(e.currentTarget)}
        onLoadedMetadata={(e) => sync(e.currentTarget)}
      />
      {!clips.length ? (
        <EmptyState>No team radio published for this session.</EmptyState>
      ) : !shown.length ? (
        <EmptyState>No team radio yet at this point.</EmptyState>
      ) : (
        <ol className="space-y-1 text-xs">
          {shown.map((c) => {
            const d = drivers.get(c.driver);
            const name = d?.acronym ?? String(c.driver);
            const mine = current === c.url;
            const on = mine && playing;
            return (
              <li key={`${c.t}-${c.driver}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
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
                {mine && (
                  <span className="flex min-w-40 flex-1 items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={time.of || 1}
                      step={0.1}
                      value={time.at}
                      disabled={!time.of}
                      onChange={(e) => {
                        audio.current!.currentTime = Number(e.target.value);
                        sync(audio.current!);
                      }}
                      aria-label={`Seek in ${name} team radio`}
                      aria-valuetext={`${mss(time.at)} of ${mss(time.of)}`}
                      className="h-1 min-w-0 flex-1 accent-live"
                    />
                    <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                      {mss(time.at)} / {time.of ? mss(time.of) : "–:––"}
                    </span>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
