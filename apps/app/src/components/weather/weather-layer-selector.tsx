"use client";

import type { CloudLevel } from "@pitwall/shared";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type WeatherLayer = "radar" | "cloud" | "wind";

export const LAYER_LABEL: Record<WeatherLayer, string> = {
  radar: "Rain radar (observed)",
  cloud: "Cloud (forecast)",
  wind: "Wind (forecast)",
};

export function WeatherLayerSelector({
  layers,
  onLayers,
  cloudLevel,
  onCloudLevel,
}: {
  layers: WeatherLayer[];
  onLayers: (l: WeatherLayer[]) => void;
  cloudLevel: CloudLevel;
  onCloudLevel: (l: CloudLevel) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup multiple value={layers} onValueChange={(v: string[]) => onLayers(v as WeatherLayer[])} aria-label="Map layers" variant="outline" size="sm">
        {(Object.keys(LAYER_LABEL) as WeatherLayer[]).map((l) => (
          <ToggleGroupItem key={l} value={l} className="text-[11px]">
            {LAYER_LABEL[l]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {layers.includes("cloud") && (
        <ToggleGroup
          value={[cloudLevel]}
          onValueChange={(v: string[]) => v[0] && onCloudLevel(v[0] as CloudLevel)}
          aria-label="Cloud level"
          variant="outline"
          size="sm"
        >
          {(["total", "low", "mid", "high"] as const).map((l) => (
            <ToggleGroupItem key={l} value={l} className="text-[11px] capitalize">
              {l}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
    </div>
  );
}
