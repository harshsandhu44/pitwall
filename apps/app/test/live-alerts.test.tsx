import type { LiveTimingSnapshot, SessionReplay } from "@pitwall/shared";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { alertsBetween, setAlertMode, useReplayAlerts } from "@/lib/live-alerts";
import { chime, say } from "@/lib/sounds";

vi.mock("@/lib/sounds", () => ({ chime: vi.fn(() => 300), say: vi.fn(), unlock: vi.fn() }));

const t0 = Date.parse("2026-10-11T12:00:00Z");
const rc = (s: number, category: string, message: string, flag: string | null = null) => ({ t: t0 + s * 1000, lap: 10, category, flag, driver: null, message });

function snap(raceControl: LiveTimingSnapshot["raceControl"], radio: LiveTimingSnapshot["radio"] = []): LiveTimingSnapshot {
  // Status and stewards left out, as from an older API: derived from race control, as the app does.
  return {
    session: { key: 1, meetingName: "Singapore Grand Prix", name: "Race", type: "Race" },
    drivers: [{ number: 4, acronym: "NOR", name: "Lando Norris", team: "McLaren", colour: "#FF8000", driverId: "norris", teamId: "mclaren" }],
    raceControl,
    radio,
  } as Partial<LiveTimingSnapshot> as LiveTimingSnapshot;
}

describe("live alerts", () => {
  const green = [rc(0, "Flag", "GREEN LIGHT - PIT EXIT OPEN", "GREEN")];

  it("is silent when nothing changed", () => {
    expect(alertsBetween(snap(green), snap(green))).toEqual([]);
  });

  it("alerts a safety car with the neutral tone", () => {
    const sc = [...green, rc(60, "SafetyCar", "SAFETY CAR DEPLOYED")];
    expect(alertsBetween(snap(green), snap(sc))).toEqual([expect.objectContaining({ kind: "neutral", voice: "sc", tag: "track" })]);
    // Race control calling it in is a new call, though still a safety car.
    const ending = [...sc, rc(120, "SafetyCar", "SAFETY CAR IN THIS LAP")];
    expect(alertsBetween(snap(sc), snap(ending)).map((a) => a.voice)).toEqual(["sc-ending"]);
  });

  it("alerts a yellow once, not each extra sector", () => {
    const y1 = [...green, rc(60, "Flag", "YELLOW IN TRACK SECTOR 3", "YELLOW")];
    const y2 = [...y1, rc(70, "Flag", "YELLOW IN TRACK SECTOR 4", "YELLOW")];
    expect(alertsBetween(snap(green), snap(y1)).map((a) => a.kind)).toEqual(["flag"]);
    expect(alertsBetween(snap(y1), snap(y2))).toEqual([]);
    const double = [...y2, rc(80, "Flag", "DOUBLE YELLOW IN TRACK SECTOR 4", "DOUBLE YELLOW")];
    expect(alertsBetween(snap(y2), snap(double)).map((a) => a.voice)).toEqual(["double-yellow"]);
  });

  it("alerts new penalties and investigations, not deleted laps", () => {
    const next = [
      ...green,
      rc(60, "Other", "FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 4 (NOR) - CAUSING A COLLISION"),
      rc(61, "Other", "CAR 4 (NOR) TIME 1:35.123 DELETED - TRACK LIMITS AT TURN 7 LAP 9"),
    ];
    expect(alertsBetween(snap(green), snap(next))).toEqual([expect.objectContaining({ kind: "stewards", voice: "penalty", title: "Penalty", body: "5 SECOND TIME PENALTY FOR CAR 4 (NOR) - CAUSING A COLLISION" })]);
  });

  it("alerts each new team-radio clip, with the most important alert first", () => {
    const clip = { t: t0 + 50_000, driver: 4, url: "https://livetiming.formula1.com/static/a.mp3" };
    const next = snap([...green, rc(60, "SafetyCar", "VIRTUAL SAFETY CAR DEPLOYED")], [clip]);
    expect(alertsBetween(snap(green), next).map((a) => [a.kind, a.title])).toEqual([
      ["neutral", "Virtual safety car"],
      ["radio", "Team radio · NOR"],
    ]);
    expect(alertsBetween(next, next)).toEqual([]);
  });
});

describe("replay alerts", () => {
  const replay = {
    session: { key: 2, name: "Race" },
    drivers: [],
    raceControl: [
      rc(0, "Flag", "GREEN LIGHT - PIT EXIT OPEN", "GREEN"),
      rc(10, "SafetyCar", "SAFETY CAR DEPLOYED"),
      rc(100, "Other", "FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 4 (NOR) - CAUSING A COLLISION"),
    ],
    radio: [],
  } as unknown as SessionReplay;

  it("chimes as playback passes an event, but not on a seek or while paused", () => {
    act(() => setAlertMode("chime"));
    vi.mocked(chime).mockClear();
    const { rerender } = renderHook(({ t, playing }) => useReplayAlerts(replay, t, playing), { initialProps: { t: t0 + 9_000, playing: true } });
    rerender({ t: t0 + 11_000, playing: true }); // plays through the safety car
    expect(vi.mocked(chime).mock.calls).toEqual([["neutral"]]);
    rerender({ t: t0 + 120_000, playing: true }); // seeks past the penalty
    rerender({ t: t0 + 9_000, playing: false });
    rerender({ t: t0 + 11_000, playing: false }); // scrubbed back over the safety car, paused
    expect(chime).toHaveBeenCalledTimes(1);
    expect(say).not.toHaveBeenCalled();
    act(() => setAlertMode("off"));
  });

  it("speaks the call after the chime with voice on", () => {
    act(() => setAlertMode("voice"));
    vi.mocked(say).mockClear();
    const { rerender } = renderHook(({ t }) => useReplayAlerts(replay, t, true), { initialProps: { t: t0 + 9_000 } });
    rerender({ t: t0 + 11_000 });
    expect(vi.mocked(say).mock.calls).toEqual([["sc", 400]]); // the mocked chime lasts 300 ms
    act(() => setAlertMode("off"));
  });
});
