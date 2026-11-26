# Messenger

A Telegram-style web messenger: Node.js + WebSocket backend, React frontend, SQLite storage.

## Run

    npm install
    npm run build      # bundles client/app.jsx -> public/app.js
    npm start          # http://localhost:3000

Requires Node 22.5+ (uses the built-in `node:sqlite`). Env vars: `PORT`, `DATA_DIR`, `UPLOAD_DIR`.

## Features

- Accounts: sign up / sign in, scrypt-hashed passwords, 30-day sessions, login rate limiting
- 1-on-1 chats with realtime delivery, typing indicator, online / last seen, read receipts, unread badges
- Groups (members, admin roles, system messages) and channels (only admins post; others subscribe)
- Reply, edit, delete; search for people and public groups/channels by username or handle
- Media: images, video, audio, files (up to 25 MB) and recorded voice messages
- Gifts: Stars balance (500 to start, +100 daily), gift shop, limited editions with serial numbers,
  You can also buy a gift for yourself (menu → My profile → Buy a gift for myself, or Settings → Stars & Gifts)
  upgrade to a unique collectible (random model / backdrop / pattern with rarity %), transfer collectibles
- Settings (menu ☰ → Settings), like Telegram:
  - My Account: profile photo (cropped to a square), name, username, bio, change password
  - Appearance: light / dark / system theme, accent colour, chat wallpapers, dotted pattern,
    message text size, bubble corner radius, animations on/off, large emoji on/off (saved per device)
  - Notifications and Sounds: message sound, desktop notifications
  - Privacy: hide "last seen / online" from everybody
  - Stars & Gifts: balance, daily bonus, your gift collection
- Contacts: add people from search or from anyone's profile, pick them quickly when making groups,
  transferring gifts or adding members. Any member can add people to a group (channels: admins only)
- Ghost mode (👻 button next to the search bar, or Settings > Privacy): nobody sees you online,
  your "typing..." and read receipts are not sent. Sending a message still shows you read up to it
- Keep deleted messages (Settings > Privacy, off by default): a copy of messages that someone deleted
  after you received them stays on your device, marked "deleted by sender". Attachments are always
  removed from the server on delete, and the sender's delete prompt says kept copies may exist
- Custom chat wallpaper: upload your own photo (stored on this device) with a dimming slider
- 64 gifts in six rarity tiers (Common → Mythic, derived from edition size), every one can be upgraded. Each gift has its own 6 models with a different look (e.g. the Dragon turns
  into a T-Rex, Sauropod, Crocodile...), rolled with rarity %. A collectible also gets a random backdrop (12),
  pattern (11) and finish (matte, glossy, satin, holographic, gilded, glitch), a unique token and an edition
  number. The shop shows all possible models before you buy or upgrade; you can transfer it to anyone; every
  collectible has an ownership history, and a transfer appears as a gift message in the chat
- Animations: message pop-in, floating and shimmering gifts, confetti when a gift is sent,
  reveal effect on upgrade, large animated emoji, typing dots, smooth panels and dialogs
  (respects the OS "reduce motion" setting)
- AI assistant (chat "AI Assistant", added for every user): streams answers word by word, remembers the
  conversation, `/new` starts fresh, Markdown and code blocks with a Copy button, custom instructions and model
  choice in Settings > AI Assistant. It talks to a model on YOUR computer, so it is free with no message limits
- Emoji picker (😊 in the composer): ~1300 emoji in 9 categories, flags, search by name, recently used
- Status emoji next to your name; profile look (Settings > Profile look): 40 gradient backgrounds, emoji
  patterns or your own photo
- Music: audio player for audio messages and voice notes, profile music with a floating mini-player
- Admin panel (menu ☰ → 🛡 Admin panel): the FIRST account registered on a fresh install is the administrator.
  Overview (users, online, messages, gifts, Stars, storage, 7-day chart, AI status), user search, suspend / restore
  accounts (suspended users are signed out and cannot log in), set Stars, make or remove admins, announcement banner
  for everyone online, and a log of admin actions. Admin routes are enforced on the server (`/api/admin/*`)
- More animations: animated login background with floating emoji, list slide-ins, pop-in badges, pulsing online
  dot, button press effects, shimmering Stars pill, staggered gift shop, animated admin charts and counters.
  All of it switches off with Settings > Appearance > Animations or the OS "reduce motion" setting
- Gifts on your profile background (Settings > Profile look > Gifts on the background): pin up to 3 gifts, they float
  on the banner and the first one sets the colours and pattern (a collectible brings its own backdrop). A gift you
  give away disappears from the banner automatically
- Your own branding: `APP_NAME=Hearth` renames the app (title, sign-in page), `AI_NAME=Mia` renames the assistant.
  Both are plain environment variables, e.g. `APP_NAME=Hearth AI_NAME=Mia npm start`
