// Appearance settings live on the device (localStorage), like Telegram's per-device theme.
export const ACCENTS = [
  { id: '#3390ec', name: 'Blue' },
  { id: '#2fa66a', name: 'Green' },
  { id: '#7c5cf0', name: 'Violet' },
  { id: '#e0518a', name: 'Pink' },
  { id: '#f08a24', name: 'Orange' },
  { id: '#e24c4c', name: 'Red' },
  { id: '#1fb5b0', name: 'Teal' },
];

export const WALLPAPERS = [
  { id: 'classic', name: 'Classic', light: 'linear-gradient(160deg,#d8e6c8,#b9d6c4)', dark: '#0e1621' },
  { id: 'sky', name: 'Sky', light: 'linear-gradient(160deg,#cfe5fb,#e9f2fc)', dark: 'linear-gradient(160deg,#0f2233,#14304a)' },
  { id: 'sunset', name: 'Sunset', light: 'linear-gradient(160deg,#fde2c8,#f7c2d3)', dark: 'linear-gradient(160deg,#2a1530,#3b1c2c)' },
  { id: 'violet', name: 'Violet', light: 'linear-gradient(160deg,#e3d9fb,#cfd8fb)', dark: 'linear-gradient(160deg,#1b1533,#242058)' },
  { id: 'mint', name: 'Mint', light: 'linear-gradient(160deg,#d3f3e6,#c9e9f2)', dark: 'linear-gradient(160deg,#0d2622,#10313a)' },
  { id: 'peach', name: 'Peach', light: 'linear-gradient(160deg,#ffe3d1,#ffc9c9)', dark: 'linear-gradient(160deg,#2e1a1a,#3d2224)' },
  { id: 'ocean', name: 'Ocean', light: 'linear-gradient(160deg,#c4e6f5,#9fd0ee)', dark: 'linear-gradient(160deg,#071c2e,#0b3556)' },
  { id: 'forest', name: 'Forest', light: 'linear-gradient(160deg,#cfe8cf,#a9d4b4)', dark: 'linear-gradient(160deg,#0d2316,#143a26)' },
  { id: 'lavender', name: 'Lavender', light: 'linear-gradient(160deg,#ece0fa,#d9d0f5)', dark: 'linear-gradient(160deg,#1d1730,#2b2350)' },
  { id: 'rose', name: 'Rose', light: 'linear-gradient(160deg,#fbd9e5,#f2bfd4)', dark: 'linear-gradient(160deg,#2f1420,#451c33)' },
  { id: 'sand', name: 'Sand', light: 'linear-gradient(160deg,#f3e6cc,#e8d3a8)', dark: 'linear-gradient(160deg,#2a2214,#3b3019)' },
  { id: 'graphite', name: 'Graphite', light: 'linear-gradient(160deg,#d9dde3,#c3c9d2)', dark: 'linear-gradient(160deg,#14171c,#1f242c)' },
  { id: 'aurora', name: 'Aurora', light: 'linear-gradient(160deg,#cdf5e8,#d6cffa)', dark: 'linear-gradient(160deg,#0a2a2a,#1c1a4a)' },
  { id: 'candy', name: 'Candy', light: 'linear-gradient(160deg,#ffd6ec,#d6e4ff)', dark: 'linear-gradient(160deg,#2d1530,#14224a)' },
  { id: 'citrus', name: 'Citrus', light: 'linear-gradient(160deg,#fff2b8,#ffd9a0)', dark: 'linear-gradient(160deg,#2a2408,#3a2a0c)' },
  { id: 'ice', name: 'Ice', light: 'linear-gradient(160deg,#e6f4ff,#d3e8f8)', dark: 'linear-gradient(160deg,#0c1e2e,#112f45)' },
  { id: 'midnight', name: 'Midnight', light: 'linear-gradient(160deg,#c9cdf2,#a9b0e6)', dark: 'linear-gradient(160deg,#05060f,#0d0f2b)' },
  { id: 'dusk', name: 'Dusk', light: 'linear-gradient(160deg,#ffd8c2,#c9b6f2)', dark: 'linear-gradient(160deg,#2a1838,#14123a)' },
  { id: 'lagoon', name: 'Lagoon', light: 'linear-gradient(160deg,#bdf0ee,#b5d6f7)', dark: 'linear-gradient(160deg,#062a33,#0a1f40)' },
  { id: 'mocha', name: 'Mocha', light: 'linear-gradient(160deg,#efdcc8,#d8bda0)', dark: 'linear-gradient(160deg,#241811,#38261b)' },
  { id: 'blossom', name: 'Blossom', light: 'linear-gradient(160deg,#ffe0ea,#ffd0c2)', dark: 'linear-gradient(160deg,#33151f,#3a1a22)' },
  { id: 'neon', name: 'Neon', light: 'linear-gradient(160deg,#e4d6ff,#bdf5ff)', dark: 'linear-gradient(160deg,#12062b,#05243a)' },
  { id: 'moss', name: 'Moss', light: 'linear-gradient(160deg,#dbe9c3,#bcd69a)', dark: 'linear-gradient(160deg,#141f0b,#22331a)' },
  { id: 'storm', name: 'Storm', light: 'linear-gradient(160deg,#cfd6e0,#aab6c6)', dark: 'linear-gradient(160deg,#0e131b,#1c2736)' },
  { id: 'lemonade', name: 'Lemonade', light: 'linear-gradient(160deg,#fff7c2,#ffe3d1)', dark: 'linear-gradient(160deg,#2b2a0c,#352212)' },
  { id: 'cherry', name: 'Cherry', light: 'linear-gradient(160deg,#ffc9d1,#f7a8b8)', dark: 'linear-gradient(160deg,#3a0f1a,#240812)' },
  { id: 'glacier', name: 'Glacier', light: 'linear-gradient(160deg,#dff6fb,#c3e3f4)', dark: 'linear-gradient(160deg,#082230,#0e3447)' },
  { id: 'amethyst', name: 'Amethyst', light: 'linear-gradient(160deg,#e9d2fb,#d0b5f2)', dark: 'linear-gradient(160deg,#210c33,#341455)' },
  { id: 'ember', name: 'Ember', light: 'linear-gradient(160deg,#ffd2b0,#ffb894)', dark: 'linear-gradient(160deg,#34120a,#4a1a0c)' },
  { id: 'mist', name: 'Mist', light: 'linear-gradient(160deg,#e9edf2,#dde3ea)', dark: 'linear-gradient(160deg,#171b21,#222830)' },
  { id: 'jungle', name: 'Jungle', light: 'linear-gradient(160deg,#bfe8c2,#8fd1a5)', dark: 'linear-gradient(160deg,#05200f,#0b3a22)' },
  { id: 'plain', name: 'Plain', light: '#eef0f2', dark: '#101820' },
];

