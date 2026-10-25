/** Opacity per 20% cloud band, shared by the map and its legend. */
export const CLOUD_OPACITY_STEP = 0.08;

// RainViewer "Universal Blue" (scheme 2) rain colours, from rainviewer.com/files/rainviewer_api_colors_table.csv.
const RADAR: [dbz: number, color: string][] = [
  [10, "#cec08796"],
  [15, "#88ddee"],
  [20, "#00a3e0"],
  [25, "#0077aa"],
  [30, "#005588"],
  [35, "#ffee00"],
  [40, "#ffaa00"],
  [45, "#ff4400"],
  [50, "#c10000"],
  [55, "#ffaaff"],
  [60, "#ff77ff"],
  [65, "#ffffff"],
];

export function RadarLegend() {
  return (
    <figure className="space-y-1">
      <figcaption className="text-xs text-muted-foreground">Radar reflectivity (dBZ) — higher means heavier precipitation</figcaption>
      <div className="flex h-2.5 overflow-hidden rounded-sm border" aria-hidden>
        {RADAR.map(([dbz, c]) => (
          <span key={dbz} className="flex-1" style={{ background: c }} />
        ))}
      </div>
      <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
        <span>10 light</span>
        <span>30 moderate</span>
        <span>45 heavy</span>
        <span>60+ extreme</span>
      </div>
    </figure>
  );
}

export function CloudLegend() {
  return (
    <figure className="space-y-1">
      <figcaption className="text-xs text-muted-foreground">Forecast cloud cover, 20% bands per model cell</figcaption>
      <div className="flex h-2.5 overflow-hidden rounded-sm border" aria-hidden>
        {[0, 1, 2, 3, 4, 5].map((b) => (
          <span key={b} className="flex-1 bg-foreground" style={{ opacity: b * CLOUD_OPACITY_STEP }} />
        ))}
      </div>
      <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
        <span>clear</span>
        <span>50%</span>
        <span>overcast</span>
      </div>
    </figure>
  );
}
