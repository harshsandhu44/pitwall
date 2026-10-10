import {
  type ApiResponse,
  type CareerSeason,
  type ConstructorStanding,
  type DriverStanding,
  type PointsProgression,
  type RaceWeekendResults,
  type Standings,
  WINDOW_MS,
} from "@pitwall/shared";
import { z } from "zod";
import { cached, cleanupSnapshots, failure, must } from "./cache";
import * as jolpica from "./providers/jolpica";
import * as openf1 from "./providers/openf1";
import * as openmeteo from "./providers/openmeteo";
import * as rainviewer from "./providers/rainviewer";
import { UpstreamError } from "./upstream";

const HOUR = 3600;
const DAY = 86_400;

/** Past seasons are effectively final; the current season changes after each event. */
const seasonTtl = (season: number, current: number) => (season < new Date().getUTCFullYear() ? 30 * DAY : current);

const Season = z.coerce.number().int().min(1950).max(2100);
const Round = z.coerce.number().int().min(1).max(40);
const Id = z.string().regex(/^[a-z0-9_]{1,64}$/);
const Championship = z.enum(["drivers", "constructors"]);
const Timestamp = z.coerce.number().int().min(0);

class BadRequest extends Error {}

function param<T>(schema: z.ZodType<T>, value: string | null | undefined, name: string): T {
  const r = schema.safeParse(value ?? undefined);
  if (!r.success) throw new BadRequest(`invalid or missing "${name}"`);
  return r.data;
}

type Ctx = { url: URL; env: Env; ctx: ExecutionContext; match: RegExpMatchArray };
type Handler = (c: Ctx) => Promise<ApiResponse<unknown>>;

// ---- Composable cached loaders ----

const calendar = (env: Env, ctx: ExecutionContext, season: number) =>
  cached(env, ctx, { key: `calendar/${season}`, source: "jolpica", ttl: seasonTtl(season, 6 * HOUR) }, () =>
    jolpica.calendar(season, env.USER_AGENT),
  );

type AnyStandings = Standings<DriverStanding> | Standings<ConstructorStanding>;

const standings = (
  env: Env,
  ctx: ExecutionContext,
  type: "drivers" | "constructors",
  season: number,
  round: number | null,
  persist = true,
): Promise<ApiResponse<AnyStandings>> =>
  cached<AnyStandings>(
    env,
    ctx,
    {
      key: `standings/${type}/${season}/${round ?? "latest"}`,
      source: "jolpica",
      ttl: seasonTtl(season, round ? DAY : HOUR),
      persist,
    },
    () => (type === "drivers" ? jolpica.driverStandings : jolpica.constructorStandings)(season, round, env.USER_AGENT),
  );

/** Cumulative points after each round, from Jolpica's official per-round standings (never re-derived from results). */
async function progression(env: Env, ctx: ExecutionContext, season: number, type: "drivers" | "constructors") {
  const races = must(await calendar(env, ctx, season));
  const latest = must(await standings(env, ctx, type, season, null));
  const lists: AnyStandings[] = [];
  // Sequential on purpose: Jolpica's burst limit is ~4 req/s and completed rounds are cached individually.
  for (let round = 1; round < latest.round; round++) {
    lists.push(must(await standings(env, ctx, type, season, round, false)));
  }
  if (latest.round > 0) lists.push(latest);

  const rounds = lists.map((l) => ({ round: l.round, name: races.find((r) => r.round === l.round)?.name ?? `Round ${l.round}` }));
  const series = new Map<string, { subject: unknown; points: (number | null)[]; positions: (number | null)[] }>();
  lists.forEach((list, i) => {
    for (const e of list.entries as (DriverStanding | ConstructorStanding)[]) {
      const subject = "driver" in e ? e.driver : e.constructor;
      const row = series.get(subject.id) ?? {
        subject,
        points: Array<number | null>(lists.length).fill(null),
        positions: Array<number | null>(lists.length).fill(null),
      };
      row.points[i] = e.points;
      row.positions[i] = e.position;
      series.set(subject.id, row);
    }
  });
  const rows = [...series.values()];
  const out: PointsProgression = {
    season,
    rounds,
    drivers: type === "drivers" ? rows.map((r) => ({ driver: r.subject as never, points: r.points, positions: r.positions })) : [],
    constructors:
      type === "constructors" ? rows.map((r) => ({ constructor: r.subject as never, points: r.points, positions: r.positions })) : [],
  };
  return out;
}

// Each season costs one (shared, cached) standings request; keeps a cold profile under the 50-subrequest limit.
const PROFILE_SEASONS = 25;

