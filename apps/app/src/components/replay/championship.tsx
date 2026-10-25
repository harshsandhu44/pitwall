"use client";

import { type ChampionshipBase, type ProjectedEntry, projectStandings, type ReplayDriver, type TimingRow } from "@pitwall/shared";
import { QueryState } from "@/components/data/query-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApi } from "@/lib/api";
import { cn } from "@/lib/utils";

function Moved({ n }: { n: number }) {
  if (!n) return <span className="text-muted-foreground">–</span>;
  return (
    <span className={n > 0 ? "text-gain" : "text-loss"}>
      <span aria-hidden>{n > 0 ? "▲" : "▼"}</span>
      {Math.abs(n)}
      <span className="sr-only">{n > 0 ? " places up" : " places down"}</span>
    </span>
  );
}

function Table<K extends string | number>({ entries, name, colour, live }: { entries: ProjectedEntry<K>[]; name: (k: K) => string; colour: (k: K) => string | null; live: boolean }) {
  return (
    <table className="w-full text-xs">
      <thead className="text-muted-foreground">
        <tr className="text-left">
          <th className="w-6 font-normal">Pos</th>
          {live && <th className="w-8 font-normal"><abbr title="Places moved since the start of the session">+/−</abbr></th>}
          <th className="font-normal">Name</th>
          <th className="text-right font-normal">Pts</th>
          {live && <th className="w-10 text-right font-normal"><abbr title="Points this session would add if it finished now">+</abbr></th>}
        </tr>
      </thead>
      <tbody className="font-mono tabular-nums">
        {entries.map((e) => (
          <tr key={e.key} className="h-6">
            <td className={cn(e.position === 1 && "font-bold text-live")}>{e.position}</td>
            {live && (
              <td>
                <Moved n={e.moved} />
              </td>
            )}
            <td className="font-sans">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-3 w-1 rounded-full bg-muted-foreground/40" style={{ backgroundColor: colour(e.key) ?? undefined }} />
                {name(e.key)}
              </span>
            </td>
            <td className="text-right font-semibold">{e.points}</td>
            {live && <td className="text-right text-muted-foreground">{e.added ? `+${e.added}` : ""}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The championships as they would stand if the session finished in the current running order (races and
 * sprints); for other sessions, the standings before it. Points before the session come from OpenF1.
 */
export function Championship({
  season,
  sessionKey,
  projected,
  sprint,
  rows,
  drivers,
}: {
  season: number;
  sessionKey: number;
  /** Races and sprints: add points for the running order. */
  projected: boolean;
  sprint: boolean;
  rows: TimingRow[];
  drivers: ReplayDriver[];
}) {
  const base = useApi<ChampionshipBase>(`/api/championship/before?season=${season}&session=${sessionKey}`);
  const byNumber = new Map(drivers.map((d) => [d.number, d]));
  return (
    <QueryState query={base} loading={<Skeleton className="h-48 w-full" />}>
      {(b) => {
        const p = projectStandings(b, projected ? rows : [], drivers, sprint, season);
        const teamColour = (team: string) => drivers.find((d) => d.team === team)?.colour ?? null;
        return (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {projected ? "As it stands: points before this session plus the current running order." : "Before this session."}
            </p>
            <Tabs defaultValue="drivers">
              <TabsList variant="line" className="mb-2">
                <TabsTrigger value="drivers">Drivers</TabsTrigger>
                <TabsTrigger value="teams">Teams</TabsTrigger>
              </TabsList>
              <TabsContent value="drivers">
                <Table
                  entries={p.drivers}
                  live={projected}
                  name={(n: number) => byNumber.get(n)?.acronym ?? String(n)}
                  colour={(n: number) => byNumber.get(n)?.colour ?? null}
                />
              </TabsContent>
              <TabsContent value="teams">
                <Table entries={p.teams} live={projected} name={(t: string) => t} colour={teamColour} />
              </TabsContent>
            </Tabs>
          </div>
        );
      }}
    </QueryState>
  );
}
