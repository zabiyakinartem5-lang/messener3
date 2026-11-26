import React, { useState, useRef, useEffect } from 'react';
import { api, upload } from './api.js';
import { useApp } from './ctx.js';
import { Avatar, Switch, Collection, CoverDeco, GiftCard, LevelBadge, LevelBar } from './ui.jsx';
import { beep, burst } from './fx.js';
import { ACCENTS, SKINS, WALLPAPERS, DEFAULTS, getCustomWallpaper, setCustomWallpaper, clearCustomWallpaper } from './theme.js';
import { keptCount, clearKept } from './kept.js';
import { EmojiPicker } from './emoji.jsx';
import { COVERS, PATTERN_EMOJI, TEMPLATES, coverStyle } from './cover.js';

/* ---------- small building blocks ---------- */
function Header({ title, onBack }) {
  return (
    <div className="s-head">
      <button className="icon-btn" onClick={onBack} aria-label="Back">←</button>
      <h2>{title}</h2>
    </div>
  );
}
function Row({ icon, label, value, onClick, danger }) {
  return (
    <button className={'s-row' + (danger ? ' danger-row' : '')} onClick={onClick}>
      <span className="s-ic">{icon}</span>
      <span className="s-label">{label}</span>
      {value && <span className="s-val">{value}</span>}
    </button>
  );
}
function Toggle({ label, hint, checked, onChange }) {
  return (
    <div className="s-toggle">
      <div><div>{label}</div>{hint && <small className="muted">{hint}</small>}</div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}
function Segmented({ value, options, onChange, label }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={value === o.id} className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>{o.name}</button>
      ))}
    </div>
  );
}

// Center-crop to a square and shrink, so avatars stay small and fast.
async function squareResize(file, size) {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  canvas.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not read image'))), 'image/jpeg', 0.88));
}

// Shrink a picked photo so it fits comfortably in browser storage.
async function makeWallpaper(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.82);
}

/* ---------- pages ---------- */
function AccountPage({ back }) {
  const { me, setMe, toast } = useApp();
  const [f, setF] = useState({ displayName: me.displayName, username: me.username, bio: me.bio });
  const [pw, setPw] = useState({ current: '', next: '', again: '' });
  const [err, setErr] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [busy, setBusy] = useState(false);
  const fileIn = useRef(null);

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setErr('Choose an image file'); return; }
    setBusy(true); setErr('');
    try {
      const blob = await squareResize(file, 256);
      const up = await upload(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
      setMe(await api('PATCH', '/me', { avatarFileId: up.id }));
      toast('Profile photo updated');
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }
  async function removePhoto() {
    try { setMe(await api('PATCH', '/me', { avatarFileId: null })); toast('Photo removed'); } catch (x) { setErr(x.message); }
  }
  async function save() {
    setBusy(true); setErr('');
    try { setMe(await api('PATCH', '/me', f)); toast('Profile saved'); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }
  async function changePassword() {
    setPwErr('');
    if (pw.next !== pw.again) { setPwErr('New passwords do not match'); return; }
    try {
      await api('POST', '/me/password', { current: pw.current, next: pw.next });
      setPw({ current: '', next: '', again: '' });
      toast('Password changed. Other devices were signed out.');
    } catch (x) { setPwErr(x.message); }
  }
  const dirty = f.displayName !== me.displayName || f.username !== me.username || f.bio !== me.bio;

  return (
    <>
      <Header title="My Account" onBack={back} />
      <div className="s-body">
        <div className="avatar-edit">
          <button className="avatar-pick" onClick={() => fileIn.current.click()} aria-label="Change profile photo" disabled={busy}>
            <Avatar name={me.displayName} color={me.color} size={110} src={me.avatar} />
            <span className="cam">📷</span>
          </button>
          <input ref={fileIn} type="file" accept="image/*" hidden onChange={pick} />
          <div className="row center-row">
            <button className="link inline" onClick={() => fileIn.current.click()}>Set new photo</button>
            {me.avatar && <button className="link inline danger-link" onClick={removePhoto}>Remove</button>}
          </div>
        </div>
        <label>Name<input value={f.displayName} maxLength={40} onChange={(e) => setF({ ...f, displayName: e.target.value })} /></label>
        <label>Username<input value={f.username} maxLength={24} onChange={(e) => setF({ ...f, username: e.target.value })} /></label>
        <small className="muted">People can find you by @{f.username || 'username'}. Use a–z, 0–9 and underscore.</small>
        <label>Bio<input value={f.bio} maxLength={200} onChange={(e) => setF({ ...f, bio: e.target.value })} placeholder="A few words about you" /></label>
        {err && <div className="error small" role="alert">{err}</div>}
        <button className="primary" onClick={save} disabled={busy || !dirty}>Save changes</button>

        <h4>Change password</h4>
        <label>Current password<input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></label>
        <label>New password<input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} placeholder="At least 8 characters" /></label>
        <label>Repeat new password<input type="password" autoComplete="new-password" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} /></label>
        {pwErr && <div className="error small" role="alert">{pwErr}</div>}
        <button className="primary" onClick={changePassword} disabled={!pw.current || !pw.next}>Change password</button>
      </div>
    </>
  );
}


