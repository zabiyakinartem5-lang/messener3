'use strict';
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'messenger.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  color INTEGER NOT NULL DEFAULT 0,
  bio TEXT NOT NULL DEFAULT '',
  stars INTEGER NOT NULL DEFAULT 500,
  last_daily INTEGER NOT NULL DEFAULT 0,
  last_seen INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chats (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('private','group','channel')),
  title TEXT NOT NULL DEFAULT '',
  handle TEXT UNIQUE COLLATE NOCASE,
  description TEXT NOT NULL DEFAULT '',
  pair_key TEXT UNIQUE,
  created_by INTEGER REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  last_read_id INTEGER NOT NULL DEFAULT 0,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_id);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  uploader_id INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS gift_types (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  color TEXT NOT NULL,
  price INTEGER NOT NULL,
  supply INTEGER,
  sold INTEGER NOT NULL DEFAULT 0,
  upgrade_price INTEGER
);

CREATE TABLE IF NOT EXISTS gifts (
  id INTEGER PRIMARY KEY,
  type_id INTEGER NOT NULL REFERENCES gift_types(id),
  owner_id INTEGER NOT NULL REFERENCES users(id),
  sender_id INTEGER NOT NULL REFERENCES users(id),
  message_id INTEGER,
  serial INTEGER,
  upgraded INTEGER NOT NULL DEFAULT 0,
  collectible_no INTEGER,
  attrs TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gifts_owner ON gifts(owner_id);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text','file','gift','system')),
  text TEXT NOT NULL DEFAULT '',
  file_id TEXT REFERENCES files(id),
  gift_id INTEGER REFERENCES gifts(id),
  reply_to INTEGER,
  created_at INTEGER NOT NULL,
  edited_at INTEGER,
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, id);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS contacts (
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (owner_id, contact_id)
);

-- ownership history of gifts: sent -> upgraded -> transferred ...
CREATE TABLE IF NOT EXISTS gift_events (
  id INTEGER PRIMARY KEY,
  gift_id INTEGER NOT NULL REFERENCES gifts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('sent','upgraded','transferred')),
  from_id INTEGER REFERENCES users(id),
  to_id INTEGER REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gift_events ON gift_events(gift_id, id);
`);

// Lightweight migrations for databases created by earlier versions.
function addColumn(table, name, ddl, afterAdd) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (cols.includes(name)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`);
  if (afterAdd) db.exec(afterAdd);
}
addColumn('users', 'avatar_file', 'TEXT');
addColumn('users', 'hide_seen', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'ghost', 'INTEGER NOT NULL DEFAULT 0');
// what a member has *publicly* read (ghost mode keeps this behind last_read_id)
addColumn('members', 'shown_read_id', 'INTEGER NOT NULL DEFAULT 0', 'UPDATE members SET shown_read_id = last_read_id');
addColumn('gifts', 'token', 'TEXT');
addColumn('gifts', 'favorite', 'INTEGER NOT NULL DEFAULT 0');
addColumn('gifts', 'hidden', 'INTEGER NOT NULL DEFAULT 0');
addColumn('gifts', 'sold_at', 'INTEGER');
addColumn('gifts', 'sold_price', 'INTEGER');
addColumn('users', 'status_emoji', "TEXT NOT NULL DEFAULT ''");
addColumn('users', 'cover', "TEXT NOT NULL DEFAULT ''");        // JSON {g, e, f}: gradient index, pattern emoji, own photo
addColumn('users', 'music_file', 'TEXT');
addColumn('users', 'music_title', "TEXT NOT NULL DEFAULT ''");
addColumn('users', 'ai_prompt', "TEXT NOT NULL DEFAULT ''");
addColumn('users', 'ai_model', "TEXT NOT NULL DEFAULT ''");
addColumn('users', 'is_bot', 'INTEGER NOT NULL DEFAULT 0');
db.exec(`
CREATE TABLE IF NOT EXISTS reactions (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id, emoji)
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,
  created_by INTEGER NOT NULL,
  uses_left INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);`);
