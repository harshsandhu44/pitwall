"use client";

import type { DriverStanding, PointsProgression, SeasonResults, Standings } from "@pitwall/shared";
import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { driverName, formatPoints } from "@/lib/format";
import { EmptyState } from "@/components/data/query-state";
import { lastTwo, PositionChange } from "./position-change";
import { RecentResults } from "./recent-results";
import { type Sort, SortHeader, sortBy } from "./sort-header";
import { TeamMark } from "@/components/racing/team-mark";
import { Arrive, CountUp } from "@/lib/motion";

type Key = "position" | "driver" | "number" | "team" | "points" | "wins";

export function DriverStandingsTable({
  standings,
  results,
  progression,
  limit,
}: {
  standings: Standings<DriverStanding>;
  results?: SeasonResults;
  progression?: PointsProgression;
  /** Compact mode: top N, no search/sort. */
  limit?: number;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort<Key>>({ key: "position", dir: "asc" });
  const leader = standings.entries[0]?.points ?? 0;
  const changes = useMemo(() => {
    // Only trust the progression when it ends at the same round as these standings.
    const last = progression?.rounds.at(-1)?.round;
    if (!progression || last !== standings.round) return new Map<string, ReturnType<typeof lastTwo>>();
    return new Map(progression.drivers.map((d) => [d.driver.id, lastTwo(d.positions)]));
  }, [progression, standings.round]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? standings.entries.filter((e) =>
          [driverName(e.driver), e.driver.code ?? "", ...e.constructors.map((c) => c.name)].some((s) => s.toLowerCase().includes(q)),
        )
      : standings.entries;
    const sorted = sortBy(filtered, sort, (e, k) => {
      switch (k) {
        case "position": return e.position;
        case "driver": return e.driver.familyName;
        case "number": return e.driver.number;
        case "team": return e.constructors.at(-1)?.name ?? null;
        case "points": return e.points;
        case "wins": return e.wins;
      }
    });
    return limit ? sorted.slice(0, limit) : sorted;
  }, [standings.entries, query, sort, limit]);

  if (!standings.entries.length) return <EmptyState>No driver standings yet for {standings.season}.</EmptyState>;
  const compact = limit !== undefined;

  return (
    <Arrive className="space-y-3">
      {!compact && (
        <div className="relative max-w-xs">
          <SearchIcon aria-hidden className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search driver or team"
            aria-label="Search drivers"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-7"
          />
        </div>
      )}
      <Table>
        <TableCaption className="sr-only">
          {standings.season} drivers&apos; championship after round {standings.round}
        </TableCaption>
        <TableHeader>
          <TableRow>
            {compact ? (
              <>
                <TableHead className="w-10">Pos</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead className="text-right">Pts</TableHead>
              </>
            ) : (
              <>
                <SortHeader sortKey="position" sort={sort} onSort={setSort} className="w-14">Pos</SortHeader>
                <SortHeader sortKey="driver" sort={sort} onSort={setSort}>Driver</SortHeader>
                <SortHeader sortKey="number" sort={sort} onSort={setSort} className="hidden md:table-cell">No.</SortHeader>
                <SortHeader sortKey="team" sort={sort} onSort={setSort} className="hidden sm:table-cell">Constructor</SortHeader>
                <SortHeader sortKey="points" sort={sort} onSort={setSort} className="text-right">Pts</SortHeader>
                <TableHead className="hidden text-right sm:table-cell">Gap</TableHead>
                <SortHeader sortKey="wins" sort={sort} onSort={setSort} className="hidden text-right md:table-cell">Wins</SortHeader>
                {results && <TableHead className="hidden lg:table-cell">Last 5</TableHead>}
              </>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((e) => {
            const change = changes.get(e.driver.id);
            return (
              <TableRow key={e.driver.id} data-rise>
                <TableCell className="font-mono tabular-nums">
                  <span className="inline-flex w-full items-center justify-between gap-1">
                    {e.positionText}
                    {change && <PositionChange {...change} />}
                  </span>
                </TableCell>
                <TableCell>
                  <Link href={`/driver?id=${e.driver.id}&season=${standings.season}`} className="hover:underline">
                    <span className="font-medium">{driverName(e.driver)}</span>
                  </Link>
                  {e.driver.code && <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">{e.driver.code}</span>}
                  <span className="block text-xs text-muted-foreground sm:hidden">{e.constructors.map((c) => c.name).join(" / ")}</span>
                </TableCell>
                {!compact && (
                  <>
                    <TableCell className="hidden font-mono tabular-nums md:table-cell">{e.driver.number ?? "—"}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {e.constructors.map((c, i) => (
                        <span key={c.id}>
                          {i > 0 && " / "}
                          <TeamMark id={c.id} season={standings.season} />
                          <Link href={`/team?id=${c.id}&season=${standings.season}`} className="hover:underline">{c.name}</Link>
                        </span>
                      ))}
                    </TableCell>
                  </>
                )}
                <TableCell className="text-right font-mono font-medium tabular-nums">
                  <CountUp value={e.points} format={formatPoints} />
                  {/* Phones drop the Gap column; how far behind still matters. */}
                  {!compact && e.points !== leader && (
                    <span className="block text-xs font-normal text-muted-foreground sm:hidden">−{formatPoints(leader - e.points)}</span>
                  )}
                </TableCell>
                {!compact && (
                  <>
                    <TableCell className="hidden text-right font-mono text-muted-foreground tabular-nums sm:table-cell">
                      {e.points === leader ? "—" : `−${formatPoints(leader - e.points)}`}
                    </TableCell>
                    <TableCell className="hidden text-right font-mono tabular-nums md:table-cell">{e.wins}</TableCell>
                    {results && (
                      <TableCell className="hidden lg:table-cell">
                        <RecentResults results={results} driverId={e.driver.id} />
                      </TableCell>
                    )}
                  </>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {!compact && !rows.length && <EmptyState>No drivers match “{query}”.</EmptyState>}
    </Arrive>
  );
}