/* ---------- profile look: status emoji, background, music ---------- */
async function coverResize(file) {
  const bmp = await createImageBitmap(file);
  const W = 960, H = 400;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const k = Math.max(W / bmp.width, H / bmp.height);
  c.getContext('2d').drawImage(bmp, (W - bmp.width * k) / 2, (H - bmp.height * k) / 2, bmp.width * k, bmp.height * k);
  return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
}

function ProfileLookPage({ back }) {
  const { me, setMe, toast } = useApp();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState(null); // 'status' | null
  const [title, setTitle] = useState(me.music?.title || '');
  const photoIn = useRef(null);
  const musicIn = useRef(null);
  const cover = me.cover || {};

  async function patch(body, msg) {
    setErr(''); setBusy(true);
    try { setMe(await api('PATCH', '/me', body)); if (msg) toast(msg); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }
  const setCover = (c) => patch({ cover: c && (c.g != null || c.e || c.f || c.gifts?.length) ? c : null });
  async function uploadCover(e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setErr('Choose an image file'); return; }
    setBusy(true); setErr('');
    try {
      const blob = await coverResize(file);
      const up = await upload(new File([blob], 'cover.jpg', { type: 'image/jpeg' }));
      setMe(await api('PATCH', '/me', { cover: { f: up.id, e: cover.e || undefined } })); toast('Background updated');
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }
  async function uploadMusic(e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('audio/')) { setErr('Choose an audio file (mp3, ogg, m4a, wav)'); return; }
    setBusy(true); setErr('');
    try {
      const up = await upload(file);
      const t = title.trim() || file.name.replace(/\.[^.]+$/, '');
      setMe(await api('PATCH', '/me', { music: { fileId: up.id, title: t } })); setTitle(t); toast('Profile music set');
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }
  // keep the other parts of the cover when one part changes (a photo replaces the gradient)
  const cur = { g: cover.g ?? undefined, e: cover.e || undefined, f: undefined, gifts: cover.giftIds?.length ? cover.giftIds : undefined };
  const [owned, setOwned] = useState([]);
  useEffect(() => { api('GET', `/users/${me.id}/gifts`).then(setOwned).catch(() => {}); }, [me.id]);
  const pinned = cover.giftIds || [];
  function togglePin(id) {
    const next = pinned.includes(id) ? pinned.filter((x) => x !== id) : [...pinned, id];
    if (next.length > 3) { setErr('You can pin up to 3 gifts'); return; }
    patch({ cover: { g: cover.g ?? undefined, e: cover.e || undefined, f: cover.f, gifts: next.length ? next : undefined } });
  }

  return (
    <>
      <Header title="Profile look" onBack={back} />
      <div className="s-body">
        <div className={'cover-preview has-cover'} style={coverStyle(me.cover) } aria-label="Preview">
          <CoverDeco cover={me.cover} />
          <Avatar name={me.displayName} color={me.color} size={64} src={me.avatar} />
          <div><b>{me.displayName}{me.statusEmoji && <span className="status-emoji big">{me.statusEmoji}</span>}</b><small>@{me.username}</small></div>
        </div>
        {err && <div className="error small" role="alert">{err}</div>}

        <h4>Status emoji</h4>
        <small className="muted">Shown next to your name in chats and on your profile.</small>
        <div className="row">
          <button className="primary small" data-emoji-toggle onClick={() => setPick(pick ? null : 'status')}>{me.statusEmoji ? me.statusEmoji + ' Change' : '😊 Choose'}</button>
          {me.statusEmoji && <button className="primary small ghosty" onClick={() => patch({ statusEmoji: '' }, 'Status removed')}>Remove</button>}
        </div>
        <h4>Name colour</h4>
        <div className="name-colors">
          {['', '#ff5d73', '#ff9a3c', '#f2c230', '#3fb96b', '#2fc4b2', '#3b9bff', '#7c6cff', '#d35cff', '#ff6fb5'].map((c) => (
            <button key={c || 'none'} className={'nc' + ((me.nameColor || '') === c ? ' on' : '')} style={c ? { background: c } : undefined} aria-label={c ? 'Colour ' + c : 'Default colour'} onClick={() => patch({ nameColor: c }, 'Name colour saved')}>{c ? '' : '∅'}</button>
          ))}
          <input type="color" aria-label="Custom colour" value={me.nameColor || '#3b9bff'} onChange={(e) => patch({ nameColor: e.target.value }, 'Name colour saved')} />
        </div>
        <div className="name-preview" style={me.nameColor ? { color: me.nameColor } : undefined}>{me.displayName}</div>
        {pick === 'status' && <div className="emoji-inline"><EmojiPicker keepOpen={false} onClose={() => setPick(null)} onPick={(e) => patch({ statusEmoji: e }, 'Status set')} /></div>}

        <h4>Templates</h4>
        <div className="tpl-grid">
          {TEMPLATES.map((t) => (
            <button key={t.name} className={!cover.url && cover.g === t.g && cover.e === t.e ? 'on' : ''} style={coverStyle({ g: t.g, e: t.e })} onClick={() => setCover({ ...cur, url: undefined, g: t.g, e: t.e })}>
              <span>{t.name}</span>
            </button>
          ))}
        </div>

        <h4>Background</h4>
        <div className="cover-grid" role="radiogroup" aria-label="Background colour">
          {COVERS.map((g, i) => (
            <button key={i} role="radio" aria-checked={!cover.url && cover.g === i} aria-label={'Background ' + (i + 1)} className={!cover.url && cover.g === i ? 'on' : ''} style={{ background: g }} onClick={() => setCover({ ...cur, g: i })} />
          ))}
        </div>
        <small className="muted">Pattern on top of the background</small>
        <div className="pattern-row">
          <button className={!cover.e ? 'on' : ''} onClick={() => setCover({ ...cur, e: undefined })}>None</button>
          {PATTERN_EMOJI.map((e) => <button key={e} className={cover.e === e ? 'on' : ''} aria-label={'Pattern ' + e} onClick={() => setCover({ ...cur, g: cover.g ?? (cur.gifts ? undefined : 0), e })}>{e}</button>)}
        </div>
        <div className="row">
          <button className="primary small" onClick={() => photoIn.current.click()} disabled={busy}>📷 Use my photo</button>
          {(me.cover) && <button className="primary small ghosty" onClick={() => setCover(null)}>Reset background</button>}
        </div>
        <input ref={photoIn} type="file" accept="image/*" hidden onChange={uploadCover} />

        <h4>Gifts on the background</h4>
        <small className="muted">Pin up to 3 of your gifts. The first one sets the colours and pattern (collectibles bring their own backdrop). Choosing a colour above overrides the gift colours.</small>
        <div className="pin-grid">
          {owned.map((g) => (
            <button key={g.id} className={pinned.includes(g.id) ? 'on' : ''} aria-pressed={pinned.includes(g.id)} aria-label={'Pin ' + g.type.name} onClick={() => togglePin(g.id)}>
              <GiftCard gift={g} />{pinned.includes(g.id) && <span className="pin-n">{pinned.indexOf(g.id) + 1}</span>}
            </button>
          ))}
          {!owned.length && <div className="muted small">You have no gifts yet. Buy one for yourself from your profile.</div>}
        </div>

        <h4>Profile music</h4>
        <small className="muted">An audio file (up to 25 MB). Anyone who opens your profile can press play.</small>
        <label>Title<input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Song name" /></label>
        <div className="row">
          <button className="primary small" onClick={() => musicIn.current.click()} disabled={busy}>🎵 {me.music ? 'Replace music' : 'Choose audio file'}</button>
          {me.music && <button className="primary small ghosty" onClick={() => { setTitle(''); patch({ music: null }, 'Music removed'); }}>Remove</button>}
        </div>
        <input ref={musicIn} type="file" accept="audio/*" hidden onChange={uploadMusic} />
        {me.music && <div className="muted small">Current: {me.music.title}</div>}
      </div>
    </>
  );
}

/* ---------- AI assistant ---------- */
function AIPage({ back }) {
  const { me, setMe, toast, openChat, closeSettings } = useApp();
  const [st, setSt] = useState(null);
  const [prompt, setPrompt] = useState(me.aiPrompt || '');
  const [model, setModel] = useState(me.aiModel || '');
  const [err, setErr] = useState('');
  const load = () => api('GET', '/ai/status').then(setSt).catch((x) => setErr(x.message));
  useEffect(() => { load(); }, []);
  async function save() {
    setErr('');
    try { setMe(await api('PATCH', '/me', { aiPrompt: prompt, aiModel: model.trim() })); toast('Assistant settings saved'); load(); } catch (x) { setErr(x.message); }
  }
  const dirty = prompt !== (me.aiPrompt || '') || model.trim() !== (me.aiModel || '');
  return (
    <>
      <Header title="Assistant" onBack={back} />
      <div className="s-body">
        <div className={'ai-status ' + (st ? (st.online ? 'ok' : 'off') : '')}>
          <b>{!st ? 'Checking…' : st.online ? '● Model is online' : '○ Model is offline'}</b>
          {st && <small>{st.online ? `Using ${st.model}${st.modelInstalled ? '' : ' (not installed yet)'}` : 'Start Ollama (ollama.com), then run: ollama pull ' + st.defaultModel}</small>}
        </div>
        <p className="muted small">The assistant runs on a model on your own computer (Ollama or any OpenAI-compatible server). It is free and has no message limits. How it answers depends on the model you choose; this app does not filter its answers.</p>
        <button className="primary" onClick={async () => { const r = st || (await api('GET', '/ai/status')); closeSettings(); openChat(r.chatId); }}>Open chat with the assistant</button>
        <label>Model
          <input list="ai-models" value={model} onChange={(e) => setModel(e.target.value)} placeholder={st ? 'Default: ' + st.defaultModel : 'Default'} />
        </label>
        <datalist id="ai-models">{(st?.models || []).map((m) => <option key={m} value={m} />)}</datalist>
        <label>Custom instructions
          <textarea className="ai-prompt" rows={5} maxLength={1000} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="For example: answer briefly, always reply in Russian, act as a coding tutor…" />
        </label>
        <small className="muted">{prompt.length}/1000 · sent to the model with every question</small>
        {err && <div className="error small" role="alert">{err}</div>}
        <button className="primary" onClick={save} disabled={!dirty}>Save</button>
        <h4>Conversation</h4>
        <button className="primary ghosty" onClick={async () => { if (confirm('Delete the whole conversation with the assistant?')) { await api('POST', '/ai/clear'); toast('Conversation cleared'); } }}>Clear conversation</button>
      </div>
    </>
  );
}

function WinterModeToggle() {
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem('messenger-winter-mode') === 'on'; } catch { return false; }
  });
  useEffect(() => {
    document.documentElement.dataset.winter = enabled ? 'on' : 'off';
    try { localStorage.setItem('messenger-winter-mode', enabled ? 'on' : 'off'); } catch {}
    window.dispatchEvent(new Event('winter-mode-change'));
  }, [enabled]);
  return (
    <div className="s-toggle winter-toggle">
      <div>
        <div className="winter-label">🎄 Уютный новогодний режим</div>
        <small className="muted winter-hint">Снег, тёплые огоньки и зимняя атмосфера. Настройка действует только у тебя.</small>
      </div>
      <Switch checked={enabled} onChange={setEnabled} label="Уютный новогодний режим" />
    </div>
  );
}

