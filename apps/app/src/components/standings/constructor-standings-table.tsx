"use client";

import type { ConstructorStanding, PointsProgression, SeasonResults, Standings } from "@pitwall/shared";
import Link from "next/link";
import { useMemo } from "react";
import { EmptyState } from "@/components/data/query-state";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPoints } from "@/lib/format";
import { lastTwo, PositionChange } from "./position-change";

export function ConstructorStandingsTable({
  standings,
  results,
  progression,
  limit,
}: {
  standings: Standings<ConstructorStanding>;
  results?: SeasonResults;
  progression?: PointsProgression;
  limit?: number;
}) {
  // Drivers who actually raced for each constructor this season, most starts first.
  const drivers = useMemo(() => {
    const counts = new Map<string, Map<string, { name: string; id: string; n: number }>>();
    for (const race of results?.races ?? []) {
      for (const r of race.results) {
        const team = counts.get(r.constructor.id) ?? new Map();
        const d = team.get(r.driver.id) ?? { name: r.driver.familyName, id: r.driver.id, n: 0 };
        d.n++;
        team.set(r.driver.id, d);
        counts.set(r.constructor.id, team);
      }
    }
    return new Map([...counts].map(([id, m]) => [id, [...m.values()].sort((a, b) => b.n - a.n)]));
  }, [results]);
  const changes = useMemo(() => {
    const last = progression?.rounds.at(-1)?.round;
    if (!progression || last !== standings.round) return new Map<string, ReturnType<typeof lastTwo>>();
    return new Map(progression.constructors.map((c) => [c.constructor.id, lastTwo(c.positions)]));
  }, [progression, standings.round]);

  if (!standings.entries.length) {
    return (
      <EmptyState>
        No constructors&apos; championship standings for {standings.season}
        {standings.season < 1958 ? " — the constructors' championship began in 1958." : " yet."}
      </EmptyState>
    );
  }
  const leader = standings.entries[0]!.points;
  const rows = limit ? standings.entries.slice(0, limit) : standings.entries;
  const compact = limit !== undefined;

  return (
    <Table>
      <TableCaption className="sr-only">
        {standings.season} constructors&apos; championship after round {standings.round}
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead className="w-14">Pos</TableHead>
          <TableHead>Constructor</TableHead>
          {!compact && <TableHead className="hidden md:table-cell">Drivers</TableHead>}
          <TableHead className="text-right">Pts</TableHead>
          {!compact && <TableHead className="hidden text-right sm:table-cell">Gap</TableHead>}
          {!compact && <TableHead className="hidden text-right sm:table-cell">Wins</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((e) => {
          const change = changes.get(e.constructor.id);
          return (
            <TableRow key={e.constructor.id}>
              <TableCell className="font-mono tabular-nums">
                <span className="inline-flex w-full items-center justify-between gap-1">
                  {e.positionText}
                  {change && <PositionChange {...change} />}
                </span>
              </TableCell>
              <TableCell>
                <Link href={`/team?id=${e.constructor.id}&season=${standings.season}`} className="font-medium hover:underline">
                  {e.constructor.name}
                </Link>
              </TableCell>
              {!compact && (
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {(drivers.get(e.constructor.id) ?? []).map((d, i) => (
                    <span key={d.id}>
                      {i > 0 && ", "}
                      <Link href={`/driver?id=${d.id}&season=${standings.season}`} className="hover:text-foreground hover:underline">{d.name}</Link>
                    </span>
                  ))}
                </TableCell>
              )}
              <TableCell className="text-right font-mono font-medium tabular-nums">{formatPoints(e.points)}</TableCell>
              {!compact && (
                <TableCell className="hidden text-right font-mono text-muted-foreground tabular-nums sm:table-cell">
                  {e.points === leader ? "—" : `−${formatPoints(leader - e.points)}`}
                </TableCell>
              )}
              {!compact && <TableCell className="hidden text-right font-mono tabular-nums sm:table-cell">{e.wins}</TableCell>}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
