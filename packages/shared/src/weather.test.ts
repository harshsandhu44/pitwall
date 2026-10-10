import { describe, expect, it } from "vitest";
import type { HourlySeries } from "./types";
import { cloudBand, compass, sessionWeather, weatherLabel } from "./weather";

const series = (hours: number, start = Date.parse("2026-10-11T10:00:00Z")): HourlySeries => {
  const col = (f: (i: number) => number | null) => Array.from({ length: hours }, (_, i) => f(i));
  return {
    time: col((i) => i).map((i) => new Date(start + i! * 3_600_000).toISOString()),
    temperature: col((i) => 28 + i),
    apparentTemperature: col((i) => 33 + i),
    humidity: col(() => 80),
    precipitation: col((i) => (i === 3 ? 0.4 : 0)),
    precipitationProbability: col((i) => (i === 2 ? 45 : i === 3 ? null : 10)),
    windSpeed: col((i) => 10 + i),
    windDirection: col(() => 270),
    windGusts: col((i) => 20 + i),
    cloudCover: col(() => 50),
    cloudLow: col(() => 10),
    cloudMid: col(() => 20),
    cloudHigh: col(() => 30),
    weatherCode: col(() => 3),
  };
};

describe("sessionWeather", () => {
  it("summarises the hours covering a race window", () => {
    const w = sessionWeather(series(8), { kind: "RACE", date: "2026-10-11", start: "2026-10-11T12:30:00Z" })!;
    expect(w.atStart!.time).toBe("2026-10-11T12:00:00.000Z");
    expect(w.atStart!.temperature).toBe(30);
    expect(w.hours).toBe(2);
    expect(w.temperatureRange).toEqual([30, 32]);
    expect(w.maxPrecipitationProbability).toBe(45); // nulls ignored, not treated as 0
    expect(w.totalPrecipitation).toBe(0.4);
    expect(w.maxGusts).toBe(24);
    expect(w.wetHours).toEqual(["2026-10-11T12:00:00.000Z", "2026-10-11T13:00:00.000Z"]);
  });

  it("returns null when the forecast does not reach the session or the time is unknown", () => {
    const h = series(8);
    expect(sessionWeather(h, { kind: "RACE", date: "2026-10-11", start: "2026-10-11T16:30:00Z" })).toBeNull();
    expect(sessionWeather(h, { kind: "RACE", date: "2026-10-11", start: "2026-10-11T08:00:00Z" })).toBeNull();
    expect(sessionWeather(h, { kind: "RACE", date: "2026-10-11", start: null })).toBeNull();
  });
});

describe("cloudBand", () => {
  it("bins into 20% bands and keeps unknowns unknown", () => {
    expect([0, 4, 5, 20, 21, 60, 99, 100, 140].map(cloudBand)).toEqual([0, 0, 1, 1, 2, 3, 5, 5, 5]);
    expect(cloudBand(null)).toBeNull();
  });
});

describe("labels", () => {
  it("maps WMO codes and compass points", () => {
    expect(weatherLabel(63)).toBe("Moderate rain");
    expect(weatherLabel(null)).toBe("Unknown");
    expect(weatherLabel(42)).toBe("Code 42");
    expect([0, 22, 90, 181, 359, -90].map(compass)).toEqual(["N", "NNE", "E", "S", "N", "W"]);
  });
});
