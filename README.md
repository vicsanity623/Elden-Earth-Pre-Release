# Elden Earth

A real-world geo-location territory-claiming idle game. Walk the real world, collect diamonds, spin the fortune wheel, claim 20x20 ft tiles beneath your feet, and earn simulated passive rent.

Built with **pure static HTML5 / CSS3 / Vanilla JS** -- zero build step, 100% hosted on GitHub Pages as a **Progressive Web App (PWA)**. Backend powered by **Firebase Cloud Functions** and **Firestore**.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Map Engine | MapLibre GL JS + OpenFreeMap (free, no token) |
| 3D Rendering | Three.js r128 (WebGL custom map layers) |
| Character Models | Mixamo / Khronos GLB skeletal animations |
| Backend | Firebase Cloud Functions (Node.js) |
| Database | Cloud Firestore (real-time snapshots) |
| Auth | Google Identity Services (OAuth 2.0) |
| Ads | Google AdSense (banner + fullscreen vignette) |
| Hosting | GitHub Pages (static) + Firebase (functions) |

---

## Repository Structure

```text
EE/
├── index.html              # Single-page app shell (1613 lines)
├── manifest.json           # PWA config & home screen icons
├── sw.js                   # Service worker (network-first caching)
├── firebase.json           # Firebase hosting/functions config
├── firestore.rules         # Firestore security rules
├── ads.txt                 # Ads.txt for AdSense
│
├── css/
│   └── style.css           # Cyberpunk dark theme, responsive, animations
│
├── js/                     # 25 IIFE singleton modules
│   ├── config.js           # Central tuning (rates, costs, Firebase keys)
│   ├── auth.js             # Google OAuth, session blocking, ban checks
│   ├── storage.js          # localStorage + Firestore cloud sync, session locks
│   ├── main.js             # Game loop, GPS, camera, UI wiring, boot (3600 lines)
│   ├── loading.js          # 3D cinematic loading stage & bootloader
│   ├── anticheat.js        # Client-side GPS spoof detection, rate limits
│   ├── server-anticheat.js # Server-authoritative validation bridge
│   ├── multiplier.js       # 30X/50X boost logic, +2EB claim loop
│   ├── character.js        # Three.js 3D avatar with idle/walk animation
│   ├── pet.js              # 3D companion pet (follow, fetch, mood, berries)
│   ├── grid.js             # 20x20 ft tile grid, land purchase, rarity rolls
│   ├── diamonds.js         # Diamond spawning, proximity detection, HUD particles
│   ├── elden-stops.js      # PokeStop-style POI beacons with disc spin rewards
│   ├── citadels.js         # 3D Dyson Sphere monuments, upgrade forge, siege combat
│   ├── wheel.js            # CSPRNG spin wheel (Web Crypto API)
│   ├── feed.js             # Live 50-event activity feed with geocoding
│   ├── leaderboard.js      # 4-tier scoped leaderboards (global/country/state/city)
│   ├── chat.js             # Real-time global chat with profanity filter
│   ├── friends.js          # Friend requests, daily gifts, relationship tracking
│   ├── referrals.js        # Referral codes, claimable bonus ledger
│   ├── pool.js             # 1% weekly treasury dividend distribution
│   ├── foliage.js          # Procedural grass & mushroom map markers
│   ├── geo.js              # Web Mercator math, tile bounds, distance calc
│   └── profanity-filter.js # Shared word filter (client + server)
│
├── models/                 # GLB 3D character models
│   ├── Soldier.glb
│   ├── Xbot.glb
│   ├── Fox.glb
│   └── CesiumMan.glb
│
├── assets/                 # UI frame images, icons, QR codes
│
├── functions/              # Firebase Cloud Functions (Node.js)
│   ├── index.js            # Server anti-cheat, economy, purchases (3793 lines)
│   ├── ban-player.js
│   ├── cleanup-orphans.js
│   ├── detect-plot-exploit.js
│   ├── early-adopter-boost.js
│   ├── fix-saves.js
│   ├── restore-plots.js
│   ├── reward-showcase-players.js
│   └── wipe-firestore.js
│
└── server/                 # Standalone access-control server
    └── access-control.js   # Email whitelist/banlist HTTP endpoint
```

---

## Architecture

### Client-Side Module System

All 25 JS modules are **IIFE singletons** loaded via `<script>` tags in `index.html`. They communicate through a shared `Store` state object and direct function calls. No bundler, no transpiler, no module loader.

