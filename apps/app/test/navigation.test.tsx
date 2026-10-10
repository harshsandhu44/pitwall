import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/layout/app-shell";
import { envelope, mockApi, renderWithQuery } from "./utils";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark", setTheme: vi.fn() }) }));

describe("mobile navigation", () => {
  it("opens the navigation sheet and closes it after choosing a page", async () => {
    mockApi({
      "/api/seasons": () => envelope([2026]),
      "/api/calendar?season=2026": () => envelope([]),
    });
    renderWithQuery(<AppShell>content</AppShell>);

    expect(screen.queryByRole("link", { name: "Calendar" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Toggle navigation" }));
    const dialog = await screen.findByRole("dialog");
    const link = within(dialog).getByRole("link", { name: "Calendar" });
    expect(within(dialog).getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");

    await userEvent.click(link);
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
