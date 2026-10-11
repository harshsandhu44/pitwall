import {
  type ApiResponse,
  type CareerSeason,
  type ConstructorStanding,
  type DriverStanding,
  finalAt,
  LIVE_UNAVAILABLE_DETAIL,
  type LiveStatus,
  nextSession,
  type PointsProgression,
  type ReplaySession,
  type Standings,
  WINDOW_MS,
} from "@pitwall/shared";
import { z } from "zod";
import { cached, failure, must } from "./cache";
import * as jolpica from "./providers/jolpica";
import * as openf1 from "./providers/openf1";
import * as openmeteo from "./providers/openmeteo";
import * as rainviewer from "./providers/rainviewer";
import { circuitById, mappedSubject } from "./openf1-map";
import { UpstreamError, useOpenF1Login } from "./upstream";

const HOUR = 3600;
const DAY = 86_400;

/** Past seasons are effectively final; the current season changes after each event. */
const seasonTtl = (season: number, current: number) => (season < new Date().getUTCFullYear() ? 30 * DAY : current);

/** OpenF1 publishes classifications minutes after a session; refresh current-season OpenF1 data this often. */
const OPENF1_FRESH = 15 * 60;

/** Seasons from 2023 come from OpenF1; earlier ones from Jolpica, on demand. */
const isOpenF1 = (season: number) => season >= openf1.FIRST_SEASON;

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

const FIRST_SEASON = 1950;

/** Every season with a championship, newest first. Jolpica covers each one, so no upstream call is needed. */
const seasonList = () => Array.from({ length: new Date().getUTCFullYear() - FIRST_SEASON + 1 }, (_, i) => new Date().getUTCFullYear() - i);

// OpenF1 units: small, separately cached pieces each 2023+ view is derived from (see providers/openf1.ts).
const schedule = (env: Env, ctx: ExecutionContext, season: number) =>
  cached(env, ctx, { key: `openf1/schedule/${season}`, source: "openf1", ttl: seasonTtl(season, HOUR) }, () =>
    openf1.schedule(season, env.USER_AGENT),
  );

const championship = (env: Env, ctx: ExecutionContext, season: number) =>
  cached(env, ctx, { key: `openf1/championship/${season}`, source: "openf1", ttl: seasonTtl(season, OPENF1_FRESH) }, async () =>
    openf1.championship(must(await schedule(env, ctx, season)), env.USER_AGENT),
  );

const seasonRaces = (env: Env, ctx: ExecutionContext, season: number) =>
  cached(env, ctx, { key: `openf1/races/${season}`, source: "openf1", ttl: seasonTtl(season, OPENF1_FRESH) }, async () =>
    openf1.seasonRaces(must(await schedule(env, ctx, season)), Date.now(), env.USER_AGENT),
  );

const calendar = (env: Env, ctx: ExecutionContext, season: number) =>
  isOpenF1(season)
    ? cached(env, ctx, { key: `calendar/${season}`, source: "openf1", ttl: seasonTtl(season, HOUR) }, async () =>
        openf1.toCalendar(season, must(await schedule(env, ctx, season))),
      )
    : cached(env, ctx, { key: `calendar/${season}`, source: "jolpica", ttl: seasonTtl(season, 6 * HOUR) }, () =>
        jolpica.calendar(season, env.USER_AGENT),
      );

type AnyStandings = Standings<DriverStanding> | Standings<ConstructorStanding>;

const standings = (
  env: Env,
  ctx: ExecutionContext,
  type: "drivers" | "constructors",
  season: number,
  round: number | null,
): Promise<ApiResponse<AnyStandings>> =>
  cached<AnyStandings>(
    env,
    ctx,
    {
      key: `standings/${type}/${season}/${round ?? "latest"}`,
      source: isOpenF1(season) ? "openf1" : "jolpica",
      ttl: seasonTtl(season, round ? DAY : isOpenF1(season) ? OPENF1_FRESH : HOUR),
    },
    async () => {
      if (!isOpenF1(season)) {
        return (type === "drivers" ? jolpica.driverStandings : jolpica.constructorStandings)(season, round, env.USER_AGENT);
      }
      const [s, c, r] = [must(await schedule(env, ctx, season)), must(await championship(env, ctx, season)), must(await seasonRaces(env, ctx, season))];
      return openf1.toStandings(type, season, round, s, c, r);
    },
  );

