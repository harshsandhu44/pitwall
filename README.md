# Pitwall

Unofficial Formula 1 dashboard: schedules, standings, results, race-weekend weather and replays of recorded sessions. It runs entirely on free tiers. Not associated with the Formula 1 companies.

| Package | What it is |
|---|---|
| `apps/app` | Next.js 16 static export (no server). Talks only to the API. Served as Workers static assets. See [apps/app/README.md](apps/app/README.md). |
| `apps/api` | Cloudflare Worker. Validates and normalizes upstream data, caches it (Cache API), and keeps a last-known-good copy in D1. See [apps/api/README.md](apps/api/README.md). |
| `packages/shared` | Domain types, the API response envelope, the live-timing contract, and pure helpers (schedule state, session weather, replay interpolation and timing) used by both. |

```
browser ──► app (static files) ──► api Worker ──► Jolpica · OpenF1 · Open-Meteo · RainViewer (metadata)
   │                                   │
   │                                   ├─ Cache API (per data centre, short-lived)
   │                                   └─ D1 upstream_snapshot (global, last good copy)
   └──► map tiles straight from OpenFreeMap and RainViewer
```

## Quick start

```sh
pnpm install
cp apps/app/.env.example apps/app/.env.local      # NEXT_PUBLIC_API_URL=http://localhost:8787
pnpm --filter api db:migrate:local                # create the local D1 table
pnpm dev                                          # API on :8787, app on :3000
```

No accounts or API keys are needed. To override API settings locally (for example, CORS origins), copy `apps/api/.dev.vars.example` to `apps/api/.dev.vars`. To check the production build locally, run `pnpm --filter app build && pnpm --filter app preview`, which serves `out/` on :8788.

## Checks

```sh
pnpm check-types && pnpm lint && pnpm test && pnpm build
```

Tests mock every upstream and never touch the network. Fixtures are trimmed copies of real responses.

## Pages

| Route | What it shows |
|---|---|
| `/` | Next session with countdown, weather for the next race, most recent result, top of both championships |
| `/live` | Live-timing status. Always "unavailable" (see below), with the next session and the latest replay |
| `/calendar` | Season calendar with local session times |
| `/standings` | Driver and constructor standings, points progression, results matrix |
| `/race?season=&round=` | Weekend schedule, race, sprint and qualifying classifications |
| `/driver?id=`, `/team?id=` | Career by season |
| `/weather?round=&session=` | Radar, cloud and wind map, forecast timeline and per-session summary |
| `/replay?season=&session=` | Recorded OpenF1 session: track, timing tower, comparison, race control, track weather |

Every page also takes `?season=`. Query parameters, not path segments, keep the app a plain static export.

## Data sources and terms

- **Jolpica F1** (`api.jolpi.ca`): calendar, results and standings. Rate limited (~4 req/s burst, ~500 req/hour); the API paces and caches requests to stay inside it.
- **F1DB** (CC BY 4.0): decorative circuit layouts in `apps/app/public/circuits` and the circuit registry in `apps/api/src/circuits.json` (regenerate with `apps/api/scripts/gen-circuits.mjs`).
- **Open-Meteo** (CC BY 4.0, free tier is non-commercial only): hourly forecast plus model "current" conditions per circuit, refreshed every 15 min. Also a 7×7 cloud/wind grid at 0.25°, refreshed hourly, with 3-hourly forecast steps for 7 days. "Current" is a model analysis, not a track measurement, and is labelled that way.
- **RainViewer** (personal/educational use only): observed radar frames for the last ~2 hours at 10-minute steps. Free tier since 2026-01-01: Universal Blue colours, max zoom 7, 100 requests/IP/minute, no nowcast or satellite. Tiles load straight from RainViewer in the browser, and only the current and next frame are requested.
- **OpenFreeMap** (© OpenMapTiles, data © OpenStreetMap): base map tiles, no key needed.
- **OpenF1** (free tier: historical data from 2023, personal use, 3 requests/s and 30/minute, no live data): session replays and team colours from 2023 onward. Earlier seasons show neutral team markers and no replay. OpenF1 also fills race-weekend classifications Jolpica hasn't published yet, and sprint qualifying, which Jolpica never publishes (see below).

Pitwall is a personal, non-commercial project. Commercial use would need paid Open-Meteo access, a different radar provider and OpenF1's permission.

## Every API response

```json
{ "status": "ok | stale | not_found | unavailable | error", "data": {}, "source": "jolpica",
  "fetchedAt": "ISO", "observedAt": null, "cache": "hit | miss | stale | fallback | none", "maxAgeSeconds": 3600, "reason": "…" }
```

HTTP status follows `status`: 200 (`ok`, `stale`), 404, 503 (`unavailable`), 502 (`error`), and 400 for bad parameters. `stale` + `fallback` means the provider failed and the last good copy from D1 was served. The full endpoint list is in [apps/api/README.md](apps/api/README.md).