- Reactions: hover a message > ☺ for 7 quick emoji or the full picker, double-click a message for ❤️, up to 3
  reactions per person per message, live counters for everyone in the chat
- More emoji: skin tones, ~130 flags, text faces (kaomoji), search; 64 gifts (6 models each); 120 profile
  backgrounds + 24 patterns; 18 chat wallpapers
- Admin panel v2: Chats (delete groups/channels), Gifts (edit price, upgrade price, edition size), Access
  (registration open / invite-only / closed, invite codes, Stars bonus for everyone), per-user password reset
  (temporary password), delete (anonymise) account, give a gift, CSV export, reaction stats
- Responsive layout (phone and desktop)

- Rarity tiers: Common, Uncommon, Rare, Epic, Legendary, Mythic. The shop has tier filters and sorting; glow grows
  with rarity, and Legendary/Mythic upgrades never roll the plain finishes.
- 30 one-click profile templates (gradient + pattern), 120 gradients, 32 chat wallpapers.
- Styles (Classic, Midnight, Dusk, Forest, AMOLED, Mocha) for the dark theme, gradient bubbles, glass header.
- Admin: reports queue (users report messages with ⚑; admin dismisses / deletes / deletes + suspends),
  maintenance mode with a message, configurable daily bonus and starting Stars, sign a user (or everyone) out,
  online-only filter, top senders / popular gifts / gifts by rarity, audit-log filter.

- Profile levels (1–10: Newcomer → Mythic) grow with Stars spent on gifts, upgrades and Premium; badge on profiles,
  progress bar in Settings → Stars & Gifts, toast on level-up.
- Premium subscription (Stars only, 30 days per purchase, stacks): ✨ badge, daily bonus ×2, −10% on gifts,
  5 pinned gifts instead of 3. Admin can set the price, grant or revoke days (✨ button in Users).

- 3D gifts: every gift card in its detail view can be dragged to spin (front art, back with the stats and token), and
  10 extruded 3D models (Robot, Rocket, Dragon, UFO, Diamond …) rotate as real objects. Shop chip "🧊 3D". 74 gifts in total.
- Personal touches: name colour, private nicknames for contacts (only you see them), font / corner style / density,
  a greeting on the home screen.
- Interface overhaul ("Aurora"): floating glass panels, chat filter tabs (All / Unread / People / Groups / Channels),
  floating composer, new bubbles, split sign-in screen with a hero panel, six dark skins.

- Rewards (menu → 🎡 Rewards): a lucky wheel with one free spin every 20 h (10 h for Premium) — Stars, a free gift,
  a day of Premium or a 1000⭐ jackpot, decided on the server — and 15 achievements with one-time Star rewards.

## AI assistant setup (free, local)

1. Install [Ollama](https://ollama.com) and run `ollama pull llama3.2` (any model works)
2. Start the messenger: `npm start`. The assistant is ready; open it from the chat list

Settings (environment variables): `AI_NAME` (what the assistant is called), `AI_URL` (default `http://127.0.0.1:11434/v1`, any OpenAI-compatible server such
as LM Studio or llama.cpp), `AI_MODEL` (default `llama3.2`), `AI_KEY` (only if your server needs one).
Example: `AI_MODEL=qwen2.5 npm start`. Without a running model the assistant replies with setup instructions.
The app adds no content filter of its own: how the assistant answers is decided by the model you install.

## Hosting for other people

See `DEPLOY.md` (in Russian): Cloudflare Tunnel from your own computer, or a VPS with Docker + automatic HTTPS
(`docker-compose.yml`, `Dockerfile`, `deploy/Caddyfile`), or systemd (`deploy/messenger.service`). Extra settings:
`TRUST_PROXY=1` (real client IP behind a proxy), `HOST` (bind address), `AI_ENABLED=0`, `node scripts/backup.js`.

## Notes

- Stars and gifts are an in-app virtual economy stored in SQLite. There are no real payments and
  nothing is on a blockchain; "NFT-style" collectibles are unique database records with transferable ownership.
- Run behind HTTPS (reverse proxy) in production; the WebSocket uses `wss://` automatically on HTTPS pages.
- Messages are stored on the server (like regular Telegram chats), not end-to-end encrypted.

## Layout

    server/index.js   HTTP API, WebSocket, uploads, static files
    server/db.js      schema + gift catalog seed
    server/gifts.js   collectible attribute rolls
    server/ai.js      AI assistant (streaming client for Ollama / OpenAI-compatible servers)
    client/           React source: app.jsx (chats), settings.jsx, ui.jsx, theme.js, fx.js, api.js
    public/           index.html, styles.css, built app.js + boot.js
