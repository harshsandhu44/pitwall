"use client";

import { useTeamColours } from "@/lib/hooks";

/**
 * Small team-colour bar next to a team name. Decorative: the name is always shown as text.
 * Neutral when OpenF1 has no colour for the team (every season before 2023).
 */
export function TeamMark({ id, season }: { id: string; season: number }) {
  const colour = useTeamColours(season).data?.data?.[id];
  return (
    <span
      aria-hidden
      className="mr-1.5 inline-block h-3 w-1 shrink-0 rounded-full bg-muted-foreground/40 align-[-1px]"
      style={colour ? { backgroundColor: colour } : undefined}
    />
  );
}
