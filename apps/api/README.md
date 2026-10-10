# Pitwall API

A Cloudflare Worker with no framework: a regex router in `src/index.ts`. Architecture, caching policy, budgets and deployment are covered in the [root README](../../README.md).

```sh
pnpm db:migrate:local   # once: local D1 table
pnpm dev                # http://localhost:8787
pnpm test               # Vitest in workerd; every upstream is mocked
```

Local overrides for `wrangler.jsonc` vars go in `.dev.vars` (see `.dev.vars.example`). There are no secrets.

## Layout

| Path | Role |
|---|---|
| `src/index.ts` | Routes, parameter validation (Zod), CORS allowlist, live contract, cron cleanup |
| `src/upstream.ts` | `fetchJson`: allow-listed providers only, timeouts, one retry, 429 backoff, per-provider pacing and per-minute budget, Zod validation |
| `src/cache.ts` | `cached()`: Cache API → D1 fresh copy → loader → D1 stale fallback, with in-isolate dedupe |
| `src/providers/*.ts` | One file per provider: upstream schemas (only fields used) and normalizers to `@pitwall/shared` types |
| `src/circuits.json` | Generated circuit registry (timezones, F1DB layouts) |

## Endpoints

All `GET`, all return the envelope described in the root README.

| Endpoint | Source |
|---|---|
| `/api/health` | — |
| `/api/seasons` | Jolpica |
| `/api/calendar?season` | Jolpica |
| `/api/standings/{drivers,constructors}?season[&round]` | Jolpica |
| `/api/standings/progression?season&type` | Jolpica (official per-round standings) |
| `/api/results?season` | Jolpica |
| `/api/races/:round?season` | Jolpica |
| `/api/drivers/:id`, `/api/teams/:id` | Jolpica |
| `/api/weather/forecast?circuit` | Open-Meteo |
| `/api/weather/cloud-grid?circuit` | Open-Meteo |
| `/api/weather/radar` | RainViewer (frame list; tiles load in the browser) |
| `/api/replay/sessions?season` | OpenF1 (2023+) |
| `/api/replay/:key` | OpenF1 + Jolpica (driver ids) |
| `/api/replay/:key/window?from=<ms, multiple of 60000>` | OpenF1 |
| `/api/team-colours?season` | OpenF1 + Jolpica (empty before 2023) |
| `/api/live/session` | Always `UNAVAILABLE`, plus the next session and the latest replay |
| `/api/live/timing`, `/api/live/positions` | Always 503 `unavailable` |

Upstream URLs are built only from validated parameters. There is no pass-through proxy.