// Colour skins: restyle the dark theme (and give the light theme a tinted accent surface).
export const SKINS = [
  { id: 'default', name: 'Classic', a: '#17212b', b: '#0e1621' },
  { id: 'midnight', name: 'Midnight', a: '#0b0d1a', b: '#161a33' },
  { id: 'dusk', name: 'Dusk', a: '#241532', b: '#3a1f3f' },
  { id: 'forest', name: 'Forest', a: '#0f2019', b: '#17352a' },
  { id: 'amoled', name: 'AMOLED', a: '#000000', b: '#0b0b0b' },
  { id: 'mocha', name: 'Mocha', a: '#241a14', b: '#3a2a20' },
];

export const DEFAULTS = {
  font: 'inter', corners: 'normal', density: 'cozy', greeting: true,
  skin: 'default',
  gradBubbles: true,
  theme: 'system', // light | dark | system
  accent: '#3390ec',
  wallpaper: 'classic',
  pattern: true,
  fontScale: 100, // % of message text size
  radius: 14, // bubble corner radius, px
  motion: true, // animations
  bigEmoji: true,
  wpDim: 0, // % darkening for a custom wallpaper
  wpRev: 0, // bumped when the custom wallpaper image is replaced
  keepDeleted: false, // keep a local copy of messages others delete after they were delivered
  sound: true,
  notify: false, // desktop notifications
};

export function loadSettings() {
  try {
    const s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('settings') || '{}') };
    if (!ACCENTS.some((a) => a.id === s.accent)) s.accent = DEFAULTS.accent;
    return s;
  } catch {
    return { ...DEFAULTS };
  }
}

// A custom wallpaper image is stored on this device only (resized JPEG data URL).
const WP_KEY = 'wallpaper-custom';
export function getCustomWallpaper() {
  try { return localStorage.getItem(WP_KEY); } catch { return null; }
}
export function setCustomWallpaper(dataUrl) {
  try { localStorage.setItem(WP_KEY, dataUrl); return true; } catch { return false; }
}
export function clearCustomWallpaper() {
  try { localStorage.removeItem(WP_KEY); } catch { /* ignore */ }
}

export function saveSettings(s) {
  try { localStorage.setItem('settings', JSON.stringify(s)); } catch { /* storage blocked */ }
}

const prefersDark = () => !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
export const effectiveTheme = (s) => (s.theme === 'system' ? (prefersDark() ? 'dark' : 'light') : s.theme);

export function applySettings(s) {
  const root = document.documentElement;
  const theme = effectiveTheme(s);
  const wp = WALLPAPERS.find((w) => w.id === s.wallpaper) || WALLPAPERS[0];
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  root.style.setProperty('--accent', s.accent);
  let bg = wp[theme];
  if (s.wallpaper === 'custom') {
    const img = getCustomWallpaper();
    if (img) {
      const d = Math.max(0, Math.min(80, s.wpDim)) / 100;
      bg = `linear-gradient(rgba(0,0,0,${d}),rgba(0,0,0,${d})), url("${img}") center / cover no-repeat`;
    } else bg = WALLPAPERS[0][theme];
  }
  root.style.setProperty('--chat-bg', bg);
  root.style.setProperty('--fs', String(s.fontScale / 100));
  root.style.setProperty('--bubble-r', s.radius + 'px');
  root.dataset.font = s.font || 'inter';
  root.dataset.corners = s.corners || 'normal';
  root.dataset.density = s.density || 'cozy';
  root.dataset.skin = SKINS.some((k) => k.id === s.skin) ? s.skin : 'default';
  root.dataset.bubbles = s.gradBubbles ? 'grad' : 'flat';
  root.dataset.motion = s.motion ? 'on' : 'off';
  root.dataset.pattern = s.pattern ? 'on' : 'off';
}
