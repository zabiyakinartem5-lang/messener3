import React, { useState, useEffect, useRef } from 'react';
import { api, shortDate, fmtSize } from './api.js';
import { useApp } from './ctx.js';
import { Avatar, Modal } from './ui.jsx';

// Number that counts up when it appears (instant when animations are off).
function CountUp({ value }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(value); return; }
    let raf; const t0 = performance.now();
    const tick = (t) => { const k = Math.min(1, (t - t0) / 700); setV(Math.round(value * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{v.toLocaleString()}</>;
}

function Overview() {
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api('GET', '/admin/stats').then(setS).catch((e) => setErr(e.message)); }, []);
  if (err) return <div className="error" role="alert">{err}</div>;
  if (!s) return <div className="muted">Loading…</div>;
  const max = Math.max(1, ...s.perDay.map((d) => d.messages));
  const cards = [
    ['👥', 'Users', s.users], ['🟢', 'Online now', s.online], ['🆕', 'New in 24h', s.newToday], ['⛔', 'Suspended', s.banned],
    ['💬', 'Messages', s.messages], ['😍', 'Reactions', s.reactions], ['⚡', 'Messages in 24h', s.messagesToday], ['🎁', 'Gifts', s.gifts], ['💎', 'Collectibles', s.collectibles],
    ['⭐', 'Stars in wallets', s.stars], ['✨', 'Premium users', s.premiumUsers], ['📎', 'Files', s.files],
  ];
  return (
    <>
      <div className="stat-grid">
        {cards.map(([ic, label, v], i) => (
          <div className="stat-card" key={label} style={{ animationDelay: i * 40 + 'ms' }}>
            <span className="stat-ic">{ic}</span><b><CountUp value={v} /></b><small>{label}</small>
          </div>
        ))}
      </div>
      {s.maintenance && <div className="maint-banner" role="status">🛠 Maintenance mode is ON — only admins can use the app</div>}
      {s.openReports > 0 && <div className="maint-banner warn" role="status">🚩 {s.openReports} open report{s.openReports > 1 ? 's' : ''} waiting</div>}
      <div className="top-grid">
        <div><h4>Most active</h4>{s.topSenders.map((u, i) => <div className="top-row" key={u.id}><span>{['🥇', '🥈', '🥉', '4', '5'][i]}</span><b>{u.name}</b><small>{u.n} msgs</small></div>)}{!s.topSenders.length && <div className="muted">No messages yet</div>}</div>
        <div><h4>Popular gifts</h4>{s.topGifts.map((g) => <div className="top-row" key={g.name}><span>{g.emoji}</span><b>{g.name}</b><small>{g.n}</small></div>)}{!s.topGifts.length && <div className="muted">No gifts yet</div>}</div>
      </div>
      {s.tiers.length > 0 && <><h4>Gifts by rarity</h4><div className="tier-chips">{s.tiers.map((t) => <span key={t.tier} className={'tier-chip on tier-' + t.tier}>{t.tier} <small>{t.n}</small></span>)}</div></>}
      <h4>Messages, last 7 days</h4>
      <div className="bars" role="img" aria-label="Messages per day">
        {s.perDay.map((d, i) => (
          <div key={d.day} className="bar-col" title={`${d.day}: ${d.messages} messages, ${d.signups} sign-ups`}>
            <i style={{ height: Math.max(4, (d.messages / max) * 100) + '%', animationDelay: i * 60 + 'ms' }} />
            <small>{d.day.slice(3)}</small><span>{d.messages}</span>
          </div>
        ))}
      </div>
      <div className="kv">
        <div><span>Chats</span><b>{s.chats.private} private · {s.chats.group} groups · {s.chats.channel} channels</b></div>
        <div><span>Storage</span><b>{fmtSize(s.storageBytes)}</b></div>
        <div><span>Admins</span><b>{s.admins}</b></div>
        <div><span>AI model</span><b>{s.ai.online ? '● ' + s.ai.model : '○ offline'}</b></div>
        <div><span>Uptime</span><b>{Math.floor(s.uptimeSec / 3600)}h {Math.floor((s.uptimeSec % 3600) / 60)}m</b></div>
      </div>
    </>
  );
}