```
Boot Sequence:
  config.js -> auth.js -> storage.js -> loading.js -> main.js
                                                        |
  [Google Sign-In] -> [GPS Permission] -> [Map Init] -> [Game Loop]
                                                        |
  Store.load() -> Store.syncFromCloud() ->收入 tick (1s interval)
```

### Data Flow

```
Player Action
    |
    v
Client Validation (AntiCheat.js)
    |
    v
Server Validation (ServerAntiCheat -> Cloud Functions)
    |
    v
Firestore Write (state document + plots collection)
    |
    v
Real-time Snapshot -> All Connected Clients
```

### Session Management

- **Single Active Session:** Only one tab/device can be active per account
- **Session Lock:** Stored in Firestore with 30-second heartbeat
- **Conflict Detection:** New tab shows "Account Locked" modal with Take Over option
- **Pause on Background:** Income loop stops when `document.hidden` is true

### Cloud Sync Strategy

- **Debounced Writes:** localStorage buffered to 10-second intervals
- **Cloud Save:** Every 20 seconds via `syncSafeState` callable function
- **Conflict Resolution:** Timestamp-based (`lastSavedAt`) -- newer state wins
- **Session Lock:** Stored in Firestore document, checked on every cloud read
- **Epoch Wipes:** `REALM_SERVER_EPOCH` timestamp for intentional database resets

### Anti-Cheat Layers

| Layer | Location | What It Checks |
|---|---|---|
| GPS Velocity | Client | Max 200 km/h, acceleration limits |
| Purchase Rate | Client | 5s cooldown, 5/min hard cap |
| Balance Sanity | Client | EB < 500K, Diamonds < 10K |
| Embargo Check | Client | Country-level block (DPRK) |
| Server Position | Cloud Functions | Re-validates GPS server-side |
| Server Economy | Cloud Functions | Authoritative reward calculation |
| Replay Protection | Cloud Functions | Idempotency keys on all actions |
| Bot Detection | Client | WebDriver, DevTools, headless UA |

### Performance Optimizations

| Feature | Implementation |
|---|---|
| 5km Horizon Culling | Removes 3D objects beyond 5,000m |
| Frame Throttling | 15 FPS idle, 60 FPS walking |
| Background Sleep | 0% GPU/CPU when screen locked |
| GPS Radio Sleep | 5s max age, 1.5m movement threshold |
| Flash Wear Reduction | Debounced localStorage writes |
| Low-Power WebGL | No MSAA, `powerPreference: "low-power"` |
| Map Culling | Below zoom 14, all 3D/DOM objects hidden |

---

## Game Features

For a complete guide to all in-game features, currencies, progression systems, and gameplay mechanics, see **[Game Guide](docs/game-guide.md)**.

### Core Systems (Implemented)

- **Land Claiming** -- 20x20 ft grid tiles with 4 rarity tiers (Common/Rare/Epic/Legendary)
- **Passive Rent** -- Earn simulated $/sec from owned land
- **Diamond Economy** -- Floating diamonds on map, 3-tier proximity spawning
- **Spin Wheel** -- Cryptographically fair 10-slice wheel (Web Crypto API)
- **30X/50X Boost** -- Time-limited multiplier with tier-based anti-whale scaling
- **+2EB Boost** -- 20-minute cooldown claim loop
- **Diamond Extractor** -- Automated mining (requires 5+ connected plots)
- **Realm Citadels** -- 3D Dyson Sphere monuments with upgrade forge & siege combat
- **Elden Stops** -- PokeStop-style POI beacons with disc spin rewards
- **Companion Pet** -- 3D pet that follows player, fetches items, mood system
- **Weekly Treasury Pool** -- 1% dividend to top 10 players every Monday
- **Political Titles** -- Mayor/Governor/President with stackable royalties
- **Friends System** -- Request/accept, daily gifts (+5 EB), max 50 friends
- **Referral System** -- Unique codes, +25 EB per referral
- **Global Chat** -- Real-time with profanity filter, anti-spam, plot-gated
- **Activity Feed** -- 50-event live ticker with geocoding & flag emojis
- **4-Tier Leaderboards** -- Global, Country, State, City scopes
- **30-Day Calendar** -- Daily login streak rewards up to 200 EB
- **Daily Quests** -- Actionable goals with completion tracking
- **3D Wardrobe** -- Hot-swap character models
- **50X Super Boost Events** -- 24h active / 72h cooldown cycle
- **Elden Stop Beacons** -- Public landmark POIs with construction timers
- **Bird's Eye View** -- 25-mile territory overview mode

### Server-Side Features

