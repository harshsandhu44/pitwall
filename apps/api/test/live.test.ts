import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { ApiResponse, LiveStatus, LiveTimingSnapshot } from "@pitwall/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { resetUpstreamState } from "../src/upstream";
import f from "./fixtures/openf1-monaco-2024.json";
import { openf1Mock } from "./openf1-mock";

// The 2024 Monaco weekend, recorded. Its race (session 9523) ran 13:00–15:00 UTC on 26 May. Qualifying (9519)
// gets one synthetic clean lap by Leclerc, traced by 60 location samples, for the live map's outline.
const qualiLap = Date.parse("2024-05-25T14:40:00Z");
const openf1 = openf1Mock({
  sessions: f.sessions,
  meetings: f.meetings,
  drivers: f.drivers,
  laps: [...f.laps, { session_key: 9519, driver_number: 16, lap_number: 2, date_start: new Date(qualiLap).toISOString(), lap_duration: 70.27, is_pit_out_lap: false }],
  location: [
    ...Array.from({ length: 60 }, (_, i) => ({ session_key: 9519, driver_number: 16, date: new Date(qualiLap + i * 1100).toISOString(), x: i, y: -i, z: 600 })),
    { session_key: 9523, driver_number: 1, date: "2024-05-26T14:00:40.000Z", x: -700, y: -1000, z: 650 },
  ],
  stints: f.stints,
  pit: f.pit,
  race_control: f.race_control,
  position: f.position,
  intervals: f.window_intervals,
  weather: f.weather,
});

/**
 * A fake OpenF1 MQTT broker on the other end of a WebSocketPair. Its socket belongs to the Durable Object
 * that opened it, so it can't be driven from the test: messages are queued and sent right after SUBACK.
 */
const broker = { connects: 0, refuse: false, subscribed: false, publish: [] as Uint8Array[] };

function brokerResponse() {
  const { 0: client, 1: server } = new WebSocketPair();
  server.accept();
  server.addEventListener("message", async (e) => {
    const b = new Uint8Array(typeof e.data === "string" ? new TextEncoder().encode(e.data) : e.data instanceof ArrayBuffer ? e.data : await (e.data as Blob).arrayBuffer());
    if (b[0]! >> 4 === 1) server.send(new Uint8Array([0x20, 2, 0, broker.refuse ? 5 : 0])); // CONNECT → CONNACK
    if (b[0]! >> 4 === 8) {
      server.send(new Uint8Array([0x90, 3, 0, 1, 0])); // SUBSCRIBE → SUBACK
      broker.subscribed = true;
      for (const m of broker.publish) server.send(m);
    }
  });
  broker.connects++;
  return new Response(null, { status: 101, webSocket: client });
}

function publishPacket(topic: string, row: unknown) {
  const t = new TextEncoder().encode(topic);
  const body = [t.length >> 8, t.length & 0xff, ...t, ...new TextEncoder().encode(JSON.stringify(row))];
  const len: number[] = [];
  for (let n = body.length; ; ) {
    const byte = n % 128;
    n = Math.floor(n / 128);
    len.push(n > 0 ? byte | 0x80 : byte);
    if (!n) break;
  }
  return new Uint8Array([0x30, ...len, ...body]);
}

let calls: URL[];

