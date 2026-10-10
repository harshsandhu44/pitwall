import type { SeasonResults } from "@pitwall/shared";
import { cn } from "@/lib/utils";

/** Finishing positions in the driver's last N classified races of the season. */
export function RecentResults({ results, driverId, count = 5 }: { results: SeasonResults; driverId: string; count?: number }) {
  const recent = results.races
    .map((r) => ({ round: r.round, name: r.name, entry: r.results.find((e) => e.driver.id === driverId) }))
    .filter((r) => r.entry)
    .slice(-count);
  if (!recent.length) return <span className="text-muted-foreground">—</span>;
  return (
    <ol className="flex gap-0.5" aria-label="Recent race results">
      {recent.map(({ round, name, entry }) => {
        const p = entry!.position;
        const classified = /^\d+$/.test(entry!.positionText);
        return (
          <li
            key={round}
            title={`${name}: ${classified ? `P${entry!.positionText}` : entry!.status}`}
            className={cn(
              "w-6 rounded-sm py-0.5 text-center font-mono text-[10px] tabular-nums",
              classified && p !== null && p <= 3 ? "bg-foreground text-background" : classified && p !== null && p <= 10 ? "bg-muted" : "text-muted-foreground",
            )}
          >
            <span className="sr-only">{name}: </span>
            {classified ? entry!.positionText : entry!.positionText === "R" ? "DNF" : entry!.positionText}
          </li>
        );
      })}
    </ol>
  );
}
