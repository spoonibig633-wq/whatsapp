# 🎂 WhatsApp Wish Bot

A 24/7 WhatsApp bot that sends **Groq-powered birthday wishes** every 5 minutes (within a time window you choose) and **pictures/videos every hour** from a folder you control. Configure everything from a web dashboard.

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/whatsapp-wish-bot)

## Features

- **Groq free-tier AI wishes** — generated on the fly, never repeated
- **17 relations** (mother, father, sister, brother, son, daughter, grandparents, wife, husband, girlfriend, boyfriend, best friend, friend, colleague, boss, kid)
- **6 styles** — warm, funny, formal, short, poetic/shayari, religious
- **Configurable time window** — wishes only sent between start and end time
- **Wishes every 5 minutes** (configurable via env)
- **Media every 1 hour** (configurable) — random or sequential pick
- **Multiple recipients** — phone numbers or group IDs
- **Web dashboard** at `/` — configure everything, upload media, see live activity log
- **Session persistence** — scan QR once, session stored in `/sessions`, survives restarts
- **Auto-reconnect** — if WhatsApp disconnects, bot reconnects with backoff
- **24/7 runtime** — designed for always-on hosting
- **Railway-ready** — Nixpacks config + `railway.json` with volumes + `/health` endpoint + one-click deploy button

## Quick start (local)

```bash
git clone <your-repo>
cd whatsapp-wish-bot
cp .env.example .env
# Edit .env and set GROQ_API_KEY (get one free at https://console.groq.com/keys)
npm install
npm start
```

Open http://localhost:3000 — scan the QR with your phone (WhatsApp → Linked Devices → Link a Device). Done.

## Configuration

All settings live in the dashboard at `/`, but you can also edit `config.json` directly. The dashboard exposes:

| Setting | What it does |
|---------|--------------|
| Birthday person name | Used in the wish prompt |
| Age | Optional, included in prompt |
| Relation | 17 options — affects tone |
| Style | 6 options — affects wording |
| Start time / End time | Wishes only sent inside this window |
| Wishes enabled | Master toggle |
| Media enabled | Master toggle |
| Media mode | Random pick or sequential loop |
| Recipients | List of phone numbers / group IDs |
| Media folder | Drop files in `/media` or upload via dashboard |

### Environment variables (`.env`)

```
GROQ_API_KEY=gsk_xxx          # REQUIRED — get free at console.groq.com
PORT=3000                     # hosting platform sets this automatically
DASHBOARD_USER=admin          # optional basic auth
DASHBOARD_PASS=birthday123
GROQ_MODEL=llama-3.3-70b-versatile  # free-tier model
WISH_INTERVAL_MINUTES=5       # how often wishes are sent
MEDIA_INTERVAL_MINUTES=60     # how often media is sent
TZ=Asia/Kolkata               # timezone for start/end window
```

## Deployment (24/7 hosting)