/** Cumulative points after each round, from official per-round standings (never re-derived from results). */
async function progression(env: Env, ctx: ExecutionContext, season: number, type: "drivers" | "constructors") {
  const races = must(await calendar(env, ctx, season));
  let lists: AnyStandings[] = [];
  if (isOpenF1(season)) {
    // One championship unit holds every round, so no per-round requests.
    const [s, c, r] = [must(await schedule(env, ctx, season)), must(await championship(env, ctx, season)), must(await seasonRaces(env, ctx, season))];
    lists = s.meetings.map((m) => openf1.toStandings(type, season, m.round, s, c, r)).filter((l) => l.round > 0);
  } else {
    const latest = must(await standings(env, ctx, type, season, null));
    // Sequential on purpose: Jolpica's burst limit is ~4 req/s. Completed rounds are snapshotted individually,
    // so a refresh after a new round needs one new request, and older rounds survive Jolpica refusing.
    for (let round = 1; round < latest.round; round++) {
      lists.push(must(await standings(env, ctx, type, season, round)));
    }
    if (latest.round > 0) lists.push(latest);
  }

  const rounds = lists.map((l) => ({ round: l.round, name: races.find((r) => r.round === l.round)?.name ?? `Round ${l.round}` }));
  const series = new Map<string, { subject: unknown; points: (number | null)[]; positions: (number | null)[] }>();
  lists.forEach((list, i) => {
    for (const e of list.entries as (DriverStanding | ConstructorStanding)[]) {
      const subject = "driver" in e ? e.driver : e.constructor;
      // Unmapped OpenF1 drivers and teams have id "".
      const key = subject.id || ("driver" in e ? `#${e.driver.number}` : e.constructor.name);
      const row = series.get(key) ?? {
        subject,
        points: Array<number | null>(lists.length).fill(null),
        positions: Array<number | null>(lists.length).fill(null),
      };
      row.points[i] = e.points;
      row.positions[i] = e.position;
      series.set(key, row);
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
  const s = mappedSubject(kind, id) ?? (await jolpica.subject(kind, id, env.USER_AGENT));
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
  const known = circuitById(id);
  if (known) return known;
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

// OpenF1 opens a session's data 30 minutes after it ends; wait a little longer so a
// half-processed session isn't cached as if it were complete.
const SESSION_SETTLE_MS = 35 * 60_000;

/** Finished sessions of a season, from the cached schedule. */
const replaySessions = async (env: Env, ctx: ExecutionContext, season: number): Promise<ApiResponse<ReplaySession[]>> => {
  if (season < openf1.FIRST_SEASON) {
    return failure("openf1", new UpstreamError("openf1", "not_found", `OpenF1 replays start in ${openf1.FIRST_SEASON}`));
  }
  const res = await schedule(env, ctx, season);
  const now = Date.now();
  return { ...res, data: res.data && res.data.sessions.filter((s) => Date.parse(s.end) + SESSION_SETTLE_MS < now) };
};

const replay = (env: Env, ctx: ExecutionContext, key: number) =>
  cached(env, ctx, { key: `replay/${key}`, source: "openf1", ttl: 30 * DAY }, () => openf1.replay(key, env.USER_AGENT));

// ---- Live (contract only) ----

/** Always UNAVAILABLE: there is no permitted free live source. Context (next session, latest replay) is best effort. */
async function liveStatus(env: Env, ctx: ExecutionContext): Promise<LiveStatus> {
  const optional = async <T>(f: () => Promise<T>) => {
    try {
      return await f();
    } catch {
      return null;
    }
  };
  const latest = new Date().getUTCFullYear();
  const next = await optional(async () => nextSession(must(await calendar(env, ctx, latest))));
  const latestReplay = await optional(async () => {
    const list = must(await replaySessions(env, ctx, latest));
    return list.at(-1) ?? must(await replaySessions(env, ctx, latest - 1)).at(-1) ?? null;
  });
  return {
    state: "UNAVAILABLE",
    reason: "no_permitted_free_source",
    detail: LIVE_UNAVAILABLE_DETAIL,
    next: next && { race: next.race, session: next.session, inWindow: next.state === "in_window" },
    latestReplay,
  };
}

const liveUnavailable = (): ApiResponse<never> => ({
  status: "unavailable",
  data: null,
  source: "pitwall",
  fetchedAt: null,
  observedAt: null,
  cache: "none",
  maxAgeSeconds: 0,
  reason: `no_permitted_free_source: ${LIVE_UNAVAILABLE_DETAIL}`,
});

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
    async () => ({
      status: "ok",
      data: seasonList(),
      source: "pitwall",
      fetchedAt: new Date().toISOString(),
      observedAt: null,
      cache: "none",
      maxAgeSeconds: DAY,
    }),
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
      return cached(env, ctx, { key: `progression/${type}/${season}`, source: isOpenF1(season) ? "openf1" : "jolpica", ttl: seasonTtl(season, isOpenF1(season) ? OPENF1_FRESH : HOUR) }, () =>
        progression(env, ctx, season, type),
      );
    },
  ],
  [
    /^\/api\/results$/,
    ({ url, env, ctx }) => {
      const season = param(Season, url.searchParams.get("season"), "season");
      if (isOpenF1(season)) {
        return cached(env, ctx, { key: `results/${season}`, source: "openf1", ttl: seasonTtl(season, OPENF1_FRESH) }, async () =>
          openf1.toSeasonResults(season, must(await schedule(env, ctx, season)), must(await seasonRaces(env, ctx, season))),
        );
      }
      return cached(env, ctx, { key: `results/${season}`, source: "jolpica", ttl: seasonTtl(season, HOUR) }, async () => ({
        season,
        races: await jolpica.seasonResults(season, env.USER_AGENT),
      }));
    },
  ],
  [
    /^\/api\/races\/(\d{1,2})$/,
    async ({ url, env, ctx, match }) => {
      const season = param(Season, url.searchParams.get("season"), "season");
      const round = param(Round, match[1], "round");
      const race = must(await calendar(env, ctx, season)).find((r) => r.round === round);
      if (!race) throw new UpstreamError("jolpica", "not_found", `no round ${round} in ${season}`);
      // Refreshed often until the round is final. After that, a copy fetched since it became final is good
      // for up to 30 days, while one fetched before (possibly provisional) is refetched.
      const sinceFinal = (Date.now() - finalAt(race)) / 1000;
      const fresh = isOpenF1(season) ? OPENF1_FRESH : HOUR;
      const ttl = sinceFinal > 0 ? Math.min(30 * DAY, Math.max(fresh, sinceFinal)) : fresh;
      // v3: payload lost fromOpenF1 and 2023+ comes from OpenF1; don't serve older snapshots.
      return cached(env, ctx, { key: `race/v3/${season}/${round}`, source: isOpenF1(season) ? "openf1" : "jolpica", ttl }, async () => {
        if (!isOpenF1(season)) return { race, ...(await jolpica.raceResults(season, round, env.USER_AGENT)), sprintQualifying: [] };
        const s = must(await schedule(env, ctx, season));
        // The calendar is built from this schedule, so the meeting is there.
        return openf1.weekend(race, s.meetings.find((m) => m.round === round)!.key, s, env.USER_AGENT);
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
    /^\/api\/live\/session$/,
    async ({ env, ctx }) => ({
      status: "ok",
      data: await liveStatus(env, ctx),
      source: "pitwall",
      fetchedAt: new Date().toISOString(),
      observedAt: null,
      cache: "none",
      maxAgeSeconds: 60,
    }),
  ],
  [/^\/api\/live\/(timing|positions)$/, async () => liveUnavailable()],
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
      return cached(env, ctx, { key: `team-colours/${season}`, source: "openf1", ttl: seasonTtl(season, DAY) }, async () =>
        // OpenF1 has no colours before 2023; the app shows neutral markers instead.
        isOpenF1(season) ? openf1.toTeamColours(season, must(await seasonRaces(env, ctx, season))) : {},
      );
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

const handler = {
  async fetch(req, env, ctx): Promise<Response> {
    const cors = corsHeaders(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "GET") return json(failure("pitwall", new Error("method not allowed")), 405, cors);

    useOpenF1Login(env.OPENF1_USERNAME, env.OPENF1_PASSWORD);
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
} satisfies ExportedHandler<Env>;

export default handler;
