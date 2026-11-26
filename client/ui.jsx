import React, { useState, useEffect, useRef } from 'react';
import { api, initials } from './api.js';
import { useApp } from './ctx.js';

export const GRADS = [
  ['#ff885e', '#ff516a'], ['#ffcd6a', '#ffa85c'], ['#82b1ff', '#665fff'], ['#a0de7e', '#54cb68'],
  ['#53edd6', '#28c9b7'], ['#72d5fd', '#2a9ef1'], ['#e0a2f3', '#d669ed'], ['#ff8aa6', '#f0507c'],
];

export function Avatar({ name, color = 0, size = 48, src }) {
  const g = GRADS[Math.abs(color) % GRADS.length];
  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(${g[0]},${g[1]})` }}>
      {src ? <img src={src} alt="" /> : initials(name)}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function TypingDots() {
  return <span className="dots" aria-hidden="true"><i /><i /><i /></span>;
}

export function Switch({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={'switch' + (checked ? ' on' : '')} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

// Drag-to-spin: pointer drag sets the angle, release keeps the momentum, idle slowly sways.
export function useSpin({ auto = 0.25, tilt = true } = {}) {
  const [a, setA] = useState({ y: 0, x: 0 });
  const st = useRef({ y: 0, x: 0, vy: 0, down: false, lx: 0, ly: 0, idle: true });
  useEffect(() => {
    let raf; const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const tick = () => {
      const o = st.current;
      if (!o.down) {
        o.y += o.vy; o.vy *= 0.94;
        if (Math.abs(o.vy) < 0.05 && o.idle && !reduce) o.y += auto;
        o.x *= 0.92;
      }
      setA({ y: o.y, x: o.x });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [auto]);
  const h = {
    onPointerDown: (e) => { const o = st.current; o.down = true; o.idle = false; o.lx = e.clientX; o.ly = e.clientY; o.vy = 0; e.currentTarget.setPointerCapture?.(e.pointerId); },
    onPointerMove: (e) => { const o = st.current; if (!o.down) return; const dx = e.clientX - o.lx, dy = e.clientY - o.ly; o.lx = e.clientX; o.ly = e.clientY; o.y += dx * 0.8; o.vy = dx * 0.8; if (tilt) o.x = Math.max(-35, Math.min(35, o.x - dy * 0.4)); },
    onPointerUp: () => { const o = st.current; o.down = false; setTimeout(() => { o.idle = true; }, 2500); },
    onPointerCancel: () => { st.current.down = false; },
    onKeyDown: (e) => { if (e.key === 'ArrowLeft') st.current.vy -= 12; if (e.key === 'ArrowRight') st.current.vy += 12; },
  };
  const flip = () => { st.current.vy = 22; st.current.idle = false; setTimeout(() => { st.current.idle = true; }, 2500); };
  return { ...a, h, flip };
}

// An extruded 3D figurine: the emoji repeated on stacked layers so it has real thickness.
export function Model3D({ emoji, layers = 9, gap = 3, ry, rx = 0, className = '' }) {
  const n = layers;
  return (
    <div className={'m3d ' + className} aria-hidden="true">
      <div className="m3d-obj" style={ry !== undefined ? { transform: `rotateX(${rx}deg) rotateY(${ry}deg)`, animation: 'none' } : undefined}>
        {Array.from({ length: n }).map((_, i) => (
          <span key={i} style={{ transform: `translateZ(${((i - (n - 1) / 2) * gap).toFixed(1)}px)`, filter: i === n - 1 ? 'none' : `brightness(${(0.45 + 0.4 * (i / (n - 1))).toFixed(2)})` }}>{emoji}</span>
        ))}
      </div>
      <i className="m3d-shadow" />
    </div>
  );
}

export function SpinCard({ gift, reveal }) {
  const t = gift.type;
  const sp = useSpin({ auto: t.model3d ? 0.5 : 0.35, tilt: true });
  const up = gift.upgraded && gift.attrs;
  const norm = ((sp.y % 360) + 360) % 360;
  const back = !t.model3d && norm > 90 && norm < 270;
  return (
    <div className={'spin-wrap' + (reveal ? ' reveal' : '')}>
      <div className="spin-stage" tabIndex={0} role="img" aria-label={`${t.name}, drag to rotate`} {...sp.h}>
        {t.model3d ? (
          <GiftCard gift={gift} big reveal={reveal} spin={{ ry: sp.y, rx: sp.x }} />
        ) : (
          <div className="spin-card" style={{ transform: `rotateX(${sp.x}deg) rotateY(${sp.y}deg)` }}>
            <div className="spin-face front"><GiftCard gift={gift} big reveal={reveal} /></div>
            <div className="spin-face back" aria-hidden={!back}>
              <div className="spin-back" style={{ background: up ? `linear-gradient(160deg, ${gift.attrs.backdrop.c2 || '#222'}, #111)` : `linear-gradient(160deg, ${t.color}55, #111)` }}>
                <div className="sb-title">{t.name}</div>
                <div className={'sb-tier tier-' + t.rarity}>{t.rarity}</div>
                {up ? (
                  <>
                    <div className="sb-line">{gift.attrs.model.emoji} {gift.attrs.model.name} <small>{gift.attrs.model.rarity}%</small></div>
                    <div className="sb-line">🎨 {gift.attrs.backdrop.name} <small>{gift.attrs.backdrop.rarity}%</small></div>
                    <div className="sb-line">{gift.attrs.pattern.emoji} {gift.attrs.pattern.name} <small>{gift.attrs.pattern.rarity}%</small></div>
                    {gift.attrs.finish && <div className="sb-line">✨ {gift.attrs.finish.name} <small>{gift.attrs.finish.rarity}%</small></div>}
                    <div className="sb-no">#{gift.collectibleNo}</div>
                    {gift.token && <code>{gift.token}</code>}
                  </>
                ) : (
                  <>
                    <div className="sb-line">{t.limited ? `Limited edition of ${t.supply}` : 'Classic gift'}</div>
                    {gift.serial && <div className="sb-no">#{gift.serial}</div>}
                    <div className="sb-line"><small>Upgrade it to reveal a random model, backdrop and pattern</small></div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="spin-hint"><span>👆 Drag to spin</span><button type="button" className="spin-btn" onClick={sp.flip}>↻ Spin</button></div>
    </div>
  );
}

export function GiftCard({ gift, big, reveal, spin }) {
  const t = gift.type;
  if (gift.upgraded && gift.attrs) {
    const b = gift.attrs.backdrop;
    const fin = (gift.attrs.finish?.name || 'Satin').toLowerCase();
    const rare = gift.attrs.model.rarity <= 5;
    return (
      <div className={'gift-card upgraded finish-' + fin + (rare ? ' rare' : '') + (big ? ' big' : '') + (reveal ? ' reveal' : '')} style={{ background: `radial-gradient(circle at 50% 35%, ${b.c1}, ${b.c2})` }}>
        <div className="pattern" aria-hidden="true">
          {Array.from({ length: 12 }).map((_, i) => (
            <span key={i} style={{ left: `${(i * 37) % 90 + 3}%`, top: `${(i * 53) % 85 + 4}%`, fontSize: 14 + (i % 3) * 6 }}>{gift.attrs.pattern.emoji}</span>
          ))}
        </div>
        <i className="shine" aria-hidden="true" />
        {t.model3d ? <Model3D emoji={gift.attrs.model.emoji || t.emoji} layers={big ? 14 : 6} gap={big ? 4 : 3} ry={spin?.ry} rx={spin?.rx} /> : <div className="gift-emoji">{gift.attrs.model.emoji || t.emoji}</div>}
        <div className="gift-name">{t.name}</div>
        <div className="gift-sub">{gift.attrs.model.name} · #{gift.collectibleNo}</div>
      </div>
    );
  }
  return (
    <div className={'gift-card' + (big ? ' big' : '')} style={{ background: `linear-gradient(160deg, ${t.color}55, ${t.color}22)` }}>
      {t.model3d ? <Model3D emoji={t.emoji} layers={big ? 14 : 6} gap={big ? 4 : 3} ry={spin?.ry} rx={spin?.rx} /> : <div className="gift-emoji">{t.emoji}</div>}
      <div className="gift-name">{t.name}</div>
      {t.limited && gift.serial && <div className="gift-sub">#{gift.serial} of {t.supply}</div>}
    </div>
  );
}

export function Collection({ userId }) {
  const { setModal, giftsVersion } = useApp();
  const [gifts, setGifts] = useState(null);
  useEffect(() => { api('GET', `/users/${userId}/gifts`).then(setGifts).catch(() => setGifts([])); }, [userId, giftsVersion]);
  if (!gifts) return <div className="muted">Loading gifts…</div>;
  if (!gifts.length) return <div className="muted">No gifts yet.</div>;
  return (
    <div className="collection">
      {gifts.map((g) => (
        <button key={g.id} onClick={() => setModal({ t: 'gift', gift: g })} aria-label={g.type.name}><GiftCard gift={g} /></button>
      ))}
    </div>
  );
}

// Gifts pinned to a profile background, floating on the right side of the banner.
export function CoverDeco({ cover }) {
  const gifts = cover?.gifts;
  if (!gifts?.length) return null;
  return (
    <div className="cover-deco" aria-hidden="true">
      {gifts.map((g, i) => <span key={g.id} className={'cover-gift g' + i} title={g.type.name}>{g.type.emoji}</span>)}
    </div>
  );
}

// the possible versions (models) of a gift, with their chance, shown before upgrading
export function ModelStrip({ models }) {
  if (!models?.length) return null;
  return (
    <div className="model-strip" aria-label="Possible models">
      {models.map((m) => (
        <div key={m.name} className={'model-chip' + (m.rarity <= 5 ? ' rare' : '')} title={`${m.name} · ${m.rarity}%`}>
          <span>{m.emoji || '🎁'}</span><small>{m.name}</small><em>{m.rarity}%</em>
        </div>
      ))}
    </div>
  );
}

export function LevelBadge({ level }) {
  return <span className={'lvl-badge lvl-' + Math.min(10, level.n)} title={`Level ${level.n} · ${level.title}`}>{level.icon} Lv {level.n} · {level.title}</span>;
}

export function LevelBar({ me }) {
  const L = me.levelInfo;
  const pct = L.max ? 100 : Math.min(100, Math.round(((me.starsSpent - L.from) / (L.next - L.from)) * 100));
  return (
    <div className="lvl-card">
      <div className="lvl-top"><LevelBadge level={{ n: L.n, title: L.title, icon: L.icon }} /><small>⭐ {me.starsSpent} spent</small></div>
      <div className="lvl-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: pct + '%' }} /></div>
      <small className="muted">{L.max ? 'Maximum level reached 🌌' : `${L.next - me.starsSpent} more Stars spent to reach level ${L.n + 1}`}</small>
    </div>
  );
}

// What *I* call somebody: my private nickname wins over their display name.
export const nameFor = (me, u) => (u && me?.nicks?.[u.id]) || u?.displayName || '';
