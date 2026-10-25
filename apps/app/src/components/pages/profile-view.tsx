"use client";

import type { CareerSeason, ConstructorProfile, DriverProfile, SeasonResults } from "@pitwall/shared";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ErrorState, QueryState, SourceNote } from "@/components/data/query-state";
import { PageHeader } from "@/components/pages/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApi } from "@/lib/api";
import { driverName, formatPoints } from "@/lib/format";
import { useSeason } from "@/lib/hooks";

const ID = /^[a-z0-9_]{1,64}$/;

function CareerTable({ career, seasonsTotal, kind, id }: { career: CareerSeason[]; seasonsTotal: number; kind: "drivers" | "teams"; id: string }) {
  const page = kind === "drivers" ? "driver" : "team";
  return (
    <div className="space-y-2">
      <Table>
        <TableCaption className="sr-only">Championship result per season</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Season</TableHead>
            <TableHead>Pos</TableHead>
            <TableHead className="text-right">Pts</TableHead>
            <TableHead className="text-right">Wins</TableHead>
            {kind === "drivers" && <TableHead className="hidden sm:table-cell">Constructor</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {career.map((c) => (
            <TableRow key={c.season}>
              <TableCell>
                {/* The season's races on this profile; the position goes to that season's standings. */}
                <Link href={`/${page}?id=${id}&season=${c.season}`} className="font-mono tabular-nums hover:text-live hover:underline">{c.season}</Link>
              </TableCell>
              <TableCell className="font-mono tabular-nums">
                <Link href={`/standings?season=${c.season}`} className="hover:text-live hover:underline" aria-label={`P${c.positionText} in the ${c.season} standings`}>{c.positionText}</Link>
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">{formatPoints(c.points)}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{c.wins}</TableCell>
              {kind === "drivers" && (
                <TableCell className="hidden sm:table-cell">
                  {c.constructors.map((t, i) => (
                    <span key={t.id}>
                      {i > 0 && " / "}
                      <Link href={`/team?id=${t.id}&season=${c.season}`} className="hover:text-live hover:underline">{t.name}</Link>
                    </span>
                  ))}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {seasonsTotal > career.length && (
        <p className="text-xs text-muted-foreground">
          Showing championship results for the most recent seasons only ({seasonsTotal} seasons entered in total).
        </p>
      )}
    </div>
  );
}

function SeasonRaces({ season, kind, id }: { season: number; kind: "drivers" | "teams"; id: string }) {
  const results = useApi<SeasonResults>(`/api/results?season=${season}`);
  return (
    <QueryState query={results}>
      {(r) => {
        const rows = r.races.flatMap((race) =>
          race.results
            .filter((e) => (kind === "drivers" ? e.driver.id === id : e.constructor.id === id))
            .map((e) => ({ race, e })),
        );
        if (!rows.length) return <p className="text-sm text-muted-foreground">No race starts in {season}.</p>;
        return (
          <Table>
            <TableCaption className="sr-only">{season} race results</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Rd</TableHead>
                <TableHead>Grand Prix</TableHead>
                {kind === "teams" && <TableHead>Driver</TableHead>}
                <TableHead className="hidden text-right sm:table-cell">Grid</TableHead>
                <TableHead className="text-right">Pos</TableHead>
                <TableHead className="text-right">Pts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ race, e }) => (
                <TableRow key={`${race.round}-${e.driver.id}`}>
                  <TableCell className="font-mono tabular-nums">{race.round}</TableCell>
                  <TableCell>
                    <Link href={`/race?season=${season}&round=${race.round}`} className="hover:text-live hover:underline">{race.name}</Link>
                  </TableCell>
                  {kind === "teams" && (
                    <TableCell>
                      {e.driver.id ? <Link href={`/driver?id=${e.driver.id}&season=${season}`} className="hover:text-live hover:underline">{e.driver.familyName}</Link> : e.driver.familyName}
                    </TableCell>
                  )}
                  <TableCell className="hidden text-right font-mono tabular-nums sm:table-cell">{e.grid === 0 ? <abbr title="Started from the pit lane">PL</abbr> : e.grid ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums" title={e.status}>{/^\d+$/.test(e.positionText) ? e.positionText : e.status}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatPoints(e.points)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        );
      }}
    </QueryState>
  );
}

export function ProfileView({ kind }: { kind: "drivers" | "teams" }) {
  const id = useSearchParams().get("id") ?? "";
  const { season } = useSeason();
  const valid = ID.test(id);
  const profile = useApi<DriverProfile | ConstructorProfile>(valid ? `/api/${kind}/${id}` : null);
  if (!valid) return <ErrorState error={new Error("This link is missing a valid id.")} />;

  return (
    <QueryState
      query={profile}
      loading={
        <>
          <Skeleton className="mb-5 h-[73px] w-full" />
          <Skeleton className="h-96 w-full" />
        </>
      }
    >
      {(p, res) => {
        const title = "driver" in p ? driverName(p.driver) : p.constructor.name;
        const bits =
          "driver" in p
            ? [p.driver.code, p.driver.number !== null && `#${p.driver.number}`, p.driver.nationality, p.driver.dateOfBirth && `born ${p.driver.dateOfBirth}`]
            : [p.constructor.nationality];
        const shownSeason = season && p.seasons.includes(season) ? season : p.seasons[0];
        return (
          <>
            <PageHeader title={title} description={bits.filter(Boolean).join(" · ")} />
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Championship history</CardTitle>
                  <CardDescription>
                    {p.seasons.length} season{p.seasons.length === 1 ? "" : "s"}, {p.seasons.at(-1)}–{p.seasons[0]}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <CareerTable career={p.career} seasonsTotal={p.seasonsTotal} kind={kind} id={id} />
                  <SourceNote res={res} />
                </CardContent>
              </Card>
              {shownSeason && (
                <Card>
                  <CardHeader>
                    <CardTitle>{shownSeason} races</CardTitle>
                    {shownSeason !== season && season && <CardDescription>No entries in {season}; showing their latest season.</CardDescription>}
                  </CardHeader>
                  <CardContent>
                    <SeasonRaces season={shownSeason} kind={kind} id={id} />
                  </CardContent>
                </Card>
              )}
            </div>
          </>
        );
      }}
    </QueryState>
  );
}
