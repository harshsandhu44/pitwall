import type { ClassificationEntry, GrandPrix, RaceWeekendResults } from "@pitwall/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarView } from "@/components/pages/calendar-view";
import { envelope, mockApi, nav, renderWithQuery } from "./utils";

const circuit = { id: "marina_bay", name: "Marina Bay", locality: "Marina Bay", country: "Singapore", lat: 1.29, lon: 103.86, timezone: null, layout: null };
const sprintWeekend: GrandPrix = {
  season: 2026, round: 17, name: "Singapore Grand Prix", url: null, circuit,
  sessions: [
    { kind: "SPRINT", date: "2026-10-10", start: "2026-10-10T09:00:00Z" },
    { kind: "RACE", date: "2026-10-11", start: "2026-10-11T12:00:00Z" },
  ],
};
const later: GrandPrix = {
  ...sprintWeekend, round: 18, name: "United States Grand Prix",
  sessions: [{ kind: "RACE", date: "2026-10-25", start: "2026-10-25T19:00:00Z" }],
};
const entry = (position: number, familyName: string, time: string): ClassificationEntry => ({
  position, positionText: String(position), number: position,
  driver: { id: familyName.toLowerCase(), code: null, number: position, givenName: "Test", familyName, nationality: null, dateOfBirth: null, url: null },
  constructor: { id: "mclaren", name: "McLaren", nationality: null, url: null },
  grid: null, laps: null, status: "Finished", points: 0, time, millis: null, fastestLap: null,
});
const weekend: RaceWeekendResults = {
  race: sprintWeekend, results: [], qualifying: [], sprintQualifying: [],
  sprint: [entry(1, "Norris", "30:12.8"), entry(2, "Piastri", "+0.871"), entry(3, "Verstappen", "+2.340"), entry(4, "Russell", "+3.1")],
};

describe("calendar podium preview", () => {
  // Saturday evening: the sprint is done, the Grand Prix is tomorrow.
  beforeEach(() => vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-10-10T20:00:00Z") }));
  afterEach(() => vi.useRealTimers());

  it("shows the sprint podium once the sprint is run, fetching the round on hover only", async () => {
    nav.params = new URLSearchParams("season=2026");
    const api = mockApi({
      "/api/seasons": () => envelope([2026]),
      "/api/calendar?season=2026": () => envelope([sprintWeekend, later]),
      "/api/races/17?season=2026": () => envelope(weekend),
      "/api/team-colours?season=2026": () => envelope({}),
    });
    renderWithQuery(<CalendarView />);
    const card = await screen.findByRole("link", { name: /Singapore Grand Prix/ });
    expect(api.mock.calls.some(([u]) => String(u).includes("/api/races/"))).toBe(false);

    await userEvent.hover(card);
    const sprint = await screen.findByRole("list", { name: "Sprint podium" }, { timeout: 2000 });
    expect(within(sprint).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "1Test Norris30:12.8",
      "2Test Piastri+0.871",
      "3Test Verstappen+2.340",
    ]);
    expect(screen.getByText("No results yet.")).toBeInTheDocument(); // the Grand Prix
    expect(screen.getByText("Provisional")).toBeInTheDocument();
  });

  it("has no preview for a weekend that hasn't scored yet", async () => {
    nav.params = new URLSearchParams("season=2026");
    mockApi({
      "/api/seasons": () => envelope([2026]),
      "/api/calendar?season=2026": () => envelope([sprintWeekend, later]),
    });
    renderWithQuery(<CalendarView />);
    await userEvent.hover(await screen.findByRole("link", { name: /United States Grand Prix/ }));
    await new Promise((r) => setTimeout(r, 500));
    expect(screen.queryByText(/podium/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Grand Prix", { exact: true })).not.toBeInTheDocument();
  });
});
