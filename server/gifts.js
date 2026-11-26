'use strict';
const crypto = require('crypto');

// Attribute tables for upgraded (collectible) gifts. `w` is a weight out of 1000;
// the lower the weight, the rarer the trait.
// Every gift has its own 6 models (different look, not just a different name).
const MODEL_WEIGHTS = [400, 250, 180, 100, 50, 20];
const MODEL_TEXT = {
  heart: '💝 Ribbon,💖 Sparkling,💗 Growing,💓 Beating,💞 Revolving,💘 Cupid',
  teddy: '🧸 Classic Bear,🐻 Brown Bear,🐼 Panda,🐨 Koala,🦁 Lion,🐯 Tiger',
  rose: '🌹 Red Rose,🌷 Tulip,🌺 Hibiscus,🌸 Blossom,💐 Bouquet,🥀 Faded',
  cake: '🎂 Birthday,🧁 Cupcake,🍰 Slice,🍩 Donut,🥧 Pie,🍮 Custard',
  rocket: '🚀 Rocket,🛸 Saucer,🛰️ Satellite,☄️ Comet,🪐 Ringed Planet,🌠 Shooting Star',
  trophy: '🏆 Cup,🥇 Gold,🥈 Silver,🥉 Bronze,🏅 Medal,🎖️ Honor',
  spacecat: '🐱 Tabby,😺 Grinning,😸 Beaming,😻 Smitten,🙀 Startled,🐈 Strolling',
  santa: '🎅 Santa,🤶 Mrs. Claus,🎄 Tree,⛄ Snowman,🦌 Reindeer,🧝 Elf',
  crystal: '🔮 Orb,💠 Gem Flower,🧿 Amulet,🌌 Galaxy,🔯 Star Seal,✨ Stardust',
  crown: '👑 Crown,🤴 Prince,👸 Princess,🏰 Castle,⚜️ Fleur,🛡️ Shield',
  moon: '🌙 Crescent,🌛 First Quarter,🌜 Last Quarter,🌝 Smiling Full,🌚 New Moon,🌕 Full Moon',
  ghost: '👻 Ghost,🎃 Pumpkin,🦇 Bat,🧛 Vampire,🧟 Zombie,🕷️ Spider',
  alien: '👽 Alien,👾 Invader,🤖 Robot,🛸 UFO,🐙 Octopus,🦑 Squid',
  skull: '💀 Skull,☠️ Crossbones,🦴 Bone,😈 Imp,👹 Ogre,🤡 Jester',
  unicorn: '🦄 Unicorn,🌈 Rainbow,🐴 Pony,🎠 Carousel,🦓 Zebra,🪄 Wand',
  phoenix: '🔥 Flame,🦅 Eagle,🦉 Owl,🌋 Volcano,🕊️ Dove,🦜 Parrot',
  dragon: '🐉 Dragon,🐲 Dragon Face,🦖 T-Rex,🦕 Sauropod,🦎 Lizard,🐊 Crocodile',
  ring: '💍 Ring,💎 Gem,📿 Beads,🔱 Trident,💠 Jewel,🪙 Coin',
  diamond: '💎 Diamond,🔷 Blue Tile,🔹 Facet,🧊 Ice,💠 Flower Gem,🔶 Amber',
  ticket: '🎫 Ticket,🎟️ Admission,🎰 Slot,🎪 Circus,🎡 Wheel,🎭 Masks',
  balloon: '🎈 Balloon,🎏 Carp Streamer,🎐 Wind Chime,🪁 Kite,🎀 Ribbon,🎊 Confetti Ball',
  coffee: '☕ Coffee,🍵 Tea,🧋 Bubble Tea,🥤 Soda,🍹 Cocktail,🥛 Milk',
  clover: '🍀 Clover,☘️ Shamrock,🌿 Herb,🌱 Seedling,🌾 Wheat,🌵 Cactus',
  pizza: '🍕 Pizza,🍔 Burger,🌭 Hot Dog,🌮 Taco,🍟 Fries,🥪 Sandwich',
  guitar: '🎸 Guitar,🎷 Sax,🎺 Trumpet,🎻 Violin,🥁 Drums,🎹 Keys',
  gamepad: '🎮 Gamepad,🕹️ Joystick,🎲 Dice,♟️ Chess,🧩 Puzzle,🎯 Target',
  champagne: '🍾 Champagne,🥂 Toast,🍷 Wine,🍸 Martini,🥃 Whisky,🍻 Cheers',
  butterfly: '🦋 Butterfly,🐝 Bee,🐞 Ladybug,🦗 Cricket,🐛 Caterpillar,🪲 Beetle',
  panda: '🐼 Panda,🐧 Penguin,🦊 Fox,🐺 Wolf,🦝 Raccoon,🦔 Hedgehog',
  bolt: '⚡ Bolt,🌩️ Storm,🌪️ Twister,☔ Rain,🌊 Wave,❄️ Frost',
  amulet: '🧿 Evil Eye,🎴 Hanafuda,🏮 Lantern,🪅 Piñata,🎎 Dolls,🎋 Tanabata',
  planet: '🪐 Ringed,🌍 Earth,🌎 Americas,🌏 Asia,🌑 Dark Moon,☀️ Sun',
  icecream: '🍦 Soft Serve,🍧 Shaved Ice,🍨 Ice Cream,🍡 Dango,🍭 Lollipop,🍬 Candy',
  sunflower: '🌻 Sunflower,🌼 Daisy,🌺 Hibiscus,🏵️ Rosette,💮 White Flower,🌷 Tulip',
  camera: '📷 Camera,📸 Flash,🎥 Movie,📹 Camcorder,🎞️ Film,📽️ Projector',
  book: '📚 Books,📖 Open Book,📕 Red Book,📗 Green Book,📘 Blue Book,📙 Orange Book',
  headphones: '🎧 Headphones,🎤 Mic,📻 Radio,📀 Disc,🎼 Score,🔊 Speaker',
  bell: '🔔 Bell,🛎️ Service Bell,📯 Post Horn,📣 Megaphone,📢 Loudspeaker,🔕 Muted',
  octopus: '🐙 Octopus,🦑 Squid,🦀 Crab,🦞 Lobster,🐚 Shell,🐡 Blowfish',
  whale: '🐳 Whale,🐋 Humpback,🐬 Dolphin,🦈 Shark,🐟 Fish,🦭 Seal',
  fireworks: '🎆 Fireworks,🎇 Sparkler,🧨 Firecracker,🎉 Party Popper,🎊 Confetti,✨ Sparkles',
  comet: '☄️ Comet,🌠 Shooting Star,💫 Dizzy,⭐ Star,🌟 Glowing Star,🌌 Milky Way',
  lighthouse: '🗼 Tower,🗽 Statue,🗿 Moai,🏯 Castle,🏛️ Temple,🌉 Bridge',
  key: '🗝️ Old Key,🔑 Key,🔐 Locked,🔓 Unlocked,🔒 Padlock,🚪 Door',
  cookie: '🍪 Cookie,🍩 Donut,🥐 Croissant,🥯 Bagel,🧇 Waffle,🥞 Pancakes',
  watermelon: '🍉 Watermelon,🍓 Strawberry,🍒 Cherries,🍑 Peach,🍍 Pineapple,🥭 Mango',
  sunshine: '🌞 Sunshine,🌤️ Fair Day,⛅ Cloudy Sun,🌈 Rainbow,🌅 Sunrise,🌇 Dusk',
  snowflake: '❄️ Snowflake,⛄ Snowman,🧊 Ice Cube,🌨️ Snowfall,🎿 Ski,🛷 Sled',
  palette: '🎨 Palette,🖌️ Brush,🖍️ Crayon,🖼️ Frame,✏️ Pencil,📐 Ruler',
  telescope: '🔭 Telescope,🔬 Microscope,🧪 Test Tube,⚗️ Alembic,🧬 DNA,🧲 Magnet',
  bicycle: '🚲 Bike,🛴 Scooter,🛹 Skateboard,🏍️ Motorbike,🚁 Helicopter,⛵ Sailboat',
  pearl: '🐚 Shell,🦪 Oyster,🐠 Tropical Fish,🐙 Octopus,🦀 Crab,🏝️ Island',
  rabbit: '🐇 Rabbit,🐰 Bunny,🥕 Carrot,🐿️ Chipmunk,🦌 Deer,🐑 Sheep',
  peacock: '🦚 Peacock,🦜 Parrot,🦢 Swan,🦩 Flamingo,🐓 Rooster,🦆 Duck',
  hourglass: '⏳ Hourglass,⌛ Sand Timer,⏰ Alarm,⏱️ Stopwatch,📅 Calendar,🗓️ Planner',
  compass: '🧭 Compass,🗺️ Map,🏔️ Mountain,⛺ Tent,🏕️ Camp,🌄 Sunrise Peak',
  eagle: '🦅 Eagle,🦉 Owl,🦇 Bat,🕊️ Dove,🦢 Swan,🐦 Bird',
  castle: '🏰 Castle,🏯 Pagoda,🏛️ Temple,🗼 Tower,🏟️ Stadium,🌉 Bridge',
  trident: '🔱 Trident,⚓ Anchor,🌊 Wave,🧜 Mermaid,🦈 Shark,🐋 Whale',
  galaxy: '🌌 Galaxy,🌠 Meteor,🪐 Planet,☄️ Comet,🌙 Moon,🛰️ Satellite',
  infinity: '♾️ Infinity,♻️ Cycle,🔄 Loop,🌀 Spiral,⚛️ Atom,🔆 Radiance',
  egg: '🥚 Egg,🐣 Hatching,🐥 Chick,🐤 Baby Chick,🐔 Hen,🍳 Fried Egg',
  clock: '🕰️ Clock,⏲️ Timer,🕛 Midnight,🕐 One,🕓 Four,🕘 Nine',
  blackhole: '🕳️ Hole,🌀 Vortex,🌑 New Moon,⚫ Orb,🔮 Crystal Ball,🌌 Galaxy',
  robot3d: '🤖 Robot,👾 Pixel Alien,🎮 Gamepad Bot,🦾 Mech Arm,📟 Retro Pager,🧠 Brain Bot',
  rocket3d: '🚀 Rocket,🛸 UFO,🛰️ Satellite,🪂 Capsule,✈️ Jet,🚁 Chopper',
  dragon3d: '🐉 Dragon,🦖 T-Rex,🦕 Sauropod,🐲 Drake,🦎 Lizard,🐊 Croc',
  racecar: '🏎️ Race Car,🚓 Patrol Car,🚕 Taxi,🚜 Tractor,🚑 Ambulance,🛻 Pickup',
  teddy3d: '🧸 Teddy,🐻 Bear,🐼 Panda,🐨 Koala,🦊 Fox,🐯 Tiger',
  statue: '🗽 Statue,🗿 Moai,🏺 Amphora,⚱️ Urn,🔱 Trident,👑 Crown',
  ufo: '🛸 Saucer,👽 Alien,🌍 Planet,🌟 Star Core,☄️ Comet,🔭 Scope',
  knight: '🛡️ Shield,⚔️ Swords,🏹 Bow,🗡️ Dagger,🪓 Axe,🏰 Keep',
  saturn: '🪐 Saturn,🌕 Full Moon,🌎 Earth,☀️ Sun,🌑 Dark Moon,🌠 Shooting Star',
  diamond3d: '💎 Diamond,🔷 Blue Gem,🔶 Amber Gem,💠 Crystal,🔮 Orb,🪩 Disco Gem',
};

