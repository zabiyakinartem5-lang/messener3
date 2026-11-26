'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { db, tx, DATA_DIR } = require('./db');
const { rollAttributes, modelList, tierOf, MODEL3D } = require('./gifts');
const { levelOf, PREMIUM } = require('./levels');
const R = require('./rewards');
const ai = require('./ai');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0'; // use 127.0.0.1 when a reverse proxy is on the same machine
const AI_ENABLED = !/^(0|false|off|no)$/i.test(process.env.AI_ENABLED || '1');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
const MAX_UPLOAD = 25 * 1024 * 1024;
const MAX_TEXT = 4000;
const getSetting = (k, d) => db.prepare('SELECT value FROM settings WHERE key=?').get(k)?.value ?? d;
const setSetting = (k, v) => db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, String(v));
const REG_MODES = ['open', 'invite', 'closed'];
const APP_NAME = (process.env.APP_NAME || 'Messenger').slice(0, 30);
const isPremium = (u) => !!u && u.premium_until > Date.now();
const premiumPrice = () => Math.max(1, Number(getSetting('premium_price', PREMIUM.defaultPrice)) || PREMIUM.defaultPrice);
const giftPriceFor = (u, base) => (isPremium(u) ? Math.ceil(base * (100 - PREMIUM.discountPct) / 100) : base);
// Charge Stars and count them towards the level; tells the person when they reach a new level.
function spendMsgBalance(userId, amount) {\n  db.prepare('UPDATE users SET msg_balance=msg_balance-? WHERE id=? AND msg_balance>=?').run(amount, userId, amount);\n}\nfunction spend(userId, amount) {
  const before = levelOf(getUser(userId).stars_spent).n;
  db.prepare('UPDATE users SET stars=stars-?, stars_spent=stars_spent+? WHERE id=?').run(amount, amount, userId);
  const after = levelOf(getUser(userId).stars_spent);
  if (after.n > before) setTimeout(() => sendTo(userId, { type: 'level', level: after.n, title: after.title, icon: after.icon }), 50);
}
const dailyBonus = () => Math.max(1, Number(getSetting('daily_bonus', 100)) || 100);
const startStars = () => Math.max(0, Number(getSetting('start_stars', 500)) || 0);
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const now = () => Date.now();

class HttpError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const bad = (msg) => new HttpError(400, msg);

/* ------------------------------------------------------------------ */
/* Realtime registry                                                   */
/* ------------------------------------------------------------------ */
const sockets = new Map(); // userId -> Set<ws>
const isOnline = (id) => (sockets.get(id)?.size || 0) > 0;

function sendTo(userId, payload) {
  const set = sockets.get(userId);
  if (!set) return;
  const data = JSON.stringify(payload);
  for (const ws of set) if (ws.readyState === 1) ws.send(data);
}
function broadcastAll(payload) {
  const data = JSON.stringify(payload);
  for (const set of sockets.values())
    for (const ws of set) if (ws.readyState === 1) ws.send(data);
}
function memberIds(chatId) {
  return db.prepare('SELECT user_id FROM members WHERE chat_id=?').all(chatId).map((r) => r.user_id);
}
function toChat(chatId, payload, exceptUserId) {
  for (const uid of memberIds(chatId)) if (uid !== exceptUserId) sendTo(uid, payload);
}

/* ------------------------------------------------------------------ */
/* Views                                                               */
/* ------------------------------------------------------------------ */
const avatarUrl = (u) => (u.avatar_file ? `/files/${u.avatar_file}` : null);
// Hiding "last seen", or ghost mode, makes a user look permanently offline to everyone else.
const seenHidden = (u) => !!(u && (u.hide_seen || u.ghost));
function coverView(u) {
  if (!u.cover) return null;
  try {
    const c = JSON.parse(u.cover);
    // gifts pinned to the background; a gift that changed hands is silently dropped
    const ids = (Array.isArray(c.gifts) ? c.gifts : []).filter((id) => db.prepare('SELECT 1 FROM gifts WHERE id=? AND owner_id=?').get(id, u.id));
    return { g: Number.isInteger(c.g) ? c.g : null, e: c.e || null, url: c.f ? `/files/${c.f}` : null, giftIds: ids, gifts: ids.map(giftView).filter(Boolean) };
  } catch { return null; }
}
const musicView = (u) => (u.music_file ? { url: `/files/${u.music_file}`, title: u.music_title || 'Music' } : null);
const userView = (u) =>
  u && {
    id: u.id, username: u.username, displayName: u.display_name, color: u.color, avatar: avatarUrl(u),
    bio: u.bio, online: seenHidden(u) ? false : isOnline(u.id), lastSeen: seenHidden(u) ? 0 : u.last_seen,
    statusEmoji: u.status_emoji || '', cover: coverView(u), music: musicView(u), isBot: !!u.is_bot, nameColor: u.name_color || '',
    level: u.is_bot ? null : (({ n, title, icon }) => ({ n, title, icon }))(levelOf(u.stars_spent)), premium: isPremium(u),
  };
const selfView = (u) => ({
  ...userView(u), online: true, lastSeen: u.last_seen, stars: u.stars, msg: u.msg_balance || 0, lastDaily: u.last_daily, hideSeen: !!u.hide_seen, ghost: !!u.ghost,
  aiPrompt: u.ai_prompt || '', aiModel: u.ai_model || '', isAdmin: !!u.is_admin,
  nameColor: u.name_color || '', nicks: Object.fromEntries(db.prepare('SELECT target_id, nick FROM nicks WHERE owner_id=?').all(u.id).map((r) => [r.target_id, r.nick])),
  starsSpent: u.stars_spent, levelInfo: levelOf(u.stars_spent), premiumUntil: u.premium_until,
  dailyBonus: dailyBonus() * (isPremium(u) ? PREMIUM.dailyMultiplier : 1), premiumPerks: { ...PREMIUM, price: premiumPrice() },
});
const miniUser = (u) => u && { nameColor: u.name_color || '', id: u.id, username: u.username, displayName: u.display_name, color: u.color, avatar: avatarUrl(u), isBot: !!u.is_bot, statusEmoji: u.status_emoji || '' };

const getUser = (id) => db.prepare('SELECT * FROM users WHERE id=?').get(id);

function fileView(f) {
  return f && { id: f.id, name: f.name, mime: f.mime, size: f.size, url: `/files/${f.id}` };
}

function giftView(id) {
  const g = db.prepare(`
    SELECT g.*, t.slug, t.name AS tname, t.emoji, t.color, t.price, t.supply, t.sold, t.upgrade_price
    FROM gifts g JOIN gift_types t ON t.id = g.type_id WHERE g.id=?`).get(id);
  if (!g) return null;
  const owner = getUser(g.owner_id);
  const sender = getUser(g.sender_id);
  return {
    id: g.id,
    type: {
      id: g.type_id, slug: g.slug, name: g.tname, emoji: g.emoji, color: g.color,
      price: g.price, supply: g.supply, sold: g.sold, limited: g.supply != null, rarity: tierOf({ supply: g.supply, price: g.price }), model3d: MODEL3D.has(g.slug),
      models: g.upgrade_price != null ? modelList(g.slug) : [],
    },
    owner: miniUser(owner),
    sender: miniUser(sender),
    serial: g.serial,
    upgraded: !!g.upgraded,
    collectibleNo: g.collectible_no,
    attrs: g.attrs ? JSON.parse(g.attrs) : null,
    token: g.token ? '0x' + g.token : null,
    upgradePrice: g.upgrade_price,
    canUpgrade: !g.upgraded && g.upgrade_price != null,
    createdAt: g.created_at,
    favorite: !!g.favorite,
    hidden: !!g.hidden,
  };
}

function reactionsOf(messageId) {
  const rows = db.prepare('SELECT emoji, user_id FROM reactions WHERE message_id=? ORDER BY created_at').all(messageId);
  const map = new Map();
  for (const r of rows) { if (!map.has(r.emoji)) map.set(r.emoji, []); map.get(r.emoji).push(r.user_id); }
  return [...map].map(([emoji, users]) => ({ emoji, count: users.length, users: users.slice(0, 50) }));
}

function messageView(m, depth = 0) {
  const v = {
    id: m.id, chatId: m.chat_id, kind: m.kind, deleted: !!m.deleted,
    text: m.deleted ? '' : m.text, createdAt: m.created_at, editedAt: m.edited_at,
    sender: miniUser(getUser(m.sender_id)), replyTo: null, file: null, gift: null,
    reactions: m.deleted ? [] : reactionsOf(m.id),
  };
  if (!m.deleted) {
    if (m.file_id) v.file = fileView(db.prepare('SELECT * FROM files WHERE id=?').get(m.file_id));
    if (m.gift_id) v.gift = giftView(m.gift_id);
    if (m.reply_to && depth === 0) {
      const r = db.prepare('SELECT * FROM messages WHERE id=? AND chat_id=?').get(m.reply_to, m.chat_id);
      if (r) v.replyTo = messageView(r, 1);
    }
  }
  return v;
}

const getMember = (chatId, userId) =>
  db.prepare('SELECT * FROM members WHERE chat_id=? AND user_id=?').get(chatId, userId);

function requireMember(chatId, userId) {
  const chat = db.prepare('SELECT * FROM chats WHERE id=?').get(chatId);
  if (!chat) throw new HttpError(404, 'Chat not found');
  const member = getMember(chatId, userId);
  if (!member) throw new HttpError(403, 'You are not a member of this chat');
  return { chat, member };
}

const isAdmin = (member) => member.role === 'owner' || member.role === 'admin';
const canPost = (chat, member) => (chat.type === 'channel' ? isAdmin(member) : true);

function chatView(chat, userId, { withMembers = false } = {}) {
  const member = getMember(chat.id, userId);
  const last = db.prepare('SELECT * FROM messages WHERE chat_id=? ORDER BY id DESC LIMIT 1').get(chat.id);
  const unread = member
    ? db.prepare(
        'SELECT COUNT(*) AS n FROM messages WHERE chat_id=? AND id>? AND sender_id!=? AND deleted=0 AND kind!=\'system\''
      ).get(chat.id, member.last_read_id, userId).n
    : 0;
  const count = db.prepare('SELECT COUNT(*) AS n FROM members WHERE chat_id=?').get(chat.id).n;
  const v = {
    id: chat.id, type: chat.type, title: chat.title, handle: chat.handle, description: chat.description,
    membersCount: count, createdAt: chat.created_at, unread,
    role: member?.role || null, canPost: member ? canPost(chat, member) : false,
    lastMessage: last ? messageView(last) : null,
    peer: null, peerRead: 0,
  };
  if (chat.type === 'private') {
    const peerRow = db.prepare('SELECT * FROM members WHERE chat_id=? AND user_id!=?').get(chat.id, userId);
    if (peerRow) {
      v.peer = userView(getUser(peerRow.user_id));
      v.peerRead = peerRow.shown_read_id;
      v.title = v.peer.displayName;
    }
  }
  if (withMembers) {
    v.members = db.prepare('SELECT * FROM members WHERE chat_id=? ORDER BY joined_at').all(chat.id)
      .map((m) => ({ ...userView(getUser(m.user_id)), role: m.role }));
  }
  return v;
}

/* ------------------------------------------------------------------ */
/* Auth helpers                                                        */
/* ------------------------------------------------------------------ */
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}
function verifyPassword(password, salt, hash) {
  const a = Buffer.from(hashPassword(password, salt), 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token,user_id,created_at) VALUES (?,?,?)').run(token, userId, now());
  return token;
}
function userFromToken(token) {
  if (!token) return null;
  const row = db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?').get(token);
  return row && !row.banned ? row : null;
}

