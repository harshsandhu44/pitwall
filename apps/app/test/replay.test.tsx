import type { ReplayDriver, SessionReplay, TimingRow } from "@pitwall/shared";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReplayView } from "@/components/pages/replay-view";
import { type Marker, PlaybackControls, replayMarkers } from "@/components/replay/playback-controls";
import { TeamRadio } from "@/components/replay/team-radio";
import { TimingTower, TowerColumnsMenu } from "@/components/replay/timing-tower";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { battlesOf } from "@/components/replay/track-canvas";
import { useReplayClock } from "@/lib/replay-clock";
import { envelope, mockApi, nav, renderWithQuery } from "./utils";

const range = { start: Date.parse("2024-05-26T13:00:00Z"), end: Date.parse("2024-05-26T15:00:00Z") };

function Player({ ready = () => true, markers, onMarker }: { ready?: (t: number) => boolean; markers?: Marker[]; onMarker?: (m: Marker) => void }) {
  const c = useReplayClock(range, ready);
  return (
    <>
      <PlaybackControls state={c.state} range={range} onPlay={c.play} onPause={c.pause} onSeek={c.seek} onSpeed={c.setSpeed} markers={markers} onMarker={onMarker} />
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
    render(<Player markers={[{ t: range.start + 1_800_000, kind: "sc", group: "sc", label: "Safety car, lap 23" }]} />);
    await userEvent.hover(screen.getByRole("button", { name: "Jump to Safety car, lap 23" }));
    expect(await screen.findByText("Safety car, lap 23")).toBeInTheDocument(); // the tooltip
    expect(screen.getByText(/· \+0:30:00$/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Jump to Safety car, lap 23" }));
    expect(screen.getByRole("status")).toHaveTextContent(/^1800000\|/);
  });

  it("shows the event groups picked in the Events menu, remembered, with team radio off at first", async () => {
    const store = new Map<string, string>(); // this jsdom setup has no Web Storage
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    const onMarker = vi.fn();
    const markers: Marker[] = [
      { t: range.start + 60_000, kind: "yellow", group: "yellow", label: "Yellow flag, sector 4" },
      { t: range.start + 120_000, kind: "radio", group: "radio", label: "VER team radio", url: "https://livetiming.formula1.com/static/a.mp3" },
    ];
    render(<Player markers={markers} onMarker={onMarker} />);
    expect(screen.queryByRole("button", { name: "Jump to VER team radio" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Events" }));
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: "Team radio" }));
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: "Yellow flags" }));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument()); // an open menu hides the page from the a11y tree
    expect(screen.queryByRole("button", { name: "Jump to Yellow flag, sector 4" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Jump to VER team radio" }));
    expect(screen.getByRole("status")).toHaveTextContent(/^120000\|/);
    expect(onMarker).toHaveBeenCalledWith(markers[1]);
    expect(JSON.parse(store.get("pitwall.markers.v1")!)).toEqual(["flags", "sc", "penalty", "radio", "laps"]);
    vi.unstubAllGlobals();
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

describe("team radio", () => {
  const ver = { number: 1, acronym: "VER", name: "Max Verstappen", team: "Red Bull Racing", colour: "#3671C6", driverId: "max_verstappen" } as ReplayDriver;
  const drivers = new Map([[1, ver]]);
  const clips = [
    { t: range.start + 60_000, driver: 1, url: "https://livetiming.formula1.com/static/a.mp3" },
    { t: range.start + 120_000, driver: 44, url: "https://livetiming.formula1.com/static/b.mp3" },
  ];

  it("lists only clips published by the replay position, newest first", () => {
    render(<TeamRadio clips={clips} drivers={drivers} t={range.start + 90_000} />);
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([expect.stringMatching(/^Play VER team radio/)]);
    render(<TeamRadio clips={clips} drivers={drivers} t={Infinity} />);
    expect(screen.getByRole("button", { name: /^Play 44 team radio/ })).toBeInTheDocument(); // no driver record: the number
  });

  it("plays a clip with a seek bar, pauses it, and plays a clip cued from the timeline", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event("play"));
      return Promise.resolve();
    });
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event("pause"));
    });
    const { rerender } = render(<TeamRadio clips={clips} drivers={drivers} t={Infinity} />);
    await userEvent.click(screen.getByRole("button", { name: /^Play VER team radio/ }));
    expect(screen.getByRole("button", { name: /^Pause VER team radio/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("slider", { name: "Seek in VER team radio" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Pause VER team radio/ }));
    expect(pause).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Play VER team radio/ })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Seek in VER team radio" })).toBeInTheDocument(); // still the loaded clip

    rerender(<TeamRadio clips={clips} drivers={drivers} t={Infinity} cue={{ url: clips[1]!.url, at: 1 }} />);
    expect(screen.getByRole("button", { name: /^Pause 44 team radio/ })).toBeInTheDocument();
    expect(play).toHaveBeenCalledTimes(2);
  });

  it("says when a session has no radio, or none yet", () => {
    const { rerender } = render(<TeamRadio clips={[]} drivers={drivers} t={Infinity} />);
    expect(screen.getByText("No team radio published for this session.")).toBeInTheDocument();
    rerender(<TeamRadio clips={clips} drivers={drivers} t={range.start} />);
    expect(screen.getByText("No team radio yet at this point.")).toBeInTheDocument();
  });
});

