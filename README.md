# Pitwall

Unofficial Formula 1 dashboard: live timing, schedules, standings, results, race-weekend weather and replays of recorded sessions. It runs on free tiers plus an OpenF1 sponsor account. Not associated with the Formula 1 companies.

| Package | What it is |
|---|---|
| `apps/app` | Next.js 16 static export (no server). Talks only to the API. Served as Workers static assets. See [apps/app/README.md](apps/app/README.md). |
| `apps/api` | Cloudflare Worker. Validates and normalizes upstream data, caches it (Cache API), and keeps a last-known-good copy in D1. See [apps/api/README.md](apps/api/README.md). |
| `packages/shared` | Domain types, the API response envelope, the live-timing contract, and pure helpers (schedule state, session weather, replay interpolation and timing) used by both. |

```
browser ──► app (static files) ──► api Worker ──► OpenF1 (2023+) · Jolpica (before 2023) · Open-Meteo · RainViewer (metadata)
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

No accounts or API keys are needed: without an OpenF1 login the API uses OpenF1's free tier. To override API settings locally (for example, CORS origins), copy `apps/api/.dev.vars.example` to `apps/api/.dev.vars`. To check the production build locally, run `pnpm --filter app build && pnpm --filter app preview`, which serves `out/` on :8788.

## Checks

```sh
pnpm check-types && pnpm lint && pnpm test && pnpm build
```

Tests mock every upstream and never touch the network. Fixtures are trimmed copies of real responses.

## Pages

| Route | What it shows |
|---|---|
| `/` | The next weekend (countdown, circuit, session strip), or a live band with the top three while a session streams; weather for the next race, most recent result, top of both championships |
| `/live` | Live dashboard during a session (OpenF1): session status, track map, timing, driver focus, race control, track weather; otherwise the next session and the latest replay |
| `/calendar` | Season calendar with local session times |
| `/standings` | Driver and constructor standings, points progression, results matrix |
| `/race?season=&round=&tab=` | The weekend page. Results: schedule and race, sprint and qualifying classifications. Weather (newest season only): radar, cloud and wind map, forecast timeline and per-session summary. Sessions (2023 on): replay links for the weekend's recorded sessions |
| `/driver?id=`, `/team?id=` | Career by season |
| `/weather?round=` | Redirects to that round's Weather tab (old links) |
| `/replay?season=&session=` | Recorded OpenF1 session on the same dashboard as live, plus driver comparison and playback |

Every page also takes `?season=`. Query parameters, not path segments, keep the app a plain static export.

## Design

- **Tokens** live in `apps/app/src/app/globals.css`: graphite surfaces and a signal red (`--live` for stripes and the LIVE marker, a deeper `--primary` for filled buttons so white text keeps 4.5:1), defined for both themes. Theme follows the system until the toggle picks one.
- **Type:** Archivo, with its widest cut (`font-display`) for page titles and panel headers; Geist Mono for times and gaps.
- **Shape:** square everywhere; panels have one cut corner (`panel-cut`) and a red stripe on the header. Flag, tyre and team colours are data colours, not accents.
- **Navigation:** a top bar, and a bottom tab bar on phones. Live gets a dot while the calendar says a session is in its slot (no extra requests).

## Dashboard panels

`/live` and `/replay` are grids of panels (`components/dashboard/panel-grid.tsx`, on react-grid-layout).

- Drag a panel by its title and resize it from the bottom-right corner. Each panel's ⋯ menu moves it (it trades places with the neighbour in that direction), resizes it in quarter-width steps, or hides it; that menu is the keyboard and touch path.
- Phones (under 768 px) stack the panels in the saved order; the menu still reorders and hides.
- Layouts and hidden panels are saved per browser in `localStorage` (`pitwall.layout.live.v1`, `pitwall.layout.replay.v1`). "Panels" brings hidden ones back and "Reset layout" restores the default.

## Data sources and terms

- **Jolpica F1** (`api.jolpi.ca`): calendar, results, standings and profiles for seasons before 2023, fetched on demand. Rate limited (~4 req/s burst, ~500 req/hour); the API paces and caches requests to stay inside it.
- **F1DB** (CC BY 4.0): decorative circuit layouts in `apps/app/public/circuits` and the circuit registry in `apps/api/src/circuits.json` (regenerate with `apps/api/scripts/gen-circuits.mjs`).
- **Open-Meteo** (CC BY 4.0, free tier is non-commercial only): hourly forecast plus model "current" conditions per circuit, refreshed every 15 min. Also a 7×7 cloud/wind grid at 0.25°, refreshed hourly, with 3-hourly forecast steps for 7 days. "Current" is a model analysis, not a track measurement, and is labelled that way.
- **RainViewer** (personal/educational use only): observed radar frames for the last ~2 hours at 10-minute steps. Free tier since 2026-01-01: Universal Blue colours, max zoom 7, 100 requests/IP/minute, no nowcast or satellite. Tiles load straight from RainViewer in the browser, and only the current and next frame are requested.
- **OpenFreeMap** (© OpenMapTiles, data © OpenStreetMap): base map tiles, no key needed.
- **OpenF1** (sponsor tier, personal use: 6 requests/s and 60/minute; data from 2023): everything for 2023 onward, including calendar, standings, results, profiles, replays and team colours (see below). Earlier seasons show neutral team markers and no replay. Without a login the API falls back to the free tier, which refuses all requests while a session is live.

Pitwall is a personal, non-commercial project. Commercial use would need paid Open-Meteo access, a different radar provider and OpenF1's permission.

## Every API response

```json
{ "status": "ok | stale | not_found | unavailable | error", "data": {}, "source": "jolpica",
  "fetchedAt": "ISO", "observedAt": null, "cache": "hit | miss | stale | none", "maxAgeSeconds": 3600, "reason": "…" }
