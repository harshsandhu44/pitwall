import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SeasonSelector } from "@/components/layout/season-selector";
import { StandingsView } from "@/components/pages/standings-view";
import { constructorStandings, driverStandings } from "./fixtures";
import { envelope, mockApi, nav, renderWithQuery } from "./utils";

const progression = { season: 2026, rounds: [], drivers: [], constructors: [] };
const routes = (season: number) => ({
  "/api/seasons": () => envelope([2026, 2025, 2024]),
  [`/api/standings/drivers?season=${season}`]: () => envelope(driverStandings(season)),
  [`/api/standings/constructors?season=${season}`]: () => envelope(constructorStandings(season)),
  [`/api/results?season=${season}`]: () => envelope({ season, races: [] }),
  [`/api/standings/progression?type=drivers&season=${season}`]: () => envelope(progression),
});

describe("standings", () => {
  it("loads driver standings for the URL season with gaps and source", async () => {
    nav.params = new URLSearchParams("season=2025");
    mockApi(routes(2025));
    renderWithQuery(<StandingsView />);

    const table = await screen.findByRole("table", { name: /2025 drivers' championship after round 3/ });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(4);
    expect(rows[1]).toHaveTextContent("Andrea Kimi Antonelli");
    expect(rows[2]).toHaveTextContent("50.5"); // fractional points preserved
    expect(rows[2]).toHaveTextContent("−17.5");
    expect(screen.getByText("Jolpica F1")).toBeInTheDocument();
  });

  it("filters by driver or team name", async () => {
    nav.params = new URLSearchParams("season=2025");
    mockApi(routes(2025));
    renderWithQuery(<StandingsView />);
    const table = await screen.findByRole("table");
    await userEvent.type(screen.getByRole("searchbox", { name: "Search drivers" }), "ferrari");
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(table).toHaveTextContent("Leclerc");
  });

  it("sorts by points ascending when the header is toggled", async () => {
    nav.params = new URLSearchParams("season=2025");
    mockApi(routes(2025));
    renderWithQuery(<StandingsView />);
    const table = await screen.findByRole("table");
    await userEvent.click(within(table).getByRole("button", { name: "Pts" }));
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("Russell");
    expect(within(table).getByRole("columnheader", { name: "Pts" })).toHaveAttribute("aria-sort", "ascending");
  });

  it("switches season through the URL", async () => {
    nav.pathname = "/standings";
    nav.params = new URLSearchParams("season=2026&view=drivers");
    mockApi(routes(2026));
    renderWithQuery(<SeasonSelector />);
    const trigger = await screen.findByRole("combobox", { name: "Season" });
    await waitFor(() => expect(trigger).toHaveTextContent("2026"));
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("option", { name: "2024" }));
    expect(nav.push).toHaveBeenCalledWith("/standings?season=2024&view=drivers");
  });

  it("shows an honest unavailable state with retry when the provider is down", async () => {
    nav.params = new URLSearchParams("season=2025");
    mockApi({
      ...routes(2025),
      "/api/standings/drivers?season=2025": () => ({ ...envelope(null), status: "unavailable", reason: "HTTP 502" }),
    });
    renderWithQuery(<StandingsView />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Jolpica F1 is unavailable right now");
    expect(alert).toHaveTextContent("HTTP 502");
    expect(within(alert).getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});
