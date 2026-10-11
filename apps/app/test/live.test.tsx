import type { GrandPrix, LiveStatus } from "@pitwall/shared";
import { screen } from "@testing-library/react";
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
    expect(await screen.findByRole("status")).toHaveTextContent("Status: unavailable");
    expect(screen.getByText("No live session")).toBeInTheDocument();
    expect(screen.getByText(/Live timing starts 30 minutes before/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Singapore Grand Prix · Qualifying" })).toHaveAttribute("href", "/replay?season=2026&session=11384");
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
          { driver: 4, position: 1, gap: 0, interval: 0, lap: 30, lastLap: 98.1, bestLap: 97.5, compound: "MEDIUM", tyreAge: 12, pits: 1 },
          { driver: 1, position: 2, gap: 2.345, interval: 2.345, lap: 30, lastLap: 98.4, bestLap: 97.9, compound: "HARD", tyreAge: 4, pits: 1 },
        ],
        raceControl: [{ t: Date.parse("2026-10-11T12:29:00Z"), lap: 30, category: "Flag", flag: "YELLOW", driver: null, message: "YELLOW IN TRACK SECTOR 7" }],
        status: { kind: "yellow", label: "Yellow S7", sectors: [7] },
        track: { driver: 4, lap: 12, x: [0, 100, 100, 0], y: [0, 0, 100, 100] },
        weather: [{ t: Date.parse("2026-10-11T12:29:30Z"), air: 29.1, track: 41.6, humidity: 74, windSpeed: 1.2, windDirection: 180, rainfall: false }],
        positions: { from: Date.parse("2026-10-11T12:29:50Z"), to: Date.parse("2026-10-11T12:30:00Z"), cars: { 4: { t: [0, 250], x: [10, 12], y: [0, 0] } }, intervals: {} },
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
    ]);
    expect(screen.getByText("Yellow S7")).toBeInTheDocument();
    expect(screen.getByText("Select a driver in Timing or on the track map.")).toBeInTheDocument();
    expect(screen.getByText("29°C")).toBeInTheDocument();
  });
});