const attempts = new Map(); // ip -> {n, reset}
// Behind a reverse proxy (Caddy, nginx, Cloudflare Tunnel) every request comes from the proxy's address.
// With TRUST_PROXY=1 the real client address is taken from X-Forwarded-For (the entry the proxy added).
function clientIp(req) {
  if (process.env.TRUST_PROXY && process.env.TRUST_PROXY !== '0') {
    const parts = String(req.headers['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return req.socket.remoteAddress;
}
function throttle(ip, limit = 15, windowMs = 15 * 60 * 1000) {
  const t = now();
  let a = attempts.get(ip);
  if (!a || a.reset < t) a = { n: 0, reset: t + windowMs };
  a.n++;
  attempts.set(ip, a);
  if (a.n > limit) throw new HttpError(429, 'Too many attempts, try again later');
}

/* ------------------------------------------------------------------ */
/* Messaging core                                                      */
/* ------------------------------------------------------------------ */
function insertMessage({ chatId, senderId, kind = 'text', text = '', fileId = null, giftId = null, replyTo = null }) {
  const r = db.prepare(
    'INSERT INTO messages (chat_id,sender_id,kind,text,file_id,gift_id,reply_to,created_at) VALUES (?,?,?,?,?,?,?,?)'
  ).run(chatId, senderId, kind, text, fileId, giftId, replyTo, now());
  const id = Number(r.lastInsertRowid);
  // sending a message always shows you have read everything up to it, even in ghost mode
  db.prepare('UPDATE members SET last_read_id=MAX(last_read_id,?), shown_read_id=MAX(shown_read_id,?) WHERE chat_id=? AND user_id=?')
    .run(id, id, chatId, senderId);
  return db.prepare('SELECT * FROM messages WHERE id=?').get(id);
}
function publishMessage(row) {
  const view = messageView(row);
  toChat(row.chat_id, { type: 'message:new', message: view });
  return view;
}
function systemMessage(chatId, senderId, text) {
  return publishMessage(insertMessage({ chatId, senderId, kind: 'system', text }));
}

// Removes an uploaded file once nothing refers to it any more (replaced avatar / cover / music).
function dropFile(id) {
  if (!id) return;
  const used =
    db.prepare('SELECT 1 FROM messages WHERE file_id=? LIMIT 1').get(id) ||
    db.prepare('SELECT 1 FROM users WHERE avatar_file=? OR music_file=? OR cover LIKE ? LIMIT 1').get(id, id, `%${id}%`);
  if (used) return;
  db.prepare('DELETE FROM files WHERE id=?').run(id);
  fs.rm(path.join(UPLOAD_DIR, id), { force: true }, () => {});
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */
const routes = [];
function route(method, pattern, handler, { auth = true } = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler, auth });
}
const intParam = (v, name = 'id') => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw bad(`Invalid ${name}`);
  return n;
};
const str = (v, max, name) => {
  if (v == null) return '';
  if (typeof v !== 'string') throw bad(`${name} must be a string`);
  const s = v.trim();
  if (s.length > max) throw bad(`${name} is too long`);
  return s;
};

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'Payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJson(req) {
  const buf = await readBody(req, 1e6);
  if (!buf.length) return {};
  try { return JSON.parse(buf.toString('utf8')); } catch { throw bad('Invalid JSON'); }
}
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

/* ---------------------------- Auth routes --------------------------- */
route('POST', '/api/register', async ({ req, body }) => {
  throttle(clientIp(req), 20);
  const username = str(body.username, 24, 'Username');
  const displayName = str(body.displayName, 40, 'Name') || username;
  const password = typeof body.password === 'string' ? body.password : '';
  if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) throw bad('Username: 3-24 letters, digits or underscore');
  if (password.length < 8 || password.length > 200) throw bad('Password must be at least 8 characters');
  if (db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) throw new HttpError(409, 'Username is taken');
  const firstUser = !db.prepare('SELECT 1 FROM users WHERE is_bot=0 LIMIT 1').get();
  const regMode = getSetting('reg_mode', 'open');
  let invite = null;
  if (!firstUser && regMode === 'closed') throw new HttpError(403, 'Registration is closed');
  if (!firstUser && regMode === 'invite') {
    invite = db.prepare('SELECT * FROM invites WHERE code=? AND uses_left>0').get(String(body.inviteCode || '').trim().toUpperCase());
    if (!invite) throw new HttpError(403, 'A valid invite code is required');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const r = db.prepare(
    'INSERT INTO users (username,display_name,pass_hash,salt,color,created_at,last_seen) VALUES (?,?,?,?,?,?,?)'
  ).run(username, displayName, hashPassword(password, salt), salt, crypto.randomInt(8), now(), now());
  const id = Number(r.lastInsertRowid);
  db.prepare('UPDATE users SET stars=? WHERE id=?').run(startStars(), id);
  if (invite) db.prepare('UPDATE invites SET uses_left=uses_left-1, used=used+1 WHERE code=?').run(invite.code);
  if (!db.prepare('SELECT 1 FROM users WHERE is_admin=1').get()) db.prepare('UPDATE users SET is_admin=1 WHERE id=?').run(id);
  return { status: 201, data: { token: createSession(id), user: selfView(getUser(id)) } };
}, { auth: false });

route('POST', '/api/login', async ({ req, body }) => {
  throttle(clientIp(req));
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(str(body.username, 24, 'Username'));
  const pw = typeof body.password === 'string' ? body.password : '';
  if (!u || !verifyPassword(pw, u.salt, u.pass_hash)) throw new HttpError(401, 'Wrong username or password');
  if (u.banned) throw new HttpError(403, 'This account has been suspended');
  return { data: { token: createSession(u.id), user: selfView(u) } };
}, { auth: false });

route('POST', '/api/logout', ({ token }) => {
  db.prepare('DELETE FROM sessions WHERE token=?').run(token);
  return { data: { ok: true } };
});

route('GET', '/api/health', () => ({ data: { ok: true, uptime: Math.round(process.uptime()) } }), { auth: false });

route('GET', '/api/config', () => ({ data: { appName: APP_NAME, regMode: getSetting('reg_mode', 'open'), maintenance: getSetting('maintenance', '0') === '1' ? getSetting('maintenance_text', 'Back soon.') : null, dailyBonus: dailyBonus() } }), { auth: false });

route('GET', '/api/me', ({ user }) => ({ data: selfView(user) }));

