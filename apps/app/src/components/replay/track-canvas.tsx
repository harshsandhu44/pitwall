"use client";

import { carAt, type PositionWindow, type ReplayDriver, type SessionReplay, type TimingRow } from "@pitwall/shared";
import { MinusIcon, PlusIcon, ScanIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useLayoutEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

type Bounds = { minX: number; maxX: number; minY: number; maxY: number };

function boundsOf(xs: number[], ys: number[]): Bounds | null {
  if (!xs.length) return null;
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/** Cars within this much of the car ahead are a battle: linked on the map with the gap. */
const BATTLE_S = 1;

export type Battle = { ahead: number; behind: number; interval: number };

/** Consecutive cars in the running order less than BATTLE_S apart (races and sprints publish intervals). */
export function battlesOf(rows: TimingRow[]): Battle[] {
  const order = rows.filter((r) => r.position !== null).sort((a, b) => a.position! - b.position!);
  return order.flatMap((r, i) =>
    i > 0 && typeof r.interval === "number" && r.interval > 0 && r.interval < BATTLE_S ? [{ ahead: order[i - 1]!.driver, behind: r.driver, interval: r.interval }] : [],
  );
}

// Trails: this many past positions, this far apart, behind each car.
const TRAIL = 20;
const TRAIL_STEP_MS = 100;

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
  battles = [],
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
  /** Pairs to link on the map (battlesOf the timing rows). Read each frame, so a new array doesn't restart the loop. */
  battles?: Battle[];
  /** Clicking (not dragging) within 12 px of a car selects it. */
  onSelect?: (driver: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef({ zoom: 1, panX: 0, panY: 0 });
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  /** Where each car was drawn last frame, in CSS pixels, for click hit-testing. */
  const drawn = useRef<{ driver: number; x: number; y: number }[]>([]);
  const scaleRef = useRef(1);
  const battlesRef = useRef(battles);
  useLayoutEffect(() => {
    battlesRef.current = battles;
  });
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext("2d");
    if (!ctx) return; // no 2D canvas (jsdom, or the browser refused one): the timing tower still lists every car
    const css = getComputedStyle(el);
    const fg = css.getPropertyValue("--foreground").trim() || "#fff";
    const bg = css.getPropertyValue("--background").trim() || "#000";
    const muted = css.getPropertyValue("--muted-foreground").trim() || "#888";
    const tarmac = css.getPropertyValue("--input").trim() || "#444";
    const live = css.getPropertyValue("--live").trim() || "#e00";
    // Reduced motion: no trails, and the camera snaps instead of gliding.
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Where the camera is now; it eases toward where it should be each frame.
    let cam: { cx: number; cy: number; scale: number } | null = null;
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
      const followed = follow ? cars.find((c) => c.d.number === selected)?.fix : null;
      const to = {
        scale: Math.min((w - 2 * pad) / (b.maxX - b.minX || 1), (h - 2 * pad) / (b.maxY - b.minY || 1)) * v.zoom,
        cx: followed ? followed.x : (b.minX + b.maxX) / 2 + v.panX,
        cy: followed ? followed.y : (b.minY + b.maxY) / 2 + v.panY,
      };
      // A drag moves the map under the finger, so it snaps too.
      if (!cam || still || drag.current) cam = to;
      else for (const k of ["cx", "cy", "scale"] as const) cam[k] += (to[k] - cam[k]) * 0.15;
      const { cx, cy, scale } = cam;
      scaleRef.current = scale;
      // y is flipped so the layout reads like a conventional track map.
      const sx = (x: number) => w / 2 + (x - cx) * scale;
      const sy = (y: number) => h / 2 - (y - cy) * scale;

      if (track && track.x.length > 1) {
        // Tarmac as a ribbon with hairline edges, as the drive draws its road: edge stroke, then the surface over it.
        const width = Math.max(6, Math.min(18, 7 * v.zoom));
        ctx.beginPath();
        track.x.forEach((x, i) => (i ? ctx.lineTo(sx(x), sy(track.y[i]!)) : ctx.moveTo(sx(x), sy(track.y[i]!))));
        ctx.closePath();
        ctx.lineJoin = "round";
        ctx.strokeStyle = muted;
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = width + 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = tarmac;
        ctx.lineWidth = width;
        ctx.stroke();
        // The trace is one lap from the line, so its first point is the start/finish: a chequered bar across the road.
        const [x0, y0, x1, y1] = [sx(track.x[0]!), sy(track.y[0]!), sx(track.x[1]!), sy(track.y[1]!)];
        const len = Math.hypot(x1 - x0, y1 - y0) || 1;
        const [nx, ny] = [-(y1 - y0) / len, (x1 - x0) / len];
        const [ux, uy] = [(x1 - x0) / len, (y1 - y0) / len];
        const cell = width / 4;
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 2; j++) {
            const ox = x0 + nx * (i * cell - width / 2) + ux * j * cell;
            const oy = y0 + ny * (i * cell - width / 2) + uy * j * cell;
            ctx.fillStyle = (i + j) % 2 ? bg : fg;
            ctx.beginPath();
            ctx.moveTo(ox, oy);
            ctx.lineTo(ox + nx * cell, oy + ny * cell);
            ctx.lineTo(ox + nx * cell + ux * cell, oy + ny * cell + uy * cell);
            ctx.lineTo(ox + ux * cell, oy + uy * cell);
            ctx.fill();
          }
        }
      }

      if (!still) {
        // Fading tails: where each car was over the last TRAIL × TRAIL_STEP_MS. A jump (pit lane, a gap in the data) breaks the tail.
        ctx.lineCap = "round";
        for (const { d, fix } of cars) {
          if (!fix || fix.kind === "stale") continue;
          let px = sx(fix.x);
          let py = sy(fix.y);
          for (let k = 1; k <= TRAIL; k++) {
            const tk = t - k * TRAIL_STEP_MS;
            const wk = getWindow(tk);
            const sk = wk?.cars[d.number];
            const f = sk ? carAt(sk, tk - wk!.from, interpolate) : null;
            if (!f || f.kind === "stale") break;
            const [qx, qy] = [sx(f.x), sy(f.y)];
            if (Math.hypot(qx - px, qy - py) > 40) break;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(qx, qy);
            ctx.strokeStyle = d.colour ?? fg;
            ctx.globalAlpha = 0.7 * (1 - k / TRAIL);
            ctx.lineWidth = 4 * (1 - k / TRAIL) + 0.5;
            ctx.stroke();
            [px, py] = [qx, qy];
          }
        }
        ctx.globalAlpha = 1;
        ctx.lineCap = "butt";
      }

      ctx.font = `10px ${css.fontFamily}`; // canvas fonts can't use CSS variables; the canvas is font-mono
      // Battles: a dashed link from the chasing car to the one ahead, labelled with the interval.
      const at = new Map(cars.filter((c) => c.fix && c.fix.kind !== "stale").map((c) => [c.d.number, c.fix!]));
      for (const bt of battlesRef.current) {
        const [a, c] = [at.get(bt.ahead), at.get(bt.behind)];
        if (!a || !c) continue;
        const [ax, ay, bx, by] = [sx(a.x), sy(a.y), sx(c.x), sy(c.y)];
        // Far apart on screen means it isn't wheel-to-wheel here (lapped traffic, the pit lane): skip.
        if (Math.hypot(ax - bx, ay - by) > 120) continue;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(ax, ay);
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = live;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = live;
        ctx.fillText(`${bt.interval.toFixed(1)}s`, (ax + bx) / 2 + 6, (ay + by) / 2 - 6);
      }

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

  // Zoomed in, a touch drag pans the map in every direction; at full view it scrolls the page.
  const touchPan = () => {
    if (canvas.current) canvas.current.style.touchAction = view.current.zoom > 1 ? "none" : "";
  };
  const zoom = (f: number) => {
    view.current.zoom = Math.min(8, Math.max(1, view.current.zoom * f));
    touchPan();
  };

  return (
    <div className="relative h-full">
      <canvas
        ref={canvas}
        role="img"
        aria-label="Track map with car positions; the timing tower lists the same cars as text"
        className="h-full min-h-60 w-full touch-pan-y border bg-muted/30 font-mono"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          // On touch, a drag at full view scrolls the page (touch-pan-y); it pans only once zoomed in.
          if (!drag.current || (e.pointerType === "touch" && view.current.zoom === 1)) return;
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
        <Button size="icon-sm" variant="outline" aria-label="Reset view" onClick={() => {
            view.current = { zoom: 1, panX: 0, panY: 0 };
            touchPan();
          }}>
          <ScanIcon aria-hidden />
        </Button>
      </div>
    </div>
  );
}
