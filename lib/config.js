'use strict';

const fs = require('fs');
const path = require('path');

// Allow Railway/Render to point CONFIG_PATH at a persistent volume
const CONFIG_PATH = process.env.CONFIG_PATH || path.join(__dirname, '..', 'config.json');

const DEFAULT_CONFIG = {
  // Recipients — array of { name, jid } where jid is phone number or group ID
  // e.g. { name: 'Mom', jid: '919876543210@s.whatsapp.net' }
  //      { name: 'Family Group', jid: '120363xxx@g.us' }
  targets: [],

  // Birthday person info
  birthdayPersonName: '',
  relation: 'friend',       // see RELATIONS below
  style: 'warm',            // see STYLES below
  age: '',                  // optional

  // Active window (24h HH:MM in TZ from env)
  startTime: '09:00',
  endTime: '21:00',

  // Schedulers enabled?
  wishesEnabled: true,
  mediaEnabled: true,

  // Track last sent media index (for sequential mode)
  mediaIndex: 0,
  mediaMode: 'random',      // 'random' | 'sequential'

  // Activity log (kept small, last 100 entries)
  log: []
};

const RELATIONS = [
  { id: 'mother',    label: 'Mother' },
  { id: 'father',    label: 'Father' },
  { id: 'sister',    label: 'Sister' },
  { id: 'brother',   label: 'Brother' },
  { id: 'son',       label: 'Son' },
  { id: 'daughter',  label: 'Daughter' },
  { id: 'grandmother', label: 'Grandmother' },
  { id: 'grandfather', label: 'Grandfather' },
  { id: 'wife',      label: 'Wife' },
  { id: 'husband',   label: 'Husband' },
  { id: 'girlfriend', label: 'Girlfriend' },
  { id: 'boyfriend', label: 'Boyfriend' },
  { id: 'bestfriend', label: 'Best Friend' },
  { id: 'friend',    label: 'Friend' },
  { id: 'colleague', label: 'Colleague' },
  { id: 'boss',      label: 'Boss' },
  { id: 'kid',       label: 'Kid / Child' }
];

const STYLES = [
  { id: 'warm',      label: 'Warm & Emotional' },
  { id: 'funny',     label: 'Funny & Playful' },
  { id: 'formal',    label: 'Formal & Respectful' },
  { id: 'short',     label: 'Short & Sweet' },
  { id: 'poetic',    label: 'Poetic / Shayari' },
  { id: 'religious', label: 'Religious / Blessed' }
];

function load() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      save(DEFAULT_CONFIG);
      return { ...DEFAULT_CONFIG };
    }
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    // Merge with defaults to be resilient to new fields
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (err) {
    console.error('[config] load failed, using defaults:', err.message);
    return { ...DEFAULT_CONFIG };
  }
}

function save(cfg) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
    return true;
  } catch (err) {
    console.error('[config] save failed:', err.message);
    return false;
  }
}

function update(patch) {
  const current = load();
  const next = { ...current, ...patch };
  // Keep log capped at 100 entries
  if (next.log && next.log.length > 100) {
    next.log = next.log.slice(-100);
  }
  save(next);
  return next;
}

function appendLog(entry) {
  const current = load();
  current.log = (current.log || []).concat([{ ts: new Date().toISOString(), ...entry }]).slice(-100);
  save(current);
  return current;
}

module.exports = {
  load,
  save,
  update,
  appendLog,
  RELATIONS,
  STYLES,
  DEFAULT_CONFIG
};