addColumn('users', 'msg_balance', 'INTEGER NOT NULL DEFAULT 0');
// Refund retired balances into Stars once; do not discard stored value.
if (!db.prepare("SELECT 1 FROM settings WHERE key='msg_retired_refund_v1'").get()) {
  db.prepare('UPDATE users SET stars=stars+COALESCE(msg_balance,0), msg_balance=0').run();
  db.prepare("INSERT INTO settings (key,value) VALUES ('msg_retired_refund_v1','1')").run();
}
addColumn('users', 'is_admin', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'banned', 'INTEGER NOT NULL DEFAULT 0');
db.exec(`CREATE TABLE IF NOT EXISTS admin_log (
  id INTEGER PRIMARY KEY,
  admin_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  target_id INTEGER,
  detail TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);`);
// the first real account on an install becomes the administrator
if (!db.prepare('SELECT 1 FROM users WHERE is_admin=1').get()) {
  db.exec('UPDATE users SET is_admin=1 WHERE id=(SELECT MIN(id) FROM users WHERE is_bot=0)');
}
// per-user state of the assistant conversation: messages up to reset_id are not sent to the model
db.exec(`CREATE TABLE IF NOT EXISTS ai_state (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  chat_id INTEGER NOT NULL,
  reset_id INTEGER NOT NULL DEFAULT 0
);`);

