import { type GrandPrix, type LiveStatus, qualifyingContext } from "@pitwall/shared";
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LiveView } from "@/components/pages/live-view";
import { envelope, mockApi, renderWithQuery } from "./utils";

const race = {
  season: 2026, round: 18, name: "United States Grand Prix", url: null,
  circuit: { id: "americas", name: "Circuit of the Americas", locality: "Austin", country: "USA", lat: 30.1, lon: -97.6, timezone: "America/Chicago", layout: null },
  sessions: [{ kind: "FP1", date: "2026-10-23", start: "2026-10-23T17:30:00Z" }],
} as GrandPrix;

const status = (next: Partial<{ inWindow: boolean }> | null): LiveStatus => ({
  state: "UNAVAILABLE",
  reason: "no_session",
  detail: "No session is running right now. Live timing starts 30 minutes before each session.",
  next: next && { race, session: race.sessions[0]!, inWindow: next.inWindow ?? false },
  latestReplay: { key: 11384, meetingKey: 1296, meetingName: "Singapore Grand Prix", name: "Qualifying", type: "Qualifying", circuit: "Singapore", country: "Singapore", start: "2026-10-10T13:30:00.000Z", end: "2026-10-10T14:30:00.000Z" },
});

describe("live page", () => {
  it("says no session is live and points to the next session and latest replay", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-10-20T00:00:00Z") });
    mockApi({ "/api/live/session": () => envelope(status({}), { source: "pitwall" }) });
    renderWithQuery(<LiveView />);
    expect(await screen.findByText("No live session")).toBeInTheDocument();
    // Nothing on track isn't an outage: no "unavailable" badge.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText(/Live timing starts 30 minutes before/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Replay Singapore Grand Prix · Qualifying" })).toHaveAttribute("href", "/replay?season=2026&session=11384");
    expect(screen.getByRole("link", { name: "United States Grand Prix" })).toBeInTheDocument();
    expect(screen.getByText("Practice 1 starts in")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("doesn't claim an open schedule slot means the session is running", async () => {
    mockApi({ "/api/live/session": () => envelope(status({ inWindow: true }), { source: "pitwall" }) });
    renderWithQuery(<LiveView />);
    expect(await screen.findByText(/doesn't confirm the session is running/)).toBeInTheDocument();
  });

  it("shows the live timing tower, race control and track map while a session streams", async () => {
    const live: LiveStatus = {
      state: "DELAYED",
      session: { key: 11390, meetingName: "Singapore Grand Prix", name: "Race" },
      observedAt: "2026-10-11T12:30:00.000Z",
      delaySeconds: 21,
      timing: {
        session: { key: 11390, meetingName: "Singapore Grand Prix", name: "Race", type: "Race" },
        observedAt: "2026-10-11T12:30:00.000Z",
        drivers: [
          { number: 1, acronym: "VER", name: "Max Verstappen", team: "Red Bull Racing", colour: "#3671C6", driverId: "max_verstappen" },
          { number: 4, acronym: "NOR", name: "Lando Norris", team: "McLaren", colour: "#FF8000", driverId: "norris" },
        ],
        rows: [
          { driver: 4, position: 1, gap: 0, interval: 0, lap: 30, lastLap: 98.1, bestLap: 97.5, compound: "MEDIUM", tyreAge: 12, pits: 1, startPosition: null, sectors: [null, null, null], sectorMark: [null, null, null] },
          { driver: 1, position: 2, gap: 2.345, interval: 2.345, lap: 30, lastLap: 98.4, bestLap: 97.9, compound: "HARD", tyreAge: 4, pits: 1, startPosition: null, sectors: [null, null, null], sectorMark: [null, null, null] },
        ],
        raceControl: [{ t: Date.parse("2026-10-11T12:29:00Z"), lap: 30, category: "Flag", flag: "YELLOW", driver: null, message: "YELLOW IN TRACK SECTOR 7" }],
        status: { kind: "yellow", label: "Yellow S7", sectors: [7] },
        track: { driver: 4, lap: 12, x: [0, 100, 100, 0], y: [0, 0, 100, 100] },
        weather: [{ t: Date.parse("2026-10-11T12:29:30Z"), air: 29.1, track: 41.6, humidity: 74, windSpeed: 1.2, windDirection: 180, rainfall: false }],
        positions: { from: Date.parse("2026-10-11T12:29:50Z"), to: Date.parse("2026-10-11T12:30:00Z"), cars: { 4: { t: [0, 250], x: [10, 12], y: [0, 0] } }, intervals: {} },
        stewards: [],
        stints: {},
        laps: {},
        radio: [{ t: Date.parse("2026-10-11T12:28:00Z"), driver: 1, url: "https://livetiming.formula1.com/static/2026/r.mp3" }],
      },
    };
    mockApi({ "/api/live/session": () => envelope(live, { source: "openf1" }) });
    renderWithQuery(<LiveView />);
    expect(await screen.findByRole("status")).toHaveTextContent("Delayed · last update 21 s ago");
    const table = screen.getByRole("table", { name: /Live timing for Singapore Grand Prix Race/ });
    expect(table).toHaveTextContent("NOR");
    expect(table).toHaveTextContent("+2.345");
    expect(screen.getByText("YELLOW IN TRACK SECTOR 7")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Track map with car positions/ })).toBeInTheDocument();
    expect(screen.getByText(/traced from NOR's lap 12 earlier this weekend/)).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Session",
      "Track",
      "Timing",
      "Driver focus",
      "Race control",
      "Track weather",
      "Driver comparison",
      "Penalties",
      "Tyres",
      "Team radio",
      "Championship",
    ]);
    expect(screen.getByRole("button", { name: /^Play VER team radio/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alerts: Off" })).toBeInTheDocument();
    expect(screen.getByText("Yellow S7")).toBeInTheDocument();
    expect(screen.getByText("Select a driver in Timing or on the track map.")).toBeInTheDocument();
    expect(screen.getByText("29°C")).toBeInTheDocument();
  });

  it("shows the qualifying dashboard: the segment under way, the knockout line and the cars already out", async () => {
    const T = Date.parse("2026-10-10T13:00:00Z");
    const MIN = 60_000;
    vi.useFakeTimers({ toFake: ["Date"], now: T + 31 * MIN });
    // 12 cars, so one goes out per segment. Q1 ran 0-18 min, Q2 started at 25.
    const cars = Array.from({ length: 12 }, (_, i) => i + 1);
    const lap = (n: number, start: number, d: number | null, sectors: (number | null)[], pitOut = false) => ({ lap: n, start, duration: d, sectors, pitOut });
    const rc = (t: number, message: string) => ({ t, lap: null, category: "SessionStatus", flag: null, driver: null, message });
    const messages = [rc(T, "SESSION STARTED"), rc(T + 18 * MIN, "SESSION FINISHED"), rc(T + 25 * MIN, "SESSION STARTED")];
    const live: LiveStatus = {
      state: "LIVE",
      session: { key: 11384, meetingName: "Singapore Grand Prix", name: "Qualifying" },
      observedAt: new Date(T + 31 * MIN).toISOString(),
      delaySeconds: 2,
      timing: {
        session: { key: 11384, meetingName: "Singapore Grand Prix", name: "Qualifying", type: "Qualifying" },
        observedAt: new Date(T + 31 * MIN).toISOString(),
        drivers: cars.map((n) => ({ number: n, acronym: `D${String(n).padStart(2, "0")}`, name: `Driver ${n}`, team: null, colour: null, driverId: null })),
        rows: cars.map((n) => ({ driver: n, position: n, gap: null, interval: null, lap: 2, lastLap: null, bestLap: null, compound: "SOFT", tyreAge: 1, pits: 0, startPosition: null, sectors: [null, null, null], sectorMark: [null, null, null] })),
        raceControl: messages,
        status: { kind: "green", label: "Green flag", sectors: [] },
        track: null,
        weather: [],
        positions: { from: T, to: T, cars: {}, intervals: {} },
        stewards: [],
        stints: {},
        // Q1: car n laps in 90 + n/10 s. Q2: car 2 sets the fastest time so far.
        laps: Object.fromEntries(cars.map((n) => [n, [lap(1, T + MIN, 90 + n / 10, [30, 30, 30 + n / 10]), ...(n === 2 ? [lap(2, T + 27 * MIN, 89.5, [29.8, 29.8, 29.9])] : [])]])),
        // Car 3 is 20 s into a push lap, S1 set.
        openLaps: { 3: lap(3, T + 31 * MIN - 20_000, null, [19.9, null, null]) },
        qualifying: qualifyingContext(messages, "Qualifying"),
        radio: [],
      },
    };
    mockApi({ "/api/live/session": () => envelope(live, { source: "openf1" }) });
    renderWithQuery(<LiveView />);
    const table = await screen.findByRole("table", { name: /Live qualifying timing for Singapore Grand Prix Qualifying, from OpenF1: Q2/ });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("D02");
    expect(rows[0]).toHaveTextContent("1:29.500");
    expect(table).toHaveTextContent("Knockout");
    expect(rows.at(-1)).toHaveTextContent(/D12.*Out Q1/);
    expect(screen.getByRole("group", { name: "Qualifying segment" })).toHaveTextContent("Q1Q2");
    expect(screen.getByText("Q2 left").nextElementSibling).toHaveTextContent("9:00 est.");
    expect(screen.getByText("Fastest")).toBeInTheDocument();
    // The push lap: S1 under P1's, so on for pole.
    expect(screen.getByText("S1 19.900")).toBeInTheDocument();
    expect(screen.getByText("On for P1")).toBeInTheDocument();
    expect(screen.getAllByText(/first time/)[0]).toHaveTextContent("D02 1:29.500 first time, P1"); // newest first|first time/)).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Session",
      "Track",
      "Timing",
      "On a lap now",
      "Improvements",
      "Driver focus",
      "Tyre sets",
      "Driver comparison",
      "Penalties",
      "Race control",
      "Team radio",
      "Track weather",
    ]);
    vi.useRealTimers();
  });
});
