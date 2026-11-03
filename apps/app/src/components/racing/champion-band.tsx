"use client";

import { type ConstructorStanding, type DecidedTitle, decidedTitle, type DriverStanding, type Standings } from "@pitwall/shared";
import Link from "next/link";
import { useState } from "react";
import { useApi } from "@/lib/api";
import { driverName } from "@/lib/format";
import { useCalendar, useTeamColours } from "@/lib/hooks";
import { CountUp, useArrival } from "@/lib/motion";

const decided = (racesLeft: number) =>
  racesLeft === 0 ? "Season complete" : `Decided with ${racesLeft} race${racesLeft === 1 ? "" : "s"} to go`;

/** The transparent cutout, or the race number in team colour when there's none (or it fails to load). */
function Portrait({ src, number, colour }: { src: string | undefined; number: number | null; colour: string | undefined }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    // Decorative: the name is the heading. Plain img: the static export has no image optimiser.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" onError={() => setFailed(true)} className="block size-32 self-end object-contain object-bottom sm:size-64 lg:size-72" />;
  }
  if (number === null) return null;
  return (
    <span aria-hidden className="self-end pr-5 font-display-italic text-8xl leading-[1.1] font-black sm:pr-8 sm:text-[11rem]" style={{ color: colour }}>
      {number}
    </span>
  );
}

/** Announces the season's champions, each once the title can't be lost. Renders nothing until one is decided. */
export function ChampionBand({ season }: { season: number }) {
  const races = useCalendar(season).data?.data;
  const drivers = useApi<Standings<DriverStanding>>(`/api/standings/drivers?season=${season}`).data?.data;
  const constructors = useApi<Standings<ConstructorStanding>>(`/api/standings/constructors?season=${season}`).data?.data;
  const colours = useTeamColours(season).data?.data;
  const driver = races && drivers ? decidedTitle(drivers, races, "drivers") : null;
  const team = races && constructors ? decidedTitle(constructors, races, "constructors") : null;
  if (!driver && !team) return null;
  return <Band season={season} driver={driver} team={team} colours={colours ?? {}} />;
}

function Band({
  season,
  driver,
  team,
  colours,
}: {
  season: number;
  driver: DecidedTitle<DriverStanding> | null;
  team: DecidedTitle<ConstructorStanding> | null;
  colours: Record<string, string>;
}) {
  const ref = useArrival<HTMLElement>();
  const d = driver?.champion;
  const driverTeam = d?.constructors.at(-1);
  const colour = colours[driverTeam?.id ?? team?.champion.constructor.id ?? ""];
  const name = "font-display-italic leading-[1.1] font-black tracking-tight text-balance uppercase hover:text-live hover:underline";
  return (
    <section
      ref={ref}
      aria-label={`${season} champions`}
      className="panel-cut relative grid grid-cols-[1fr_auto] overflow-hidden border bg-card"
      // Team colour wash behind the portrait side; the neutral border colour before 2023 (no OpenF1 colours).
      style={{ backgroundImage: `linear-gradient(to left, color-mix(in oklab, ${colour ?? "var(--muted)"} 22%, transparent), transparent 60%)` }}
    >
      <span aria-hidden data-stripe-y className="absolute inset-y-0 left-0 w-1 origin-top bg-live" style={colour ? { backgroundColor: colour } : undefined} />
      <div className="min-w-0 space-y-5 self-center p-5 pl-6 sm:p-6 sm:pl-7">
        {driver && d && (
          <div className="space-y-1">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{season} World Champion</p>
            <h2 className="overflow-hidden pb-1 text-3xl sm:text-5xl">
              <Link data-title href={`/driver?id=${d.driver.id}&season=${season}`} className={`block ${name}`}>
                {driverName(d.driver)}
              </Link>
            </h2>
            <p className="font-mono text-sm tabular-nums">
              {driverTeam && <>{driverTeam.name} · </>}
              <CountUp value={d.points} /> pts
            </p>
            <p className="text-xs text-muted-foreground">{decided(driver.racesLeft)}</p>
          </div>
        )}
        {team && (
          <div className="space-y-1">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{season} Constructors&apos; Champion</p>
            <h2 className={`overflow-hidden pb-1 ${driver ? "text-xl sm:text-2xl" : "text-3xl sm:text-5xl"}`}>
              <Link data-title href={`/team?id=${team.champion.constructor.id}&season=${season}`} className={`block ${name}`}>
                {team.champion.constructor.name}
              </Link>
            </h2>
            <p className="font-mono text-sm tabular-nums">
              <CountUp value={team.champion.points} /> pts
            </p>
            <p className="text-xs text-muted-foreground">{decided(team.racesLeft)}</p>
          </div>
        )}
      </div>
      {d && <Portrait src={d.headshot} number={d.driver.number} colour={colour} />}
    </section>
  );
}
