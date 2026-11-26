// "Keep deleted messages": a copy, on this device only, of messages that other people deleted
// after they had already been delivered to (and loaded by) this client.
const key = (uid) => 'kept:' + uid;
const MAX_KEPT = 400;

export function loadKept(uid) {
  try { return JSON.parse(localStorage.getItem(key(uid)) || '{}'); } catch { return {}; }
}
function save(uid, all) {
  const ids = Object.keys(all).map(Number).sort((a, b) => b - a);
  const trimmed = {};
  for (const id of ids.slice(0, MAX_KEPT)) trimmed[id] = all[id];
  try { localStorage.setItem(key(uid), JSON.stringify(trimmed)); } catch { /* storage full or blocked */ }
}
export function rememberKept(uid, m) {
  const all = loadKept(uid);
  all[m.id] = {
    id: m.id, chatId: m.chatId, kind: m.kind, text: m.text, createdAt: m.createdAt, editedAt: m.editedAt,
    sender: m.sender, replyTo: null, gift: null, deleted: false, keptDeleted: true,
    file: m.file ? { id: m.file.id, name: m.file.name, mime: m.file.mime, size: m.file.size, gone: true } : null,
  };
  save(uid, all);
}
export function forgetKept(uid, id) {
  const all = loadKept(uid);
  delete all[id];
  save(uid, all);
}
export function clearKept(uid) {
  try { localStorage.removeItem(key(uid)); } catch { /* ignore */ }
}
export const keptCount = (uid) => Object.keys(loadKept(uid)).length;
