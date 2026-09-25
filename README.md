# 🌍 Elden Earth 💎Early Access💎

A real-world geo-location territory-claiming and idle income game. Walk the real world, collect diamonds, spin the fortune wheel for Elden Bucks (EB), claim real 10×10 ft tiles beneath your feet, and earn simulated passive rent ($USD) every fraction of a second.

Built with **pure static HTML5 / CSS3 / Vanilla JS** — zero build step, no backend server required, and 100% hosted for free on GitHub Pages as a full **Progressive Web App (PWA)**.

---

## ✨ Implemented Core Features & Mechanics

* [x] **🔮 Realm Citadels & Dyson Sphere Territory Holds (Pokémon GO Style Gyms):** 
  * **$0.01 Capsule Drop:** Automatically rolls a Common (50%), Rare (30%), Epic (15%), or Legendary (5%) permanent Capsule upon reaching $\ge \$0.01$ balance.
  * **10X Colossal Monuments:** Plantable directly at your feet on any unowned parcel with real-time growth countdowns evolving into towering 10X tall glassmorphism monuments with nested rotating kinetic rings and ground stronghold parcels.
  * **Multiplayer Garrison Defense:** Station 3D avatars inside holds with live defense tickers (`05D : 12H : 23M : 02s`) and guaranteed hourly Diamond & EB harvesting (scaling up to 24 Diamonds + ~72 EB/day for Legendary).
  * **Reflex Meter Siege Duels:** Walk within 100m, spend 1 Diamond, and time your strike in the gold zone to shatter the defender's shield, dethrone them, and earn a **+5 EB Conquest Bounty** (defender keeps 100% of banked loot!).
  * **Anti-Abuse Proximity & Prerequisite Locks:** Players must have planted their own Citadel before launching sieges, and cannot attack any Citadel within **250 meters** of their own home Hold (friendly neighborhood treaty).
* [x] **⚡ Citadel Evolution & Upgrade Forge:**
  * **Ascension Progression:** Upgrade existing holds through **Common $\rightarrow$ Rare $\rightarrow$ Epic $\rightarrow$ Legendary**!
  * **Dual-Currency Forge:** Spend either **Elden Bucks (EB)** or **Diamonds (◆)** as an active walking sink (*50 EB / 75 ◆ for Rare, 100 EB / 125 ◆ for Epic, 300 EB / 400 ◆ for Legendary*).
  * **10-Minute Evolution Phase:** Triggers a live 10-minute transformation countdown with an auto-promoter that evolves the Citadel, updates visual kinetic rings and ground parcel borders, and unlocks upgraded hourly yields upon completion!
* [x] **🔋 High-Efficiency Battery & Thermal Optimization Suite:**
  * **5km Horizon Culling:** Dynamically culls all Citadels and player plot signboards further than 5,000 meters away, stopping the mobile CPU/GPU from computing thousands of matrix projections across distant states/countries.
  * **Dynamic Three.js Frame Throttling:** Caps idle character rendering at **15 FPS when stationary** (cutting GPU power by 75%) while ramping smoothly to **60 FPS when actively walking**.
  * **Background Sleep Controller:** Puts WebGL rendering, GPS polling, and interval timers to complete sleep (`0% GPU/CPU`) when the phone screen is locked or in a pocket.
  * **GPS Satellite Radio Sleep:** Uses `{ maximumAge: 5000 }` and a 1.5-meter movement threshold so the physical GPS chip powers down between pulses when stationary.
  * **Debounced Flash Storage (90% Disk I/O Reduction):** Buffers `localStorage.setItem` writes to 10-second intervals during normal rent generation, preventing continuous physical flash memory wear.
  * **Low-Power Mobile WebGL:** Disables MSAA (`antialias: false`), sets `fadeDuration: 0`, and routes rendering through mobile energy-efficiency cores (`powerPreference: "low-power"`).
* [x] **🏛️ 1% Weekly Realm Dividend Pool (Top 10 Global Landlords):**
  * Tracks live Total Global Lifetime Rent Accrued across all players worldwide.
  * Every Monday at 12:00 AM UTC, distributes a **1% Dividend Pool** to the Top 10 Global Landlords:
    * 🥇 1st: 25% | 🥈 2nd: 15% | 🥉 3rd: 10% (Top 3 split 50%)
    * 🏅 4th–10th: Split the remaining 50% (~7.14% each).
  * Features a side HUD countdown button, live treasury inspection modal, and automatic Monday celebration claim modal with tamper-proof ISO-week anti-duplicate locks.
* [x] **🔒 Single Active Session Lock & Instant Cloud Authority:**
  * Generates unique session tokens (`activeSessionId`) on every device.
  * If an account is opened on desktop while active on mobile, the background session immediately freezes saving and displays an **"Active on Another Device"** modal to eliminate data overwrites.
  * True Cloud Authority guarantees desktop and mobile load identical real-time progress.
* [x] **💎 Automated Diamond Extractor Base ($1.00 Upgrade Unlock):** 
  * Unlockable beacon for players owning **5+ connected plots** (Limit 1 per player) that automatically mines 1 Diamond every 10 minutes (holds up to 50 gems). 
  * Unlocks a dynamic **Level Upgrade Forge at $1.00+ balance** ($1.00, $2.00, etc.) that alternately expands storage capacity (50 $\rightarrow$ 51 $\rightarrow$ 52...) and reduces mining times!
* [x] **💵 Spendable Cash vs. Lifetime Accrued Rent Separation:**
  * **Spendable Cash (`state.cash`):** Used to purchase Extractor upgrades without penalizing your standing.
  * **Lifetime Accrued Rent (`state.lifetimeRent`):** Permanent, non-decreasing score that tracks all earnings generated since day one, powering the Passive Rent leaderboards and tie-breakers!
