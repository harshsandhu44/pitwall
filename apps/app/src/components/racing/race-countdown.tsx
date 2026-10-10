"use client";

import { type NextSession, SESSION_LABEL } from "@pitwall/shared";
import { formatCountdown } from "@/lib/format";
import { useNow } from "@/lib/hooks";

export function RaceCountdown({ next }: { next: NextSession }) {
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
        className="font-mono text-3xl font-semibold tracking-tight tabular-nums"
        // Announce once per minute at most, not every second.
        aria-label={`${label} starts in ${formatCountdown(ms - (ms % 60_000))}`}
      >
        {formatCountdown(ms)}
      </p>
    </div>
  );
}
