# Pitwall

Unofficial Formula 1 dashboard: schedules, standings, results, and (in progress) weather and historical replays. Built to run entirely on free tiers. Not associated with the Formula 1 companies.

| Package | What it is |
|---|---|
| `apps/app` | Next.js 16 static export (no server). Talks only to the API. Served as Workers static assets. |
| `apps/api` | Cloudflare Worker. Normalizes upstream data, caches it (Cache API), keeps a last-known-good copy in D1. |
| `packages/shared` | Domain types, the API response envelope and pure helpers used by both. |

## Quick start

```sh
pnpm install
cp apps/app/.env.example apps/app/.env.local      # NEXT_PUBLIC_API_URL=http://localhost:8787
pnpm --filter api db:migrate:local                # create the local D1 table
pnpm dev                                          # API on :8787, app on :3000
```

No accounts or API keys are needed. To check the production build locally: `pnpm --filter app build && pnpm --filter app preview` (serves `out/` on :8788).

## Checks

```sh
pnpm check-types && pnpm lint && pnpm test && pnpm build
```

Tests mock every upstream; they never touch the network.

## Data sources and terms

- **Jolpica F1** (`api.jolpi.ca`): calendar, results, standings. Rate limited (~4 req/s burst, ~500 req/hour); the API paces and caches requests to stay inside it.
- **F1DB** (CC BY 4.0): decorative circuit layouts in `apps/app/public/circuits` and the circuit registry in `apps/api/src/circuits.json` (regenerate with `apps/api/scripts/gen-circuits.mjs`).
- **Open-Meteo** (CC BY 4.0, free tier is non-commercial only): hourly forecast + model "current" conditions per circuit (refreshed every 15 min), and a 7×7 cloud/wind grid at 0.25° (refreshed hourly; 3-hourly forecast steps for 7 days). "Current" is a model analysis, not a track measurement, and is labelled that way.
- **RainViewer** (personal/educational use only): observed radar frames for the last ~2 hours at 10-minute steps. Free tier since 2026-01-01: Universal Blue colours, max zoom 7, 100 requests/IP/minute, no nowcast or satellite. Tiles load straight from RainViewer in the browser; only the current and next frame are requested.
- **OpenFreeMap** (© OpenMapTiles, data © OpenStreetMap): base map tiles, no key needed.

Pitwall is a personal, non-commercial project. Commercial use would need paid Open-Meteo access and a different radar provider.

## Every API response

```json
{ "status": "ok | stale | not_found | unavailable | error", "data": {}, "source": "jolpica",
  "fetchedAt": "ISO", "observedAt": null, "cache": "hit | miss | stale | fallback | none", "maxAgeSeconds": 3600, "reason": "…" }
```

`stale` + `fallback` means the provider failed and the last good copy from D1 was served.

## Caching

The Cache API is per data centre, so every successful upstream response is also written to D1. A Cache API miss checks D1 first and reuses a still-fresh copy, which means each upstream is refreshed roughly once per TTL globally rather than once per data centre. Worst-case Open-Meteo budget per circuit viewed all day: forecast 96 requests ≈ 240 weighted calls (22 variables, 16 days), cloud grid 24 requests × 49 locations ≈ 1,180 calls; about 1,400 calls/day against the 10,000/day free limit.

## Deploying (not done automatically)

```sh
cd apps/api && npx wrangler d1 create pitwall   # put the printed id in wrangler.jsonc
npx wrangler d1 migrations apply DB --remote && npx wrangler deploy
# set ALLOWED_ORIGINS in apps/api/wrangler.jsonc to the app's URL, then:
cd ../app && NEXT_PUBLIC_API_URL=https://<api-worker-url> pnpm build && npx wrangler deploy
```
