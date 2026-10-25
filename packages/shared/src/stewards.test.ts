import { describe, expect, it } from "vitest";
import { isStewards, penaltyLabel, pendingPenalties, stewardsAt } from "./stewards";

// Shapes as OpenF1 publishes them (2024 races).
const rc = (t: number, message: string, flag: string | null = null) => ({ t, lap: t, category: flag ? "Flag" : "Other", flag, driver: null, message });
const msgs = [
  rc(1, "PIT EXIT CLOSED"),
  rc(2, "TURN 1 INCIDENT INVOLVING CARS 44 (HAM) AND 55 (SAI) NOTED - LEAVING THE TRACK AND GAINING AN ADVANTAGE"),
  rc(3, "FIA STEWARDS: TURN 1 INCIDENT INVOLVING CARS 44 (HAM) AND 55 (SAI) UNDER INVESTIGATION - LEAVING THE TRACK AND GAINING AN ADVANTAGE"),
  rc(4, "CAR 3 (RIC) LAP DELETED - TRACK LIMITS AT TURN 3 LAP 1 15:03:32"),
  rc(5, "FIA STEWARDS: TURN 1 INCIDENT INVOLVING CARS 44 (HAM) AND 55 (SAI) NO FURTHER ACTION - LEAVING THE TRACK AND GAINING AN ADVANTAGE"),
  rc(6, "CAR 27 (HUL) TIME 1:29.202 DELETED - TRACK LIMITS AT TURN 3 LAP 12 15:16:58"),
  rc(7, "FIA STEWARDS: 10 SECOND TIME PENALTY FOR CAR 14 (ALO) - CAUSING A COLLISION"),
  rc(8, "BLACK AND WHITE FLAG FOR CAR 4 (NOR) - TRACK LIMITS", "BLACK AND WHITE"),
  rc(9, "FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 4 (NOR) - TRACK LIMITS"),
  rc(10, "FIA STEWARDS: DRIVE THROUGH PENALTY FOR CAR 2 (SAR) - UNSAFE RELEASE"),
  rc(11, "FIA STEWARDS: PENALTY SERVED - DRIVE THROUGH PENALTY FOR CAR 2 (SAR) - UNSAFE RELEASE"),
  rc(12, "FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 14 (ALO) - SPEEDING IN THE PIT LANE"),
  rc(13, "FIA STEWARDS: 3 PLACE GRID PENALTY FOR CAR 63 (RUS) - IMPEDING"),
  rc(14, "FIA STEWARDS: INCIDENT INVOLVING MCLAREN WILL BE INVESTIGATED AFTER THE RACE - PIT LANE INFRINGEMENT"),
  rc(15, "FIA STEWARDS: CORRECTION: INCIDENT INVOLVING CAR 4 (NOR) NO FURTHER ACTION - JUMP START"),
];

describe("stewardsAt", () => {
  it("classifies each message and names its cars", () => {
    const items = stewardsAt(msgs, Infinity);
    expect(items.map((i) => i.kind)).toEqual([
      "investigation", "investigation", "deleted", "cleared", "deleted", "penalty", "warning", "penalty", "penalty", "served", "penalty", "penalty", "investigation", "cleared",
    ]);
    expect(items[0]!.drivers).toEqual([44, 55]);
    expect(items[5]!).toMatchObject({ kind: "penalty", drivers: [14], text: "10 SECOND TIME PENALTY FOR CAR 14 (ALO) - CAUSING A COLLISION" });
    expect(items[12]!.drivers).toEqual([]);
    expect(msgs.filter(isStewards)).toHaveLength(14);
  });

  it("does not show what the stewards hadn't published yet", () => {
    expect(stewardsAt(msgs, 6.5)).toHaveLength(5);
  });
});

describe("pendingPenalties", () => {
  it("adds time penalties up, drops served ones and leaves grid penalties out", () => {
    const p = pendingPenalties(stewardsAt(msgs, Infinity));
    expect(penaltyLabel(p.get(14))).toBe("+15s");
    expect(penaltyLabel(p.get(4))).toBe("+5s");
    expect(p.has(2)).toBe(false);
    expect(p.has(63)).toBe(false);
    expect(penaltyLabel(pendingPenalties(stewardsAt(msgs, 10)).get(2))).toBe("DT");
  });
});
