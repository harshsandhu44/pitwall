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
- **Open-Meteo**: circuit timezones in the registry. Weather features (coming) use the free, non-commercial tier.

## Every API response

```json
{ "status": "ok | stale | not_found | unavailable | error", "data": {}, "source": "jolpica",
  "fetchedAt": "ISO", "observedAt": null, "cache": "hit | miss | stale | fallback | none", "maxAgeSeconds": 3600, "reason": "…" }
```

`stale` + `fallback` means the provider failed and the last good copy from D1 was served.

## Deploying (not done automatically)

```sh
cd apps/api && npx wrangler d1 create pitwall   # put the printed id in wrangler.jsonc
npx wrangler d1 migrations apply DB --remote && npx wrangler deploy
# set ALLOWED_ORIGINS in apps/api/wrangler.jsonc to the app's URL, then:
cd ../app && NEXT_PUBLIC_API_URL=https://<api-worker-url> pnpm build && npx wrangler deploy
```