function Users() {
  const { me, toast } = useApp();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [temp, setTemp] = useState(null);
  const [grant, setGrant] = useState(null);
  const [onlyOnline, setOnlyOnline] = useState(false);
  const timer = useRef();
  const load = (query = q) => api('GET', '/admin/users?q=' + encodeURIComponent(query)).then(setRows).catch((e) => setErr(e.message));
  useEffect(() => { clearTimeout(timer.current); timer.current = setTimeout(() => load(q), 200); return () => clearTimeout(timer.current); }, [q]);
  async function exportCsv() {
    try {
      const all = await api('GET', '/admin/users?all=1&q=' + encodeURIComponent(q));
      const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
      const head = ['id', 'username', 'display_name', 'stars', 'messages', 'admin', 'suspended', 'joined', 'last_seen'];
      const lines = [head.join(',')].concat(all.map((u) => [u.id, u.username, u.displayName, u.stars, u.messages, u.isAdmin, u.banned, new Date(u.createdAt).toISOString(), u.lastSeen ? new Date(u.lastSeen).toISOString() : ''].map(esc).join(',')));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
      a.download = 'users.csv'; a.click(); URL.revokeObjectURL(a.href);
    } catch (e) { setErr(e.message); }
  }
  async function act(u, body, msg) {
    setErr('');
    try { const r = await api('PATCH', '/admin/users/' + u.id, body); setRows((rs) => rs.map((x) => (x.id === u.id ? { ...x, ...r } : x))); toast(msg); } catch (e) { setErr(e.message); }
  }
  return (
    <>
      <div className="row">
        <input className="search" placeholder="Search users" aria-label="Search users" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="inline"><input type="checkbox" checked={onlyOnline} onChange={(e) => setOnlyOnline(e.target.checked)} /> 🟢 Online</label>
        <button className="primary small" onClick={exportCsv}>⬇ CSV</button>
      </div>
      {temp && <div className="temp-pass" role="status">Temporary password for @{temp.user}: <code>{temp.password}</code> <small>Shown once. Send it to the user; they can change it in Settings.</small> <button onClick={() => setTemp(null)} aria-label="Dismiss">✕</button></div>}
      {grant && <GrantGift user={grant} onClose={() => setGrant(null)} />}
      {err && <div className="error small" role="alert">{err}</div>}
      <div className="admin-users">
        {!rows && <div className="muted">Loading…</div>}
        {rows?.filter((u) => !onlyOnline || u.online).map((u, i) => (
          <div className={'admin-user' + (u.banned ? ' banned' : '')} key={u.id} style={{ animationDelay: Math.min(i, 12) * 25 + 'ms' }} data-user={u.username}>
            <Avatar name={u.displayName} color={u.color} src={u.avatar} size={38} />
            <div className="au-main">
              <b>{u.displayName} {u.isAdmin && <span className="bot-tag">ADMIN</span>}{u.premium && <span className="prem-tag" title="Premium">✨</span>}{u.banned && <span className="bot-tag ban">SUSPENDED</span>}</b>
              <small>@{u.username} · Lv {u.level} · ⭐ {u.stars} (spent {u.spent}) · {u.messages} msgs · joined {shortDate(u.createdAt)}{u.online ? ' · online' : ''}</small>
            </div>
            {u.id !== me.id && (
              <div className="au-actions">
                <button onClick={() => { const v = prompt('Premium for @' + u.username + ': add how many days? (0 = revoke)', '30'); if (v !== null) act(u, { premiumDays: Number(v) }, 'Premium updated'); }}>✨</button>
                <button onClick={() => { const v = prompt('Set Stars balance for @' + u.username, String(u.stars)); if (v !== null) act(u, { stars: Number(v) }, 'Stars updated'); }}>⭐</button>
                <button onClick={() => act(u, { isAdmin: !u.isAdmin }, u.isAdmin ? 'Admin rights removed' : 'Now an admin')}>{u.isAdmin ? 'Demote' : 'Make admin'}</button>
                <button onClick={async () => { if (!confirm('Reset the password of @' + u.username + '? They will be signed out.')) return; try { const r = await api('POST', `/admin/users/${u.id}/reset-password`); setTemp({ user: u.username, password: r.password }); } catch (e) { setErr(e.message); } }}>Reset password</button>
                <button onClick={() => setGrant(u)}>🎁 Give gift</button>
                <button onClick={async () => { if (!confirm('Sign @' + u.username + ' out of all devices?')) return; try { await api('POST', `/admin/users/${u.id}/logout`); toast('Signed out'); load(); } catch (e) { setErr(e.message); } }}>⏏ Sign out</button>
                {!u.isAdmin && !u.banned && <button className="danger" onClick={async () => { if (!confirm('Delete the account of @' + u.username + '? Its messages are removed and the name is freed. This cannot be undone.')) return; try { await api('DELETE', '/admin/users/' + u.id); setRows((rs) => rs.filter((x) => x.id !== u.id)); toast('Account deleted'); } catch (e) { setErr(e.message); } }}>Delete</button>}
                {!u.isAdmin && <button className={u.banned ? '' : 'danger'} onClick={() => (!u.banned ? confirm('Suspend @' + u.username + '? They will be signed out and cannot log in.') : true) && act(u, { banned: !u.banned }, u.banned ? 'Account restored' : 'Account suspended')}>{u.banned ? 'Restore' : 'Suspend'}</button>}
              </div>
            )}
          </div>
        ))}
        {rows && !rows.length && <div className="muted">No users found</div>}
      </div>
    </>
  );
}

