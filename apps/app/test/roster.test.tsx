import type { ClassificationEntry } from "@pitwall/shared";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RosterView } from "@/components/pages/roster-view";
import { constructorStandings, driverStandings } from "./fixtures";
import { envelope, mockApi, nav, renderWithQuery } from "./utils";

const start = (driver: { id: string; givenName: string; familyName: string; number: number }, team: string, positionText: string) =>
  ({
    position: Number(positionText) || null,
    positionText,
    number: driver.number,
    driver: { ...driver, code: null, nationality: null, dateOfBirth: null, url: null },
    constructor: { id: team, name: team === "mercedes" ? "Mercedes" : "Ferrari", nationality: null, url: null },
    grid: 1,
    points: 0,
    status: "",
    fastestLap: null,
  }) as ClassificationEntry;

const ant = { id: "antonelli", givenName: "Andrea Kimi", familyName: "Antonelli", number: 12 };
const lec = { id: "leclerc", givenName: "Charles", familyName: "Leclerc", number: 16 };
// Leclerc does three races for Ferrari, then one for Mercedes.
const results = {
  season: 2025,
  races: [1, 2, 3, 4].map((round) => ({
    round,
    name: `GP ${round}`,
    results: [start(ant, "mercedes", round === 1 ? "1" : "2"), start(lec, round === 4 ? "mercedes" : "ferrari", round === 4 ? "1" : "3")],
  })),
};

const routes = (season: number, races = results) => ({
  "/api/seasons": () => envelope([2026, 2025]),
  [`/api/results?season=${season}`]: () => envelope(races),
  [`/api/standings/drivers?season=${season}`]: () => envelope(driverStandings(season)),
  [`/api/standings/constructors?season=${season}`]: () => envelope(constructorStandings(season)),
  [`/api/team-colours?season=${season}`]: () => envelope({}),
});

describe("roster", () => {
  it("lists a driver who swapped teams under both, the stand-in run smaller", async () => {
    nav.params = new URLSearchParams("season=2025");
    mockApi(routes(2025));
    renderWithQuery(<RosterView kind="teams" />);

    const mercedes = await screen.findByRole("region", { name: "Mercedes" });
    expect(within(mercedes).getByRole("link", { name: "Charles Leclerc" })).toHaveAttribute("href", "/driver?id=leclerc&season=2025");
    expect(within(mercedes).getByText("1 start").closest("li")).toHaveClass("text-xs");
    expect(within(screen.getByRole("region", { name: "Ferrari" })).getByText("3 starts")).toBeInTheDocument();
  });

  it("shows one tile per driver in standings order, linking to the profile", async () => {
    nav.params = new URLSearchParams("season=2025");
    mockApi(routes(2025));
    renderWithQuery(<RosterView kind="drivers" />);

    const tiles = await screen.findAllByRole("link", { name: /Antonelli|Leclerc/ });
    expect(tiles.map((t) => t.getAttribute("href"))).toEqual(["/driver?id=antonelli&season=2025", "/driver?id=leclerc&season=2025"]);
    expect(tiles[1]).toHaveTextContent("Ferrari / Mercedes");
    expect(tiles[1]).toHaveTextContent("Wins1"); // round 4
  });

  it("points to the previous season before the first race", async () => {
    nav.params = new URLSearchParams("season=2026");
    mockApi(routes(2026, { season: 2026, races: [] }));
    renderWithQuery(<RosterView kind="drivers" />);
    expect(await screen.findByRole("link", { name: "See the 2025 drivers" })).toHaveAttribute("href", "/drivers?season=2025");
  });
});
