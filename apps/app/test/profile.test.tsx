import type { ClassificationEntry } from "@pitwall/shared";
import { screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { ProfileView } from "@/components/pages/profile-view";
import { envelope, mockApi, nav, renderWithQuery } from "./utils";

const ferrari = { id: "ferrari", name: "Ferrari", nationality: "Italian", url: null };
const win = { positionText: "1", position: 1, grid: 1, points: 25, driver: { id: "leclerc" }, constructor: ferrari } as ClassificationEntry;
const results = (season: number) => envelope({ season, races: [{ round: 1, name: "Bahrain", results: [win] }] });

it("labels a capped title count and adds up every season since 2023", async () => {
  nav.params = new URLSearchParams("id=ferrari&season=2025");
  mockApi({
    "/api/seasons": () => envelope([2025, 2024, 2023]),
    "/api/teams/ferrari": () =>
      envelope({
        constructor: ferrari,
        seasons: [2025, 2024, 2023, 2000],
        career: [2025, 2024, 2023].map((season) => ({ season, position: season === 2024 ? 1 : 2, positionText: "", points: 0, wins: 0, constructors: [] })),
        seasonsTotal: 4,
      }),
    "/api/results?season=2025": () => results(2025),
    "/api/results?season=2024": () => results(2024),
    "/api/results?season=2023": () => results(2023),
  });
  renderWithQuery(<ProfileView kind="teams" />);

  expect(await screen.findByText("since 2023")).toBeInTheDocument();
  const season = await screen.findByRole("region", { name: "2025 Grands Prix" });
  expect(within(season).getByText("Wins").nextElementSibling).toHaveTextContent("1");
  const totals = await screen.findByRole("region", { name: "Since 2023 (3 seasons)" });
  expect(within(totals).getByText("Wins").nextElementSibling).toHaveTextContent("3");
});
