import type { GrandPrix, LiveStatus } from "@pitwall/shared";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LiveView } from "@/components/pages/live-view";
import { envelope, mockApi, renderWithQuery } from "./utils";

const race = {
  season: 2026, round: 18, name: "United States Grand Prix", url: null,
  circuit: { id: "americas", name: "Circuit of the Americas", locality: "Austin", country: "USA", lat: 30.1, lon: -97.6, timezone: "America/Chicago", layout: null },
  sessions: [{ kind: "FP1", date: "2026-10-23", start: "2026-10-23T17:30:00Z" }],
} as GrandPrix;

const status = (next: Partial<{ inWindow: boolean }> | null): LiveStatus => ({
  state: "UNAVAILABLE",
  reason: "no_permitted_free_source",
  detail: "No free source permits redistributing live Formula 1 timing.",
  next: next && { race, session: race.sessions[0]!, inWindow: next.inWindow ?? false },
  latestReplay: { key: 11384, meetingKey: 1296, meetingName: "Singapore Grand Prix", name: "Qualifying", type: "Qualifying", circuit: "Singapore", country: "Singapore", start: "2026-10-10T13:30:00.000Z", end: "2026-10-10T14:30:00.000Z" },
});

describe("live page", () => {
  it("states that live timing is unavailable and points to the next session and latest replay", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-10-20T00:00:00Z") });
    mockApi({ "/api/live/session": () => envelope(status({}), { source: "pitwall" }) });
    renderWithQuery(<LiveView />);
    expect(await screen.findByRole("status")).toHaveTextContent("Status: unavailable");
    expect(screen.getByText(/No free source permits/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Singapore Grand Prix · Qualifying" })).toHaveAttribute("href", "/replay?season=2026&session=11384");
    expect(screen.getByRole("link", { name: "United States Grand Prix" })).toBeInTheDocument();
    expect(screen.getByText("Practice 1 starts in")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument(); // no timing tower, ever
    vi.useRealTimers();
  });

  it("doesn't claim an open schedule slot means the session is running", async () => {
    mockApi({ "/api/live/session": () => envelope(status({ inWindow: true }), { source: "pitwall" }) });
    renderWithQuery(<LiveView />);
    expect(await screen.findByText(/doesn't confirm the session is running/)).toBeInTheDocument();
  });
});
