import { describe, expect, it } from "vitest";
import { connect, PacketReader, subscribe } from "../src/mqtt";

const publish = (topic: string, payload: string) => {
  const t = new TextEncoder().encode(topic);
  const body = [t.length >> 8, t.length & 0xff, ...t, ...new TextEncoder().encode(payload)];
  const len: number[] = [];
  for (let n = body.length; ; ) {
    const byte = n % 128;
    n = Math.floor(n / 128);
    len.push(n > 0 ? byte | 0x80 : byte);
    if (!n) break;
  }
  return new Uint8Array([0x30, ...len, ...body]);
};

describe("mqtt", () => {
  it("encodes CONNECT and SUBSCRIBE as MQTT 3.1.1", () => {
    expect([...connect("c", "u", "p", 30)]).toEqual([0x10, 19, 0, 4, 77, 81, 84, 84, 4, 0xc2, 0, 30, 0, 1, 99, 0, 1, 117, 0, 1, 112]);
    expect([...subscribe(1, ["v1/laps"])]).toEqual([0x82, 12, 0, 1, 0, 7, ...new TextEncoder().encode("v1/laps"), 0]);
  });

  it("reassembles packets split across frames, several per frame, with long lengths", () => {
    const long = JSON.stringify({ message: "x".repeat(300) });
    const bytes = new Uint8Array([...publish("v1/laps", long), 0x20, 2, 0, 0, ...publish("v1/pit", "{}")]);
    const r = new PacketReader();
    const out = [...r.push(bytes.subarray(0, 2)), ...r.push(bytes.subarray(2, 200)), ...r.push(bytes.subarray(200))];
    expect(out.map((p) => p.type)).toEqual(["publish", "connack", "publish"]);
    expect(out[0]).toMatchObject({ topic: "v1/laps" });
    if (out[0]!.type === "publish") expect(new TextDecoder().decode(out[0]!.payload)).toBe(long);
    expect(out[1]).toEqual({ type: "connack", returnCode: 0 });
  });
});