* [x] **🏆 Territory-Scoped Leaderboards (Atlas Earth Style):** 
  * 4-tier filtering tabs (🌐 Global, 🇺🇸 Country, 🏛️ State, 🏘️ City) displaying active royal titles (`⚔️ Lord of the Elden Realm`, `🦅 President`, `🏛️ Governor`, `👑 Mayor`) with 0ms in-memory cached switching.
  * **Live Offline Rent Simulation:** Accurately projects passive rent growth for offline players in real-time without corrupting save states.
  * **Unique Coordinate Set Deduplication:** Mathematically eliminates double-counting between local state and cloud syncs.
  * **Passive Rent Tie-Breakers:** Ties in plot counts are decisively resolved by highest Lifetime Accrued Rent!
* [x] **👑 3-Tier Political Leadership & Stackable Dividends:** Real-time leadership hierarchy based on parcel counts:
  * **👑 Mayors:** City / Town rulers earn **+2 EB (2%)** on local land purchases.
  * **🏛️ Governors:** State / Province rulers earn **+2 EB (2%)** on regional land purchases.
  * **🦅 Presidents:** Country rulers earn **+2 EB (2%)** on national land purchases.
  * **⚔️ Stackable Royalties:** Holding all 3 titles simultaneously unlocks a **+6 EB (6%) Triple Crown Royalty** deposited directly to Google Cloud saves!
* [x] **🎮 3D WebGL Engine & 60° Isometric Camera:** Powered by **MapLibre GL JS & OpenFreeMap** for unlimited, 100% free vector map loads with 60° isometric camera tilt, free 360° touch orbit gestures, and true 3D extruded city buildings with zero token rate-limits.
* [x] **💬 Real-Time Global Community Chat:** Slide-up mobile MMO chat drawer in the bottom bar with a 25-message live log, profanity filter, 4-second anti-spam cooldown, XSS sanitization, and unread notification badge.
* [x] **🧍 3D Animated Mixamo Characters (Three.js WebGL):** Integrated Three.js custom layer rendering upright, hero-scaled 3D character models (`.glb`) at real-time GPS coordinates with automatic `Idle` $\leftrightarrow$ `Walk` speed-based animation blending.
* [x] **⏳ Cinematic Slow-Motion 3D Loading Stage:** Auto-framed Three.js stage showcasing CesiumMan stepping forward in 40% slow motion with cyan/gold rim lighting behind the spinning diamond logo, with automatic WebGL context cleanup.
* [x] **🧭 True North Navigation & Compass Reset:** Dedicated compass button that smoothly animates camera bearing back to True North (0°) and restores default 18.5 zoom.
* [x] **📐 "Buy Land" Cinematic 2D Mode:** One-tap button that smoothly flies the camera from 60° 3D down to a flat 2D top-down view (`pitch: 0`), reveals the 10×10 ft grid strictly within reach, and allows precise land claims without building occlusions.
* [x] **👗 3D Wardrobe & Character Selector:** In-game wardrobe modal accessible via a gold **✎ Pencil** on the Player Info profile card, allowing players to hot-swap between multiple 3D models (`Soldier`, `Xbot`, `Fox`, `CesiumMan`, `Custom`).
* [x] **🎰 Hardware-Secured 100% Win Cryptographic Spin Wheel:** Provably fair spin wheel using the **Web Cryptography API (`window.crypto.getRandomValues`)** and modulo-bias-free rejection sampling. Features rare **+12 and +24 Diamond Mega Jackpots** and a ruby-red **Lucky 7 EB slice** with zero miss slices!
* [x] **🚶 3-Tier Proximity Diamond Spawning (1km Realm):** Generates diamonds across a full 1,000-meter radius (40% immediate reach within 85m, 35% walking distance up to 350m, 25% horizon exploration up to 1,000m) with a generous **25-minute lifetime** designed for real-world walks.
* [x] **⚡ Anti-Bot 20-Minute Boost Loop:** Floating `+2 EB` boost button appearing on a strict 20-minute cooldown locked to `state.lastBoostClaim` to prevent multi-tab and refresh abuse.
* [x] **🔥 Real-time Multiplayer Firestore Sync:** Live WebSocket streaming across all players worldwide to see newly claimed lands, plot rarities, and avatars in real time without refreshing.
* [x] **☁️ Firebase Cloud Saves & Anti-Exploit Security:** Permanent account backups stored in Google Cloud Firestore with strict document validation rules preventing console value manipulation and automatic session recovery for returning players.
* [x] **📅 30-Day Daily Login Calendar:** Strict 1-day-per-day streak check-in rewards scaling up to a **200 EB Jackpot on Day 30**.
* [x] **📱 Progressive Web App (PWA):** Installable directly to iOS & Android home screens with responsive 5-button flexbox controls, Android touch listeners, Brave Shields awareness, and network-first offline asset caching via `sw.js`.

---

## 🗺️ Master Development Roadmap

### 🔊 I. Sensory & Audiovisual Polish
* [ ] **1. Phase 4: Web Audio SFX & Mobile Haptics:** *(Next Priority)*
  * Synthesized crystal chimes when picking up diamonds.
  * Tactile phone vibration pulses when collecting gems or spinning the wheel.
  * Ticking clicks on the wheel and a royal trumpet fanfare on claiming land.
* [ ] **2. 🎉 Celebration Confetti & Screen Fireworks:**
  * Golden particle cascade across the screen when winning 25 EB / 50 EB or rolling a Legendary plot.
* [ ] **3. 🌙 Real-Time Day / Night & Weather Cycle:**
  * Dynamic lighting based on local sunrise/sunset—streetlights glow at night, with subtle rain/fog particle overlays.
* [ ] **4. 🧭 3D Dynamic Compass Rose:**
  * A mini compass dial on the HUD that rotates smoothly with device orientation / camera bearing.

---

### 🗺️ II. Map Exploration & World Features
* [x] **5. 🔮 Realm Citadels & Dyson Sphere Territory Holds:** *(Completed)*
* [ ] **6. 🎁 Tiered Mystery Chests on the Map:**
  * Bronze, Silver, and Golden chests spawning randomly that require keys or diamonds to open for big EB payouts.
