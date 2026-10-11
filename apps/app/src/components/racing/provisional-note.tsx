"use client";

import { finalAt, type GrandPrix } from "@pitwall/shared";
import { Badge } from "@/components/ui/badge";
import { useNow } from "@/lib/hooks";

/** Results stay provisional for a week after the race, while stewards' decisions and appeals can change them. */
export function ProvisionalNote({ race, className }: { race: GrandPrix; className?: string }) {
  const now = useNow();
  if (now === null || now >= finalAt(race)) return null;
  return (
    <p className={`flex flex-wrap items-center gap-2 text-xs text-muted-foreground ${className ?? ""}`}>
      <Badge variant="outline">Provisional</Badge>
      Results can still change after stewards&apos; decisions until{" "}
      {new Date(finalAt(race)).toLocaleDateString(undefined, { day: "numeric", month: "short" })}.
    </p>
  );
}
