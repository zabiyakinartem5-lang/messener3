// Profile backgrounds: 40 gradients, optional pattern emoji, or your own photo.
// 80..119: mesh-like multi-layer looks (aurora, neon, metal, duotone)
function extraCover(n) {
  const h = (n * 23 + 10) % 360;
  if (n < 10) return `radial-gradient(circle at 20% 20%, hsl(${h} 90% 60% / .9), transparent 55%), radial-gradient(circle at 80% 30%, hsl(${(h + 80) % 360} 90% 60% / .85), transparent 55%), radial-gradient(circle at 50% 100%, hsl(${(h + 160) % 360} 85% 50%), hsl(${(h + 200) % 360} 60% 15%))`;
  if (n < 20) return `linear-gradient(135deg, #0b0b17, hsl(${h} 80% 18%)), radial-gradient(circle at 80% 20%, hsl(${h} 100% 60% / .6), transparent 50%)`;
  if (n < 30) return `linear-gradient(120deg, hsl(${h} 12% 82%), hsl(${h} 10% 55%) 40%, hsl(${h} 14% 88%) 55%, hsl(${h} 10% 48%))`;
  return `linear-gradient(200deg, hsl(${h} 95% 62%) 0 50%, hsl(${(h + 180) % 360} 85% 45%) 50% 100%)`;
}
export const COVERS = Array.from({ length: 120 }, (_, i) => {
  const h = (i * 9 + 200) % 360;
  const s = 60 + ((i * 7) % 25);
  if (i < 40) return `linear-gradient(135deg, hsl(${h} ${s}% 56%), hsl(${(h + 45 + (i % 5) * 12) % 360} ${s + 5}% 38%))`;
  // second half: soft pastels, dark moody tones, three-colour sunsets and diagonal stripes
  const k = i - 40;
  if (i >= 80) return extraCover(i - 80);
  const hh = (k * 17 + 20) % 360;
  if (k < 10) return `linear-gradient(160deg, hsl(${hh} 85% 82%), hsl(${(hh + 50) % 360} 80% 72%))`;
  if (k < 20) return `linear-gradient(160deg, hsl(${hh} 45% 22%), hsl(${(hh + 40) % 360} 55% 10%))`;
  if (k < 30) return `linear-gradient(135deg, hsl(${hh} 90% 60%), hsl(${(hh + 60) % 360} 85% 55%), hsl(${(hh + 120) % 360} 80% 45%))`;
  return `repeating-linear-gradient(45deg, hsl(${hh} 65% 52%) 0 14px, hsl(${hh} 65% 44%) 14px 28px)`;
});
export const PATTERN_EMOJI = ['🌸', '⭐', '❤️', '🔥', '🌙', '🐱', '🍀', '🎵', '🚀', '💎', '🦄', '❄️', '🦋', '🌊', '🍓', '👻', '🎮', '🐼', '☕', '🌈', '⚡', '🍕', '🎈', '🪐'];

function patternUrl(e) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='84' height='84'><text x='6' y='34' font-size='24' opacity='.32'>${e}</text><text x='48' y='72' font-size='20' opacity='.24'>${e}</text></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
// The first pinned gift decides the look: a collectible brings its own backdrop and pattern.
function giftLook(cover) {
  const g = cover.gifts?.[0];
  if (!g) return null;
  if (g.upgraded && g.attrs) return { bg: `radial-gradient(circle at 70% 40%, ${g.attrs.backdrop.c1}, ${g.attrs.backdrop.c2})`, pat: g.attrs.pattern.emoji };
  return { bg: `linear-gradient(135deg, ${g.type.color}, ${g.type.color}99)`, pat: g.type.emoji };
}
export function coverStyle(cover) {
  if (!cover) return {};
  const gl = giftLook(cover);
  const pat = cover.e || gl?.pat;
  const layers = [];
  if (pat) layers.push(patternUrl(pat));
  if (cover.url) layers.push(`url("${cover.url}")`);
  else if (gl && cover.g == null) layers.push(gl.bg);
  else layers.push(COVERS[cover.g ?? 0] || COVERS[0]);
  const style = { backgroundImage: layers.join(', ') };
  if (cover.url) { style.backgroundSize = pat ? '84px 84px, cover' : 'cover'; style.backgroundPosition = 'center'; }
  else if (pat) style.backgroundSize = '84px 84px, auto';
  return style;
}

// One-click looks: gradient + pattern together.
export const TEMPLATES = [
  ['Sakura', 6, '🌸'], ['Neon Night', 100, '⚡'], ['Cosmos', 91, '🪐'], ['Deep Sea', 17, '🌊'], ['Cozy Cafe', 52, '☕'],
  ['Arcade', 104, '🎮'], ['Candy Pop', 44, '🍓'], ['Frost', 24, '❄️'], ['Meadow', 30, '🍀'], ['Ember', 3, '🔥'],
  ['Unicorn', 83, '🦄'], ['Moonlight', 62, '🌙'], ['Sunset Drive', 71, '🚀'], ['Butterfly', 85, '🦋'], ['Gold Rush', 112, '💎'],
  ['Pizza Party', 74, '🍕'], ['Panda', 118, '🐼'], ['Rainbow', 86, '🌈'], ['Ghost', 108, '👻'], ['Kitty', 47, '🐱'],
  ['Melody', 12, '🎵'], ['Balloons', 94, '🎈'], ['Stripes', 77, '⭐'], ['Love', 2, '❤️'], ['Aurora', 80, '🌈'],
  ['Midnight', 105, '🌙'], ['Silver', 110, ''], ['Duotone', 115, ''], ['Mesh', 82, ''], ['Ink', 102, ''],
].map(([name, g, e]) => ({ name, g, e: e || undefined }));