* [ ] **7. 💎 Diamond Radar Compass Pointers:**
  * Subtle glowing arrows around the edge of your screen pointing toward off-screen diamonds so you know which street to walk down.
* [ ] **8. 🌈 Prismatic / Super Diamonds (1-in-50 Spawn):**
  * Rare iridescent rainbow crystals that award **+3 Diamonds** or an instant 2-hour boost potion when tapped.
* [ ] **9. 🧲 Diamond Magnet Boost Potion:**
  * A 15-minute consumable buff that doubles your collection reach to vacuum up all neighborhood diamonds without moving.

---

### 👑 III. Social, Multiplayer & Prestige
* [x] **10. 👑 Local Mayorship & Regional Dividends:** *(Completed)*
* [x] **11. 💬 Global Live Activity Feed:** *(Completed)*
* [x] **12. 🏆 Global & Local Leaderboards:** *(Completed)*
* [x] **13. 💬 In-Game Global Community Chat:** *(Completed)*
* [x] **14. ⚡ Citadel Evolution & Upgrade Forge:** *(Completed)*
* [x] **15. 🏛️ 1% Weekly Realm Dividend Pool:** *(Completed)*
* [ ] **16. 🤝 Player-to-Player Parcel Marketplace:**
  * Open market for trading tiles with friends, **Lucky RNG** re-roll rarity stats like Legendary+++, for example pokemon go trades.
* [ ] **17. 🛡️ Realm Guilds & Joint Kingdoms:**
  * Form alliances to connect plots into massive shared kingdoms with a communal Diamond Vault.
* [x] **18. 🎟️ Referral / Friend System:** *(Completed)*
  * Share your code; friends claim starting bonuses while referrers earn claimable Elden Buck rewards via dedicated cloud collections.
  * Send & receive daily friend gifts (+5 EB daily) with one-tap gifting.
  * Real-time incoming friend request notification dots on profile tabs.
  * Dedicated Friendship Progression Screen tracking friendship XP (10/10), heart meters, and cooperative quests.

---

### 📅 IV. Retention & Daily Progression
* [x] **19. 📅 30-Day Daily Login Calendar:** *(Completed)*
* [x] **20. 📜 Daily Quests & Weekly Bounties:** *(Completed - Phase 1 Daily Quests)*
  * Integrated multi-tab Daily Rewards modal with live tab switcher between daily streak rewards and actionable Daily Quests.
  * Real-time completion checkmarks for claiming rewards, spinning wheels, gifting friends, and surveying realm territories.
* [ ] **21. ⚡ "Blood Moon / Solar Flare" 50X Weekend Events:**
  * 24-hour weekend flash events where the boost multiplier temporarily jumps to **50X**.
* [ ] **22. 📈 Prestige Milestones & Player Leveling Track:**
  * Title ranks (*Novice, Baron, Count, Duke, Monarch*) that unlock golden avatar borders and exclusive profile emblems.
* [ ] **23. 🚶 Real-World Step Counter / Pedometer Sync:**
  * Awards passive EB for physical steps taken throughout the day (e.g. 1,000 steps = +5 EB). Like Poke-Go Buddy Candy earn rates.

---

### 🏰 V. Customization & Base Building
* [ ] **24. 🏰 3D Plot Landmarks & Monuments:**
  * Place 3D structures on owned land (Castles, Golden Trees, Neon Shrines) that grant a **+15% permanent income boost** to surrounding tiles.
* [ ] **25. 🎨 Parcel Ground Skins & Theme Customization:**
  * Customize how your owned plots look: Cyberpunk Grid, Medieval Cobblestone, Molten Lava, or Glacial Ice.
* [ ] **26. 🛂 Travel Passport & City Stamps:**
  * Collect digital passport stamps when claiming land in new cities; each badge gives an account-wide **+5% rent multiplier**.
* [ ] **27. 📦 Player Inventory & Item Bag:**
  * A clean inventory screen to manage boost potions, keys, cosmetic badges, and collectible relics.

---

### 💰 27. Ad-Funded Treasury & Player Reward Economy

> **Core Economic Model:** The game is entirely free-to-play. Players never purchase land, currency, passive rent, boosts, inventory items, or other game assets with real-world money. The game is funded primarily through unobtrusive banner advertising and other approved advertising revenue. Gameplay generates an immutable in-game digital balance with no inherent real-world monetary value. Eligible players may eventually exchange a limited portion of their qualifying in-game balance for a promotional/reward payout subject to the game's weekly limits, eligibility rules, available treasury and applicable requirements.

* [ ] **27.1 🆓 100% Free-to-Play Foundation**

  * No mandatory purchase is required to play.
  * No player is required to deposit money into the game.
  * No player purchases are required to earn passive rent.
  * No player purchases are required to acquire land.
  * No player purchases are required to participate in the core economy.
  * Gameplay progression remains fundamentally free.

* [ ] **27.2 📢 Advertising-Funded Treasury**

  * Use small, persistent/non-interruptive banner advertising as the primary player-facing monetization mechanism.
  * Avoid forced full-screen advertisements that interrupt gameplay on a timed basis.
  * Avoid making players watch advertisements to perform ordinary gameplay actions.
  * Advertising revenue contributes to the operating treasury supporting:

    * Infrastructure
    * Development
    * Customer support
    * Security
    * Game operations
    * Expansion
    * Player rewards
  * Track advertising revenue separately from the player economy ledger.

* [ ] **27.3 🚀 Growing Treasury Model**

  * As the player base grows, advertising impressions and revenue can grow with it.
  * Treasury capacity should therefore be modeled as a function of:

    * Active players
    * Sessions
    * Ad impressions
    * Fill rate
    * Effective advertising revenue
    * Infrastructure costs
    * Operating expenses
    * Reward obligations
  * Never assume advertising revenue is guaranteed.
  * Build conservative treasury models using worst-case advertising conditions.

