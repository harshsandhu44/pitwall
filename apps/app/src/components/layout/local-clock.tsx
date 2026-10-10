"use client";

import { useNow } from "@/lib/hooks";

export function LocalClock() {
  const now = useNow();
  if (now === null) return <span className="w-20" />;
  const d = new Date(now);
  return (
    <time
      dateTime={d.toISOString()}
      className="hidden font-mono text-xs text-muted-foreground tabular-nums sm:block"
      title={Intl.DateTimeFormat().resolvedOptions().timeZone}
    >
      {d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
    </time>
  );
}
