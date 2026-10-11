import { DurableObject } from "cloudflare:workers";
import { type LiveTimingSnapshot, type PositionWindow, type SessionReplay, timingAt, trackStatus } from "@pitwall/shared";
import * as mqtt from "./mqtt";
import { LIVE_LOCATION_MS, LIVE_TOPICS, type LiveRows, type LiveTopic, liveStart, type SessionRow, toDrivers, toReplay, toWindow } from "./providers/openf1";
import { openf1Token, useOpenF1Login } from "./upstream";

const BROKER = "https://mqtt.openf1.org:8084/mqtt";
const KEEP_ALIVE_S = 30;
const CONNACK_TIMEOUT_MS = 10_000;
/** Disconnect once nobody has asked for live timing for this long. */
const IDLE_MS = 2 * 60_000;

/** A row's identity within its topic, so repeated or updated messages replace earlier ones. */
const KEY: { [T in LiveTopic]: (r: LiveRows[T][number]) => string } = {
  "v1/drivers": (r) => `${r.driver_number}`,
  "v1/laps": (r) => `${r.driver_number}/${r.lap_number}`,
  "v1/stints": (r) => `${r.driver_number}/${r.stint_number}`,
  "v1/pit": (r) => `${r.driver_number}/${r.date}`,
  "v1/race_control": (r) => `${r.date}/${r.message}`,
  "v1/position": (r) => `${r.driver_number}/${r.date}`,
  "v1/intervals": (r) => `${r.driver_number}`, // only the latest is shown
  "v1/location": (r) => `${r.driver_number}/${r.date}`,
  "v1/weather": (r) => r.date,
};

const observed = (r: object) => {
  const t = "date" in r && typeof r.date === "string" ? r.date : "date_start" in r && typeof r.date_start === "string" ? r.date_start : null;
  return t ? Date.parse(t) : 0;
};

/** Everything received for one session, turned into the same timing rows a replay shows. */
export class Feed {
  private rows = new Map<LiveTopic, Map<string, object>>();
  /** Latest source timestamp seen (epoch ms); 0 until the first timed row. */
  observedAt = 0;

  constructor(
    readonly session: SessionRow,
    readonly meetingName: string,
    readonly track: SessionReplay["track"] = null,
  ) {}

  /** Rows fetched from OpenF1's REST API for this session (already validated). */
  addAll(rows: LiveRows) {
    for (const topic of Object.keys(rows) as LiveTopic[]) for (const r of rows[topic]) this.put(topic, r);
  }

  /** One MQTT message: ignored unless it validates and belongs to this session. */
  message(topic: string, row: unknown) {
    if (!(topic in LIVE_TOPICS) || (row as { session_key?: unknown })?.session_key !== this.session.session_key) return;
    const parsed = LIVE_TOPICS[topic as LiveTopic].safeParse(row);
    if (parsed.success) this.put(topic as LiveTopic, parsed.data);
  }

  private put(topic: LiveTopic, r: object) {
    const rows = this.rows.get(topic) ?? new Map<string, object>();
    this.rows.set(topic, rows);
    const key = (KEY[topic] as (r: object) => string)(r);
    // Intervals keep only the newest row per car, even if messages arrive out of order.
    if (topic === "v1/intervals" && observed(rows.get(key) ?? {}) > observed(r)) return;
    rows.set(key, r);
    this.observedAt = Math.max(this.observedAt, observed(r));
  }

  private all<T extends LiveTopic>(topic: T) {
    return [...(this.rows.get(topic)?.values() ?? [])] as LiveRows[T];
  }

  /** Null until any timed data has arrived. */
  snapshot(now: number): LiveTimingSnapshot | null {
    if (!this.observedAt) return null;
    // Locations arrive ~4 times a second per car; keep only the newest few seconds.
    const locations = this.rows.get("v1/location") ?? new Map<string, object>();
    const newest = Math.max(0, ...[...locations.values()].map(observed));
    for (const [k, r] of locations) if (observed(r) < newest - LIVE_LOCATION_MS) locations.delete(k);
    const season = new Date(this.session.date_start).getUTCFullYear();
    const replay = toReplay({
      session: this.session,
      meetingName: this.meetingName,
      drivers: toDrivers(this.all("v1/drivers"), season),
      laps: this.all("v1/laps"),
      stints: this.all("v1/stints"),
      pits: this.all("v1/pit"),
      raceControl: this.all("v1/race_control"),
      weather: this.all("v1/weather"),
      positions: this.all("v1/position"),
    });
    const intervals: PositionWindow["intervals"] = {};
    for (const r of this.all("v1/intervals")) {
      intervals[r.driver_number] = { t: [Date.parse(r.date)], gap: [r.gap_to_leader ?? null], interval: [r.interval ?? null] };
    }
    return {
      session: { key: replay.session.key, meetingName: replay.session.meetingName, name: replay.session.name, type: replay.session.type },
      observedAt: new Date(this.observedAt).toISOString(),
      drivers: replay.drivers,
      rows: timingAt({ ...replay, track: null }, { from: 0, to: 0, cars: {}, intervals }, now),
      raceControl: replay.raceControl.slice(-20),
      status: trackStatus(replay.raceControl, Infinity),
      track: this.track,
      weather: replay.weather.slice(-1),
      positions: { ...toWindow(newest - LIVE_LOCATION_MS, this.all("v1/location"), []), to: newest },
    };
  }
}