* [ ] **27.4 🏦 Protected Game Treasury**

  * Maintain a dedicated internal treasury accounting system.
  * Separate:

    * Operating funds
    * Advertising revenue
    * Reserved player reward obligations
    * Available reward budget
    * Pending payouts
    * Completed payouts
  * The game client must never have authority over treasury values.

---

### 🪙 28. Immutable Digital Player Balance

* [ ] **28.1 🔒 Immutable In-Game Balance**

  * Player passive rent and other qualifying rewards are represented through an authoritative server-side ledger.
  * The client displays the balance but never determines the authoritative balance.
  * Client-side manipulation must never be capable of creating currency.

* [ ] **28.2 0️⃣ No Intrinsic Asset Value**

  * In-game land, buildings, cosmetics, inventory items, boosts and digital rent balances have no inherent real-world monetary value.
  * Game assets cannot be sold directly by players.
  * Game assets cannot be purchased from the game using real-world currency.
  * Game assets are not player deposits.
  * Game assets are not intended to function as an investment product.

* [ ] **28.3 📜 Immutable Transaction History**

  * Record every material economy event as an append-only transaction.
  * Examples:

    * Passive rent generated
    * Rent claimed
    * Bonus awarded
    * Bonus removed
    * Game adjustment
    * Qualifying balance conversion
    * Withdrawal/reward request
  * Never silently overwrite historical financial/economic records.

* [ ] **28.4 🧮 Server-Side Accounting**

  * Final balances are calculated and validated server-side.
  * Every transaction receives:

    * Unique transaction ID
    * Player ID
    * Timestamp
    * Transaction type
    * Amount
    * Source
    * Destination
    * Reason
    * Processing status
  * Duplicate requests must never create duplicate rewards.

---

### 💵 29. Controlled Withdrawal / Reward Mechanism

> **The player's in-game balance remains a digital game balance. The withdrawal mechanism is a separate, controlled reward process.**

* [ ] **29.1 🎁 Limited Reward Eligibility**

  * Players may become eligible to request a limited reward based on qualifying in-game balance.
  * Eligibility does not mean the entire game balance becomes withdrawable.
  * The player must have sufficient qualifying in-game balance to support the requested conversion.

* [ ] **29.2 🔄 Balance-to-Reward Conversion**

  * A player voluntarily forfeits/deducts the required amount of qualifying in-game balance.
  * The system records the deduction permanently.
  * The corresponding reward request is created.
  * The player cannot spend the same balance twice.
  * Conversion must be atomic:

    * Either the balance deduction and reward reservation both succeed,
    * or neither occurs.

* [ ] **29.3 📅 Weekly Player Reward Limit**

  * Establish a maximum reward amount available to an individual player during a rolling 7-day period.
  * The weekly limit is independent from the player's total in-game balance.
  * A player may possess a large digital balance while still being restricted to the configured weekly reward ceiling.
  * Unused weekly capacity does not necessarily need to accumulate indefinitely.

* [ ] **29.4 🏦 Treasury-Constrained Rewards**

  * The theoretical weekly player limit is not a promise of unlimited payouts.
  * Actual reward processing remains subject to:

    * Treasury availability
    * Fraud/risk controls
    * Eligibility
    * System integrity
    * Payment-provider availability
    * Applicable geographic/operational restrictions
  * Treasury protection always takes priority over unrestricted reward issuance.

* [ ] **29.5 🛑 Reward Circuit Breaker**

  * Administrators can temporarily pause new reward requests without shutting down the game.
  * Existing game functionality can continue while the reward system is investigated.
  * Emergency suspension can be triggered automatically by predefined risk thresholds.

---

### 📊 30. Treasury & Economy Protection

* [ ] **30.1 📈 Currency Generation Monitoring**

  * Monitor total digital balance creation.
  * Monitor balance generation per:

    * Player
    * Day
    * Week
    * City
    * Land type
    * Game mechanic
  * Detect sudden deviations from expected economy behavior.

* [ ] **30.2 📉 Reward Liability Monitoring**

  * Track theoretical outstanding reward exposure.
  * Track actual pending reward obligations.
  * Track completed reward payments.
  * Track available treasury capacity.
  * Continuously compare economy growth against advertising/operating revenue.

* [ ] **30.3 ⚖️ Economy Stability Controls**

  * All major reward multipliers should be server-configurable.
  * Avoid permanently hard-coding economy multipliers into the client.
  * Support controlled adjustments through versioned economy configuration.

* [ ] **30.4 🧯 Treasury Emergency Thresholds**

  * Automatically reduce or pause reward processing if:

    * Treasury reserves fall below configured levels.
    * Reward requests spike unexpectedly.
    * Advertising revenue drops substantially.
    * Currency generation becomes abnormal.
    * Fraud increases.
    * A game exploit is detected.

* [ ] **30.5 🌎 Global Reward Limits**

  * Establish configurable global:

    * Daily reward ceilings
    * Weekly reward ceilings
    * Hourly processing limits
    * Maximum concurrent payout exposure
  * These limits protect the game from unexpected demand spikes.

---

### 👤 31. Player Reward Limits & Anti-Farming Controls

* [ ] **31.1 🧑 Per-Player Limits**

  * Configure weekly reward limits per account.
  * New accounts may have stricter limits.
  * Mature, trusted accounts may qualify for higher limits where appropriate.

* [ ] **31.2 ⏳ Minimum Account Age**

  * Consider minimum account-age requirements before reward eligibility.
  * Prevent newly created accounts from immediately extracting treasury resources.

* [ ] **31.3 🎮 Genuine Gameplay Requirement**

  * Rewards should derive from legitimate gameplay activity.
  * Detect abnormal automated farming.
  * Detect impossible gameplay rates.
  * Detect suspicious reward accumulation.

