import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { ApiResponse, PositionWindow, ReplaySession, SessionReplay } from "@pitwall/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { nextSlot, resetUpstreamState } from "../src/upstream";
import f from "./fixtures/openf1-monaco-2024.json";

let calls: URL[];
const jolpicaStandings = {
  MRData: {
    total: "3", limit: "100", offset: "0",
    StandingsTable: {
      season: "2024",
      StandingsLists: [
        {
          season: "2024", round: "24",
          DriverStandings: [
            { position: "1", positionText: "1", points: "437", wins: "9", Driver: { driverId: "max_verstappen", code: "VER", permanentNumber: "33", givenName: "Max", familyName: "Verstappen" }, Constructors: [{ constructorId: "red_bull", name: "Red Bull" }] },
            { position: "3", positionText: "3", points: "356", wins: "3", Driver: { driverId: "leclerc", code: "LEC", permanentNumber: "16", givenName: "Charles", familyName: "Leclerc" }, Constructors: [{ constructorId: "ferrari", name: "Ferrari" }] },
            { position: "7", positionText: "7", points: "223", wins: "2", Driver: { driverId: "hamilton", code: "HAM", permanentNumber: "44", givenName: "Lewis", familyName: "Hamilton" }, Constructors: [{ constructorId: "mercedes", name: "Mercedes" }] },
          ],
        },
      ],
    },
  },
};

// 60 synthetic samples around Hamilton's lap 63 plus one "no fix" row that must be dropped.
const lapStart = Date.parse("2024-05-26T15:06:33.731Z");
const outline = [
  ...Array.from({ length: 60 }, (_, i) => ({ date: new Date(lapStart + i * 1200).toISOString(), session_key: 9523, driver_number: 44, x: i, y: 2 * i, z: 600 })),
  { date: new Date(lapStart + 500).toISOString(), session_key: 9523, driver_number: 44, x: 0, y: 0, z: 0 },
];

function openf1(url: URL): unknown {
  const p = url.searchParams;
  const ep = url.pathname.replace("/v1/", "");
  if (ep === "sessions") return p.has("session_key") ? f.sessions.filter((s) => String(s.session_key) === p.get("session_key")) : f.sessions;
  if (ep === "meetings") return f.meetings;
  if (ep === "location") return p.has("driver_number") ? outline : [...f.window_location, { ...f.window_location[0]!, x: 0, y: 0, z: 0 }];
  if (ep === "intervals") return [...f.window_intervals, { date: "2024-05-26T14:00:30.000+00:00", session_key: 9523, driver_number: 77, gap_to_leader: "+1 LAP", interval: 3.049 }];
  return (f as Record<string, unknown>)[ep];
}