function Announce() {
  const { toast } = useApp();
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [log, setLog] = useState([]);
  const [filter, setFilter] = useState('');
  const loadLog = (f = filter) => api('GET', '/admin/log' + (f ? '?action=' + encodeURIComponent(f) : '')).then(setLog).catch(() => {});
  useEffect(() => { loadLog(); }, [filter]);
  async function send() {
    setErr('');
    try { const r = await api('POST', '/admin/announce', { text }); toast(`Announcement sent to ${r.delivered} online`); setText(''); loadLog(); } catch (e) { setErr(e.message); }
  }
  return (
    <>
      <p className="muted small">Shows a banner to everyone who is online right now.</p>
      <textarea className="ai-prompt" rows={3} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} placeholder="Maintenance tonight at 22:00…" aria-label="Announcement text" />
      {err && <div className="error small" role="alert">{err}</div>}
      <button className="primary" onClick={send} disabled={!text.trim()}>📣 Send announcement</button>
      <h4>Recent admin actions</h4>
      <select className="tier-sort" style={{ margin: '0 0 6px' }} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter log">
        <option value="">All actions</option>
        {['ban', 'unban', 'set_stars', 'grant_gift', 'announce', 'bonus', 'delete_user', 'force_logout', 'report_delete', 'report_ban', 'report_dismiss', 'maintenance_on', 'premium_grant', 'premium_revoke', 'setting'].map((a) => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
      </select>
      <div className="admin-log">
        {log.map((l) => <div key={l.id}><b>{l.admin}</b> {l.action.replace('_', ' ')}{l.target ? ' @' + l.target : ''}{l.action === 'announce' || l.action === 'set_stars' ? ': ' + l.detail : ''}<small>{new Date(l.createdAt).toLocaleString()}</small></div>)}
        {!log.length && <div className="muted">Nothing yet</div>}
      </div>
    </>
  );
}


function GrantGift({ user, onClose }) {
  const { toast } = useApp();
  const [types, setTypes] = useState([]);
  const [typeId, setTypeId] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { api('GET', '/admin/gift-types').then((t) => { setTypes(t); setTypeId(String(t[0]?.id || '')); }).catch((e) => setErr(e.message)); }, []);
  async function go() {
    try { await api('POST', '/admin/grant-gift', { userId: user.id, typeId: Number(typeId) }); toast('Gift given to @' + user.username); onClose(); } catch (e) { setErr(e.message); }
  }
  return (
    <div className="grant-box">
      <b>Give a gift to @{user.username}</b>
      <select value={typeId} onChange={(e) => setTypeId(e.target.value)} aria-label="Gift">
        {types.map((t) => <option key={t.id} value={t.id}>{t.emoji} {t.name}{t.supply != null ? ` (${t.supply - t.sold} left)` : ''}</option>)}
      </select>
      {err && <div className="error small" role="alert">{err}</div>}
      <div className="row"><button className="primary small" onClick={go} disabled={!typeId}>Give</button><button className="primary small ghosty" onClick={onClose}>Cancel</button></div>
    </div>
  );
}

