"use client";

import { useTeamColours } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/**
 * Team emblems in public/teams/<constructor id>.svg, keyed by Jolpica constructor id, cropped from Wikimedia files
 * (PD = Commons public domain; fair use = English Wikipedia non-free). `invert` marks one-colour emblems that are inverted in dark mode.
 * One logo per id: a rebrand under the same id keeps one logo. No emblem yet for alfa: it shows the colour bar.
 */
const LOGOS: Record<string, { invert?: true }> = {
  alphatauri: { invert: true }, // AlphaTauri.svg, fair use
  alpine: { invert: true }, // Alpine F1 Team Logo.svg, PD
  aston_martin: { invert: true }, // Aston Martin Lagonda brand logo.svg, fair use
  audi: { invert: true }, // Audi-Logo 2016.svg, PD
  cadillac: { invert: true }, // Cadillac Formula 1 Team Logo (2025).svg, fair use
  ferrari: {}, // Scuderia Ferrari HP logo 24.svg, fair use
  haas: {}, // Haas F1 Team Logo.svg, PD
  mclaren: {}, // McLaren Speedmark.svg, PD, recoloured papaya
  mercedes: {}, // Mercedes-Benz Star 2022.svg, PD
  rb: {}, // VCARB F1 logo.svg, fair use
  red_bull: {}, // Red Bull Racing Logo 2026.svg, fair use
  sauber: {}, // Sauber F1 Team logo.svg, PD
  williams: { invert: true }, // Atlassian Williams F1 Team logo.svg, PD
};

/**
 * Small team mark next to a name: the team's emblem, else a team-colour bar. Decorative: the name is always shown as text.
 * The bar is neutral without a colour (OpenF1 has none before 2023).
 */
export function TeamEmblem({ id, colour, className }: { id: string | null | undefined; colour: string | null | undefined; className?: string }) {
  const logo = id ? LOGOS[id] : undefined;
  if (logo) {
    // Static SVGs at 16px: next/image buys nothing here.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/teams/${id}.svg`} alt="" aria-hidden className={cn("mr-1.5 inline-block size-4 shrink-0 object-contain align-[-3px]", logo.invert && "dark:invert", className)} />;
  }
  // The bar sits in the emblem's 16px box so names line up either way.
  return (
    <span aria-hidden className={cn("mr-1.5 inline-flex size-4 shrink-0 items-center justify-center align-[-3px]", className)}>
      <span className="h-3 w-1 rounded-full bg-muted-foreground/40" style={colour ? { backgroundColor: colour } : undefined} />
    </span>
  );
}

/** TeamEmblem with the colour looked up by season, for Jolpica-backed tables. */
export function TeamMark({ id, season }: { id: string; season: number }) {
  return <TeamEmblem id={id} colour={useTeamColours(season).data?.data?.[id]} />;
}