beforeEach(() => {
  resetUpstreamState({ paced: false });
  calls = [];
  vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2024-06-01T00:00:00Z") });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    calls.push(url);
    if (url.host === "api.jolpi.ca") return Response.json(jolpicaStandings);
    const body = openf1(url);
    return body === undefined ? new Response("not mocked", { status: 500 }) : Response.json(body);
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

describe("replay sessions", () => {
  it("lists finished sessions named after their meeting", async () => {
    const { body } = await get<ReplaySession[]>("/api/replay/sessions?season=2024");
    expect(body.data!.map((s) => s.name)).toEqual(["Practice 1", "Practice 2", "Practice 3", "Qualifying", "Race"]);
    expect(body.data!.at(-1)).toMatchObject({ key: 9523, meetingName: "Monaco Grand Prix", type: "Race", start: "2024-05-26T13:00:00.000Z" });
  });

  it("refuses seasons before OpenF1's history without calling it", async () => {
    const { status, body } = await get("/api/replay/sessions?season=2022");
    expect(status).toBe(404);
    expect(body.reason).toMatch(/start in 2023/);
    expect(calls).toHaveLength(0);
  });
});

describe("session replay", () => {
  it("normalizes drivers, laps, stints and traces the track from the fastest clean lap", async () => {
    const { body } = await get<SessionReplay>("/api/replay/9523");
    const r = body.data!;
    expect(r.drivers.map((d) => [d.acronym, d.driverId, d.colour])).toEqual([
      ["VER", "max_verstappen", "#3671C6"],
      ["LEC", "leclerc", "#E80020"],
      ["HAM", "hamilton", "#27F4D2"],
    ]);
    expect(r.laps[44]!.map((l) => l.lap).slice(0, 4)).toEqual([1, 2, 3, 62]);
    expect(r.laps[44]![1]).toMatchObject({ duration: 152.812, pitOut: true });
    expect(r.track).toMatchObject({ driver: 44, lap: 63 });
    expect(r.track!.x).toHaveLength(60); // the (0,0,0) row is dropped
    expect(r.range.start).toBe(Date.parse("2024-05-26T13:00:00Z"));
    expect(r.range.end).toBeGreaterThan(Date.parse("2024-05-26T15:00:00Z")); // the race ran past its slot
    expect(r.positions.map((p) => p.t)).toEqual([...r.positions.map((p) => p.t)].sort((a, b) => a - b));
    const track = calls.find((u) => u.pathname === "/v1/location")!;
    expect(track.search).toContain("driver_number=44");
    expect(track.search).toContain("date%3E=2024-05-26T15:06:33.731Z");
  });
});

describe("position windows", () => {
  const from = Date.parse("2024-05-26T14:00:00Z");

  it("compacts recorded samples with a one-second overlap and keeps race intervals", async () => {
    const { body } = await get<PositionWindow>(`/api/replay/9523/window?from=${from}`);
    const w = body.data!;
    expect(w.cars[1]!.t[0]).toBe(150); // 14:00:00.150 relative to the window
    expect(w.cars[1]!.x.length).toBe(6); // the injected (0,0,0) sample is gone
    expect(w.cars[16]!.t).toHaveLength(4);
    expect(w.intervals[77]).toEqual({ t: [30_000], gap: ["+1 LAP"], interval: [3.049] });
    const loc = calls.find((u) => u.pathname === "/v1/location" && !u.searchParams.has("driver_number"))!;
    expect(loc.search).toContain("date%3E=2024-05-26T13:59:59.000Z&date%3C2024-05-26T14:01:01.000Z");
  });

  it("only accepts aligned windows inside the session", async () => {
    expect((await get(`/api/replay/9523/window?from=${from + 1}`)).status).toBe(400);
    expect((await get(`/api/replay/9523/window?from=${from - 86_400_000}`)).status).toBe(400);
  });

  it("returns an empty window (not an error) when OpenF1 has no samples", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.host === "api.jolpi.ca") return Response.json(jolpicaStandings);
      if (url.pathname === "/v1/location" && !url.searchParams.has("driver_number")) return Response.json({ detail: "No results found." }, { status: 404 });
      if (url.pathname === "/v1/intervals") return Response.json({ detail: "No results found." }, { status: 404 });
      return Response.json(openf1(url));
    });
    const { status, body } = await get<PositionWindow>(`/api/replay/9523/window?from=${from - 60_000}`);
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ cars: {}, intervals: {} });
  });
});

describe("team colours", () => {
  it("maps OpenF1 colours to Jolpica constructors through the drivers", async () => {
    const { body } = await get<Record<string, string>>("/api/team-colours?season=2024");
    expect(body.data).toEqual({ red_bull: "#3671C6", ferrari: "#E80020", mercedes: "#27F4D2" });
  });

  it("is empty before 2023 without calling OpenF1", async () => {
    const { body } = await get<Record<string, string>>("/api/team-colours?season=2019");
    expect(body.data).toEqual({});
    expect(calls.filter((u) => u.host === "api.openf1.org")).toHaveLength(0);
  });
});

describe("OpenF1 request budget", () => {
  it("spaces requests and holds the 31st request in a minute until the first one is 60 s old", () => {
    expect(nextSlot(1000, 1350, [])).toBe(1350);
    const recent = Array.from({ length: 30 }, (_, i) => 10_000 + i * 350);
    expect(nextSlot(20_500, 20_500, recent, 30)).toBe(70_000);
    expect(nextSlot(20_500, 20_500, recent.slice(1), 30)).toBe(20_500);
  });
});
