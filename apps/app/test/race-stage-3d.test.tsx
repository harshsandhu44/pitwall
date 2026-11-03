import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RaceStage3D } from "@/components/replay/race-stage-3d";

const stage = (paused?: boolean) => (
  <RaceStage3D
    title="Monaco Grand Prix"
    description="Race · Monaco"
    badge={<span>Replay</span>}
    dashboard="/replay"
    track={null}
    drivers={[]}
    time={() => 0}
    getWindow={() => null}
    rows={[]}
    race
    selected={null}
    onSelect={() => {}}
    tower={<p>tower</p>}
    focus={<p>focus</p>}
    feed={<p>feed</p>}
    playback={<p>scrubber</p>}
    paused={paused}
  />
);

// jsdom has no element fullscreen, so this is the theater fallback (iPhone Safari's path).
describe("3D stage fullscreen", () => {
  it("covers the app chrome, fades the controls when idle and wakes on input", () => {
    vi.useFakeTimers();
    const { container } = render(stage());
    const root = container.firstElementChild!;
    fireEvent.click(screen.getByRole("button", { name: "Fullscreen" }));
    expect(root).toHaveClass("inset-0", "z-40");
    expect(screen.getByRole("button", { name: "Exit fullscreen" })).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(3_000));
    expect(screen.getByText("scrubber").parentElement).toHaveClass("opacity-0");
    expect(screen.getByRole("heading", { name: "Monaco Grand Prix" })).not.toHaveClass("opacity-0");
    expect(root).toHaveClass("cursor-none");

    fireEvent.pointerMove(window);
    expect(screen.getByText("scrubber").parentElement).not.toHaveClass("opacity-0");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(root).not.toHaveClass("z-40");
    vi.useRealTimers();
  });

  it("toggles with F and keeps a paused replay's controls up", () => {
    vi.useFakeTimers();
    render(stage(true));
    fireEvent.keyDown(window, { key: "f" });
    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByText("scrubber").parentElement).not.toHaveClass("opacity-0");
    fireEvent.keyDown(window, { key: "f" });
    expect(screen.getByRole("button", { name: "Fullscreen" })).toBeInTheDocument();
    vi.useRealTimers();
  });
});
