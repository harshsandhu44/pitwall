import type { GrandPrix, LiveStatus } from "@pitwall/shared";
import { screen } from "expo-router/testing-library";
import Home from "@/app/(tabs)/index";
import Live from "@/app/(tabs)/live";
import Standings from "@/app/(tabs)/standings";
import { constructorStandings, driverStandings } from "../../app/test/fixtures";
import { envelope, mockApi, renderScreen } from "./utils";

// Relative to now, so "next" and "starts in" stay true whenever this runs.
const day = 86_400_000;
const at = (ms: number) => new Date(Date.now() + ms).toISOString();
const race: GrandPrix = {
  season: 2026,
  round: 18,
  name: "United States Grand Prix",
  url: null,
  circuit: { id: "americas", name: "Circuit of the Americas", locality: "Austin", country: "USA", lat: 30.1, lon: -97.6, timezone: "America/Chicago", layout: null },
  sessions: [
    { kind: "FP1", date: at(3 * day).slice(0, 10), start: at(3 * day) },
    { kind: "RACE", date: at(5 * day).slice(0, 10), start: at(5 * day) },
  ],
};
const progression = envelope({ rounds: [], drivers: [], constructors: [] });
const noHours = Object.fromEntries(
  ["time", "temperature", "apparentTemperature", "humidity", "precipitation", "precipitationProbability", "windSpeed", "windDirection", "windGusts", "cloudCover", "cloudLow", "cloudMid", "cloudHigh", "weatherCode"].map((k) => [k, []]),
);

it("home shows last season's champion, the next race and the championship leaders", async () => {
  mockApi({
    "/api/seasons": () => envelope([2026]),
    "/api/calendar?season=2026": () => envelope([race]),
    "/api/calendar?season=2025": () => envelope([]),
    "/api/standings/drivers?season=2026": () => envelope(driverStandings(2026)),
    "/api/standings/constructors?season=2026": () => envelope(constructorStandings(2026)),
    "/api/standings/drivers?season=2025": () => envelope(driverStandings(2025)),
    "/api/standings/constructors?season=2025": () => envelope(constructorStandings(2025)),
    "/api/standings/progression?type=drivers&season=2026": () => progression,
    "/api/standings/progression?type=constructors&season=2026": () => progression,
    "/api/team-colours?season=2026": () => envelope({}),
    "/api/team-colours?season=2025": () => envelope({}),
    "/api/weather/forecast?circuit=americas": () => envelope({ current: null, hourly: noHours }, { source: "open-meteo" }),
  });
  await renderScreen(Home);
  expect(await screen.findByText("United States Grand Prix")).toBeTruthy();
  expect(screen.getByText("Practice 1 starts in")).toBeTruthy();
  // No 2026 race has finished, so the band shows 2025's champion; the standings card shows 2026's leader.
  expect(await screen.findByText("2025 World Champion")).toBeTruthy();
  expect(await screen.findAllByText("Andrea Kimi Antonelli")).toHaveLength(2);
  expect(screen.getByText("No race has finished yet this season.")).toBeTruthy();
});

it("standings lists the drivers' championship", async () => {
  mockApi({
    "/api/seasons": () => envelope([2026]),
    "/api/standings/drivers?season=2026": () => envelope(driverStandings(2026)),
    "/api/standings/progression?type=drivers&season=2026": () => progression,
    "/api/team-colours?season=2026": () => envelope({}),
  });
  await renderScreen(Standings);
  expect(await screen.findByText("Andrea Kimi Antonelli")).toBeTruthy();
  expect(screen.getByText("Charles Leclerc")).toBeTruthy();
  expect(screen.getByText("After round 3")).toBeTruthy();
});

it("live says no session is on and points to the next one", async () => {
  const status: LiveStatus = {
    state: "UNAVAILABLE",
    reason: "no_session",
    detail: "No session is running right now. Live timing starts 30 minutes before each session.",
    next: { race, session: race.sessions[0]!, inWindow: false },
    latestReplay: null,
  };
  mockApi({
    "/api/live/session": () => envelope(status, { source: "pitwall" }),
    "/api/seasons": () => envelope([2026]),
    "/api/calendar?season=2026": () => envelope([race]),
  });
  await renderScreen(Live);
  expect(await screen.findByText("No live session")).toBeTruthy();
  expect(screen.getByText(/Live timing starts 30 minutes before/)).toBeTruthy();
  expect(screen.getByText("Practice 1 starts in")).toBeTruthy();
});

it("live shows the timing tower and race control while a session streams", async () => {
  const t = Date.now();
  const live: LiveStatus = {
    state: "DELAYED",
    session: { key: 11390, meetingName: "Singapore Grand Prix", name: "Race" },
    observedAt: new Date(t).toISOString(),
    delaySeconds: 21,
    timing: {
      session: { key: 11390, meetingName: "Singapore Grand Prix", name: "Race", type: "Race" },
      observedAt: new Date(t).toISOString(),
      drivers: [
        { number: 1, acronym: "VER", name: "Max Verstappen", team: "Red Bull Racing", colour: "#3671C6", driverId: "max_verstappen" },
        { number: 4, acronym: "NOR", name: "Lando Norris", team: "McLaren", colour: "#FF8000", driverId: "norris" },
      ],
      rows: [
        { driver: 4, position: 1, gap: 0, interval: 0, lap: 30, lastLap: 98.1, bestLap: 97.5, compound: "MEDIUM", tyreAge: 12, pits: 1, startPosition: null, sectors: [null, null, null], sectorMark: [null, null, null] },
        { driver: 1, position: 2, gap: 2.345, interval: 2.345, lap: 30, lastLap: 98.4, bestLap: 97.9, compound: "HARD", tyreAge: 4, pits: 1, startPosition: null, sectors: [null, null, null], sectorMark: [null, null, null] },
      ],
      raceControl: [{ t: t - 60_000, lap: 30, category: "Flag", flag: "YELLOW", driver: null, message: "YELLOW IN TRACK SECTOR 7" }],
      status: { kind: "yellow", label: "Yellow S7", sectors: [7] },
      track: null,
      weather: [],
      positions: { from: t - 10_000, to: t, cars: {}, intervals: {} },
      stewards: [],
      stints: {},
      laps: {},
      radio: [],
    },
  };
  mockApi({
    "/api/live/session": () => envelope(live, { source: "openf1" }),
    "/api/seasons": () => envelope([2026]),
    "/api/calendar?season=2026": () => envelope([race]),
    "/api/championship/before?season=2026&session=11390": () => envelope({ drivers: [], teams: [] }),
  });
  await renderScreen(Live);
  expect(await screen.findByText("Singapore Grand Prix · Race")).toBeTruthy();
  expect(screen.getByText("Delayed · last update 21 s ago")).toBeTruthy();
  expect(screen.getByLabelText("P2 Max Verstappen")).toBeTruthy();
  expect(screen.getByText("+2.345")).toBeTruthy();
  expect(screen.getByText("YELLOW IN TRACK SECTOR 7")).toBeTruthy();
});
