"use client";

import { carAt, type PositionWindow, type ReplayDriver, type SessionReplay } from "@pitwall/shared";
import { MinusIcon, PlusIcon, ScanIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

type Bounds = { minX: number; maxX: number; minY: number; maxY: number };

function boundsOf(xs: number[], ys: number[]): Bounds | null {
  if (!xs.length) return null;
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/**
 * Recorded car positions on the outline traced from OpenF1's own location data (same coordinate
 * space, so no alignment guesswork). Not a geographic map and not the decorative F1DB layout.
 */
export function TrackCanvas({
  track,
  drivers,
  time,
  getWindow,
  selected,
  follow,
  interpolate,
  onSelect,
}: {
  track: SessionReplay["track"];
  drivers: ReplayDriver[];
  /** Session time to draw (epoch ms); called every frame. */
  time: () => number;
  getWindow: (t: number) => PositionWindow | null;
  selected: number | null;
  follow: boolean;
  interpolate: boolean;
  /** Clicking (not dragging) within 12 px of a car selects it. */
  onSelect?: (driver: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef({ zoom: 1, panX: 0, panY: 0 });
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  /** Where each car was drawn last frame, in CSS pixels, for click hit-testing. */
  const drawn = useRef<{ driver: number; x: number; y: number }[]>([]);
  const scaleRef = useRef(1);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext("2d");
    if (!ctx) return; // no 2D canvas (jsdom, or the browser refused one): the timing tower still lists every car
    const css = getComputedStyle(el);
    const fg = css.getPropertyValue("--foreground").trim() || "#fff";
    const bg = css.getPropertyValue("--background").trim() || "#000";
    const muted = css.getPropertyValue("--muted-foreground").trim() || "#888";
    // Expand-only: starts at the outline, grows to include any recorded position (e.g. pit lane).
    let b = track ? boundsOf(track.x, track.y) : null;
    let raf = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const dpr = window.devicePixelRatio || 1;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
        el.width = Math.round(w * dpr);
        el.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const t = time();
      const win = getWindow(t);
      const cars = drivers.map((d) => {
        const s = win?.cars[d.number];
        return { d, fix: s ? carAt(s, t - win!.from, interpolate) : null };
      });
      for (const { fix } of cars) {
        if (!fix) continue;
        b = b
          ? { minX: Math.min(b.minX, fix.x), maxX: Math.max(b.maxX, fix.x), minY: Math.min(b.minY, fix.y), maxY: Math.max(b.maxY, fix.y) }
          : { minX: fix.x - 1, maxX: fix.x + 1, minY: fix.y - 1, maxY: fix.y + 1 };
      }
      if (!b) return;

      const v = view.current;
      const pad = 24;
      const scale = Math.min((w - 2 * pad) / (b.maxX - b.minX || 1), (h - 2 * pad) / (b.maxY - b.minY || 1)) * v.zoom;
      scaleRef.current = scale;
      const followed = follow ? cars.find((c) => c.d.number === selected)?.fix : null;
      const cx = followed ? followed.x : (b.minX + b.maxX) / 2 + v.panX;
      const cy = followed ? followed.y : (b.minY + b.maxY) / 2 + v.panY;
      // y is flipped so the layout reads like a conventional track map.
      const sx = (x: number) => w / 2 + (x - cx) * scale;
      const sy = (y: number) => h / 2 - (y - cy) * scale;

      if (track) {
        ctx.beginPath();
        track.x.forEach((x, i) => (i ? ctx.lineTo(sx(x), sy(track.y[i]!)) : ctx.moveTo(sx(x), sy(track.y[i]!))));
        ctx.strokeStyle = muted;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 6;
        ctx.lineJoin = "round";
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      ctx.font = `10px ${css.fontFamily}`; // canvas fonts can't use CSS variables; the canvas is font-mono
      drawn.current = cars.filter((c) => c.fix).map((c) => ({ driver: c.d.number, x: sx(c.fix!.x), y: sy(c.fix!.y) }));
      const ordered = [...cars].sort((a, c) => Number(a.d.number === selected) - Number(c.d.number === selected));
      for (const { d, fix } of ordered) {
        if (!fix) continue;
        const x = sx(fix.x);
        const y = sy(fix.y);
        const colour = d.colour ?? fg;
        const sel = d.number === selected;
        ctx.beginPath();
        ctx.arc(x, y, sel ? 7 : 5, 0, Math.PI * 2);
        if (fix.kind === "stale") {
          // No sample for over a second: hollow, faded ring at the last recorded spot.
          ctx.globalAlpha = 0.5;
          ctx.setLineDash([2, 2]);
          ctx.strokeStyle = colour;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          ctx.fillStyle = colour;
          ctx.fill();
          ctx.strokeStyle = bg;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        if (sel) {
          ctx.beginPath();
          ctx.arc(x, y, 11, 0, Math.PI * 2);
          ctx.strokeStyle = fg;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ctx.fillStyle = fg;
        ctx.fillText(d.acronym, x + 9, y + 3);
        ctx.globalAlpha = 1;
      }
      const missing = cars.filter((c) => !c.fix).length;
      if (win && missing) {
        ctx.fillStyle = muted;
        ctx.fillText(`${missing} car${missing > 1 ? "s" : ""} without a position now`, 8, h - 8);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [track, drivers, time, getWindow, selected, follow, interpolate, resolvedTheme]);

  const zoom = (f: number) => {
    view.current.zoom = Math.min(8, Math.max(1, view.current.zoom * f));
  };

  return (
    <div className="relative h-full">
      <canvas
        ref={canvas}
        role="img"
        aria-label="Track map with car positions; the timing tower lists the same cars as text"
        className="h-full min-h-60 w-full touch-none border bg-muted/30 font-mono"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          view.current.panX -= (e.clientX - drag.current.x) / scaleRef.current;
          view.current.panY += (e.clientY - drag.current.y) / scaleRef.current;
          drag.current = { ...drag.current, x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d || !onSelect || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 4) return;
          const r = e.currentTarget.getBoundingClientRect();
          const [px, py] = [e.clientX - r.left, e.clientY - r.top];
          const hit = drawn.current
            .map((c) => ({ ...c, dist: Math.hypot(c.x - px, c.y - py) }))
            .filter((c) => c.dist <= 12)
            .sort((a, b) => a.dist - b.dist)[0];
          if (hit) onSelect(hit.driver);
        }}
      />
      <div className="absolute top-2 right-2 flex flex-col gap-1">
        <Button size="icon-sm" variant="outline" aria-label="Zoom in" onClick={() => zoom(1.5)}>
          <PlusIcon aria-hidden />
        </Button>
        <Button size="icon-sm" variant="outline" aria-label="Zoom out" onClick={() => zoom(1 / 1.5)}>
          <MinusIcon aria-hidden />
        </Button>
        <Button size="icon-sm" variant="outline" aria-label="Reset view" onClick={() => (view.current = { zoom: 1, panX: 0, panY: 0 })}>
          <ScanIcon aria-hidden />
        </Button>
      </div>
    </div>
  );
}