function AppearancePage({ back }) {
  const { settings, updateSettings, toast } = useApp();
  const s = settings;
  const [custom, setCustom] = useState(getCustomWallpaper);
  const wpIn = useRef(null);
  async function pickWallpaper(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('Choose an image file'); return; }
    try {
      const url = await makeWallpaper(file);
      if (!setCustomWallpaper(url)) { toast('This image is too big for browser storage. Try a smaller one.'); return; }
      setCustom(url);
      updateSettings({ wallpaper: 'custom', wpRev: Date.now() });
    } catch { toast('Could not read that image'); }
  }
  function removeCustom() {
    clearCustomWallpaper(); setCustom(null);
    updateSettings({ wallpaper: 'classic', wpRev: Date.now() });
  }
  return (
    <>
      <Header title="Appearance" onBack={back} />
      <div className="s-body">
        <div className="preview" aria-label="Preview">
          <div className="msg-row"><div className="bubble"><div className="text">Good morning! 👋</div><div className="meta"><span>9:41</span></div></div></div>
          <div className="msg-row mine"><div className="bubble"><div className="text">Theme, accent colour, wallpaper and text size change live.</div><div className="meta"><span>9:42</span><span className="ticks read">✓✓</span></div></div></div>
        </div>
        <h4>Seasonal mode</h4>
        <WinterModeToggle />

        <h4>Color theme</h4>
        <Segmented label="Color theme" value={s.theme} onChange={(theme) => updateSettings({ theme })}
          options={[{ id: 'light', name: '☀️ Light' }, { id: 'dark', name: '🌙 Dark' }, { id: 'system', name: '🖥 System' }]} />

        <h4>Style</h4>
        <div className="skin-grid" role="radiogroup" aria-label="Style">
          {SKINS.map((k) => (
            <button key={k.id} role="radio" aria-checked={s.skin === k.id} className={'skin' + (s.skin === k.id ? ' on' : '')} onClick={() => updateSettings({ skin: k.id })}>
              <i style={{ background: `linear-gradient(135deg, ${k.a} 50%, ${k.b} 50%)` }} /><span>{k.name}</span>
            </button>
          ))}
        </div>
        <small className="muted">Styles recolour the dark theme.</small>
        <Toggle label="Gradient bubbles" hint="Your messages get a soft accent gradient" checked={s.gradBubbles} onChange={(gradBubbles) => updateSettings({ gradBubbles })} />

        <h4>Personal look</h4>
        <small className="muted">Font</small>
        <Segmented label="Font" value={s.font} onChange={(font) => updateSettings({ font })}
          options={[{ id: 'inter', name: 'Sans' }, { id: 'serif', name: 'Serif' }, { id: 'round', name: 'Rounded' }, { id: 'mono', name: 'Mono' }]} />
        <small className="muted">Corners</small>
        <Segmented label="Corners" value={s.corners} onChange={(corners) => updateSettings({ corners })}
          options={[{ id: 'sharp', name: 'Sharp' }, { id: 'normal', name: 'Soft' }, { id: 'round', name: 'Pill' }]} />
        <small className="muted">Density</small>
        <Segmented label="Density" value={s.density} onChange={(density) => updateSettings({ density })}
          options={[{ id: 'compact', name: 'Compact' }, { id: 'cozy', name: 'Cozy' }, { id: 'airy', name: 'Airy' }]} />
        <Toggle label="Greeting on the home screen" hint="“Good evening, Name” when no chat is open" checked={s.greeting !== false} onChange={(greeting) => updateSettings({ greeting })} />

        <h4>Accent color</h4>
        <div className="swatches" role="radiogroup" aria-label="Accent color">
          {ACCENTS.map((a) => (
            <button key={a.id} role="radio" aria-checked={s.accent === a.id} aria-label={a.name} className={'swatch' + (s.accent === a.id ? ' on' : '')} style={{ background: a.id }} onClick={() => updateSettings({ accent: a.id })}>
              {s.accent === a.id ? '✓' : ''}
            </button>
          ))}
        </div>

        <h4>Chat wallpaper</h4>
        <div className="swatches wp" role="radiogroup" aria-label="Chat wallpaper">
          {WALLPAPERS.map((w) => (
            <button key={w.id} role="radio" aria-checked={s.wallpaper === w.id} aria-label={w.name} className={'swatch wallp' + (s.wallpaper === w.id ? ' on' : '')} style={{ background: document.documentElement.dataset.theme === 'dark' ? w.dark : w.light }} onClick={() => updateSettings({ wallpaper: w.id })}>
              <span>{w.name}</span>
            </button>
          ))}
        </div>
        <input ref={wpIn} type="file" accept="image/*" hidden onChange={pickWallpaper} aria-label="Wallpaper image" />
        <div className="swatches wp">
          <button className="swatch wallp upload" onClick={() => wpIn.current.click()} aria-label="Upload your own wallpaper"><span>＋ Your photo</span></button>
          {custom && (
            <button role="radio" aria-checked={s.wallpaper === 'custom'} aria-label="Custom wallpaper" className={'swatch wallp' + (s.wallpaper === 'custom' ? ' on' : '')}
              style={{ backgroundImage: `url("${custom}")`, backgroundSize: 'cover', backgroundPosition: 'center' }} onClick={() => updateSettings({ wallpaper: 'custom' })}>
              <span>Custom</span>
            </button>
          )}
        </div>
        {s.wallpaper === 'custom' && custom && (
          <>
            <h4>Wallpaper dimming <span className="muted">{s.wpDim}%</span></h4>
            <input className="range" type="range" min={0} max={70} step={5} value={s.wpDim} aria-label="Wallpaper dimming" onChange={(e) => updateSettings({ wpDim: Number(e.target.value) })} />
            <button className="link inline danger-link" onClick={removeCustom}>Remove custom wallpaper</button>
          </>
        )}
        <Toggle label="Dotted pattern" checked={s.pattern} onChange={(pattern) => updateSettings({ pattern })} />

        <h4>Message text size <span className="muted">{s.fontScale}%</span></h4>
        <input className="range" type="range" min={80} max={140} step={5} value={s.fontScale} aria-label="Message text size" onChange={(e) => updateSettings({ fontScale: Number(e.target.value) })} />
        <h4>Message corners <span className="muted">{s.radius}px</span></h4>
        <input className="range" type="range" min={4} max={22} step={1} value={s.radius} aria-label="Message corner radius" onChange={(e) => updateSettings({ radius: Number(e.target.value) })} />

        <h4>Effects</h4>
        <Toggle label="Animations" hint="Message, gift and screen transitions" checked={s.motion} onChange={(motion) => updateSettings({ motion })} />
        <Toggle label="Large emoji" hint="Show messages that are only emoji big, with a pop animation" checked={s.bigEmoji} onChange={(bigEmoji) => updateSettings({ bigEmoji })} />
        <button className="link" onClick={() => { clearCustomWallpaper(); setCustom(null); updateSettings({ ...DEFAULTS, sound: s.sound, notify: s.notify, keepDeleted: s.keepDeleted, wpRev: Date.now() }); }}>Reset appearance</button>
      </div>
    </>
  );
}

