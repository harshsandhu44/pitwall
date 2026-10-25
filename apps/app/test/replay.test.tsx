import type { ReplayDriver, TimingRow } from "@pitwall/shared";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReplayView } from "@/components/pages/replay-view";
import { type Marker, PlaybackControls } from "@/components/replay/playback-controls";
import { TimingTower, TowerColumnsMenu } from "@/components/replay/timing-tower";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { battlesOf } from "@/components/replay/track-canvas";
import { useReplayClock } from "@/lib/replay-clock";
import { envelope, mockApi, nav, renderWithQuery } from "./utils";

const range = { start: Date.parse("2024-05-26T13:00:00Z"), end: Date.parse("2024-05-26T15:00:00Z") };

function Player({ ready = () => true, markers }: { ready?: (t: number) => boolean; markers?: Marker[] }) {
  const c = useReplayClock(range, ready);
  return (
    <>
      <PlaybackControls state={c.state} range={range} onPlay={c.play} onPause={c.pause} onSeek={c.seek} onSpeed={c.setSpeed} markers={markers} />
      <output>{`${c.state.t - range.start}|${c.state.speed}`}</output>
    </>
  );
}

describe("replay playback", () => {
  it("plays, pauses, changes speed and seeks in recorded session time", async () => {
    render(<Player />);
    await userEvent.click(screen.getByRole("button", { name: "Play replay" }));
    expect(screen.getByRole("button", { name: "Pause replay" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(within(screen.getByRole("group", { name: "Playback speed" })).getByRole("button", { name: "10×" }));
    expect(screen.getByRole("status")).toHaveTextContent(/\|10$/);

    await userEvent.click(screen.getByRole("button", { name: "Pause replay" }));
    fireEvent.change(screen.getByRole("slider", { name: "Replay position" }), { target: { value: String(range.start + 3_600_000) } });
    expect(screen.getByRole("status")).toHaveTextContent(/^3600000\|/);
    expect(screen.getByRole("slider", { name: "Replay position" })).toHaveAttribute("aria-valuetext", expect.stringContaining("1:00:00 into the session"));
  });

  it("takes keyboard shortcuts, but not while typing", async () => {
    render(
      <>
        <Player />
        <input aria-label="Notes" />
      </>,
    );
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{Shift>}{ArrowRight}{/Shift}]]");
    expect(screen.getByRole("status")).toHaveTextContent(/^80000\|5$/);
    await userEvent.keyboard("{ArrowLeft}[[");
    expect(screen.getByRole("status")).toHaveTextContent(/^70000\|2$/);
    await userEvent.keyboard(" ");
    expect(screen.getByRole("button", { name: "Pause replay" })).toBeInTheDocument();
    await userEvent.keyboard(" ");
    expect(screen.getByRole("button", { name: "Play replay" })).toBeInTheDocument();
    const t = screen.getByRole("status").textContent;
    await userEvent.click(screen.getByRole("textbox", { name: "Notes" }));
    await userEvent.keyboard(" ]");
    expect(screen.getByRole("status")).toHaveTextContent(t!);
    expect(screen.getByRole("button", { name: "Play replay" })).toBeInTheDocument();
  });

  it("jumps to an event marker", async () => {
    render(<Player markers={[{ t: range.start + 1_800_000, kind: "sc", label: "Safety car, lap 23" }]} />);
    await userEvent.click(screen.getByRole("button", { name: "Jump to Safety car, lap 23" }));
    expect(screen.getByRole("status")).toHaveTextContent(/^1800000\|/);
  });

  it("advances by wall time × speed and holds while positions are loading", async () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "performance"] });
    let loaded = false;
    render(<Player ready={() => loaded} />);
    fireEvent.click(screen.getByRole("button", { name: "Play replay" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Playback speed" })).getByRole("button", { name: "5×" }));
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(screen.getByRole("status")).toHaveTextContent(/^0\|5$/);
    expect(screen.getByText("Loading recorded positions…")).toBeInTheDocument();

    loaded = true;
    await act(() => vi.advanceTimersByTimeAsync(1000));
    const t = Number(screen.getByRole("status").textContent!.split("|")[0]);
    expect(t).toBeGreaterThan(4000); // ~1 s of wall time at 5×
    expect(t).toBeLessThanOrEqual(5100);
    vi.useRealTimers();
  });
});