/** Career = final standings of each season, reusing the cached season standings. */
async function profile(env: Env, ctx: ExecutionContext, kind: "drivers" | "constructors", id: string) {
  const s = await jolpica.subject(kind, id, env.USER_AGENT);
  if (!s) throw new UpstreamError("jolpica", "not_found", `unknown ${kind === "drivers" ? "driver" : "constructor"} "${id}"`);
  const career: CareerSeason[] = [];
  for (const season of s.seasons.slice(0, PROFILE_SEASONS)) {
    const list = must(await standings(env, ctx, kind, season, null));
    const entry = (list.entries as (DriverStanding | ConstructorStanding)[]).find((e) =>
      "driver" in e ? e.driver.id === id : e.constructor.id === id,
    );
    // No entry: took part but is not classified in that championship (e.g. pre-1958 constructors).
    if (!entry) continue;
    career.push({
      season,
      position: entry.position,
      positionText: entry.positionText,
      points: entry.points,
      wins: entry.wins,
      constructors: "driver" in entry ? entry.constructors : [],
    });
  }
  return { ...s, career, seasonsTotal: s.seasons.length };
}

const circuitInfo = async (env: Env, ctx: ExecutionContext, id: string) => {
  const c = must(
    await cached(env, ctx, { key: `circuit/${id}`, source: "jolpica", ttl: 30 * DAY }, async () => {
      const c = await jolpica.circuit(id, env.USER_AGENT);
      if (!c) throw new UpstreamError("jolpica", "not_found", `unknown circuit "${id}"`);
      return c;
    }),
  );
  return c;
};

// ---- Replay (OpenF1) ----

// Our own policy, not OpenF1's: list a session only once it has had time to settle, so a
// half-processed session isn't cached as if it were complete.
const SESSION_SETTLE_MS = 2 * 3_600_000;

const replaySessions = (env: Env, ctx: ExecutionContext, season: number) => {
  if (season < openf1.FIRST_SEASON) {
    return Promise.resolve(failure<never>("openf1", new UpstreamError("openf1", "not_found", `OpenF1 replays start in ${openf1.FIRST_SEASON}`)));
  }
  return cached(env, ctx, { key: `replay/sessions/${season}`, source: "openf1", ttl: seasonTtl(season, HOUR) }, () =>
    openf1.sessions(season, Date.now(), SESSION_SETTLE_MS, env.USER_AGENT),
  );
};

const seasonDrivers = async (env: Env, ctx: ExecutionContext, season: number) =>
  (must(await standings(env, ctx, "drivers", season, null)).entries as DriverStanding[]).map((e) => e.driver);

const replay = (env: Env, ctx: ExecutionContext, key: number) =>
  cached(env, ctx, { key: `replay/${key}`, source: "openf1", ttl: 30 * DAY }, () =>
    openf1.replay(key, (season) => seasonDrivers(env, ctx, season), env.USER_AGENT),
  );

// ---- Routes ----

