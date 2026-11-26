'use strict';
// Consistent backup of the database (safe while the server is running) + the uploads folder list.
//   node scripts/backup.js            -> backups/messenger-YYYY-MM-DD-HHMM.db (keeps the newest 14)
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const OUT = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
fs.mkdirSync(OUT, { recursive: true });
const d = new Date();
const pad = (n) => String(n).padStart(2, '0');
const name = `messenger-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.db`;
const db = new DatabaseSync(path.join(DATA_DIR, 'messenger.db'));
db.exec(`VACUUM INTO '${path.join(OUT, name).replace(/'/g, "''")}'`);
db.close();
const all = fs.readdirSync(OUT).filter((f) => /^messenger-.*\.db$/.test(f)).sort();
for (const old of all.slice(0, Math.max(0, all.length - 14))) fs.rmSync(path.join(OUT, old));
console.log('Backup written:', path.join(OUT, name));
console.log('Also copy the uploads folder (photos, files, voice messages) if you need them: ' + (process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads')));
