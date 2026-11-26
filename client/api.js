let token = null;
try { token = localStorage.getItem('token'); } catch { /* storage blocked */ }

export const getToken = () => token;
export function setToken(t) {
  token = t;
  try { t ? localStorage.setItem('token', t) : localStorage.removeItem('token'); } catch { /* ignore */ }
}

export async function api(method, path, body) {
  const res = await fetch('/api' + path, {
    method,
    headers: {
      ...(token ? { authorization: 'Bearer ' + token } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function upload(file) {
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + token,
      'x-filename': encodeURIComponent(file.name || 'file'),
      'content-type': file.type || 'application/octet-stream',
    },
    body: file,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data;
}

/* ---------- formatting helpers ---------- */
export const initials = (name = '?') =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';

export const timeOf = (ts) => {
  let hour12 = false;
  try {
    const saved = JSON.parse(localStorage.getItem('settings') || '{}');
    hour12 = saved.timeFormat === '12';
  } catch { /* use 24-hour time */ }
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12 });
};

export function shortDate(ts) {
  const d = new Date(ts), n = new Date();
  if (d.toDateString() === n.toDateString()) return timeOf(ts);
  const diff = (n - d) / 86400000;
  if (diff < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export function dayLabel(ts) {
  const d = new Date(ts), n = new Date();
  if (d.toDateString() === n.toDateString()) return 'Today';
  const y = new Date(n); y.setDate(n.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'long', year: d.getFullYear() === n.getFullYear() ? undefined : 'numeric' });
}

export function lastSeen(u) {
  if (!u) return '';
  if (u.online) return 'online';
  if (!u.lastSeen) return 'last seen recently';
  return 'last seen ' + shortDate(u.lastSeen);
}

export const fmtSize = (n) =>
  n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';

export function preview(m) {
  if (!m) return '';
  if (m.deleted) return 'Message deleted';
  if (m.kind === 'gift' && m.gift) return `🎁 Gift: ${m.gift.type.name}`;
  if (m.file) {
    if (m.file.mime.startsWith('image/')) return '🖼 Photo' + (m.text ? ', ' + m.text : '');
    if (m.file.mime.startsWith('audio/')) return '🎤 Voice message';
    if (m.file.mime.startsWith('video/')) return '🎬 Video';
    return '📎 ' + m.file.name;
  }
  return m.text;
}
