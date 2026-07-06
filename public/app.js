'use strict';

const $ = (id) => document.getElementById(id);

let stateCache = null;

// ── Helpers ───────────────────────────────────────────────────
function fmtSize(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}
function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch { return iso; }
}

// ── Renderers ─────────────────────────────────────────────────
function renderStatus(wa) {
  const pill = $('wa-status');
  pill.className = 'status-pill ' + (wa.connectionState || 'init');
  const labels = { init: 'Initializing…', qr: 'Scan QR', connecting: 'Connecting…', open: 'Connected', close: 'Disconnected' };
  pill.querySelector('.label').textContent = labels[wa.connectionState] || wa.connectionState;

  $('qr-section').classList.toggle('hidden', wa.connectionState !== 'qr');
  $('user-section').classList.toggle('hidden', wa.connectionState !== 'open');

  if (wa.connectionState === 'qr') {
    $('qr-img').src = '/api/qr.png?t=' + Date.now();
  }
  if (wa.connectionState === 'open' && wa.user) {
    $('user-name').textContent = wa.user.name || wa.user.id.split('@')[0];
    $('user-id').textContent = wa.user.id;
  }
}

function renderConfig(cfg, meta) {
  $('cfg-name').value = cfg.birthdayPersonName || '';
  $('cfg-age').value = cfg.age || '';
  $('cfg-relation').innerHTML = meta.relations.map(r =>
    `<option value="${r.id}" ${r.id === cfg.relation ? 'selected' : ''}>${r.label}</option>`).join('');
  $('cfg-style').innerHTML = meta.styles.map(s =>
    `<option value="${s.id}" ${s.id === cfg.style ? 'selected' : ''}>${s.label}</option>`).join('');
  $('cfg-start').value = cfg.startTime || '09:00';
  $('cfg-end').value = cfg.endTime || '21:00';
  $('cfg-wishes-on').checked = !!cfg.wishesEnabled;
  $('cfg-media-on').checked = !!cfg.mediaEnabled;
  $('cfg-media-mode').value = cfg.mediaMode || 'random';
  $('wish-interval').textContent = meta.wishInterval;
  $('media-interval').textContent = meta.mediaInterval;
  $('tz-label').textContent = meta.tz;
}

function renderTargets(targets) {
  const tbody = $('targets-table').querySelector('tbody');
  $('targets-empty').style.display = (targets && targets.length) ? 'none' : 'block';
  if (!targets || !targets.length) { tbody.innerHTML = ''; return; }
  tbody.innerHTML = targets.map(t => `
    <tr>
      <td>${escapeHtml(t.name)}</td>
      <td><code>${escapeHtml(t.jid)}</code></td>
      <td><button class="btn-link" data-jid="${encodeURIComponent(t.jid)}" onclick="removeTarget(this)">Remove</button></td>
    </tr>`).join('');
}

function renderMedia(files) {
  const tbody = $('media-table').querySelector('tbody');
  $('media-empty').style.display = (files && files.length) ? 'none' : 'block';
  if (!files || !files.length) { tbody.innerHTML = ''; return; }
  tbody.innerHTML = files.map(f => `
    <tr>
      <td>${escapeHtml(f.name)}</td>
      <td>${f.isVideo ? 'Video' : 'Image'}</td>
      <td>${fmtSize(f.size)}</td>
      <td><button class="btn-link" data-name="${encodeURIComponent(f.name)}" onclick="removeMedia(this)">Delete</button></td>
    </tr>`).join('');
}