function NotificationsPage({ back }) {
  const { settings, updateSettings, toast } = useApp();
  async function setNotify(on) {
    if (!on) { updateSettings({ notify: false }); return; }
    if (!('Notification' in window)) { toast('This browser does not support notifications'); return; }
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm === 'granted') updateSettings({ notify: true });
    else toast('Notifications are blocked in your browser settings');
  }
  return (
    <>
      <Header title="Notifications and Sounds" onBack={back} />
      <div className="s-body">
        <Toggle label="Message sounds" hint="Play a sound for new messages in other chats" checked={settings.sound} onChange={(sound) => updateSettings({ sound })} />
        <button className="link" onClick={beep}>▶ Play test sound</button>
        <Toggle label="Desktop notifications" hint="Show a notification when this tab is in the background" checked={settings.notify} onChange={setNotify} />
      </div>
    </>
  );
}

function PrivacyPage({ back }) {
  const { me, setMe, toast, settings, updateSettings } = useApp();
  const [kept, setKept] = useState(() => keptCount(me.id));
  async function patch(body, msg) {
    try { setMe(await api('PATCH', '/me', body)); toast(msg); } catch (x) { toast(x.message); }
  }
  return (
    <>
      <Header title="Privacy" onBack={back} />
      <div className="s-body">
        <div className={'ghost-card' + (me.ghost ? ' on' : '')}>
          <div className="ghost-ic" aria-hidden="true">👻</div>
          <div className="grow">
            <b>Ghost mode</b>
            <small className="muted">Read quietly. While it is on:</small>
            <ul>
              <li>people can't see you online or your last seen</li>
              <li>your “typing…” is never shown</li>
              <li>opening chats doesn't mark messages as read for the sender</li>
            </ul>
            <small className="muted">Sending a message still shows you have read everything up to it.</small>
          </div>
          <Switch checked={!!me.ghost} onChange={(ghost) => patch({ ghost }, ghost ? 'Ghost mode on 👻' : 'Ghost mode off')} label="Ghost mode" />
        </div>

        <h4>Last seen & online</h4>
        <Segmented label="Who can see when you were online" value={me.hideSeen || me.ghost ? 'nobody' : 'everybody'} onChange={(v) => patch({ hideSeen: v === 'nobody' }, v === 'nobody' ? 'Last seen hidden' : 'Last seen visible')}
          options={[{ id: 'everybody', name: 'Everybody' }, { id: 'nobody', name: 'Nobody' }]} />
        <p className="muted">{me.ghost ? 'Ghost mode keeps this hidden while it is on.' : 'If you choose Nobody, others will see “last seen recently” instead of your online status.'}</p>

        <h4>Deleted messages</h4>
        <Toggle label="Keep deleted messages" hint="When someone deletes a message you already received, keep your copy on this device, marked “deleted by sender”. Attachments are removed from the server and can't be kept." checked={settings.keepDeleted} onChange={(keepDeleted) => updateSettings({ keepDeleted })} />
        <p className="muted">Only messages that were open in this app when they were deleted are saved. {kept} saved on this device.</p>
        {kept > 0 && <button className="link inline danger-link" onClick={() => { if (confirm('Delete all saved copies from this device?')) { clearKept(me.id); setKept(0); toast('Saved copies cleared'); } }}>Clear saved copies</button>}
      </div>
    </>
  );
}

