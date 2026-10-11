// ponytail: the smallest MQTT 3.1.1 client a live feed needs: connect, subscribe at QoS 0, receive
// PUBLISH, keep alive. mqtt.js doesn't run in workerd (its WebSocket transport never connects).
// QoS 1/2, retained messages and wills aren't supported; add them only if a feed needs them.

const utf8 = new TextEncoder();

function str(s: string) {
  const b = utf8.encode(s);
  return [b.length >> 8, b.length & 0xff, ...b];
}

/** MQTT's variable-length "remaining length" (1–4 bytes, 7 bits each). */
function remaining(n: number) {
  const out: number[] = [];
  do {
    let byte = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) byte |= 0x80;
    out.push(byte);
  } while (n > 0);
  return out;
}

const packet = (header: number, body: number[]) => new Uint8Array([header, ...remaining(body.length), ...body]);

export function connect(clientId: string, username: string, password: string, keepAliveSeconds: number) {
  // Protocol "MQTT" level 4; flags: username, password, clean session.
  return packet(0x10, [...str("MQTT"), 4, 0xc2, keepAliveSeconds >> 8, keepAliveSeconds & 0xff, ...str(clientId), ...str(username), ...str(password)]);
}

export function subscribe(packetId: number, topics: string[]) {
  return packet(0x82, [packetId >> 8, packetId & 0xff, ...topics.flatMap((t) => [...str(t), 0])]);
}

export const PINGREQ = new Uint8Array([0xc0, 0]);

export type Packet =
  | { type: "connack"; returnCode: number }
  | { type: "suback" }
  | { type: "publish"; topic: string; payload: Uint8Array }
  | { type: "pingresp" }
  | { type: "other"; header: number };

/** Splits a byte stream into packets; WebSocket frames may carry several packets or part of one. */
export class PacketReader {
  private buf = new Uint8Array(0);

  push(chunk: Uint8Array): Packet[] {
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf);
    merged.set(chunk, this.buf.length);
    this.buf = merged;
    const out: Packet[] = [];
    for (;;) {
      let len = 0;
      let mult = 1;
      let i = 1;
      for (; ; i++) {
        if (i >= this.buf.length || i > 4) return out; // header not complete yet
        len += (this.buf[i]! & 0x7f) * mult;
        mult *= 128;
        if (!(this.buf[i]! & 0x80)) break;
      }
      const start = i + 1;
      if (this.buf.length < start + len) return out;
      out.push(parse(this.buf[0]!, this.buf.subarray(start, start + len)));
      this.buf = this.buf.slice(start + len);
    }
  }
}

function parse(header: number, body: Uint8Array): Packet {
  switch (header >> 4) {
    case 2:
      return { type: "connack", returnCode: body[1]! };
    case 9:
      return { type: "suback" };
    case 13:
      return { type: "pingresp" };
    case 3: {
      const topicLen = (body[0]! << 8) | body[1]!;
      const qos = (header >> 1) & 3;
      const payloadStart = 2 + topicLen + (qos > 0 ? 2 : 0);
      return { type: "publish", topic: new TextDecoder().decode(body.subarray(2, 2 + topicLen)), payload: body.subarray(payloadStart) };
    }
    default:
      return { type: "other", header };
  }
}
