# Deploying The Name Game

The app is a single Node + Socket.io server (no database). It listens on
`process.env.PORT` and serves everything — frontend, the athlete database, and
the real-time multiplayer. That makes it deployable almost anywhere.

> **One detail about scale:** game rooms live in memory, and Socket.io with a
> single instance needs no extra setup. The free tiers below run **one
> instance**, which is perfect for this. If you ever scale to multiple
> instances, add the Socket.io Redis adapter + sticky sessions — not needed now.

---

## Option A — Render (recommended: free + WebSockets, easiest)

**Prerequisite:** push this folder to a GitHub repo (see "Push to GitHub" below).

**Blueprint (one click):**
1. Go to <https://render.com> → sign in → **New** → **Blueprint**.
2. Connect your GitHub repo. Render reads [`render.yaml`](render.yaml) and
   configures everything (free plan, build, start, health check).
3. Click **Apply**. In ~2 minutes you get a URL like
   `https://name-game-xxxx.onrender.com`. Share it — that's your game.

**Or manually (no blueprint):** New → **Web Service** → pick the repo →
Runtime **Node**, Build `npm install`, Start `node server.js`, Plan **Free**.

*Note:* Render's free tier sleeps after ~15 min idle, so the first visit after a
nap takes ~30s to wake. Fine for casual play; upgrade to paid to keep it warm.

---

## Option B — Railway

1. <https://railway.app> → **New Project** → **Deploy from GitHub repo**.
2. Railway auto-detects Node (or uses the [`Dockerfile`](Dockerfile)). No config
   needed — it injects `PORT` automatically.
3. Under **Settings → Networking**, click **Generate Domain** for a public URL.

## Option C — Fly.io (uses the Dockerfile)

```bash
brew install flyctl          # or: curl -L https://fly.io/install.sh | sh
fly auth signup
fly launch                   # detects the Dockerfile; say yes to deploy
```

## Option D — Any Docker host

```bash
docker build -t name-game .
docker run -p 3000:3000 name-game
# open http://localhost:3000
```

---

## Push to GitHub (needed for Render/Railway)

From the project folder:

```bash
git init
git add .
git commit -m "The Name Game"
gh repo create name-game --public --source=. --push   # needs the GitHub CLI
# ...or create an empty repo on github.com and:
#   git remote add origin https://github.com/<you>/name-game.git
#   git push -u origin main
```

`node_modules/` is gitignored — hosts run `npm install` themselves.

---

## Just want to play right now (no hosting)?

On the same Wi-Fi, run it locally and have friends hit your computer's IP:

```bash
npm install && npm start
# find your IP:  macOS -> ipconfig getifaddr en0
# friends open:  http://<your-ip>:3000
```