## Caching and refresh policy

| Data | Fresh for | Notes |
|---|---|---|
| Seasons, driver/team profiles | 1 day | |
| Calendar | 6 h | Past seasons: 30 days (applies to every Jolpica row below) |
| Latest standings, results, race weekend, points progression | 1 h | Per-round standings: 1 day |
| Circuit coordinates | 30 days | |
| Forecast (+ model current) | 15 min | |
| Cloud/wind grid | 1 h | |
| Radar frame list | 5 min | Not written to D1 |
| Replay session list | 1 h | Past seasons: 30 days |
| Replay session, position windows | 30 days | Recorded data doesn't change. Windows live in the Cache API only |
| Team colours | 1 day | Past seasons: 30 days |

Cache API entries are kept for twice their freshness. A stale entry is served immediately while it refreshes in the background. The Cache API is per data centre, so every successful upstream response is also written to D1 (up to 1.5 MB). A Cache API miss checks D1 first and reuses a still-fresh copy, so each upstream is refreshed about once per freshness window globally rather than once per data centre. If an upstream fails, the D1 copy is served as `stale`. A stale Cache API entry also checks D1 for a newer copy before calling the upstream. A daily cron deletes snapshots older than 30 days.

**Jolpica and Workers.** Jolpica sits behind Cloudflare and rate-limits by IP (500 requests/hour). Every Worker reaches another Cloudflare zone from the same IP, so the deployed Worker shares that budget with all other Workers and is often refused with a 429. To cope, a cron runs every 10 minutes and refreshes the current season through the normal routes: seasons, calendar, standings, progression, results matrix, and the last race. Whatever succeeds is written to D1 for every data centre; refusals keep serving the last snapshot as `stale`. Older seasons are fetched only when someone opens them, so the first visit may show "rate limited" until a request gets through. Per-round standings are stored individually, so the points progression needs only the newest round from Jolpica.

### D1 schema

One table (`apps/api/migrations/0001_upstream_snapshot.sql`):

```sql
CREATE TABLE upstream_snapshot (
  key TEXT PRIMARY KEY,         -- cache key, e.g. "calendar/2026"
  source TEXT NOT NULL,         -- jolpica | openf1 | open-meteo | rainviewer
  payload TEXT NOT NULL,        -- normalized JSON
  fetched_at INTEGER NOT NULL,  -- epoch ms
  expires_at INTEGER NOT NULL   -- epoch ms; the cron cleanup deletes rows past this
);
```

Telemetry is never stored in D1. Replay position windows are fetched on demand and cached for a short time.

### Free-tier budget

- **Open-Meteo, worst case per circuit viewed all day:** the forecast costs 96 requests ≈ 240 weighted calls (22 variables, 16 days). The cloud grid costs 24 requests × 49 locations ≈ 1,180 calls. That's about 1,400 calls/day against the 10,000/day free limit.
- **OpenF1:** a session's first load is ~10 requests, then cached for 30 days. Each 60 s position window costs 2 requests. One viewer at 10× needs about 20 requests a minute. The Worker paces OpenF1 to 3/s and 30/minute per isolate, and answers `rate_limited` rather than queueing for more than 20 s.
- **Jolpica:** completed rounds and past seasons are cached for 30 days, and requests are paced at ~4/s. A cold driver profile reads at most 25 seasons, which keeps it under the Workers limit of 50 subrequests per request.
- **Workers Free:** 100,000 requests/day and 10 ms CPU per request. The heaviest request, a cold replay window, measures about 5 ms. The API bundle is ~870 KB (140 KB gzip) against the 3 MB limit.
- **D1 Free:** one write per upstream refresh, far below 100,000 writes/day.

## Results before Jolpica publishes

Jolpica is the source of record for results, but it usually publishes a round some time after the weekend, and it never covers sprint qualifying. For 2023 onward, `/api/races/:round` fills in finished sessions Jolpica hasn't published from OpenF1's `session_result`, and lists them in `fromOpenF1`. The race page labels these tables "Provisional · OpenF1": they come from timing data, before any later stewards' decisions. Jolpica's official classification replaces them on the next refresh after it publishes (at most an hour for the current season).

- Drivers are matched to Jolpica by code, then by number. Teams come from this weekend's Jolpica results if there are any. Otherwise they come from OpenF1's team name, mapped through drivers who raced for only one constructor this season. Jolpica's list of a driver's constructors isn't in chronological order, so it can't say which team is current.
- A driver or team Jolpica doesn't know yet is still listed, without a profile link.
- If OpenF1 is unavailable, the page shows Jolpica's data only.

## Replay

`/replay?season=&session=<OpenF1 session key>` plays back a recorded session. It is never presented as live.

- `/api/replay/:key` returns the whole session except positions:
  - drivers, matched to Jolpica ids by code, then by number
  - laps, stints, pit-lane visits and running order
  - race control and track weather
  - a track outline traced from the fastest clean lap's recorded positions

  The outline is in the same coordinate space as the cars, so nothing has to be aligned by hand. The first load costs about 10 OpenF1 requests, and the result is then cached for 30 days.
