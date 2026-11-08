"use client";

import type { ReplayDriver, SessionReplay } from "@pitwall/shared";
import { ChevronUpIcon, PauseIcon, PlayIcon, RadioIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { EmptyState } from "@/components/data/query-state";
import { TeamEmblem } from "@/components/racing/team-mark";
import { fmtClock } from "@/lib/format";
import { cn } from "@/lib/utils";

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
                  className="inline-flex size-6 shrink-0 items-center justify-center border pointer-coarse:size-11 hover:border-live hover:text-live aria-pressed:border-live aria-pressed:text-live"
                >
                  {on ? <PauseIcon aria-hidden className="size-3" /> : <PlayIcon aria-hidden className="size-3" />}
                </button>
                <TeamEmblem id={d?.teamId} colour={d?.colour ?? null} className="mr-0" />
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

const OPEN_KEY = "pitwall.radio-open.v1";
const openListeners = new Set<() => void>();
let openSaved: boolean | null = null;
function readOpen() {
  if (openSaved !== null) return openSaved;
  try {
    openSaved = localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    // storage blocked: collapsed
  }
  return (openSaved ??= false);
}
function setOpen(on: boolean) {
  openSaved = on;
  try {
    localStorage.setItem(OPEN_KEY, on ? "1" : "0");
  } catch {
    // per-viewer convenience only
  }
  for (const l of openListeners) l();
}

/**
 * Team radio folded under a header, for the 3D stage: collapsed until opened (remembered in this browser); a cued clip opens it.
 * The list is hidden, not unmounted, so a clip keeps playing while it's collapsed.
 */
export function TeamRadioDrawer(props: Parameters<typeof TeamRadio>[0]) {
  const open = useSyncExternalStore((cb) => (openListeners.add(cb), () => openListeners.delete(cb)), readOpen, () => false);
  const id = useId();
  const cued = useRef(props.cue?.at);
  useEffect(() => {
    if (!props.cue || props.cue.at === cued.current) return;
    cued.current = props.cue.at;
    setOpen(true);
  });
  const count = props.clips.filter((c) => c.t <= props.t).length;
  return (
    <section className="text-xs not-last:mb-2 not-last:border-b not-last:pb-2">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 font-medium hover:text-live pointer-coarse:min-h-11">
        <RadioIcon aria-hidden className="size-3.5" />
        Team radio
        <span className="font-normal text-muted-foreground">{count === 1 ? "1 clip" : `${count} clips`}</span>
        <ChevronUpIcon aria-hidden className={cn("ml-auto size-3.5 transition-transform motion-reduce:transition-none", open && "rotate-180")} />
      </button>
      <div id={id} hidden={!open} className="mt-2 max-h-40 overflow-y-auto">
        <TeamRadio {...props} />
      </div>
    </section>
  );
}
