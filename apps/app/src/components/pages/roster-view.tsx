"use client";

import {
  type ConstructorStanding,
  type DriverStanding,
  isStart,
  roster,
  type RosterTeam,
  type SeasonResults,
  seasonStats,
  type Standings,
} from "@pitwall/shared";
import Link from "next/link";
import { useState } from "react";
import { EmptyState, QueryState, SourceNote } from "@/components/data/query-state";
import { PageHeader } from "@/components/pages/page-header";
import { TeamMark } from "@/components/racing/team-mark";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/api";
import { driverName, formatPoints } from "@/lib/format";
import { useSeason, useTeamColours } from "@/lib/hooks";
import { Arrive } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Transparent formula1.com cutout (2023 on), or the race number when there's none or it fails to load. */
export function Headshot({ src, number, colour, className }: { src?: string; number: number | null; colour?: string; className: string }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    // Decorative: the name is next to it. Plain img: the static export has no image optimiser.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" onError={() => setFailed(true)} className={cn("object-contain object-bottom", className)} />;
  }
  return (
    <span aria-hidden className={cn("grid place-items-end font-display-italic text-3xl leading-[1.1] font-black text-muted-foreground", className)} style={{ color: colour }}>
      {number ?? ""}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  );
}

const Loading = () => (
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading">
    {Array.from({ length: 6 }, (_, i) => (
      <Skeleton key={i} className="h-32 w-full" />
    ))}
  </div>
);

/** Standings position for sorting; anyone not in the standings goes last. */
const rank = (pos: number | null | undefined) => pos ?? Number.MAX_SAFE_INTEGER;

