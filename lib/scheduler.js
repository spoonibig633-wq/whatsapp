'use strict';

const cron = require('node-cron');
const { load, update, appendLog } = require('./config');
const { generateWish } = require('./groq');
const { sendText, sendMedia, getSocket, state: waState } = require('./whatsapp');
const { pickMedia } = require('./media');

let wishJob = null;
let mediaJob = null;

function nowInMinutes() {
  const tz = process.env.TZ || 'Asia/Kolkata';
  const now = new Date();
  // Format in target TZ, parse HH:MM
  const fmt = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz
  });
  const [hh, mm] = fmt.format(now).split(':').map(Number);
  return hh * 60 + mm;
}

function timeStrToMinutes(t) {
  if (!t || !t.includes(':')) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function isWithinActiveWindow(cfg) {
  if (!cfg.wishesEnabled) return false;
  if (!cfg.startTime || !cfg.endTime) return false;
  const start = timeStrToMinutes(cfg.startTime);
  const end = timeStrToMinutes(cfg.endTime);
  const now = nowInMinutes();
  if (start <= end) return now >= start && now < end;
  // overnight window e.g. 22:00 -> 06:00
  return now >= start || now < end;
}

function whatsappReady() {
  return waState.connectionState === 'open' && !!getSocket();
}

async function sendWishesNow() {
  const cfg = load();
  if (!cfg.wishesEnabled) return { skipped: 'disabled' };
  if (!isWithinActiveWindow(cfg)) return { skipped: 'outside-window' };
  if (!cfg.targets || cfg.targets.length === 0) return { skipped: 'no-targets' };
  if (!whatsappReady()) return { skipped: 'whatsapp-not-ready' };

  let text;
  try {
    const result = await generateWish();
    text = result.text;
  } catch (err) {
    appendLog({ type: 'wish', status: 'error', error: err.message });
    console.error('[scheduler] wish generation failed:', err.message);
    return { error: err.message };
  }

  const sent = [];
  const failed = [];
  for (const target of cfg.targets) {
    const jid = target.jid;
    try {
      await sendText(jid, text);
      sent.push(jid);
      appendLog({ type: 'wish', status: 'sent', target: jid, preview: text.slice(0, 80) });
      console.log(`[scheduler] wish sent to ${jid}`);
    } catch (err) {
      failed.push({ jid, error: err.message });
      appendLog({ type: 'wish', status: 'error', target: jid, error: err.message });
      console.error(`[scheduler] wish failed for ${jid}:`, err.message);
    }
  }

  return { sent, failed, preview: text.slice(0, 120) };
}

async function sendMediaNow() {
  const cfg = load();
  if (!cfg.mediaEnabled) return { skipped: 'disabled' };
  if (!cfg.targets || cfg.targets.length === 0) return { skipped: 'no-targets' };
  if (!whatsappReady()) return { skipped: 'whatsapp-not-ready' };

  const picked = pickMedia(cfg.mediaMode || 'random', cfg.mediaIndex || 0);
  if (!picked) {
    appendLog({ type: 'media', status: 'no-media' });
    return { skipped: 'no-media' };
  }
  const { file, nextIndex } = picked;

  // Persist the new mediaIndex for sequential mode
  update({ mediaIndex: nextIndex });

  const sent = [];
  const failed = [];
  for (const target of cfg.targets) {
    try {
      await sendMedia(target.jid, file.path, '');
      sent.push(target.jid);
      appendLog({ type: 'media', status: 'sent', target: target.jid, file: file.name });
      console.log(`[scheduler] media ${file.name} sent to ${target.jid}`);
    } catch (err) {
      failed.push({ jid: target.jid, error: err.message });
      appendLog({ type: 'media', status: 'error', target: target.jid, file: file.name, error: err.message });
      console.error(`[scheduler] media failed for ${target.jid}:`, err.message);
    }
  }

  return { sent, failed, file: file.name };
}

function start() {
  stop();

  const wishInterval = parseInt(process.env.WISH_INTERVAL_MINUTES || '5', 10);
  const mediaInterval = parseInt(process.env.MEDIA_INTERVAL_MINUTES || '60', 10);

  // Validate interval — node-cron requires */N where N divides 60 cleanly OR use explicit seconds
  // Simpler approach: use a 1-minute cron and check counters
  let wishCounter = 0;
  let mediaCounter = 0;

  wishJob = cron.schedule('* * * * *', async () => {
    wishCounter++;
    if (wishCounter < wishInterval) return;
    wishCounter = 0;
    try { await sendWishesNow(); } catch (err) { console.error('[scheduler] wish tick error:', err.message); }
  });

  mediaJob = cron.schedule('* * * * *', async () => {
    mediaCounter++;
    if (mediaCounter < mediaInterval) return;
    mediaCounter = 0;
    try { await sendMediaNow(); } catch (err) { console.error('[scheduler] media tick error:', err.message); }
  });

  console.log(`[scheduler] started — wishes every ${wishInterval}min, media every ${mediaInterval}min`);
}

function stop() {
  if (wishJob) { wishJob.stop(); wishJob = null; }
  if (mediaJob) { mediaJob.stop(); mediaJob = null; }
}

module.exports = { start, stop, sendWishesNow, sendMediaNow, isWithinActiveWindow, whatsappReady };
