import type { LayoutPreset } from "./panel-grid";

/** Layouts in the Live and Replay Panels menus, by panel id. Panels a preset leaves out keep their default spot (compaction makes room). */
export const PRESETS: LayoutPreset[] = [
  { name: "Default", layout: {} },
  {
    name: "Timing focus",
    layout: { timing: { x: 0, y: 3, w: 6, h: 19 }, track: { x: 6, y: 3, w: 6, h: 11 }, focus: { x: 6, y: 14, w: 6, h: 8 } },
  },
  { name: "Track focus", layout: { track: { x: 0, y: 3, w: 12, h: 20 }, timing: { x: 0, y: 23, w: 6, h: 19 }, focus: { x: 6, y: 23, w: 6, h: 6 } } },
  {
    name: "Strategy",
    layout: { tyres: { x: 0, y: 3, w: 7, h: 12 }, penalties: { x: 7, y: 3, w: 5, h: 12 }, timing: { x: 7, y: 15, w: 5, h: 19 }, track: { x: 0, y: 15, w: 7, h: 12 } },
  },
];
