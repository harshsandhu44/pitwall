# Pitwall mobile

An Expo (SDK 58) app for iOS and Android with the web app's design system: the same tokens, type, shapes and arrival motion, in React Native. All data comes from the same Pitwall API (`EXPO_PUBLIC_API_URL`, production by default). See the [root README](../../README.md) for the whole system.

```sh
cp .env.example .env.local   # optional: point at a local API by LAN IP, e.g. http://192.168.1.20:8787
pnpm --filter mobile start   # scan the QR code with Expo Go
pnpm --filter mobile test    # jest-expo + React Native Testing Library; API calls are mocked
```

Everything it uses ships in Expo Go, so there's no native build yet. A library with its own native code will need a development build (`npx expo run:ios|android` or EAS).

## Screens

Tabs: **Live**, **Home**, **Calendar**, **Standings**, **Grid** (Drivers and Teams). Stack screens: **Race** (`season`, `round`), **Driver** and **Team** (`id`, `season`). The season chip in the header sets one season for every tab, and the app starts on the newest season each launch. Home and Live always show the newest season. Pull down on any screen to refetch it.

Live stacks the dashboard's panels in a fixed order: session status, timing (position, driver, interval or best lap, last lap, tyre, pending penalty), driver focus, race control, penalties, tyres, track weather and the championship as it stands. It polls every 3 s while a session streams and every 30 s otherwise, only while the tab is showing.

Not here yet (web only): replays, the track map, driver comparison and telemetry, team radio, alerts, weather maps and radar, 3D circuits, the points progression chart, the results matrix, and the weekend's Weather and Sessions tabs. Replay links open the web app.

## Design

| Web (`apps/app`) | Mobile |
|---|---|
| Tokens in `src/app/globals.css` | `src/theme/tokens.ts`, a copy: change both |
| `next-themes`, system until toggled | `src/theme/theme.tsx`, the same, saved in AsyncStorage (`pitwall.theme`) |
| Archivo variable (`wdth` 125 for `font-display`), Geist Mono | Static cuts of the same files in `assets/fonts` (OFL): Archivo, Archivo Expanded (wdth 125), Geist Mono, subset to Latin |
| `panel-cut` (clip-path) | `Cut` in `src/components/ui.tsx`: a page-coloured triangle over the corner plus a hairline on the cut |
| GSAP arrival (`src/lib/motion.tsx`) | Reanimated (`src/lib/motion.tsx`): title rise, stripe wipe, row stagger, count-up, rolling countdown. Static under reduced motion |
| Start lights, broadcast wipe | Start lights once per launch; native transitions instead of the wipe |
| shadcn/ui primitives | `src/components/ui.tsx`: `T` (text), `Panel`, `Button`, `Badge`, `Segmented`, `PageHeader`, `Row`, `Screen` |

Pure helpers (`format.ts`) live in `@pitwall/shared` and are used by both apps. Circuit outlines load from the web app's `/circuits` and are tinted to the theme.

## Layout

| Path | Role |
|---|---|
| `src/app` | expo-router routes: `(tabs)/*` and the stack screens |
| `src/components` | `ui` primitives, `data` (query states), `racing`, `standings`, `live` panels, `profile`, `shell` (header, tab bar, season picker, start lights) |
| `src/lib` | `api.ts` (envelope fetch, copied from the web), `hooks.tsx` (queries, season, shared clock), `motion.tsx` |
| `test` | Smoke tests per screen. `reanimated-mock.js` stands in for Reanimated 4.7's own mock, which doesn't load under Jest |