const routes: [RegExp, Handler][] = [
  [
    /^\/api\/health$/,
    async () => ({
      status: "ok",
      data: { service: "pitwall-api", time: new Date().toISOString() },
      source: "pitwall",
      fetchedAt: new Date().toISOString(),
      observedAt: null,
      cache: "none",
      maxAgeSeconds: 0,
    }),
  ],
  [
    /^\/api\/seasons$/,
    ({ env, ctx }) => cached(env, ctx, { key: "seasons", source: "jolpica", ttl: DAY }, () => jolpica.seasons(env.USER_AGENT)),
  ],
  [/^\/api\/calendar$/, ({ url, env, ctx }) => calendar(env, ctx, param(Season, url.searchParams.get("season"), "season"))],
  [
    /^\/api\/standings\/(drivers|constructors)$/,
    ({ url, env, ctx, match }) => {
      const season = param(Season, url.searchParams.get("season"), "season");
      const round = url.searchParams.has("round") ? param(Round, url.searchParams.get("round"), "round") : null;
      return standings(env, ctx, param(Championship, match[1], "type"), season, round);
    },
  ],
  [
    /^\/api\/standings\/progression$/,
    ({ url, env, ctx }) => {
      const season = param(Season, url.searchParams.get("season"), "season");
      const type = param(Championship, url.searchParams.get("type"), "type");
      return cached(env, ctx, { key: `progression/${type}/${season}`, source: "jolpica", ttl: seasonTtl(season, HOUR) }, () =>
        progression(env, ctx, season, type),
      );
    },
  ],
  [
    /^\/api\/results$/,
    ({ url, env, ctx }) => {
      const season = param(Season, url.searchParams.get("season"), "season");
      return cached(env, ctx, { key: `results/${season}`, source: "jolpica", ttl: seasonTtl(season, HOUR) }, async () => ({
        season,
        races: await jolpica.seasonResults(season, env.USER_AGENT),
      }));
    },
  ],
  [
    /^\/api\/races\/(\d{1,2})$/,
    ({ url, env, ctx, match }) => {
      const season = param(Season, url.searchParams.get("season"), "season");
      const round = param(Round, match[1], "round");
      return cached(env, ctx, { key: `race/${season}/${round}`, source: "jolpica", ttl: seasonTtl(season, HOUR) }, async () => {
        const race = must(await calendar(env, ctx, season)).find((r) => r.round === round);
        if (!race) throw new UpstreamError("jolpica", "not_found", `no round ${round} in ${season}`);
        const results = await jolpica.raceResults(season, round, env.USER_AGENT);
        return { race, ...results } satisfies RaceWeekendResults;
      });
    },
  ],
  [
    /^\/api\/(drivers|teams)\/([^/]+)$/,
    ({ env, ctx, match }) => {
      const kind = match[1] === "drivers" ? "drivers" : "constructors";
      const id = param(Id, match[2], "id");
      return cached(env, ctx, { key: `${kind}/${id}`, source: "jolpica", ttl: DAY }, () => profile(env, ctx, kind, id));
    },
  ],
  [
    /^\/api\/weather\/(forecast|cloud-grid)$/,
    ({ url, env, ctx, match }) => {
      const id = param(Id, url.searchParams.get("circuit"), "circuit");
      const grid = match[1] === "cloud-grid";
      // Forecast + model "current" refresh every 15 min; the 49-point grid hourly (models update at most hourly).
      return cached(
        env,
        ctx,
        { key: `weather/${match[1]}/${id}`, source: "open-meteo", ttl: grid ? HOUR : 15 * 60 },
        async () => {
          const c = await circuitInfo(env, ctx, id);
          return grid
            ? openmeteo.cloudGrid(id, c.lat, c.lon, env.USER_AGENT)
            : openmeteo.forecast(id, c.lat, c.lon, env.USER_AGENT);
        },
      );
    },
  ],
  [
    /^\/api\/replay\/sessions$/,
    ({ url, env, ctx }) => replaySessions(env, ctx, param(Season, url.searchParams.get("season"), "season")),
  ],
  [/^\/api\/replay\/(\d{1,7})$/, ({ env, ctx, match }) => replay(env, ctx, Number(match[1]))],
  [
    /^\/api\/replay\/(\d{1,7})\/window$/,
    async ({ url, env, ctx, match }) => {
      const key = Number(match[1]);
      const from = param(Timestamp, url.searchParams.get("from"), "from");
      if (from % WINDOW_MS !== 0) throw new BadRequest(`"from" must be a multiple of ${WINDOW_MS}`);
      const r = must(await replay(env, ctx, key));
      if (from < r.range.start - WINDOW_MS || from > r.range.end) throw new BadRequest(`"from" is outside session ${key}`);
      // Recorded data never changes: cache for a long time, but only in the Cache API (too bulky for D1).
      return cached(env, ctx, { key: `replay/${key}/window/${from}`, source: "openf1", ttl: 30 * DAY, persist: false }, () =>
        openf1.positionWindow(key, from, r.session.type === "Race", env.USER_AGENT),
      );
    },
  ],
  [
    /^\/api\/team-colours$/,
    ({ url, env, ctx }) => {
      const season = param(Season, url.searchParams.get("season"), "season");
      return cached(env, ctx, { key: `team-colours/${season}`, source: "openf1", ttl: seasonTtl(season, DAY) }, async () => {
        // OpenF1 has no colours before 2023; the app shows neutral markers instead.
        if (season < openf1.FIRST_SEASON) return {};
        const last = must(await replaySessions(env, ctx, season)).at(-1);
        if (!last) return {};
        const entries = must(await standings(env, ctx, "drivers", season, null)).entries as DriverStanding[];
        const ds = openf1.toDrivers(await openf1.drivers(last.key, env.USER_AGENT), entries.map((e) => e.driver));
        const colours: Record<string, string> = {};
        for (const d of ds) {
          const team = entries.find((e) => e.driver.id === d.driverId)?.constructors.at(-1);
          if (team && d.colour && !colours[team.id]) colours[team.id] = d.colour;
        }
        return colours;
      });
    },
  ],
  [
    /^\/api\/weather\/radar$/,
    ({ env, ctx }) =>
      cached(env, ctx, { key: "weather/radar", source: "rainviewer", ttl: 5 * 60, persist: false }, () => rainviewer.radar(env.USER_AGENT)),
  ],
];

const HTTP_STATUS: Record<ApiResponse<unknown>["status"], number> = {
  ok: 200,
  stale: 200,
  not_found: 404,
  unavailable: 503,
  error: 502,
};

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get("Origin");
  const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
  return origin && allowed.includes(origin)
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, OPTIONS", Vary: "Origin" }
    : { Vary: "Origin" };
}

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff", ...headers },
  });

export default {
  async fetch(req, env, ctx): Promise<Response> {
    const cors = corsHeaders(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "GET") return json(failure("pitwall", new Error("method not allowed")), 405, cors);

    const url = new URL(req.url);
    for (const [pattern, handler] of routes) {
      const match = url.pathname.match(pattern);
      if (!match) continue;
      try {
        const res = await handler({ url, env, ctx, match });
        return json(res, HTTP_STATUS[res.status], cors);
      } catch (e) {
        if (e instanceof BadRequest) return json({ ...failure("pitwall", e), status: "error" }, 400, cors);
        if (e instanceof UpstreamError) {
          const res = failure(e.source, e);
          return json(res, HTTP_STATUS[res.status], cors);
        }
        console.error("unhandled", url.pathname, e);
        return json({ ...failure("pitwall", new Error("internal error")), status: "error" }, 500, cors);
      }
    }
    return json({ ...failure("pitwall", new Error("no such endpoint")), status: "not_found" }, 404, cors);
  },

  async scheduled(_controller, env) {
    await cleanupSnapshots(env);
  },
} satisfies ExportedHandler<Env>;
