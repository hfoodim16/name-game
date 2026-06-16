# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start              # run server on port 3000
npm test               # headless two-client athlete online test (test-online.js)
node test-reconnect.js # reconnect + spectator tests (11 checks)
node test-teams-online.js  # team-mode online tests (7 checks)
node test-custom-online.js # custom-mode online tests (9 checks)
PORT=3017 node test-reconnect.js  # run tests on alt port to avoid collision with dev server

npm run build-db       # regenerate data/athletes.json from live sources (~3 min)
node scripts/fetch-stars.js   # re-mark star:true on athletes.json after a db rebuild
```

There is no lint step. The PostToolUse hook in `.claude/settings.json` runs `node -c` on every JS file you edit — watch for syntax errors in the output.

## Architecture

**The single hardest thing to understand about this codebase:** `public/js/rules.js` is loaded in both the browser (as `window.NameGameRules`) and the server (`require()`). It uses a UMD wrapper to handle both environments. Every rules change must work in both contexts. The server requires it directly from the public path.

### Data flow

```
data/athletes.json  ─loaded at startup→  server.js (fullIndex)
                    ─served at /data/→   browser (app.js fetches once, passes to rules)
data/supplement.json  ─merged by build-db.js only, not loaded at runtime
```

### Frontend modules (no bundler — plain `<script>` tags in order)

| File | Role |
|------|------|
| `public/js/config.js` | Must load first. Sets `window.NG_SERVER` (empty on web, deployed URL in Capacitor native) and `window.NG_DB` (Supabase client). |
| `public/js/rules.js` | Isomorphic rules engine: `buildIndex`, `validate`, `suggest`. |
| `public/js/app.js` | Navigation, shared settings UI, full Pass & Play mode. |
| `public/js/online.js` | Socket.io client: lobby, invite flow, spectator, reconnect. |
| `public/js/daily.js` | Daily Chain — solo, date-seeded, one official run/day. |
| `public/js/custom.js` | Custom Category mode — honor-system voting, any category. |
| `public/js/account.js` | Supabase auth, cloud sync, achievements, friends, invites. |
| `public/js/effects.js` | Confetti, WebAudio, haptics. |

### Server (`server.js`)

Express + Socket.io. All online game state lives in the `rooms` Map (in-memory; rooms disappear on restart). Key events:

- `room:create / room:join / room:rejoin / room:spectate` — session management
- `game:start / game:nextround / game:guess / game:giveup` — turn flow
- `game:pause / game:resume / game:challenge / game:resolve` — pause/challenge system
- `game:decide` — honor-system voting for Custom mode

Player reconnect: `clientId` (stable localStorage UUID on client) is stored on each player object. On disconnect the server marks `p.disconnected = true` and starts a `RECONNECT_GRACE_MS = 60000` timer before calling `dropPlayer()`. `room:rejoin` + `remapId()` rewrites all socket-id references atomically.

### Supabase

Tables (all with RLS): `profiles` (stats jsonb, achievements jsonb), `daily_scores`, `friends`, `game_invites`. Schema SQL files are in the repo root (`supabase-friends.sql`, `supabase-invites.sql`). The anon key in `config.js` is intentionally public.

### PWA / Service Worker

`public/sw.js` — network-first for code/HTML, cache-first for `athletes.json`. **Bump the `CACHE` constant** (currently `"namegame-v12"`) on every deploy that changes `athletes.json` or significant JS/CSS, otherwise browsers serve stale assets.

### Game modes

| Mode | Where |
|------|-------|
| Pass & Play (athlete) | `app.js` — `startMatchPP / startRoundPP / endRoundPP` |
| Pass & Play (custom) | `custom.js` |
| Online (athlete) | `online.js` ↔ `server.js`, `gameType: "athlete"` |
| Online (custom) | `online.js` ↔ `server.js`, `gameType: "custom"` |
| Daily Chain | `daily.js` — seeded by date, 45s, one run/day |

### Deployment

Live on Render free tier at `https://name-game-oivo.onrender.com`. Render auto-deploys from the `main` branch. Keep-alive GitHub Action (`.github/workflows/keep-alive.yml`) pings `/health` every 10 min — set repo variable `APP_URL` to keep it awake. The `render.yaml` blueprint is at the repo root.

### Athletes database

`data/athletes.json` — ~97,400 players (NBA/MLB/NFL/NHL/SOC/CFB/CBB). Each entry: `{ name, league, era, star? }`. `star: true` marks ~7,500 famous players (set by `scripts/fetch-stars.js` via Wikidata sitelink count — re-run after any `build-db` rebuild). `data/supplement.json` holds curated pre-1965 NFL legends and college players merged in during `build-db`.
