# Pitwall API

A Cloudflare Worker with no framework: a regex router in `src/index.ts`. Architecture, caching policy, budgets and deployment are covered in the [root README](../../README.md).

```sh
pnpm db:migrate:local   # once: local D1 table
pnpm dev                # http://localhost:8787
pnpm test               # Vitest in workerd; every upstream is mocked
```

Local overrides for `wrangler.jsonc` vars go in `.dev.vars` (see `.dev.vars.example`). The only secrets are the optional OpenF1 sponsor login, `OPENF1_USERNAME` and `OPENF1_PASSWORD`; without them OpenF1's free tier is used.

## Layout

| Path | Role |
|---|---|
| `src/index.ts` | Routes, parameter validation (Zod), CORS allowlist, live contract; picks OpenF1 (2023+) or Jolpica per season |
| `src/upstream.ts` | `fetchJson`: allow-listed providers only, timeouts, one retry, 429 backoff, per-provider pacing and per-minute budget, Zod validation, OpenF1 login token |
| `src/cache.ts` | `cached()`: Cache API → D1 copy (stale ones served while revalidating) → loader, with in-isolate dedupe |
| `src/providers/*.ts` | One file per provider: upstream schemas (only fields used) and normalizers to `@pitwall/shared` types |
| `src/live.ts`, `src/mqtt.ts` | `LiveFeed` Durable Object: the one shared OpenF1 MQTT connection, and a minimal MQTT 3.1.1 client |
| `src/circuits.json` | Generated circuit registry (timezones, F1DB layouts) |
| `src/openf1-map.json`, `src/openf1-map.ts` | Generated OpenF1 → Jolpica identity map (drivers, teams, circuits) |

## Endpoints

All `GET`, all return the envelope described in the root README.

| Endpoint | Source |
|---|---|
| `/api/health` | — |
| `/api/seasons` | — (1950 to the current year) |
| `/api/calendar?season` | OpenF1 from 2023, Jolpica before |
| `/api/standings/{drivers,constructors}?season[&round]` | OpenF1 championship from 2023, Jolpica before |
| `/api/standings/progression?season&type` | Official per-round standings (OpenF1 from 2023, Jolpica before) |
| `/api/results?season` | OpenF1 from 2023, Jolpica before |
| `/api/races/:round?season` | OpenF1 from 2023 (with sprint qualifying), Jolpica before |
| `/api/drivers/:id`, `/api/teams/:id` | Identity map + OpenF1 for 2023+ seasons, Jolpica for earlier ones |
| `/api/weather/forecast?circuit` | Open-Meteo |
| `/api/weather/cloud-grid?circuit` | Open-Meteo |
| `/api/weather/radar` | RainViewer (frame list; tiles load in the browser) |
| `/api/replay/sessions?season` | OpenF1 (2023+) |
| `/api/replay/:key` | OpenF1 |
| `/api/replay/:key/window?from=<ms, multiple of 60000>` | OpenF1 |
| `/api/team-colours?season` | OpenF1 (empty before 2023) |
| `/api/live/session` | OpenF1 live feed: `LIVE`/`DELAYED` with timing during a session window, else `UNAVAILABLE` with the next session and the latest replay |
| `/api/live/timing` | The live timing snapshot alone; 503 outside a live session |
| `/api/live/positions` | Always 503: live track positions aren't provided yet |

Upstream URLs are built only from validated parameters. There is no pass-through proxy.