function SettingsTab() {
  const { toast } = useApp();
  const [st, setSt] = useState(null);
  const [uses, setUses] = useState(1);
  const [bonus, setBonus] = useState(50);
  const [err, setErr] = useState('');
  const [mtext, setMtext] = useState('');
  const [daily, setDaily] = useState(100);
  const [start, setStart] = useState(500);
  const [pprice, setPprice] = useState(400);
  const load = () => api('GET', '/admin/settings').then((r) => { setSt(r); setMtext(r.maintenanceText); setDaily(r.dailyBonus); setStart(r.startStars); setPprice(r.premiumPrice); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const modes = [['open', 'Open', 'Anyone can sign up'], ['invite', 'Invite only', 'A valid invite code is needed'], ['closed', 'Closed', 'Nobody new can sign up']];
  async function setMode(regMode) { try { await api('PUT', '/admin/settings', { regMode }); setSt((s) => ({ ...s, regMode })); toast('Registration: ' + regMode); } catch (e) { setErr(e.message); } }
  async function newInvite() { try { await api('POST', '/admin/invites', { uses: Number(uses) }); load(); } catch (e) { setErr(e.message); } }
  async function delInvite(code) { await api('DELETE', '/admin/invites/' + code).catch(() => {}); load(); }
  async function giveBonus() {
    if (!confirm(`Give ${bonus} Stars to every active user?`)) return;
    try { const r = await api('POST', '/admin/bonus', { stars: Number(bonus) }); toast(`+${bonus} Stars to ${r.users} users`); } catch (e) { setErr(e.message); }
  }
  async function save(body, msg) { setErr(''); try { await api('PUT', '/admin/settings', body); toast(msg); load(); } catch (e) { setErr(e.message); } }
  async function logoutAll() {
    if (!confirm('Sign everyone except you out?')) return;
    try { const r = await api('POST', '/admin/logout-all'); toast(r.sessions + ' sessions closed'); } catch (e) { setErr(e.message); }
  }
  if (!st) return <div className="muted">{err || 'Loading…'}</div>;
  return (
    <>
      {err && <div className="error small" role="alert">{err}</div>}
      <h4>Registration</h4>
      <div className="mode-row" role="radiogroup" aria-label="Registration mode">
        {modes.map(([k, n, d]) => <button key={k} role="radio" aria-checked={st.regMode === k} className={st.regMode === k ? 'on' : ''} onClick={() => setMode(k)}><b>{n}</b><small>{d}</small></button>)}
      </div>
      <h4>Invite codes</h4>
      <div className="row">
        <label className="inline">Uses <input type="number" min="1" max="1000" value={uses} onChange={(e) => setUses(e.target.value)} style={{ width: 80 }} /></label>
        <button className="primary small" onClick={newInvite}>＋ New invite</button>
      </div>
      <div className="admin-log">
        {st.invites.map((i) => (
          <div key={i.code}><code>{i.code}</code> · {i.usesLeft} left · used {i.used}
            <button className="link" onClick={() => navigator.clipboard?.writeText(i.code)}>copy</button>
            <button className="link" onClick={() => delInvite(i.code)}>delete</button></div>
        ))}
        {!st.invites.length && <div className="muted">No invite codes yet</div>}
      </div>
      <h4>Maintenance mode</h4>
      <p className="muted small">While it is on, only admins can use the app; everyone else sees your message.</p>
      <input className="search" maxLength={200} value={mtext} onChange={(e) => setMtext(e.target.value)} placeholder="Back at 22:00" aria-label="Maintenance message" />
      <div className="row">
        <button className={'primary small' + (st.maintenance ? '' : ' ghosty')} onClick={() => save({ maintenance: !st.maintenance, maintenanceText: mtext }, st.maintenance ? 'Maintenance off' : 'Maintenance on')}>{st.maintenance ? '✅ Turn off' : '🛠 Turn on'}</button>
        {st.maintenance && <button className="primary small ghosty" onClick={() => save({ maintenance: true, maintenanceText: mtext }, 'Message updated')}>Update message</button>}
      </div>
      <h4>Economy</h4>
      <div className="row">
        <label className="inline">Daily bonus ⭐ <input type="number" min="1" max="10000" value={daily} onChange={(e) => setDaily(e.target.value)} style={{ width: 90 }} /></label>
        <label className="inline">Starting ⭐ <input type="number" min="0" max="100000" value={start} onChange={(e) => setStart(e.target.value)} style={{ width: 90 }} /></label>
        <label className="inline">Premium ⭐ <input type="number" min="1" max="100000" value={pprice} onChange={(e) => setPprice(e.target.value)} style={{ width: 90 }} /></label>
        <button className="primary small" onClick={() => save({ dailyBonus: Number(daily), startStars: Number(start), premiumPrice: Number(pprice) }, 'Economy saved')}>Save</button>
      </div>
      <h4>Security</h4>
      <button className="primary small danger" onClick={logoutAll}>⏏ Sign everyone out</button>
      <h4>Stars bonus for everyone</h4>
      <div className="row">
        <input type="number" min="1" max="100000" value={bonus} onChange={(e) => setBonus(e.target.value)} style={{ width: 110 }} aria-label="Bonus Stars" />
        <button className="primary small" onClick={giveBonus}>⭐ Give to all</button>
      </div>
    </>
  );
}

function ReportsTab({ onChange }) {
  const { toast } = useApp();
  const [closed, setClosed] = useState(false);
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const load = () => api('GET', '/admin/reports' + (closed ? '?status=closed' : '')).then(setRows).catch((e) => setErr(e.message));
  useEffect(() => { setRows(null); load(); }, [closed]);
  async function act(r, action, msg) {
    if (action === 'ban' && !confirm('Delete the message and suspend @' + r.sender + '?')) return;
    try { await api('POST', '/admin/reports/' + r.id, { action }); toast(msg); load(); onChange?.(); } catch (e) { setErr(e.message); }
  }
  return (
    <>
      <div className="mode-row" role="tablist">
        <button role="tab" aria-selected={!closed} className={!closed ? 'on' : ''} onClick={() => setClosed(false)}><b>Open</b></button>
        <button role="tab" aria-selected={closed} className={closed ? 'on' : ''} onClick={() => setClosed(true)}><b>Handled</b></button>
      </div>
      {err && <div className="error small" role="alert">{err}</div>}
      {!rows && <div className="muted">Loading…</div>}
      {rows?.map((r) => (
        <div className="report-card" key={r.id}>
          <div><b>@{r.sender}</b> <small className="muted">in {r.chat} · reported by @{r.reporter} · {shortDate(r.createdAt)}</small></div>
          <blockquote>{r.deleted ? <i className="muted">message deleted</i> : r.text}</blockquote>
          {r.reason && <div className="small">Reason: {r.reason}</div>}
          {!closed && (
            <div className="au-actions">
              <button onClick={() => act(r, 'dismiss', 'Report dismissed')}>Dismiss</button>
              <button className="danger" onClick={() => act(r, 'delete', 'Message deleted')}>Delete message</button>
              <button className="danger" onClick={() => act(r, 'ban', 'Message deleted, user suspended')}>Delete + suspend</button>
            </div>
          )}
          {closed && <small className="muted">{r.status}</small>}
        </div>
      ))}
      {rows && !rows.length && <div className="muted">{closed ? 'Nothing handled yet' : '🎉 No open reports'}</div>}
    </>
  );
}

function ChatsTab() {
  const { toast } = useApp();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api('GET', '/admin/chats').then(setRows).catch((e) => setErr(e.message)); }, []);
  async function del(c) {
    if (!confirm(`Delete the ${c.type} "${c.title}" with all its messages? This cannot be undone.`)) return;
    try { await api('DELETE', '/admin/chats/' + c.id); setRows((r) => r.filter((x) => x.id !== c.id)); toast('Deleted'); } catch (e) { setErr(e.message); }
  }
  return (
    <>
      <p className="muted small">Groups and channels. Private conversations are not shown here.</p>
      {err && <div className="error small" role="alert">{err}</div>}
      <div className="admin-users">
        {!rows && <div className="muted">Loading…</div>}
        {rows?.map((c) => (
          <div className="admin-user" key={c.id} data-chat={c.title}>
            <span className="stat-ic">{c.type === 'channel' ? '📣' : '👥'}</span>
            <div className="au-main"><b>{c.title}</b><small>{c.type}{c.handle ? ' · @' + c.handle : ''} · {c.members} members · {c.messages} messages · by @{c.owner || '?'}</small></div>
            <div className="au-actions"><button className="danger" onClick={() => del(c)}>Delete</button></div>
          </div>
        ))}
        {rows && !rows.length && <div className="muted">No groups or channels yet</div>}
      </div>
    </>
  );
}

