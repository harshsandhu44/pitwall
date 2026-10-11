import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type {
  ApiResponse,
  ConstructorStanding,
  DriverProfile,
  DriverStanding,
  GrandPrix,
  PointsProgression,
  RaceWeekendResults,
  SeasonResults,
  Standings,
} from "@pitwall/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { resetUpstreamState } from "../src/upstream";
import f from "./fixtures/openf1-2025-two-rounds.json";
import { openf1Mock } from "./openf1-mock";

// Real OpenF1 data for the first two rounds of 2025: Australia, then China with a sprint.
const openf1 = openf1Mock(f);
let calls: URL[];

beforeEach(() => {
  resetUpstreamState({ paced: false });
  calls = [];
  // The week after the Chinese GP.
  vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2025-03-30T00:00:00Z") });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push(url);
    if (url.pathname === "/token") return Response.json({ access_token: "t0k3n", expires_in: "3600" });
    if (url.host !== "api.openf1.org") return new Response("not mocked", { status: 500 });
    lastAuth = new Headers(init?.headers).get("Authorization");
    return openf1(url);
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
let lastAuth: string | null = null;

async function get<T>(path: string, e: Env = env) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://api.test${path}`), e, ctx);
  await waitOnExecutionContext(ctx);
  return { status: res.status, body: (await res.json()) as ApiResponse<T> };
}

const ids = (entries: { driver: { id: string } }[]) => entries.map((e) => e.driver.id);

describe("OpenF1 seasons", () => {
  it("builds the calendar from OpenF1 meetings, leaving out testing", async () => {
    const { body } = await get<GrandPrix[]>("/api/calendar?season=2025");
    expect(body).toMatchObject({ status: "ok", source: "openf1" });
    expect(body.data!.map((r) => [r.round, r.name, r.circuit.id])).toEqual([
      [1, "Australian Grand Prix", "albert_park"],
      [2, "Chinese Grand Prix", "shanghai"],
    ]);
    expect(body.data![1]!.sessions.map((s) => s.kind)).toEqual(["FP1", "SPRINT_QUALIFYING", "SPRINT", "QUALIFYING", "RACE"]);
    expect(body.data![0]!.circuit).toMatchObject({ timezone: "Australia/Melbourne", layout: { id: "melbourne-2" } });
    expect(calls.every((u) => u.host === "api.openf1.org")).toBe(true);
  });

  it("derives driver standings, counting race wins only", async () => {
    const { body } = await get<Standings<DriverStanding>>("/api/standings/drivers?season=2025");
    const s = body.data!;
    expect(s.round).toBe(2);
    expect(s.entries.slice(0, 4).map((e) => [e.driver.id, e.points, e.wins])).toEqual([
      ["norris", 44, 1],
      ["max_verstappen", 36, 0],
      ["russell", 35, 0],
      ["piastri", 34, 1],
    ]);
    // Hamilton won the sprint: not a win.
    expect(s.entries.find((e) => e.driver.id === "hamilton")).toMatchObject({ wins: 0, constructors: [{ id: "ferrari" }] });
    // Season-wide queries ask for the two races only.
    const drivers = calls.find((u) => u.pathname === "/v1/drivers")!;
    expect(drivers.searchParams.getAll("session_key")).toEqual(["9693", "9998"]);
  });

  it("serves standings after an earlier round and after a sprint", async () => {
    const r1 = (await get<Standings<DriverStanding>>("/api/standings/drivers?season=2025&round=1")).body.data!;
    expect(r1.entries[0]).toMatchObject({ driver: { id: "norris" }, points: 25, wins: 1 });
  });

  it("derives constructor standings with their race wins", async () => {
    const { body } = await get<Standings<ConstructorStanding>>("/api/standings/constructors?season=2025");
    expect(body.data!.entries.slice(0, 3).map((e) => [e.constructor.id, e.points, e.wins])).toEqual([
      ["mclaren", 78, 2],
      ["mercedes", 53, 0],
      ["red_bull", 36, 0],
    ]);
  });

  it("builds the points progression from the one championship unit", async () => {
    const { body } = await get<PointsProgression>("/api/standings/progression?season=2025&type=drivers");
    expect(body.source).toBe("openf1");
    expect(body.data!.rounds.map((r) => r.name)).toEqual(["Australian Grand Prix", "Chinese Grand Prix"]);
    expect(body.data!.drivers.find((d) => d.driver.id === "norris")!.points).toEqual([25, 44]);
    // No per-round requests (the unit may already be cached by earlier tests).
    expect(calls.filter((u) => u.pathname === "/v1/championship_drivers").length).toBeLessThanOrEqual(1);
  });

  it("builds the season results matrix with Jolpica-style unclassified codes", async () => {
    const { body } = await get<SeasonResults>("/api/results?season=2025");
    const china = body.data!.races[1]!;
    expect(china.results[0]).toMatchObject({ position: 1, driver: { id: "piastri" }, constructor: { id: "mclaren" }, points: 25 });
    expect(china.results.filter((r) => r.positionText === "D").map((r) => r.driver.id).sort()).toEqual(["gasly", "hamilton", "leclerc"]);
  });

  it("fills a race weekend with each session and the right grid for each race", async () => {
    const { body } = await get<RaceWeekendResults>("/api/races/2?season=2025");
    const w = body.data!;
    expect(body.source).toBe("openf1");
    expect(w.results[0]).toMatchObject({ driver: { id: "piastri" }, grid: 1 });
    expect(w.sprint[0]).toMatchObject({ driver: { id: "hamilton" }, grid: 1 });
    expect(ids(w.qualifying).slice(0, 2)).toEqual(["piastri", "russell"]);
    expect(ids(w.sprintQualifying)[0]).toBe("hamilton");
    expect(calls.filter((u) => u.searchParams.get("meeting_key") === "1255").map((u) => u.pathname).sort()).toEqual([
      "/v1/drivers",
      "/v1/session_result",
      "/v1/starting_grid",
    ]);
  });

  it("takes team colours from the latest race", async () => {
    const { body } = await get<Record<string, string>>("/api/team-colours?season=2025");
    expect(body.data).toMatchObject({ mclaren: "#FF8000", ferrari: "#E80020" });
  });

  it("builds a driver profile from the map and OpenF1 without Jolpica", async () => {
    const { body } = await get<DriverProfile>("/api/drivers/piastri");
    expect(body.data!.driver).toMatchObject({ id: "piastri", code: "PIA", nationality: "Australian" });
    expect(body.data!.seasons).toEqual([2026, 2025, 2024, 2023]);
    // Only 2025 is in the fixture; the other seasons have no standings yet.
    expect(body.data!.career).toEqual([expect.objectContaining({ season: 2025, points: 34, wins: 1 })]);
    expect(calls.some((u) => u.host === "api.jolpi.ca")).toBe(false);
  });
});

// Cached units outlive a test, so each test asks for a season (with no fixture data) nothing has cached yet.
describe("OpenF1 login", () => {
  const withLogin = env; // the test pool sets a dummy login

  it("logs in once and sends the token on every OpenF1 request", async () => {
    await get("/api/calendar?season=2027", withLogin);
    await get("/api/replay/1", withLogin);
    expect(calls.filter((u) => u.host === "api.openf1.org").length).toBeGreaterThan(2);
    expect(calls.filter((u) => u.pathname === "/token")).toHaveLength(1);
    expect(lastAuth).toBe("Bearer t0k3n");
  });

  it("falls back to the free tier when the login fails", async () => {
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      calls.push(url);
      if (url.pathname === "/token") return new Response("bad credentials", { status: 401 });
      lastAuth = new Headers(init?.headers).get("Authorization");
      return openf1(url);
    });
    const { body } = await get<GrandPrix[]>("/api/calendar?season=2028", withLogin);
    expect(body.status).toBe("ok");
    expect(calls.some((u) => u.host === "api.openf1.org")).toBe(true);
    expect(lastAuth).toBeNull();
  });

  it("uses the free tier without a login", async () => {
    await get("/api/calendar?season=2029", { ...env, OPENF1_USERNAME: "", OPENF1_PASSWORD: "" });
    expect(calls.some((u) => u.host === "api.openf1.org")).toBe(true);
    expect(calls.some((u) => u.pathname === "/token")).toBe(false);
    expect(lastAuth).toBeNull();
  });
});
