# The Name Game 🏀⚾🏈🏒

A party game where players chain athletes by name. Name an athlete; the next
player must name one whose **first name** starts with the **first letter of the
previous athlete's last name**. No repeats. 30 seconds per turn. Last player
standing wins.

> Example: **Michael Jordan** (Jordan → **J**) → **John Stockton** (Stockton →
> **S**) → **Scottie Pippen** → …

Leagues: **NBA, MLB, NFL, NHL**. Filter by **current**, **past**, or **both**.

## Two ways to play

- **Pass & Play** — one device, take turns around the table. Works fully offline
  in the browser.
- **Play Online** — the Admin creates a room, shares a 4-letter code / invite
  link, and everyone joins on their own phone. Real-time turns, server-validated.

## Run it locally

```bash
npm install
npm start
# open http://localhost:3000
```

For online play across devices on the same Wi-Fi, others can visit
`http://<your-computer-ip>:3000`.

## Project layout

```
server.js              Express + Socket.io server; authoritative online game logic
public/
  index.html           Single-page app shell (all screens)
  css/styles.css       Styling (mobile-first, dark theme)
  js/rules.js          Isomorphic rules engine — shared by browser AND server
  js/app.js            Navigation, shared settings UI, full Pass & Play mode
  js/online.js         Socket.io client: lobby, invites, online gameplay
data/athletes.json     The athlete database (name / league / era)
test-online.js         Headless two-client smoke test (npm test)
```

## The athlete database

`data/athletes.json` holds **~74,800 players** across all four leagues, built
from authoritative free sources. Each entry is:

```json
{ "name": "Michael Jordan", "league": "NBA", "era": "past" }
```

- `league`: `NBA` | `MLB` | `NFL` | `NHL`
- `era`: `current` (active 2024+) | `past`

### Regenerating / refreshing the data

```bash
npm run build-db        # rewrites data/athletes.json (takes a few minutes)
```

[`scripts/build-db.js`](scripts/build-db.js) pulls from:

| League | Source | Era signal |
| --- | --- | --- |
| NBA | basketball-reference.com player index (A–Z) | career end year ≥ 2024 |
| MLB | statsapi.mlb.com season rosters (1876–present) | active in a 2024+ season |
| NFL | nflverse `players.csv` | `last_season` ≥ 2024 |
| NHL | records.nhl.com player API | currently rostered |

No API keys required. Pro-Football-Reference blocks scraping, so the nflverse
feed (modern era) is topped up with [`data/supplement.json`](data/supplement.json)
— a curated list of pre-1965 NFL legends. Add anyone missing to that file and
re-run `build-db`.

The matching logic (accents, lowercase, `Jr./Sr./III` suffix stripping,
hyphenated last names) lives in `public/js/rules.js`.

## Deploying online multiplayer

See **[DEPLOY.md](DEPLOY.md)**. TL;DR: it's a standard Node + Socket.io app that
listens on `process.env.PORT` — push to GitHub and deploy free on **Render**
(blueprint included), or use the included **Dockerfile** for Railway / Fly / any
container host. No database required; rooms live in memory. Responses are gzipped
(the 3.8 MB database ships as ~445 KB).

## Installable (PWA)

The app ships a web manifest + service worker, so it's **installable to a phone
home screen** ("Add to Home Screen") and Pass & Play works **offline** (the app
shell and athlete database are cached). This is the stepping stone to a native
app: wrapping it with [Capacitor](https://capacitorjs.com) produces real iOS /
Android builds for the App Store, and Capacitor generates the full icon set from
`public/icon.svg`.

## Keeping it awake (no cold start)

Render's free tier sleeps after ~15 min idle. [`.github/workflows/keep-alive.yml`](.github/workflows/keep-alive.yml)
pings `/health` every 10 minutes to prevent that — just set an `APP_URL`
repository variable to your live URL (instructions are in the workflow file).

## Roadmap toward an app

- Scoring across rounds (not just last-player-standing)
- Player-supplied names with an honor-system "challenge" fallback for athletes
  not in the database
- Wrap in Capacitor for iOS & Android → App Store / Play Store
```