function GiftsTab() {
  const { toast } = useApp();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api('GET', '/admin/gift-types').then(setRows).catch((e) => setErr(e.message)); }, []);
  async function edit(t, field, label) {
    const cur = field === 'price' ? t.price : field === 'upgradePrice' ? t.upgradePrice : t.supply;
    const v = prompt(`${t.name}: new ${label}`, String(cur ?? ''));
    if (v === null) return;
    try { const r = await api('PATCH', '/admin/gift-types/' + t.id, { [field]: v === '' && field === 'upgradePrice' ? null : Number(v) }); setRows((rs) => rs.map((x) => (x.id === t.id ? { ...x, price: r.price, supply: r.supply, upgradePrice: r.upgradePrice } : x))); toast('Saved'); } catch (e) { setErr(e.message); }
  }
  return (
    <>
      <p className="muted small">Change prices and the edition size of gifts. Tap a value to edit it.</p>
      {err && <div className="error small" role="alert">{err}</div>}
      <div className="gift-admin">
        {!rows && <div className="muted">Loading…</div>}
        {rows?.map((t) => (
          <div className="ga-row" key={t.id}>
            <span className="ga-emoji">{t.emoji}</span><b>{t.name}</b>
            <button onClick={() => edit(t, 'price', 'price')} title="Price">⭐ {t.price}</button>
            <button onClick={() => edit(t, 'upgradePrice', 'upgrade price (empty = cannot upgrade)')} title="Upgrade price">⬆ {t.upgradePrice ?? '—'}</button>
            {t.supply != null ? <button onClick={() => edit(t, 'supply', 'edition size')} title="Edition size">{t.sold}/{t.supply}</button> : <small>unlimited · {t.owned} owned</small>}
          </div>
        ))}
      </div>
    </>
  );
}

