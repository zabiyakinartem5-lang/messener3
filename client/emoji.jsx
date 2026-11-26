import React, { useState, useMemo, useRef, useEffect } from 'react';
import { EMOJI } from './emoji-data.js';
import { MORE_FLAGS, KAOMOJI } from './emoji-extra.js';

const FLAGS = [...MORE_FLAGS];
const EMOJI_ALL = { ...EMOJI, flags: FLAGS, text: KAOMOJI };
const TONES = ['', '\u{1F3FB}', '\u{1F3FC}', '\u{1F3FD}', '\u{1F3FE}', '\u{1F3FF}'];
const TONE_ICONS = ['👋', '👋🏻', '👋🏼', '👋🏽', '👋🏾', '👋🏿'];
const toned = (e, tone) => { if (!tone || !/^\p{Emoji_Modifier_Base}/u.test(e)) return e; const [first, ...rest] = [...e.replace(/\uFE0F/g, '')]; return first + tone + rest.join(''); };

const TABS = [
  ['recent', '🕘', 'Recent'], ['smileys', '😀', 'Smileys'], ['people', '👋', 'People'], ['nature', '🐱', 'Nature'],
  ['food', '🍔', 'Food'], ['activity', '⚽', 'Activity'], ['travel', '🚗', 'Travel'], ['objects', '💡', 'Objects'],
  ['symbols', '❤️', 'Symbols'], ['flags', '🏳️', 'Flags'], ['text', '(•‿•)', 'Text faces'],
];
const ALL = Object.values(EMOJI_ALL).flat();

export function getRecent() { try { return JSON.parse(localStorage.getItem('emoji:recent') || '[]'); } catch { return []; } }
function pushRecent(e) {
  try { localStorage.setItem('emoji:recent', JSON.stringify([e, ...getRecent().filter((x) => x !== e)].slice(0, 32))); } catch { /* ignore */ }
}

export function EmojiPicker({ onPick, onClose, keepOpen = true }) {
  const [tab, setTab] = useState(getRecent().length ? 'recent' : 'smileys');
  const [q, setQ] = useState('');
  const [tone, setTone] = useState(() => { try { return Number(localStorage.getItem('emoji:tone') || 0); } catch { return 0; } });
  const chooseTone = (i) => { setTone(i); try { localStorage.setItem('emoji:tone', String(i)); } catch { /* ignore */ } };
  const box = useRef(null);
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose?.();
    const c = (e) => box.current && !box.current.contains(e.target) && !e.target.closest('[data-emoji-toggle]') && onClose?.();
    document.addEventListener('keydown', h); document.addEventListener('mousedown', c);
    return () => { document.removeEventListener('keydown', h); document.removeEventListener('mousedown', c); };
  }, [onClose]);
  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s) return ALL.filter(([, n]) => n.includes(s)).slice(0, 160);
    if (tab === 'recent') return getRecent().map((e) => [e, '']);
    return EMOJI_ALL[tab] || [];
  }, [q, tab]);
  const pick = (e) => { e = toned(e, TONES[tone]); pushRecent(e); onPick(e); if (!keepOpen) onClose?.(); };
  return (
    <div className="emoji-pop" ref={box} role="dialog" aria-label="Emoji picker">
      <input className="emoji-search" placeholder="Search emoji (e.g. heart, cat, flag)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search emoji" autoFocus />
      {!q && (
        <div className="emoji-tabs" role="tablist">
          {TABS.map(([k, ic, name]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} title={name} aria-label={name} onClick={() => setTab(k)}>{ic}</button>)}
        </div>
      )}
      {!q && (tab === 'people' || tab === 'smileys') && (
        <div className="tone-row" role="radiogroup" aria-label="Skin tone">
          {TONE_ICONS.map((ic, i) => <button key={i} role="radio" aria-checked={tone === i} aria-label={'Skin tone ' + (i + 1)} className={tone === i ? 'on' : ''} onClick={() => chooseTone(i)}>{ic}</button>)}
        </div>
      )}
      <div className={'emoji-grid' + (tab === 'text' && !q ? ' text-grid' : '')}>
        {items.map(([e, n], i) => <button key={e + i} title={n} aria-label={n || e} onClick={() => pick(e)}>{toned(e, TONES[tone])}</button>)}
        {!items.length && <div className="emoji-empty">{q ? 'Nothing found' : 'Emoji you use will appear here'}</div>}
      </div>
    </div>
  );
}
