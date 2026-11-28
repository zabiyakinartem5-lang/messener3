import React, { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from 'react';
import QRCode from 'qrcode';
import { createRoot } from 'react-dom/client';
import { api, upload, getToken, setToken, timeOf, shortDate, dayLabel, lastSeen, fmtSize, preview } from './api.js';
import { Ctx, useApp } from './ctx.js';
import { Avatar, Modal, GiftCard, GRADS, TypingDots, Collection, CoverDeco, ModelStrip, LevelBadge, SpinCard, nameFor, giftRarity } from './ui.jsx';
import { SettingsPanel } from './settings.jsx';
import { burst, beep } from './fx.js';
import { loadKept, rememberKept, forgetKept } from './kept.js';
import { EmojiPicker } from './emoji.jsx';
import { AudioMessage, MiniPlayer, TrackRow } from './audio.jsx';
import { Markdown } from './md.jsx';
import { coverStyle } from './cover.js';
import { AdminPanel } from './admin.jsx';
import { loadSettings, saveSettings, applySettings } from './theme.js';

// product name comes from the server (APP_NAME), so the app can carry your own branding
const APP = { name: document.title || 'Messenger' };
function useAppConfig() {
  const [c, setC] = useState({ appName: APP.name, regMode: 'open' });
  useEffect(() => { fetch('/api/config').then((r) => r.json()).then((x) => { APP.name = x.appName; document.title = x.appName; setC(x); }).catch(() => {}); }, []);
  return c;
}
const chatColor = (c) => (c.peer ? c.peer.color : c.id);

/* ================================== Auth ================================== */
function Auth({ onAuth }) {
  const { appName, regMode, maintenance } = useAppConfig();
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ username: '', displayName: '', password: '', inviteCode: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const r = await api('POST', mode === 'login' ? '/login' : '/register', f);
      setToken(r.token);
      onAuth(r.user);
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }
  return (
    <div className="auth">
      <aside className="auth-hero" aria-hidden="true">
        <div className="hero-orbs"><i /><i /><i /></div>
        <h2>{appName}</h2>
        <p>Chat, collect and show off — all in one place.</p>
        <ul>
          <li><b>💬</b> Chats, groups and channels</li>
          <li><b>🧊</b> Collectible gifts with unique styles</li>
          <li><b>🤖</b> A built-in AI assistant</li>
          <li><b>🎨</b> Themes, profile looks and your own style</li>
        </ul>
      </aside>
      <form className="auth-card" onSubmit={submit}>
        <div className="logo">
          <svg viewBox="0 0 64 64" width="84" height="84" aria-hidden="true"><rect width="64" height="64" rx="18" fill="var(--accent, #3390ec)" /><path d="M17 44V22l15 15 15-15v22" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <h1>{mode === 'login' ? 'Sign in to ' + appName : 'Create your account'}</h1>
        <p className="muted">{mode === 'login' ? 'Enter your username and password.' : 'Pick a username so friends can find you.'}</p>
        <label>Username<input autoFocus value={f.username} onChange={set('username')} autoComplete="username" placeholder="e.g. alex_91" /></label>
        {mode === 'register' && <label>Display name<input value={f.displayName} onChange={set('displayName')} placeholder="Alex" /></label>}
        {mode === 'register' && regMode === 'invite' && <label>Invite code<input value={f.inviteCode} onChange={set('inviteCode')} autoComplete="off" placeholder="From the administrator" /></label>}
        <label>Password<input type="password" value={f.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder={mode === 'register' ? 'At least 8 characters' : ''} /></label>
        {maintenance && <div className="maint-banner" role="status">🛠 {maintenance}</div>}
        {err && <div className="error" role="alert">{err}</div>}
        <button className="primary" disabled={busy || !f.username || !f.password}>{busy ? '…' : mode === 'login' ? 'Sign in' : 'Sign up'}</button>
        {mode === 'login' && regMode === 'closed' ? <small className="muted">Registration is closed</small> : (
          <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr(''); }}>
            {mode === 'login' ? 'Create an account' : 'I already have an account'}
          </button>
        )}
      </form>
    </div>
  );
}

/* ================================ Sidebar ================================= */
function Greeting() {
  const { me, settings } = useApp();
  const h = new Date().getHours();
  const hello = h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const first = (me.displayName || '').split(' ')[0];
  return (
    <main className="main empty">
      <div className="greet" style={me.nameColor ? { '--gc': me.nameColor } : undefined}>
        <div className="greet-emoji" aria-hidden="true">{me.statusEmoji || '👋'}</div>
        <h2>{settings.greeting === false ? 'Select a chat' : <>{hello}, <span className="greet-name">{first}</span></>}</h2>
        <p>{me.bio ? '“' + me.bio + '”' : 'Pick a chat on the left to start messaging'}</p>
        <div className="greet-chips"><span>⭐ {me.stars}</span><span>{me.levelInfo.icon} Lv {me.levelInfo.n}</span>{me.premiumUntil > Date.now() && <span>✨ Premium</span>}</div>
      </div>
    </main>
  );
}

function ChatRow({ c, active, onClick, pinned, favorite, onTogglePin, onToggleFavorite, onMoveFolder }) {
  const { me, typing } = useApp();
  const m = c.lastMessage;
  const t = typing[c.id];
  let sub = preview(m);
  if (m && c.type !== 'private' && m.kind !== 'system' && !m.deleted) sub = (m.sender.id === me.id ? 'You' : m.sender.displayName.split(' ')[0]) + ': ' + sub;
  return (
    <div className="chat-row-wrap">
      <button className={'chat-row' + (active ? ' active' : '')} onClick={onClick}>
        <div className="av-wrap">
          <Avatar name={c.title || '?'} color={chatColor(c)} src={c.peer?.avatar} />
          {c.peer?.online && <span className="dot" />}
        </div>
        <div className="chat-main">
          <div className="chat-top">
            <span className="chat-title">{pinned && <span title="Pinned">📌 </span>}{favorite && <span title="Favorite">⭐ </span>}{c.type === 'channel' ? '📢 ' : c.type === 'group' ? '👥 ' : ''}{c.type === 'private' && c.peer ? nameFor(me, c.peer) : c.title}{c.peer?.isBot && <span className="bot-tag">bot</span>}{c.peer?.statusEmoji && <span className="status-emoji">{c.peer.statusEmoji}</span>}</span>
            <span className="chat-time">{m ? shortDate(m.createdAt) : ''}</span>
          </div>
          <div className="chat-bottom">
            <span className={'chat-sub' + (t ? ' typing' : '')}>{t ? <>{c.type === 'private' ? 'typing' : t.name + ' is typing'}<TypingDots /></> : sub}</span>
            {m && m.sender.id === me.id && c.type === 'private' && !t && <span className={'ticks' + (c.peerRead >= m.id ? ' read' : '')}>{c.peerRead >= m.id ? '✓✓' : '✓'}</span>}
            {c.unread > 0 && <span className="badge">{c.unread}</span>}
          </div>
        </div>
      </button>
      <button className={'chat-pin' + (pinned ? ' on' : '')} onClick={onTogglePin} title={pinned ? 'Unpin chat' : 'Pin chat'} aria-label={pinned ? 'Unpin chat' : 'Pin chat'}>{pinned ? '📌' : '＋'}</button>
      <button className={'chat-pin'+(favorite?' on':'')} onClick={onToggleFavorite} title={favorite?'Remove favorite':'Add to favorites'} aria-label="Favorite chat">{favorite?'⭐':'☆'}</button>
      <button className="chat-pin" onClick={onMoveFolder} title="Move to folder" aria-label="Move to folder">📁</button>
    </div>
  );
}

function SearchResults({ q, onOpenUser, onOpenChat }) {
  const [res, setRes] = useState({ users: [], chats: [] });
  useEffect(() => {
    const id = setTimeout(() => api('GET', '/search?q=' + encodeURIComponent(q)).then(setRes).catch(() => {}), 200);
    return () => clearTimeout(id);
  }, [q]);
  if (!res.users.length && !res.chats.length) return <div className="empty-note">Nothing found</div>;
  return (
    <div>
      {res.users.map((u) => (
        <button key={u.id} className="chat-row" onClick={() => onOpenUser(u)}>
          <Avatar name={u.displayName} color={u.color} src={u.avatar} />
          <div className="chat-main"><div className="chat-title">{u.displayName}</div><div className="chat-sub">@{u.username}</div></div>
        </button>
      ))}
      {res.chats.map((c) => (
        <button key={c.id} className="chat-row" onClick={() => onOpenChat(c)}>
          <Avatar name={c.title} color={c.id} />
          <div className="chat-main"><div className="chat-title">{c.type === 'channel' ? '📢 ' : '👥 '}{c.title}</div><div className="chat-sub">@{c.handle} · {c.membersCount} members</div></div>
        </button>
      ))}
    </div>
  );
}

