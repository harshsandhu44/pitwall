"use client";

import { type NextSession, SESSION_LABEL } from "@pitwall/shared";
import { formatCountdown } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { Rolling } from "@/lib/motion";

export function RaceCountdown({ next, className = "text-3xl" }: { next: NextSession; /** Size of the countdown digits. */ className?: string }) {
  const now = useNow();
  const { session, state } = next;
  const label = SESSION_LABEL[session.kind];
  if (state === "in_window") {
    return (
      <p className="text-sm">
        <span className="font-medium">{label}</span> is in its scheduled window now.
      </p>
    );
  }
  if (!session.start || now === null) return <p className="text-sm text-muted-foreground">{label}</p>;
  const ms = Date.parse(session.start) - now;
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label} starts in</p>
      <p
        className={`font-mono font-semibold tracking-tight tabular-nums ${className}`}
        // Announce once per minute at most, not every second.
        aria-label={`${label} starts in ${formatCountdown(ms - (ms % 60_000))}`}
      >
        <Rolling text={formatCountdown(ms)} />
      </p>
    </div>
  );
}