* [ ] **31.4 🧬 Account Farming Detection**

  * Detect coordinated account farms.
  * Analyze behavioral relationships rather than relying on a single signal.
  * Avoid automatically penalizing legitimate households or shared environments solely because they share infrastructure.

* [ ] **31.5 🚦 Progressive Risk Controls**

  * Normal players experience minimal friction.
  * Suspicious behavior triggers increasing safeguards.
  * High-risk reward requests may be delayed for additional review.

---

### 🛡️ 32. Maximum Practical Anti-Cheat Architecture

> **Security assumption: The client is potentially compromised.**

* [ ] **32.1 🔒 Server-Authoritative Gameplay**

  * The client requests actions.
  * The server validates the request.
  * The server executes the game rules.
  * The server calculates rewards.
  * The server commits the resulting state.

* [ ] **32.2 🚫 Never Trust Client Economics**

  * Never trust client-reported:

    * Balance
    * Rent
    * Land ownership
    * Inventory
    * Cooldowns
    * Timestamps
    * Reward amounts
    * Completion status

* [ ] **32.3 🔁 Replay Protection**

  * Every economically meaningful request receives an idempotency key.
  * Replaying the same request must not generate additional rewards.
  * Duplicate network requests must be safe.

* [ ] **32.4 🧱 Impossible-State Detection**

  * Detect states that legitimate clients cannot produce.
  * Detect impossible movement.
  * Detect impossible reward generation.
  * Detect impossible transaction sequences.
  * Quarantine suspicious activity for investigation.

* [ ] **32.5 🤖 Bot Detection**

  * Detect:

    * Automated interaction
    * Unrealistic session patterns
    * Perfectly repetitive actions
    * Abnormal timing
    * Abnormal reward velocity
    * Large-scale coordinated accounts

* [ ] **32.6 📱 Mobile Integrity Signals**

  * Where available and appropriate, use platform integrity/attestation signals.
  * Treat integrity signals as risk inputs rather than the sole basis for punishment.
  * Maintain server-side authority regardless of client integrity.

---

### 🔐 33. Account & API Security

* [ ] **33.1 🔑 Secure Authentication**

  * Secure session management.
  * Refresh-token rotation.
  * Session revocation.
  * Suspicious-login detection.
  * Account recovery protection.

* [ ] **33.2 🚦 API Rate Limiting**

  * Rate-limit sensitive endpoints.
  * Apply account/IP/device-aware controls where appropriate.
  * Especially protect:

    * Login
    * Reward generation
    * Land claims
    * Inventory operations
    * Referral systems
    * Reward requests

* [ ] **33.3 🧱 WAF & Edge Protection**

  * Web application firewall.
  * DDoS mitigation.
  * Bot mitigation.
  * Request-size limits.
  * Connection limits.
  * Abuse throttling.

* [ ] **33.4 🔑 Secrets Management**

  * Never ship server secrets inside mobile applications.
  * Never store sensitive provider credentials in source control.
  * Separate development/staging/production credentials.
  * Rotate secrets regularly.

* [ ] **33.5 🧑‍💻 Administrative Security**

  * MFA for administrators.
  * Least-privilege permissions.
  * Separate operational roles.
  * Audit every privileged action.
  * Require additional authorization for treasury-affecting actions.

---

### 🧪 34. Heavy Pre-Alpha Stress Testing

* [ ] **34.1 💥 Load Testing**

  * Test progressively:

    * Hundreds of players
    * Thousands
    * Tens of thousands
    * Projected launch concurrency
    * Projected viral-spike concurrency

* [ ] **34.2 📈 Traffic Spike Testing**

  * Simulate:

    * Viral social-media traffic
    * Mass logins
    * Mass land claiming
    * Large reward events
    * Simultaneous reward requests
    * Advertising traffic spikes

* [ ] **34.3 ☠️ Failure Testing**

  * Intentionally test:

    * Database failures
    * API failures
    * Queue failures
    * Cache failures
    * Network interruptions
    * Payment-provider outages
    * Delayed webhooks
    * Duplicate webhooks
    * Out-of-order events

* [ ] **34.4 🧬 Concurrency Testing**

  * Test thousands of simultaneous requests against:

    * Land claims
    * Rent generation
    * Inventory
    * Reward deductions
    * Reward requests
  * Verify that race conditions cannot duplicate assets or rewards.

* [ ] **34.5 💾 Disaster Recovery**

  * Automated backups.
  * Point-in-time recovery.
  * Tested restoration.
  * Documented recovery procedures.
  * Define RPO/RTO targets.
  * Conduct regular recovery drills.

---

### 🔍 35. Security Testing & Red Team

* [ ] **35.1 🧪 Automated Security Pipeline**

  * Static analysis.
  * Dependency scanning.
  * Secret scanning.
  * Container scanning.
  * API security testing.
  * Infrastructure security testing.

* [ ] **35.2 🕵️ External Penetration Testing**

  * Test authentication.
  * Test authorization.
  * Test APIs.
  * Test economy manipulation.
  * Test reward systems.
  * Test administrative interfaces.

* [ ] **35.3 🧠 Economy Red Team**

  * Attempt to:

    * Generate impossible rent.
    * Duplicate rewards.
    * Duplicate inventory.
    * Claim land multiple times.
    * Bypass cooldowns.
    * Replay requests.
    * Manipulate timestamps.
    * Forge API requests.
    * Abuse referrals.
    * Circumvent weekly limits.
    * Create artificial reward liabilities.

* [ ] **35.4 🐛 Vulnerability Reporting**

  * Establish a security reporting process.
  * Prioritize critical economy/security vulnerabilities.
  * Maintain emergency patch procedures.

---

### 📡 36. Production Observability

* [ ] **36.1 📊 Centralized Metrics**

  * Monitor:

    * Concurrent players
    * Sessions
    * API latency
    * Error rates
    * Database performance
    * Queue depth
    * Cache performance
    * Ad impressions
    * Ad revenue
    * Digital currency generation
    * Reward requests
    * Reward completion
    * Fraud events