- `/api/replay/:key/window?from=<ms>` returns one fixed, aligned 60 s window of car positions, plus gaps for races. Each window includes 1 s of overlap on each side, so interpolation never needs a neighbouring window. Windows are cached in the Cache API only (~110 KB each). A cold window costs 2 OpenF1 requests and about 5 ms of CPU.
- The browser loads the current window plus the next two, and drops windows it hasn't used for a minute. The clock holds while a window is loading.
- Cars are interpolated only between samples less than 1 s apart. Otherwise the last sample is shown as stale.
- Sessions are listed two hours after they end. This is our own rule, so half-processed data isn't cached as final.

## Live timing

`/api/live/session` always reports `UNAVAILABLE` with reason `no_permitted_free_source`, along with the next scheduled session and the latest replay. `/api/live/timing` and `/api/live/positions` return HTTP 503 with that same reason. Recorded data is never labelled live.

Why there's no live adapter: OpenF1 serves live data only to paying sponsors (€9.90/month, personal use). Formula 1's own live timing feed is technically reachable, but there is no permission to redistribute it. Both conflict with this project's zero-cost and permitted-sources rules.

The contract is already defined in `packages/shared/src/live.ts`:
- `LiveStatus` is a `LIVE | DELAYED | REPLAY | UNAVAILABLE` union.
- `LiveTimingSnapshot` and `LivePositionsSnapshot` each carry their source `observedAt`.

Real live tracking would need:

1. **A licensed source**, such as an OpenF1 sponsor account. Its OAuth credentials would be a Worker secret, never shipped to the browser.
2. **One shared upstream connection per session.** A Durable Object would subscribe to OpenF1's MQTT/WebSocket feed only while a session is scheduled (started by an alarm or the cron), reconnect with exponential backoff, and disconnect afterwards.
3. **Validation and normalization.** The Durable Object would validate and normalize each message into the shared snapshot types (rejecting out-of-order timestamps), keep the latest verified state, and fan it out to browsers over WebSocket or Server-Sent Events.
4. **Live states.** `/api/live/*` would report `LIVE` (or `DELAYED`, with `delaySeconds`) based on how old `observedAt` is, falling back to `UNAVAILABLE` whenever the feed goes quiet.
5. **A live view** built from the existing replay pieces (`TimingTower`, `TrackCanvas`) fed by snapshots instead of the replay clock.

## Accessibility

- Every data table has a caption.
- Status changes use `role="status"` / `aria-live`, and errors use `role="alert"`.
- Colours are never the only signal: team marks sit next to team names, tyres show a letter, and position changes have text labels.
- The track map and weather map have text equivalents in the timing tower and forecast tables.
- Nothing animates on its own. Radar and replay playback start only on request, and `prefers-reduced-motion` turns off transitions and spinners.
- Lighthouse accessibility scores 100 on home, live, standings, weather and replay.

## Deploying

Production is https://f1.harshsandhu.com (zone `harshsandhu.com`, D1 database `pitwall`). The app Worker owns the hostname as a custom domain. The API Worker is a route on `f1.harshsandhu.com/api/*`, which runs in front of the custom domain, so the app calls the API on the same origin with no CORS.

```sh
pnpm --filter app run deploy   # builds with relative API URLs, uploads the static assets
pnpm --filter api run deploy   # applies D1 migrations, then deploys the Worker and its crons
```

Deploy the app first on a fresh zone: its custom domain creates the proxied DNS record the API route needs. Check the configuration without deploying: `npx wrangler deploy --dry-run` in each app.

To fill an empty or long-stale D1 from your own IP (outside Jolpica's shared Worker limit), run the API locally with the D1 binding set to `"remote": true` in a copy of `wrangler.jsonc`, then request the pages you want cached. Each successful response is written to production D1.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Can't reach the Pitwall API" | Start the API (`pnpm dev`) and check `NEXT_PUBLIC_API_URL` in `apps/app/.env.local` |
| Browser console shows CORS errors | Add the app's origin to `ALLOWED_ORIGINS` (`apps/api/.dev.vars` locally, `wrangler.jsonc` when deployed) |
| API errors mentioning `upstream_snapshot` | Run `pnpm --filter api db:migrate:local` |
| Weather map blank, "Worker failed to load" | Start the app through its package scripts (`pnpm dev` / `pnpm build`). They copy MapLibre's worker into `public/maplibre/` |
| Replay says "request budget used up" | OpenF1's free tier allows 30 requests/minute. Wait a minute, or play at a lower speed until windows are cached |
| A panel says "stale" | An upstream failed and the last good copy is shown. It refreshes when the provider recovers |
| No replay for a season | OpenF1's free recordings start in 2023. Sessions appear about two hours after they end |