The bot needs **persistent storage** for `/sessions` (so you don't rescan QR every restart) and `/media` (so your pictures/videos survive redeploys). All paths are env-overridable for Railway volumes.

### Option A — Railway (recommended, 5-minute deploy)

Railway gives you a public URL, persistent volumes, and 24/7 uptime. Free trial $5 credit lasts ~1 month.

#### One-click deploy

1. Push this repo to GitHub
2. Click the **Deploy on Railway** button at the top of this README
3. Railway creates the service and shows you a setup screen
4. Add the following **Variables** (Railway → your service → Variables tab):

   | Variable | Value |
   |----------|-------|
   | `GROQ_API_KEY` | `gsk_xxx` (free at console.groq.com) |
   | `DASHBOARD_USER` | `admin` |
   | `DASHBOARD_PASS` | `a-long-random-string` (bot is publicly reachable!) |
   | `TZ` | `Asia/Kolkata` (or your timezone) |
   | `WISH_INTERVAL_MINUTES` | `5` |
   | `MEDIA_INTERVAL_MINUTES` | `60` |

   (`PORT` is set automatically by Railway — do not define it.)

5. **Add persistent volumes** (critical — without these, you'll rescan QR every redeploy):
   - Railway → your service → Settings → Volumes → **Add Volume**
   - Mount path: `/app/sessions` → size 1 GB
   - Add another volume: Mount path `/app/media` → size 1 GB
   - Add another volume: Mount path `/app/config.json` → size 1 MB (or share with one of the above by using `/app/data` and setting `CONFIG_PATH=/app/data/config.json`)

6. Deploy → wait ~30 seconds → Railway marks service as **Active** (the `/health` endpoint returns 200)
7. Click the generated Railway URL → enter dashboard credentials → scan the QR with your phone
8. Session is now saved in `/app/sessions` (persistent) → future redeploys don't need a rescan

#### Manual deploy via Railway CLI

```bash
npm i -g @railway/cli
railway login
cd whatsapp-wish-bot
railway init          # create a new project
railway up            # deploy current directory
railway open          # open dashboard in browser
# Add variables + volumes via the web UI as described above
```

### Option B — Koyeb (free tier)

1. Push this repo to GitHub
2. On [Koyeb](https://app.koyeb.com), **Create Service → GitHub**
3. Builder: **Dockerfile**, port `3000`
4. Add env vars: `GROQ_API_KEY`, `DASHBOARD_USER`, `DASHBOARD_PASS`, `TZ`
5. Mount a persistent disk at `/app/sessions` (512 MB free tier is plenty)

### Option C — Render

1. Connect repo to [Render](https://render.com) Web Service
2. Builder: **Docker**, port `3000`
3. Attach a **Disk** at `/app/sessions` (1 GB free tier)
4. Add env vars as above
5. Note: Render free tier spins down after 15 min idle — use a paid tier or [UptimeRobot](https://uptimerobot.com) pinging `/health` every 5 min to keep it warm.

### Option D — VPS / Docker Compose

```bash
# Local / VPS testing
docker compose up -d --build

# Or one-shot
docker run -d \
  --name wish-bot \
  --restart unless-stopped \
  -p 3000:3000 \
  -v $(pwd)/sessions:/app/sessions \
  -v $(pwd)/media:/app/media \
  -v $(pwd)/config.json:/app/config.json \
  --env-file .env \
  wish-bot
```

### Railway volume mount points (cheat sheet)

| Mount path | Purpose | Min size | Notes |
|------------|---------|----------|-------|
| `/app/sessions` | Baileys WhatsApp auth state | 50 MB | **Mandatory** — without this you rescan QR every deploy |
| `/app/media` | Your pictures & videos | 1 GB+ | Optional but recommended |
| `/app/config.json` | Runtime config (recipients, relation, etc.) | 1 MB | Either mount as file or set `CONFIG_PATH` to a path inside a mounted volume |

If you prefer a single volume: mount `/app/data` and set:
```
SESSIONS_DIR=/app/data/sessions
MEDIA_DIR=/app/data/media
CONFIG_PATH=/app/data/config.json
```

## How to use

1. Open dashboard → scan QR
2. Add recipients (phone numbers with country code, e.g. `919876543210`)
3. Set birthday person's name, relation, style, time window
4. Drop pictures and videos into `/media` (or upload via dashboard)
5. Click **Save settings**
6. Leave the bot running — wishes auto-send every 5 min within your window, media every hour

## Manual triggers

- **Generate test wish** — preview what Groq would generate right now
- **Send wish now** — bypass the 5-min timer, send immediately
- **Send media now** — send the next media file immediately

## Activity log

The dashboard shows the last 50 events (wish sent, media sent, errors) so you can verify the bot is working.

## File structure

```
.
├── server.js              # Express app + boot + /health endpoint
├── lib/
│   ├── whatsapp.js        # Baileys client, session, QR (SESSIONS_DIR env-overridable)
│   ├── groq.js            # Groq wish generation
│   ├── scheduler.js       # Cron jobs (wish + media)
│   ├── config.js          # Config load/save (CONFIG_PATH env-overridable)
│   └── media.js           # Media folder scanner (MEDIA_DIR env-overridable)
├── public/                # Dashboard UI (HTML/CSS/JS)
├── sessions/              # Baileys auth state (persistent — Railway volume)
├── media/                 # Your pictures & videos (persistent — Railway volume)
├── config.json            # Runtime config (persistent)
├── railway.json           # Railway service config (volumes, healthcheck, restart policy)
├── nixpacks.toml          # Railway native buildpack config
├── Procfile               # Alternative start command (Heroku/Render compat)
├── Dockerfile             # Docker build (Koyeb/VPS)
├── docker-compose.yml     # Local/VPS multi-container setup
├── railway.env.example    # Template for Railway env vars
├── .env.example           # Template for local env vars
└── .gitignore
```

## Notes & limits

- **Groq free tier**: ~30 req/min, ~14k req/day — more than enough for a wish every 5 min
- **WhatsApp TOS**: don't spam people who didn't opt in. Use this for friends & family.
- **Rate limits**: WhatsApp may temporarily block numbers that send too many messages. The 5-min default is safe.
- **Session validity**: a linked-device session lasts ~14 days of inactivity. As long as the bot runs 24/7, it stays alive indefinitely.

## Troubleshooting

- **No QR shows** — wait ~10 seconds after first boot, refresh dashboard
- **QR doesn't scan** — make sure your phone has internet, and that you're scanning within 60 seconds
- **Wishes not sending** — check the dashboard activity log; verify Groq API key, recipients, and time window
- **Media not sending** — verify files are in `/media` and have valid extensions (.jpg .png .mp4 etc.)
- **Bot disconnected** — it auto-reconnects with backoff. If it stays disconnected, click Logout & rescan.

## License

MIT