describe("race markers", () => {
  it("marks the start, restart, flags, safety car coming and going, yellows close together as one, and radio", () => {
    const rc = (t: number, category: string, message: string, flag: string | null = null, lap: number | null = null) => ({ t, lap, category, flag, driver: null, message });
    const r = {
      session: { name: "Race", type: "Race" },
      drivers: [{ number: 1, acronym: "VER" }],
      raceControl: [
        rc(0, "Flag", "GREEN LIGHT - PIT EXIT OPEN", "GREEN"),
        rc(1, "SessionStatus", "SESSION STARTED"),
        rc(100_000, "Flag", "YELLOW IN TRACK SECTOR 5", "YELLOW", 3),
        rc(110_000, "Flag", "DOUBLE YELLOW IN TRACK SECTOR 7", "DOUBLE YELLOW", 3),
        rc(200_000, "SafetyCar", "SAFETY CAR DEPLOYED", null, 4),
        rc(300_000, "SafetyCar", "SAFETY CAR IN THIS LAP", null, 6),
        rc(400_000, "Flag", "RED FLAG", "RED", 8),
        rc(500_000, "Flag", "TRACK CLEAR", "CLEAR"),
        rc(600_000, "SessionStatus", "SESSION STARTED"),
        rc(900_000, "Flag", "CHEQUERED FLAG", "CHEQUERED", 50),
      ],
      radio: [{ t: 250_000, driver: 1, url: "https://livetiming.formula1.com/static/a.mp3" }],
      laps: {},
    } as unknown as SessionReplay;
    expect(replayMarkers(r).map((m) => [m.kind, m.group, m.label])).toEqual([
      ["green", "flags", "Start"],
      ["yellow", "yellow", "Double yellow, sectors 5, 7"],
      ["sc", "sc", "Safety car, lap 4"],
      ["radio", "radio", "VER team radio"],
      ["sc-end", "sc", "Safety car in this lap, lap 6"],
      ["red", "flags", "Red flag, lap 8"],
      ["green", "flags", "Track clear"],
      ["green", "flags", "Restart"],
      ["chequered", "flags", "Chequered flag, lap 50"],
    ]);
  });
});

describe("qualifying markers", () => {
  it("marks each segment's start in place of lap markers", () => {
    const rc = (t: number, message: string) => ({ t, lap: null, category: "SessionStatus", flag: null, driver: null, message });
    const r = {
      session: { name: "Sprint Qualifying", type: "Qualifying" },
      raceControl: [rc(0, "SESSION STARTED"), rc(10, "SESSION FINISHED"), rc(20, "SESSION STARTED")],
      laps: { 1: [{ lap: 5, start: 5, duration: 90, sectors: [], pitOut: false }] },
    } as unknown as SessionReplay;
    expect(replayMarkers(r).map((m) => [m.kind, m.label])).toEqual([
      ["segment", "SQ1 starts"],
      ["segment", "SQ2 starts"],
    ]);
  });
});