function MarketAdmin() {
  const { toast, setMe } = useApp();
  const [data,setData] = useState(null); const [err,setErr] = useState(''); const [rate,setRate] = useState('1');
  async function load(){try{const d=await api('GET','/admin/market');setData(d);setRate(String(d.rate));}catch(e){setErr(e.message);}}
  useEffect(()=>{load();},[]);
  async function saveRate(){try{const r=await api('POST','/admin/market/rate',{rate:Number(rate)});setRate(String(r.rate));api('GET','/me').then(setMe).catch(()=>{});toast('Exchange rate saved');load();}catch(e){setErr(e.message);}}
  async function grant(){const id=prompt('User ID to receive MSG');if(id===null)return;const amount=prompt('How many MSG to grant?','100');if(amount===null)return;try{await api('POST','/admin/market/grant-msg',{userId:Number(id),amount:Number(amount)});toast('MSG granted');}catch(e){setErr(e.message);}}
  async function remove(item){if(!confirm('Remove this marketplace listing?'))return;try{await api('DELETE','/admin/market/listings/'+item.id);toast('Listing removed');load();}catch(e){setErr(e.message);}}
  if(!data)return <div className={err?'error':'muted'}>{err||'Loading…'}</div>;
  return <><div className="stat-grid">
    <div className="stat-card"><span className="stat-ic msg-stat-mark">M</span><b>{data.msgSupply.toLocaleString()}</b><small>MSG in wallets</small></div>
    <div className="stat-card"><span className="stat-ic">🛍</span><b>{data.active.length}</b><small>Active listings</small></div>
    <div className="stat-card"><span className="stat-ic">🤝</span><b>{data.sales.toLocaleString()}</b><small>Completed sales</small></div>
    <div className="stat-card"><span className="stat-ic">📈</span><b>{data.volume.toLocaleString()}</b><small>MSG trade volume</small></div>
  </div><div className="row"><label className="inline">Exchange rate · MSG per Star <input type="number" min="0.01" max="1000" step="0.001" value={rate} onChange={e=>setRate(e.target.value)} style={{width:100}} /></label><button className="primary small" onClick={saveRate}>Save rate</button><button className="primary small ghosty" onClick={grant}>＋ Grant MSG</button></div>
  {err&&<div className="error small">{err}</div>}<h4>Active marketplace listings</h4>
  <div className="admin-users">{data.active.map(item=><div className="admin-user" key={item.id}><span className="stat-ic">{item.gift.type.emoji}</span><div className="au-main"><b>{item.gift.type.name}</b><small>@{item.seller} · {item.price.toLocaleString()} MSG · {shortDate(item.createdAt)}</small></div><div className="au-actions"><button className="danger" onClick={()=>remove(item)}>Remove</button></div></div>)}{!data.active.length&&<div className="muted">No active listings</div>}</div></>;
}
export function AdminPanel() {
  const { setModal } = useApp();
  const [tab, setTab] = useState('overview');
  const tabs = [['overview', '📊 Overview'], ['users', '👥 Users'], ['chats', '💬 Chats'], ['gifts', '🎁 Gifts'], ['market', 'M Market & MSG'], ['reports', '🚩 Reports'], ['settings', '⚙️ Access'], ['announce', '📣 Announce & log']];
  return (
    <Modal title="🛡 Admin panel" onClose={() => setModal(null)} wide>
      <div className="admin-tabs" role="tablist">
        {tabs.map(([k, n]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{n}</button>)}
      </div>
      <div className="admin-body" key={tab}>
        {tab === 'overview' && <Overview />}
        {tab === 'users' && <Users />}
        {tab === 'chats' && <ChatsTab />}
        {tab === 'gifts' && <GiftsTab />}
        {tab === 'market' && <MarketAdmin />}
        {tab === 'reports' && <ReportsTab />}
        {tab === 'settings' && <SettingsTab />}
        {tab === 'announce' && <Announce />}
      </div>
    </Modal>
  );
}