route('PATCH', '/api/me', ({ user, body }) => {
  const displayName = str(body.displayName ?? user.display_name, 40, 'Name') || user.display_name;
  const bio = str(body.bio ?? user.bio, 200, 'Bio');

  let username = user.username;
  if (body.username !== undefined) {
    const next = str(body.username, 24, 'Username');
    if (!/^[A-Za-z0-9_]{3,24}$/.test(next)) throw bad('Username: 3-24 letters, digits or underscore');
    if (next.toLowerCase() !== user.username.toLowerCase() && db.prepare('SELECT 1 FROM users WHERE username=?').get(next))
      throw new HttpError(409, 'Username is taken');
    username = next;
  }

  let avatar = user.avatar_file;
  if ('avatarFileId' in body) {
    if (body.avatarFileId === null) avatar = null;
    else {
      const f = db.prepare('SELECT * FROM files WHERE id=?').get(String(body.avatarFileId));
      if (!f || f.uploader_id !== user.id || !/^image\/(png|jpeg|gif|webp)$/.test(f.mime)) throw bad('Invalid avatar');
      avatar = f.id;
    }
  }

  let statusEmoji = user.status_emoji;
  if ('statusEmoji' in body) {
    const e = typeof body.statusEmoji === 'string' ? body.statusEmoji.trim() : '';
    if (e.length > 16 || (e && !/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(e))) throw bad('Invalid status emoji');
    statusEmoji = e;
  }

  let cover = user.cover;
  if ('cover' in body) {
    if (body.cover === null) cover = '';
    else {
      const c = body.cover || {};
      const out = {};
      if (c.g != null) { if (!Number.isInteger(c.g) || c.g < 0 || c.g > 119) throw bad('Invalid cover'); out.g = c.g; }
      if (c.e) {
        if (typeof c.e !== 'string' || c.e.length > 16 || !/\p{Extended_Pictographic}/u.test(c.e)) throw bad('Invalid cover pattern');
        out.e = c.e;
      }
      if (c.f) {
        const f = db.prepare('SELECT * FROM files WHERE id=?').get(String(c.f));
        if (!f || f.uploader_id !== user.id || !/^image\/(png|jpeg|gif|webp)$/.test(f.mime)) throw bad('Invalid cover photo');
        out.f = f.id;
      }
      if (c.gifts != null) {
        if (!Array.isArray(c.gifts) || c.gifts.length > (isPremium(user) ? PREMIUM.pins : 3)) throw bad(`You can pin up to ${isPremium(user) ? PREMIUM.pins : 3} gifts` + (isPremium(user) ? '' : ' (Premium: ' + PREMIUM.pins + ')'));
        const ids = [...new Set(c.gifts.map(Number))];
        for (const id of ids) {
          if (!Number.isInteger(id) || !db.prepare('SELECT 1 FROM gifts WHERE id=? AND owner_id=?').get(id, user.id)) throw bad('You can only pin gifts you own');
        }
        if (ids.length) out.gifts = ids;
      }
      cover = Object.keys(out).length ? JSON.stringify(out) : '';
    }
  }

  let musicFile = user.music_file;
  let musicTitle = user.music_title;
  if ('music' in body) {
    if (body.music === null) { musicFile = null; musicTitle = ''; }
    else {
      const f = db.prepare('SELECT * FROM files WHERE id=?').get(String(body.music?.fileId));
      if (!f || f.uploader_id !== user.id || !/^audio\//.test(f.mime)) throw bad('Invalid music file');
      musicFile = f.id;
      musicTitle = str(body.music.title || f.name.replace(/\.[^.]+$/, ''), 80, 'Title');
    }
  }

  let aiPrompt = user.ai_prompt;
  if ('aiPrompt' in body) aiPrompt = str(body.aiPrompt, 1000, 'Instructions');
  let aiModel = user.ai_model;
  if ('aiModel' in body) {
    aiModel = typeof body.aiModel === 'string' ? body.aiModel.trim().slice(0, 80) : '';
    if (!/^[\w.:\/@+-]*$/.test(aiModel)) throw bad('Invalid model name');
  }

  let nameColor = user.name_color;
  if ('nameColor' in body) {
    nameColor = typeof body.nameColor === 'string' ? body.nameColor.trim() : '';
    if (nameColor && !/^#[0-9a-fA-F]{6}$/.test(nameColor)) throw bad('Invalid colour');
  }
  const hide = 'hideSeen' in body ? (body.hideSeen ? 1 : 0) : user.hide_seen;
  const ghost = 'ghost' in body ? (body.ghost ? 1 : 0) : user.ghost;
  db.prepare(`UPDATE users SET display_name=?, bio=?, username=?, avatar_file=?, hide_seen=?, ghost=?,
      status_emoji=?, cover=?, music_file=?, music_title=?, ai_prompt=?, ai_model=?, name_color=? WHERE id=?`)
    .run(displayName, bio, username, avatar, hide, ghost, statusEmoji, cover, musicFile, musicTitle, aiPrompt, aiModel, nameColor, user.id);
  for (const old of [user.avatar_file, user.music_file]) if (old && old !== avatar && old !== musicFile) dropFile(old);
  try { const oc = user.cover && JSON.parse(user.cover).f; if (oc && oc !== (cover && JSON.parse(cover).f)) dropFile(oc); } catch { /* ignore */ }

  const fresh = getUser(user.id);
  broadcastAll({ type: 'user:update', user: userView(fresh) });
  if (seenHidden(fresh) !== seenHidden(user)) {
    broadcastAll({ type: 'presence', userId: user.id, online: seenHidden(fresh) ? false : isOnline(user.id), lastSeen: seenHidden(fresh) ? 0 : fresh.last_seen });
  }
  return { data: selfView(fresh) };
});

route('POST', '/api/me/password', ({ req, user, token, body }) => {
  throttle(clientIp(req));
  const current = typeof body.current === 'string' ? body.current : '';
  const next = typeof body.next === 'string' ? body.next : '';
  if (!verifyPassword(current, user.salt, user.pass_hash)) throw new HttpError(403, 'Current password is wrong');
  if (next.length < 8 || next.length > 200) throw bad('New password must be at least 8 characters');
  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare('UPDATE users SET pass_hash=?, salt=? WHERE id=?').run(hashPassword(next, salt), salt, user.id);
  // sign out every other device
  db.prepare('DELETE FROM sessions WHERE user_id=? AND token!=?').run(user.id, token);
  return { data: { ok: true } };
});

route('GET', '/api/users/:id', ({ params }) => {
  const u = getUser(intParam(params.id));
  if (!u) throw new HttpError(404, 'User not found');
  return { data: userView(u) };
});

/* ---------------------------- Search ------------------------------- */
route('GET', '/api/search', ({ user, url }) => {
  const raw = (url.searchParams.get('q') || '').trim().replace(/^@/, '').slice(0, 50);
  if (raw.length < 1) return { data: { users: [], chats: [] } };
  const like = '%' + raw.replace(/[\\%_]/g, (m) => '\\' + m) + '%';
  const users = db.prepare(
    `SELECT * FROM users WHERE id!=? AND banned=0 ${AI_ENABLED ? '' : 'AND is_bot=0'} AND (username LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\') LIMIT 20`
  ).all(user.id, like, like).map((u) => ({ ...userView(u), isContact: isContact(user.id, u.id) }));
  const chats = db.prepare(
    "SELECT * FROM chats WHERE type!='private' AND handle IS NOT NULL AND (handle LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\') LIMIT 20"
  ).all(like, like).map((c) => ({
    id: c.id, type: c.type, title: c.title, handle: c.handle, description: c.description,
    membersCount: db.prepare('SELECT COUNT(*) AS n FROM members WHERE chat_id=?').get(c.id).n,
    joined: !!getMember(c.id, user.id),
  }));
  return { data: { users, chats } };
});

/* ---------------------------- Chats -------------------------------- */
route('GET', '/api/chats', ({ user }) => {
  ensureAssistantChat(user);
  const rows = db.prepare('SELECT c.* FROM chats c JOIN members m ON m.chat_id=c.id WHERE m.user_id=?').all(user.id);
  const list = rows.map((c) => chatView(c, user.id));
  // private chats with no messages stay hidden until someone writes
  const visible = list.filter((c) => c.type !== 'private' || c.lastMessage);
  visible.sort((a, b) => (b.lastMessage?.createdAt || b.createdAt) - (a.lastMessage?.createdAt || a.createdAt));
  return { data: visible };
});

route('GET', '/api/chats/:id', ({ user, params }) => {
  const { chat } = requireMember(intParam(params.id), user.id);
  return { data: chatView(chat, user.id, { withMembers: true }) };
});

function ensurePrivateChat(userId, peerId) {
  const key = [userId, peerId].sort((a, b) => a - b).join(':');
  let chat = db.prepare('SELECT * FROM chats WHERE pair_key=?').get(key);
  if (!chat) {
    tx(() => {
      const r = db.prepare('INSERT INTO chats (type,pair_key,created_by,created_at) VALUES (?,?,?,?)')
        .run('private', key, userId, now());
      const id = Number(r.lastInsertRowid);
      const ins = db.prepare('INSERT INTO members (chat_id,user_id,role,joined_at) VALUES (?,?,?,?)');
      ins.run(id, userId, 'member', now());
      ins.run(id, peerId, 'member', now());
    });
    chat = db.prepare('SELECT * FROM chats WHERE pair_key=?').get(key);
  }
  return chat;
}

route('POST', '/api/chats/private', ({ user, body }) => {
  const peerId = intParam(body.userId, 'userId');
  if (peerId === user.id) throw bad('Cannot chat with yourself');
  if (!getUser(peerId)) throw new HttpError(404, 'User not found');
  return { data: chatView(ensurePrivateChat(user.id, peerId), user.id, { withMembers: true }) };
});

/* ---------------------------- Contacts ------------------------------ */
const isContact = (ownerId, contactId) => !!db.prepare('SELECT 1 FROM contacts WHERE owner_id=? AND contact_id=?').get(ownerId, contactId);
const contactList = (ownerId) =>
  db.prepare('SELECT u.* FROM contacts c JOIN users u ON u.id=c.contact_id WHERE c.owner_id=? ORDER BY u.display_name COLLATE NOCASE').all(ownerId)
    .map((u) => ({ ...userView(u), isContact: true }));

route('GET', '/api/contacts', ({ user }) => ({ data: contactList(user.id) }));

route('POST', '/api/contacts', ({ user, body }) => {
  const id = intParam(body.userId, 'userId');
  if (id === user.id) throw bad('You cannot add yourself');
  if (!getUser(id)) throw new HttpError(404, 'User not found');
  db.prepare('INSERT OR IGNORE INTO contacts (owner_id,contact_id,created_at) VALUES (?,?,?)').run(user.id, id, now());
  return { status: 201, data: contactList(user.id) };
});

route('DELETE', '/api/contacts/:id', ({ user, params }) => {
  db.prepare('DELETE FROM contacts WHERE owner_id=? AND contact_id=?').run(user.id, intParam(params.id));
  return { data: contactList(user.id) };
});

route('POST', '/api/chats', ({ user, body }) => {
  const type = body.type === 'channel' ? 'channel' : 'group';
  const title = str(body.title, 64, 'Title');
  if (!title) throw bad('Title is required');
  const description = str(body.description, 300, 'Description');
  let handle = str(body.handle, 32, 'Handle').replace(/^@/, '') || null;
  if (handle) {
    if (!/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(handle)) throw bad('Handle: 4-32 characters, start with a letter');
    if (db.prepare('SELECT 1 FROM chats WHERE handle=?').get(handle)) throw new HttpError(409, 'Handle is taken');
  }
  const ids = Array.isArray(body.memberIds) ? [...new Set(body.memberIds.map(Number))] : [];
  const chatId = tx(() => {
    const r = db.prepare('INSERT INTO chats (type,title,handle,description,created_by,created_at) VALUES (?,?,?,?,?,?)')
      .run(type, title, handle, description, user.id, now());
    const id = Number(r.lastInsertRowid);
    const ins = db.prepare('INSERT OR IGNORE INTO members (chat_id,user_id,role,joined_at) VALUES (?,?,?,?)');
    ins.run(id, user.id, 'owner', now());
    for (const uid of ids.slice(0, 200)) if (Number.isInteger(uid) && uid > 0 && getUser(uid)) ins.run(id, uid, 'member', now());
    return id;
  });
  systemMessage(chatId, user.id, `${user.display_name} created the ${type}`);
  return { status: 201, data: chatView(db.prepare('SELECT * FROM chats WHERE id=?').get(chatId), user.id, { withMembers: true }) };
});

route('POST', '/api/chats/:id/join', ({ user, params }) => {
  const chat = db.prepare('SELECT * FROM chats WHERE id=?').get(intParam(params.id));
  if (!chat || chat.type === 'private' || !chat.handle) throw new HttpError(404, 'Chat not found');
  if (!getMember(chat.id, user.id)) {
    db.prepare('INSERT INTO members (chat_id,user_id,role,joined_at) VALUES (?,?,?,?)').run(chat.id, user.id, 'member', now());
    if (chat.type === 'group') systemMessage(chat.id, user.id, `${user.display_name} joined`);
    toChat(chat.id, { type: 'chat:refresh', chatId: chat.id });
  }
  return { data: chatView(chat, user.id, { withMembers: true }) };
});

route('POST', '/api/chats/:id/leave', ({ user, params }) => {
  const { chat, member } = requireMember(intParam(params.id), user.id);
  if (chat.type === 'private') throw bad('Cannot leave a private chat');
  db.prepare('DELETE FROM members WHERE chat_id=? AND user_id=?').run(chat.id, user.id);
  const rest = db.prepare('SELECT * FROM members WHERE chat_id=? ORDER BY joined_at').all(chat.id);
  if (!rest.length) db.prepare('DELETE FROM chats WHERE id=?').run(chat.id);
  else {
    if (member.role === 'owner')
      db.prepare("UPDATE members SET role='owner' WHERE chat_id=? AND user_id=?").run(chat.id, rest[0].user_id);
    if (chat.type === 'group') systemMessage(chat.id, user.id, `${user.display_name} left`);
    toChat(chat.id, { type: 'chat:refresh', chatId: chat.id });
  }
  sendTo(user.id, { type: 'chat:removed', chatId: chat.id });
  return { data: { ok: true } };
});

route('POST', '/api/chats/:id/members', ({ user, params, body }) => {
  const { chat, member } = requireMember(intParam(params.id), user.id);
  if (chat.type === 'private') throw bad('Cannot add members to a private chat');
  if (chat.type === 'channel' && !isAdmin(member)) throw new HttpError(403, 'Only admins can add subscribers');
  const target = getUser(intParam(body.userId, 'userId'));
  if (!target) throw new HttpError(404, 'User not found');
  if (!getMember(chat.id, target.id)) {
    db.prepare('INSERT INTO members (chat_id,user_id,role,joined_at) VALUES (?,?,?,?)').run(chat.id, target.id, 'member', now());
    if (chat.type === 'group') systemMessage(chat.id, user.id, `${user.display_name} added ${target.display_name}`);
    toChat(chat.id, { type: 'chat:refresh', chatId: chat.id });
  }
  return { data: chatView(chat, user.id, { withMembers: true }) };
});

route('GET', '/api/chats/:id/messages', ({ user, params, url }) => {
  const { chat } = requireMember(intParam(params.id), user.id);
  const before = Number(url.searchParams.get('before')) || 0;
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 40, 1), 100);
  const rows = before
    ? db.prepare('SELECT * FROM messages WHERE chat_id=? AND id<? ORDER BY id DESC LIMIT ?').all(chat.id, before, limit)
    : db.prepare('SELECT * FROM messages WHERE chat_id=? ORDER BY id DESC LIMIT ?').all(chat.id, limit);
  return { data: { messages: rows.reverse().map((r) => messageView(r)), hasMore: rows.length === limit } };
});

route('POST', '/api/chats/:id/messages', ({ user, params, body }) => {
  const { chat, member } = requireMember(intParam(params.id), user.id);
  if (!canPost(chat, member)) throw new HttpError(403, 'Only admins can post in this channel');
  const text = str(body.text, MAX_TEXT, 'Message');
  let fileId = null;
  if (body.fileId) {
    const f = db.prepare('SELECT * FROM files WHERE id=?').get(String(body.fileId));
    if (!f || f.uploader_id !== user.id) throw bad('Unknown file');
    fileId = f.id;
  }
  if (!text && !fileId) throw bad('Message is empty');
  let replyTo = null;
  if (body.replyTo) {
    replyTo = intParam(body.replyTo, 'replyTo');
    if (!db.prepare('SELECT 1 FROM messages WHERE id=? AND chat_id=?').get(replyTo, chat.id)) throw bad('Reply target not found');
  }
  const row = insertMessage({ chatId: chat.id, senderId: user.id, kind: fileId ? 'file' : 'text', text, fileId, replyTo });
  const view = publishMessage(row);
  maybeAskAssistant(chat, user, row);
  return { status: 201, data: view };
});

route('POST', '/api/chats/:id/read', ({ user, params, body }) => {
  const { chat } = requireMember(intParam(params.id), user.id);
  const messageId = intParam(body.messageId, 'messageId');
  // our own unread counter always moves; the *public* read marker only moves outside ghost mode
  db.prepare('UPDATE members SET last_read_id=MAX(last_read_id,?) WHERE chat_id=? AND user_id=?').run(messageId, chat.id, user.id);
  if (!user.ghost) {
    db.prepare('UPDATE members SET shown_read_id=MAX(shown_read_id,?) WHERE chat_id=? AND user_id=?').run(messageId, chat.id, user.id);
    toChat(chat.id, { type: 'read', chatId: chat.id, userId: user.id, messageId });
  }
  return { data: { ok: true } };
});

/* ---------------------------- Messages ----------------------------- */
route('PATCH', '/api/messages/:id', ({ user, params, body }) => {
  const m = db.prepare('SELECT * FROM messages WHERE id=?').get(intParam(params.id));
  if (!m || m.deleted) throw new HttpError(404, 'Message not found');
  requireMember(m.chat_id, user.id);
  if (m.sender_id !== user.id || (m.kind !== 'text' && m.kind !== 'file')) throw new HttpError(403, 'You cannot edit this message');
  const text = str(body.text, MAX_TEXT, 'Message');
  if (!text && !m.file_id) throw bad('Message is empty');
  db.prepare('UPDATE messages SET text=?, edited_at=? WHERE id=?').run(text, now(), m.id);
  const view = messageView(db.prepare('SELECT * FROM messages WHERE id=?').get(m.id));
  toChat(m.chat_id, { type: 'message:update', message: view });
  return { data: view };
});

