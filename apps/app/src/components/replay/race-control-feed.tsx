import type { SessionReplay } from "@pitwall/shared";
import { EmptyState } from "@/components/data/query-state";
import { Badge } from "@/components/ui/badge";
import { fmtClock } from "@/lib/format";

/** Race-control messages issued up to the replay position, newest first. */
export function RaceControlFeed({ messages, t, limit = 8 }: { messages: SessionReplay["raceControl"]; t: number; limit?: number }) {
  const shown = messages.filter((m) => m.t <= t).slice(-limit).reverse();
  if (!shown.length) return <EmptyState>No race-control messages yet at this point.</EmptyState>;
  return (
    <ol className="space-y-2 text-xs">
      {shown.map((m) => (
        <li key={`${m.t}-${m.message}`} className="space-y-0.5 motion-safe:animate-slide-in">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-mono tabular-nums">{fmtClock(m.t)}</span>
            {m.lap !== null && <span>Lap {m.lap}</span>}
            {m.flag && <Badge variant="outline" className="h-4 px-1 text-[10px]">{m.flag}</Badge>}
          </div>
          <p>{m.message}</p>
        </li>
      ))}
    </ol>
  );
}
