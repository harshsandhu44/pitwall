import type { GrandPrix, QualifyingEntry, RaceWeekendResults } from "@pitwall/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RaceView } from "@/components/pages/race-view";
import { WeatherRedirect } from "@/components/pages/weather-redirect";
import { envelope, mockApi, nav, renderWithQuery } from "./utils";

const race: GrandPrix = {
  season: 2026, round: 17, name: "Singapore Grand Prix", url: null,
  circuit: { id: "marina_bay", name: "Marina Bay Street Circuit", locality: "Marina Bay", country: "Singapore", lat: 1.29, lon: 103.86, timezone: "Asia/Singapore", layout: null },
  sessions: [
    { kind: "SPRINT_QUALIFYING", date: "2026-10-09", start: "2026-10-09T12:30:00Z" },
    { kind: "SPRINT", date: "2026-10-10", start: "2026-10-10T09:00:00Z" },
    { kind: "QUALIFYING", date: "2026-10-10", start: "2026-10-10T13:00:00Z" },
    { kind: "RACE", date: "2026-10-11", start: "2026-10-11T12:00:00Z" },
  ],
};
const q = (position: number, id: string, familyName: string, q3: string | null): QualifyingEntry => ({
  position, number: position,
  driver: { id, code: null, number: position, givenName: "", familyName, nationality: null, dateOfBirth: null, url: null },
  constructor: { id: id ? "red_bull" : "", name: id ? "Red Bull" : "Racing Bulls", nationality: null, url: null },
  q1: "1:33.000", q2: "1:32.000", q3,
});
const weekend: RaceWeekendResults = {
  race, results: [], sprint: [],
  qualifying: [q(1, "max_verstappen", "Verstappen", "1:31.373"), q(2, "", "Newcomer", null)],
  sprintQualifying: [q(1, "max_verstappen", "Verstappen", "1:31.156")],
};

describe("race weekend", () => {
  // Saturday evening: qualifying done, race tomorrow.
  beforeEach(() => vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-10-10T20:00:00Z") }));
  afterEach(() => vi.useRealTimers());

  it("opens on the latest published session and marks the weekend provisional", async () => {
    nav.params = new URLSearchParams("season=2026&round=17");
    mockApi({
      "/api/races/17?season=2026": () => envelope(weekend),
      "/api/calendar?season=2026": () => envelope([race]),
      "/api/team-colours?season=2026": () => envelope({}),
    });
    renderWithQuery(<RaceView />);
    const table = await screen.findByRole("table", { name: /qualifying classification/ });
    expect(screen.getByRole("tab", { name: "Qualifying" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Provisional")).toBeInTheDocument();
    expect(within(table).getByRole("link", { name: "Verstappen" })).toBeInTheDocument();
    // Not in Jolpica yet: shown, but without a broken profile link.
    expect(within(table).getByText("Newcomer")).toBeInTheDocument();
    expect(within(table).queryByRole("link", { name: "Newcomer" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Sprint Qualifying" }));
    const sq = await screen.findByRole("table", { name: /sprint qualifying classification/ });
    expect(within(sq).getByRole("columnheader", { name: "SQ3" })).toBeInTheDocument();
  });

  it("drops the provisional mark a week after the race", async () => {
    vi.setSystemTime(Date.parse("2026-10-19T00:00:00Z"));
    nav.params = new URLSearchParams("season=2026&round=17");
    mockApi({
      "/api/races/17?season=2026": () => envelope(weekend),
      "/api/calendar?season=2026": () => envelope([race]),
      "/api/team-colours?season=2026": () => envelope({}),
    });
    renderWithQuery(<RaceView />);
    await screen.findByRole("table", { name: /qualifying classification/ });
    expect(screen.queryByText("Provisional")).not.toBeInTheDocument();
  });

  it("adds Weather and Sessions tabs for the newest season, listing only this weekend's recorded sessions", async () => {
    nav.params = new URLSearchParams("season=2026&round=17");
    const session = (key: number, name: string, start: string) => ({
      key, meetingKey: 1, meetingName: "Singapore Grand Prix", name, type: "Race", circuit: "Singapore", country: "Singapore", start, end: start,
    });
    mockApi({
      "/api/races/17?season=2026": () => envelope(weekend),
      "/api/calendar?season=2026": () => envelope([race]),
      "/api/team-colours?season=2026": () => envelope({}),
      "/api/seasons": () => envelope([2026, 2025]),
      "/api/replay/sessions?season=2026": () =>
        envelope([session(11380, "Practice 1", "2026-10-02T09:30:00Z"), session(11384, "Qualifying", "2026-10-10T13:00:00Z")], { source: "openf1" }),
    });
    renderWithQuery(<RaceView />);
    await screen.findByRole("tab", { name: "Weather" });
    await userEvent.click(screen.getByRole("tab", { name: "Sessions" }));
    expect(nav.replace).toHaveBeenCalledWith("/?season=2026&round=17&tab=sessions", { scroll: false });
  });

  it("opens the tab named in the URL, and only offers tabs that have data", async () => {
    nav.params = new URLSearchParams("season=2026&round=17&tab=sessions");
    mockApi({
      "/api/races/17?season=2026": () => envelope(weekend),
      "/api/calendar?season=2026": () => envelope([race]),
      "/api/team-colours?season=2026": () => envelope({}),
      "/api/seasons": () => envelope([2027, 2026]),
      "/api/replay/sessions?season=2026": () =>
        envelope([
          { key: 11380, meetingKey: 1, meetingName: "Japanese Grand Prix", name: "Race", type: "Race", circuit: "Suzuka", country: "Japan", start: "2026-09-27T05:00:00Z", end: "2026-09-27T07:00:00Z" },
          { key: 11384, meetingKey: 2, meetingName: "Singapore Grand Prix", name: "Qualifying", type: "Qualifying", circuit: "Singapore", country: "Singapore", start: "2026-10-10T13:00:00Z", end: "2026-10-10T14:00:00Z" },
        ], { source: "openf1" }),
    });
    renderWithQuery(<RaceView />);
    const link = await screen.findByRole("link", { name: /Qualifying/ });
    expect(link).toHaveAttribute("href", "/replay?season=2026&session=11384");
    expect(screen.queryByRole("link", { name: /Race/ })).not.toBeInTheDocument(); // a different weekend
    expect(screen.queryByRole("tab", { name: "Weather" })).not.toBeInTheDocument(); // 2026 isn't the newest season here
  });
});

describe("old weather links", () => {
  it("land on the round's Weather tab of the newest season", async () => {
    nav.params = new URLSearchParams("round=17");
    mockApi({ "/api/seasons": () => envelope([2026]) });
    renderWithQuery(<WeatherRedirect />);
    await vi.waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/race?season=2026&round=17&tab=weather"));
  });
});