function DriverTiles({ season, results, drivers }: { season: number; results: SeasonResults; drivers?: Standings<DriverStanding> }) {
  const colours = useTeamColours(season).data?.data ?? {};
  const standing = new Map(drivers?.entries.map((e) => [e.driver.id, e]));
  // One tile per driver, with every team they started for in the order they raced for it.
  const byDriver = new Map<string, { driver: RosterTeam["drivers"][number]["driver"]; teams: RosterTeam["constructor"][] }>();
  for (const race of results.races) {
    for (const e of race.results) {
      if (!isStart(e)) continue;
      const key = e.driver.id || `#${e.number}`;
      const row = byDriver.get(key) ?? { driver: e.driver, teams: [] };
      if (!row.teams.some((t) => t.id === e.constructor.id && t.name === e.constructor.name)) row.teams.push(e.constructor);
      byDriver.set(key, row);
    }
  }
  const tiles = [...byDriver.values()].sort((a, b) => rank(standing.get(a.driver.id)?.position) - rank(standing.get(b.driver.id)?.position));

  return (
    <Arrive className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {tiles.map(({ driver, teams: driverTeams }) => {
        const st = standing.get(driver.id);
        const s = seasonStats(results, (e) => e.driver.id === driver.id);
        const colour = colours[driverTeams.at(-1)?.id ?? ""];
        const body = (
          <>
            <Headshot src={st?.headshot} number={driver.number} colour={colour} className="size-20 shrink-0 self-end bg-muted/40" />
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <p className="font-mono text-xs text-muted-foreground tabular-nums">
                  {st?.position ? `P${st.position}` : "—"}
                  {driver.number !== null && ` · #${driver.number}`}
                </p>
                <p className="truncate font-semibold group-hover:text-live">{driverName(driver)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {driverTeams.map((t, i) => (
                    <span key={t.id || t.name}>
                      {i > 0 && " / "}
                      <TeamMark id={t.id} season={season} />
                      {t.name}
                    </span>
                  ))}
                </p>
              </div>
              <dl className="grid grid-cols-4 gap-2 text-sm">
                <Stat label="Pts" value={st ? formatPoints(st.points) : "—"} />
                <Stat label="Wins" value={s.wins} />
                <Stat label="Podiums" value={s.podiums} />
                <Stat label="Starts" value={s.starts} />
              </dl>
            </div>
          </>
        );
        const cls = "panel-cut group flex gap-3 border bg-card p-3 transition-colors";
        // Unmapped OpenF1 drivers have no profile to link to.
        return driver.id ? (
          <Link key={driver.id} href={`/driver?id=${driver.id}&season=${season}`} className={`${cls} hover:border-live focus-visible:border-live outline-none`}>
            {body}
          </Link>
        ) : (
          <div key={`${driver.givenName} ${driver.familyName}`} className={cls}>
            {body}
          </div>
        );
      })}
    </Arrive>
  );
}

function TeamBlocks({
  season,
  results,
  teams,
  constructors,
  drivers,
}: {
  season: number;
  results: SeasonResults;
  teams: RosterTeam[];
  constructors?: Standings<ConstructorStanding>;
  drivers?: Standings<DriverStanding>;
}) {
  const colours = useTeamColours(season).data?.data ?? {};
  const standing = new Map(constructors?.entries.map((e) => [e.constructor.id, e]));
  const headshots = new Map(drivers?.entries.map((e) => [e.driver.id, e.headshot]));
  const sorted = [...teams].sort((a, b) => rank(standing.get(a.constructor.id)?.position) - rank(standing.get(b.constructor.id)?.position));

  return (
    <Arrive className="grid gap-3 lg:grid-cols-2">
      {sorted.map(({ constructor: team, drivers: teamDrivers }) => {
        const st = standing.get(team.id);
        const s = seasonStats(results, (e) => e.constructor.id === team.id);
        const colour = colours[team.id];
        // Regulars did most of the season; anyone with under a third of the team's top tally is a stand-in.
        const regular = Math.max(...teamDrivers.map((d) => d.starts)) / 3;
        return (
          <section key={team.id || team.name} aria-label={team.name} className="panel-cut relative space-y-3 border bg-card p-4 pl-5">
            <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-muted-foreground/40" style={colour ? { backgroundColor: colour } : undefined} />
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-base font-black tracking-tight uppercase">
                {team.id ? (
                  <Link href={`/team?id=${team.id}&season=${season}`} className="hover:text-live hover:underline">
                    {team.name}
                  </Link>
                ) : (
                  team.name
                )}
              </h2>
              <p className="font-mono text-sm tabular-nums">
                {st?.position && <span className="text-muted-foreground">P{st.position} · </span>}
                {st ? `${formatPoints(st.points)} pts` : ""}
              </p>
            </div>
            <dl className="grid grid-cols-4 gap-2 text-sm">
              <Stat label="Wins" value={s.wins} />
              <Stat label="Podiums" value={s.podiums} />
              <Stat label="Points finishes" value={s.pointsFinishes} />
              <Stat label="DNFs" value={s.dnfs} />
            </dl>
            <ul className="space-y-1.5">
              {teamDrivers.map(({ driver, starts }) => {
                const sub = starts < regular;
                const name = driver.id ? (
                  <Link href={`/driver?id=${driver.id}&season=${season}`} className="hover:text-live hover:underline">
                    {driverName(driver)}
                  </Link>
                ) : (
                  driverName(driver)
                );
                return (
                  <li key={driver.id || `#${driver.number}`} className={`flex items-center gap-2 ${sub ? "text-xs text-muted-foreground" : "text-sm"}`}>
                    {!sub && <Headshot src={headshots.get(driver.id)} number={driver.number} colour={colour} className="size-9 shrink-0 bg-muted/40 text-base" />}
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    <span className="font-mono tabular-nums">
                      {starts} start{starts === 1 ? "" : "s"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </Arrive>
  );
}

export function RosterView({ kind }: { kind: "drivers" | "teams" }) {
  const { season } = useSeason();
  const s = season ? `season=${season}` : null;
  const results = useApi<SeasonResults>(s && `/api/results?${s}`);
  const drivers = useApi<Standings<DriverStanding>>(s && `/api/standings/drivers?${s}`);
  const constructors = useApi<Standings<ConstructorStanding>>(s && kind === "teams" ? `/api/standings/constructors?${s}` : null);
  const label = kind === "drivers" ? "Drivers" : "Teams";

  return (
    <>
      <PageHeader title={season ? `${season} ${label}` : label} description="Grand Prix starts, wins and podiums. Points are the championship's, sprints included." />
      <QueryState query={results} loading={<Loading />}>
        {(r, res) => {
          const teams = roster(r);
          if (!season) return null;
          if (!teams.length) {
            return (
              <EmptyState>
                No races in {season} yet.{" "}
                <Link href={`/${kind}?season=${season - 1}`} className="font-medium underline-offset-4 hover:text-live hover:underline">
                  See the {season - 1} {kind}
                </Link>
              </EmptyState>
            );
          }
          return (
            <div className="space-y-3">
              {kind === "drivers" ? (
                <DriverTiles season={season} results={r} drivers={drivers.data?.data ?? undefined} />
              ) : (
                <TeamBlocks season={season} results={r} teams={teams} constructors={constructors.data?.data ?? undefined} drivers={drivers.data?.data ?? undefined} />
              )}
              <SourceNote res={res} />
            </div>
          );
        }}
      </QueryState>
    </>
  );
}