* [ ] **36.2 🚨 Automated Alerting**

  * Alert on:

    * Sudden player growth
    * Currency-generation spikes
    * Reward spikes
    * Treasury threshold breaches
    * Fraud spikes
    * Authentication anomalies
    * API failures
    * Database anomalies
    * Advertising-revenue anomalies

* [ ] **36.3 🖥️ Live Operations Dashboard**

  * Real-time overview of:

    * Player population
    * Economy health
    * Treasury
    * Reward obligations
    * Advertising performance
    * Infrastructure health
    * Fraud/risk activity

---

### 🧪 37. Controlled Beta Rollout

* [ ] **37.1 🥚 Closed Beta**

  * Invite-only population.
  * Heavy telemetry.
  * Conservative economy.
  * Limited or disabled reward conversion initially.
  * Aggressive exploit testing.

* [ ] **37.2 🎁 Limited Reward Beta**

  * Enable reward functionality for a small percentage of eligible players.
  * Conservative weekly limits.
  * Monitor every part of the conversion pipeline.

* [ ] **37.3 📈 Progressive Expansion**

  * Increase player population gradually.
  * Increase reward availability only after:

    * Economy stability
    * Backend stability
    * Fraud stability
    * Treasury stability
    * Advertising revenue stability

* [ ] **37.4 🛑 Emergency Rollback**

  * Remotely disable:

    * Reward conversion
    * Specific reward sources
    * Land claiming
    * Referrals
    * Boost mechanics
    * Other problematic systems
  * Preserve ordinary gameplay whenever safely possible.

---

### 🤖 38. Native Android App — Google Play First

* [ ] **38.1 📱 Android Production Build**

  * Optimize:

    * Startup
    * Memory
    * CPU
    * Battery
    * Network traffic
    * Rendering
    * Asset loading

* [ ] **38.2 🏪 Google Play Preparation**

  * Production signing.
  * Release configuration.
  * Store listing.
  * Privacy disclosures.
  * Data-safety requirements.
  * Age/content classification.
  * Account-management requirements.
  * Crash reporting.
  * Closed/open testing tracks.

* [ ] **38.3 🔄 Remote Configuration**

  * Use server-side feature flags where appropriate.
  * Enable economy tuning without unnecessary app releases.
  * Allow emergency disabling of vulnerable mechanics.

* [ ] **38.4 🧪 Device Matrix**

  * Test:

    * Low-end Android
    * Mid-range Android
    * High-end Android
    * Different screen sizes
    * Different OS versions
    * Low-memory devices
    * Poor-network environments

---

### 🍎 39. Apple / iOS Expansion

* [ ] **39.1 🍎 iOS Optimization**

  * Optimize:

    * Memory
    * CPU
    * Battery
    * Rendering
    * Startup
    * Network behavior

* [ ] **39.2 🧪 TestFlight**

  * Conduct controlled iOS beta testing.
  * Compare Android/iOS gameplay behavior.
  * Validate account synchronization and economy consistency.

* [ ] **39.3 🏪 App Store Readiness**

  * Production signing.
  * Privacy disclosures.
  * Required account controls.
  * Store metadata.
  * Review-policy validation.
  * Production crash monitoring.

* [ ] **39.4 🚀 iOS Launch After Proven Scale**

  * Prioritize iOS expansion once:

    * Backend scaling is proven.
    * Economy is stable.
    * Anti-cheat is operational.
    * Reward processing is reliable.
    * Support infrastructure is ready.

---

### ☁️ 40. Full Backend Production Optimization

* [ ] **40.1 🧩 Service Architecture**

  * Separate high-load systems where appropriate:

    * Authentication
    * Player profiles
    * Game state
    * Land
    * Economy
    * Inventory
    * Reward processing
    * Fraud detection
    * Analytics
    * Notifications

* [ ] **40.2 🗄️ Database Optimization**

  * Proper indexes.
  * Query profiling.
  * Connection pooling.
  * Transaction optimization.
  * Appropriate partitioning as scale requires.
  * Strong consistency around economy-critical operations.

* [ ] **40.3 ⚡ Caching**

  * Cache non-authoritative information aggressively.
  * Never allow stale cache data to authorize economy transactions.
  * Establish cache invalidation rules.

* [ ] **40.4 📨 Durable Queues**

  * Use queues for asynchronous:

    * Analytics
    * Notifications
    * Risk analysis
    * Reward processing
    * Reconciliation
  * All important jobs must be idempotent.

* [ ] **40.5 🌐 Geographic Scaling**

  * Prepare infrastructure for regional expansion.
  * Keep latency-sensitive gameplay close to players where economically justified.
  * Keep the authoritative economy centralized/strongly consistent where required.

---

### 🔄 41. CI/CD, QA & Release Engineering

* [ ] **41.1 🧪 Automated Testing**

  * Every production change passes:

    * Unit tests
    * Integration tests
    * API tests
    * Economy tests
    * Security checks
    * Database migration checks
    * Build validation

* [ ] **41.2 🧫 Production-Like Staging**

  * Separate staging infrastructure.
  * Separate databases.
  * Synthetic player accounts.
  * Synthetic advertising data.
  * Synthetic economy.
  * Synthetic treasury.
  * Never test against production reward funds.

* [ ] **41.3 🐤 Canary Deployments**

  * Release backend changes to a small traffic percentage.
  * Monitor:

    * Errors
    * Latency
    * Economy generation
    * Reward requests
    * Fraud
  * Automatically stop rollout when thresholds are exceeded.

* [ ] **41.4 ↩️ Safe Rollback**

  * Every deployment requires a tested rollback strategy.
  * Database migrations must support safe forward recovery.
  * Critical economy changes require additional release review.

* [ ] **41.5 🧪 Full Regression Suite**

  * Automated tests for:

    * Land
    * Passive rent
    * Inventory
    * Bonuses
    * Referrals
    * Advertising integration
    * Reward eligibility
    * Weekly limits
    * Account restrictions
    * Anti-cheat
    * Recovery scenarios