- **syncSafeState** -- Authoritative cloud save with field whitelisting
- **activateBoost** -- Server-validated boost activation
- **spinWheel** -- Server-rolled wheel outcome verification
- **claimBoost** -- 20-minute cooldown enforcement
- **citadelAction** -- Plant/relocate/upgrade validation
- **diamond collection** -- Position-verified pickup
- **chat moderation** -- Server-side message filtering
- **ban system** -- Player ban with reason tracking

---

## Setup

### Quick Start (Static Only)

1. Clone or download the repository
2. Serve with any static file server:
   ```bash
   npx serve .
   # or
   python3 -m http.server 8000
   ```
3. Open in browser. Guest mode works without Firebase.

### GitHub Pages Deployment

1. Create a GitHub repository and push all files
2. Go to **Settings > Pages**
3. Set Source to **Deploy from a branch**, select `main`, folder `/ (root)`
4. Open the deployed URL on your phone
5. Tap **Share > Add to Home Screen** (iOS) or **Install App** (Android)

### Enable Google Sign-In & Cloud Saves

1. Create an OAuth 2.0 Client ID at [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   - Authorized origin: `https://yourusername.github.io`
2. Copy the Client ID into `js/config.js`:
   ```javascript
   GOOGLE_CLIENT_ID: "your-id.apps.googleusercontent.com",
   ```
3. Create a Firebase project at [firebase.google.com](https://firebase.google.com)
4. Enable **Firestore Database** and paste config into `js/config.js`:
   ```javascript
   FIREBASE_CONFIG: {
     apiKey: "YOUR_API_KEY",
     authDomain: "your-app.firebaseapp.com",
     projectId: "your-app",
     // ...
   }
   ```
5. Deploy Cloud Functions:
   ```bash
   cd functions
   npm install
   firebase deploy --only functions
   ```

### Deploy Cloud Functions

```bash
cd functions
npm install
firebase deploy --only functions
```

---

## Configuration

All gameplay tuning is in **`js/config.js`**:

| Parameter | Default | Description |
|---|---|---|
| `TILE_SIZE_METERS` | 6.096 | ~20x20 ft grid tiles |
| `SPIN_COST_DIAMONDS` | 2 | Cost per wheel spin |
| `PLOT_COST_EB` | 100 | Cost per land plot |
| `EXTRACTOR_BUILD_COST_EB` | 50 | Extractor construction cost |
| `DIAMOND_SPAWN_RADIUS_METERS` | 1000 | Max diamond spawn distance |
| `DIAMOND_COLLECT_RADIUS_METERS` | 75 | Player collection range |
| `DIAMOND_MAX_ACTIVE` | 11 | Simultaneous diamonds on map |
| `DIAMOND_LIFETIME_MS` | 30 min | Diamond despawn timer |
| `BOOST_DURATION_MS` | 1 hour | Per-activation boost length |
| `BOOST_MAX_BANK_MS` | 6 hours | Max banked boost time |
| `EVENT_50X_DURATION_MS` | 24 hours | 50X event window |
| `EVENT_50X_COOLDOWN_MS` | 72 hours | Time between 50X events |

### Plot Rarities

| Rarity | Drop % | Rent/Second | Color |
|---|---|---|---|
| Common | 50% | $0.0000000016/s | Slate Grey |
| Rare | 30% | $0.0000000027/s | Cyan Blue |
| Epic | 15% | $0.0000000044/s | Royal Purple |
| Legendary | 5% | $0.0000000088/s | Radiant Gold |

### Boost Tier Scaling (Anti-Whale)

| Plots Owned | Effective Multiplier |
|---|---|
| 0 -- 150 | Full (30X / 50X) |
| 151 -- 220 | 20X / 33X |
| 221 -- 290 | 15X / 25X |
| 291 -- 365 | 12X / 20X |
| 366 -- 730 | 9X / 15X |
| 731 -- 1500 | 6X / 10X |
| 1501+ | 2X / 3X |

---

## 3D Assets & Attributions

- **Character Models:** Mixamo / Adobe (CC0 / Royalty Free)
- **CesiumMan & Xbot:** Khronos Group & Three.js Official Samples
- **Grass Yellowing:** Steve B [CC-BY] via Poly Pizza
- **White Dandelions:** Aeres Vistaas [CC-BY] via Poly Pizza
- **Pine Tree & Autumn Foliage:** Quaternius [CC0]
- **Mushrooms:** Jarlan Perez [CC-BY] via Poly Pizza
- **Twisted Tree & Bushes:** Quaternius [CC0]

---

## License

This is a personal, open-source fan implementation of real-world grid collection games. Built from scratch with pure web standards for educational and entertainment purposes.