route('POST', '/api/messages/:id/reactions', ({ user, params, body }) => {
  const m = db.prepare('SELECT * FROM messages WHERE id=?').get(intParam(params.id));
  if (!m || m.deleted || m.kind === 'system') throw new HttpError(404, 'Message not found');
  requireMember(m.chat_id, user.id);
  const emoji = typeof body.emoji === 'string' ? body.emoji.trim() : '';
  if (!emoji || emoji.length > 16 || /[A-Za-z0-9<>&"']/.test(emoji) || !/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(emoji)) throw bad('Invalid reaction');
  const has = db.prepare('SELECT 1 FROM reactions WHERE message_id=? AND user_id=? AND emoji=?').get(m.id, user.id, emoji);
  if (has) db.prepare('DELETE FROM reactions WHERE message_id=? AND user_id=? AND emoji=?').run(m.id, user.id, emoji);
  else {
    const mine = db.prepare('SELECT COUNT(*) AS n FROM reactions WHERE message_id=? AND user_id=?').get(m.id, user.id).n;
    if (mine >= 3) throw bad('You can add up to 3 reactions to one message');
    db.prepare('INSERT INTO reactions (message_id,user_id,emoji,created_at) VALUES (?,?,?,?)').run(m.id, user.id, emoji, now());
  }
  const reactions = reactionsOf(m.id);
  toChat(m.chat_id, { type: 'message:reactions', chatId: m.chat_id, id: m.id, reactions });
  return { data: { reactions } };
});

route('DELETE', '/api/messages/:id', ({ user, params }) => {
  const m = db.prepare('SELECT * FROM messages WHERE id=?').get(intParam(params.id));
  if (!m || m.deleted) throw new HttpError(404, 'Message not found');
  const { chat, member } = requireMember(m.chat_id, user.id);
  const allowed = m.sender_id === user.id || (chat.type !== 'private' && isAdmin(member));
  if (!allowed) throw new HttpError(403, 'You cannot delete this message');
  db.prepare("UPDATE messages SET deleted=1, text='', file_id=NULL WHERE id=?").run(m.id);
  if (m.file_id) {
    db.prepare('DELETE FROM files WHERE id=?').run(m.file_id);
    fs.rm(path.join(UPLOAD_DIR, m.file_id), { force: true }, () => {});
  }
  toChat(m.chat_id, { type: 'message:delete', chatId: m.chat_id, id: m.id, by: user.id });
  return { data: { ok: true } };
});

/* ---------------------------- Uploads ------------------------------ */
route('POST', '/api/upload', async ({ req, user }) => {
  const declared = Number(req.headers['content-length'] || 0);
  if (declared > MAX_UPLOAD) throw new HttpError(413, 'File is too large (max 25 MB)');
  let name = 'file';
  try { name = decodeURIComponent(String(req.headers['x-filename'] || 'file')); } catch { /* keep default */ }
  name = path.basename(name).replace(/[^\w.\- ()Ѐ-ӿ]/g, '_').slice(0, 120) || 'file';
  const mime = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0].slice(0, 100);
  const buf = await readBody(req, MAX_UPLOAD);
  if (!buf.length) throw bad('Empty file');
  const id = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(path.join(UPLOAD_DIR, id), buf);
  db.prepare('INSERT INTO files (id,name,mime,size,uploader_id,created_at) VALUES (?,?,?,?,?,?)')
    .run(id, name, mime, buf.length, user.id, now());
  return { status: 201, data: fileView({ id, name, mime, size: buf.length }) };
});

/* ---------------------------- MSG & marketplace ------------------- */
route('POST', '/api/wallet/exchange', ({ user, body }) => {
  const amount = Number(body.stars);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000000) throw bad('Exchange amount must be 1 to 1,000,000 Stars');
  return { data: tx(() => {
    const fresh = getUser(user.id);
    if (fresh.stars < amount) throw new HttpError(402, 'Not enough Stars');
    spend(user.id, amount);
    db.prepare('UPDATE users SET msg_balance=msg_balance+? WHERE id=?').run(amount, user.id);
    return selfView(getUser(user.id));
  }) };
});

route('GET', '/api/market', ({ user, url }) => {
  const mine = url.searchParams.get('mine') === '1';
  const rows = db.prepare(`
    SELECT l.*, u.username, u.display_name
    FROM market_listings l JOIN users u ON u.id=l.seller_id
    WHERE l.status='active' ${mine ? 'AND l.seller_id=?' : ''}
    ORDER BY l.created_at DESC LIMIT 100
  `).all(...(mine ? [user.id] : []));
  return { data: rows.map((l) => ({ id: l.id, gift: giftView(l.gift_id), price: l.price, createdAt: l.created_at, seller: { id: l.seller_id, username: l.username, displayName: l.display_name }, own: l.seller_id === user.id })) };
});

route('POST', '/api/market/list', ({ user, body }) => {
  const giftId = intParam(body.giftId, 'giftId');
  const price = Number(body.price);
  if (!Number.isSafeInteger(price) || price < 1 || price > 10000000) throw bad('Price must be 1 to 10,000,000 MSG');
  const listingId = tx(() => {
    const gift = db.prepare('SELECT * FROM gifts WHERE id=? AND owner_id=? AND sold_at IS NULL').get(giftId, user.id);
    if (!gift || gift.hidden) throw new HttpError(404, 'Gift not found or hidden');
    const active = db.prepare("SELECT id FROM market_listings WHERE gift_id=? AND status='active'").get(giftId);
    if (active) throw new HttpError(409, 'This gift is already listed');
    db.prepare(`INSERT INTO market_listings (gift_id,seller_id,price,created_at,status,buyer_id,closed_at)
      VALUES (?,?,?,?,'active',NULL,NULL)
      ON CONFLICT(gift_id) DO UPDATE SET seller_id=excluded.seller_id,price=excluded.price,created_at=excluded.created_at,status='active',buyer_id=NULL,closed_at=NULL`)
      .run(giftId, user.id, price, now());
    return db.prepare('SELECT id FROM market_listings WHERE gift_id=?').get(giftId).id;
  });
  return { status: 201, data: { id: listingId, msg: getUser(user.id).msg_balance } };
});

route('DELETE', '/api/market/list/:id', ({ user, params }) => {
  const id = intParam(params.id);
  const changed = db.prepare("UPDATE market_listings SET status='cancelled',closed_at=? WHERE id=? AND seller_id=? AND status='active'").run(now(), id, user.id).changes;
  if (!changed) throw new HttpError(404, 'Active listing not found');
  return { data: { ok: true } };
});

route('POST', '/api/market/buy/:id', ({ user, params }) => {
  const id = intParam(params.id);
  const result = tx(() => {
    const listing = db.prepare("SELECT * FROM market_listings WHERE id=? AND status='active'").get(id);
    if (!listing) throw new HttpError(404, 'Listing is no longer available');
    if (listing.seller_id === user.id) throw bad('You cannot buy your own gift');
    const gift = db.prepare('SELECT * FROM gifts WHERE id=? AND owner_id=? AND sold_at IS NULL').get(listing.gift_id, listing.seller_id);
    if (!gift || gift.hidden) throw new HttpError(409, 'This gift is no longer available');
    const buyer = getUser(user.id);
    if (buyer.msg_balance < listing.price) throw new HttpError(402, 'Not enough MSG');
    const claimed = db.prepare("UPDATE market_listings SET status='sold',buyer_id=?,closed_at=? WHERE id=? AND status='active'").run(user.id, now(), id).changes;
    if (!claimed) throw new HttpError(409, 'Someone just bought this gift');
    spendMsgBalance(user.id, listing.price);
    db.prepare('UPDATE users SET msg_balance=msg_balance+? WHERE id=?').run(listing.price, listing.seller_id);
    db.prepare('UPDATE gifts SET owner_id=?,favorite=0,hidden=0 WHERE id=?').run(user.id, gift.id);
    db.prepare("INSERT INTO gift_events (gift_id,kind,from_id,to_id,created_at) VALUES (?,'transferred',?,?,?)").run(gift.id, listing.seller_id, user.id, now());
    db.prepare('INSERT INTO market_sales (listing_id,gift_id,seller_id,buyer_id,price,created_at) VALUES (?,?,?,?,?,?)').run(id, gift.id, listing.seller_id, user.id, listing.price, now());
    return { msg: getUser(user.id).msg_balance, stars: getUser(user.id).stars, sellerId: listing.seller_id, giftId: gift.id };
  });
  sendTo(result.sellerId, { type: 'wallet:refresh' });
  return { data: { msg: result.msg, stars: result.stars, gift: giftView(result.giftId) } };
});

route('GET', '/api/market/history', ({ user }) => {
  const rows = db.prepare(`
    SELECT s.*, b.username AS buyer, v.username AS seller
    FROM market_sales s JOIN users b ON b.id=s.buyer_id JOIN users v ON v.id=s.seller_id
    WHERE s.buyer_id=? OR s.seller_id=? ORDER BY s.created_at DESC LIMIT 100
  `).all(user.id, user.id);
  return { data: rows.map((r) => ({ id: r.id, gift: giftView(r.gift_id), price: r.price, createdAt: r.created_at, buyer: r.buyer, seller: r.seller, side: r.buyer_id === user.id ? 'bought' : 'sold' })) };
});

/* ---------------------------- Stars & gifts ------------------------ */
route('POST', '/api/stars/daily', ({ user }) => {
  const fresh = getUser(user.id);
  const next = fresh.last_daily + 24 * 3600 * 1000;
  if (now() < next) throw new HttpError(429, `Daily bonus already claimed. Next at ${new Date(next).toISOString()}`);
  db.prepare('UPDATE users SET stars=stars+?, last_daily=? WHERE id=?').run(dailyBonus() * (isPremium(fresh) ? PREMIUM.dailyMultiplier : 1), now(), user.id);
  return { data: selfView(getUser(user.id)) };
});

route('GET', '/api/gifts/catalog', ({ user }) => {
  const me = getUser(user.id);
  const rows = db.prepare('SELECT * FROM gift_types ORDER BY price, id').all();
  return {
    data: rows.map((t) => ({
      id: t.id, slug: t.slug, name: t.name, emoji: t.emoji, color: t.color, price: t.price, yourPrice: giftPriceFor(me, t.price),
      limited: t.supply != null, supply: t.supply, left: t.supply != null ? t.supply - t.sold : null, rarity: tierOf(t), model3d: MODEL3D.has(t.slug),
      upgradePrice: t.upgrade_price,
      models: t.upgrade_price != null ? modelList(t.slug) : [],
    })),
  };
});

route('GET', '/api/users/:id/gifts', ({ user, params }) => {
  const id = intParam(params.id);
  const ids = db.prepare('SELECT id FROM gifts WHERE owner_id=? AND sold_at IS NULL AND (hidden=0 OR ?=1) ORDER BY id DESC').all(id, id === user.id ? 1 : 0).map((r) => r.id);
  return { data: ids.map(giftView) };
});

route('PATCH', '/api/gifts/:id/collection', ({ user, params, body }) => {
  const gid = intParam(params.id);
  const gift = db.prepare('SELECT * FROM gifts WHERE id=? AND owner_id=? AND sold_at IS NULL').get(gid, user.id);
  if (!gift) throw new HttpError(404, 'Gift not found');
  const favorite = body.favorite == null ? gift.favorite : (body.favorite ? 1 : 0);
  const hidden = body.hidden == null ? gift.hidden : (body.hidden ? 1 : 0);
  db.prepare('UPDATE gifts SET favorite=?, hidden=? WHERE id=?').run(favorite, hidden, gid);
  return { data: giftView(gid) };
});

route('POST', '/api/gifts/:id/sell', ({ user, params }) => {
  const gid = intParam(params.id);
  const soldPrice = tx(() => {
    const g = db.prepare('SELECT g.*, t.price FROM gifts g JOIN gift_types t ON t.id=g.type_id WHERE g.id=? AND g.owner_id=? AND g.sold_at IS NULL').get(gid, user.id);
    if (!g) throw new HttpError(404, 'Gift not found');
    const price = Math.max(1, Math.floor(g.price * (g.upgraded ? 0.8 : 0.5)));
    db.prepare('UPDATE gifts SET sold_at=?, sold_price=?, favorite=0, hidden=0 WHERE id=?').run(now(), price, gid);
    db.prepare('UPDATE users SET stars=stars+? WHERE id=?').run(price, user.id);
    return price;
  });
  return { data: { soldPrice, stars: getUser(user.id).stars } };
});

route('POST', '/api/gifts/send', ({ user, body }) => {
  const chatId = intParam(body.chatId, 'chatId');
  const typeId = intParam(body.typeId, 'typeId');
  const text = str(body.text, 200, 'Note');
  const { chat } = requireMember(chatId, user.id);
  if (chat.type !== 'private') throw bad('Gifts can only be sent in private chats');
  const peer = db.prepare('SELECT * FROM members WHERE chat_id=? AND user_id!=?').get(chat.id, user.id);

  const row = tx(() => {
    const t = db.prepare('SELECT * FROM gift_types WHERE id=?').get(typeId);
    if (!t) throw new HttpError(404, 'Gift not found');
    if (t.supply != null && t.sold >= t.supply) throw new HttpError(409, 'This gift is sold out');
    const me = getUser(user.id);
    const cost = giftPriceFor(me, t.price);
    if (me.stars < cost) throw new HttpError(402, 'Not enough Stars');
    spend(user.id, cost);
    db.prepare('UPDATE gift_types SET sold=sold+1 WHERE id=?').run(t.id);
    const serial = t.supply != null ? t.sold + 1 : null;
    const g = db.prepare('INSERT INTO gifts (type_id,owner_id,sender_id,serial,created_at) VALUES (?,?,?,?,?)')
      .run(t.id, peer.user_id, user.id, serial, now());
    const giftId = Number(g.lastInsertRowid);
    const m = insertMessage({ chatId: chat.id, senderId: user.id, kind: 'gift', text, giftId });
    db.prepare('UPDATE gifts SET message_id=? WHERE id=?').run(m.id, giftId);
    db.prepare("INSERT INTO gift_events (gift_id,kind,from_id,to_id,created_at) VALUES (?,?,?,?,?)").run(giftId, 'sent', user.id, peer.user_id, now());
    return m;
  });
  const view = publishMessage(row);
  return { status: 201, data: { message: view, stars: getUser(user.id).stars } };
});

