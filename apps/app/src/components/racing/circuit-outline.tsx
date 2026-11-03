import type { Circuit } from "@pitwall/shared";
import { cn } from "@/lib/utils";

/**
 * Decorative layout (F1DB CC BY 4.0, or bacinger/f1-circuits MIT; see public/circuits/ATTRIBUTION.md) drawn as a CSS mask so it follows theme colors.
 * Schematic only — never used to place cars.
 */
export function CircuitOutline({ circuit, className }: { circuit: Circuit; className?: string }) {
  if (!circuit.layout) return null;
  const url = `url(/circuits/${circuit.layout.id}.svg)`;
  return (
    <div
      role="img"
      aria-label={`${circuit.name} layout`}
      className={cn("aspect-square bg-foreground/80", className)}
      style={{
        maskImage: url,
        WebkitMaskImage: url,
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }}
    />
  );
}
