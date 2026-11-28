import React, { useSyncExternalStore } from 'react';

// One shared player, so only one track plays at a time (voice messages, profile music).
const el = typeof Audio !== 'undefined' ? new Audio() : null;
let state = { src: null, title: '', playing: false, time: 0, dur: 0, rate: 1 };
const subs = new Set();
const set = (p) => { state = { ...state, ...p }; subs.forEach((f) => f()); };
if (el) {
  el.preload = 'metadata';
  el.addEventListener('timeupdate', () => set({ time: el.currentTime }));
  el.addEventListener('durationchange', () => set({ dur: isFinite(el.duration) ? el.duration : 0 }));
  el.addEventListener('play', () => set({ playing: true }));
  el.addEventListener('pause', () => set({ playing: false }));
  el.addEventListener('ended', () => set({ playing: false, time: 0 }));
}
export const useAudio = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state);
export function playTrack(src, title) {
  if (!el) return;
  if (state.src === src) { el.paused ? el.play().catch(() => {}) : el.pause(); return; }
  el.src = src; set({ src, title, time: 0, dur: 0 });
  el.play().catch(() => {});
}
export const seekTo = (f) => { if (el && state.dur) el.currentTime = f * state.dur; };
export const setPlaybackRate = (rate) => { if (!el) return; el.playbackRate = rate; set({ rate }); };
export function stopTrack() { if (!el) return; el.pause(); el.removeAttribute('src'); el.load(); set({ src: null, title: '', playing: false, time: 0, dur: 0 }); }
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function AudioMessage({ file }) {
  const a = useAudio();
  const mine = a.src === file.url;
  const voice = /^voice\./.test(file.name);
  const frac = mine && a.dur ? a.time / a.dur : 0;
  const rates = [1, 1.25, 1.5, 2];
  const nextRate = rates[(rates.indexOf(a.rate) + 1) % rates.length];
  return (
    <div className="audio-msg">
      <button className="play-btn" onClick={() => playTrack(file.url, voice ? 'Voice message' : file.name)} aria-label={mine && a.playing ? 'Pause' : 'Play'}>{mine && a.playing ? '❚❚' : '▶'}</button>
      <div className="audio-body">
        <div className="audio-name">{voice ? '🎤 Voice message' : '🎵 ' + file.name}</div>
        <div className="audio-bar" onClick={(e) => { if (!mine) return; const r = e.currentTarget.getBoundingClientRect(); seekTo((e.clientX - r.left) / r.width); }} role="slider" aria-label="Seek" aria-valuenow={Math.round(frac * 100)}>
          <i style={{ width: frac * 100 + '%' }} />
        </div>
        <small>{mine ? fmt(a.time) + (a.dur ? ' / ' + fmt(a.dur) : '') : ''}</small>
        <button className="audio-rate" onClick={() => setPlaybackRate(nextRate)} title="Playback speed">{mine ? a.rate + '×' : '1×'}</button>
      </div>
    </div>
  );
}

export function MiniPlayer() {
  const a = useAudio();
  if (!a.src) return null;
  return (
    <div className="mini-player" role="region" aria-label="Music player">
      <button onClick={() => playTrack(a.src, a.title)} aria-label={a.playing ? 'Pause' : 'Play'}>{a.playing ? '❚❚' : '▶'}</button>
      <span className="mp-title">🎵 {a.title}</span>
      <span className="mp-bar"><i style={{ width: (a.dur ? (a.time / a.dur) * 100 : 0) + '%' }} /></span>
      <button onClick={stopTrack} aria-label="Close player">✕</button>
    </div>
  );
}

export function TrackRow({ music }) {
  const a = useAudio();
  const on = a.src === music.url && a.playing;
  return (
    <button className="track-row" onClick={() => playTrack(music.url, music.title)} aria-label={(on ? 'Pause ' : 'Play ') + music.title}>
      <span className="play-btn small">{on ? '❚❚' : '▶'}</span>
      <span><b>🎵 {music.title}</b><small>Profile music</small></span>
    </button>
  );
}