const MODELS_BY_SLUG = {};
for (const [slug, text] of Object.entries(MODEL_TEXT)) {
  MODELS_BY_SLUG[slug] = text.split(',').map((t, i) => {
    const sp = t.indexOf(' ');
    return { emoji: t.slice(0, sp), name: t.slice(sp + 1), w: MODEL_WEIGHTS[i] };
  });
}
const FALLBACK_MODELS = ['Classic', 'Frosted', 'Neon', 'Shadow', 'Golden', 'Cosmic'].map((name, i) => ({ emoji: null, name, w: MODEL_WEIGHTS[i] }));

const BACKDROPS = [
  { name: 'Ocean',    c1: '#2b7fd9', c2: '#0b3a73', w: 260 },
  { name: 'Sunset',   c1: '#ff9a5a', c2: '#c2306b', w: 230 },
  { name: 'Forest',   c1: '#3fae6b', c2: '#14532d', w: 200 },
  { name: 'Mint',     c1: '#7be0c3', c2: '#1b7f77', w: 170 },
  { name: 'Rose',     c1: '#ff8fb1', c2: '#9c2a5e', w: 150 },
  { name: 'Sand',     c1: '#e8c88a', c2: '#a8742c', w: 140 },
  { name: 'Amethyst', c1: '#9b6bff', c2: '#3b1d8f', w: 110 },
  { name: 'Ice',      c1: '#cfeeff', c2: '#4a8fd0', w: 90 },
  { name: 'Lava',     c1: '#ff6a3d', c2: '#6b0f0f', w: 60 },
  { name: 'Onyx',     c1: '#4a4f5c', c2: '#0e1016', w: 50 },
  { name: 'Midnight', c1: '#2a2f7a', c2: '#05061a', w: 30 },
  { name: 'Peach',    c1: '#ffc4a3', c2: '#e0707a', w: 120 },
  { name: 'Lagoon',   c1: '#36d1dc', c2: '#1b4f9c', w: 100 },
  { name: 'Candy',    c1: '#ff9ad5', c2: '#7b5cff', w: 60 },
  { name: 'Emerald',  c1: '#2ecc8f', c2: '#064e3b', w: 40 },
  { name: 'Aurora',   c1: '#4df0c0', c2: '#6a3df0', w: 20 },
];
const PATTERNS = [
  { name: 'Stars',    emoji: '⭐', w: 260 },
  { name: 'Snow',     emoji: '❄️', w: 200 },
  { name: 'Hearts',   emoji: '💗', w: 170 },
  { name: 'Flowers',  emoji: '🌸', w: 130 },
  { name: 'Notes',    emoji: '🎵', w: 100 },
  { name: 'Clovers',  emoji: '🍀', w: 70 },
  { name: 'Sparks',   emoji: '✨', w: 60 },
  { name: 'Moons',    emoji: '🌙', w: 40 },
  { name: 'Flames',   emoji: '🔥', w: 30 },
  { name: 'Diamonds', emoji: '💎', w: 25 },
  { name: 'Butterflies', emoji: '🦋', w: 45 },
  { name: 'Clouds',   emoji: '☁️', w: 80 },
  { name: 'Waves',    emoji: '🌊', w: 50 },
  { name: 'Comets',   emoji: '☄️', w: 15 },
];
// how the finished collectible shimmers
const FINISHES = [
  { name: 'Matte',       w: 400 },
  { name: 'Glossy',      w: 280 },
  { name: 'Satin',       w: 160 },
  { name: 'Holographic', w: 100 },
  { name: 'Gilded',      w: 45 },
  { name: 'Glitch',      w: 15 },
];

