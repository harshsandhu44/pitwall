import { describe, expect, it } from "vitest";
import { lineStyles } from "@/components/standings/points-progression-chart";

const series = [
  { id: "norris", team: "mclaren" },
  { id: "verstappen", team: "red_bull" },
  { id: "piastri", team: "mclaren" },
  { id: "leclerc", team: "ferrari" },
];

describe("lineStyles", () => {
  it("gives team-mates their team colour, solid then dashed", () => {
    const [nor, ver, pia, lec] = lineStyles(series, { mclaren: "#FF8000", red_bull: "#3671C6", ferrari: "#E8002D" });
    expect(nor).toEqual({ color: "#FF8000", dash: "" });
    expect(pia).toEqual({ color: "#FF8000", dash: "6 3" });
    expect(ver).toEqual({ color: "#3671C6", dash: "" });
    expect(lec).toEqual({ color: "#E8002D", dash: "" });
  });

  it("falls back to one grey per team when there are no team colours (before 2023)", () => {
    const [nor, ver, pia, lec] = lineStyles(series, {});
    expect(pia!.color).toBe(nor!.color);
    expect(pia!.dash).toBe("6 3");
    expect(new Set([nor!.color, ver!.color, lec!.color]).size).toBe(3);
    expect(nor!.color).toContain("var(--foreground) 100%");
  });
});