// Buy a gift for yourself: no chat or message, the gift goes straight into your own collection.
route('POST', '/api/gifts/self', ({ user, body }) => {
  const typeId = intParam(body.typeId, 'typeId');
  const giftId = tx(() => {
    const t = db.prepare('SELECT * FROM gift_types WHERE id=?').get(typeId);
    if (!t) throw new HttpError(404, 'Gift not found');
    if (t.supply != null && t.sold >= t.supply) throw new HttpError(409, 'This gift is sold out');
    const cost = giftPriceFor(getUser(user.id), t.price);
    if (getUser(user.id).stars < cost) throw new HttpError(402, 'Not enough Stars');
    spend(user.id, cost);
    db.prepare('UPDATE gift_types SET sold=sold+1 WHERE id=?').run(t.id);
    const serial = t.supply != null ? t.sold + 1 : null;
    const g = db.prepare('INSERT INTO gifts (type_id,owner_id,sender_id,serial,created_at) VALUES (?,?,?,?,?)')
      .run(t.id, user.id, user.id, serial, now());
    const id = Number(g.lastInsertRowid);
    db.prepare("INSERT INTO gift_events (gift_id,kind,from_id,to_id,created_at) VALUES (?,?,?,?,?)").run(id, 'sent', user.id, user.id, now());
    return id;
  });
  return { status: 201, data: { gift: giftView(giftId), stars: getUser(user.id).stars } };
});

function rollUniqueGiftAttributes(slug, tier) {
  const rows = db.prepare('SELECT attrs FROM gifts WHERE upgraded=1 AND attrs IS NOT NULL').all();
  const used = new Set();
  for (const row of rows) {
    try {
      const a = JSON.parse(row.attrs);
      used.add([a.model?.emoji, a.model?.name, a.backdrop?.name, a.pattern?.name, a.finish?.name].join('|'));
    } catch {}
  }
  // Each collectible gets a distinct visual combination across the whole app.
  // The combination includes object/model, background, pattern and finish.
  for (let attempt = 0; attempt < 200; attempt++) {
    const attrs = rollAttributes(slug, tier);
    const key = [attrs.model?.emoji, attrs.model?.name, attrs.backdrop?.name, attrs.pattern?.name, attrs.finish?.name].join('|');
    if (!used.has(key)) return attrs;
  }
  throw new HttpError(409, 'Could not create a unique collectible. Please try again.');
}

function refreshGiftMessage(gift) {
  if (!gift.message_id) return;
  const m = db.prepare('SELECT * FROM messages WHERE id=?').get(gift.message_id);
  if (m && !m.deleted) toChat(m.chat_id, { type: 'message:update', message: messageView(m) });
}

route('POST', '/api/gifts/:id/upgrade', ({ user, params }) => {
  const gid = intParam(params.id);
  const gift = tx(() => {
    const g = db.prepare('SELECT * FROM gifts WHERE id=?').get(gid);
    if (!g || g.owner_id !== user.id) throw new HttpError(404, 'Gift not found');
    if (g.upgraded) throw bad('Already upgraded');
    const t = db.prepare('SELECT * FROM gift_types WHERE id=?').get(g.type_id);
    if (t.upgrade_price == null) throw bad('This gift cannot be upgraded');
    if (getUser(user.id).stars < t.upgrade_price) throw new HttpError(402, 'Not enough Stars');
    spend(user.id, t.upgrade_price);
    const no = db.prepare('SELECT COUNT(*) AS n FROM gifts WHERE type_id=? AND upgraded=1').get(t.id).n + 1;
    db.prepare('UPDATE gifts SET upgraded=1, collectible_no=?, attrs=?, token=? WHERE id=?')
      .run(no, JSON.stringify(rollUniqueGiftAttributes(t.slug, tierOf(t))), crypto.randomBytes(8).toString('hex'), g.id);
    db.prepare("INSERT INTO gift_events (gift_id,kind,from_id,to_id,created_at) VALUES (?,?,?,?,?)").run(g.id, 'upgraded', user.id, user.id, now());
    return db.prepare('SELECT * FROM gifts WHERE id=?').get(g.id);
  });
  refreshGiftMessage(gift);
  return { data: { gift: giftView(gid), stars: getUser(user.id).stars } };
});

route('POST', '/api/gifts/:id/transfer', ({ user, params, body }) => {
  const gid = intParam(params.id);
  const target = getUser(intParam(body.userId, 'userId'));
  if (!target) throw new HttpError(404, 'User not found');
  if (target.id === user.id) throw bad('Choose another user');
  const g = db.prepare('SELECT * FROM gifts WHERE id=?').get(gid);
  if (!g || g.owner_id !== user.id) throw new HttpError(404, 'Gift not found');
  if (!g.upgraded) throw bad('Only upgraded gifts can be transferred');
  const msg = tx(() => {
    db.prepare('UPDATE gifts SET owner_id=? WHERE id=?').run(target.id, gid);
    db.prepare("INSERT INTO gift_events (gift_id,kind,from_id,to_id,created_at) VALUES (?,?,?,?,?)").run(gid, 'transferred', user.id, target.id, now());
    // the transfer shows up in the private chat between the two people
    const chat = ensurePrivateChat(user.id, target.id);
    return insertMessage({ chatId: chat.id, senderId: user.id, kind: 'gift', text: '', giftId: gid });
  });
  refreshGiftMessage(g);
  publishMessage(msg);
  sendTo(target.id, { type: 'gift:received', gift: giftView(gid) });
  return { data: { gift: giftView(gid) } };
});

route('GET', '/api/gifts/:id', ({ params }) => {
  const id = intParam(params.id);
  const gift = giftView(id);
  if (!gift) throw new HttpError(404, 'Gift not found');
  const history = db.prepare('SELECT * FROM gift_events WHERE gift_id=? ORDER BY id').all(id).map((e) => ({
    kind: e.kind, from: miniUser(getUser(e.from_id)), to: miniUser(getUser(e.to_id)), at: e.created_at,
  }));
  return { data: { ...gift, history } };
});

/* ------------------------------------------------------------------ */
/* AI assistant                                                        */
/* ------------------------------------------------------------------ */
const WELCOME =
  "Hi! Ask me anything. I run on a model on your own computer, so there are no message limits.\n\n" +
  'Send `/new` to start a fresh conversation. You can change how I answer in Settings > Assistant.';

function ensureAssistantChat(user) {
  if (user.is_bot || !AI_ENABLED) return null;
  const bot = ai.ensureBot();
  const st = db.prepare('SELECT * FROM ai_state WHERE user_id=?').get(user.id);
  if (st) return st.chat_id;
  const chat = ensurePrivateChat(user.id, bot.id);
  db.prepare('INSERT OR IGNORE INTO ai_state (user_id,chat_id) VALUES (?,?)').run(user.id, chat.id);
  const w = insertMessage({ chatId: chat.id, senderId: bot.id, text: WELCOME });
  db.prepare('UPDATE members SET last_read_id=?, shown_read_id=? WHERE chat_id=? AND user_id=?').run(w.id, w.id, chat.id, user.id);
  return chat.id;
}

function botSay(chatId, bot, text) {
  return publishMessage(insertMessage({ chatId, senderId: bot.id, text }));
}

function buildHistory(state, bot, upToId) {
  const rows = db.prepare(
    "SELECT * FROM messages WHERE chat_id=? AND id>? AND id<=? AND deleted=0 AND kind IN ('text','file') ORDER BY id DESC LIMIT ?"
  ).all(state.chat_id, state.reset_id, upToId, 24).reverse();
  const out = [];
  for (const m of rows) {
    let text = m.text;
    if (m.file_id) {
      const f = db.prepare('SELECT name FROM files WHERE id=?').get(m.file_id);
      text = `[attached file: ${f?.name || 'file'}] ` + text;
    }
    if (!text.trim()) continue;
    if (m.sender_id === bot.id && text === WELCOME) continue;
    out.push({ role: m.sender_id === bot.id ? 'assistant' : 'user', content: text });
  }
  return out;
}

function maybeAskAssistant(chat, user, row) {
  if (!AI_ENABLED || chat.type !== 'private' || user.is_bot) return;
  const bot = ai.ensureBot();
  const state = db.prepare('SELECT * FROM ai_state WHERE user_id=?').get(user.id);
  if (!state || state.chat_id !== chat.id) return;

  if (row.text.trim().toLowerCase() === '/new') {
    ai.running.get(chat.id)?.abort();
    db.prepare('UPDATE ai_state SET reset_id=? WHERE user_id=?').run(row.id, user.id);
    const done = botSay(chat.id, bot, 'Started a new conversation. I will not remember what we talked about before.');
    db.prepare('UPDATE ai_state SET reset_id=? WHERE user_id=?').run(done.id, user.id);
    return;
  }

  ai.running.get(chat.id)?.abort(); // a newer question replaces a running answer
  const fresh = getUser(user.id);
  const history = buildHistory(state, bot, row.id);
  let msgId = null;
  let lastSent = 0;
  let pending = null;
  let typingTimer = null;
  const sendTyping = () => sendTo(user.id, { type: 'typing', chatId: chat.id, userId: bot.id, name: bot.display_name });
  sendTyping();
  typingTimer = setInterval(sendTyping, 2500);
  let ctlRef = null;
  const push = (text) => {
    db.prepare('UPDATE messages SET text=? WHERE id=?').run(text, msgId);
    sendTo(user.id, { type: 'message:update', message: messageView(db.prepare('SELECT * FROM messages WHERE id=?').get(msgId)) });
    lastSent = Date.now();
  };
  ai.answer({
    user: fresh, history,
    hooks: {
      setAbort: (ctl) => { ctlRef = ctl; ai.running.set(chat.id, ctl); },
      onStart: () => {
        msgId = insertMessage({ chatId: chat.id, senderId: bot.id, text: '…' }).id;
        sendTo(user.id, { type: 'message:new', message: messageView(db.prepare('SELECT * FROM messages WHERE id=?').get(msgId)) });
      },
      onText: (full) => {
        if (Date.now() - lastSent > 150) { push(full); pending = null; } else pending = full;
      },
      onDone: (full, failed, superseded) => {
        clearInterval(typingTimer);
        if (ai.running.get(chat.id) === ctlRef) ai.running.delete(chat.id);
        if (superseded) return;
        if (msgId) push(full);
        else botSay(chat.id, bot, full);
      },
    },
  }).catch((e) => { clearInterval(typingTimer); console.error('assistant error', e); });
}

route('GET', '/api/ai/status', async ({ user }) => {
  if (!AI_ENABLED) throw new HttpError(404, 'The assistant is turned off on this server');
  const chatId = ensureAssistantChat(user);
  const st = await ai.status(user.ai_model);
  return { data: { ...st, chatId, botId: ai.ensureBot().id } };
});

route('POST', '/api/ai/clear', ({ user }) => {
  if (!AI_ENABLED) throw new HttpError(404, 'The assistant is turned off on this server');
  const chatId = ensureAssistantChat(user);
  ai.running.get(chatId)?.abort();
  const bot = ai.ensureBot();
  const files = db.prepare('SELECT file_id FROM messages WHERE chat_id=? AND file_id IS NOT NULL').all(chatId);
  tx(() => {
    db.prepare('DELETE FROM messages WHERE chat_id=?').run(chatId);
    db.prepare('UPDATE ai_state SET reset_id=0 WHERE user_id=?').run(user.id);
    db.prepare('UPDATE messages SET reply_to=NULL WHERE chat_id=?').run(chatId);
  });
  for (const f of files) dropFile(f.file_id);
  const w = insertMessage({ chatId, senderId: bot.id, text: WELCOME });
  db.prepare('UPDATE members SET last_read_id=?, shown_read_id=? WHERE chat_id=? AND user_id=?').run(w.id, w.id, chatId, user.id);
  sendTo(user.id, { type: 'chat:refresh', chatId });
  return { data: { ok: true, chatId } };
});

/* ------------------------------------------------------------------ */
/* Admin panel                                                         */
/* ------------------------------------------------------------------ */
function requireAdmin(user) { if (!user.is_admin) throw new HttpError(403, 'Administrators only'); }
const logAdmin = (adminId, action, targetId, detail = '') =>
  db.prepare('INSERT INTO admin_log (admin_id,action,target_id,detail,created_at) VALUES (?,?,?,?,?)').run(adminId, action, targetId ?? null, detail, now());