function ContactsPage({ back }) {
  const { contacts, addContact, removeContact, openPrivate, closeSettings } = useApp();
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  useEffect(() => {
    if (!q.trim()) { setFound([]); return; }
    const id = setTimeout(() => api('GET', '/search?q=' + encodeURIComponent(q.trim())).then((r) => setFound(r.users)).catch(() => {}), 200);
    return () => clearTimeout(id);
  }, [q]);
  const message = async (u) => { await openPrivate(u.id); closeSettings(); };
  const inContacts = (id) => contacts.some((c) => c.id === id);
  return (
    <>
      <Header title="Contacts" onBack={back} />
      <div className="s-body">
        <input className="search wide" placeholder="Find people by name or @username" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find people" />
        {q.trim() && (
          <div className="contact-results">
            {found.length === 0 && <div className="muted pad">Nobody found</div>}
            {found.map((u) => (
              <div className="contact-row" key={u.id}>
                <Avatar name={u.displayName} color={u.color} src={u.avatar} size={42} />
                <div className="grow"><b>{u.displayName}</b><small className="muted">@{u.username}</small></div>
                {inContacts(u.id)
                  ? <span className="muted">✓ Added</span>
                  : <button className="primary small" onClick={() => addContact(u.id)} aria-label={'Add ' + u.displayName}>➕ Add</button>}
              </div>
            ))}
          </div>
        )}
        <h4>My contacts <span className="muted">{contacts.length}</span></h4>
        {contacts.length === 0 && <p className="muted">No contacts yet. Search above and tap Add.</p>}
        {contacts.map((u) => (
          <div className="contact-row" key={u.id}>
            <button className="contact-main" onClick={() => message(u)} aria-label={'Message ' + u.displayName}>
              <Avatar name={u.displayName} color={u.color} src={u.avatar} size={42} />
              <span><b>{u.displayName}</b><small className="muted">{u.online ? 'online' : '@' + u.username}</small></span>
            </button>
            <button className="icon-btn" onClick={() => removeContact(u.id)} aria-label={'Remove ' + u.displayName} title="Remove from contacts">✕</button>
          </div>
        ))}
      </div>
    </>
  );
}

