'use strict';

const fs = require('fs');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const P = require('pino');

// Allow Railway/Render to mount a persistent volume for sessions
const SESSION_DIR = process.env.SESSIONS_DIR || path.join(__dirname, '..', 'sessions');

// Shared state — exposed for dashboard
const state = {
  connectionState: 'init',   // init | qr | connecting | open | close
  qr: null,
  user: null,                 // { id, name } once connected
  lastError: null,
  startedAt: null
};

let sock = null;
let reconnectAttempts = 0;

// Listeners that fire on state changes (dashboard SSE uses this)
const listeners = new Set();
function onState(fn) { listeners.add(fn); try { fn(state); } catch (_) {} return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) { try { fn(state); } catch (_) {} } }

function setState(patch) {
  Object.assign(state, patch);
  emit();
}

async function connect() {
  if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

  const { state: authState, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const logger = P({ level: process.env.NODE_ENV === 'test' ? 'silent' : 'warn' });

  sock = makeWASocket({
    version,
    auth: authState,
    logger,
    browser: Browsers.macOS('Desktop'),
    printQRInTerminal: false,
    defaultQueryTimeoutMs: 60000,
    markOnlineOnConnect: false
  });

  setState({ connectionState: 'connecting', startedAt: state.startedAt || new Date().toISOString() });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      setState({ connectionState: 'qr', qr });
      console.log('[whatsapp] QR generated — scan it from the dashboard at /');
    }

    if (connection === 'open') {
      const user = sock.user ? { id: sock.user.id, name: sock.user.name || sock.user.id.split('@')[0] } : null;
      setState({ connectionState: 'open', qr: null, user, lastError: null });
      reconnectAttempts = 0;
      console.log('[whatsapp] Connected as', user?.id);
    }

    if (connection === 'close') {
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      setState({ connectionState: 'close', qr: null, lastError: lastDisconnect?.error?.message || `code ${code}` });
      console.log('[whatsapp] closed, code=', code, 'reconnect=', shouldReconnect);

      if (shouldReconnect) {
        reconnectAttempts++;
        const delay = Math.min(60000, 2000 * reconnectAttempts);
        setTimeout(() => connect(), delay);
      } else {
        // logged out — wipe session so user can re-scan
        try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch (_) {}
        setTimeout(() => connect(), 3000);
      }
    }
  });

  return sock;
}

function getSocket() { return sock; }

/** Normalize input to a JID. Accepts: phone number, @s.whatsapp.net, @g.us */
function normalizeJid(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (s.includes('@')) return s;
  // Strip everything except digits
  const digits = s.replace(/\D/g, '');
  if (!digits) return null;
  return `${digits}@s.whatsapp.net`;
}

/**
 * Send a text message to a JID. Returns true on success.
 */
async function sendText(jid, text) {
  if (!sock) throw new Error('WhatsApp socket not ready');
  await sock.sendMessage(jid, { text });
  return true;
}

/**
 * Send a media file (image/video) with optional caption.
 */
async function sendMedia(jid, filePath, caption = '') {
  if (!sock) throw new Error('WhatsApp socket not ready');
  const ext = path.extname(filePath).toLowerCase();
  const isVideo = ['.mp4', '.mov', '.mkv', '.webm', '.3gp'].includes(ext);
  const isImage = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);

  if (!isVideo && !isImage) {
    // Fallback: send as document
    await sock.sendMessage(jid, {
      document: { url: filePath },
      fileName: path.basename(filePath),
      caption
    });
    return true;
  }

  const content = {
    [isVideo ? 'video' : 'image']: { url: filePath },
    caption,
    mimetype: isVideo ? 'video/mp4' : 'image/jpeg'
  };
  await sock.sendMessage(jid, content);
  return true;
}

module.exports = {
  connect,
  getSocket,
  sendText,
  sendMedia,
  normalizeJid,
  onState,
  state
};
