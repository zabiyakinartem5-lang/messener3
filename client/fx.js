const motionOff = () => document.documentElement.dataset.motion === 'off';

// Confetti-style burst of emoji from the middle of the screen (gift sent / upgraded).
export function burst(emojis, count = 28) {
  if (motionOff()) return;
  const list = Array.isArray(emojis) ? emojis : [emojis];
  const layer = document.createElement('div');
  layer.className = 'fx-layer';
  layer.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span');
    s.textContent = list[i % list.length];
    const angle = Math.random() * Math.PI * 2;
    const dist = 140 + Math.random() * 280;
    s.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
    s.style.setProperty('--dy', Math.sin(angle) * dist - 140 + 'px');
    s.style.setProperty('--rot', Math.round(Math.random() * 720 - 360) + 'deg');
    s.style.fontSize = 18 + Math.round(Math.random() * 22) + 'px';
    s.style.animationDelay = Math.round(Math.random() * 120) + 'ms';
    layer.appendChild(s);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 2000);
}

let audio;
// Short two-note notification chime generated with WebAudio (no audio files needed).
export function beep() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.setValueAtTime(1175, t + 0.09);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.35);
  } catch { /* audio unavailable */ }
}
