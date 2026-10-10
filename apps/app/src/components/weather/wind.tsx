import { compass } from "@pitwall/shared";
import { NavigationIcon } from "lucide-react";
import { fmtSpeed } from "@/lib/format";

/** Wind with an arrow pointing where it blows to, plus the compass point it comes from in text. */
export function Wind({ speed, direction, gusts }: { speed: number | null; direction: number | null; gusts?: number | null }) {
  if (speed === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {direction !== null && (
        <NavigationIcon aria-hidden className="size-3 fill-current" style={{ transform: `rotate(${direction + 180}deg)` }} />
      )}
      {fmtSpeed(speed)}
      {direction !== null && <span className="text-muted-foreground">from {compass(direction)}</span>}
      {gusts != null && <span className="text-muted-foreground">· gusts {Math.round(gusts)}</span>}
    </span>
  );
}