/**
 * One shared OpenF1 MQTT connection for every viewer. The first live-timing request inside a session's
 * window connects it (loading the session so far from REST); an alarm disconnects it once nobody has
 * asked for two minutes. A dropped connection reconnects on the next request, with backoff.
 */
export class LiveFeed extends DurableObject<Env> {
  private feed: Feed | null = null;
  private pending: [string, unknown][] = [];
  private ws: WebSocket | null = null;
  private ping: ReturnType<typeof setInterval> | null = null;
  private starting: Promise<void> | null = null;
  /** True while (re)loading the session from REST; messages are held until it's done. */
  private loading = false;
  private lastPoll = 0;
  private retryAt = 0;
  private failures = 0;
  private error: string | null = null;

  /** Latest timing for a session. `snapshot` is null until data arrives; `error` says why the feed is down. */
  async timing(sessionKey: number): Promise<{ snapshot: LiveTimingSnapshot | null; error: string | null }> {
    const now = Date.now();
    this.lastPoll = now;
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(now + 60_000);
    if (this.feed && this.feed.session.session_key !== sessionKey) this.stop();
    if (!this.ws && !this.starting && now >= this.retryAt) {
      this.starting = this.start(sessionKey).finally(() => (this.starting = null));
    }
    // The first viewer waits for the session so far; later ones get whatever is there.
    if (!this.feed && this.starting) await this.starting;
    return { snapshot: this.feed?.snapshot(Date.now()) ?? null, error: this.ws ? null : this.error };
  }

  async alarm() {
    if (Date.now() - this.lastPoll > IDLE_MS) this.stop();
    else await this.ctx.storage.setAlarm(Date.now() + 60_000);
  }

  private async start(sessionKey: number) {
    useOpenF1Login(this.env.OPENF1_USERNAME, this.env.OPENF1_PASSWORD);
    this.loading = true;
    this.pending = [];
    try {
      const token = await openf1Token(this.env.USER_AGENT);
      if (!token) throw new Error("no OpenF1 sponsor login (or it was refused), so there is no live feed");
      // Subscribe first and hold messages, so nothing is lost between the REST load and the stream.
      await this.subscribe(token);
      const s = await liveStart(sessionKey, Date.now(), this.env.USER_AGENT);
      this.feed = new Feed(s.session, s.meetingName, s.track);
      this.feed.addAll(s.rows);
      for (const [topic, row] of this.pending) this.feed.message(topic, row);
      this.pending = [];
      this.failures = 0;
      this.error = null;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      console.error("live feed failed to start", sessionKey, this.error);
      this.stop();
      this.failures++;
      this.retryAt = Date.now() + Math.min(60_000, 5_000 * 2 ** (this.failures - 1));
    } finally {
      this.loading = false;
    }
  }

  private async subscribe(token: string) {
    const res = await fetch(BROKER, { headers: { Upgrade: "websocket", "Sec-WebSocket-Protocol": "mqtt" } });
    const ws = res.webSocket;
    if (!ws) throw new Error(`OpenF1 live feed refused the connection (HTTP ${res.status})`);
    ws.accept();
    ws.binaryType = "arraybuffer";
    const reader = new mqtt.PacketReader();
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("OpenF1 live feed didn't answer")), CONNACK_TIMEOUT_MS);
      ws.addEventListener("message", (e) => {
        for (const p of reader.push(new Uint8Array(e.data as ArrayBuffer))) {
          if (p.type === "connack") {
            clearTimeout(timeout);
            if (p.returnCode !== 0) return reject(new Error(`OpenF1 live feed refused the login (MQTT code ${p.returnCode})`));
            ws.send(mqtt.subscribe(1, Object.keys(LIVE_TOPICS)));
            this.ws = ws;
            this.ping = setInterval(() => ws.send(mqtt.PINGREQ), (KEEP_ALIVE_S * 1000) / 2);
            resolve();
          } else if (p.type === "publish") {
            this.received(p.topic, p.payload);
          }
        }
      });
      const closed = () => {
        clearTimeout(timeout);
        reject(new Error("OpenF1 live feed closed the connection"));
        if (this.ws === ws) {
          this.error = "OpenF1 live feed disconnected";
          this.ws = null;
          if (this.ping !== null) clearInterval(this.ping);
        }
      };
      ws.addEventListener("close", closed);
      ws.addEventListener("error", closed);
      ws.send(mqtt.connect(`pitwall-${crypto.randomUUID()}`, "pitwall", token, KEEP_ALIVE_S));
    }).catch((e) => {
      try {
        ws.close();
      } catch {
        // already closed
      }
      throw e;
    });
  }

  private received(topic: string, payload: Uint8Array) {
    let row: unknown;
    try {
      row = JSON.parse(new TextDecoder().decode(payload));
    } catch {
      return;
    }
    if (this.feed && !this.loading) this.feed.message(topic, row);
    else this.pending.push([topic, row]);
  }

  private stop() {
    if (this.ping !== null) clearInterval(this.ping);
    try {
      this.ws?.close();
    } catch {
      // already closed
    }
    this.ws = null;
    this.feed = null;
    this.pending = [];
  }
}