beforeEach(() => {
  resetUpstreamState({ paced: false });
  calls = [];
  broker.connects = 0;
  broker.refuse = false;
  broker.subscribed = false;
  broker.publish = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push(url);
    if (url.hostname === "mqtt.openf1.org") return brokerResponse();
    if (url.pathname === "/token") return Response.json({ access_token: "t0k3n", expires_in: 3600 });
    return openf1(url);
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function get<T>(path: string) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://api.test${path}`), env, ctx);
  await waitOnExecutionContext(ctx);
  return { status: res.status, body: (await res.json()) as ApiResponse<T> };
}

const at = (iso: string) => vi.useFakeTimers({ toFake: ["Date"], now: Date.parse(iso) });

describe("live", () => {
  it("is unavailable outside every session window, with the latest replay, without connecting", async () => {
    at("2024-05-26T18:00:00Z");
    const { status, body } = await get<LiveStatus>("/api/live/session");
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ state: "UNAVAILABLE", reason: "no_session", latestReplay: { key: 9523 } });
    expect(broker.connects).toBe(0);
  });

  it("streams a session: starts from REST, then applies MQTT messages for that session only", async () => {
    at("2024-05-26T14:00:45Z");
    // Arrive while the session is still loading from REST: held, then applied.
    broker.publish = [
      publishPacket("v1/intervals", { session_key: 9523, driver_number: 1, date: "2024-05-26T14:00:44.000Z", gap_to_leader: 1.234, interval: 1.234 }),
      publishPacket("v1/intervals", { session_key: 1, driver_number: 44, date: "2024-05-26T14:00:44.000Z", gap_to_leader: 99, interval: 99 }),
      publishPacket("v1/location", { session_key: 9523, driver_number: 44, date: "2024-05-26T14:00:30.000Z", x: 5, y: 5, z: 650 }), // > 10 s old: dropped
      publishPacket("v1/location", { session_key: 9523, driver_number: 16, date: "2024-05-26T14:00:44.500Z", x: -710, y: -990, z: 650 }),
      publishPacket("v1/weather", { session_key: 9523, date: "2024-05-26T14:00:42.000Z", air_temperature: 24.5, track_temperature: 51, humidity: 60, wind_speed: 1.5, wind_direction: 90, rainfall: 1 }),
    ];
    const live = (await get<LiveStatus>("/api/live/session")).body.data!;
    expect(live).toMatchObject({ state: "LIVE", session: { key: 9523, meetingName: "Monaco Grand Prix", name: "Race" } });
    if (live.state !== "LIVE") return;
    expect(live.timing.rows.map((r) => r.driver).sort()).toEqual([1, 16, 44]);
    expect(live.timing.drivers.find((d) => d.number === 16)).toMatchObject({ acronym: "LEC", driverId: "leclerc" });
    expect(live.timing.rows.find((r) => r.driver === 1)).toMatchObject({ gap: 1.234 });
    expect(live.timing.rows.find((r) => r.driver === 44)?.gap).not.toBe(99); // another session's message
    expect(broker).toMatchObject({ connects: 1, subscribed: true });
    // The map gets the last 10 s of locations, ending at the newest, and qualifying's outline.
    const p = live.timing.positions;
    expect(p.to).toBe(Date.parse("2024-05-26T14:00:44.500Z"));
    expect(p.cars).toEqual({ 1: { t: [p.to - p.from - 4_500], x: [-700], y: [-1000] }, 16: { t: [p.to - p.from], x: [-710], y: [-990] } });
    expect(live.timing.track).toMatchObject({ driver: 16, lap: 2 });
    expect(live.timing.track!.x).toHaveLength(60);
    // Only the newest weather observation: the MQTT one, newer than everything loaded from REST.
    expect(live.timing.weather).toEqual([
      { t: Date.parse("2024-05-26T14:00:42Z"), air: 24.5, track: 51, humidity: 60, windSpeed: 1.5, windDirection: 90, rainfall: true },
    ]);
    expect(calls.some((u) => u.pathname === "/v1/weather" && u.searchParams.get("session_key") === "9523")).toBe(true);
    expect(calls.some((u) => u.pathname === "/v1/laps" && u.searchParams.get("session_key") === "9523")).toBe(true);

    const timing = await get<LiveTimingSnapshot>("/api/live/timing");
    expect(timing.status).toBe(200);
    expect(timing.body).toMatchObject({ status: "ok", source: "openf1", data: { session: { key: 9523, type: "Race" } } });
    expect(broker.connects).toBe(1); // one shared connection
  });

  it("shows DELAYED once the newest data is older than 15 s", async () => {
    at("2024-05-26T15:29:00Z"); // inside the window (ends 15:30); the newest recorded row is from 15:25:25
    const live = (await get<LiveStatus>("/api/live/session")).body.data!;
    expect(live.state).toBe("DELAYED");
    if (live.state === "DELAYED") expect(live.delaySeconds).toBeGreaterThan(15);
  });

  it("reports the feed as unavailable when OpenF1 refuses the login, and backs off", async () => {
    at("2024-05-25T14:30:00Z"); // qualifying: a different session, so the feed restarts
    broker.refuse = true;
    const { body } = await get<LiveStatus>("/api/live/session");
    expect(body.data).toMatchObject({ state: "UNAVAILABLE", reason: "feed_unavailable", detail: expect.stringMatching(/refused the login/) });
    await get<LiveStatus>("/api/live/session");
    expect(broker.connects).toBe(1);
    expect((await get("/api/live/timing")).status).toBe(503);
  });

});
