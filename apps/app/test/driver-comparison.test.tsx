import type { ReplayDriver } from "@pitwall/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { DriverComparison } from "@/components/replay/driver-comparison";
import { renderWithQuery } from "./utils";

const drivers: ReplayDriver[] = [
  { number: 4, acronym: "NOR", name: "Lando Norris", team: "McLaren", colour: "#FF8000", driverId: null },
  { number: 81, acronym: "PIA", name: "Oscar Piastri", team: "McLaren", colour: "#FF8000", driverId: null },
];

function Harness() {
  const [pair, setPair] = useState<[number, number]>([81, 81]);
  return (
    <>
      <button onClick={() => setPair([4, 81])}>pick NOR</button>
      <DriverComparison sessionKey={1} drivers={drivers} laps={{}} rows={[]} t={0} pair={pair} onPair={setPair} />
    </>
  );
}

describe("driver comparison", () => {
  it("keeps exactly two rows after the same driver was picked twice", async () => {
    renderWithQuery(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "pick NOR" }));
    const body = within(screen.getByRole("table", { name: "The two drivers now" })).getAllByRole("row").slice(1);
    expect(body.map((r) => r.textContent?.slice(0, 3))).toEqual(["NOR", "PIA"]);
  });
});