---

### 🧹 42. Full End-to-End Optimization & Production Launch Gate

## ⚡ 42.1 Gameplay Optimization

* [ ] Rendering optimized.
* [ ] Asset loading optimized.
* [ ] Memory usage profiled.
* [ ] Network synchronization optimized.
* [ ] Long-session stability tested.
* [ ] Battery usage tested.
* [ ] Low-end devices tested.

## 🌐 42.2 Network Optimization

* [ ] Payloads minimized.
* [ ] Requests batched where appropriate.
* [ ] Real-time traffic optimized.
* [ ] Connection recovery implemented.
* [ ] Offline/intermittent-network behavior tested.

## 🧮 42.3 Economy Optimization

* [ ] Currency generation modeled.
* [ ] Currency sinks modeled.
* [ ] Passive-rent growth modeled.
* [ ] Advertising revenue modeled.
* [ ] Reward obligations modeled.
* [ ] Treasury stress-tested.
* [ ] Weekly player limits validated.
* [ ] Exploit scenarios simulated.

## 🛡️ 42.4 Security Gate

* [ ] No critical security vulnerabilities.
* [ ] Penetration testing completed.
* [ ] Anti-cheat operational.
* [ ] API authorization verified.
* [ ] Admin security verified.
* [ ] Account abuse controls operational.
* [ ] Emergency controls tested.

## 🏦 42.5 Treasury Gate

* [ ] Treasury accounting operational.
* [ ] Reward obligations tracked.
* [ ] Per-player weekly limits operational.
* [ ] Global limits operational.
* [ ] Reward circuit breaker operational.
* [ ] Reconciliation operational.
* [ ] Emergency reward shutdown tested.

## 📢 42.6 Advertising Gate

* [ ] Banner advertising stable.
* [ ] Ad loading failures handled gracefully.
* [ ] Advertising does not block core gameplay.
* [ ] Revenue telemetry operational.
* [ ] Treasury projections account for advertising volatility.
* [ ] Game remains playable when advertisements fail to load.

## 📱 42.7 Android Gate

* [ ] Google Play production build ready.
* [ ] Crash rate acceptable.
* [ ] Performance targets met.
* [ ] Device compatibility validated.
* [ ] Privacy/data disclosures complete.
* [ ] Account controls operational.

## 🍎 42.8 iOS Gate

* [ ] iOS production build stable.
* [ ] TestFlight validation completed.
* [ ] Performance validated.
* [ ] Privacy requirements validated.
* [ ] App Store release process prepared.

---

### 🚀 43. Final Launch Philosophy

### The game should scale in this order:

**FREE GAME**
↓
**PLAYER GROWTH**
↓
**LONG-TERM GAMEPLAY**
↓
**PASSIVE RENT GENERATION**
↓
**BANNER AD IMPRESSIONS**
↓
**AD REVENUE**
↓
**GAME TREASURY**
↓
**CONTROLLED PLAYER REWARD CAPACITY**
↓
**MORE PLAYER GROWTH**
↓
**MORE AD REVENUE**
↓
**MORE DEVELOPMENT**
↓
**MORE CONTENT**
↓
**LARGER PLAYER BASE**

The fundamental objective is **not to extract money from players.**

The objective is to build a sustainable free game where:

**Players provide attention → advertisers provide revenue → the game treasury funds operations and player rewards → successful growth creates more advertising revenue → the game becomes capable of supporting a larger ecosystem.**

---

# 🔐 Non-Negotiable Economic Security Rule

**The player's game balance must never be treated as a bank account.**

It is an **immutable digital game-state balance** generated through gameplay.

The reward mechanism is separate.

Conceptually:

**Gameplay**
→ generates digital game balance

**Digital game balance**
→ has no intrinsic real-world value

**Player becomes eligible**
→ according to game rules

**Player voluntarily forfeits qualifying game balance**
→ conversion request is created

**Weekly player limit**
→ caps reward exposure

**Risk engine**
→ validates request

**Treasury**
→ verifies available reward capacity

**Reward processor**
→ processes eligible reward

**Ledger**in mm
→ permanently records the result

This separation is extremely important because it prevents the game's internal economy from becoming conceptually equivalent to a player-held cash wallet.

---

## 📁 Repository Structure

```text
├── index.html          # Main application structure, modals, HUD & portrait guard
├── manifest.json       # PWA app configuration & home screen icons
├── sw.js               # Service Worker for local asset caching & offline play
├── css/
│   └── style.css       # Dark fantasy theme, animations, radar pulses & glowing borders
├── models/             # 3D GLTF / GLB Skeletal Character Models
│   ├── Soldier.glb     # Vanguard Soldier (Idle, Walk, Run)
│   ├── Xbot.glb        # X-Operative Android (Mixamo Rig)
│   ├── Fox.glb         # Low-Poly Spirit Fox (Survey, Walk)
│   ├── CesiumMan.glb   # Cesium Tracksuit Walker
│   └── character.glb   # Custom Champion
└── js/
    ├── config.js       # Central tuning file (rates, drop weights, radiuses, Firebase keys)
    ├── geo.js          # Web Mercator math, 3-tier proximity diamond spawner, tile bounds
    ├── storage.js      # Save engine, Firestore cloud sync, offline progress & lifetimeRent
    ├── auth.js         # Google Identity Services OAuth & instant auto-login session restore
    ├── loading.js      # 3D slow-motion stage, bootloader pipeline & zero-race condition loader
    ├── character.js    # Three.js WebGL custom layer & frame-throttled speed animation controller
    ├── diamonds.js     # MapLibre 3D markers, viewport culling & flying gem arc particle to HUD
    ├── grid.js         # 10x10ft tile rendering, 5km horizon culling, flood-fill clustering
    ├── wheel.js        # GPU-accelerated CSPRNG wheel with 3D gems & failsafe timer
    ├── feed.js         # Live activity feed ticker with dedicated event broadcasting
    ├── leaderboard.js  # 4-tier scoped leaderboards with offline rent simulation & tie-breakers
    ├── foliage.js      # Standing grass tufts & zero-context pre-rendered 3D mushrooms
    ├── chat.js         # Real-time community global chat drawer with moderation & anti-spam
    ├── citadels.js     # 3D Dyson Sphere monuments, 5km horizon culling, forge upgrades & siege combat
    ├── pool.js         # 1% Weekly Realm Treasury Dividend Pool engine & Monday distribution
    ├── friends.js      # Firestore-backed friendship network, daily gifts & request notification badges
    ├── referrals.js    # Safe claimable bonus referral ledger & promo code claim flow
    └── main.js         # Game loop, GPS power-saving controller, camera transitions & UI wiring
```

