import type { CloudGrid, CloudLevel, GrandPrix, WeatherForecast } from "@pitwall/shared";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { RaceWeatherSummary } from "@/components/weather/race-weather-summary";
import { RadarPlaybackControls } from "@/components/weather/radar-playback-controls";
import { type WeatherLayer, WeatherLayerSelector } from "@/components/weather/weather-layer-selector";
import { cloudFeatures, nearestStep, windFeatures } from "@/lib/weather-geo";

const frames = ["2026-10-10T16:30:00Z", "2026-10-10T16:40:00Z", "2026-10-10T16:50:00Z"].map((time) => ({ time }));

function Radar({ onIndex = vi.fn(), onPlaying = vi.fn() }) {
  const [index, setIndex] = useState(2);
  const [playing, setPlaying] = useState(false);
  return (
    <RadarPlaybackControls
      frames={frames}
      index={index}
      playing={playing}
      opacity={0.7}
      now={Date.parse("2026-10-10T17:00:00Z")}
      onIndex={(i) => (onIndex(i), setIndex(i))}
      onPlaying={(p) => (onPlaying(p), setPlaying(p))}
      onOpacity={() => {}}
    />
  );
}

describe("radar timeline", () => {
  it("starts on the latest observed frame and labels its age", () => {
    render(<Radar />);
    expect(screen.getByText(/latest/)).toBeInTheDocument();
    expect(screen.getByText(/10 min ago/)).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Radar frame" })).toHaveValue("2");
  });

  it("toggles play/pause and seeking pauses playback", async () => {
    const onPlaying = vi.fn();
    const onIndex = vi.fn();
    render(<Radar onPlaying={onPlaying} onIndex={onIndex} />);
    await userEvent.click(screen.getByRole("button", { name: "Play radar" }));
    expect(screen.getByRole("button", { name: "Pause radar" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.change(screen.getByRole("slider", { name: "Radar frame" }), { target: { value: "0" } });
    expect(onIndex).toHaveBeenLastCalledWith(0);
    expect(onPlaying).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole("button", { name: "Play radar" })).toBeInTheDocument();
    expect(screen.queryByText(/latest/)).not.toBeInTheDocument();
  });

  it("says so when there are no frames", () => {
    render(<RadarPlaybackControls frames={[]} index={0} playing={false} opacity={1} now={0} onIndex={vi.fn()} onPlaying={vi.fn()} onOpacity={vi.fn()} />);
    expect(screen.getByText(/No radar frames/)).toBeInTheDocument();
  });
});

describe("layer selector", () => {
  function Layers() {
    const [layers, setLayers] = useState<WeatherLayer[]>(["radar", "cloud"]);
    const [level, setLevel] = useState<CloudLevel>("total");
    return (
      <>
        <WeatherLayerSelector layers={layers} onLayers={setLayers} cloudLevel={level} onCloudLevel={setLevel} />
        <output>{`${layers.join(",")}|${level}`}</output>
      </>
    );
  }

  it("switches layers and cloud level; level choice only shows with the cloud layer", async () => {
    render(<Layers />);
    const group = screen.getByRole("group", { name: "Map layers" });
    await userEvent.click(within(group).getByRole("button", { name: "Wind (forecast)" }));
    expect(screen.getByRole("status")).toHaveTextContent("radar,cloud,wind|total");

    await userEvent.click(within(screen.getByRole("group", { name: "Cloud level" })).getByRole("button", { name: "low" }));
    expect(screen.getByRole("status")).toHaveTextContent("|low");

    await userEvent.click(within(group).getByRole("button", { name: "Cloud (forecast)" }));
    expect(screen.queryByRole("group", { name: "Cloud level" })).not.toBeInTheDocument();
  });
});

const grid: CloudGrid = {
  circuitId: "x",
  center: { lat: 1, lon: 100 },
  spacingDeg: 0.25,
  time: ["2026-10-10T00:00:00.000Z", "2026-10-10T03:00:00.000Z"],
  cells: [
    { lat: 1, lon: 100, modelLat: 1, modelLon: 100, cloud: { total: [85, null], low: [0, 0], mid: [0, 0], high: [0, 0] }, windSpeed: [12, 0.4], windDirection: [270, 90], windGusts: [20, 2] },
  ],
};

describe("map features", () => {
  it("draws one banded block per cell and leaves unknown cells empty", () => {
    const f = cloudFeatures(grid, 0, "total");
    expect(f.features).toHaveLength(1);
    expect(f.features[0]!.properties).toEqual({ band: 5, pct: 85 });
    expect(f.features[0]!.geometry.coordinates[0]![0]).toEqual([99.875, 0.875]);
    expect(cloudFeatures(grid, 1, "total").features).toHaveLength(0);
  });

  it("points wind arrows downwind and skips calm cells", () => {
    expect(windFeatures(grid, 0).features[0]!.properties).toEqual({ speed: 12, rot: 90, label: "12 W" });
    expect(windFeatures(grid, 1).features).toHaveLength(0);
  });

  it("finds the nearest forecast step only inside the grid's range", () => {
    expect(nearestStep(grid.time, Date.parse("2026-10-10T02:00:00Z"))).toBe(1);
    expect(nearestStep(grid.time, Date.parse("2026-10-11T00:00:00Z"))).toBe(-1);
  });
});

describe("session weather summary", () => {
  it("never shows forecasts for sessions that already finished", () => {
    vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-10-10T20:00:00Z") });
    const race = {
      name: "Test GP",
      sessions: [
        { kind: "QUALIFYING", date: "2026-10-10", start: "2026-10-10T12:00:00Z" },
        { kind: "RACE", date: "2026-10-10", start: "2026-10-10T21:00:00Z" },
      ],
    } as unknown as GrandPrix;
    const hours = Array.from({ length: 30 }, (_, i) => new Date(Date.parse("2026-10-10T00:00:00Z") + i * 3_600_000).toISOString());
    const col = (v: number) => hours.map(() => v);
    const forecast = {
      hourly: {
        time: hours, temperature: col(25), apparentTemperature: col(27), humidity: col(70), precipitation: col(0), precipitationProbability: col(5),
        windSpeed: col(8), windDirection: col(180), windGusts: col(15), cloudCover: col(40), cloudLow: col(10), cloudMid: col(10), cloudHigh: col(20), weatherCode: col(2),
      },
    } as unknown as WeatherForecast;
    render(<RaceWeatherSummary race={race} forecast={forecast} />);
    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Session has finished");
    expect(rows[2]).toHaveTextContent("25°C · Partly cloudy");
    vi.useRealTimers();
  });
});
