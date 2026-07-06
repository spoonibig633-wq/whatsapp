'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const { load, update, appendLog, RELATIONS, STYLES } = require('./lib/config');
const { connect, getSocket, normalizeJid, onState, sendText, sendMedia, state: waState } = require('./lib/whatsapp');
const { generateWish, isConfigured: groqConfigured } = require('./lib/groq');
const { listMedia, MEDIA_DIR } = require('./lib/media');
const scheduler = require('./lib/scheduler');

// ── Path constants (used for media upload/delete) ────────────
const MEDIA_PATH = MEDIA_DIR;

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Basic auth (optional) ─────────────────────────────────────
const AUTH_USER = process.env.DASHBOARD_USER || '';
const AUTH_PASS = process.env.DASHBOARD_PASS || '';

function authMiddleware(req, res, next) {
  if (!AUTH_USER) return next();
  const b64 = (req.headers.authorization || '').replace('Basic ', '');
  if (!b64) return promptAuth(res);
  try {
    const [u, p] = Buffer.from(b64, 'base64').toString('utf8').split(':');
    if (u === AUTH_USER && p === AUTH_PASS) return next();
  } catch (_) {}
  return promptAuth(res);
}
function promptAuth(res) {
  res.setHeader('WWW-Authenticate', 'Basic realm="whatsapp-wish-bot"');
  return res.status(401).send('Authentication required');
}

// ── Health endpoint — registered BEFORE auth so Railway probes work ──
app.get('/health', (req, res) => {
  res.status(200).json({
    ok: true,
    whatsapp: waState.connectionState,
    groq: groqConfigured(),
    uptime: process.uptime(),
    ts: new Date().toISOString()
  });
});

app.use(authMiddleware);

// ── Static dashboard ─────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── API ───────────────────────────────────────────────────────

// GET /api/state — full snapshot for dashboard
app.get('/api/state', (req, res) => {
  const cfg = load();
  res.json({
    whatsapp: waState,
    groq: { configured: groqConfigured(), model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile' },
    config: cfg,
    meta: {
      relations: RELATIONS,
      styles: STYLES,
      wishInterval: parseInt(process.env.WISH_INTERVAL_MINUTES || '5', 10),
      mediaInterval: parseInt(process.env.MEDIA_INTERVAL_MINUTES || '60', 10),
      tz: process.env.TZ || 'Asia/Kolkata'
    }
  });
});

// GET /api/state/stream — SSE for live updates
app.get('/api/state/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (state) => {
    try { res.write(`data: ${JSON.stringify({ whatsapp: state })}\n\n`); } catch (_) {}
  };
  const off = onState(send);

  const ka = setInterval(() => {
    try { res.write(': keepalive\n\n'); } catch (_) {}
  }, 25000);

  req.on('close', () => { off(); clearInterval(ka); });
});

// POST /api/config — update config
app.post('/api/config', (req, res) => {
  const allowed = ['targets', 'birthdayPersonName', 'relation', 'style', 'age', 'startTime', 'endTime', 'wishesEnabled', 'mediaEnabled', 'mediaMode'];
  const patch = {};
  for (const k of allowed) {
    if (k in req.body) patch[k] = req.body[k];
  }
  const next = update(patch);
  res.json({ ok: true, config: next });
});

// POST /api/targets — add a target
app.post('/api/targets', (req, res) => {
  const { name, jid } = req.body;
  if (!jid) return res.status(400).json({ error: 'jid required' });
  const normalized = normalizeJid(jid);
  if (!normalized) return res.status(400).json({ error: 'invalid jid' });

  const cfg = load();
  const targets = (cfg.targets || []).filter(t => t.jid !== normalized);
  targets.push({ name: name || normalized.split('@')[0], jid: normalized });
  const next = update({ targets });
  res.json({ ok: true, config: next });
});