---

## 🚀 How to Host on GitHub Pages

1. **Create a GitHub repository** (public or private) and upload all project files preserving the folder structure.
2. In your repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to `Deploy from a branch`, choose `main` (or default branch), and select folder `/ (root)`.
4. Click **Save**. GitHub Pages will deploy your game at `https://yourusername.github.io/your-repo/`.
5. Open the link on your phone. Tap **Share → Add to Home Screen** on iOS or **Install App** on Android to play in full-screen standalone mode.

---

## 🔑 Optional: Enable Google Sign-In & Firebase Cloud Saves

By default, the game offers instant on-device Guest mode with persistent saves. To enable **Google Sign-In & Firebase Cloud Saves**:

1. Open the [Google Cloud Console Credentials Page](https://console.cloud.google.com/apis/credentials) and create an **OAuth 2.0 Client ID** (Authorized origin: `https://yourusername.github.io`).
2. Copy your Client ID into `js/config.js`:
   ```javascript
   GOOGLE_CLIENT_ID: "your-id-here.apps.googleusercontent.com",
   ```
3. Create a free project at [firebase.google.com](https://firebase.google.com), enable **Firestore Database**, and paste your config keys into `js/config.js`:
   ```javascript
   FIREBASE_CONFIG: {
     apiKey: "YOUR_API_KEY",
     authDomain: "your-app.firebaseapp.com",
     projectId: "your-app",
     // ...
   }
   ```
4. Commit and push. Your game will now auto-save progress to the cloud and sync multiplayer territories live worldwide!

---

## ⚙️ Game Balance & Plot Rarities

All gameplay tuning parameters are centralized in **`js/config.js`**:

| Rarity | Drop Chance | Rent per Second | Color |
| :--- | :---: | :---: | :---: |
| **Common** | **50%** | `$0.0000000016/s` | Slate Grey (`#8fa3b8`) |
| **Rare** | **30%** | `$0.0000000027/s` | Cyan Blue (`#4f9dd6`) |
| **Epic** | **15%** | `$0.0000000044/s` | Royal Purple (`#a86ee0`) |
| **Legendary** | **5%** | `$0.0000000088/s` | Radiant Gold (`#e0a84f`) |

---

## � Recent Changelog & System Updates

### Patch `0.1.8.24b` — Social Expansion, Account Integrity & Mobile Responsiveness
* **👥 Full Firestore Friends System (`js/friends.js`):**
  * Send, accept, and decline friend requests with live pending notification badges (pulsing red dot).
  * Direct daily gift exchange (+5 EB/day) without cross-player document write security conflicts.
  * Interactive Friendship Detail card with 10-heart progress tracker and friendship quests.
* **🎁 Claimable Referral Architecture (`js/referrals.js` & `firestore.rules`):**
  * Eliminated risky cross-player document mutations by introducing a dedicated `referral_bonuses` claimable collection.
  * Real-time pending bonus viewer and clear visual feedback ("Applied" button state + celebration toast).
* **🔐 Canonical Account Identity & Duplicate Migration (`js/auth.js` & `js/storage.js`):**
  * Added `migrateLegacyDuplicateAccounts()` on sign-in to consolidate orphaned duplicate saves under the canonical Google UID.
  * Added save mismatch guards preventing stale local storage profiles from overwriting authenticated cloud accounts.
* **📜 Daily Quests Integration (`js/main.js` & `index.html`):**
  * Upgraded Daily Login Calendar modal into a dual-tab experience: Daily Streak Rewards and Daily Quests.
  * Live status tracking for active daily goals with instant visual checkmarks.
* **🦅 Expanded 25-Mile Bird's-Eye View (`js/grid.js`):**
  * Scaled the bird's-eye distance threshold to 40,000m (~25 miles) for broad city-scale territory overviews.
* **📱 Narrow Mobile Screen Responsive Suite (`css/style.css`):**
  * Scaled Fortune Wheel to `min(250px, 72vw)` to prevent canvas overflow and preserve one-screen visibility on small displays.
  * Compact responsive layouts for Player Info, My Land statistics, and multi-button action rows.
* **🎨 100% In-Game Modal UX:**
  * Replaced all native browser `alert()` and `confirm()` prompts with styled, responsive in-game dialogs (`showToast` and `gameConfirm`).

---

## �👥 3D Assets & Model Attributions

* **Character Models:** Mixamo / Adobe (CC0 / Royalty Free Standard)
* **CesiumMan & Xbot:** Khronos Group & Three.js Official Samples
* **Grass Yellowing:** Steve B [CC-BY] via Poly Pizza
* **White Dandelions:** Aeres Vistaas [CC-BY] via Poly Pizza
* **Pine Tree & Autumn Foliage:** Quaternius [CC0]
* **Mushrooms:** Jarlan Perez [CC-BY] via Poly Pizza
* **Tower / Landmark:** Anonymous [CC-BY] via Poly Pizza
* **Twisted Tree & Bushes:** Quaternius [CC0]

---

## 📄 License & Disclaimer

This is a personal, open-source fan implementation of real-world grid collection games. Built from scratch with pure web standards for educational and entertainment purposes.