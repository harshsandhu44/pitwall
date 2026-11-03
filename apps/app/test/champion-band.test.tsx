import type { GrandPrix } from "@pitwall/shared";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChampionBand } from "@/components/racing/champion-band";
import { constructorStandings, driverStandings } from "./fixtures";
import { envelope, mockApi, renderWithQuery } from "./utils";

const circuit = { id: "x", name: "X", locality: "X", country: "X", lat: 0, lon: 0, timezone: null, layout: null };
const gp = (round: number): GrandPrix => ({
  season: 2026, round, name: `GP ${round}`, url: null, circuit,
  sessions: [{ kind: "RACE", date: "2026-01-01", start: "2026-01-01T00:00:00Z" }],
});

function routes(rounds: number, headshot?: string) {
  const drivers = driverStandings(2026);
  drivers.entries[0] = { ...drivers.entries[0]!, ...(headshot && { headshot }) };
  mockApi({
    // Standings are after round 3: Antonelli leads Leclerc by 17.5, Mercedes' constructors' lead is 108.
    "/api/calendar?season=2026": () => envelope(Array.from({ length: rounds }, (_, i) => gp(i + 1))),
    "/api/standings/drivers?season=2026": () => envelope(drivers),
    "/api/standings/constructors?season=2026": () => envelope(constructorStandings(2026)),
    "/api/team-colours?season=2026": () => envelope({ mercedes: "#27F4D2" }),
  });
}

describe("champion band", () => {
  it("announces each title once it can't be lost", async () => {
    // One race left: Mercedes' 108-point lead is safe, Antonelli's 17.5 isn't (25 still on offer).
    routes(4);
    renderWithQuery(<ChampionBand season={2026} />);
    expect(await screen.findByText("2026 Constructors' Champion")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mercedes" })).toHaveAttribute("href", "/team?id=mercedes&season=2026");
    expect(screen.getByText("Decided with 1 race to go")).toBeInTheDocument();
    expect(screen.queryByText("2026 World Champion")).not.toBeInTheDocument();
  });

  it("crowns the driver at season end with their cutout, falling back to the race number", async () => {
    routes(3, "https://media.formula1.com/ant.png.transform/4col/image.png");
    const { container } = renderWithQuery(<ChampionBand season={2026} />);
    expect(await screen.findByRole("link", { name: "Andrea Kimi Antonelli" })).toHaveAttribute("href", "/driver?id=antonelli&season=2026");
    expect(screen.getAllByText("Season complete")).toHaveLength(2);
    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("src", "https://media.formula1.com/ant.png.transform/4col/image.png");
    fireEvent.error(img);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("stays out of the way while both titles are open", async () => {
    routes(10);
    const { container } = renderWithQuery(<ChampionBand season={2026} />);
    await new Promise((r) => setTimeout(r, 100));
    expect(container).toBeEmptyDOMElement();
  });
});
