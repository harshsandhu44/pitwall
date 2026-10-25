"use client";

import type { Circuit } from "@pitwall/shared";
import { useEffect, useRef, useState } from "react";
import { CircuitOutline } from "@/components/racing/circuit-outline";
import { type Pt, STEP_M, skyFor, toMetres } from "@/lib/circuit-geo";
import { cn } from "@/lib/utils";

/** Points along the F1DB path, sampled by the browser's own SVG geometry. */
function samplePath(d: string, lengthKm: number | null): Pt[] {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("style", "position:absolute;width:0;height:0;visibility:hidden");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", d);
  svg.append(path);
  document.body.append(svg);
  try {
    const total = path.getTotalLength();
    const n = Math.min(900, Math.max(200, Math.round(((lengthKm ?? 5) * 1000) / STEP_M)));
    return Array.from({ length: n }, (_, i) => {
      const p = path.getPointAtLength((i / n) * total);
      return [p.x, p.y];
    });
  } finally {
    svg.remove();
  }
}

// The probe's context is released at once: browsers cap live WebGL contexts per page.
const webgl = () => {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
};

/**
 * The circuit in 3D, lit for the race's local start time. The flat outline shows first and stays
 * whenever the scene can't (no layout, no WebGL, a failed load); it also keeps the accessible name.
 */
export function CircuitScene({ circuit, start, className }: { circuit: Circuit; /** Race start, for the light. */ start: string | null; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const layout = circuit.layout;
  const tz = circuit.timezone;

  useEffect(() => {
    const el = host.current;
    if (!layout || !el || !webgl()) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let scene: { setRunning: (on: boolean) => void; dispose: () => void } | null = null;
    let seen: IntersectionObserver | null = null;
    let gone = false;
    void (async () => {
      const [svg, { createCircuitScene }] = await Promise.all([
        fetch(`/circuits/${layout.id}.svg`).then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status))))),
        import("@/lib/circuit-scene"),
      ]);
      const d = new DOMParser().parseFromString(svg, "image/svg+xml").querySelector("path")?.getAttribute("d");
      if (!d || gone) return;
      scene = createCircuitScene(el, toMetres(samplePath(d, layout.lengthKm), layout.lengthKm), skyFor(start, tz), still);
      // Orbit only while on screen.
      seen = new IntersectionObserver(([e]) => scene?.setRunning(!!e?.isIntersecting));
      seen.observe(el);
      setShown(true);
    })().catch(() => {}); // the outline is already there
    return () => {
      gone = true;
      seen?.disconnect();
      scene?.dispose();
      setShown(false);
    };
  }, [layout, start, tz]);

  if (!layout) return null;
  return (
    <div className={cn("relative overflow-hidden", className)}>
      <CircuitOutline circuit={circuit} className={cn("absolute inset-0 m-auto h-3/4 transition-opacity duration-700", shown && "opacity-0")} />
      <div ref={host} aria-hidden className={cn("absolute inset-0 opacity-0 transition-opacity duration-700", shown && "opacity-100")} />
    </div>
  );
}