```

HTTP status follows `status`: 200 (`ok`, `stale`), 404, 503 (`unavailable`), 502 (`error`), and 400 for bad parameters. `stale` means the last good copy was served while a refresh runs in the background. The full endpoint list is in [apps/api/README.md](apps/api/README.md).

## Caching and refresh policy

| Data | Fresh for | Notes |
|---|---|---|
| Seasons, driver/team profiles | 1 day | |
| Calendar | 6 h | Past seasons: 30 days (applies to every Jolpica row below) |
| Latest standings, results, race weekend, points progression | 15 min (OpenF1) / 1 h (Jolpica) | Per-round standings: 1 day. A race weekend is final a week after the race: then a copy fetched since is good for 30 days |
| OpenF1 season schedule | 1 h | Past seasons: 30 days |
| Circuit coordinates | 30 days | |
| Forecast (+ model current) | 15 min | |
| Cloud/wind grid | 1 h | |
| Radar frame list | 5 min | Not written to D1 |
| Replay session list | 1 h | Derived from the season schedule |
| Replay session, position windows | 30 days | Recorded data doesn't change. Windows live in the Cache API only |
| Team colours | 1 day | Past seasons: 30 days |

Cache API entries are kept for twice their freshness. A stale entry is served immediately while it refreshes in the background. The Cache API is per data centre, so every successful upstream response is also written to D1 (up to 1.5 MB). A Cache API miss checks D1 first and reuses a still-fresh copy, so each upstream is refreshed about once per freshness window globally rather than once per data centre. An expired D1 copy is served immediately as `stale` while the upstream is called in the background, so a request only waits on an upstream when there is no copy at all. A stale Cache API entry also checks D1 for a newer copy before calling the upstream. Snapshots never expire: each key is overwritten in place, and the set of keys is bounded.

**Jolpica and Workers.** Jolpica sits behind Cloudflare and rate-limits by IP (500 requests/hour). Every Worker reaches another Cloudflare zone from the same IP, so the deployed Worker shares that budget with all other Workers and is often refused with a 429. That's why 2023 onward comes from OpenF1, which doesn't have this problem. Seasons before 2023 are fetched from Jolpica only when someone opens them, so the first visit may show "rate limited" until a request gets through. Snapshots never expire, so whatever succeeds stays. Per-round standings are stored individually, so the points progression needs only the newest round from Jolpica.

### D1 schema

One table (`apps/api/migrations/`):

```sql
CREATE TABLE upstream_snapshot (
  key TEXT PRIMARY KEY,         -- cache key, e.g. "calendar/2026"
  source TEXT NOT NULL,         -- jolpica | openf1 | open-meteo | rainviewer
  payload TEXT NOT NULL,        -- normalized JSON
  fetched_at INTEGER NOT NULL   -- epoch ms
);
```

Telemetry is never stored in D1. Replay position windows are fetched on demand and cached for a short time.

### Free-tier budget

- **Open-Meteo, worst case per circuit viewed all day:** the forecast costs 96 requests ≈ 240 weighted calls (22 variables, 16 days). The cloud grid costs 24 requests × 49 locations ≈ 1,180 calls. That's about 1,400 calls/day against the 10,000/day free limit.
- **OpenF1:** a season's schedule is 2 requests, its championship 3, and its races (entry lists and results) 2. A race weekend is 3. A replay session's first load is ~10 requests, then cached for 30 days. Each 60 s position window costs 2 requests. One viewer at 10× needs about 20 requests a minute. The Worker paces OpenF1 to 3/s and 30/minute per isolate (half the sponsor limit, since isolates don't share the count), and answers `rate_limited` rather than queueing for more than 20 s.
- **Jolpica:** completed rounds and past seasons are cached for 30 days, and requests are paced at ~4/s. A cold driver profile reads at most 25 seasons, which keeps it under the Workers limit of 50 subrequests per request.
- **Workers Free:** 100,000 requests/day and 10 ms CPU per request. A whole OpenF1 season of entry lists or results is ~1 MB of JSON (~7 ms to parse), so season-wide queries ask for race sessions only and each unit is cached separately, keeping every cold request to a few hundred KB. The heaviest request, a cold replay window, measures about 5 ms. The API bundle is ~900 KB (145 KB gzip) against the 3 MB limit.
- **D1 Free:** one write per upstream refresh, far below 100,000 writes/day.

## OpenF1 seasons (2023 onward)

Every 2023+ view is derived from a few small, separately cached units:

- **Schedule** (`sessions` + `meetings` for the year). The calendar is the Grands Prix by date, with testing and cancelled meetings left out. A round is its position in that list, which matches Jolpica's rounds. Circuits come from `circuits.json` by season and round, because OpenF1's circuit keys aren't reliable.
- **Championship** (`championship_drivers`, `championship_teams` and every session winner, one season-wide query each). Standings after a round come from the last session of that round with data, so a sprint counts before the race. Wins are race wins only, as in Jolpica.
- **Races** (entry lists and results of every finished race, in one query each by repeating `session_key`). This gives the results matrix, each driver's teams and team colours.
- **Race weekend** (results, entry lists and starting grids for one meeting). The race grid is the one set in qualifying, and the sprint grid the one set in sprint qualifying.

OpenF1 identifies drivers by number and teams by name, but the app links everything by Jolpica id. `apps/api/src/openf1-map.json` maps them, together with driver and team details, the seasons each took part in, and circuit details. Regenerate it with `node apps/api/scripts/gen-openf1-map.mjs` when a season starts or a lineup changes. Until then, a missing driver or team is still listed, but without a profile link.

Results stay **provisional** for a week after the race, while stewards' decisions and appeals can still change them. The race page and the home page say so, and the race weekend refreshes every 15 minutes until then.

Checked against Jolpica for 2026: standings, progression, points and wins are identical. The only difference in the results matrix is a car that was still running but not classified: OpenF1 gives `N` (not classified), and Jolpica `R`.

## Replay

`/replay?season=&session=<OpenF1 session key>` plays back a recorded session. It is never presented as live.

- `/api/replay/:key` returns the whole session except positions:
  - drivers, with Jolpica ids from the identity map
  - laps, stints, pit-lane visits and running order
  - race control and track weather
  - a track outline traced from the fastest clean lap's recorded positions

  The outline is in the same coordinate space as the cars, so nothing has to be aligned by hand. The first load costs about 10 OpenF1 requests, and the result is then cached for 30 days.
- `/api/replay/:key/window?from=<ms>` returns one fixed, aligned 60 s window of car positions, plus gaps for races. Each window includes 1 s of overlap on each side, so interpolation never needs a neighbouring window. Windows are cached in the Cache API only (~110 KB each). A cold window costs 2 OpenF1 requests and about 5 ms of CPU.
- The browser loads the current window plus the next two, and drops windows it hasn't used for a minute. The clock holds while a window is loading.
- Cars are interpolated only between samples less than 1 s apart. Otherwise the last sample is shown as stale.
- Sessions are listed 35 minutes after they end. OpenF1 opens a session's data 30 minutes after it ends, and the extra margin keeps half-processed data from being cached as final.

## Live timing

`/live` shows the timing tower, race-control messages and a track map for the session on track. It uses OpenF1's sponsor feed, which is a few seconds behind the track.

- **When:** OpenF1 treats a session as live from 30 minutes before it starts until 30 minutes after it ends. Outside those windows, `/api/live/session` reports `UNAVAILABLE` (`no_session`) with the next session and the latest replay.
- **One shared connection.** The `LiveFeed` Durable Object (`apps/api/src/live.ts`) holds the only connection to OpenF1's MQTT broker. The first live request inside a window opens it: the DO subscribes, loads the session so far from REST, then applies messages as they arrive. Messages that arrive during the load are held and applied afterwards. It disconnects once nobody has asked for two minutes, and reconnects after a drop with backoff (5 s doubling to 60 s).
- **Same timing as replays.** The DO keeps the raw rows (laps, stints, pits, positions, race control, latest intervals, entry list) and builds the tower with the replay's own `toReplay` and `timingAt`.
- **Track map.** The DO also subscribes to car locations (`v1/location`, about 4 a second per car) and keeps only the last 10 s. Each poll carries that window; the page draws the cars 5 s behind the newest sample with the replay's interpolation, so they move smoothly between polls. The outline is traced from the fastest clean lap of the meeting's latest finished session (OpenF1 uses the same coordinates across a weekend), so the weekend's first session shows cars without an outline.
- **Track weather.** The DO also subscribes to `v1/weather` (about one observation a minute) and each poll carries the newest one.
- **Track status.** Each snapshot carries the flag and safety-car state (`trackStatus` in `packages/shared`), judged from every race-control message so far. The snapshot only carries the latest 20 messages, and a run of track-limits notes could otherwise push a safety-car deployment out of view.
- **States.** `LIVE` while the newest source timestamp (car locations included) is under 15 s old, `DELAYED` (with `delaySeconds`) after that, for example under a red flag or after the chequered flag. `UNAVAILABLE` with `no_data_yet` before the first timed data, or `feed_unavailable` with the reason when OpenF1 can't be reached or refuses the login.
- **Polling.** The page polls `/api/live/session` every 3 s while a session streams and every 30 s otherwise. `/api/live/timing` returns the same snapshot on its own.
- **MQTT.** `apps/api/src/mqtt.ts` is a minimal MQTT 3.1.1 client (connect, QoS 0 subscribe, publish, keep-alive). mqtt.js doesn't work in workerd. Workers deliver WebSocket frames as Blobs unless `binaryType` is `"arraybuffer"`.
- **Cost.** One viewer polling for a two-hour race is ~2,400 Worker requests and the same number of DO requests, well inside the Free plan's 100,000 a day. The DO stays in memory only while connected.

## Accessibility

- Every data table has a caption.
- Status changes use `role="status"` / `aria-live`, and errors use `role="alert"`.
- Colours are never the only signal: team marks sit next to team names, tyres show a letter, and position changes have text labels.
- The track map and weather map have text equivalents in the timing tower and forecast tables.
- Motion follows data only: timing rows slide to their new place (with a green or red edge on a gain or loss), new race-control messages slide in, and the LIVE marker pulses. Radar and replay playback start only on request. `prefers-reduced-motion` turns all of it off.
- Every page has a skip link, and dashboard panels are labelled regions with headings.
- Lighthouse accessibility scored 100 on home, live, standings, weather and replay before the October 2026 redesign; it hasn't been re-run since.

## Deploying

Production is https://f1.harshsandhu.com (zone `harshsandhu.com`, D1 database `pitwall`). The app Worker owns the hostname as a custom domain. The API Worker is a route on `f1.harshsandhu.com/api/*`, which runs in front of the custom domain, so the app calls the API on the same origin with no CORS.

```sh
pnpm --filter app run deploy   # builds with relative API URLs, uploads the static assets
pnpm --filter api run deploy   # applies D1 migrations, then deploys the Worker
```

The API needs the OpenF1 sponsor login as secrets (once): `npx wrangler secret put OPENF1_USERNAME` and `npx wrangler secret put OPENF1_PASSWORD` in `apps/api`.

Deploy the app first on a fresh zone: its custom domain creates the proxied DNS record the API route needs. Check the configuration without deploying: `npx wrangler deploy --dry-run` in each app.

To fill production D1 with Jolpica seasons from your own IP (outside Jolpica's shared Worker limit), run the API locally against production D1, then run the crawler:

```sh
# in apps/api: a copy of wrangler.jsonc with "remote": true on the D1 binding (and no routes)
npx wrangler dev -c wrangler.backfill.jsonc --port 8790
node apps/api/scripts/backfill.mjs http://localhost:8790 2000 2022
```

It requests the normal routes, newest season first (calendar, standings, progression, results, every race weekend, then every profile), so each successful response is written to production D1. Snapshots never expire, so a rerun skips what's stored. Jolpica's limits (~500 requests/hour) are waited out, so 2000–2022 takes several hours. 2000–2022 was filled this way on 2026-10-11.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Can't reach the Pitwall API" | Start the API (`pnpm dev`) and check `NEXT_PUBLIC_API_URL` in `apps/app/.env.local` |
| Browser console shows CORS errors | Add the app's origin to `ALLOWED_ORIGINS` (`apps/api/.dev.vars` locally, `wrangler.jsonc` when deployed) |
| API errors mentioning `upstream_snapshot` | Run `pnpm --filter api db:migrate:local` |
| Weather map blank, "Worker failed to load" | Start the app through its package scripts (`pnpm dev` / `pnpm build`). They copy MapLibre's worker into `public/maplibre/` |
| Replay says "request budget used up" | The API allows itself 30 OpenF1 requests/minute per isolate. Wait a minute, or play at a lower speed until windows are cached |
| A 2023+ driver or team has no profile link | Not in the identity map yet. Run `node apps/api/scripts/gen-openf1-map.mjs` and deploy |
| A 2023+ calendar fails with "no circuit registered" | A new season or round. Re-run `apps/api/scripts/gen-circuits.mjs`, then the identity map script |
| A panel says "stale" | The last good copy is shown while it refreshes in the background. If it stays stale, the provider is failing; it refreshes when the provider recovers |
| Live page says "feed unavailable" | The detail gives the reason. "Refused the login": check the `OPENF1_USERNAME`/`OPENF1_PASSWORD` secrets and the sponsorship. It retries on its own |
| No replay for a season | OpenF1's recordings start in 2023. Sessions appear about 35 minutes after they end |
