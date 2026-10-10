"use client";

import type { CloudGrid, CloudLevel, RadarFrames } from "@pitwall/shared";
import { type GeoJSONSource, getVersion, Map as MapLibre, NavigationControl, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { cloudFeatures, windFeatures } from "@/lib/weather-geo";
import { CLOUD_OPACITY_STEP } from "./legends";
import type { WeatherLayer } from "./weather-layer-selector";

// Copied into /public by scripts/copy-maplibre-worker.mjs (the bundler can't resolve it next to the main module).
setWorkerUrl(`/maplibre/${getVersion()}/maplibre-gl-worker.mjs`);

const STYLE = { dark: "https://tiles.openfreemap.org/styles/dark", light: "https://tiles.openfreemap.org/styles/positron" };
const EMPTY = { type: "FeatureCollection" as const, features: [] };
const RADAR_ATTRIBUTION = '<a href="https://www.rainviewer.com/" target="_blank" rel="noreferrer">RainViewer</a> radar';

export interface WeatherMapProps {
  center: { lat: number; lon: number };
  label: string;
  dark: boolean;
  layers: WeatherLayer[];
  grid: CloudGrid | null;
  step: number;
  cloudLevel: CloudLevel;
  radar: RadarFrames | null;
  radarIndex: number;
  radarOpacity: number;
}

/** Arrow pointing up, drawn once and tinted via SDF. */
function arrowImage() {
  const size = 32;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.beginPath();
  g.moveTo(16, 2);
  g.lineTo(26, 16);
  g.lineTo(19, 16);
  g.lineTo(19, 30);
  g.lineTo(13, 30);
  g.lineTo(13, 16);
  g.lineTo(6, 16);
  g.closePath();
  g.fill();
  return g.getImageData(0, 0, size, size);
}

const radarSourceId = (path: string) => `radar-${path.split("/").pop()}`;

/** Geographic map (MapLibre + OpenFreeMap). Weather data only — never the schematic circuit. */
export default function WeatherMap(p: WeatherMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibre | null>(null);
  const { lat, lon } = p.center;

  useEffect(() => {
    const m = new MapLibre({
      container: container.current!,
      style: p.dark ? STYLE.dark : STYLE.light,
      center: [lon, lat],
      zoom: 6.5,
      minZoom: 3,
      maxZoom: 11,
      cooperativeGestures: true, // page scroll isn't hijacked on touch devices
      attributionControl: { compact: true, customAttribution: '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a>' },
    });
    m.addControl(new NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      const fg = p.dark ? "#f5f5f4" : "#1c1917";
      const bg = p.dark ? "#1c1917" : "#fafaf9";
      m.addImage("wind-arrow", arrowImage(), { sdf: true });
      m.addSource("cloud", { type: "geojson", data: EMPTY, attribution: "Forecast: Open-Meteo (CC BY 4.0)" });
      m.addLayer({ id: "cloud", type: "fill", source: "cloud", paint: { "fill-color": fg, "fill-opacity": ["*", ["get", "band"], CLOUD_OPACITY_STEP], "fill-antialias": false } });
      m.addSource("wind", { type: "geojson", data: EMPTY });
      m.addLayer({
        id: "wind",
        type: "symbol",
        source: "wind",
        layout: {
          "icon-image": "wind-arrow",
          "icon-rotate": ["get", "rot"],
          "icon-rotation-alignment": "map",
          "icon-size": ["interpolate", ["linear"], ["get", "speed"], 0, 0.45, 50, 1],
          "text-field": ["get", "label"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 10,
          "text-offset": [0, 1.5],
          "text-optional": true,
        },
        paint: { "icon-color": fg, "text-color": fg, "text-halo-color": bg, "text-halo-width": 1 },
      });
      m.addSource("circuit", { type: "geojson", data: { type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: { label: p.label } } });
      m.addLayer({ id: "circuit", type: "circle", source: "circuit", paint: { "circle-radius": 6, "circle-color": fg, "circle-stroke-color": bg, "circle-stroke-width": 2 } });
      m.addLayer({
        id: "circuit-label",
        type: "symbol",
        source: "circuit",
        layout: { "text-field": ["get", "label"], "text-font": ["Noto Sans Regular"], "text-size": 12, "text-offset": [0, -1.4] },
        paint: { "text-color": fg, "text-halo-color": bg, "text-halo-width": 1.5 },
      });
      setMap(m);
    });
    return () => {
      setMap(null);
      m.remove();
    };
    // The map is rebuilt only when the place or theme changes; everything else is applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, p.dark]);

  // Cloud + wind: forecast grid at the selected step.
  useEffect(() => {
    if (!map) return;
    const cloudOn = p.layers.includes("cloud") && p.grid && p.step >= 0;
    const windOn = p.layers.includes("wind") && p.grid && p.step >= 0;
    (map.getSource("cloud") as GeoJSONSource).setData(cloudOn ? cloudFeatures(p.grid!, p.step, p.cloudLevel) : EMPTY);
    (map.getSource("wind") as GeoJSONSource).setData(windOn ? windFeatures(p.grid!, p.step) : EMPTY);
  }, [map, p.layers, p.grid, p.step, p.cloudLevel]);

  // Radar: one raster source per frame, added lazily (current + next) to stay inside RainViewer's
  // 100 requests/IP/minute; only the current frame is visible.
  useEffect(() => {
    if (!map || !p.radar) return;
    const frames = p.radar.frames;
    const wanted = new Set(frames.map((f) => radarSourceId(f.path)));
    for (const layer of map.getStyle().layers) {
      if (layer.id.startsWith("radar-") && !wanted.has(layer.id)) {
        map.removeLayer(layer.id);
        map.removeSource(layer.id);
      }
    }
    if (!p.layers.includes("radar")) {
      for (const f of frames) if (map.getLayer(radarSourceId(f.path))) map.setLayoutProperty(radarSourceId(f.path), "visibility", "none");
      return;
    }
    for (const i of [p.radarIndex, (p.radarIndex + 1) % frames.length]) {
      const f = frames[i];
      if (!f || map.getSource(radarSourceId(f.path))) continue;
      map.addSource(radarSourceId(f.path), {
        type: "raster",
        tiles: [`${p.radar.host}${f.path}/512/{z}/{x}/{y}/${p.radar.colorScheme}/1_0.png`],
        tileSize: 512,
        maxzoom: p.radar.maxZoom, // tiles beyond z7 aren't served on the free tier; MapLibre overzooms
        attribution: RADAR_ATTRIBUTION,
      });
      map.addLayer({ id: radarSourceId(f.path), type: "raster", source: radarSourceId(f.path), paint: { "raster-opacity": 0, "raster-fade-duration": 0 } }, "wind");
    }
    frames.forEach((f, i) => {
      const id = radarSourceId(f.path);
      if (!map.getLayer(id)) return;
      map.setLayoutProperty(id, "visibility", "visible");
      map.setPaintProperty(id, "raster-opacity", i === p.radarIndex ? p.radarOpacity : 0);
    });
  }, [map, p.radar, p.radarIndex, p.radarOpacity, p.layers]);

  return <div ref={container} className="h-[420px] w-full overflow-hidden rounded-lg border md:h-[520px]" role="region" aria-label={`Weather map around ${p.label}`} />;
}
