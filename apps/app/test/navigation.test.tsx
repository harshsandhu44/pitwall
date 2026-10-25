import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/layout/app-shell";
import { useSeason } from "@/lib/hooks";
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

  it("hides the season selector where the page is always about the newest season", () => {
    api();
    nav.pathname = "/";
    const { unmount } = renderWithQuery(<AppShell>content</AppShell>);
    expect(screen.queryByLabelText("Season")).not.toBeInTheDocument();
    unmount();
    nav.pathname = "/calendar";
    renderWithQuery(<AppShell>content</AppShell>);
    expect(screen.getByLabelText("Season")).toBeInTheDocument();
  });

  it("says so, with a retry, when the season list can't load (every page waits on it)", async () => {
    mockApi({
      "/api/seasons": () => envelope(null, { status: "unavailable", source: "jolpica" }),
      "/api/calendar?season=2026": () => envelope([]),
    });
    renderWithQuery(<AppShell>content</AppShell>);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Jolpica F1 is unavailable right now");
    expect(within(alert).getByRole("button", { name: /Retry/ })).toBeInTheDocument();
  });
});

describe("changing season", () => {
  function Pick() {
    const { setSeason } = useSeason();
    return <button onClick={() => setSeason(2019)}>2019</button>;
  }

  it("leaves a race page for that season's calendar: round N of another season is another race", async () => {
    api();
    nav.pathname = "/race";
    nav.params = new URLSearchParams("season=2026&round=17");
    renderWithQuery(<Pick />);
    await userEvent.click(screen.getByRole("button", { name: "2019" }));
    expect(nav.push).toHaveBeenCalledWith("/calendar?season=2019");
  });

  it("keeps the page and its other parameters elsewhere, dropping a recorded session", async () => {
    api();
    nav.pathname = "/driver";
    nav.params = new URLSearchParams("id=alonso&season=2026&session=9");
    renderWithQuery(<Pick />);
    await userEvent.click(screen.getByRole("button", { name: "2019" }));
    expect(nav.push).toHaveBeenCalledWith("/driver?id=alonso&season=2019");
  });
});