function Sidebar() {
  const { chats, activeId, openChat, openPrivate, joinChat, me, setMe, toast, setModal, openSettings, chatPrefs, folders, setChatPreference, refreshChatPrefs, settings, updateSettings } = useApp();
  const toggleGhost = async () => {
    try { const u = await api('PATCH', '/me', { ghost: !me.ghost }); setMe(u); toast(u.ghost ? 'Ghost mode on 👻' : 'Ghost mode off'); } catch (e) { toast(e.message); }
  };
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState(false);
  const [filter, setFilter] = useState('all');
  const [pinned, setPinned] = useState(() => { try { return JSON.parse(localStorage.getItem('messenger-pinned-chats') || '[]'); } catch { return []; } });
  const togglePin = (id) => setPinned((prev) => {
    const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
    try { localStorage.setItem('messenger-pinned-chats', JSON.stringify(next)); } catch {}
    return next;
  });
  const FILTERS = [['all', 'All'], ['pinned', '📌 Pinned'], ['favorites','⭐ Favorites'], ['unread', 'Unread'], ['people', 'People'], ['groups', 'Groups'], ['channels', 'Channels'], ...folders.map(x=>['folder:'+x.id,'📁 '+x.name])];
  const matches = (c, f) => f === 'all' || (f === 'pinned' && pinned.includes(c.id)) || (f === 'favorites' && !!chatPrefs[c.id]?.favorite) || (f === 'unread' && c.unread > 0) || (f === 'people' && c.type === 'private') || (f === 'groups' && c.type === 'group') || (f === 'channels' && c.type === 'channel') || (f.startsWith('folder:') && String(chatPrefs[c.id]?.folderId)===f.slice(7));
  const shownChats = chats.filter((c) => matches(c, filter)).sort((a, b) => Number(pinned.includes(b.id)) - Number(pinned.includes(a.id)));
  return (
    <aside className="sidebar">
      <div className="side-head">
        <div className="menu-wrap">
          <button className="icon-btn" onClick={() => setMenu(!menu)} aria-label="Menu" aria-expanded={menu}>☰</button>
          {menu && (
            <>
              <div className="menu-backdrop" onClick={() => setMenu(false)} />
              <div className="menu">
                <button className="menu-profile" onClick={() => { setMenu(false); openSettings('account'); }}>
                  <Avatar name={me.displayName} color={me.color} src={me.avatar} size={44} />
                  <span><b>{me.displayName}</b><small>@{me.username}</small></span>
                </button>
                <button onClick={() => { setMenu(false); setModal({ t: 'user', id: me.id }); }}>👤 My profile</button>
                <button onClick={() => { setMenu(false); setModal({ t: 'new', kind: 'group' }); }}>👥 New group</button>
                <button onClick={() => { setMenu(false); setModal({ t: 'new', kind: 'channel' }); }}>📢 New channel</button>
                <button onClick={() => { setMenu(false); openSettings('contacts'); }}>👥 Contacts</button>
                <button onClick={() => { setMenu(false); openSettings('market'); }}>🛍 Gift Market</button>
                <button onClick={() => { setMenu(false); openSettings('rewards'); }}>🎡 Rewards</button>
                {me.isAdmin && <button onClick={() => { setMenu(false); setModal({ t: 'admin' }); }}>🛡 Admin panel</button>}
                <button onClick={() => { setMenu(false); setModal({t:'privacy'}); }}>🛡 Privacy</button>
                <button onClick={() => { setMenu(false); setModal({t:'devices'}); }}>💻 Devices</button>
                <button onClick={() => { const on=settings.quietUntil>Date.now(); updateSettings({quietUntil:on?0:Date.now()+8*3600000});setMenu(false);toast(on?'Quiet mode off':'Quiet mode on for 8 hours'); }}>🌙 {settings.quietUntil>Date.now()?'Turn off quiet mode':'Quiet mode · 8 hours'}</button>
                <button onClick={() => { setMenu(false); openSettings('main'); }}>⚙️ Settings</button>
              </div>
            </>
          )}
        </div>
        <input className="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <button className={'ghost-btn' + (me.ghost ? ' on' : '')} onClick={toggleGhost} aria-pressed={!!me.ghost} aria-label="Ghost mode" title={me.ghost ? 'Ghost mode is on: you are invisible' : 'Turn on ghost mode'}>👻</button>
        <button className="stars-pill" onClick={() => openSettings('gifts')} title="Your Stars balance">⭐ {me.stars}</button>
      </div>
      {!q.trim() && <div className="folder-actions"><button onClick={async()=>{const name=prompt('Folder name');if(!name?.trim())return;try{const f=await api('POST','/chat-folders',{name:name.trim()});refreshChatPrefs();setFilter('folder:'+f.id);}catch(e){toast(e.message);}}}>＋ New folder</button>{filter.startsWith('folder:')&&<button onClick={async()=>{const id=Number(filter.slice(7));if(confirm('Delete this folder? Chats will remain.')){try{await api('DELETE','/chat-folders/'+id);setFilter('all');refreshChatPrefs();}catch(e){toast(e.message);}}}}>Delete folder</button>}</div>}
      {!q.trim() && chats.length > 0 && (
        <div className="filter-tabs" role="tablist" aria-label="Filter chats">
          {FILTERS.map(([id, label]) => {
            const n = chats.filter((c) => matches(c, id)).length;
            return n || id === 'all' ? <button key={id} role="tab" aria-selected={filter === id} className={filter === id ? 'on' : ''} onClick={() => setFilter(id)}>{label}{id === 'unread' && n > 0 && <i>{n}</i>}</button> : null;
          })}
        </div>
      )}
      <div className="chat-list">
        {q.trim() ? (
          <SearchResults q={q.trim()} onOpenUser={(u) => { setQ(''); openPrivate(u.id); }} onOpenChat={(c) => { setQ(''); joinChat(c.id); }} />
        ) : chats.length ? (
          shownChats.length ? shownChats.map((c) => <ChatRow key={c.id} c={c} active={c.id === activeId} pinned={pinned.includes(c.id)} favorite={!!chatPrefs[c.id]?.favorite}
            onTogglePin={() => togglePin(c.id)} onToggleFavorite={()=>setChatPreference(c.id,{favorite:!chatPrefs[c.id]?.favorite})}
            onMoveFolder={()=>{const ids=[null,...folders.map(x=>x.id)];const current=chatPrefs[c.id]?.folderId??null;const idx=ids.indexOf(current);setChatPreference(c.id,{folderId:ids[(idx+1)%ids.length]});}}
            onClick={() => openChat(c.id)} />) : <div className="empty-note">Nothing here.</div>
        ) : (
          <div className="empty-note">No chats yet.<br />Search for a username to start one, or create a group.</div>
        )}
      </div>
    </aside>
  );
}

/* ================================ Messages ================================ */
function FileBlock({ file }) {
  if (file.gone) return <div className="file-gone">📎 <b>{file.name}</b><small>Attachment was removed from the server</small></div>;
  if (file.mime.startsWith('image/')) return <a href={file.url} target="_blank" rel="noreferrer"><img className="photo" src={file.url} alt={file.name} loading="lazy" /></a>;
  if (file.mime.startsWith('audio/')) return <AudioMessage file={file} />;
  if (file.mime.startsWith('video/')) return <video className="photo" controls preload="metadata" src={file.url} />;
  return (
    <a className="file-block" href={file.url} download={file.name}>
      <span className="file-ic">📄</span>
      <span><b>{file.name}</b><br /><small>{fmtSize(file.size)}</small></span>
    </a>
  );
}

// A message made only of 1–3 emoji is shown large, like Telegram's animated emoji.
const BIG_EMOJI = /^(?:\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*){1,3}$/u;

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉'];

function QRProfileModal() {
  const {me,setModal}=useApp(); const [src,setSrc]=useState(''); const [err,setErr]=useState('');
  const link=location.origin+'/?add='+encodeURIComponent('@'+me.username);
  useEffect(()=>{let live=true;QRCode.toDataURL(link,{width:280,margin:2,errorCorrectionLevel:'M'}).then(x=>live&&setSrc(x)).catch(e=>setErr(e.message));return()=>{live=false;};},[link]);
  return <Modal title="Share your profile" onClose={()=>setModal(null)}>
    <div className="qr-profile"><b>@{me.username}</b>{src?<img src={src} alt="Profile QR code"/>:<p>{err||'Generating QR code…'}</p>}<a href={link}>{link}</a><button className="primary" onClick={()=>navigator.clipboard?.writeText(link)}>Copy profile link</button></div>
  </Modal>;
}
function MediaCenterModal({chatId}) {
  const {setModal,toast}=useApp(); const [kind,setKind]=useState('all'); const [items,setItems]=useState([]); const [busy,setBusy]=useState(false);
  useEffect(()=>{let live=true;setBusy(true);api('GET','/chats/'+chatId+'/media?kind='+kind).then(x=>live&&setItems(x)).catch(e=>toast(e.message)).finally(()=>live&&setBusy(false));return()=>{live=false;};},[chatId,kind]);
  return <Modal title="Chat media" onClose={()=>setModal(null)}>
    <div className="media-tabs">{[['all','All'],['images','Photos'],['video','Videos'],['files','Files']].map(([id,label])=><button className={kind===id?'on':''} key={id} onClick={()=>setKind(id)}>{label}</button>)}</div>
    {busy?<p className="muted">Loading…</p>:!items.length?<p className="muted">No shared files yet</p>:<div className="media-grid">{items.map(x=><a key={x.id} href={x.url} target="_blank" rel="noreferrer" className="media-item">{x.mime.startsWith('image/')?<img src={x.url} alt={x.name}/>:x.mime.startsWith('video/')?<video src={x.url} muted/>:<span>📄</span>}<small>{x.name}</small></a>)}</div>}
  </Modal>;
}
function CallModal({chatId,incoming}) {
  const {chats,wsSend,setModal,toast}=useApp(); const chat=chats.find(x=>x.id===chatId);
  const pc=useRef(null),local=useRef(null),remote=useRef(null),localStream=useRef(null);
  const [status,setStatus]=useState(incoming?'Incoming call':'Calling…'); const [accepted,setAccepted]=useState(!incoming);
  const send=(signal)=>wsSend({type:'call:signal',chatId,signal});
  const cleanup=()=>{try{pc.current?.close();}catch{};localStream.current?.getTracks().forEach(t=>t.stop());};
  async function setup(){
    if(pc.current)return pc.current;
    const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:true});localStream.current=stream;
    if(local.current)local.current.srcObject=stream;
    const conn=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});pc.current=conn;
    stream.getTracks().forEach(t=>conn.addTrack(t,stream));
    conn.ontrack=e=>{if(remote.current)remote.current.srcObject=e.streams[0];};
    conn.onicecandidate=e=>{if(e.candidate)send({type:'candidate',candidate:e.candidate});};
    conn.onconnectionstatechange=()=>setStatus(({connected:'Connected',connecting:'Connecting…',disconnected:'Connection interrupted',failed:'Connection failed',closed:'Call ended'})[conn.connectionState]||'Calling…');
    return conn;
  }
  async function start(){try{const conn=await setup();const offer=await conn.createOffer();await conn.setLocalDescription(offer);send({type:'offer',sdp:offer});setAccepted(true);setStatus('Calling…');}catch(e){toast(e.message||'Camera or microphone permission required');}}
  async function accept(){try{const conn=await setup();await conn.setRemoteDescription(incoming.sdp);const answer=await conn.createAnswer();await conn.setLocalDescription(answer);send({type:'answer',sdp:answer});setAccepted(true);setStatus('Connecting…');}catch(e){toast(e.message||'Could not accept call');}}
  useEffect(()=>{if(!incoming)start();return()=>cleanup();},[]);
  useEffect(()=>{const handler=async ev=>{const s=ev.detail;if(s.chatId!==chatId)return;try{if(s.signal.type==='answer'&&pc.current)await pc.current.setRemoteDescription(s.signal.sdp);else if(s.signal.type==='candidate'&&pc.current)await pc.current.addIceCandidate(s.signal.candidate);else if(s.signal.type==='end'){setStatus('Call ended');cleanup();setModal(null);}}catch(e){toast('Call connection error: '+e.message);}};window.addEventListener('messenger-call-signal',handler);return()=>window.removeEventListener('messenger-call-signal',handler);},[chatId]);
  function end(){send({type:'end'});cleanup();setModal(null);}
  return <Modal title={'Call · '+(chat?.title||'Chat')} onClose={end}><div className="call-stage"><video ref={remote} autoPlay playsInline className="call-remote"/><video ref={local} autoPlay muted playsInline className="call-local"/>{!accepted&&<div className="call-incoming"><b>{chat?.title||'Incoming call'}</b><button className="primary" onClick={accept}>Accept call</button></div>}</div><p className="muted call-status">{status}</p><button className="danger" onClick={end}>End call</button><small className="muted">Peer-to-peer video. Camera and microphone permissions are required; network/firewall settings may affect connection.</small></Modal>;
}