describe("timing tower", () => {
  const drivers = new Map<number, ReplayDriver>([
    [16, { number: 16, acronym: "LEC", name: "Charles Leclerc", team: "Ferrari", colour: "#E80020", driverId: "leclerc" }],
    [81, { number: 81, acronym: "PIA", name: "Oscar Piastri", team: "McLaren", colour: "#FF8000", driverId: "piastri" }],
  ]);
  const rows: TimingRow[] = [
    { driver: 16, position: 1, gap: 0, interval: 0, lap: 35, lastLap: 79.319, bestLap: 78.5, compound: "HARD", tyreAge: 34, pits: 1, startPosition: null, sectors: [null, null, null], sectorMark: [null, null, null] },
    { driver: 81, position: 2, gap: "+1 LAP", interval: 1.309, lap: 35, lastLap: null, bestLap: null, compound: null, tyreAge: null, pits: 0, startPosition: null, sectors: [null, null, null], sectorMark: [null, null, null] },
  ];

  it("hides and shows columns from its menu", async () => {
    render(
      <>
        <DropdownMenu>
          <DropdownMenuTrigger>Timing options</DropdownMenuTrigger>
          <DropdownMenuContent>
            <TowerColumnsMenu intervals />
          </DropdownMenuContent>
        </DropdownMenu>
        <TimingTower rows={rows} drivers={drivers} selected={null} onSelect={() => {}} intervals />
      </>,
    );
    expect(screen.getByRole("columnheader", { name: "Gap" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "S1" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Timing options" }));
    await userEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Gap to leader" }));
    await userEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Last-lap sectors" }));
    expect(screen.queryByRole("columnheader", { name: "Gap" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "S1" })).toBeInTheDocument();
    // Back to the defaults for the other tests in this file.
    await userEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Gap to leader" }));
    await userEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Last-lap sectors" }));
    expect(screen.getByRole("columnheader", { name: "Gap" })).toBeInTheDocument();
  });

  it("shows recorded values and leaves unknown ones as dashes", async () => {
    const onSelect = vi.fn();
    render(<TimingTower rows={rows} drivers={drivers} selected={null} onSelect={onSelect} intervals />);
    const [, p1, p2] = screen.getAllByRole("row");
    expect(p1).toHaveTextContent("Leader");
    expect(p1).toHaveTextContent("1:19.319");
    expect(within(p1!).getByText("hard")).toBeInTheDocument();
    expect(p2).toHaveTextContent("+1 LAP");
    expect(p2).toHaveTextContent("+1.309");
    await userEvent.click(within(p2!).getByRole("button", { name: /PIA/ }));
    expect(onSelect).toHaveBeenCalledWith(81);
  });

  it("drops gap columns outside races", () => {
    render(<TimingTower rows={rows} drivers={drivers} selected={null} onSelect={vi.fn()} intervals={false} />);
    expect(screen.queryByRole("columnheader", { name: "Gap" })).not.toBeInTheDocument();
  });
});

describe("replay page", () => {
  it("explains that OpenF1 recordings start in 2023 without calling the replay API", async () => {
    nav.params = new URLSearchParams("season=2019");
    const fetch = mockApi({ "/api/seasons": () => envelope([2026, 2025, 2019]) });
    renderWithQuery(<ReplayView />);
    expect(await screen.findByText(/start with the 2023 season/)).toBeInTheDocument();
    expect(fetch.mock.calls.map(([u]) => String(u))).not.toContainEqual(expect.stringContaining("/api/replay"));
  });
});

describe("battles on the track map", () => {
  const row = (driver: number, position: number | null, interval: number | string | null): TimingRow => ({
    driver, position, gap: null, interval, lap: 10, lastLap: null, bestLap: null, compound: null, tyreAge: null, pits: 0, startPosition: null, sectors: [null, null, null], sectorMark: [null, null, null],
  });

  it("links consecutive cars under a second apart, in running order, ignoring text intervals and unplaced cars", () => {
    const rows = [row(4, 3, 0.4), row(1, 1, null), row(16, 2, 2.1), row(44, 4, "+1 LAP"), row(63, null, 0.2), row(81, 5, 0.9)];
    expect(battlesOf(rows)).toEqual([
      { ahead: 16, behind: 4, interval: 0.4 },
      { ahead: 44, behind: 81, interval: 0.9 },
    ]);
  });
});
