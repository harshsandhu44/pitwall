import { describe, expect, it } from "vitest";
import { kerbs, lapLength, type Pt, skyFor, toMetres } from "@/lib/circuit-geo";

// A stadium in SVG units: two 200-unit straights joined by tight 20-unit-radius hairpins, sampled every unit or so.
function stadium(): Pt[] {
  const pts: Pt[] = [];
  for (let x = 0; x < 200; x += 2) pts.push([x, 0]);
  for (let a = -90; a < 90; a += 5) pts.push([200 + 20 * Math.cos((a * Math.PI) / 180), 20 + 20 * Math.sin((a * Math.PI) / 180)]);
  for (let x = 200; x > 0; x -= 2) pts.push([x, 40]);
  for (let a = 90; a < 270; a += 5) pts.push([20 * Math.cos((a * Math.PI) / 180), 20 + 20 * Math.sin((a * Math.PI) / 180)]);
  return pts;
}

describe("circuit geometry", () => {
  it("scales the outline to the real lap length, centred on the origin", () => {
    const m = toMetres(stadium(), 5.793);
    expect(lapLength(m)).toBeCloseTo(5793, 0);
    const xs = m.map((p) => p[0]);
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0, 6);
  });

  it("puts kerbs in the hairpins and none on the straights", () => {
    const raw = stadium();
    const k = kerbs(toMetres(raw, 1.2)); // hairpins about 50 m in radius
    const idx = (pred: (p: Pt) => boolean) => raw.findIndex(pred);
    expect(k[idx(([x, y]) => x === 100 && y === 0)]).toBe(false); // mid-straight
    expect(k[idx(([x, y]) => x > 219 && Math.abs(y - 20) < 1)]).toBe(true); // hairpin apex
  });

  it("lights a race from its local start time", () => {
    expect(skyFor("2026-09-06T13:00:00Z", "Europe/Rome")).toBe("day"); // Monza 15:00
    expect(skyFor("2026-11-21T06:00:00Z", "America/Los_Angeles")).toBe("night"); // Las Vegas 22:00
    expect(skyFor("2026-10-11T12:00:00Z", "Asia/Singapore")).toBe("night"); // 20:00
    expect(skyFor("2026-03-01T15:00:00Z", "Asia/Bahrain")).toBe("sunset"); // 18:00
    expect(skyFor("2026-12-06T13:00:00Z", "Asia/Dubai")).toBe("golden"); // Abu Dhabi 17:00
    expect(skyFor(null, "Europe/Rome")).toBe("day");
    expect(skyFor("2026-09-06T13:00:00Z", null)).toBe("day");
  });
});