const count = (sql, ...a) => db.prepare(sql).get(...a).n;

route('GET', '/api/admin/market', ({ user }) => {
  requireAdmin(user);
  const active = db.prepare(`SELECT l.*,u.username FROM market_listings l JOIN users u ON u.id=l.seller_id WHERE l.status='active' ORDER BY l.created_at DESC LIMIT 200`).all();
  return { data: {
    active: active.map((l) => ({ id:l.id, gift:giftView(l.gift_id), seller:l.username, price:l.price, createdAt:l.created_at })),
    msgSupply: count('SELECT COALESCE(SUM(msg_balance),0) AS n FROM users'),
    sales: count('SELECT COUNT(*) AS n FROM market_sales'),
    volume: count('SELECT COALESCE(SUM(price),0) AS n FROM market_sales'),
    rate: Number(getSetting('msg_exchange_rate','1')) || 1
  } };
});
route('POST', '/api/admin/market/grant-msg', ({ user, body }) => {
  requireAdmin(user);
  const userId = intParam(body.userId, 'userId');
  const amount = Number(body.amount);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10000000) throw bad('MSG amount must be 1 to 10,000,000');
  if (!getUser(userId)) throw new HttpError(404, 'User not found');
  db.prepare('UPDATE users SET msg_balance=msg_balance+? WHERE id=?').run(amount,userId);
  logAdmin(user.id,'grant_msg',userId,'+'+amount+' MSG');
  sendTo(userId,{type:'wallet:refresh'});
  return { data:{msg:getUser(userId).msg_balance} };
});
route('DELETE', '/api/admin/market/listings/:id', ({ user, params }) => {
  requireAdmin(user);
  const id=intParam(params.id);
  const changed=db.prepare("UPDATE market_listings SET status='removed',closed_at=? WHERE id=? AND status='active'").run(now(),id).changes;
  if(!changed) throw new HttpError(404,'Active listing not found');
  logAdmin(user.id,'market_remove',id,'Removed marketplace listing');
  return { data:{ok:true} };
});

route('GET', '/api/admin/stats', async ({ user }) => {
  requireAdmin(user);
  const day = now() - 24 * 3600 * 1000;
  const files = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(size),0) AS bytes FROM files').get();
  const perDay = [];
  for (let i = 6; i >= 0; i--) {
    const from = new Date(); from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - i);
    const a = from.getTime(), b = a + 86400000;
    perDay.push({ day: from.toISOString().slice(5, 10), messages: count("SELECT COUNT(*) AS n FROM messages WHERE created_at>=? AND created_at<? AND kind!='system'", a, b), signups: count('SELECT COUNT(*) AS n FROM users WHERE is_bot=0 AND created_at>=? AND created_at<?', a, b) });
  }
  return { data: {
    users: count('SELECT COUNT(*) AS n FROM users WHERE is_bot=0'),
    online: [...sockets.keys()].filter((id) => !getUser(id)?.is_bot).length,
    banned: count('SELECT COUNT(*) AS n FROM users WHERE banned=1'),
    admins: count('SELECT COUNT(*) AS n FROM users WHERE is_admin=1'),
    newToday: count('SELECT COUNT(*) AS n FROM users WHERE is_bot=0 AND created_at>=?', day),
    chats: { private: count("SELECT COUNT(*) AS n FROM chats WHERE type='private'"), group: count("SELECT COUNT(*) AS n FROM chats WHERE type='group'"), channel: count("SELECT COUNT(*) AS n FROM chats WHERE type='channel'") },
    messages: count("SELECT COUNT(*) AS n FROM messages WHERE kind!='system'"),
    messagesToday: count("SELECT COUNT(*) AS n FROM messages WHERE kind!='system' AND created_at>=?", day),
    reactions: count('SELECT COUNT(*) AS n FROM reactions'),
    gifts: count('SELECT COUNT(*) AS n FROM gifts'), collectibles: count('SELECT COUNT(*) AS n FROM gifts WHERE upgraded=1'),
    stars: count('SELECT COALESCE(SUM(stars),0) AS n FROM users WHERE is_bot=0'),
    files: files.n, storageBytes: files.bytes, perDay,
    topSenders: db.prepare("SELECT u.id, u.username, u.display_name AS name, COUNT(*) AS n FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.kind!='system' AND u.is_bot=0 GROUP BY u.id ORDER BY n DESC LIMIT 5").all(),
    topGifts: db.prepare('SELECT t.name, t.emoji, COUNT(*) AS n FROM gifts g JOIN gift_types t ON t.id=g.type_id GROUP BY t.id ORDER BY n DESC LIMIT 5').all(),
    tiers: Object.entries(db.prepare('SELECT t.supply, t.price FROM gifts g JOIN gift_types t ON t.id=g.type_id').all().reduce((a, r) => { const k = tierOf(r); a[k] = (a[k] || 0) + 1; return a; }, {})).map(([tier, n]) => ({ tier, n })),
    openReports: count("SELECT COUNT(*) AS n FROM reports WHERE status='open'"),
    premiumUsers: count(`SELECT COUNT(*) AS n FROM users WHERE is_bot=0 AND premium_until>${Date.now()}`),
    maintenance: getSetting('maintenance', '0') === '1',
    ai: await ai.status(),
    uptimeSec: Math.round(process.uptime()),
  } };
});

route('GET', '/api/admin/users', ({ user, url }) => {
  requireAdmin(user);
  const raw = (url.searchParams.get('q') || '').trim().replace(/^@/, '').slice(0, 50);
  const like = '%' + raw.replace(/[\\%_]/g, (m) => '\\' + m) + '%';
  const rows = db.prepare(
    `SELECT u.*, (SELECT COUNT(*) FROM messages m WHERE m.sender_id=u.id) AS msgs FROM users u
     WHERE u.is_bot=0 AND (? = '' OR u.username LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\')
     ORDER BY u.id DESC LIMIT ${url.searchParams.get('all') ? 5000 : 100}`).all(raw, like, like);
  return { data: rows.map((u) => ({
    id: u.id, username: u.username, displayName: u.display_name, avatar: avatarUrl(u), color: u.color, stars: u.stars,
    createdAt: u.created_at, lastSeen: u.last_seen, online: isOnline(u.id), banned: !!u.banned, isAdmin: !!u.is_admin, messages: u.msgs,
    spent: u.stars_spent, level: levelOf(u.stars_spent).n, premium: isPremium(u), premiumUntil: u.premium_until,
  })) };
});

route('PATCH', '/api/admin/users/:id', ({ user, params, body }) => {
  requireAdmin(user);
  const target = getUser(intParam(params.id));
  if (!target || target.is_bot) throw new HttpError(404, 'User not found');
  const self = target.id === user.id;
  if ('banned' in body) {
    if (self) throw bad('You cannot suspend yourself');
    if (target.is_admin) throw bad('Remove admin rights first');
    const b = body.banned ? 1 : 0;
    db.prepare('UPDATE users SET banned=? WHERE id=?').run(b, target.id);
    if (b) {
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);
      for (const ws of sockets.get(target.id) || []) ws.close(4001, 'suspended');
    }
    logAdmin(user.id, b ? 'ban' : 'unban', target.id, target.username);
  }
  if ('isAdmin' in body) {
    if (self) throw bad('You cannot change your own admin rights');
    db.prepare('UPDATE users SET is_admin=? WHERE id=?').run(body.isAdmin ? 1 : 0, target.id);
    logAdmin(user.id, body.isAdmin ? 'make_admin' : 'remove_admin', target.id, target.username);
  }
  if ('stars' in body) {
    const n = Number(body.stars);
    if (!Number.isInteger(n) || n < 0 || n > 10_000_000) throw bad('Stars must be a whole number from 0 to 10,000,000');
    db.prepare('UPDATE users SET stars=? WHERE id=?').run(n, target.id);
    logAdmin(user.id, 'set_stars', target.id, `${target.username}: ${target.stars} -> ${n}`);
    sendTo(target.id, { type: 'stars', stars: n });
  }
  if ('premiumDays' in body) {
    const d = Number(body.premiumDays);
    if (!Number.isInteger(d) || d < 0 || d > 3650) throw bad('Premium days must be a whole number from 0 to 3650 (0 = revoke)');
    const until = d === 0 ? 0 : Math.max(Date.now(), target.premium_until) + d * 86400000;
    db.prepare('UPDATE users SET premium_until=? WHERE id=?').run(until, target.id);
    logAdmin(user.id, d === 0 ? 'premium_revoke' : 'premium_grant', target.id, d === 0 ? target.username : `${target.username}: +${d}d`);
    broadcastAll({ type: 'user:update', user: userView(getUser(target.id)) });
    sendTo(target.id, { type: 'stars', stars: getUser(target.id).stars });
  }
  const u = getUser(target.id);
  return { data: { id: u.id, banned: !!u.banned, isAdmin: !!u.is_admin, stars: u.stars, premiumUntil: u.premium_until } };
});

route('POST', '/api/admin/announce', ({ user, body }) => {
  requireAdmin(user);
  const text = str(body.text, 300, 'Announcement');
  if (!text) throw bad('Announcement is empty');
  broadcastAll({ type: 'announce', text, at: now() });
  logAdmin(user.id, 'announce', null, text);
  return { data: { ok: true, delivered: [...sockets.keys()].length } };
});

route('GET', '/api/admin/settings', ({ user }) => {
  requireAdmin(user);
  return { data: { regMode: getSetting('reg_mode', 'open'), maintenance: getSetting('maintenance', '0') === '1', maintenanceText: getSetting('maintenance_text', 'Back soon.'), dailyBonus: dailyBonus(), startStars: startStars(), premiumPrice: premiumPrice(), invites: db.prepare('SELECT * FROM invites ORDER BY created_at DESC LIMIT 50').all().map((i) => ({ code: i.code, usesLeft: i.uses_left, used: i.used, createdAt: i.created_at })) } };
});

route('PUT', '/api/admin/settings', ({ user, body }) => {
  requireAdmin(user);
  if (body.regMode !== undefined) {
    if (!REG_MODES.includes(body.regMode)) throw bad('Invalid registration mode');
    setSetting('reg_mode', body.regMode);
    logAdmin(user.id, 'registration', null, body.regMode);
  }
  if (body.maintenance !== undefined) {
    setSetting('maintenance', body.maintenance ? '1' : '0');
    if (typeof body.maintenanceText === 'string') setSetting('maintenance_text', body.maintenanceText.trim().slice(0, 200) || 'Back soon.');
    logAdmin(user.id, body.maintenance ? 'maintenance_on' : 'maintenance_off', null, getSetting('maintenance_text', ''));
    if (body.maintenance) broadcastAll({ type: 'announce', text: '🛠 Maintenance: ' + getSetting('maintenance_text', 'Back soon.'), at: now() });
  }
  for (const [key, col, lo, hi] of [['dailyBonus', 'daily_bonus', 1, 10000], ['startStars', 'start_stars', 0, 100000], ['premiumPrice', 'premium_price', 1, 100000]]) {
    if (body[key] === undefined) continue;
    const n = Number(body[key]);
    if (!Number.isInteger(n) || n < lo || n > hi) throw bad(`${key} must be a whole number from ${lo} to ${hi}`);
    setSetting(col, n);
    logAdmin(user.id, 'setting', null, `${col}=${n}`);
  }
  return { data: { ok: true } };
});

route('POST', '/api/admin/invites', ({ user, body }) => {
  requireAdmin(user);
  const uses = Number(body.uses ?? 1);
  if (!Number.isInteger(uses) || uses < 1 || uses > 1000) throw bad('Uses must be 1 to 1000');
  const code = crypto.randomBytes(5).toString('hex').toUpperCase();
  db.prepare('INSERT INTO invites (code,created_by,uses_left,created_at) VALUES (?,?,?,?)').run(code, user.id, uses, now());
  logAdmin(user.id, 'invite', null, `${code} x${uses}`);
  return { status: 201, data: { code, usesLeft: uses, used: 0, createdAt: now() } };
});

route('DELETE', '/api/admin/invites/:code', ({ user, params }) => {
  requireAdmin(user);
  db.prepare('DELETE FROM invites WHERE code=?').run(String(params.code).toUpperCase());
  return { data: { ok: true } };
});

route('POST', '/api/admin/users/:id/reset-password', ({ user, params }) => {
  requireAdmin(user);
  const t = getUser(intParam(params.id));
  if (!t || t.is_bot) throw new HttpError(404, 'User not found');
  if (t.is_admin && t.id !== user.id) throw bad('Remove admin rights first');
  const temp = crypto.randomBytes(6).toString('base64url');
  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare('UPDATE users SET pass_hash=?, salt=? WHERE id=?').run(hashPassword(temp, salt), salt, t.id);
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(t.id);
  for (const ws of sockets.get(t.id) || []) ws.close(4003, 'password reset');
  logAdmin(user.id, 'reset_password', t.id, t.username);
  return { data: { password: temp } };
});

