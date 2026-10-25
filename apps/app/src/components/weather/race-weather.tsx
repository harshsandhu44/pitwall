"use client";

import { type CloudLevel, type GrandPrix, scheduleState, SESSION_LABEL, type SessionKind } from "@pitwall/shared";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorState, QueryState, SourceNote } from "@/components/data/query-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CloudLegend, RadarLegend } from "@/components/weather/legends";
import { RaceWeatherSummary } from "@/components/weather/race-weather-summary";
import { RadarPlaybackControls } from "@/components/weather/radar-playback-controls";
import { WeatherConditions } from "@/components/weather/weather-conditions-card";
import { type WeatherLayer, WeatherLayerSelector } from "@/components/weather/weather-layer-selector";
import { WeatherTimeline } from "@/components/weather/weather-timeline";
import { formatHour } from "@/lib/format";
import { useCloudGrid, useForecast, useRadar } from "@/lib/hooks";
import { nearestStep } from "@/lib/weather-geo";

const WeatherMap = dynamic(() => import("@/components/weather/weather-map"), {
  ssr: false,
  loading: () => <Skeleton className="h-[420px] w-full md:h-[520px]" />,
});

const SESSION_HOURS: Record<SessionKind, number> = { FP1: 1, FP2: 1, FP3: 1, SPRINT_QUALIFYING: 1, SPRINT: 1, QUALIFYING: 1, RACE: 2 };

function useQueryParam(name: string) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const set = (value: string) => {
    const p = new URLSearchParams(params);
    p.set(name, value);
    router.replace(`${pathname}?${p}`, { scroll: false });
  };
  return [params.get(name), set] as const;
}

/** Radar, forecast map, conditions and per-session forecast for one Grand Prix weekend. */
export function RaceWeather({ race, now }: { race: GrandPrix; now: number }) {
  const forecast = useForecast(race.circuit.id);
  const grid = useCloudGrid(race.circuit.id);
  const radar = useRadar();
  const { resolvedTheme } = useTheme();
  const [sessionParam, setSession] = useQueryParam("session");

  const upcoming = race.sessions.find((s) => scheduleState(s, now) !== "finished");
  const focus = race.sessions.find((s) => s.kind === sessionParam) ?? upcoming ?? race.sessions.at(-1)!;

  const [layers, setLayers] = useState<WeatherLayer[]>(["radar", "cloud"]);
  const [cloudLevel, setCloudLevel] = useState<CloudLevel>("total");
  const [stepOverride, setStep] = useState<number | null>(null);
  const [radarIndex, setRadarIndex] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [opacity, setOpacity] = useState(0.7);

  const frames = radar.data?.data?.frames ?? [];
  const currentFrame = radarIndex ?? frames.length - 1;
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const id = setInterval(() => setRadarIndex((i) => ((i ?? frames.length - 1) + 1) % frames.length), 800);
    return () => clearInterval(id);
  }, [playing, frames.length]);

  const g = grid.data?.data ?? null;
  const focusStart = focus.start ? Date.parse(focus.start) : now;
  const defaultStep = g ? (nearestStep(g.time, focusStart) >= 0 ? nearestStep(g.time, focusStart) : nearestStep(g.time, now)) : -1;
  const step = stepOverride ?? defaultStep;

  const windowFrom = focusStart - 6 * 3_600_000;
  const windowTo = focusStart + (SESSION_HOURS[focus.kind] + 6) * 3_600_000;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Around the circuit</CardTitle>
          <CardDescription>
            Observed radar from the last ~2 hours and forecast cloud/wind on a ~28 km grid. Not satellite imagery; no radar forecast is available.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <WeatherLayerSelector layers={layers} onLayers={setLayers} cloudLevel={cloudLevel} onCloudLevel={setCloudLevel} />
          {resolvedTheme && (
            <WeatherMap
              center={{ lat: race.circuit.lat, lon: race.circuit.lon }}
              label={race.circuit.name}
              dark={resolvedTheme !== "light"}
              layers={layers}
              grid={g}
              step={step}
              cloudLevel={cloudLevel}
              radar={radar.data?.data ?? null}
              radarIndex={currentFrame}
              radarOpacity={opacity}
            />
          )}
          {layers.includes("radar") && (
            <div className="space-y-2">
              {radar.isError ? (
                <ErrorState error={radar.error} onRetry={() => radar.refetch()} />
              ) : (
                <RadarPlaybackControls
                  frames={frames}
                  index={currentFrame}
                  playing={playing}
                  opacity={opacity}
                  now={now}
                  onIndex={setRadarIndex}
                  onPlaying={setPlaying}
                  onOpacity={setOpacity}
                />
              )}
              <RadarLegend />
              <p className="text-xs text-muted-foreground">
                Radar coverage depends on national networks; an empty map can mean no precipitation or no coverage. Data:{" "}
                <a href="https://www.rainviewer.com/" target="_blank" rel="noreferrer" className="underline">RainViewer</a> (personal/educational use).
              </p>
            </div>
          )}
          {(layers.includes("cloud") || layers.includes("wind")) && (
            <div className="space-y-2">
              {grid.isError ? (
                <ErrorState error={grid.error} onRetry={() => grid.refetch()} />
              ) : g && step >= 0 ? (
                <label className="flex flex-wrap items-center gap-3 text-xs">
                  <span>
                    Forecast for <span className="font-mono tabular-nums">{formatHour(g.time[step]!)}</span>
                    <span className="text-muted-foreground"> (3-hourly, next 7 days)</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={g.time.length - 1}
                    value={step}
                    onChange={(e) => setStep(Number(e.target.value))}
                    aria-label="Forecast time"
                    aria-valuetext={formatHour(g.time[step]!)}
                    className="min-w-48 flex-1 accent-foreground"
                  />
                </label>
              ) : (
                g === null && <Skeleton className="h-6 w-full" />
              )}
              {layers.includes("cloud") && <CloudLegend />}
              {grid.data && <SourceNote res={grid.data} />}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conditions</CardTitle>
          <CardDescription>Open-Meteo model forecast for the circuit</CardDescription>
        </CardHeader>
        <CardContent>
          <WeatherConditions race={race} />
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Session forecast</CardTitle>
          <CardDescription>
            Forecast at each session start and across its scheduled slot. Wet hours: ≥30% rain chance or ≥0.1 mm forecast.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <QueryState query={forecast}>
            {(f, res) => (
              <>
                <RaceWeatherSummary race={race} forecast={f} />
                <div className="space-y-3">
                  <ToggleGroup
                    value={[focus.kind]}
                    onValueChange={(v: string[]) => v[0] && setSession(v[0])}
                    aria-label="Session"
                    variant="outline"
                    size="sm"
                    className="flex-wrap"
                  >
                    {race.sessions.map((s) => (
                      <ToggleGroupItem key={s.kind} value={s.kind} className="text-[11px]">
                        {SESSION_LABEL[s.kind]}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <WeatherTimeline
                    hourly={f.hourly}
                    now={now}
                    window={{
                      from: windowFrom,
                      to: windowTo,
                      highlight: focus.start
                        ? { from: focusStart, to: focusStart + SESSION_HOURS[focus.kind] * 3_600_000, label: SESSION_LABEL[focus.kind] }
                        : undefined,
                    }}
                  />
                </div>
                <SourceNote res={res} />
              </>
            )}
          </QueryState>
        </CardContent>
      </Card>
    </div>
  );
}