function PollBlock({ poll, messageId }) {
  const { updatePoll, toast } = useApp();
  const [selected,setSelected] = useState(poll.myVotes || []);
  const [busy,setBusy] = useState(false);
  useEffect(()=>setSelected(poll.myVotes || []),[poll.myVotes?.join(',')]);
  async function vote() {
    if (!selected.length || busy || poll.closed) return;
    setBusy(true);
    try { updatePoll(messageId, await api('POST', '/polls/'+poll.id+'/vote', { optionIds:selected })); }
    catch(e){ toast(e.message); } finally { setBusy(false); }
  }
  return <div className="poll-card"><b>📊 {poll.question}</b>
    {poll.options.map(o=><button key={o.id} className={'poll-option'+(selected.includes(o.id)?' selected':'')} disabled={poll.closed || busy}
      onClick={()=>setSelected(v=>poll.multiple?(v.includes(o.id)?v.filter(x=>x!==o.id):[...v,o.id]):[o.id])}>
      <span>{o.label}</span><small>{o.votes} · {o.percent}%</small><i style={{width:o.percent+'%'}} />
    </button>)}
    <div className="poll-foot"><span>{poll.total} votes{poll.closed?' · closed':''}</span>
      {!poll.closed && <button className="primary small" disabled={!selected.length||busy} onClick={vote}>Vote</button>}
      {!poll.closed && poll.canClose && <button className="primary small ghosty" onClick={async()=>{try{updatePoll(messageId,await api('POST','/polls/'+poll.id+'/close'));}catch(e){toast(e.message);}}}>Close poll</button>}
      {poll.myVotes?.length>0 && <span className="muted">Your vote saved</span>}
    </div>
  </div>;
}

function Message({ m, mine, showSender, chat, fresh, onReply, onEdit, onDelete, onOpenGift, onOpenUser, jumpTo }) {
  const { settings, removeKept, react, me, toast } = useApp();
  const [pick, setPick] = useState(false);
  const [translated,setTranslated]=useState('');
  const [transBusy,setTransBusy]=useState(false);
  async function translateText(){
    if(translated){setTranslated('');return;}
    const source=prompt('Source language code (for example en, pl, ru)','en');if(!source)return;
    const target=(navigator.language||'en').split('-')[0];
    setTransBusy(true);
    try{const u='https://api.mymemory.translated.net/get?q='+encodeURIComponent(m.text)+'&langpair='+encodeURIComponent(source+'|'+target);const r=await fetch(u);const d=await r.json();if(d.responseStatus!==200)throw new Error(d.responseDetails||'Translation unavailable');setTranslated(d.responseData.translatedText);}
    catch(e){toast('Translation service error: '+e.message);}
    finally{setTransBusy(false);}
  }
  if (m.kind === 'system') return <div className="sys-msg"><span>{m.text}</span></div>;
  const canEdit = mine && (m.kind === 'text' || m.kind === 'file') && !m.deleted;
  const canDelete = !m.deleted && !m.keptDeleted && (mine || (chat.type !== 'private' && (chat.role === 'owner' || chat.role === 'admin')));
  const bigEmoji = settings.bigEmoji && m.kind === 'text' && !m.deleted && !m.keptDeleted && !m.replyTo && BIG_EMOJI.test(m.text.trim());
  return (
    <div className={'msg-row' + (mine ? ' mine' : '') + (fresh ? ' fresh' : '')} id={'m' + m.id}>
      {showSender && !mine && <button className="msg-av" onClick={() => onOpenUser(m.sender.id)} aria-label={m.sender.displayName}><Avatar name={m.sender.displayName} color={m.sender.color} src={m.sender.avatar} size={34} /></button>}
      <div onDoubleClick={(e) => { if (!m.deleted && !m.keptDeleted && !e.target.closest('button,a,audio,video,img')) react(m, '❤️'); }} className={'bubble' + (m.kind === 'gift' ? ' gifty' : '') + (m.deleted ? ' deleted' : '') + (m.keptDeleted ? ' kept' : '') + (bigEmoji ? ' emoji-only' : '')}>
        {showSender && !mine && <div className="sender" style={{ color: m.sender.nameColor || GRADS[m.sender.color % 8][1] }}>{nameFor(me, m.sender)}</div>}
        {m.keptDeleted && <div className="kept-label">🗑 Deleted by sender · saved on this device</div>}
        {m.replyTo && (
          <button className="reply-quote" onClick={() => jumpTo(m.replyTo.id)}>
            <b>{m.replyTo.sender.displayName}</b>
            <span>{preview(m.replyTo)}</span>
          </button>
        )}
        {m.deleted ? <i>Message deleted</i> : (
          <>
            {m.kind === 'gift' && m.gift && (
              <button className="gift-btn" onClick={() => onOpenGift(m.gift)} aria-label={'Open gift ' + m.gift.type.name}>
                <GiftCard gift={m.gift} />
                <div className="gift-caption">{m.gift.upgraded ? 'Collectible gift' : mine ? 'You sent a gift' : 'You received a gift'}</div>
              </button>
            )}
            {m.file && <FileBlock file={m.file} />}
            {m.poll && <PollBlock poll={m.poll} messageId={m.id} />}
            {m.text && !m.poll && (bigEmoji ? <div className="big-emoji">{m.text.trim()}</div> : m.sender.isBot ? <div className="text"><Markdown text={m.text} /></div> : <div className="text">{m.text}</div>)}
            {translated && <div className="translated-text">🌐 {translated}</div>}
            {m.noForward && <small className="secret-label">🔒 Forwarding restricted</small>}
            {m.expiresAt && <small className="secret-label">⏳ Disappears {new Date(m.expiresAt).toLocaleString()}</small>}
          </>
        )}
        {!m.deleted && m.reactions?.length > 0 && (
          <div className="reactions">
            {m.reactions.map((r) => {
              const mineR = r.users.includes(me.id);
              return <button key={r.emoji} className={'react-chip' + (mineR ? ' mine' : '')} onClick={() => react(m, r.emoji)} aria-pressed={mineR} aria-label={`${r.emoji} ${r.count}`}><span>{r.emoji}</span><b key={r.count}>{r.count}</b></button>;
            })}
          </div>
        )}
        <div className="meta">
          {m.editedAt && !m.deleted && <span>edited</span>}
          <span>{timeOf(m.createdAt)}</span>
          {mine && chat.type === 'private' && !m.deleted && <span className={'ticks' + (chat.peerRead >= m.id ? ' read' : '')}>{chat.peerRead >= m.id ? '✓✓' : '✓'}</span>}
        </div>
        {!m.deleted && (
          <div className="actions">
            {m.text && !m.poll && <button onClick={translateText} disabled={transBusy} title="Translate message">{transBusy?'…':translated?'↩':'🌐'}</button>}
            {!m.keptDeleted && <button onClick={() => setPick((v) => !v)} title="React" aria-label="React" aria-expanded={pick}>☺</button>}
            {chat.canPost && !m.keptDeleted && <button onClick={() => onReply(m)} title="Reply" aria-label="Reply">↩</button>}
            {canEdit && <button onClick={() => onEdit(m)} title="Edit" aria-label="Edit">✎</button>}
            {canDelete && <button onClick={() => onDelete(m)} title="Delete" aria-label="Delete">🗑</button>}
            {!mine && !m.keptDeleted && m.kind !== 'gift' && <button onClick={async () => { const reason = prompt('Report this message to the administrators. What is wrong with it? (optional)'); if (reason === null) return; try { await api('POST', `/messages/${m.id}/report`, { reason }); toast('Report sent. Thank you!'); } catch (e) { toast(e.message); } }} title="Report" aria-label="Report">⚑</button>}
            {m.keptDeleted && <button onClick={() => removeKept(m)} title="Remove saved copy" aria-label="Remove saved copy">🗑</button>}
          </div>
        )}
        {pick && (
          <div className="react-pop" role="menu" aria-label="Choose a reaction">
            {QUICK_REACTIONS.map((e) => <button key={e} role="menuitem" onClick={() => { react(m, e); setPick(false); }}>{e}</button>)}
            <button aria-label="More emoji" onClick={() => setPick('full')}>＋</button>
          </div>
        )}
        {pick === 'full' && <div className="react-full"><EmojiPicker keepOpen={false} onClose={() => setPick(false)} onPick={(e) => { react(m, e); setPick(false); }} /></div>}
      </div>
    </div>
  );
}

