// Profile levels grow with the Stars a person has spent (gifts, upgrades, Premium).
const LEVELS = [
  [0, 'Newcomer', '🌱'], [100, 'Explorer', '🧭'], [300, 'Collector', '🎒'], [700, 'Enthusiast', '🔥'], [1500, 'Connoisseur', '🍷'],
  [3000, 'Curator', '🏛️'], [6000, 'Expert', '🎓'], [12000, 'Master', '⚜️'], [25000, 'Legend', '👑'], [50000, 'Mythic', '🌌'],
];
function levelOf(spent) {
  let i = 0;
  while (i + 1 < LEVELS.length && spent >= LEVELS[i + 1][0]) i++;
  const next = LEVELS[i + 1] || null;
  return { n: i + 1, title: LEVELS[i][1], icon: LEVELS[i][2], from: LEVELS[i][0], next: next ? next[0] : null, max: !next };
}
// Premium perks, in one place so the server and the UI text agree.
const PREMIUM = { days: 30, defaultPrice: 400, discountPct: 10, dailyMultiplier: 2, pins: 5 };
module.exports = { LEVELS, levelOf, PREMIUM };
