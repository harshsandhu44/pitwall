import type { Layout } from "react-grid-layout";
import { describe, expect, it } from "vitest";
import { move, readingOrder, resize, swap } from "@/lib/layout";

// Track (8 wide) beside Timing (4 wide, tall); Race control under Track.
const base: Layout = [
  { i: "track", x: 0, y: 0, w: 8, h: 4 },
  { i: "timing", x: 8, y: 0, w: 4, h: 7 },
  { i: "rc", x: 0, y: 4, w: 8, h: 3 },
];
const noOverlaps = (l: Layout) =>
  l.every((a, i) => l.slice(i + 1).every((b) => a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y));
const pos = (l: Layout, id: string) => {
  const { x, y, w, h } = l.find((i) => i.i === id)!;
  return { x, y, w, h };
};

describe("panel layout moves", () => {
  it("moves a panel up or down past its neighbour", () => {
    const up = move(base, "rc", "up");
    expect(readingOrder(up)).toEqual(["rc", "timing", "track"]);
    expect(pos(up, "rc")).toMatchObject({ x: 0, y: 0 });
    expect(pos(up, "track")).toMatchObject({ x: 0, y: 3 });
    expect(readingOrder(move(base, "track", "down"))).toEqual(readingOrder(up));
  });

  it("ignores moves with nowhere to go", () => {
    expect(move(base, "track", "up")).toBe(base);
    expect(move(base, "rc", "down")).toBe(base);
    expect(move(base, "nope", "left")).toBe(base);
  });

  it("moves sideways past a neighbour, or a quarter-width step when there is none", () => {
    const l = move(base, "timing", "left");
    expect(pos(l, "timing")).toMatchObject({ x: 0, y: 0 });
    expect(pos(l, "track")).toMatchObject({ x: 4, y: 0 });
    expect(noOverlaps(l)).toBe(true);
    expect(move(base, "timing", "right")).toBe(base); // already at the edge
    expect(pos(move([{ i: "a", x: 3, y: 0, w: 4, h: 2 }], "a", "right"), "a").x).toBe(6);
  });

  it("can move a panel up out from under a tall neighbour's column", () => {
    // Live's default layout after the weather panel was dragged to straddle column 8 under Timing.
    const l: Layout = [
      { i: "track", x: 0, y: 0, w: 8, h: 12 },
      { i: "timing", x: 8, y: 0, w: 4, h: 18 },
      { i: "rc", x: 4, y: 12, w: 4, h: 6 },
      { i: "weather", x: 5, y: 18, w: 4, h: 4 },
    ];
    const up = move(l, "weather", "up");
    expect(pos(up, "weather").y).toBeLessThan(pos(up, "rc").y);
    expect(noOverlaps(up)).toBe(true);
    expect(noOverlaps(swap(l, "track", "weather"))).toBe(true);
  });

  it("resizes within min/max and pushes covered panels down", () => {
    const wider = resize(base, "track", 1, 0);
    expect(pos(wider, "track")).toMatchObject({ x: 0, w: 11 });
    expect(pos(wider, "timing").y).toBeGreaterThanOrEqual(4);
    expect(pos(resize([{ i: "a", x: 0, y: 0, w: 4, h: 3, minW: 3, minH: 2 }], "a", -1, -5), "a")).toMatchObject({ w: 3, h: 2 });
    expect(pos(resize([{ i: "a", x: 6, y: 0, w: 6, h: 3 }], "a", 3, 1), "a")).toMatchObject({ x: 0, w: 12, h: 4 });
  });
});
