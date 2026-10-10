import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { ApiResponse, CloudGrid, RadarFrames, WeatherForecast } from "@pitwall/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { GRID_SIZE, gridPoints } from "../src/providers/openmeteo";
import { resetUpstreamState } from "../src/upstream";
import forecastFixture from "./fixtures/openmeteo-forecast-marina-bay.json";

let calls: URL[];
let routes: Record<string, (url: URL) => unknown>;

beforeEach(() => {
  resetUpstreamState();
  calls = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    calls.push(url);
    const handler = routes[url.host + url.pathname];
    return handler ? Response.json(handler(url)) : new Response("not mocked", { status: 500 });
  });
});
afterEach(() => vi.restoreAllMocks());

async function get<T>(path: string) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://api.test${path}`), env, ctx);
  await waitOnExecutionContext(ctx);
  return { status: res.status, body: (await res.json()) as ApiResponse<T> };
}

const circuitResponse = (id: string) => ({
  MRData: {
    total: "1", limit: "30", offset: "0",
    CircuitTable: { Circuits: [{ circuitId: id, circuitName: "Marina Bay Street Circuit", Location: { lat: "1.2914", long: "103.864", locality: "Marina Bay", country: "Singapore" } }] },
  },
});
const jolpicaCircuit = (url: URL) => circuitResponse(url.pathname.split("/").at(-1)!.replace(".json", ""));

describe("weather forecast", () => {
  it("normalizes Open-Meteo hourly + model 'current' for the circuit coordinates", async () => {
    routes = { "api.jolpi.ca/ergast/f1/circuits/marina_bay.json": jolpicaCircuit, "api.open-meteo.com/v1/forecast": () => forecastFixture };
    const { body } = await get<WeatherForecast>("/api/weather/forecast?circuit=marina_bay");
    expect(body).toMatchObject({ status: "ok", source: "open-meteo", maxAgeSeconds: 900 });
    const f = body.data!;
    expect(f).toMatchObject({ circuitId: "marina_bay", lat: 1.2914, lon: 103.864, modelLat: 1.3005272, modelLon: 103.862564, elevation: 7 });
    expect(f.current).toMatchObject({ time: "2026-10-10T19:00:00.000Z", temperature: 26, humidity: 95, weatherCode: 3 });
    expect(f.hourly.time).toHaveLength(384);
    expect(f.hourly.time[0]).toBe("2026-10-10T00:00:00.000Z");
    expect(f.hourly.precipitationProbability.slice(0, 3)).toEqual([8, 9, 13]);

    const om = calls.find((u) => u.host === "api.open-meteo.com")!;
    expect(om.searchParams.get("latitude")).toBe("1.2914");
    expect(om.searchParams.get("forecast_days")).toBe("16");
  });

  it("rejects a forecast whose columns don't line up", async () => {
    const broken = { ...forecastFixture, hourly: { ...forecastFixture.hourly, cloud_cover: [1, 2] } };
    routes = { "api.jolpi.ca/ergast/f1/circuits/broken_circuit.json": jolpicaCircuit, "api.open-meteo.com/v1/forecast": () => broken };
    const { status, body } = await get("/api/weather/forecast?circuit=broken_circuit");
    expect(status).toBe(503);
    expect(body.reason).toMatch(/cloud_cover has 2 values/);
  });

  it("requires a valid circuit id", async () => {
    expect((await get("/api/weather/forecast")).status).toBe(400);
    expect((await get("/api/weather/forecast?circuit=../x")).status).toBe(400);
  });
});

describe("cloud grid", () => {
  it("builds a symmetric grid centred on the circuit", () => {
    const pts = gridPoints(1.2914, 103.864);
    expect(pts).toHaveLength(GRID_SIZE * GRID_SIZE);
    expect(pts[0]).toEqual({ lat: 0.5414, lon: 103.114 });
    expect(pts[24]).toEqual({ lat: 1.2914, lon: 103.864 }); // centre
    expect(pts.at(-1)).toEqual({ lat: 2.0414, lon: 104.614 });
  });

  it("requests all points in one call and maps each model cell back to its requested point", async () => {
    routes = {
      "api.jolpi.ca/ergast/f1/circuits/grid_circuit.json": jolpicaCircuit,
      "api.open-meteo.com/v1/forecast": (url) => {
        const lats = url.searchParams.get("latitude")!.split(",").map(Number);
        const lons = url.searchParams.get("longitude")!.split(",").map(Number);
        return lats.map((lat, i) => ({
          latitude: lat + 0.01,
          longitude: lons[i]! - 0.01,
          hourly: {
            time: [1791590400, 1791601200],
            cloud_cover: [i, null], cloud_cover_low: [1, 1], cloud_cover_mid: [2, 2], cloud_cover_high: [3, 3],
            wind_speed_10m: [10, 11], wind_direction_10m: [180, 190], wind_gusts_10m: [20, 21],
          },
        }));
      },
    };
    const { body } = await get<CloudGrid>("/api/weather/cloud-grid?circuit=grid_circuit");
    expect(body.status).toBe("ok");
    expect(calls.filter((u) => u.host === "api.open-meteo.com")).toHaveLength(1);
    const g = body.data!;
    expect(g.time).toEqual(["2026-10-10T00:00:00.000Z", "2026-10-10T03:00:00.000Z"]);
    expect(g.cells[30]).toMatchObject({ lat: 1.5414, lon: 103.614, cloud: { total: [30, null] }, windDirection: [180, 190] });
    expect(g.cells[30]!.modelLat).toBeCloseTo(1.5514);
  });
});

describe("radar", () => {
  const maps = (host: string) => ({
    version: "2.0",
    host,
    radar: { past: [{ time: 1791649800, path: "/v2/radar/ef23656187b2" }], nowcast: [] },
    satellite: { infrared: [] },
  });

  it("returns observed frames with the free-tier limits", async () => {
    routes = { "api.rainviewer.com/public/weather-maps.json": () => maps("https://tilecache.rainviewer.com") };
    const { body } = await get<RadarFrames>("/api/weather/radar");
    expect(body.data).toEqual({
      host: "https://tilecache.rainviewer.com",
      frames: [{ time: "2026-10-10T16:30:00.000Z", path: "/v2/radar/ef23656187b2" }],
      maxZoom: 7,
      colorScheme: 2,
    });
  });
});

describe("radar host allow-list", () => {
  it("refuses tile hosts other than RainViewer's", async () => {
    // Separate describe: the radar payload is cached under one key, so this must not run after a cached success.
    await caches.default.delete(new Request("https://cache.pitwall.internal/weather/radar"));
    routes = {
      "api.rainviewer.com/public/weather-maps.json": () => ({
        host: "https://evil.example",
        radar: { past: [{ time: 1, path: "/v2/radar/ab" }] },
      }),
    };
    const { status, body } = await get("/api/weather/radar");
    expect(status).toBe(502);
    expect(body.status).toBe("error");
  });
});
