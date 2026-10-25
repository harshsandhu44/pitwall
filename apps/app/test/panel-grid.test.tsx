import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PanelGrid, type PanelDef } from "@/components/dashboard/panel-grid";

const panels: PanelDef[] = [
  { id: "a", title: "Alpha", content: "alpha body", layout: { x: 0, y: 0, w: 12, h: 3 } },
  { id: "b", title: "Bravo", content: "bravo body", layout: { x: 0, y: 3, w: 12, h: 3 } },
];
const titles = () => screen.getAllByRole("region").map((r) => within(r).getByRole("heading", { level: 2 }).textContent);
const saved = () => JSON.parse(localStorage.getItem("pitwall.layout.test.v1")!);

// This jsdom setup has no Web Storage; a Map stands in for the browser's.
beforeEach(() => {
  const m = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  });
  return () => vi.unstubAllGlobals();
});

describe("panel grid", () => {
  it("moves a panel with its menu and keeps the layout across a remount", async () => {
    const { unmount } = render(<PanelGrid id="test" panels={panels} />);
    expect(titles()).toEqual(["Alpha", "Bravo"]);
    await userEvent.click(screen.getByRole("button", { name: "Bravo panel options" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Move up" }));
    expect(saved().layout.find((l: { i: string }) => l.i === "b").y).toBe(0);

    unmount();
    render(<PanelGrid id="test" panels={panels} />);
    expect(saved().layout.find((l: { i: string }) => l.i === "a").y).toBe(3);
  });

  it("hides a panel and brings it back from the Panels menu; Reset restores the defaults", async () => {
    render(<PanelGrid id="test" panels={panels} />);
    await userEvent.click(screen.getByRole("button", { name: "Alpha panel options" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Hide panel" }));
    expect(screen.queryByText("alpha body")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Panels\s*\(1 hidden\)/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Panels/ }));
    await userEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Alpha" }));
    expect(await screen.findByText("alpha body")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Bravo panel options" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Move up" }));
    await userEvent.click(screen.getByRole("button", { name: "Reset layout" }));
    expect(saved()).toEqual({ layout: panels.map((p) => ({ i: p.id, ...p.layout })), hidden: [] });

    // One click threw the arrangement away; Undo brings it back.
    await userEvent.click(screen.getByRole("button", { name: "Undo layout change" }));
    expect(saved().layout.find((l: { i: string }) => l.i === "b").y).toBe(0);
    expect(screen.getByRole("button", { name: "Reset layout" })).toBeInTheDocument();
  });

  it("starts from the defaults when the saved layout is unreadable", () => {
    localStorage.setItem("pitwall.layout.test.v1", "{not json");
    render(<PanelGrid id="test" panels={panels} />);
    expect(titles()).toEqual(["Alpha", "Bravo"]);
  });
});
