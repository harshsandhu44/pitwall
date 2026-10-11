import type { GrandPrix, QualifyingEntry, RaceWeekendResults } from "@pitwall/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RaceView } from "@/components/pages/race-view";
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
});