// "Delete" keeps the database consistent: the account is anonymised, signed out and locked, its messages are removed.
route('DELETE', '/api/admin/users/:id', ({ user, params }) => {
  requireAdmin(user);
  const t = getUser(intParam(params.id));
  if (!t || t.is_bot) throw new HttpError(404, 'User not found');
  if (t.id === user.id || t.is_admin) throw bad('Remove admin rights first (you cannot delete yourself)');
  const files = db.prepare('SELECT file_id FROM messages WHERE sender_id=? AND file_id IS NOT NULL').all(t.id).map((r) => r.file_id);
  const chats = db.prepare('SELECT chat_id FROM members WHERE user_id=?').all(t.id).map((r) => r.chat_id);
  tx(() => {
    db.prepare("UPDATE messages SET deleted=1, text='', file_id=NULL WHERE sender_id=?").run(t.id);
    db.prepare('DELETE FROM reactions WHERE user_id=?').run(t.id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(t.id);
    db.prepare("DELETE FROM members WHERE user_id=? AND chat_id IN (SELECT id FROM chats WHERE type!='private')").run(t.id);
    db.prepare('DELETE FROM contacts WHERE owner_id=? OR contact_id=?').run(t.id, t.id);
    db.prepare(`UPDATE users SET username=?, display_name='Deleted account', bio='', status_emoji='', cover='', music_file=NULL, music_title='',
      avatar_file=NULL, ai_prompt='', banned=1, is_admin=0, pass_hash=?, salt=? WHERE id=?`)
      .run('deleted_' + t.id, crypto.randomBytes(64).toString('hex'), crypto.randomBytes(16).toString('hex'), t.id);
  });
  for (const f of files) dropFile(f);
  for (const f of [t.avatar_file, t.music_file]) dropFile(f);
  for (const ws of sockets.get(t.id) || []) ws.close(4003, 'deleted');
  for (const c of chats) toChat(c, { type: 'chat:refresh', chatId: c });
  logAdmin(user.id, 'delete_user', t.id, t.username);
  return { data: { ok: true } };
});

route('POST', '/api/admin/bonus', ({ user, body }) => {
  requireAdmin(user);
  const n = Number(body.stars);
  if (!Number.isInteger(n) || n < 1 || n > 100000) throw bad('Bonus must be 1 to 100,000 Stars');
  db.prepare('UPDATE users SET stars=stars+? WHERE is_bot=0 AND banned=0').run(n);
  for (const id of sockets.keys()) { const u = getUser(id); if (u && !u.is_bot) sendTo(id, { type: 'stars', stars: u.stars }); }
  const total = count('SELECT COUNT(*) AS n FROM users WHERE is_bot=0 AND banned=0');
  logAdmin(user.id, 'bonus', null, `+${n} to ${total} users`);
  return { data: { users: total } };
});

route('GET', '/api/admin/chats', ({ user }) => {
  requireAdmin(user);
  const rows = db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM members m WHERE m.chat_id=c.id) AS members,
      (SELECT COUNT(*) FROM messages x WHERE x.chat_id=c.id AND x.kind!='system') AS msgs,
      (SELECT username FROM users u WHERE u.id=c.created_by) AS owner
    FROM chats c WHERE c.type!='private' ORDER BY c.id DESC LIMIT 200`).all();
  return { data: rows.map((c) => ({ id: c.id, type: c.type, title: c.title, handle: c.handle, members: c.members, messages: c.msgs, owner: c.owner, createdAt: c.created_at })) };
});

route('DELETE', '/api/admin/chats/:id', ({ user, params }) => {
  requireAdmin(user);
  const chat = db.prepare('SELECT * FROM chats WHERE id=?').get(intParam(params.id));
  if (!chat || chat.type === 'private') throw new HttpError(404, 'Group or channel not found');
  const members = memberIds(chat.id);
  const files = db.prepare('SELECT file_id FROM messages WHERE chat_id=? AND file_id IS NOT NULL').all(chat.id).map((r) => r.file_id);
  tx(() => {
    db.prepare('UPDATE messages SET reply_to=NULL WHERE chat_id=?').run(chat.id);
    db.prepare('UPDATE gifts SET message_id=NULL WHERE message_id IN (SELECT id FROM messages WHERE chat_id=?)').run(chat.id);
    db.prepare('DELETE FROM messages WHERE chat_id=?').run(chat.id);
    db.prepare('DELETE FROM chats WHERE id=?').run(chat.id);
  });
  for (const f of files) dropFile(f);
  for (const uid of members) sendTo(uid, { type: 'chat:removed', chatId: chat.id });
  logAdmin(user.id, 'delete_chat', null, `${chat.type} "${chat.title}"`);
  return { data: { ok: true } };
});

route('GET', '/api/admin/gift-types', ({ user }) => {
  requireAdmin(user);
  return { data: db.prepare('SELECT * FROM gift_types ORDER BY price, id').all().map((t) => ({
    id: t.id, slug: t.slug, name: t.name, emoji: t.emoji, price: t.price, supply: t.supply, sold: t.sold, upgradePrice: t.upgrade_price, rarity: tierOf(t),
    owned: count('SELECT COUNT(*) AS n FROM gifts WHERE type_id=?', t.id),
  })) };
});

route('PATCH', '/api/admin/gift-types/:id', ({ user, params, body }) => {
  requireAdmin(user);
  const t = db.prepare('SELECT * FROM gift_types WHERE id=?').get(intParam(params.id));
  if (!t) throw new HttpError(404, 'Gift not found');
  const num = (v, min, max, label) => { const n = Number(v); if (!Number.isInteger(n) || n < min || n > max) throw bad(`${label} must be a whole number from ${min} to ${max}`); return n; };
  let { price, supply, upgrade_price: up } = t;
  if ('price' in body) price = num(body.price, 1, 1_000_000, 'Price');
  if ('upgradePrice' in body) up = body.upgradePrice === null ? null : num(body.upgradePrice, 1, 1_000_000, 'Upgrade price');
  if ('supply' in body && t.supply != null) supply = num(body.supply, t.sold, 10_000_000, 'Supply (not below copies already sold)');
  db.prepare('UPDATE gift_types SET price=?, supply=?, upgrade_price=? WHERE id=?').run(price, supply, up, t.id);
  logAdmin(user.id, 'edit_gift', null, `${t.name}: price ${t.price}->${price}, upgrade ${t.upgrade_price}->${up}, supply ${t.supply}->${supply}`);
  return { data: { id: t.id, price, supply, upgradePrice: up } };
});

route('POST', '/api/admin/grant-gift', ({ user, body }) => {
  requireAdmin(user);
  const target = getUser(intParam(body.userId, 'userId'));
  if (!target || target.is_bot) throw new HttpError(404, 'User not found');
  const gid = tx(() => {
    const t = db.prepare('SELECT * FROM gift_types WHERE id=?').get(intParam(body.typeId, 'typeId'));
    if (!t) throw new HttpError(404, 'Gift not found');
    if (t.supply != null && t.sold >= t.supply) throw new HttpError(409, 'This gift is sold out');
    db.prepare('UPDATE gift_types SET sold=sold+1 WHERE id=?').run(t.id);
    const g = db.prepare('INSERT INTO gifts (type_id,owner_id,sender_id,serial,created_at) VALUES (?,?,?,?,?)').run(t.id, target.id, user.id, t.supply != null ? t.sold + 1 : null, now());
    const id = Number(g.lastInsertRowid);
    db.prepare("INSERT INTO gift_events (gift_id,kind,from_id,to_id,created_at) VALUES (?,?,?,?,?)").run(id, 'sent', user.id, target.id, now());
    logAdmin(user.id, 'grant_gift', target.id, t.name);
    return id;
  });
  return { status: 201, data: { gift: giftView(gid) } };
});

route('GET', '/api/admin/log', ({ user, url }) => {
  requireAdmin(user);
  const act = (url.searchParams.get('action') || '').slice(0, 30);
  const rows = db.prepare(`SELECT l.*, a.username AS admin, t.username AS target FROM admin_log l JOIN users a ON a.id=l.admin_id LEFT JOIN users t ON t.id=l.target_id ${act ? 'WHERE l.action=?' : ''} ORDER BY l.id DESC LIMIT 100`).all(...(act ? [act] : []));
  return { data: rows.map((r) => ({ id: r.id, admin: r.admin, action: r.action, target: r.target, detail: r.detail, createdAt: r.created_at })) };
});


route('PUT', '/api/nicks/:id', ({ user, params, body }) => {
  const target = getUser(intParam(params.id));
  if (!target || target.id === user.id) throw new HttpError(404, 'User not found');
  const nick = str(body.nick, 30, 'Nickname');
  if (!nick) db.prepare('DELETE FROM nicks WHERE owner_id=? AND target_id=?').run(user.id, target.id);
  else db.prepare('INSERT INTO nicks (owner_id,target_id,nick) VALUES (?,?,?) ON CONFLICT(owner_id,target_id) DO UPDATE SET nick=excluded.nick').run(user.id, target.id, nick);
  return { data: selfView(getUser(user.id)).nicks };
});

/* Lucky wheel */
const wheelCooldown = (u) => (isPremium(u) ? R.WHEEL_COOLDOWN_PREMIUM_H : R.WHEEL_COOLDOWN_H) * 3600000;
const wheelView = (u) => ({
  segments: R.WHEEL.map(({ id, label, emoji }) => ({ id, label, emoji })),
  nextAt: u.wheel_at + wheelCooldown(u), canSpin: Date.now() >= u.wheel_at + wheelCooldown(u), spins: u.wheel_spins, cooldownHours: wheelCooldown(u) / 3600000,
});
route('GET', '/api/wheel', ({ user }) => ({ data: wheelView(getUser(user.id)) }));
route('POST', '/api/wheel/spin', ({ user }) => {
  const out = tx(() => {
    const u = getUser(user.id);
    if (Date.now() < u.wheel_at + wheelCooldown(u)) throw new HttpError(429, 'The wheel is recharging');
    const index = R.rollWheel();
    const seg = R.WHEEL[index];
    let prize = { id: seg.id, label: seg.label, emoji: seg.emoji };
    db.prepare('UPDATE users SET wheel_at=?, wheel_spins=wheel_spins+1 WHERE id=?').run(Date.now(), u.id);
    if (seg.stars) db.prepare('UPDATE users SET stars=stars+? WHERE id=?').run(seg.stars, u.id);
    else if (seg.premiumDays) db.prepare('UPDATE users SET premium_until=? WHERE id=?').run(Math.max(Date.now(), u.premium_until) + seg.premiumDays * 86400000, u.id);
    else if (seg.gift) {
      const pool = db.prepare('SELECT * FROM gift_types WHERE supply IS NULL AND price<=60').all();
      const t = pool[Math.floor(Math.random() * pool.length)];
      db.prepare('UPDATE gift_types SET sold=sold+1 WHERE id=?').run(t.id);
      const g = db.prepare('INSERT INTO gifts (type_id,owner_id,sender_id,serial,created_at) VALUES (?,?,?,?,?)').run(t.id, u.id, u.id, null, now());
      db.prepare("INSERT INTO gift_events (gift_id,kind,from_id,to_id,created_at) VALUES (?,?,?,?,?)").run(Number(g.lastInsertRowid), 'sent', u.id, u.id, now());
      prize = { ...prize, label: t.name, emoji: t.emoji, giftId: Number(g.lastInsertRowid) };
    }
    return { index, prize };
  });
  const u = getUser(user.id);
  return { data: { ...out, wheel: wheelView(u), me: selfView(u) } };
});

/* Achievements: computed from what you actually did, rewards are claimed once */
function achievementMetrics(uid) {
  const n = (sql, ...a) => Number(db.prepare(sql).get(...a).n);
  const u = getUser(uid);
  const owned = db.prepare('SELECT g.upgraded, g.attrs, t.slug FROM gifts g JOIN gift_types t ON t.id=g.type_id WHERE g.owner_id=?').all(uid);
  return {
    messages: n("SELECT COUNT(*) AS n FROM messages WHERE sender_id=? AND kind IN ('text','file') AND deleted=0", uid),
    reactions: n('SELECT COUNT(*) AS n FROM reactions WHERE user_id=?', uid),
    gifts: owned.length,
    sent: n("SELECT COUNT(*) AS n FROM gift_events WHERE kind='sent' AND from_id=? AND to_id!=?", uid, uid),
    upgraded: owned.filter((g) => g.upgraded).length,
    rareModels: owned.filter((g) => { try { return g.upgraded && JSON.parse(g.attrs).model.rarity <= 5; } catch { return false; } }).length,
    models3d: owned.filter((g) => MODEL3D.has(g.slug)).length,
    spent: u.stars_spent, level: levelOf(u.stars_spent).n, premium: u.premium_until > 0 ? 1 : 0, spins: u.wheel_spins,
  };
}
function achievementList(uid) {
  const m = achievementMetrics(uid);
  const claimed = new Set(db.prepare('SELECT ach_id FROM ach_claims WHERE user_id=?').all(uid).map((r) => r.ach_id));
  return R.ACHIEVEMENTS.map(([id, emoji, title, desc, metric, need, reward]) => ({ id, emoji, title, desc, need, reward, have: Math.min(m[metric], need), done: m[metric] >= need, claimed: claimed.has(id) }));
}
route('GET', '/api/achievements', ({ user }) => ({ data: achievementList(user.id) }));
route('POST', '/api/achievements/:id/claim', ({ user, params }) => {
  const a = achievementList(user.id).find((x) => x.id === params.id);
  if (!a) throw new HttpError(404, 'Unknown achievement');
  if (!a.done) throw bad('Not completed yet');
  if (a.claimed) throw new HttpError(409, 'Already claimed');
  tx(() => {
    db.prepare('INSERT INTO ach_claims (user_id,ach_id,created_at) VALUES (?,?,?)').run(user.id, a.id, now());
    db.prepare('UPDATE users SET stars=stars+? WHERE id=?').run(a.reward, user.id);
  });
  return { data: { list: achievementList(user.id), me: selfView(getUser(user.id)) } };
});

/* Premium subscription: bought with Stars, 30 days per purchase, stacks when renewed early */
route('GET', '/api/premium', ({ user }) => {
  const u = getUser(user.id);
  return { data: { ...PREMIUM, price: premiumPrice(), until: u.premium_until, active: isPremium(u) } };
});
route('POST', '/api/premium', ({ user }) => {
  const out = tx(() => {
    const u = getUser(user.id);
    const price = premiumPrice();
    if (u.stars < price) throw new HttpError(402, 'Not enough Stars');
    spend(user.id, price);
    const from = Math.max(Date.now(), u.premium_until);
    db.prepare('UPDATE users SET premium_until=? WHERE id=?').run(from + PREMIUM.days * 86400000, user.id);
    return getUser(user.id);
  });
  broadcastAll({ type: 'user:update', user: userView(out) });
  return { status: 201, data: selfView(out) };
});

/* Reports, forced sign-out, online list */
route('POST', '/api/messages/:id/report', ({ user, params, body }) => {
  const m = db.prepare('SELECT * FROM messages WHERE id=?').get(intParam(params.id));
  if (!m || m.deleted || m.kind === 'system') throw new HttpError(404, 'Message not found');
  requireMember(m.chat_id, user.id);
  if (m.sender_id === user.id) throw bad('You cannot report your own message');
  if (db.prepare("SELECT 1 FROM reports WHERE message_id=? AND reporter_id=? AND status='open'").get(m.id, user.id)) throw bad('You already reported this message');
  db.prepare('INSERT INTO reports (message_id,reporter_id,reason,created_at) VALUES (?,?,?,?)').run(m.id, user.id, String(body.reason || '').trim().slice(0, 300), now());
  for (const [id] of sockets) { const u = getUser(id); if (u?.is_admin) sendTo(id, { type: 'announce', text: '🚩 New report in the admin panel', at: now() }); }
  return { status: 201, data: { ok: true } };
});

route('GET', '/api/admin/reports', ({ user, url }) => {
  requireAdmin(user);
  const status = url.searchParams.get('status') === 'closed' ? 'closed' : 'open';
  const rows = db.prepare(`SELECT r.*, rp.username AS reporter, m.text, m.kind, m.deleted, m.sender_id, s.username AS sender, c.title AS chat_title, c.type AS chat_type
    FROM reports r JOIN users rp ON rp.id=r.reporter_id JOIN messages m ON m.id=r.message_id JOIN users s ON s.id=m.sender_id JOIN chats c ON c.id=m.chat_id
    WHERE r.status${status === 'open' ? "='open'" : "!='open'"} ORDER BY r.id DESC LIMIT 100`).all();
  return { data: rows.map((r) => ({ id: r.id, reporter: r.reporter, reason: r.reason, text: r.deleted ? '' : (r.text || '[' + r.kind + ']'), deleted: !!r.deleted, senderId: r.sender_id, sender: r.sender, chat: r.chat_title || r.chat_type, status: r.status, createdAt: r.created_at })) };
});

route('POST', '/api/admin/reports/:id', ({ user, params, body }) => {
  requireAdmin(user);
  const r = db.prepare('SELECT * FROM reports WHERE id=?').get(intParam(params.id));
  if (!r) throw new HttpError(404, 'Report not found');
  const act = body.action;
  if (!['dismiss', 'delete', 'ban'].includes(act)) throw bad('Unknown action');
  const m = db.prepare('SELECT * FROM messages WHERE id=?').get(r.message_id);
  if (act !== 'dismiss' && m && !m.deleted) {
    db.prepare("UPDATE messages SET deleted=1, text='', file_id=NULL WHERE id=?").run(m.id);
    if (m.file_id) { db.prepare('DELETE FROM files WHERE id=?').run(m.file_id); fs.rm(path.join(UPLOAD_DIR, m.file_id), { force: true }, () => {}); }
    toChat(m.chat_id, { type: 'message:delete', chatId: m.chat_id, id: m.id, by: user.id });
  }
  if (act === 'ban' && m) {
    const t = getUser(m.sender_id);
    if (t && !t.is_admin && !t.is_bot) {
      db.prepare('UPDATE users SET banned=1 WHERE id=?').run(t.id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(t.id);
      for (const ws of sockets.get(t.id) || []) ws.close(4001, 'suspended');
      logAdmin(user.id, 'ban', t.id, t.username + ' (report)');
    }
  }
  db.prepare("UPDATE reports SET status=?, handled_by=? WHERE message_id=? AND status='open'").run(act === 'dismiss' ? 'dismissed' : 'actioned', user.id, r.message_id);
  logAdmin(user.id, 'report_' + act, m?.sender_id, '#' + r.id);
  return { data: { ok: true } };
});

route('POST', '/api/admin/users/:id/logout', ({ user, params }) => {
  requireAdmin(user);
  const t = getUser(intParam(params.id));
  if (!t || t.is_bot) throw new HttpError(404, 'User not found');
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(t.id);
  for (const ws of sockets.get(t.id) || []) ws.close(4001, 'signed out');
  logAdmin(user.id, 'force_logout', t.id, t.username);
  return { data: { ok: true } };
});

route('POST', '/api/admin/logout-all', ({ user, token }) => {
  requireAdmin(user);
  const n = db.prepare('DELETE FROM sessions WHERE token!=?').run(token).changes;
  for (const [id, set] of sockets) if (id !== user.id) for (const ws of set) ws.close(4001, 'signed out');
  logAdmin(user.id, 'logout_all', null, `${n} sessions`);
  return { data: { sessions: Number(n) } };
});

route('GET', '/api/admin/online', ({ user }) => {
  requireAdmin(user);
  return { data: [...sockets.keys()].map(getUser).filter((u) => u && !u.is_bot).map((u) => ({ id: u.id, username: u.username, name: u.display_name, color: u.color, ghost: !!u.ghost })) };
});

/* ------------------------------------------------------------------ */
/* Static + file serving                                               */
/* ------------------------------------------------------------------ */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
};
const INLINE_MIME = /^(image\/(png|jpeg|gif|webp)|audio\/[\w.+-]+|video\/[\w.+-]+)$/;
const CSP = "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; frame-ancestors 'none'";

function serveUpload(req, res, id) {
  const f = /^[a-f0-9]{32}$/.test(id) && db.prepare('SELECT * FROM files WHERE id=?').get(id);
  if (!f) { res.writeHead(404); return res.end('Not found'); }
  const file = path.join(UPLOAD_DIR, f.id);
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
  const inline = INLINE_MIME.test(f.mime);
  const headers = {
    'content-type': inline ? f.mime : 'application/octet-stream',
    'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
    'cache-control': 'private, max-age=86400',
    'accept-ranges': 'bytes',
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : f.size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : f.size - 1;
    start = Math.max(0, start); end = Math.min(f.size - 1, end);
    if (start > end) { res.writeHead(416, { 'content-range': `bytes */${f.size}` }); return res.end(); }
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${f.size}`, 'content-length': end - start + 1 });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, 'content-length': f.size });
  fs.createReadStream(file).pipe(res);
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || !path.extname(rel)) rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); return res.end('Not found');
  }
  res.writeHead(200, {
    'content-type': MIME[path.extname(file)] || 'application/octet-stream',
    'content-security-policy': CSP,
    'x-content-type-options': 'nosniff',
    'cache-control': 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
}

/* ------------------------------------------------------------------ */
/* HTTP server                                                         */
/* ------------------------------------------------------------------ */
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/files/')) return serveUpload(req, res, url.pathname.slice(7));
    if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);

    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = r.re.exec(url.pathname);
      if (!m) continue;
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      const token = (req.headers.authorization || '').replace(/^Bearer /, '');
      let user = null;
      if (r.auth) {
        user = userFromToken(token);
        if (!user) throw new HttpError(401, 'Not signed in');
        if (!user.is_admin && getSetting('maintenance', '0') === '1' && url.pathname !== '/api/logout') throw new HttpError(503, 'Maintenance: ' + getSetting('maintenance_text', 'Back soon.'));
      }
      const isUpload = url.pathname === '/api/upload';
      const body = req.method === 'GET' || req.method === 'DELETE' || isUpload ? {} : await readJson(req);
      const out = await r.handler({ req, res, user, token, params, body, url });
      return json(res, out.status || 200, out.data);
    }
    throw new HttpError(404, 'Not found');
  } catch (e) {
    if (e instanceof HttpError) return json(res, e.code, { error: e.message });
    console.error(e);
    json(res, 500, { error: 'Internal error' });
  }
});