function Composer({ chat, replyTo, editing, onCancel, onSend, onTyping }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [rec, setRec] = useState(null); // {recorder, chunks, started}
  const [recSecs, setRecSecs] = useState(0);
  const [err, setErr] = useState('');
  const ta = useRef(null);
  const fileIn = useRef(null);
  const [emoji, setEmoji] = useState(false);
  const [stickers, setStickers] = useState(false);
  const [expireHours,setExpireHours] = useState(0);
  const [noForward,setNoForward] = useState(false);
  const { setModal } = useApp();

  const draftKey = 'messenger-draft:' + chat.id;
  function changeText(value) {
    setText(value);
    if (!editing) {
      try { value ? localStorage.setItem(draftKey, value.slice(0, 12000)) : localStorage.removeItem(draftKey); } catch { /* drafts are device-local */ }
    }
  }
  function clearDraft() {
    try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
  }
  useEffect(() => {
    if (editing) setText(editing.text);
    else {
      let draft = '';
      try { draft = localStorage.getItem(draftKey) || ''; } catch { /* ignore */ }
      setText(draft);
    }
    ta.current?.focus();
  }, [editing, chat.id]);
  useEffect(() => {
    if (!ta.current) return;
    ta.current.style.height = 'auto';
    ta.current.style.height = Math.min(ta.current.scrollHeight, 160) + 'px';
  }, [text]);
  useEffect(() => {
    if (!rec) return;
    const id = setInterval(() => setRecSecs(Math.floor((Date.now() - rec.started) / 1000)), 250);
    return () => clearInterval(id);
  }, [rec]);

  async function send() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true); setErr('');
    try { await onSend({ text: t, expireHours, noForward }); setText(''); if (!editing) clearDraft(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  async function pick(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true); setErr('');
    try {
      const up = await upload(f);
      await onSend({ text: text.trim(), fileId: up.id, expireHours, noForward });
      setText(''); clearDraft();
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }
  async function startRec() {
    setErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.start();
      setRecSecs(0);
      setRec({ recorder, chunks, stream, started: Date.now() });
    } catch { setErr('Microphone is not available'); }
  }
  function stopRec(shouldSend) {
    const r = rec;
    setRec(null);
    r.recorder.onstop = async () => {
      r.stream.getTracks().forEach((t) => t.stop());
      if (!shouldSend) return;
      const blob = new Blob(r.chunks, { type: r.recorder.mimeType || 'audio/webm' });
      if (!blob.size) return;
      setBusy(true);
      try {
        const up = await upload(new File([blob], 'voice.' + (blob.type.includes('ogg') ? 'ogg' : 'webm'), { type: blob.type.split(';')[0] }));
        await onSend({ text: '', fileId: up.id, expireHours, noForward });
      } catch (x) { setErr(x.message); } finally { setBusy(false); }
    };
    r.recorder.stop();
  }

  if (!chat.canPost) {
    return <div className="composer readonly">{chat.type === 'channel' ? 'Only admins can post in this channel' : ''}</div>;
  }
  return (
    <div className="composer-wrap">
      {(replyTo || editing) && (
        <div className="ctx-bar">
          <div><b>{editing ? 'Editing message' : 'Reply to ' + replyTo.sender.displayName}</b><span>{preview(editing || replyTo)}</span></div>
          <button className="icon-btn" onClick={onCancel} aria-label="Cancel">✕</button>
        </div>
      )}
      {err && <div className="error small" role="alert">{err}</div>}
      {!editing && <div className="secret-compose"><label>⏳ Auto-delete <select value={expireHours} onChange={e=>setExpireHours(Number(e.target.value))}><option value={0}>Off</option><option value={1}>1 hour</option><option value={24}>24 hours</option><option value={168}>7 days</option></select></label><label><input type="checkbox" checked={noForward} onChange={e=>setNoForward(e.target.checked)}/> 🔒 Restrict copying</label></div>}
      <div className="composer">
        {rec ? (
          <>
            <span className="rec-dot" /> <span className="rec-time">Recording {Math.floor(recSecs / 60)}:{String(recSecs % 60).padStart(2, '0')}</span>
            <span className="grow" />
            <button className="icon-btn" onClick={() => stopRec(false)} aria-label="Cancel recording">🗑</button>
            <button className="send" onClick={() => stopRec(true)} aria-label="Send voice message">➤</button>
          </>
        ) : (
          <>
            {!editing && <button className="icon-btn" onClick={() => fileIn.current.click()} aria-label="Attach file" disabled={busy}>📎</button>}
            <input ref={fileIn} type="file" hidden onChange={pick} />
            {!editing && <button className="icon-btn" onClick={() => setModal({ t: 'poll-create', chatId: chat.id })} aria-label="Create poll" title="Create poll">📊</button>}
            {!editing && <button className="icon-btn" onClick={() => setStickers(v=>!v)} aria-label="Stickers" aria-expanded={stickers}>🧸</button>}
            <button className="icon-btn" data-emoji-toggle onClick={() => setEmoji((v) => !v)} aria-label="Emoji" aria-expanded={emoji}>😊</button>
            {stickers && <div className="sticker-tray" role="group" aria-label="Sticker pack">
              {['🐱','🐼','🦊','🐸','🐻','🐰','🦄','👻','🤖','💖','🔥','✨','🎉','🥳','🌈','🚀'].map(e=><button key={e} onClick={async()=>{setStickers(false);await onSend({text:e});}}>{e}</button>)}
            </div>}
            {emoji && (
              <EmojiPicker onClose={() => setEmoji(false)} onPick={(e) => {
                const el = ta.current; const a = el?.selectionStart ?? text.length; const b = el?.selectionEnd ?? text.length;
                changeText(text.slice(0, a) + e + text.slice(b));
                requestAnimationFrame(() => { if (el) { el.focus(); el.selectionStart = el.selectionEnd = a + e.length; } });
              }} />
            )}
            <textarea
              ref={ta} rows={1} value={text} placeholder={chat.peer?.isBot ? 'Ask the assistant anything (/new = fresh chat)' : 'Message'} aria-label="Message"
              onChange={(e) => { changeText(e.target.value); onTyping(); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
                if (e.key === 'Escape' && (replyTo || editing)) onCancel();
              }}
            />
            {chat.type === 'private' && !chat.peer?.isBot && !editing && <button className="icon-btn" onClick={() => setModal({ t: 'shop', chatId: chat.id })} aria-label="Send a gift">🎁</button>}
            {text.trim() ? (
              <button className="send" onClick={send} disabled={busy} aria-label="Send">➤</button>
            ) : !editing ? (
              <button className="icon-btn" onClick={startRec} aria-label="Record voice message" disabled={busy}>🎤</button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function ChatView() {
  const { chats, activeId, messages, me, typing, sendMessage, editMessage, deleteMessage, loadOlder, setModal, closeChat, wsSend, chatPrefs, setChatPreference } = useApp();
  const chat = chats.find((c) => c.id === activeId);
  const bucket = messages[activeId];
  const list = bucket?.list || [];
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const scroller = useRef(null);
  const stick = useRef(true);
  const lastTyping = useRef(0);
  const [aiInfo, setAiInfo] = useState(null);
  const seenMax = useRef({}); // per chat: newest message id present when it was opened (older ones don't animate)

  useEffect(() => { setReplyTo(null); setEditing(null); stick.current = true; }, [activeId]);
  const isBot = !!chat?.peer?.isBot;
  useEffect(() => {
    if (!isBot) { setAiInfo(null); return; }
    let live = true;
    const load = () => api('GET', '/ai/status').then((r) => live && setAiInfo(r)).catch(() => {});
    load();
    const id = setInterval(load, 15000);
    return () => { live = false; clearInterval(id); };
  }, [isBot, activeId, me?.aiModel]);
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [list.length, activeId, bucket?.loaded, typing[activeId]]);

  if (!chat) return <Greeting />;

  const t = typing[chat.id];
  const sub = chat.type === 'private'
    ? (t ? <>typing<TypingDots /></> : isBot ? (aiInfo ? (aiInfo.online ? `${aiInfo.model}${aiInfo.modelInstalled ? '' : ' (not installed)'}` : 'model offline') : 'bot') : lastSeen(chat.peer))
    : t ? <>{t.name} is typing<TypingDots /></> : `${chat.membersCount} ${chat.type === 'channel' ? 'subscribers' : 'members'}`;
  if (bucket?.loaded && seenMax.current[activeId] === undefined) seenMax.current[activeId] = list.length ? list[list.length - 1].id : 0;
  const baseline = seenMax.current[activeId] ?? Infinity;

  function jumpTo(id) {
    const el = document.getElementById('m' + id);
    if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200); }
  }
  const typingPing = () => {
    if (Date.now() - lastTyping.current > 3000) { lastTyping.current = Date.now(); wsSend({ type: 'typing', chatId: chat.id }); }
  };
  async function onSend(p) {
    if (editing) { await editMessage(editing.id, p.text); setEditing(null); return; }
    stick.current = true;
    await sendMessage(chat.id, { ...p, replyTo: replyTo?.id });
    setReplyTo(null);
  }

  let prevDay = '', prev = null;
  const rows = [];
  for (const m of list) {
    const day = new Date(m.createdAt).toDateString();
    if (day !== prevDay) { rows.push(<div className="day-sep" key={'d' + m.id}><span>{dayLabel(m.createdAt)}</span></div>); prevDay = day; prev = null; }
    const showSender = chat.type === 'group' && m.kind !== 'system' && (!prev || prev.sender.id !== m.sender.id || prev.kind === 'system');
    rows.push(
      <Message key={m.id} m={m} chat={chat} fresh={m.id > baseline} mine={m.sender.id === me.id} showSender={chat.type === 'group'} onReply={setReplyTo}
        onEdit={(x) => { setReplyTo(null); setEditing(x); }} onDelete={(x) => confirm('Delete this message for everyone?\n\nPeople who turned on "Keep deleted messages" may still keep a copy of the text they already received. Attachments are removed from the server.') && deleteMessage(x.id)}
        onOpenGift={(g) => setModal({ t: 'gift', gift: g })} onOpenUser={(id) => setModal({ t: 'user', id })} jumpTo={jumpTo} />
    );
    prev = m;
  }

  const themes=['','ocean','lavender','forest','sunset','rose','midnight'];
  const currentTheme=chatPrefs[chat.id]?.theme||'';
  return (
    <main className={'main'+(currentTheme?' chat-theme-'+currentTheme:'')}>
      <header className="chat-head">
        <button className="icon-btn back" onClick={closeChat} aria-label="Back">←</button>
        <button className="head-info" onClick={() => setModal(chat.type === 'private' ? { t: 'user', id: chat.peer.id } : { t: 'info', chatId: chat.id })}>
          <Avatar name={chat.title} color={chatColor(chat)} size={42} src={chat.peer?.avatar} />
          <div><div className="head-title">{chat.type === 'private' && chat.peer ? nameFor(me, chat.peer) : chat.title}{isBot && <span className="bot-tag">bot</span>}{chat.peer?.statusEmoji && <span className="status-emoji">{chat.peer.statusEmoji}</span>}</div><div className={'head-sub' + (t || chat.peer?.online || (isBot && aiInfo?.online) ? ' live' : '')}>{sub}</div></div>
        </button>
        {chat.type==='private'&&!isBot&&<button className="icon-btn" onClick={()=>setModal({t:'call',chatId:chat.id})} title="Start video call" aria-label="Start video call">📹</button>}
        <button className="icon-btn" onClick={()=>setModal({t:'media',chatId:chat.id})} title="Shared media" aria-label="Shared media">🖼</button>
        <button className="icon-btn chat-theme-btn" title="Personal chat theme" aria-label="Change chat theme" onClick={()=>{const i=themes.indexOf(currentTheme);setChatPreference(chat.id,{theme:themes[(i+1)%themes.length]});}}>🎨</button>
        {isBot && <button className="gift-head" onClick={() => sendMessage(chat.id, { text: '/new' })} aria-label="New conversation" title="Forget the context and start fresh">✨ New chat</button>}
        {isBot && <button className="icon-btn" onClick={async () => { if (confirm('Delete the whole conversation with the assistant?')) { await api('POST', '/ai/clear'); } }} aria-label="Clear conversation" title="Clear conversation">🗑</button>}
        {chat.type === 'private' && !isBot && (
          <button className="gift-head" onClick={() => setModal({ t: 'shop', chatId: chat.id })} aria-label="Open gift shop" title="Send a gift">
            <span aria-hidden="true">🎁</span> Gift
          </button>
        )}
      </header>
      <div className="scroll" ref={scroller} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; }}>
        <div className="thread" key={activeId}>
          {bucket?.hasMore && <button className="load-more" onClick={() => loadOlder(chat.id)}>Load earlier messages</button>}
          {!bucket?.loaded && <div className="empty-note">Loading…</div>}
          {bucket?.loaded && !list.length && <div className="empty-pill">No messages yet. Say hello 👋</div>}
          {rows}
        </div>
      </div>
      <Composer chat={chat} replyTo={replyTo} editing={editing} onCancel={() => { setReplyTo(null); setEditing(null); }} onSend={onSend} onTyping={typingPing} />
    </main>
  );
}

/* ================================== Modals ================================= */
const TIER_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
const TIER_LABEL = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', mythic: 'Mythic' };
function GiftShop({ chatId, self, modal = {} }) {
  const { setModal, me, setMe, chats, mergeMessage, mergeGift, toast } = useApp();
  const chat = chats.find((c) => c.id === chatId);
  const [cat, setCat] = useState([]);
  const [sel, setSel] = useState(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [tier, setTier] = useState('all');
  const [sort, setSort] = useState('tier');
  useEffect(() => { api('GET', '/gifts/catalog').then(setCat); }, []);
  async function buy() {
    setBusy(true); setErr('');
    try {
      const r = self ? await api('POST', '/gifts/self', { typeId: sel.id }) : await api('POST', '/gifts/send', { chatId, typeId: sel.id, text: note });
      setMe({ ...me, stars: r.stars });
      if (self) { mergeGift(r.gift); window.dispatchEvent(new Event('gift-collection-updated')); } else mergeMessage(r.message);
      burst([sel.emoji, '✨', '⭐', '🎉']);
      toast(self ? `${sel.name} added to your collection` : `Sent ${sel.name} to ${chat.title}`);
      setModal(self && modal.from === 'profile' ? { t: 'user', id: me.id } : null);
    } catch (e) { setErr(e.message); setApiCatalog(); } finally { setBusy(false); }
  }
  const setApiCatalog = () => api('GET', '/gifts/catalog').then(setCat);
  // Keep the full catalog; hide only the explicitly marked 3D gifts.
  const visibleCatalog = cat.filter((g) => !g.model3d);
  const shown = visibleCatalog.filter((g) => tier === 'all' || g.rarity === tier).sort((a, b) =>
    sort === 'cheap' ? a.price - b.price : sort === 'rich' ? b.price - a.price : (TIER_ORDER.indexOf(a.rarity) - TIER_ORDER.indexOf(b.rarity)) || a.price - b.price);
  return (
    <Modal title={self ? 'Buy a gift for yourself' : 'Send a gift to ' + (chat?.title || '')} onClose={() => setModal(null)} wide>
      <div className="balance">Your balance: <b>⭐ {me.stars}</b></div>
      <div className="tier-chips" role="tablist" aria-label="Rarity">
        {['all', ...TIER_ORDER].map((t) => (
          <button key={t} role="tab" aria-selected={tier === t} className={'tier-chip tier-' + t + (tier === t ? ' on' : '')} onClick={() => setTier(t)}>
            {t === 'all' ? 'All' : TIER_LABEL[t]} <small>{t === 'all' ? visibleCatalog.length : visibleCatalog.filter((g) => g.rarity === t).length}</small>
          </button>
        ))}
        <select className="tier-sort" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          <option value="tier">By rarity</option><option value="cheap">Cheapest first</option><option value="rich">Most expensive</option>
        </select>
      </div>
      {[['Classic gifts', shown.filter((g) => !g.limited)], ['Limited collectibles · NFT-style', shown.filter((g) => g.limited)]].map(([title, items]) => items.length > 0 && (
        <React.Fragment key={title}>
          <h4 className="shop-h">{title}</h4>
          {title.startsWith('Limited') && <p className="muted shop-note">Each one has a serial number. The recipient can upgrade it into a unique collectible with a random look and a token, and trade it on.</p>}
          <div className="gift-grid">
            {items.map((g) => {
              const out = g.limited && g.left === 0;
              return (
                <button key={g.id} className={'shop-item tier-' + g.rarity + (sel?.id === g.id ? ' sel' : '')} disabled={out} onClick={() => setSel(g)}
                  style={{ background: `linear-gradient(160deg, ${g.color}40, ${g.color}15)` }}>
                  <span className="tier-badge">{TIER_LABEL[g.rarity]}</span>
                  {g.limited && <span className="ribbon">NFT</span>}
                  <span className="e">{g.emoji}</span>
                  <b>{g.name}</b>
                  <span className="price">{g.yourPrice < g.price && <s className="old-price">{g.price}</s>} ⭐ {g.yourPrice}</span>
                  {g.limited && <small>{out ? 'Sold out' : `${g.left} of ${g.supply} left`}</small>}
                </button>
              );
            })}
          </div>
        </React.Fragment>
      ))}
      {sel && (
        <div className="buy-bar">
          <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (optional)" aria-label="Gift note" />
          {sel.upgradePrice != null && <small className="muted">{self ? 'You can upgrade it to a unique collectible (⭐ ' + sel.upgradePrice + ') in your collection. It becomes one of these models:' : 'The recipient can upgrade this to a unique collectible. It becomes one of these models:'}</small>}
          <ModelStrip models={sel.models} />
          {err && <div className="error small" role="alert">{err}</div>}
          <button className="primary" onClick={buy} disabled={busy || me.stars < sel.yourPrice}>
            {me.stars < sel.yourPrice ? 'Not enough Stars' : self ? `Buy for ⭐ ${sel.yourPrice}` : `Send for ⭐ ${sel.yourPrice}`}
          </button>
        </div>
      )}
    </Modal>
  );
}

function GiftDetail({ gift: initial }) {
  const { setModal, me, setMe, mergeGift, toast, contacts } = useApp();
  const [gift, setGift] = useState(initial);
  const reload = useCallback(() => api('GET', `/gifts/${initial.id}`).then(setGift).catch(() => {}), [initial.id]);
  useEffect(() => { reload(); }, [reload]);
  const [revealed, setRevealed] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [to, setTo] = useState('');
  const [found, setFound] = useState([]);
  const mine = gift.owner.id === me.id;
  useEffect(() => {
    if (!to.trim()) { setFound([]); return; }
    const id = setTimeout(() => api('GET', '/search?q=' + encodeURIComponent(to.trim())).then((r) => setFound(r.users.slice(0, 4))).catch(() => {}), 200);
    return () => clearTimeout(id);
  }, [to]);
  async function upgrade() {
    if (!confirm(`Upgrade to a collectible for ⭐ ${gift.upgradePrice}? Its model, backdrop and pattern are drawn at random.`)) return;
    setBusy(true); setErr('');
    try {
      const r = await api('POST', `/gifts/${gift.id}/upgrade`);
      setGift(r.gift); setRevealed(true); setMe({ ...me, stars: r.stars }); mergeGift(r.gift); reload();
      burst(['✨', '⭐', '💎', r.gift.attrs?.model?.emoji || r.gift.type.emoji], 40);
    }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  async function transfer(u) {
    if (!confirm(`Transfer this collectible to ${u.displayName}? This cannot be undone.`)) return;
    setBusy(true); setErr('');
    try { const r = await api('POST', `/gifts/${gift.id}/transfer`, { userId: u.id }); mergeGift(r.gift); toast('Transferred to ' + u.displayName); setModal(null); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Modal title={gift.upgraded ? 'Collectible gift' : 'Gift'} onClose={() => setModal(null)}>
      <SpinCard gift={gift} reveal={revealed} key={gift.upgraded ? 'up' : 'plain'} />
      <p className="muted center">From <b>{gift.sender.displayName}</b> · owned by <b>{gift.owner.displayName}</b></p>
      {!gift.upgraded && gift.canUpgrade && <><h4>Possible models</h4><ModelStrip models={gift.type.models} /></>}
      {gift.upgraded && gift.attrs && <div className={'gift-rarity-detail rarity-' + (giftRarity(gift)?.id || 'common')}>{giftRarity(gift)?.icon} {giftRarity(gift)?.label} COLLECTIBLE</div>}
      {gift.upgraded && gift.token && <div className="token" title="Unique token of this collectible">🔗 Token <code>{gift.token}</code></div>}
      {gift.upgraded && gift.attrs && (
        <table className="attrs"><tbody>
          <tr><td>Model</td><td>{gift.attrs.model.name}</td><td className="r">{gift.attrs.model.rarity}%</td></tr>
          <tr><td>Backdrop</td><td>{gift.attrs.backdrop.name}</td><td className="r">{gift.attrs.backdrop.rarity}%</td></tr>
          <tr><td>Pattern</td><td>{gift.attrs.pattern.name}</td><td className="r">{gift.attrs.pattern.rarity}%</td></tr>
          {gift.attrs.finish && <tr><td>Finish</td><td>{gift.attrs.finish.name}</td><td className="r">{gift.attrs.finish.rarity}%</td></tr>}
          <tr><td>Edition</td><td colSpan={2}>#{gift.collectibleNo}</td></tr>
        </tbody></table>
      )}
      {gift.history?.length > 0 && (
        <>
          <h4>History</h4>
          <ul className="history">
            {gift.history.map((e, i) => (
              <li key={i}>
                <span aria-hidden="true">{e.kind === 'sent' ? '🎁' : e.kind === 'upgraded' ? '✨' : '🔁'}</span>
                <span className="grow">
                  {e.kind === 'sent' && <><b>{e.from.displayName}</b> sent it to <b>{e.to.displayName}</b></>}
                  {e.kind === 'upgraded' && <><b>{e.from.displayName}</b> upgraded it to a collectible</>}
                  {e.kind === 'transferred' && <><b>{e.from.displayName}</b> transferred it to <b>{e.to.displayName}</b></>}
                </span>
                <time>{new Date(e.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</time>
              </li>
            ))}
          </ul>
        </>
      )}
      {err && <div className="error small" role="alert">{err}</div>}
      {mine && gift.canUpgrade && <button className="primary" disabled={busy || me.stars < gift.upgradePrice} onClick={upgrade}>Upgrade to collectible · ⭐ {gift.upgradePrice}</button>}
      {mine && gift.upgraded && (
        <div className="transfer">
          <input placeholder="Transfer to… (search username)" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Transfer to" />
          {(to.trim() ? found : contacts.slice(0, 4)).map((u) => <button key={u.id} className="chat-row" onClick={() => transfer(u)}><Avatar name={u.displayName} color={u.color} src={u.avatar} size={36} /><div className="chat-main"><div className="chat-title">{u.displayName}</div><div className="chat-sub">@{u.username}</div></div></button>)}
        </div>
      )}
    </Modal>
  );
}

function UserProfile({ id }) {
  const { me, setMe, toast, setModal, openPrivate, chats, activeId, contacts, addContact, removeContact } = useApp();
  const [u, setU] = useState(null);
  useEffect(() => { api('GET', '/users/' + id).then(setU); }, [id]);
  if (!u) return <Modal title="Profile" onClose={() => setModal(null)}>Loading…</Modal>;
  const inPrivate = chats.find((c) => c.id === activeId)?.peer?.id === u.id;
  const inContacts = contacts.some((c) => c.id === u.id);
  return (
    <Modal title="Profile" onClose={() => setModal(null)} wide>
      <div className={'profile-top' + (u.cover ? ' has-cover' : '')} style={coverStyle(u.cover)}><CoverDeco cover={u.cover} /><Avatar name={u.displayName} color={u.color} src={u.avatar} size={72} /><div><h3>{u.displayName}{u.isBot && <span className="bot-tag">bot</span>}{u.premium && <span className="prem-tag" title="Premium">✨</span>}{u.statusEmoji && <span className="status-emoji big">{u.statusEmoji}</span>}</h3>{u.level && <LevelBadge level={u.level} />}<div className="muted">@{u.username}{u.isBot ? '' : ' · ' + lastSeen(u)}</div></div></div>
      {u.bio && <p>{u.bio}</p>}
      {u.music && <TrackRow music={u.music} />}
      {u.id === me.id && <div className="row"><button className="primary small" onClick={() => setModal({ t: 'shop', self: true, from: 'profile' })}>🎁 Buy a gift for myself</button></div>}
      {u.id !== me.id && (
        <div className="row">
          {!inPrivate && <button className="primary small" onClick={async () => { setModal(null); await openPrivate(u.id); }}>Message</button>}
          {!u.isBot && <button className="primary small" onClick={async () => { const c = await openPrivate(u.id); setModal({ t: 'shop', chatId: c.id }); }}>🎁 Send a gift</button>}
          {inContacts
            ? <button className="primary small ghosty" onClick={() => removeContact(u.id)}>✓ In contacts · Remove</button>
            : <button className="primary small" onClick={() => addContact(u.id)}>➕ Add to contacts</button>}
          {!u.isBot && <button className="primary small ghosty" onClick={async () => { const v = prompt('Private nickname for ' + u.displayName + ' (only you see it; empty = remove)', me.nicks?.[u.id] || ''); if (v === null) return; try { const nicks = await api('PUT', `/nicks/${u.id}`, { nick: v }); setMe({ ...me, nicks }); toast(v.trim() ? 'Nickname saved' : 'Nickname removed'); } catch (e) { toast(e.message); } }}>✏️ Nickname</button>}
        </div>
      )}
      <h4>Gifts</h4>
      <Collection userId={u.id} />
    </Modal>
  );
}

function NewChat({ kind }) {
  const { setModal, refreshChats, openChat, contacts } = useApp();
  const [f, setF] = useState({ title: '', handle: '', description: '' });
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [picked, setPicked] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!q.trim()) { setFound([]); return; }
    const id = setTimeout(() => api('GET', '/search?q=' + encodeURIComponent(q.trim())).then((r) => setFound(r.users)).catch(() => {}), 200);
    return () => clearTimeout(id);
  }, [q]);
  async function create() {
    setBusy(true); setErr('');
    try {
      const c = await api('POST', '/chats', { type: kind, ...f, memberIds: picked.map((p) => p.id) });
      await refreshChats(); openChat(c.id); setModal(null);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Modal title={kind === 'channel' ? 'New channel' : 'New group'} onClose={() => setModal(null)}>
      <label>Name<input autoFocus value={f.title} maxLength={64} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
      <label>Description<input value={f.description} maxLength={300} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Optional" /></label>
      <label>Public handle<input value={f.handle} maxLength={32} onChange={(e) => setF({ ...f, handle: e.target.value })} placeholder={kind === 'channel' ? 'Required for people to find it' : 'Optional, makes it searchable'} /></label>
      {kind === 'group' && (
        <>
          <label>Add members<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search users, or pick from your contacts" /></label>
          {picked.length > 0 && <div className="chips">{picked.map((p) => <button key={p.id} className="chip" onClick={() => setPicked(picked.filter((x) => x.id !== p.id))}>{p.displayName} ✕</button>)}</div>}
          {(q.trim() ? found : contacts).filter((u) => !picked.some((p) => p.id === u.id)).slice(0, 6).map((u) => (
            <button key={u.id} className="chat-row" onClick={() => { setPicked([...picked, u]); setQ(''); }}><Avatar name={u.displayName} color={u.color} src={u.avatar} size={36} /><div className="chat-main"><div className="chat-title">{u.displayName}</div><div className="chat-sub">@{u.username}</div></div></button>
          ))}
        </>
      )}
      {err && <div className="error small" role="alert">{err}</div>}
      <button className="primary" onClick={create} disabled={busy || !f.title.trim()}>Create</button>
    </Modal>
  );
}

function ChatInfo({ chatId }) {
  const { chats, setModal, leaveChat, me, refreshChats, contacts } = useApp();
  const chat = chats.find((c) => c.id === chatId);
  const [full, setFull] = useState(null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const load = useCallback(() => api('GET', '/chats/' + chatId).then(setFull), [chatId]);
  useEffect(() => { load(); }, [load, chat?.membersCount]);
  useEffect(() => {
    if (!q.trim()) { setFound([]); return; }
    const id = setTimeout(() => api('GET', '/search?q=' + encodeURIComponent(q.trim())).then((r) => setFound(r.users.slice(0, 4))).catch(() => {}), 200);
    return () => clearTimeout(id);
  }, [q]);
  if (!chat || !full) return null;
  const admin = full.role === 'owner' || full.role === 'admin';
  const canAdd = chat.type === 'group' || admin;
  return (
    <Modal title={chat.type === 'channel' ? 'Channel info' : 'Group info'} onClose={() => setModal(null)} wide>
      <div className="profile-top"><Avatar name={chat.title} color={chat.id} size={72} /><div><h3>{chat.title}</h3><div className="muted">{chat.handle ? '@' + chat.handle + ' · ' : ''}{full.membersCount} {chat.type === 'channel' ? 'subscribers' : 'members'}</div></div></div>
      {chat.description && <p>{chat.description}</p>}
      {canAdd && (
        <>
          <label>Add people<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search users, or pick from your contacts" /></label>
          {(q.trim() ? found : contacts).filter((u) => !full.members.some((m) => m.id === u.id)).slice(0, 5).map((u) => (
            <button key={u.id} className="chat-row" onClick={async () => { await api('POST', `/chats/${chatId}/members`, { userId: u.id }); setQ(''); load(); refreshChats(); }}>
              <Avatar name={u.displayName} color={u.color} src={u.avatar} size={36} /><div className="chat-main"><div className="chat-title">Add {u.displayName}</div><div className="chat-sub">@{u.username}</div></div>
            </button>
          ))}
        </>
      )}
      <h4>Members</h4>
      {full.members.map((m) => (
        <button key={m.id} className="chat-row" onClick={() => m.id !== me.id && setModal({ t: 'user', id: m.id })}>
          <Avatar name={m.displayName} color={m.color} src={m.avatar} size={36} />
          <div className="chat-main"><div className="chat-top"><span className="chat-title">{m.displayName}{m.id === me.id ? ' (you)' : ''}</span>{m.role !== 'member' && <span className="role">{m.role}</span>}</div><div className="chat-sub">{lastSeen(m)}</div></div>
        </button>
      ))}
      <button className="danger" onClick={() => confirm('Leave this ' + chat.type + '?') && leaveChat(chatId)}>Leave {chat.type}</button>
    </Modal>
  );
}

function CreatePollModal({ chatId }) {
  const { setModal, mergeMessage, toast } = useApp();
  const [question,setQuestion]=useState(''); const [options,setOptions]=useState(['','']);
  const [multiple,setMultiple]=useState(false); const [anonymous,setAnonymous]=useState(true);
  const [busy,setBusy]=useState(false); const [err,setErr]=useState('');
  async function submit(){
    const clean=options.map(x=>x.trim()).filter(Boolean);
    if(!question.trim()||clean.length<2){setErr('Enter a question and at least two options');return;}
    setBusy(true);setErr('');
    try{mergeMessage(await api('POST','/chats/'+chatId+'/polls',{question:question.trim(),options:clean,multiple,anonymous:true}));setModal(null);toast('Poll created');}
    catch(e){setErr(e.message);}finally{setBusy(false);}
  }
  return <Modal title="Create poll" onClose={()=>setModal(null)}>
    <label>Question<input value={question} maxLength={240} onChange={e=>setQuestion(e.target.value)} placeholder="Ask a question" /></label>
    {options.map((v,i)=><input key={i} value={v} maxLength={100} onChange={e=>setOptions(a=>a.map((x,j)=>i===j?e.target.value:x))} placeholder={'Option '+(i+1)} />)}
    {options.length<10&&<button className="primary small ghosty" onClick={()=>setOptions(a=>[...a,''])}>＋ Add option</button>}
    <label className="check-row"><input type="checkbox" checked={multiple} onChange={e=>setMultiple(e.target.checked)}/> Multiple answers</label>
    {err&&<div className="error small">{err}</div>}
    <button className="primary" disabled={busy} onClick={submit}>{busy?'Creating…':'Create poll'}</button>
  </Modal>;
}
function DevicesModal() {
  const {setModal,toast}=useApp(); const [items,setItems]=useState([]); const [busy,setBusy]=useState(false);
  const load=()=>api('GET','/sessions').then(setItems).catch(e=>toast(e.message));
  useEffect(()=>{load();},[]);
  async function revoke(id){try{await api('DELETE','/sessions/'+id);load();toast('Session ended');}catch(e){toast(e.message);}}
  async function revokeOthers(){if(!confirm('End all other sessions?'))return;setBusy(true);try{const r=await api('POST','/sessions/revoke-others');toast('Ended '+r.revoked+' sessions');load();}catch(e){toast(e.message);}finally{setBusy(false);}}
  return <Modal title="Devices and sessions" onClose={()=>setModal(null)}>
    <p className="muted">Signed-in devices for this account. Ending a session signs that device out.</p>
    {items.map(s=><div className="device-row" key={s.id}><div><b>{s.device||'Device'}</b><small>{s.current?'This device · current session':'Last active '+shortDate(s.lastActive||s.createdAt)}</small></div>{!s.current&&<button className="danger small" onClick={()=>revoke(s.id)}>End</button>}</div>)}
    {items.some(s=>!s.current)&&<button className="danger" disabled={busy} onClick={revokeOthers}>End all other sessions</button>}
  </Modal>;
}
function PrivacyModal() {
  const {me,setMe,setModal,toast}=useApp(); const [blocked,setBlocked]=useState([]); const [query,setQuery]=useState(''); const [found,setFound]=useState([]);
  const load=()=>api('GET','/blocked-users').then(setBlocked).catch(()=>{});
  useEffect(()=>{load();},[]);
  useEffect(()=>{if(!query.trim()){setFound([]);return;}const id=setTimeout(()=>api('GET','/search?q='+encodeURIComponent(query)).then(r=>setFound(r.users||[])).catch(()=>{}),250);return()=>clearTimeout(id);},[query]);
  async function toggle(field){try{setMe(await api('PATCH','/me',{[field]:!me[field]}));}catch(e){toast(e.message);}}
  async function block(id){try{await api('POST','/blocked-users',{userId:id});setQuery('');load();toast('User blocked');}catch(e){toast(e.message);}}
  async function unblock(id){try{await api('DELETE','/blocked-users/'+id);load();}catch(e){toast(e.message);}}
  return <Modal title="Privacy" onClose={()=>setModal(null)}>
    <label className="check-row"><input type="checkbox" checked={!!me.hideSeen} onChange={()=>toggle('hideSeen')}/> Hide last seen</label>
    <label className="check-row"><input type="checkbox" checked={!!me.ghost} onChange={()=>toggle('ghost')}/> Ghost mode (hide online and read status)</label>
    <h4>Blocked users</h4><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a user to block" />
    {found.filter(u=>u.id!==me.id&&!blocked.some(b=>b.id===u.id)).slice(0,5).map(u=><button className="chat-row" key={u.id} onClick={()=>block(u.id)}>{u.displayName} · @{u.username} <b>Block</b></button>)}
    {blocked.map(u=><div className="device-row" key={u.id}><b>{u.displayName} · @{u.username}</b><button className="primary small ghosty" onClick={()=>unblock(u.id)}>Unblock</button></div>)}
  </Modal>;
}

/* =================================== App =================================== */
function App() {
  const [me, setMe] = useState(null);
  const [booting, setBooting] = useState(!!getToken());
  const [chats, setChats] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState({}); // id -> {list, hasMore, loaded}
  const [typing, setTyping] = useState({});
  const [modal, setModal] = useState(null);
  const [toastMsg, setToastMsg] = useState('');
  const [settings, setSettings] = useState(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(null); // null | page id
  const [contacts, setContacts] = useState([]);
  const [chatPrefs, setChatPrefs] = useState({});
  const [folders, setFolders] = useState([]);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const wsRef = useRef(null);
  const activeRef = useRef(null);
  const meRef = useRef(null);
  const chatsRef = useRef([]);
  const typingTimers = useRef({});
  activeRef.current = activeId; meRef.current = me; chatsRef.current = chats;

  const toast = useCallback((m) => { setToastMsg(m); setTimeout(() => setToastMsg(''), 2500); }, []);
  const wsSend = useCallback((o) => { const w = wsRef.current; if (w && w.readyState === 1) w.send(JSON.stringify(o)); }, []);

  const updateSettings = useCallback((patch) => {
    setSettings((s) => { const next = { ...s, ...patch }; saveSettings(next); return next; });
  }, []);
  // apply theme / accent / wallpaper / motion; follow the OS when theme = system
  useEffect(() => {
    applySettings(settings);
    if (settings.theme !== 'system' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const h = () => applySettings(settings);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [settings]);

  const refreshChats = useCallback(async () => { setChats(await api('GET', '/chats')); }, []);
  const refreshChatPrefs = useCallback(async () => {
    try { const r=await api('GET','/chat-preferences'); setFolders(r.folders||[]); setChatPrefs(Object.fromEntries((r.chats||[]).map(x=>[x.chatId,x]))); } catch {}
  }, []);
  const setChatPreference = useCallback(async (chatId, patch) => {
    try { const p=await api('PATCH','/chats/'+chatId+'/preferences',patch); setChatPrefs(all=>({...all,[chatId]:p})); return p; }
    catch(e){ toast(e.message); throw e; }
  }, [toast]);
  const updatePoll = useCallback((messageId,poll) => {
    setMessages(all=>{const next={...all};for(const [id,b] of Object.entries(all)){if(b.list.some(m=>m.id===messageId))next[id]={...b,list:b.list.map(m=>{if(m.id!==messageId)return m;const safe={...poll};if(!safe.myVotes?.length&&m.poll?.myVotes?.length)safe.myVotes=m.poll.myVotes;return {...m,poll:safe};})};}return next;});
  }, []);
  const logout = useCallback(async () => {
    try { await api('POST', '/logout'); } catch { /* ignore */ }
    setToken(null); wsRef.current?.close(); setMe(null); setChats([]); setMessages({}); setActiveId(null); setSettingsOpen(null); setModal(null); setContacts([]);
  }, []);

  // boot
  useEffect(() => {
    if (!getToken()) return;
    api('GET', '/me').then(setMe).catch(() => setToken(null)).finally(() => setBooting(false));
  }, []);

  const patchChat = (id, fn) => setChats((cs) => cs.map((c) => (c.id === id ? fn(c) : c)));
  const sortChats = (cs) => [...cs].sort((a, b) => (b.lastMessage?.createdAt || b.createdAt) - (a.lastMessage?.createdAt || a.createdAt));

  const mergeMessage = useCallback((m) => {
    setMessages((all) => {
      const b = all[m.chatId];
      if (!b) return all;
      const i = b.list.findIndex((x) => x.id === m.id);
      const list = i >= 0 ? b.list.map((x, j) => (j === i ? m : x)) : [...b.list, m];
      return { ...all, [m.chatId]: { ...b, list } };
    });
    setChats((cs) => sortChats(cs.map((c) => (c.id === m.chatId && (!c.lastMessage || c.lastMessage.id <= m.id) ? { ...c, lastMessage: m } : c))));
  }, []);

  const applyReactions = useCallback((chatId, id, reactions) => {
    setMessages((all) => {
      const b = all[chatId];
      if (!b) return all;
      return { ...all, [chatId]: { ...b, list: b.list.map((x) => (x.id === id ? { ...x, reactions } : x)) } };
    });
  }, []);
  const react = useCallback(async (m, emoji) => {
    try { const r = await api('POST', `/messages/${m.id}/reactions`, { emoji }); applyReactions(m.chatId, m.id, r.reactions); }
    catch (e) { toast(e.message); }
  }, [applyReactions, toast]);

  const markRead = useCallback((chatId, messageId) => {
    patchChat(chatId, (c) => ({ ...c, unread: 0 }));
    api('POST', `/chats/${chatId}/read`, { messageId }).catch(() => {});
  }, []);

  // Messages other people deleted come back from the server as empty placeholders; if the user
  // opted in to "Keep deleted messages" we swap in the copy saved on this device.
  const restoreKept = (list) => {
    if (!settingsRef.current.keepDeleted || !meRef.current) return list;
    const kept = loadKept(meRef.current.id);
    return list.map((m) => (m.deleted && kept[m.id] ? kept[m.id] : m));
  };

  const loadMessages = useCallback(async (chatId) => {
    const r = await api('GET', `/chats/${chatId}/messages?limit=40`);
    r.messages = restoreKept(r.messages);
    setMessages((all) => ({ ...all, [chatId]: { list: r.messages, hasMore: r.hasMore, loaded: true } }));
    const last = r.messages[r.messages.length - 1];
    if (last) markRead(chatId, last.id);
  }, [markRead]);

  const loadOlder = useCallback(async (chatId) => {
    const b = messages[chatId];
    if (!b?.list.length) return;
    const r = await api('GET', `/chats/${chatId}/messages?limit=40&before=${b.list[0].id}`);
    r.messages = restoreKept(r.messages);
    setMessages((all) => ({ ...all, [chatId]: { list: [...r.messages, ...all[chatId].list], hasMore: r.hasMore, loaded: true } }));
  }, [messages]);

  const openChat = useCallback((id) => {
    setActiveId(id);
    if (!messagesRef.current[id]?.loaded) loadMessages(id).catch(() => {});
    else { const l = messagesRef.current[id].list; if (l.length) markRead(id, l[l.length - 1].id); }
  }, [loadMessages, markRead]);
  const messagesRef = useRef({}); messagesRef.current = messages;

  const openPrivate = useCallback(async (userId) => {
    const c = await api('POST', '/chats/private', { userId });
    setChats((cs) => (cs.some((x) => x.id === c.id) ? cs.map((x) => (x.id === c.id ? { ...x, ...c } : x)) : [c, ...cs]));
    openChat(c.id);
    return c;
  }, [openChat]);

  const joinChat = useCallback(async (id) => {
    const c = await api('POST', `/chats/${id}/join`);
    setChats((cs) => (cs.some((x) => x.id === c.id) ? cs : [c, ...cs]));
    openChat(c.id);
  }, [openChat]);

  const leaveChat = useCallback(async (id) => {
    await api('POST', `/chats/${id}/leave`);
    setChats((cs) => cs.filter((c) => c.id !== id)); setActiveId(null); setModal(null);
  }, []);

  const sendMessage = useCallback(async (chatId, body) => { mergeMessage(await api('POST', `/chats/${chatId}/messages`, body)); }, [mergeMessage]);
  const editMessage = useCallback(async (id, text) => { mergeMessage(await api('PATCH', `/messages/${id}`, { text })); }, [mergeMessage]);
  const deleteMessage = useCallback(async (id) => { try { await api('DELETE', `/messages/${id}`); } catch (e) { toast(e.message); } }, [toast]);
  const [giftsVersion, setGiftsVersion] = useState(0);
  const [announce, setAnnounce] = useState(null);
  const mergeGift = useCallback((g) => {
    setGiftsVersion((n) => n + 1);
    setMessages((all) => {
      const next = {};
      for (const [k, b] of Object.entries(all)) next[k] = { ...b, list: b.list.map((m) => (m.gift && m.gift.id === g.id ? { ...m, gift: g } : m)) };
      return next;
    });
  }, []);

  const addContact = useCallback(async (userId) => {
    try { setContacts(await api('POST', '/contacts', { userId })); toast('Added to contacts'); } catch (e) { toast(e.message); }
  }, [toast]);
  const removeContact = useCallback(async (userId) => {
    try { setContacts(await api('DELETE', `/contacts/${userId}`)); toast('Removed from contacts'); } catch (e) { toast(e.message); }
  }, [toast]);
  const removeKept = useCallback((m) => {
    forgetKept(meRef.current.id, m.id);
    setMessages((all) => {
      const b = all[m.chatId]; if (!b) return all;
      return { ...all, [m.chatId]: { ...b, list: b.list.map((x) => (x.id === m.id ? { ...x, deleted: true, keptDeleted: false, text: '', file: null } : x)) } };
    });
  }, []);

  // realtime
  useEffect(() => {
    if (!me) return;
    refreshChats();
    refreshChatPrefs();
    api('GET', '/contacts').then(setContacts).catch(() => {});
    let closed = false, retry = 0, timer;
    const connect = () => {
      const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
      wsRef.current = ws;
      ws.onopen = () => { retry = 0; ws.send(JSON.stringify({ type: 'auth', token: getToken() })); };
      ws.onmessage = (ev) => {
        const e = JSON.parse(ev.data);
        const myId = meRef.current.id;
        if (e.type === 'ready') {
          refreshChats();
          if (activeRef.current) loadMessages(activeRef.current).catch(() => {});
        } else if(e.type==='call:signal') { window.dispatchEvent(new CustomEvent('messenger-call-signal',{detail:e})); if(e.signal?.type==='offer')setModal({t:'call',chatId:e.chatId,incoming:e.signal}); }
        else if (e.type === 'presence') {
          setChats((cs) => cs.map((c) => (c.peer?.id === e.userId ? { ...c, peer: { ...c.peer, online: e.online, lastSeen: e.lastSeen ?? c.peer.lastSeen } } : c)));
        } else if (e.type === 'user:update') {
          const u = e.user;
          setChats((cs) => cs.map((c) => (c.peer?.id === u.id ? { ...c, peer: { ...c.peer, ...u }, title: u.displayName } : c)));
          setMessages((all) => {
            const next = {};
            for (const [k, b] of Object.entries(all)) {
              next[k] = { ...b, list: b.list.map((m) => (m.sender.id === u.id ? { ...m, sender: { ...m.sender, displayName: u.displayName, username: u.username, avatar: u.avatar } } : m)) };
            }
            return next;
          });
          if (u.id === myId) setMe((cur) => (cur ? { ...cur, displayName: u.displayName, username: u.username, bio: u.bio, avatar: u.avatar, statusEmoji: u.statusEmoji, cover: u.cover, music: u.music } : cur));
        } else if (e.type === 'message:new') {
          const m = e.message;
          const own = m.sender.id === myId;
          if (!own) {
            clearTimeout(typingTimers.current[m.chatId]);
            setTyping((t) => { const n = { ...t }; delete n[m.chatId]; return n; });
          }
          const viewing = activeRef.current === m.chatId && document.visibilityState === 'visible';
          if (!own && !viewing && m.kind !== 'system') {
            const st = settingsRef.current;
            const quiet = Number(st.quietUntil||0) > Date.now();
            if (!quiet && st.sound) beep();
            if (!quiet && st.notify && document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') {
              try { new Notification(m.sender.displayName, { body: preview(m), tag: 'chat' + m.chatId }); } catch { /* ignore */ }
            }
          }
          if (!chatsRef.current.some((c) => c.id === m.chatId)) { refreshChats(); return; }
          mergeMessage(m);
          if (own) return;
          if (viewing) markRead(m.chatId, m.id);
          else patchChat(m.chatId, (c) => ({ ...c, unread: c.unread + (m.kind === 'system' ? 0 : 1) }));
        } else if (e.type === 'message:update') mergeMessage(e.message);
        else if (e.type === 'message:reactions') applyReactions(e.chatId, e.id, e.reactions);
        else if (e.type === 'message:delete') {
          // only text/file messages from others that this client already has can be kept
          const prev = messagesRef.current[e.chatId]?.list.find((m) => m.id === e.id);
          const keepIt = !!(settingsRef.current.keepDeleted && prev && !prev.deleted && prev.sender.id !== myId && (prev.kind === 'text' || prev.kind === 'file'));
          if (keepIt) rememberKept(myId, prev);
          setMessages((all) => {
            const b = all[e.chatId]; if (!b) return all;
            return { ...all, [e.chatId]: { ...b, list: b.list.map((m) => {
              if (m.id !== e.id) return m;
              if (keepIt) return { ...m, keptDeleted: true, file: m.file ? { ...m.file, gone: true } : null };
              return { ...m, deleted: true, text: '', file: null, gift: null };
            }) } };
          });
          setChats((cs) => cs.map((c) => (c.id === e.chatId && c.lastMessage?.id === e.id ? { ...c, lastMessage: { ...c.lastMessage, deleted: true } } : c)));
        } else if (e.type === 'read') {
          if (e.userId !== myId) patchChat(e.chatId, (c) => ({ ...c, peerRead: Math.max(c.peerRead, e.messageId) }));
        } else if (e.type === 'typing') {
          setTyping((t) => ({ ...t, [e.chatId]: { name: e.name } }));
          clearTimeout(typingTimers.current[e.chatId]);
          typingTimers.current[e.chatId] = setTimeout(() => setTyping((t) => { const n = { ...t }; delete n[e.chatId]; return n; }), 4000);
        } else if (e.type === 'chat:refresh') { refreshChats(); if (activeRef.current === e.chatId) loadMessages(e.chatId).catch(() => {}); }
        else if (e.type === 'announce') setAnnounce(e.text);
        else if (e.type === 'stars') { setMe((cur) => (cur ? { ...cur, stars: e.stars } : cur)); api('GET', '/me').then(setMe).catch(() => {}); }
        else if (e.type === 'wallet:refresh') { api('GET', '/me').then(setMe).catch(() => {}); }
        else if (e.type === 'level') { api('GET', '/me').then(setMe).catch(() => {}); toast(`${e.icon} New level: ${e.level} · ${e.title}!`); }
        else if (e.type === 'chat:removed') { setChats((cs) => cs.filter((c) => c.id !== e.chatId)); if (activeRef.current === e.chatId) setActiveId(null); }
        else if (e.type === 'gift:received') { toast(`You received ${e.gift.type.name} from ${e.gift.sender.displayName}`); mergeGift(e.gift); }
      };
      ws.onclose = (ev) => {
        if (closed) return;
        if (ev.code === 4003) { logout(); return; }
        timer = setTimeout(connect, Math.min(1000 * 2 ** retry++, 15000));
      };
    };
    connect();
    return () => { closed = true; clearTimeout(timer); wsRef.current?.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  // keep unread cleared when tab becomes visible again
  useEffect(() => {
    const h = () => {
      const id = activeRef.current; const l = messagesRef.current[id]?.list;
      if (document.visibilityState === 'visible' && id && l?.length) markRead(id, l[l.length - 1].id);
    };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [markRead]);

  // title badge
  const totalUnread = useMemo(() => chats.reduce((s, c) => s + c.unread, 0), [chats]);
  useEffect(() => { document.title = totalUnread ? `(${totalUnread}) ${APP.name}` : APP.name; }, [totalUnread]);

  if (booting) return null;
  if (!me) return <Auth onAuth={setMe} />;

  const ctx = {
    me, setMe, chats, activeId, messages, typing, setModal, toast, wsSend, chatPrefs, folders, setChatPreference, refreshChatPrefs, updatePoll,
    openChat, openPrivate, joinChat, leaveChat, closeChat: () => setActiveId(null), logout,
    sendMessage, editMessage, deleteMessage, loadOlder, mergeMessage, mergeGift, giftsVersion, react, refreshChats,
    settings, updateSettings, settingsStart: settingsOpen,
    contacts, addContact, removeContact, removeKept,
    openSettings: (page = 'main') => setSettingsOpen(page),
    closeSettings: () => setSettingsOpen(null),
  };
  return (
    <Ctx.Provider value={ctx}>
      <div className={'app' + (activeId ? ' chat-open' : '')}>
        {settingsOpen ? <SettingsPanel key={settingsOpen} /> : <Sidebar />}
        <ChatView />
        <MiniPlayer />
      </div>
      {modal?.t === 'admin' && <AdminPanel />}
      {modal?.t === 'poll-create' && <CreatePollModal chatId={modal.chatId} />}
      {modal?.t === 'devices' && <DevicesModal />}
      {modal?.t === 'privacy' && <PrivacyModal />}
      {modal?.t === 'qr-profile' && <QRProfileModal />}
      {modal?.t === 'media' && <MediaCenterModal chatId={modal.chatId} />}
      {modal?.t === 'call' && <CallModal chatId={modal.chatId} incoming={modal.incoming} />}
      {announce && <div className="announce" role="alert"><span>📣 {announce}</span><button onClick={() => setAnnounce(null)} aria-label="Dismiss announcement">✕</button></div>}
      {modal?.t === 'shop' && <GiftShop chatId={modal.chatId} self={modal.self} modal={modal} />}
      {modal?.t === 'gift' && <GiftDetail gift={modal.gift} key={modal.gift.id} />}
      {modal?.t === 'user' && <UserProfile id={modal.id} key={modal.id} />}
      {modal?.t === 'new' && <NewChat kind={modal.kind} />}
      {modal?.t === 'info' && <ChatInfo chatId={modal.chatId} />}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </Ctx.Provider>
  );
}

createRoot(document.getElementById('root')).render(<App />);
