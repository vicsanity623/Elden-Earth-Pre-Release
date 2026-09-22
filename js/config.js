// ============================================================
// Elden Earth — configuration
// Edit these values to tune the game or enable Google sign-in.
// ============================================================
const CONFIG = {
  // --- Game Version (bump on every patch to auto-wipe stale localStorage) ---
  GAME_VERSION: "0.1.10.36",

  // --- Realm Server Epoch ---
  // Bump this timestamp whenever you intentionally wipe the Firestore database.
  // Any local or cloud save created before git statusthis epoch is treated as stale.
  REALM_SERVER_EPOCH: 1735689600000, // milliseconds — must match functions/index.js

  // --- Map Tile Engine & Rate Limit Fallback ---
  // Set to true to bypass Mapbox completely and use unlimited 100% free OpenFreeMap
  USE_OPENFREEMAP_DIRECTLY: true,
  MAPBOX_STYLE_URL: "mapbox://styles/mapbox/dark-v11",
  FALLBACK_STYLE_URL: "https://tiles.openfreemap.org/styles/dark", // 100% free, no key, no limits

  GOOGLE_CLIENT_ID: "231253239262-l1ep169u103iuitvl1i6gonrn2k9a69a.apps.googleusercontent.com",

  // --- Access Control Server (serves allowed player list) ---
  // Server runs on iMac, funnelled via Tailscale to the internet
  ACCESS_CONTROL_URL: "https://vics-imac-1.tail37b4f2.ts.net/ac",

  // --- Firebase Cloud Save Config ---
  FIREBASE_CONFIG: {
    apiKey: "AIzaSyAf8u0qUQJaajJp4352-SrY7lIh8rNFPWY",
    authDomain: "elden-earth.firebaseapp.com",
    projectId: "elden-earth",
    storageBucket: "elden-earth.firebasestorage.app",
    messagingSenderId: "231253239262",
    appId: "1:231253239262:web:3fa1ca28575fcade15e94f",
    measurementId: "G-X24EB16156"
  },
  
  // --- Tile grid ---
  TILE_SIZE_METERS: 6.096,        // ~20 x 20 feet
  GRID_RENDER_MIN_ZOOM: 16,       // grid only draws once zoomed in this close
  GRID_RENDER_MAX_TILES: 1200,    // safety cap per redraw

  // --- Diamonds ---
  DIAMOND_SPAWN_RADIUS_METERS: 1000,     // ~.75 mile maximum
  DIAMOND_COLLECT_RADIUS_METERS: 75,    // Exact player collection radius
  DIAMOND_MAX_ACTIVE: 11,
  DIAMOND_SPAWN_CHECK_MS: 1 * 60 * 1000, // One diamond every 2 minutes
  DIAMOND_INNER_COOLDOWN_MS: 5 * 60 * 1000, // 8-Minute cooldown between inner circle waves
  DIAMOND_IDLE_TIMEOUT_MS: 120 * 60 * 1000, // Pause spawning after 2 hour still
  DIAMOND_MOVEMENT_THRESHOLD_METERS: 10, // Ignore GPS drift smaller than 10m
  DIAMOND_LIFETIME_MS: 30 * 60 * 1000,  // 25 minutes

  // --- Diamond Extractor ---
  EXTRACTOR_MIN_TILES: 5,               // Requires 5+ connected plots
  EXTRACTOR_INTERVAL_MS: 10 * 60 * 1000, // 1 diamond every 10 minutes
  EXTRACTOR_MAX_STORED: 50,             // Stores up to 50 diamonds max
  EXTRACTOR_BUILD_COST_EB: 50,          // 50 EB to construct

  // --- 50X Super Boost Event Engine ---
  // SINGLE SOURCE OF TRUTH — must match eventAnchor in functions/index.js (activateBoost).
  EVENT_50X_ANCHOR_MS: 1788912000000,          // Server-locked cycle anchor (ms)
  EVENT_50X_DURATION_MS: 24 * 3600 * 1000,     // 24 Hours of 50X Active
  EVENT_50X_COOLDOWN_MS: 3 * 24 * 3600 * 1000, // 3 Days (72 Hours) 30X Cooldown

  is50XActive: function() {
    const totalCycle = this.EVENT_50X_DURATION_MS + this.EVENT_50X_COOLDOWN_MS;
    let elapsed = (Date.now() - this.EVENT_50X_ANCHOR_MS) % totalCycle;
    if (elapsed < 0) elapsed += totalCycle;
    return elapsed < this.EVENT_50X_DURATION_MS;
  },
  
  // --- Spin wheel --- (+12 & +24 Diamond Jackpots, 1 Miss Slice)
  WHEEL_SLICES: [
    { type: "diamond",         amount: 1,  label: "+1 ◆",  color: "#8fa3b8", weight: 110 },
    { type: "eb",              amount: 1,  label: "1 EB",  color: "#4fd6c4", weight: 240 },
    { type: "diamond_jackpot", amount: 12, label: "+12 ◆", color: "#4fd6c4", weight: 20  }, // 💎 +12 Diamond Jackpot!
    { type: "eb",              amount: 2,  label: "2 EB",  color: "#4f9dd6", weight: 130 },
    { type: "diamond",         amount: 1,  label: "+1 ◆",  color: "#8fa3b8", weight: 110 },
    { type: "eb",              amount: 5,  label: "5 EB",  color: "#a86ee0", weight: 50  },
    { type: "eb",              amount: 7,  label: "7 EB",  color: "#ff4757", weight: 35  }, // 🍀 Lucky 7 EB Slice!
    { type: "eb",              amount: 25, label: "25 EB", color: "#e0a84f", weight: 15  },
    { type: "diamond_jackpot", amount: 24, label: "+24 ◆", color: "#2ee59d", weight: 8   }, // 💎 +24 Diamond Mega Jackpot!
    { type: "eb",              amount: 50, label: "50 EB", color: "#d4af61", weight: 5   },
  ],
  SPIN_COST_DIAMONDS: 2,
  
  // --- Realm Citadels & Dyson Sphere Holds ---
  CITADEL_UNLOCK_BALANCE: 0.01,        // $0.01 threshold to unlock the Capsule
  CITADEL_GROWTH_MS: 30 * 60 * 1000,   // 30 mins growth timer
  CITADEL_MIN_SPACING_METERS: 0,       // Legacy setting; nearby Citadels are allowed to overlap
  CITADEL_SIEGE_COST_DIAMONDS: 1,      // 1 Diamond to challenge an enemy Citadel
  CITADEL_CONQUEST_BOUNTY_EB: 5,       // +5 EB bonus for dethroning a defender
  CITADEL_EVOLUTION_MS: 10 * 60 * 1000, // 10 Minutes Evolution Timer
  CITADEL_RARITIES: {
    common:    { key: "common",    label: "Common Hold",    color: "#ff6b81", diamondHours: 3,   ebChance: 0.15, ebAmount: 1, weight: 50 },
    rare:      { key: "rare",      label: "Rare Hold",      color: "#ff1744", diamondHours: 2,   ebChance: 0.25, ebAmount: 2, weight: 30 }, // 🔴 Crimson Red (was #4fd6c4)
    epic:      { key: "epic",      label: "Epic Hold",      color: "#b30021", diamondHours: 1.5, ebChance: 0.40, ebAmount: 3, weight: 15 }, // 🔴 Deep Ruby
    legendary: { key: "legendary", label: "Legendary Hold", color: "#f0d38a", diamondHours: 1,   ebChance: 0.60, ebAmount: 5, weight: 5  }, // 🟡 Legendary Gold
  },
  // Upgrade Forge Progression (Balanced: Diamonds as an Active Walking Sink)
  CITADEL_UPGRADE_COSTS: {
    common: { next: "rare",      eb: 50,  diamonds: 75,  cashRequired: 0.50, nextLabel: "Rare Hold",      nextColor: "#4fd6c4" },
    rare:   { next: "epic",      eb: 100, diamonds: 125, cashRequired: 0.75, nextLabel: "Epic Hold",      nextColor: "#a86ee0" },
    epic:   { next: "legendary", eb: 300, diamonds: 400, cashRequired: 1.125, nextLabel: "Legendary Hold", nextColor: "#f0d38a" },
  },

  // --- Land plots (Exact Rates & Odds) ---
  PLOT_COST_EB: 100,
  PLOT_RARITIES: [
    { key: "common",    label: "Common",    rate: 0.0000000004, weight: 50, color: "#8fa3b8" }, // 50%
    { key: "rare",      label: "Rare",      rate: 0.000000000675, weight: 30, color: "#4f9dd6" }, // 30%
    { key: "epic",      label: "Epic",      rate: 0.0000000011, weight: 15, color: "#a86ee0" }, // 15%
    { key: "legendary", label: "Legendary", rate: 0.0000000022, weight: 5,  color: "#e0a84f" }, // 5%
  ],
  
  // --- Elden Stops (Dyson Disc Beacons) ---
  ELDEN_STOP_GROWTH_MS: 30 * 60 * 1000,         // 30-minute construction phase before spin-ready
  ELDEN_STOP_COOLDOWN_MS: 15 * 60 * 1000,        // 15-minute PokéStop-style recharge
  ELDEN_STOP_SPIN_RADIUS_METERS: 75,             // Must walk within 75m to spin
  ELDEN_STOP_VISIBILITY_METERS: 1500,            // Beacon culling range on the map
  ELDEN_STOP_DIAMOND_RANGE: [1, 20],             // Diamonds per spin (informational)
  ELDEN_STOP_EB_RANGE: [0, 5],                   // EB per spin (informational)
  ELDEN_STOP_PLOT_JACKPOT_CHANCE: 0.015,         // 1.5% Lucky Land Plot drop

  // --- 3D Character Roster (Heroic Scale) ---
  AVAILABLE_CHARACTERS: [
    { id: "soldier",   name: "Vanguard Soldier", file: "models/Soldier.glb",   scale: 4.8, icon: "🛡️" },
    { id: "xbot",      name: "X-Operative",      file: "models/Xbot.glb",      scale: 4.2, icon: "🦾" },
    { id: "fox",       name: "Spirit Fox",       file: "models/Fox.glb",       scale: 0.08, icon: "🦊" },
    { id: "cesium",    name: "Cesium Runner",    file: "models/CesiumMan.glb", scale: 5.0, icon: "🏃" },
  ],

  // --- 30-Day Daily Login Calendar ---
  // Base 3 EB daily, scaling on Day 2 & every 5th day up to Day 30 (200 EB Jackpot)
  DAILY_CALENDAR_REWARDS: [
    { day: 1,  eb: 3   },
    { day: 2,  eb: 5   }, // Scaling boost
    { day: 3,  eb: 3   },
    { day: 4,  eb: 3   },
    { day: 5,  eb: 10  }, // Milestone 5
    { day: 6,  eb: 3   },
    { day: 7,  eb: 12, diamonds: 75 },
    { day: 8,  eb: 3   },
    { day: 9,  eb: 3   },
    { day: 10, eb: 20  }, // Milestone 10
    { day: 11, eb: 3   },
    { day: 12, eb: 3   },
    { day: 13, eb: 3   },
    { day: 14, eb: 3   },
    { day: 15, eb: 35, diamonds: 75 },
    { day: 16, eb: 3   },
    { day: 17, eb: 3   },
    { day: 18, eb: 3   },
    { day: 19, eb: 3   },
    { day: 20, eb: 50, diamonds: 75 },
    { day: 21, eb: 3   },
    { day: 22, eb: 3   },
    { day: 23, eb: 3   },
    { day: 24, eb: 3   },
    { day: 25, eb: 75, diamonds: 75 },
    { day: 26, eb: 3   },
    { day: 27, eb: 3   },
    { day: 28, eb: 3   },
    { day: 29, eb: 3   },
    { day: 30, eb: 200, diamonds: 100 },
  ],
};
