'use strict';
// AI assistant: talks to any OpenAI-compatible server (Ollama by default). Free and unlimited when the model
// runs on your own machine. Nothing is sent anywhere else. The model you pick decides how it answers.
const crypto = require('crypto');
const { db } = require('./db');

const cfg = () => ({
  url: (process.env.AI_URL || 'http://127.0.0.1:11434/v1').replace(/\/+$/, ''),
  model: process.env.AI_MODEL || 'llama3.2',
  key: process.env.AI_KEY || '',
});

const BASE_PROMPT =
  'You are a helpful, friendly assistant inside a messenger. Answer in the language the user writes in. ' +
  'Be concise unless asked for detail. Use Markdown (lists, code blocks) when it helps.';
const HISTORY_LIMIT = 24;
const MAX_REPLY = 12000;

const SETUP_HELP =
  "I can't reach a language model yet.\n\n" +
  '**Free setup (runs on your computer, no limits):**\n' +
  '1. Install Ollama from ollama.com\n' +
  '2. Run `ollama pull llama3.2` in a terminal\n' +
  '3. Restart this messenger. To use another model: `AI_MODEL=name npm start`\n\n' +
  'Я пока не подключён к языковой модели. Установите Ollama (ollama.com), выполните `ollama pull llama3.2` и перезапустите мессенджер.';

function headers() {
  const h = { 'content-type': 'application/json' };
  if (cfg().key) h.authorization = 'Bearer ' + cfg().key;
  return h;
}

function ensureBot() {
  let bot = db.prepare('SELECT * FROM users WHERE is_bot=1 ORDER BY id LIMIT 1').get();
  const name = (process.env.AI_NAME || 'Assistant').slice(0, 40);
  if (bot) {
    if (bot.display_name !== name) { db.prepare('UPDATE users SET display_name=? WHERE id=?').run(name, bot.id); bot = { ...bot, display_name: name }; }
    return bot;
  }
  const salt = crypto.randomBytes(16).toString('hex');
  let username = 'ai_assistant';
  while (db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) username += '_';
  // random hash: nobody can sign in as the bot
  const r = db.prepare(
    "INSERT INTO users (username,display_name,pass_hash,salt,color,bio,created_at,last_seen,is_bot,stars) VALUES (?,?,?,?,?,?,?,?,1,0)"
  ).run(username, name, crypto.randomBytes(64).toString('hex'), salt, 4, 'Ask me anything.', Date.now(), Date.now());
  return db.prepare('SELECT * FROM users WHERE id=?').get(Number(r.lastInsertRowid));
}

async function status(userModel) {
  const c = cfg();
  const model = userModel || c.model;
  try {
    const res = await fetch(c.url + '/models', { headers: headers(), signal: AbortSignal.timeout(2500) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    const models = (j.data || []).map((m) => String(m.id)).slice(0, 100);
    return { online: true, model, defaultModel: c.model, models, modelInstalled: !models.length || models.includes(model) };
  } catch {
    return { online: false, model, defaultModel: c.model, models: [], modelInstalled: false };
  }
}

const running = new Map(); // chatId -> AbortController

/**
 * Streams an answer. hooks: onStart() creates the message, onText(full) updates it, onDone(full, failed).
 */
async function answer({ user, history, hooks }) {
  const c = cfg();
  const model = user.ai_model || c.model;
  const system = BASE_PROMPT + (user.ai_prompt ? '\n\nUser instructions:\n' + user.ai_prompt : '');
  const messages = [{ role: 'system', content: system }, ...history];
  const ctl = new AbortController();
  hooks.setAbort(ctl);
  let full = '';
  let started = false;
  try {
    const res = await fetch(c.url + '/chat/completions', {
      method: 'POST', headers: headers(), signal: ctl.signal,
      body: JSON.stringify({ model, messages, stream: true }),
    });
    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${t.slice(0, 200)}`);
    }
    const dec = new TextDecoder();
    let buf = '';
    for await (const chunk of res.body) {
      buf += dec.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        let j; try { j = JSON.parse(data); } catch { continue; }
        const delta = j.choices?.[0]?.delta?.content;
        if (!delta) continue;
        full += delta;
        if (full.length > MAX_REPLY) { full = full.slice(0, MAX_REPLY); ctl.abort(); }
        if (!started) { started = true; hooks.onStart(); }
        hooks.onText(full);
      }
    }
    if (!full.trim()) throw new Error('empty answer');
    hooks.onDone(full, false);
  } catch (e) {
    if (ctl.signal.aborted && full) return hooks.onDone(full, false);
    if (ctl.signal.aborted) return hooks.onDone('', false, true); // superseded by a newer question
    const st = await status(model);
    let text;
    if (!st.online) text = SETUP_HELP;
    else if (!st.modelInstalled) text = `The model \`${model}\` is not installed. Run \`ollama pull ${model}\` or pick another one in Settings > AI Assistant.`;
    else text = 'The model failed to answer (' + String(e.message).slice(0, 120) + '). Try again.';
    hooks.onDone(full ? full + '\n\n⚠️ ' + text : text, true);
  }
}

module.exports = { ensureBot, status, answer, running, cfg, BASE_PROMPT };
