"use client";

import { type GrandPrix, scheduleState, SESSION_LABEL } from "@pitwall/shared";
import { Badge } from "@/components/ui/badge";
import { formatSessionTime } from "@/lib/format";
import { useNow } from "@/lib/hooks";

/** Session list in the viewer's time zone, with circuit-local time when the zone is known. */
export function SessionSchedule({ race }: { race: GrandPrix }) {
  const now = useNow();
  const tz = race.circuit.timezone;
  return (
    <table className="w-full text-xs">
      <caption className="sr-only">Session schedule for {race.name}</caption>
      <thead className="text-muted-foreground">
        <tr className="[&>th]:pb-1 [&>th]:text-left [&>th]:font-normal">
          <th scope="col">Session</th>
          <th scope="col">Your time</th>
          {tz && <th scope="col" className="hidden sm:table-cell">Track time</th>}
          <th scope="col" className="sr-only">Status</th>
        </tr>
      </thead>
      <tbody>
        {race.sessions.map((s) => {
          const state = now === null ? "unknown" : scheduleState(s, now);
          return (
            <tr key={s.kind} className="border-t [&>td]:py-1.5">
              <td className="font-medium">{SESSION_LABEL[s.kind]}</td>
              <td className="font-mono tabular-nums">{now === null ? "…" : formatSessionTime(s)}</td>
              {tz && <td className="hidden font-mono text-muted-foreground tabular-nums sm:table-cell">{s.start ? formatSessionTime(s, tz) : "—"}</td>}
              <td className="text-right">
                {state === "finished" && <Badge variant="secondary">Done</Badge>}
                {state === "in_window" && <Badge>Scheduled now</Badge>}
                {!s.start && <span className="text-muted-foreground">time not published</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
