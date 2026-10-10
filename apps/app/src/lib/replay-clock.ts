"use client";

import { useEffect, useRef, useState } from "react";

export const SPEEDS = [1, 2, 5, 10] as const;
export type Speed = (typeof SPEEDS)[number];

export interface ClockState {
  t: number;
  playing: boolean;
  speed: Speed;
  /** Playing, but the recorded data for `t` isn't loaded yet, so time is held. */
  buffering: boolean;
}

const same = (a: ClockState, b: ClockState) => a.t === b.t && a.playing === b.playing && a.speed === b.speed && a.buffering === b.buffering;

/**
 * Replay clock in recorded session time. Advances on requestAnimationFrame by wall time × speed,
 * holds while `ready(t)` is false, and stops at the end. Animation reads `ref`; React state is
 * published at most four times a second.
 */
export function useReplayClock(range: { start: number; end: number }, ready: (t: number) => boolean) {
  const initial: ClockState = { t: range.start, playing: false, speed: 1, buffering: false };
  const ref = useRef<ClockState>(initial);
  const readyRef = useRef(ready);
  const [state, setState] = useState<ClockState>({ ...initial });

  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let published = 0;
    const tick = (now: number) => {
      const c = ref.current;
      c.buffering = c.playing && !readyRef.current(c.t);
      if (c.playing && !c.buffering) c.t = Math.min(range.end, c.t + (now - last) * c.speed);
      if (c.t >= range.end) c.playing = false;
      last = now;
      if (now - published >= 250) {
        published = now;
        setState((prev) => (same(prev, c) ? prev : { ...c }));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [range.end]);

  const update = (patch: Partial<ClockState>) => {
    Object.assign(ref.current, patch);
    setState({ ...ref.current });
  };
  return {
    ref,
    state,
    play: () => update({ playing: true, t: ref.current.t >= range.end ? range.start : ref.current.t }),
    pause: () => update({ playing: false, buffering: false }),
    seek: (t: number) => update({ t: Math.min(range.end, Math.max(range.start, t)) }),
    setSpeed: (speed: Speed) => update({ speed }),
  };
}
