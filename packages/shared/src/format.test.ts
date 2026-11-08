import { describe, expect, it } from "vitest";
import { fmtGap, fmtLap, formatCountdown, formatPoints, withSeason } from "./format";

describe("format", () => {
  it("formats lap times", () => {
    expect(fmtLap(83.456)).toBe("1:23.456");
    expect(fmtLap(65.04)).toBe("1:05.040");
    expect(fmtLap(null)).toBe("—");
  });
  it("formats gaps as seconds or OpenF1 text", () => {
    expect(fmtGap(1.2345)).toBe("+1.234");
    expect(fmtGap("+1 LAP")).toBe("+1 LAP");
    expect(fmtGap(null)).toBe("—");
  });
  it("counts down in days, then clock time", () => {
    expect(formatCountdown(2 * 86_400_000 + 3_600_000 + 60_000)).toBe("2d 01h 01m");
    expect(formatCountdown(3_723_000)).toBe("01:02:03");
    expect(formatCountdown(-5)).toBe("00:00:00");
  });
  it("keeps half points", () => {
    expect(formatPoints(25)).toBe("25");
    expect(formatPoints(12.5)).toBe("12.5");
  });
  it("adds the season to links", () => {
    expect(withSeason("/race?round=3", 2024)).toBe("/race?round=3&season=2024");
    expect(withSeason("/calendar", 2024)).toBe("/calendar?season=2024");
    expect(withSeason("/calendar", null)).toBe("/calendar");
  });
});
