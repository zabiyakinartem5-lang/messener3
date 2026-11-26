// Lucky wheel and achievements. Everything is virtual Stars; nothing here touches real money.
const WHEEL = [
  { id: 's10', label: '10', emoji: '⭐', w: 300, stars: 10 },
  { id: 's25', label: '25', emoji: '⭐', w: 250, stars: 25 },
  { id: 'gift', label: 'Gift', emoji: '🎁', w: 70, gift: true },
  { id: 's50', label: '50', emoji: '🌟', w: 180, stars: 50 },
  { id: 's100', label: '100', emoji: '💫', w: 110, stars: 100 },
  { id: 'prem', label: '1 day ✨', emoji: '✨', w: 30, premiumDays: 1 },
  { id: 's250', label: '250', emoji: '🌠', w: 50, stars: 250 },
  { id: 's1000', label: '1000', emoji: '💎', w: 10, stars: 1000 },
];
const WHEEL_COOLDOWN_H = 20;
const WHEEL_COOLDOWN_PREMIUM_H = 10;
function rollWheel(rand = Math.random) {
  const total = WHEEL.reduce((a, s) => a + s.w, 0);
  let r = rand() * total;
  for (let i = 0; i < WHEEL.length; i++) { r -= WHEEL[i].w; if (r < 0) return i; }
  return 0;
}

// [id, emoji, title, description, metric, need, reward]
const ACHIEVEMENTS = [
  ['first_words', '💬', 'First words', 'Send your first message', 'messages', 1, 10],
  ['chatterbox', '🗣️', 'Chatterbox', 'Send 100 messages', 'messages', 100, 50],
  ['socialite', '🎤', 'Socialite', 'Send 1000 messages', 'messages', 1000, 200],
  ['reactor', '😍', 'Reactor', 'React to 25 messages', 'reactions', 25, 40],
  ['first_gift', '🎁', 'First gift', 'Own a gift', 'gifts', 1, 15],
  ['collector', '🧺', 'Collector', 'Own 10 gifts', 'gifts', 10, 100],
  ['hoarder', '🏺', 'Hoarder', 'Own 30 gifts', 'gifts', 30, 400],
  ['generous', '💝', 'Generous', 'Send 5 gifts to other people', 'sent', 5, 80],
  ['upgrader', '✨', 'Upgrader', 'Upgrade a gift to a collectible', 'upgraded', 1, 40],
  ['rare_find', '🔮', 'Rare find', 'Pull a model rarer than 5%', 'rareModels', 1, 150],
  ['dimension', '🧊', 'Third dimension', 'Own a 3D model gift', 'models3d', 1, 60],
  ['spender', '💸', 'Big spender', 'Spend 1000 Stars', 'spent', 1000, 120],
  ['level5', '🏅', 'Level 5', 'Reach profile level 5', 'level', 5, 150],
  ['vip', '👑', 'VIP', 'Get Premium', 'premium', 1, 100],
  ['lucky', '🍀', 'Lucky streak', 'Spin the lucky wheel 7 times', 'spins', 7, 70],
];
module.exports = { WHEEL, WHEEL_COOLDOWN_H, WHEEL_COOLDOWN_PREMIUM_H, rollWheel, ACHIEVEMENTS };