function pick(list) {
  const total = list.reduce((s, x) => s + x.w, 0);
  let r = crypto.randomInt(total);
  for (const item of list) {
    if (r < item.w) return item;
    r -= item.w;
  }
  return list[0];
}

const percent = (item, list) =>
  Math.round((item.w / list.reduce((s, x) => s + x.w, 0)) * 1000) / 10; // 1 decimal

const modelsFor = (slug) => MODELS_BY_SLUG[slug] || FALLBACK_MODELS;

// models a gift type can turn into (shown before upgrading)
const modelList = (slug) => modelsFor(slug).map((m) => ({ name: m.name, emoji: m.emoji, rarity: percent(m, modelsFor(slug)) }));

// Rarity tiers by edition size / price. Computed, so the admin can change a gift's supply and its tier follows.
// Gifts shown as spinnable 3D objects (extruded figurines)
const MODEL3D = new Set(['robot3d', 'rocket3d', 'dragon3d', 'racecar', 'teddy3d', 'statue', 'ufo', 'knight', 'saturn', 'diamond3d']);
const TIERS = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
function tierOf(t) {
  if (t.supply == null) return t.price < 60 ? 'common' : 'uncommon';
  if (t.supply >= 2000) return 'uncommon';
  if (t.supply >= 1000) return 'rare';
  if (t.supply >= 400) return 'epic';
  if (t.supply >= 100) return 'legendary';
  return 'mythic';
}

function rollAttributes(slug, tier = 'common') {
  const models = modelsFor(slug);
  const model = pick(models);
  const backdrop = pick(BACKDROPS);
  const pattern = pick(PATTERNS);
  // top tiers never come out plain: legendary skips Matte, mythic also skips Glossy and Satin
  const minFinish = tier === 'mythic' ? 3 : tier === 'legendary' ? 1 : 0;
  const finishes = FINISHES.slice(minFinish);
  const finish = pick(finishes);
  return {
    model: { name: model.name, emoji: model.emoji, rarity: percent(model, models) },
    backdrop: { name: backdrop.name, c1: backdrop.c1, c2: backdrop.c2, rarity: percent(backdrop, BACKDROPS) },
    pattern: { name: pattern.name, emoji: pattern.emoji, rarity: percent(pattern, PATTERNS) },
    finish: { name: finish.name, rarity: percent(finish, finishes) },
  };
}

module.exports = { rollAttributes, modelList, tierOf, TIERS, MODEL3D };
