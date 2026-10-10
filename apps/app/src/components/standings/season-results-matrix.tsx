"use client";

import type { SeasonResults } from "@pitwall/shared";
import Link from "next/link";
import { useMemo } from "react";
import { EmptyState } from "@/components/data/query-state";
import { cn } from "@/lib/utils";

/** Drivers × rounds grid of finishing positions, ordered by the standings order passed in. */
export function SeasonResultsMatrix({ results, order }: { results: SeasonResults; order: string[] }) {
  const rows = useMemo(() => {
    const byDriver = new Map<string, { name: string; code: string | null; cells: Map<number, { text: string; pos: number | null; status: string }> }>();
    for (const race of results.races) {
      for (const r of race.results) {
        const row = byDriver.get(r.driver.id) ?? { name: r.driver.familyName, code: r.driver.code, cells: new Map() };
        row.cells.set(race.round, { text: r.positionText, pos: r.position, status: r.status });
        byDriver.set(r.driver.id, row);
      }
    }
    const rank = new Map(order.map((id, i) => [id, i]));
    return [...byDriver].sort(([a], [b]) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999));
  }, [results, order]);

  if (!results.races.length) return <EmptyState>No race results yet for {results.season}.</EmptyState>;

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-[11px]">
        <caption className="sr-only">Finishing position of each driver in every {results.season} race</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-background px-2 py-1.5 text-left font-medium">Driver</th>
            {results.races.map((r) => (
              <th key={r.round} scope="col" className="px-1 py-1.5 text-center font-mono font-normal text-muted-foreground" title={r.name}>
                <Link href={`/race?season=${results.season}&round=${r.round}`} className="hover:text-foreground">
                  <span className="sr-only">{r.name}, round </span>
                  {r.round}
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([id, row]) => (
            <tr key={id} className="border-t">
              <th scope="row" className="sticky left-0 z-10 bg-background px-2 py-1 text-left font-normal whitespace-nowrap">
                <Link href={`/driver?id=${id}&season=${results.season}`} className="hover:underline">
                  {row.code ?? row.name}
                </Link>
              </th>
              {results.races.map((r) => {
                const c = row.cells.get(r.round);
                const classified = c && /^\d+$/.test(c.text);
                return (
                  <td
                    key={r.round}
                    title={c ? `${r.name}: ${classified ? `P${c.text}` : c.status}` : `${r.name}: did not take part`}
                    className={cn(
                      "px-1 py-1 text-center font-mono tabular-nums",
                      classified && c.pos! === 1 && "bg-foreground font-semibold text-background",
                      classified && c.pos! > 1 && c.pos! <= 3 && "bg-foreground/70 text-background",
                      classified && c.pos! > 3 && c.pos! <= 10 && "bg-muted",
                      !classified && "text-muted-foreground",
                    )}
                  >
                    {c ? (classified ? c.text : c.text === "R" ? "Ret" : c.text) : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t px-2 py-1.5 text-[11px] text-muted-foreground">
        Shading: winner, podium, points (top 10 under current rules). Ret = retired; D = disqualified; W = withdrawn; N = not classified.
      </p>
    </div>
  );
}
