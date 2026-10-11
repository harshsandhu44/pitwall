import type { Layout, LayoutItem } from "react-grid-layout";
import { cloneLayout, moveElement, verticalCompactor } from "react-grid-layout/core";

/** Dashboard grids are 12 columns wide. */
export const COLS = 12;
/** Columns a "Move left/right" or "Wider/Narrower" step covers. */
const STEP = 3;

export type Direction = "up" | "down" | "left" | "right";

const overlapsX = (a: LayoutItem, b: LayoutItem) => a.x < b.x + b.w && b.x < a.x + a.w;
const overlapsY = (a: LayoutItem, b: LayoutItem) => a.y < b.y + b.h && b.y < a.y + a.h;
// The compactor also clears the `moved` flags moveElement leaves behind.
const compact = (layout: LayoutItem[]): Layout => verticalCompactor.compact(layout, COLS);

/** Two panels trade places (top-left corners), each kept inside the grid; then everything compacts upward. */
export function swap(layout: Layout, a: string, b: string): Layout {
  const next = cloneLayout(layout) as LayoutItem[];
  const p = next.find((i) => i.i === a);
  const q = next.find((i) => i.i === b);
  if (!p || !q) return layout;
  [p.x, p.y, q.x, q.y] = [Math.min(q.x, COLS - p.w), q.y, Math.min(p.x, COLS - q.w), p.y];
  return compact(next);
}

/**
 * The keyboard and touch equivalent of dragging a panel: it trades places with the nearest panel in that
 * direction. Sideways with no panel there, it shifts a quarter of the grid instead.
 */
export function move(layout: Layout, id: string, dir: Direction): Layout {
  const l = layout.find((i) => i.i === id);
  if (!l) return layout;
  const others = layout.filter((o) => o !== l);
  const nearest = {
    up: others.filter((o) => overlapsX(o, l) && o.y < l.y).sort((a, b) => b.y - a.y)[0],
    down: others.filter((o) => overlapsX(o, l) && o.y > l.y).sort((a, b) => a.y - b.y)[0],
    left: others.filter((o) => overlapsY(o, l) && o.x + o.w <= l.x).sort((a, b) => b.x - a.x)[0],
    right: others.filter((o) => overlapsY(o, l) && o.x >= l.x + l.w).sort((a, b) => a.x - b.x)[0],
  }[dir];
  if (nearest) return swap(layout, id, nearest.i);
  if (dir === "up" || dir === "down") return layout;
  const x = dir === "left" ? Math.max(0, l.x - STEP) : Math.min(COLS - l.w, l.x + STEP);
  if (x === l.x) return layout;
  const next = cloneLayout(layout) as LayoutItem[];
  const m = next.find((i) => i.i === id)!;
  // Same collision handling as a drag: whatever is in the way moves down.
  return compact(moveElement(next, m, x, m.y, true, false, "vertical", COLS) as LayoutItem[]);
}

/** Grows or shrinks a panel by whole steps, within its min/max and the grid. */
export function resize(layout: Layout, id: string, dw: number, dh: number): Layout {
  const next = cloneLayout(layout) as LayoutItem[];
  const l = next.find((i) => i.i === id);
  if (!l) return layout;
  const clamp = (v: number, lo = 1, hi = Infinity) => Math.min(Math.max(v, lo), hi);
  l.w = clamp(l.w + dw * STEP, l.minW ?? 1, Math.min(l.maxW ?? COLS, COLS));
  l.h = clamp(l.h + dh, l.minH ?? 1, l.maxH ?? Infinity);
  l.x = Math.min(l.x, COLS - l.w);
  // Compaction pushes anything the bigger panel now covers further down, as a corner drag would.
  return compact(next);
}

/** Panels in reading order (top to bottom, then left to right): the order phones stack them in. */
export const readingOrder = (layout: Layout) => [...layout].sort((a, b) => a.y - b.y || a.x - b.x).map((l) => l.i);