function fmtLeft(ms) {
  const m = Math.max(0, Math.ceil(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

function RewardsPage({ back }) {
  const { me, setMe, toast } = useApp();
  const [w, setW] = useState(null);
  const [ach, setAch] = useState(null);
  const [rot, setRot] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [won, setWon] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [err, setErr] = useState('');
  useEffect(() => { api('GET', '/wheel').then(setW).catch((e) => setErr(e.message)); api('GET', '/achievements').then(setAch).catch(() => {}); }, []);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id); }, []);
  async function spin() {
    if (spinning) return;
    setErr(''); setWon(null); setSpinning(true);
    try {
      const r = await api('POST', '/wheel/spin');
      const n = w.segments.length, seg = 360 / n;
      const target = 360 * 6 - (r.index + 0.5) * seg;
      setRot((cur) => cur + (target - (cur % 360) + 360) % 360 + 360 * 5);
      setTimeout(() => {
        setSpinning(false); setW(r.wheel); setMe(r.me); setWon(r.prize);
        burst([r.prize.emoji, '✨', '⭐', '🎉'], r.prize.id === 's1000' || r.prize.id === 'prem' ? 60 : 26);
        api('GET', '/achievements').then(setAch).catch(() => {});
      }, 5200);
    } catch (e) { setErr(e.message); setSpinning(false); api('GET', '/wheel').then(setW).catch(() => {}); }
  }
  async function claim(a) {
    try { const r = await api('POST', `/achievements/${a.id}/claim`); setAch(r.list); setMe(r.me); toast(`${a.emoji} +${a.reward} Stars`); burst([a.emoji, '⭐'], 18); }
    catch (e) { toast(e.message); }
  }
  const can = w && now >= w.nextAt;
  const ready = ach ? ach.filter((a) => a.done && !a.claimed).length : 0;
  return (
    <>
      <Header title="Rewards" onBack={back} />
      <div className="s-body">
        <div className="wheel-box">
          <div className="wheel-pointer" aria-hidden="true">▼</div>
          <div className="wheel" style={{ transform: `rotate(${rot}deg)`, transition: spinning ? 'transform 5s cubic-bezier(.12,.72,.1,1)' : 'none' }} role="img" aria-label="Lucky wheel">
            {w?.segments.map((sg, i) => (
              <span key={sg.id} className="wheel-seg" style={{ transform: `rotate(${(i + 0.5) * (360 / w.segments.length)}deg)` }}><b>{sg.emoji}</b><small>{sg.label}</small></span>
            ))}
            <i className="wheel-hub">🎡</i>
          </div>
        </div>
        {err && <div className="error small" role="alert">{err}</div>}
        {won && <div className="wheel-won" role="status">You won <b>{won.emoji} {typeof won.label === 'string' && /^\d+$/.test(won.label) ? won.label + ' Stars' : won.label}</b>!{won.giftId ? ' It is in your collection.' : ''}</div>}
        <button className="primary" onClick={spin} disabled={!w || !can || spinning}>
          {spinning ? 'Spinning…' : !w ? '…' : can ? '🎡 Spin the wheel' : `Recharging · ${fmtLeft(w.nextAt - now)}`}
        </button>
        <p className="muted small">One free spin every {w ? w.cooldownHours : 20} hours{me.premiumUntil > Date.now() ? ' (Premium: faster)' : ' — Premium halves the wait'}. Prizes: Stars, a free gift, a day of Premium, up to 💎 1000.</p>

        <h4>Achievements {ready > 0 && <span className="ready-pill">{ready} to claim</span>}</h4>
        <div className="ach-list">
          {ach?.map((a) => (
            <div key={a.id} className={'ach' + (a.done ? ' done' : '') + (a.claimed ? ' claimed' : '')}>
              <span className="ach-ic" aria-hidden="true">{a.emoji}</span>
              <div className="ach-main">
                <b>{a.title}</b><small>{a.desc}</small>
                <div className="lvl-track"><i style={{ width: Math.round((a.have / a.need) * 100) + '%' }} /></div>
                <small className="muted">{a.have} / {a.need}</small>
              </div>
              {a.claimed ? <span className="ach-got">✓</span> : <button className="primary small" disabled={!a.done} onClick={() => claim(a)}>+{a.reward} ⭐</button>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function PremiumPage({ back }) {
  const { me, setMe, toast } = useApp();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const P = me.premiumPerks;
  const active = me.premiumUntil > Date.now();
  const left = Math.max(0, Math.ceil((me.premiumUntil - Date.now()) / 86400000));
  async function buy() {
    setBusy(true); setErr('');
    try { setMe(await api('POST', '/premium')); toast('✨ Premium ' + (active ? 'extended' : 'activated') + '!'); } catch (x) { setErr(x.message); }
    setBusy(false);
  }
  return (
    <>
      <Header title="Premium" onBack={back} />
      <div className="s-body">
        <div className={'prem-hero' + (active ? ' on' : '')}>
          <div className="prem-star">✨</div>
          <h3>{active ? 'Premium is active' : 'Messenger Premium'}</h3>
          <p>{active ? `${left} day${left === 1 ? '' : 's'} left (until ${new Date(me.premiumUntil).toLocaleDateString()})` : `⭐ ${P.price} for ${P.days} days, paid with Stars`}</p>
        </div>
        <ul className="perks">
          <li><b>✨ Badge</b><span>A sparkle next to your name on your profile</span></li>
          <li><b>⭐ Daily bonus ×{P.dailyMultiplier}</b><span>Claim {active ? me.dailyBonus : me.dailyBonus * P.dailyMultiplier} Stars every day</span></li>
          <li><b>🎁 −{P.discountPct}% on gifts</b><span>Lower prices in the gift shop</span></li>
          <li><b>📌 {P.pins} pinned gifts</b><span>Show off more collectibles on your profile background (3 without Premium)</span></li>
        </ul>
        {err && <div className="error small" role="alert">{err}</div>}
        <button className="primary" onClick={buy} disabled={busy || me.stars < P.price}>
          {me.stars < P.price ? `Not enough Stars (⭐ ${P.price})` : active ? `Extend by ${P.days} days · ⭐ ${P.price}` : `Subscribe · ⭐ ${P.price}`}
        </button>
        <p className="muted small">Virtual Stars only — no real money. Renewal is manual: buy again to add {P.days} more days. When it ends you keep everything you own; only the perks pause.</p>
      </div>
    </>
  );
}

function GiftsPage({ back }) {
  const { me, setMe, toast, setModal, closeSettings } = useApp();
  const [err, setErr] = useState('');
  const canClaim = Date.now() >= me.lastDaily + 86400000;
  async function claim() {
    try { setMe(await api('POST', '/stars/daily')); toast('+' + me.dailyBonus + ' Stars'); } catch (x) { setErr(x.message); }
  }
  return (
    <>
      <Header title="Stars & Gifts" onBack={back} />
      <div className="s-body">
        <div className="wallet">
          <div><small>Balance</small><b>⭐ {me.stars}</b></div>
          <button className="primary small" onClick={claim} disabled={!canClaim}>{canClaim ? 'Claim daily +' + me.dailyBonus : 'Daily claimed'}</button>
        </div>
        {err && <div className="error small" role="alert">{err}</div>}
        <LevelBar me={me} />
        <button className="prem-banner" onClick={() => back('premium')}>{me.premiumUntil > Date.now() ? '✨ Premium active' : '✨ Get Premium'}<small>daily ×2 · −10% gifts · 5 pins</small></button>
        <p className="muted">Send gifts with the 🎁 button in any private chat, or buy one for yourself. Limited gifts can be upgraded into unique collectibles and transferred.</p>
        <button className="primary" onClick={() => setModal({ t: 'shop', self: true })}>🎁 Buy a gift for myself</button>
        <h4>My gifts</h4>
        <Collection userId={me.id} />
      </div>
    </>
  );
}

/* ---------- panel ---------- */
export function SettingsPanel() {
  const { me, closeSettings, logout, settingsStart, contacts } = useApp();
  const [page, setPage] = useState(settingsStart || 'main');
  const back = () => setPage('main');
  return (
    <aside className="sidebar settings" aria-label="Settings">
      <div className="s-page" key={page}>
        {page === 'account' && <AccountPage back={back} />}
        {page === 'appearance' && <AppearancePage back={back} />}
        {page === 'look' && <ProfileLookPage back={back} />}
        {page === 'ai' && <AIPage back={back} />}
        {page === 'notifications' && <NotificationsPage back={back} />}
        {page === 'privacy' && <PrivacyPage back={back} />}
        {page === 'contacts' && <ContactsPage back={back} />}
        {page === 'gifts' && <GiftsPage back={(p) => (typeof p === 'string' ? setPage(p) : back())} />}
        {page === 'premium' && <PremiumPage back={() => setPage('gifts')} />}
        {page === 'rewards' && <RewardsPage back={back} />}
        {page === 'main' && (
          <>
            <Header title="Settings" onBack={closeSettings} />
            <div className="s-body">
              <button className={'s-profile' + (me.cover ? ' has-cover' : '')} style={coverStyle(me.cover)} onClick={() => setPage('account')} aria-label="Edit profile">
                <CoverDeco cover={me.cover} />
                <Avatar name={me.displayName} color={me.color} size={84} src={me.avatar} />
                <div>
                  <h3>{me.displayName}{me.premiumUntil > Date.now() && <span className="prem-tag" title="Premium">✨</span>}{me.statusEmoji && <span className="status-emoji big">{me.statusEmoji}</span>}</h3>
                  <div className="muted">@{me.username}</div>
                  <LevelBadge level={{ n: me.levelInfo.n, title: me.levelInfo.title, icon: me.levelInfo.icon }} />
                  {me.bio && <div className="s-bio">{me.bio}</div>}
                </div>
              </button>
              <div className="s-list">
                <Row icon="👤" label="My Account" onClick={() => setPage('account')} />
                <Row icon="🤖" label="Assistant" onClick={() => setPage('ai')} />
                <Row icon="✨" label="Profile look (status, background, music)" onClick={() => setPage('look')} />
                <Row icon="👥" label="Contacts" value={contacts.length ? String(contacts.length) : ''} onClick={() => setPage('contacts')} />
                <Row icon="🎨" label="Appearance" onClick={() => setPage('appearance')} />
                <Row icon="🔔" label="Notifications and Sounds" onClick={() => setPage('notifications')} />
                <Row icon="🔒" label="Privacy" onClick={() => setPage('privacy')} />
                 <Row icon="🎡" label="Rewards" value="Wheel · Achievements" onClick={() => setPage('rewards')} />
                <Row icon="✨" label="Premium" value={me.premiumUntil > Date.now() ? 'Active' : ''} onClick={() => setPage('premium')} />
                <Row icon="⭐" label="Stars & Gifts" value={'⭐ ' + me.stars} onClick={() => setPage('gifts')} />
                <Row icon="↩" label="Log out" danger onClick={() => confirm('Log out of Messenger?') && logout()} />
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