const SEED = [
  // slug, name, emoji, color, price, supply, upgrade_price
  ['heart',   'Heart',        '💝', '#ff6b8b', 15,  null, null],
  ['teddy',   'Teddy Bear',   '🧸', '#c98a5b', 25,  null, null],
  ['rose',    'Rose',         '🌹', '#e0405a', 50,  null, null],
  ['cake',    'Cake',         '🎂', '#f2a65a', 50,  null, null],
  ['rocket',  'Rocket',       '🚀', '#5b8def', 100, null, null],
  ['trophy',  'Trophy',       '🏆', '#e6b422', 100, null, null],
  ['spacecat','Space Cat',    '🐱', '#7a5cf0', 120, 3000, 100],
  ['santa',   'Santa Hat',    '🎅', '#d94444', 150, 2000, 150],
  ['crystal', 'Crystal Ball', '🔮', '#9b59d0', 250, 1000, 200],
  ['crown',   'Golden Crown', '👑', '#d4a017', 500, 500,  300],
  // more limited "NFT-style" collectibles
  ['moon',    'Moon Lantern', '🌙', '#6f7bd9', 200, 1500, 150],
  ['ghost',   'Friendly Ghost','👻', '#9aa5b8', 180, 1500, 150],
  ['alien',   'Alien',        '👽', '#4fc760', 220, 1200, 180],
  ['skull',   'Neon Skull',   '💀', '#8b8f99', 260, 1000, 200],
  ['unicorn', 'Unicorn',      '🦄', '#c86bfa', 300, 800,  250],
  ['phoenix', 'Phoenix',      '🔥', '#ff7a1a', 350, 600,  250],
  ['dragon',  'Red Dragon',   '🐉', '#e04a3a', 400, 400,  300],
  ['ring',    'Diamond Ring', '💍', '#7ad3f0', 450, 300,  350],
  ['diamond', 'Blue Diamond', '💎', '#3aa8ff', 500, 150,  400],
  ['ticket',  'Golden Ticket','🎫', '#e8b923', 500, 100,  400],
  // everyday gifts (all of them can be upgraded too)
  ['balloon', 'Balloon',      '🎈', '#ff5d6c', 20,  null, 40],
  ['coffee',  'Coffee',       '☕', '#a8744f', 20,  null, 40],
  ['pizza',   'Pizza Slice',  '🍕', '#f2994a', 30,  null, 40],
  ['clover',  'Lucky Clover', '🍀', '#3fae6b', 40,  null, 50],
  ['guitar',  'Guitar',       '🎸', '#c0713a', 80,  null, 80],
  ['gamepad', 'Game Pad',     '🎮', '#6b7cff', 90,  null, 80],
  ['champagne','Champagne',   '🍾', '#d9c27a', 120, null, 100],
  // more limited collectibles
  ['butterfly','Butterfly',   '🦋', '#4aa8ff', 160, 2000, 120],
  ['panda',   'Panda Pal',    '🐼', '#8c96a3', 200, 1200, 150],
  ['bolt',    'Thunder Bolt', '⚡', '#f5c518', 280, 800,  220],
  ['amulet',  'Lucky Amulet', '🧿', '#2d7dd2', 380, 450,  300],
  ['planet',  'Ringed Planet','🪐', '#b88a5a', 420, 350,  320],
  // third batch
  ['icecream','Ice Cream',    '🍦', '#f7c6d9', 25,  null, 40],
  ['sunflower','Sunflower',   '🌻', '#f2b705', 35,  null, 45],
  ['book',    'Story Book',   '📚', '#7a8cff', 60,  null, 60],
  ['camera',  'Camera',       '📷', '#7d8590', 70,  null, 70],
  ['headphones','Headphones', '🎧', '#e0526e', 110, null, 90],
  ['bell',    'Silver Bell',  '🔔', '#9fb4c7', 190, 1300, 160],
  ['octopus', 'Octopus',      '🐙', '#c75a8b', 240, 1000, 180],
  ['whale',   'Blue Whale',   '🐳', '#3a82c9', 260, 900,  200],
  ['fireworks','Fireworks',   '🎆', '#7a4cff', 300, 800,  230],
  ['comet',   'Comet',        '☄️', '#ff8a3d', 330, 700,  240],
  ['lighthouse','Tokyo Tower','🗼', '#e5533d', 340, 600,  260],
  ['key',     'Golden Key',   '🗝️', '#d4a017', 360, 500,  280],
  // fourth batch: from everyday to mythic (the tier follows the edition size)
  ['cookie',  'Cookie',       '🍪', '#c58a4a', 15,  null, 35],
  ['watermelon','Watermelon', '🍉', '#e0534f', 20,  null, 40],
  ['sunshine','Sunshine',     '🌞', '#f7b928', 35,  null, 45],
  ['snowflake','Snowflake',   '❄️', '#7cc7f2', 45,  null, 50],
  ['palette', 'Art Palette',  '🎨', '#d96ac8', 70,  null, 70],
  ['bicycle', 'Bicycle',      '🚲', '#3bb1a0', 95,  null, 90],
  ['telescope','Telescope',   '🔭', '#6b7bd6', 100, null, 90],
  ['pearl',   'Pearl Shell',  '🐚', '#f0b8c8', 170, 1800, 140],
  ['rabbit',  'Lucky Rabbit', '🐇', '#c9a98a', 210, 1100, 170],
  ['peacock', 'Peacock',      '🦚', '#1fa38a', 320, 700,  250],
  ['hourglass','Hourglass',   '⏳', '#d9a441', 340, 650,  260],
  ['compass', 'Compass',      '🧭', '#8a6b3d', 360, 500,  280],
  ['eagle',   'Golden Eagle', '🦅', '#c99a2e', 600, 300,  420],
  ['castle',  'Dream Castle', '🏰', '#8f7be0', 650, 250,  450],
  ['trident', 'Sea Trident',  '🔱', '#2a9fd6', 700, 200,  480],
  ['galaxy',  'Spiral Galaxy','🌌', '#5b4bd6', 750, 150,  500],
  ['egg',     'Cosmic Egg',   '🥚', '#e8d6ff', 1200, 80,  700],
  ['infinity','Infinity',     '♾️', '#35d0c0', 1500, 60,  800],
  ['clock',   'Eternal Clock','🕰️', '#b08d57', 2000, 40,  1000],
  ['blackhole','Black Hole',  '🕳️', '#2b2b45', 2500, 25,  1200],
  // cozy winter collection
  ['hotcocoa', 'Hot Cocoa', '☕', '#b77a55', 35, null, 50],
  ['snowglobe', 'Snow Globe', '🔮', '#8fcbe8', 180, 900, 140],
  ['gingerbread', 'Gingerbread House', '🏠', '#c58a62', 220, 700, 170],
  ['cozyblanket', 'Cozy Blanket', '🧣', '#b76e78', 260, 500, 190],
  // fifth batch: 3D models (spin them with a drag)
  ['teddy3d',   '3D Teddy',     '🧸', '#c98b5a', 80,  null, 80],
  ['robot3d',   '3D Robot',     '🤖', '#6f8fa8', 140, null, 110],
  ['racecar', '3D Race Car',  '🏎️', '#e0453a', 260, 1500, 200],
  ['rocket3d',  '3D Rocket',    '🚀', '#4a7bd8', 330, 900,  260],
  ['saturn',  '3D Saturn',    '🪐', '#d9a35b', 420, 600,  320],
  ['knight',  '3D Shield',    '🛡️', '#7d8ca3', 480, 450,  360],
  ['dragon3d',  '3D Dragon',    '🐉', '#3fae6a', 900, 220,  600],
  ['statue',  '3D Statue',    '🗽', '#5fb7a6', 1100, 150, 700],
  ['ufo',     '3D UFO',       '🛸', '#8a5be0', 1800, 70,  900],
  ['diamond3d','3D Diamond',  '💎', '#4cc3ff', 3000, 20,  1500],
];
const ins = db.prepare(
  'INSERT OR IGNORE INTO gift_types (slug,name,emoji,color,price,supply,upgrade_price) VALUES (?,?,?,?,?,?,?)'
);
for (const row of SEED) ins.run(...row);
// the older everyday gifts can now be upgraded as well
const UPGRADE_FOR_OLD = { heart: 40, teddy: 50, rose: 60, cake: 60, rocket: 90, trophy: 90 };
for (const [slug, price] of Object.entries(UPGRADE_FOR_OLD)) {
  db.prepare('UPDATE gift_types SET upgrade_price=? WHERE slug=? AND upgrade_price IS NULL').run(price, slug);
}

