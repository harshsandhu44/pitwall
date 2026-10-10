# Pitwall app

A Next.js 16 static export (`output: "export"`, no server) using shadcn/ui (Base UI), TanStack Query, Recharts and MapLibre. All data comes from the Pitwall API at `NEXT_PUBLIC_API_URL`. See the [root README](../../README.md) for the whole system.

```sh
cp .env.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:8787
pnpm dev                     # http://localhost:3000
pnpm build && pnpm preview   # static out/ served by wrangler on :8788
pnpm test                    # Vitest + Testing Library (jsdom); API calls are mocked
```

`dev` and `build` first copy MapLibre's worker into `public/maplibre/<version>/` (gitignored). The bundler can't resolve it next to the main module.

## Layout

| Path | Role |
|---|---|
| `src/app/*/page.tsx` | Thin route shells (Suspense + a view). Routes use query parameters so the export stays static |
| `src/components/pages` | One view per route |
| `src/components/{racing,standings,weather,replay}` | Feature components |
| `src/components/ui` | shadcn/ui primitives, unmodified |
| `src/lib/api.ts`, `src/lib/hooks.ts` | Typed envelope fetch and query hooks |
| `src/lib/replay-clock.ts` | requestAnimationFrame replay clock (recorded time × speed, holds while buffering) |
| `public/circuits` | F1DB layouts (CC BY 4.0, decorative only) |

Geographic maps (weather) and track drawings (replay outlines traced from OpenF1 positions) are separate coordinate systems and never mixed. F1DB SVGs are decoration only.