// DELETE /api/targets/:jid — remove a target
app.delete('/api/targets/:jid', (req, res) => {
  const jid = decodeURIComponent(req.params.jid);
  const cfg = load();
  const targets = (cfg.targets || []).filter(t => t.jid !== jid);
  const next = update({ targets });
  res.json({ ok: true, config: next });
});

// POST /api/test-wish — generate a wish now and (optionally) send to one target
app.post('/api/test-wish', async (req, res) => {
  try {
    const { text } = await generateWish();
    if (req.body.send === true && waState.connectionState === 'open') {
      const cfg = load();
      const target = req.body.jid || cfg.targets?.[0]?.jid;
      if (target) {
        await sendText(target, text);
        appendLog({ type: 'wish', status: 'sent', target, preview: text.slice(0, 80), manual: true });
      }
    }
    res.json({ ok: true, text });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/send-now/wishes — manually trigger wish send to all targets
app.post('/api/send-now/wishes', async (req, res) => {
  try {
    const result = await scheduler.sendWishesNow();
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/send-now/media — manually trigger media send
app.post('/api/send-now/media', async (req, res) => {
  try {
    const result = await scheduler.sendMediaNow();
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/media — list media files
app.get('/api/media', (req, res) => {
  res.json({ files: listMedia() });
});

// POST /api/media/upload — upload a media file (multipart/form-data simulated via base64)
app.post('/api/media/upload', async (req, res) => {
  try {
    const { name, base64 } = req.body;
    if (!name || !base64) return res.status(400).json({ error: 'name and base64 required' });
    const buf = Buffer.from(base64, 'base64');
    if (!fs.existsSync(MEDIA_PATH)) fs.mkdirSync(MEDIA_PATH, { recursive: true });
    const safe = path.basename(name);
    fs.writeFileSync(path.join(MEDIA_PATH, safe), buf);
    res.json({ ok: true, file: safe, size: buf.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/media/:name — delete a media file
app.delete('/api/media/:name', (req, res) => {
  const safe = path.basename(decodeURIComponent(req.params.name));
  const fp = path.join(MEDIA_PATH, safe);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'not found' });
  fs.unlinkSync(fp);
  res.json({ ok: true });
});

// POST /api/logout — wipe session
app.post('/api/logout', async (req, res) => {
  try {
    const sock = getSocket();
    if (sock) { try { await sock.logout(); } catch (_) {} }
    const sessDir = path.join(__dirname, 'sessions');
    fs.rmSync(sessDir, { recursive: true, force: true });
    res.json({ ok: true });
    setTimeout(() => process.exit(0), 500);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/qr — current QR as PNG (if available)
app.get('/api/qr.png', async (req, res) => {
  if (!waState.qr) return res.status(404).send('No QR available');
  try {
    const png = await QRCode.toBuffer(waState.qr, { width: 360, margin: 2 });
    res.setHeader('Content-Type', 'image/png');
    res.send(png);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// GET /api/log — activity log
app.get('/api/log', (req, res) => {
  const cfg = load();
  res.json({ log: (cfg.log || []).slice(-50).reverse() });
});

// ── Boot ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

async function boot() {
  // Start WhatsApp (async — does not block dashboard)
  connect().catch(err => console.error('[boot] whatsapp connect failed:', err.message));

  // Start schedulers
  scheduler.start();

  app.listen(PORT, () => {
    console.log(`\n  WhatsApp Wish Bot running on http://localhost:${PORT}`);
    console.log(`  Dashboard: ${AUTH_USER ? `http://${AUTH_USER}:****@localhost:${PORT}` : `http://localhost:${PORT}`}`);
    console.log(`  TZ: ${process.env.TZ || 'Asia/Kolkata'}  Wishes: every ${process.env.WISH_INTERVAL_MINUTES || 5}min  Media: every ${process.env.MEDIA_INTERVAL_MINUTES || 60}min\n`);
  });
}

boot().catch(err => {
  console.error('[boot] fatal:', err);
  process.exit(1);
});
