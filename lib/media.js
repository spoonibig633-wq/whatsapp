'use strict';

const fs = require('fs');
const path = require('path');

const MEDIA_DIR = process.env.MEDIA_DIR || path.join(__dirname, '..', 'media');
const VALID_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.mov', '.mkv', '.webm', '.3gp'];

function ensureMediaDir() {
  if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
  return MEDIA_DIR;
}

function listMedia() {
  ensureMediaDir();
  try {
    const files = fs.readdirSync(MEDIA_DIR);
    return files
      .filter(f => VALID_EXT.includes(path.extname(f).toLowerCase()))
      .map(f => ({
        name: f,
        path: path.join(MEDIA_DIR, f),
        ext: path.extname(f).toLowerCase(),
        size: fs.statSync(path.join(MEDIA_DIR, f)).size,
        isVideo: ['.mp4', '.mov', '.mkv', '.webm', '.3gp'].includes(path.extname(f).toLowerCase())
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  } catch (err) {
    console.error('[media] list failed:', err.message);
    return [];
  }
}

/**
 * Pick next media based on mode.
 * @param {('random'|'sequential')} mode
 * @param {number} lastIndex  - last index used (sequential mode)
 * @returns {{ file, nextIndex } | null}
 */
function pickMedia(mode = 'random', lastIndex = 0) {
  const files = listMedia();
  if (files.length === 0) return null;

  let index;
  if (mode === 'sequential') {
    index = (lastIndex + 1) % files.length;
  } else {
    index = Math.floor(Math.random() * files.length);
  }
  return { file: files[index], nextIndex: index };
}

module.exports = { listMedia, pickMedia, ensureMediaDir, MEDIA_DIR };
