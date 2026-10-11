import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/layout/app-shell";
import { envelope, mockApi, nav, renderWithQuery } from "./utils";

vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark", setTheme: vi.fn() }) }));

const api = () =>
  mockApi({
    "/api/seasons": () => envelope([2026]),
    "/api/calendar?season=2026": () => envelope([]),
  });

describe("navigation", () => {
  it("shows the same five pages in the top bar and the phone tab bar, marking the current one", () => {
    api();
    nav.pathname = "/calendar";
    renderWithQuery(<AppShell>content</AppShell>);

    for (const name of ["Main", "Main (tabs)"]) {
      const bar = screen.getByRole("navigation", { name });
      expect(within(bar).getAllByRole("link").map((l) => l.textContent)).toEqual(["Live", "Home", "Calendar", "Standings", "Replay"]);
      expect(within(bar).getByRole("link", { name: "Calendar" })).toHaveAttribute("aria-current", "page");
    }
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main");
  });

  it("keeps the browsed season on links, except Live", () => {
    api();
    nav.params = new URLSearchParams("season=2019");
    renderWithQuery(<AppShell>content</AppShell>);
    const bar = screen.getByRole("navigation", { name: "Main" });
    expect(within(bar).getByRole("link", { name: "Standings" })).toHaveAttribute("href", "/standings?season=2019");
    expect(within(bar).getByRole("link", { name: "Live" })).toHaveAttribute("href", "/live");
  });
});
