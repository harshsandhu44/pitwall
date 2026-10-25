import type { CSSProperties } from "react";

/**
 * Five start lights come on, go out, and the broadcast wipe reveals the app. Pure CSS (globals.css), in the
 * static HTML, so it covers the page before any JS and ends on its own even if the JS never runs.
 */
export function Preloader() {
  return (
    <div aria-hidden className="wipe preloader inset-y-0 z-50">
      <div className="ml-[12vw] flex h-full w-screen flex-col items-center justify-center gap-8">
        <p className="flex items-center gap-1.5 font-display text-xl font-black tracking-tight uppercase">
          <span className="h-5 w-2 bg-live" />
          Pitwall
        </p>
        <div className="flex gap-2 sm:gap-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex flex-col gap-2 border bg-card p-2" style={{ "--i": i } as CSSProperties}>
              <span className="lamp size-7 rounded-full sm:size-10" />
              <span className="lamp size-7 rounded-full sm:size-10" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