/* ------------------------------------------------------------------ */
/* WebSocket                                                           */
/* ------------------------------------------------------------------ */
const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url, 'http://localhost').pathname !== '/ws') return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (ws) => {
  let userId = null;
  const authTimer = setTimeout(() => { if (!userId) ws.close(4001, 'auth timeout'); }, 5000);
  let alive = true;
  ws.on('pong', () => { alive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!userId) {
      if (msg.type !== 'auth') return;
      const u = userFromToken(msg.token);
      if (!u) return ws.close(4003, 'unauthorized');
      userId = u.id;
      clearTimeout(authTimer);
      const first = !isOnline(userId);
      if (!sockets.has(userId)) sockets.set(userId, new Set());
      sockets.get(userId).add(ws);
      const onlineIds = [...sockets.keys()].filter((id) => isOnline(id) && !seenHidden(getUser(id)));
      ws.send(JSON.stringify({ type: 'ready', online: onlineIds }));
      if (first && !seenHidden(u)) broadcastAll({ type: 'presence', userId, online: true });
      return;
    }
    if (msg.type === 'typing') {
      const chatId = Number(msg.chatId);
      const u = getUser(userId);
      if (Number.isInteger(chatId) && getMember(chatId, userId) && !u.ghost) {
        toChat(chatId, { type: 'typing', chatId, userId, name: u.display_name }, userId);
      }
    }
  });

  ws.on('close', () => {
    clearTimeout(authTimer);
    if (!userId) return;
    const set = sockets.get(userId);
    set?.delete(ws);
    if (!set || set.size === 0) {
      sockets.delete(userId);
      const t = now();
      db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(t, userId);
      if (!seenHidden(getUser(userId))) broadcastAll({ type: 'presence', userId, online: false, lastSeen: t });
    }
  });

  ws._alive = () => alive;
  ws._ping = () => { alive = false; try { ws.ping(); } catch { /* closed */ } };
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (ws._alive && !ws._alive()) { ws.terminate(); continue; }
    ws._ping?.();
  }
}, 30000).unref();

// Drop expired sessions (30 days) and old rate-limit entries once an hour.
setInterval(() => {
  for (const [ip, a] of attempts) if (a.reset < now()) attempts.delete(ip);
  db.prepare('DELETE FROM sessions WHERE created_at<?').run(now() - 30 * 24 * 3600 * 1000);
}, 3600 * 1000).unref();

if (require.main === module) {
  server.listen(PORT, HOST, () => console.log(`Messenger running on http://localhost:${PORT}  (data: ${DATA_DIR})`));
}
module.exports = { server };