function renderLog(log) {
  const list = $('log-list');
  if (!log || !log.length) { list.innerHTML = '<div class="hint">No activity yet.</div>'; return; }
  list.innerHTML = log.map(l => {
    const type = l.error ? 'error' : (l.type || 'info');
    const msg = l.error
      ? `Error: ${escapeHtml(l.error)} (${escapeHtml(l.target || '')})`
      : `${escapeHtml(l.status || 'sent')} — ${escapeHtml(l.target || '')}${l.file ? ' · ' + escapeHtml(l.file) : ''}${l.preview ? ' · ' + escapeHtml(l.preview) : ''}`;
    return `<div class="log-item">
      <span class="log-ts">${fmtTime(l.ts)}</span>
      <span class="log-type ${type}">${type}</span>
      <span class="log-msg">${msg}</span>
    </div>`;
  }).join('');
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ── API calls ─────────────────────────────────────────────────
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

async function refreshAll() {
  try {
    const data = await api('/api/state');
    stateCache = data;
    renderStatus(data.whatsapp);
    renderConfig(data.config, data.meta);
    renderTargets(data.config.targets);
    if (!data.groq.configured) {
      const cards = document.querySelectorAll('.card');
      // Show a warning at top
    }
    refreshLog();
    refreshMedia();
  } catch (err) {
    console.error('refresh failed', err);
  }
}

async function refreshLog() {
  try {
    const data = await api('/api/log');
    renderLog(data.log);
  } catch (err) { console.error(err); }
}

async function refreshMedia() {
  try {
    const data = await api('/api/media');
    renderMedia(data.files);
  } catch (err) { console.error(err); }
}

// ── Event handlers ────────────────────────────────────────────
window.removeTarget = async (btn) => {
  const jid = decodeURIComponent(btn.dataset.jid);
  if (!confirm(`Remove ${jid}?`)) return;
  await api('/api/targets/' + encodeURIComponent(jid), { method: 'DELETE' });
  refreshAll();
};

window.removeMedia = async (btn) => {
  const name = decodeURIComponent(btn.dataset.name);
  if (!confirm(`Delete ${name}?`)) return;
  await api('/api/media/' + encodeURIComponent(name), { method: 'DELETE' });
  refreshMedia();
};

$('btn-save').addEventListener('click', async () => {
  const patch = {
    birthdayPersonName: $('cfg-name').value.trim(),
    age: $('cfg-age').value ? parseInt($('cfg-age').value, 10) : '',
    relation: $('cfg-relation').value,
    style: $('cfg-style').value,
    startTime: $('cfg-start').value,
    endTime: $('cfg-end').value,
    wishesEnabled: $('cfg-wishes-on').checked,
    mediaEnabled: $('cfg-media-on').checked,
    mediaMode: $('cfg-media-mode').value
  };
  try {
    await api('/api/config', { method: 'POST', body: JSON.stringify(patch) });
    flash('Settings saved ✓');
  } catch (err) { flash('Save failed: ' + err.message, true); }
});

$('btn-add-target').addEventListener('click', async () => {
  const name = $('target-name').value.trim();
  const jid = $('target-jid').value.trim();
  if (!jid) return flash('Enter phone or group ID', true);
  try {
    await api('/api/targets', { method: 'POST', body: JSON.stringify({ name, jid }) });
    $('target-name').value = '';
    $('target-jid').value = '';
    flash('Recipient added ✓');
    refreshAll();
  } catch (err) { flash('Add failed: ' + err.message, true); }
});

$('btn-test-wish').addEventListener('click', async () => {
  try {
    $('wish-text').textContent = 'Generating…';
    $('wish-preview').classList.remove('hidden');
    const send = $('send-to-first').checked;
    const data = await api('/api/test-wish', { method: 'POST', body: JSON.stringify({ send }) });
    $('wish-text').textContent = data.text;
    if (send) { flash('Wish sent to first target ✓'); refreshLog(); }
  } catch (err) {
    $('wish-text').textContent = 'Error: ' + err.message;
  }
});

$('btn-send-now-wish').addEventListener('click', async () => {
  try {
    const data = await api('/api/send-now/wishes', { method: 'POST' });
    const r = data.result;
    if (r.skipped) flash('Skipped: ' + r.skipped, true);
    else flash(`Wish sent to ${r.sent?.length || 0} target(s)`);
    refreshLog();
  } catch (err) { flash('Failed: ' + err.message, true); }
});

$('btn-send-now-media').addEventListener('click', async () => {
  try {
    const data = await api('/api/send-now/media', { method: 'POST' });
    const r = data.result;
    if (r.skipped) flash('Skipped: ' + r.skipped, true);
    else flash(`Media "${r.file}" sent to ${r.sent?.length || 0} target(s)`);
    refreshLog();
  } catch (err) { flash('Failed: ' + err.message, true); }
});

$('btn-upload').addEventListener('click', async () => {
  const files = $('upload-file').files;
  if (!files.length) return flash('Pick files first', true);
  for (const f of files) {
    const buf = await f.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    try {
      await api('/api/media/upload', { method: 'POST', body: JSON.stringify({ name: f.name, base64: b64 }) });
    } catch (err) { flash('Upload failed: ' + f.name + ' — ' + err.message, true); }
  }
  $('upload-file').value = '';
  flash('Upload complete ✓');
  refreshMedia();
});

$('btn-logout').addEventListener('click', async () => {
  if (!confirm('Logout and wipe session? You will need to scan QR again.')) return;
  await api('/api/logout', { method: 'POST' });
});

// ── Toast ─────────────────────────────────────────────────────
function flash(msg, isError) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
    t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#25d366;color:#fff;padding:10px 20px;border-radius:8px;z-index:9999;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,.4);';
  }
  t.style.background = isError ? '#f04444' : '#25d366';
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.display = 'none'; }, 3000);
}

// ── SSE for live status ───────────────────────────────────────
function startSSE() {
  const es = new EventSource('/api/state/stream');
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.whatsapp) renderStatus(data.whatsapp);
    } catch (_) {}
  };
  es.onerror = () => { es.close(); setTimeout(startSSE, 3000); };
}

// ── Init ──────────────────────────────────────────────────────
refreshAll();
startSSE();
setInterval(refreshLog, 15000);
setInterval(refreshMedia, 30000);