// Runs fn inside a transaction. Calls made while a transaction is already open simply join it.
let txDepth = 0;
function tx(fn) {
  if (txDepth > 0) return fn();
  db.exec('BEGIN IMMEDIATE');
  txDepth++;
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    txDepth--;
  }
}

module.exports = { db, tx, DATA_DIR };

// user reports of messages, handled in the admin panel
db.exec(`CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY,
  message_id INTEGER NOT NULL,
  reporter_id INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  handled_by INTEGER,
  created_at INTEGER NOT NULL
);`);

addColumn('users', 'stars_spent', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'premium_until', 'INTEGER NOT NULL DEFAULT 0');
addColumn('chats', 'category', "TEXT NOT NULL DEFAULT ''");
addColumn('chats', 'members_can_invite', 'INTEGER NOT NULL DEFAULT 0');
addColumn('chats', 'members_can_pin', 'INTEGER NOT NULL DEFAULT 1');
addColumn('chats', 'members_can_delete', 'INTEGER NOT NULL DEFAULT 0');

addColumn('users', 'name_color', "TEXT NOT NULL DEFAULT ''");
// private nicknames: what *I* call somebody (only I see it)
db.exec(`CREATE TABLE IF NOT EXISTS nicks (
  owner_id INTEGER NOT NULL, target_id INTEGER NOT NULL, nick TEXT NOT NULL,
  PRIMARY KEY (owner_id, target_id)
);`);

// Lucky wheel + achievements
addColumn('users', 'wheel_at', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'wheel_spins', 'INTEGER NOT NULL DEFAULT 0');
db.exec(`
CREATE TABLE IF NOT EXISTS market_listings (
  id INTEGER PRIMARY KEY,
  gift_id INTEGER NOT NULL UNIQUE REFERENCES gifts(id) ON DELETE CASCADE,
  seller_id INTEGER NOT NULL REFERENCES users(id),
  price INTEGER NOT NULL CHECK (price > 0),
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','sold','cancelled','removed')),
  buyer_id INTEGER REFERENCES users(id),
  closed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_market_active ON market_listings(status, created_at DESC);
CREATE TABLE IF NOT EXISTS market_sales (
  id INTEGER PRIMARY KEY,
  listing_id INTEGER NOT NULL,
  gift_id INTEGER NOT NULL,
  seller_id INTEGER NOT NULL,
  buyer_id INTEGER NOT NULL,
  price INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_market_sales_time ON market_sales(created_at DESC);
`);
addColumn('market_listings', 'featured', 'INTEGER NOT NULL DEFAULT 0');
db.exec(`CREATE TABLE IF NOT EXISTS ach_claims (
  user_id INTEGER NOT NULL, ach_id TEXT NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, ach_id)
);`);
