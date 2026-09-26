# Elden Earth -- Complete Game Guide

A comprehensive guide to every feature, currency, progression system, and gameplay mechanic in Elden Earth.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Currencies](#currencies)
3. [Land Claiming](#land-claiming)
4. [Passive Income](#passive-income)
5. [Diamonds](#diamonds)
6. [The Spin Wheel](#the-spin-wheel)
7. [30X/50X Boost Multiplier](#boost-multiplier)
8. [+2EB Boost Claim](#2eb-boost-claim)
9. [Diamond Extractor](#diamond-extractor)
10. [Realm Citadels](#realm-citadels)
11. [Elden Stops (POI Beacons)](#elden-stops)
12. [Companion Pet](#companion-pet)
13. [Political Titles & Royalties](#political-titles)
14. [Weekly Treasury Pool](#weekly-treasury-pool)
15. [Friends System](#friends-system)
16. [Referral System](#referral-system)
17. [Leaderboards](#leaderboards)
18. [Daily Calendar & Quests](#daily-calendar--quests)
19. [50X Super Boost Events](#50x-super-boost-events)
20. [Global Chat](#global-chat)
21. [Activity Feed](#activity-feed)
22. [3D Character & Wardrobe](#character--wardrobe)
23. [Bird's Eye View](#birds-eye-view)
24. [Map Controls](#map-controls)
25. [Progression Roadmap](#progression-roadmap)

---

## Getting Started

### Installation

Elden Earth runs as a **Progressive Web App (PWA)**. No app store download needed:

1. Open the game URL in your mobile browser
2. Tap **Share > Add to Home Screen** (iOS) or **Install App** (Android)
3. The game installs to your home screen like a native app

### Sign In

- **Google Sign-In:** Required for cloud saves, multiplayer sync, and leaderboard placement
- Your progress saves automatically to Google Cloud (Firestore)
- You can play on multiple devices -- your state syncs everywhere

### First Steps

1. **Allow GPS** -- the game needs your location to render the map and spawn diamonds
2. **Walk around** -- diamonds appear as floating red gems on the map
3. **Collect diamonds** -- walk within 75 meters to pick them up
4. **Spin the wheel** -- spend 2 diamonds per spin for a chance to win EB (Elden Bucks)
5. **Buy land** -- spend 100 EB per tile to claim 20x20 ft parcels beneath you
6. **Earn passive income** -- every owned tile generates simulated rent every second

---

## Currencies

### Elden Bucks (EB)

- **Symbol:** EB icon (coin)
- **Primary use:** Buying land plots, upgrading citadels, building the extractor
- **Earned from:** Spin wheel, passive rent, +2EB boost, political royalties, daily calendar, referrals, friend gifts
- **Starting amount:** 0
- **No purchase required** -- all EB comes from gameplay

### Diamonds (◆)

- **Symbol:** Red diamond gem
- **Primary use:** Spinning the wheel, purchasing boosts, upgrading citadels
- **Earned from:** Collecting floating diamonds on the map, spin wheel jackpots, extractor mining, Elden Stop rewards, daily calendar
- **Starting amount:** 0
- **Cannot be purchased** -- earned entirely through walking and gameplay

### Simulated Cash ($)

- **Symbol:** Dollar sign ($)
- **Primary use:** Display only -- shows your passive income accumulation
- **Generated from:** Owned land tiles every second based on rarity
- **Can be spent** -- Display of your earnings, can be spent on unlocking game features e.g. cupgrades for Extractor Mine or Citadel

### Lifetime Accrued Rent

- **What it is:** A permanent, non-decreasing total of all rent you have ever earned
- **Used for:** Leaderboard rankings and tie-breakers
- **Never resets** -- even if spendable cash goes down

---

## Land Claiming

### How It Works

1. Tap the **Buy Land** button in the bottom bar
2. The camera zooms to a flat 2D top-down view
3. A grid of 20x20 ft tiles appears around your real-world location
4. Tap an empty tile inside your radius to claim it
5. Pay **100 EB** per tile

### Plot Rarities

Each tile is randomly assigned a rarity when claimed:

| Rarity | Drop Chance | Rent per Second | Color | Value |
|---|---|---|---|---|
| **Common** | 50% | $0.0000000016/s | Slate Grey | Base |
| **Rare** | 30% | $0.0000000027/s | Cyan Blue | ~1.7x |
| **Epic** | 15% | $0.0000000044/s | Royal Purple | ~2.75x |
| **Legendary** | 5% | $0.0000000088/s | Radiant Gold | ~5.5x |

### Plot Count Matters

- More plots = higher passive income = higher leaderboard rank
- Political titles are based on plot count in a geographic area
- Boost multiplier scales with plot count (anti-whale tiers)

---

## Passive Income

Every owned tile generates simulated rent every second. The rate depends on the tile's rarity.

### How Income Works

- Income ticks every **1 second** while the game is open
- When the game is closed, **offline progress** is calculated on next login (up to 24 hours)
- Boost multiplier applies to income when active
- The income rate is: `base_rent_per_second * number_of_plots * boost_multiplier * tier_factor`

### Example

- 10 Common plots: ~$0.000000016/s
- With 30X boost active: ~$0.00000048/s
- Over 1 hour: ~$0.0017

### Offline Earnings

When you return after being away, the game calculates how much you would have earned during your absence:
- Base rent accumulates for each owned plot
- Boost time is separated from non-boost time for accurate calculation
- Maximum offline window: **24 hours**

---

## Diamonds

### Spawning

Diamonds appear as floating red gems on the map at real-world GPS coordinates:

- **Inner circle (40%):** Within 85m -- close walking distance
- **Mid range (35%):** 85m -- 350m -- short walk
- **Horizon (25%):** 350m -- 1000m -- exploration required
- **Maximum active at once:** 11 diamonds
- **Spawn check:** Every 2 minutes
- **Lifetime:** 30 minutes before despawning

### Collecting

- Walk within **75 meters** of a diamond
- Tapping diamonds inside radius: a flying particle animation to your HUD
- Server validates your GPS position before awarding the diamond

### What Diamonds Are Used For

- **Spin the wheel:** 2 diamonds per spin
- **10X Multi-Spin:** 20 diamonds for 10x rewards
- **Citadel upgrades:** Depending on tier
- **Activate boosts:** Server-verified activation
- **Mood drain:** Using diamonds for upgrades slightly reduces pet mood

---

## The Spin Wheel

### Access

Tap the **Earn** button in the bottom bar to open the Diamond Wheel modal.

### How It Works

1. The wheel has **10 slices** with different rewards
2. Costs **2 diamonds** per spin (or 20 for 10X)
3. Tap **Spin** to rotate
4. The wheel stops on a weighted random slice

### Wheel Slices

| Slice | Reward | Type |
|---|---|---|
| 1 EB | 1 Elden Buck | Currency |
| 5 EB | 5 Elden Bucks | Currency |
| 10 EB | 10 Elden Bucks | Currency |
| 20 EB | 20 Elden Bucks | Currency |
| 50 EB | 50 Elden Bucks | Currency |
| Lucky 7 | 7 Elden Bucks | Currency (rare) |
| +10 Diamonds | 10 Diamonds | Diamond Jackpot |
| +12 Diamonds | 12 Diamonds | Diamond Mega Jackpot |
| +24 Diamonds | 24 Diamonds | Diamond Ultra Jackpot |

### Fairness

The wheel uses the **Web Cryptography API** (`window.crypto.getRandomValues`) with modulo-bias-free rejection sampling. Every spin is cryptographically provable as fair.

### 10X Multi-Spin Toggle

- Toggle the checkbox to enable 10X mode
- Cost increases to **20 diamonds** per spin
- All rewards are multiplied by 10
- Toggle persists between modal opens (but button text resets -- known UI bug)

---

## Boost Multiplier

### 30X Boost

- Multiplies all passive income by **30X** (or less with anti-whale scaling)
- Duration: **1 hour** per activation
- Maximum banked: **6 hours**
- Cost: Activated through the Multiplier button (top-left floating button)

### 50X Super Boost Events

- Periodic server-wide events that upgrade the base multiplier from 30X to **50X**
- Event cycle: **24 hours active** / **72 hours cooldown**
- Your effective multiplier scales with the same anti-whale tiers

### Anti-Whale Tier Scaling

The multiplier scales down as you own more plots to prevent runaway income:

| Plots Owned | Effective Multiplier (30X base) | Effective Multiplier (50X base) |
|---|---|---|
| 0 -- 150 | 30X | 50X |
| 151 -- 220 | 20X | 33X |
| 221 -- 290 | 15X | 25X |
| 291 -- 365 | 12X | 20X |
| 366 -- 730 | 9X | 15X |
| 731 -- 1500 | 6X | 10X |
| 1501+ | 2X | 3X |

### How to Activate

1. Tap the floating **Multiplier button** (bottom-left, shows current tier like "30X")
2. Review the effective multiplier for your plot count
3. Tap **Activate** to add 1 hour to your boost timer
4. Boost time stacks up to 6 hours maximum

---

## +2EB Boost Claim

- A floating **+2 EB** button appears every **20 minutes**
- Tap it to instantly receive **2 Elden Bucks**
- 20-minute cooldown starts after each claim
- Prevents multi-tab and refresh abuse (cooldown tracked server-side)
- Stays visible for **45 seconds** -- tap it before it disappears

---

## Diamond Extractor

### Building

- Requires **5+ connected land plots**
- Costs **50 EB** to construct
- Only **1 per player**
- Automatically mines **1 diamond every 10 minutes**
- Stores up to **50 diamonds** (must collect before it pauses)

### Upgrades

- Available once your balance reaches certain thresholds
- Each upgrade level either:
  - **Increases storage capacity** (50 -> 51 -> 52...)
  - **Reduces mining interval** (faster diamond production)
- Alternates between storage and speed upgrades

### Collecting

Open the Extractor modal from the side HUD to collect stored diamonds and check your upgrade progress.

---

## Realm Citadels

### What Are Citadels?

3D Dyson Sphere monuments that players plant on the map to claim territory. They evolve through rarity tiers and can be sieged by other players.

### Planting a Citadel

- **Prerequisite:** Must have planted your own citadel before sieging others
- Planted at your current GPS coordinates
- **Growth phase:** 30 minutes for the 3D model to fully evolve
- Costs diamonds to plant (scales with rarity)

### Rarity Tiers

| Tier | Hourly Diamond Yield | Hourly EB Yield |
|---|---|---|
| Common | 1 Diamond/hr | ~3 EB/hr |
| Rare | 4 Diamond/hr | ~12 EB/hr |
| Epic | 12 Diamond/hr | ~36 EB/hr |
| Legendary | 24 Diamond/hr | ~72 EB/hr |

### Upgrade Forge

Evolve your citadel to a higher rarity:

| Upgrade | EB Cost | Diamond Cost |
|---|---|---|
| Common -> Rare | 50 EB | 75 Diamonds |
| Rare -> Epic | 100 EB | 125 Diamonds |
| Epic -> Legendary | 300 EB | 400 Diamonds |

- **Evolution time:** 10 minutes with a live countdown
- Visual transformation during evolution (kinetic rings, ground borders)

### Siege Combat

- Walk within **100 meters** of an enemy citadel
- Spend **1 Diamond** to initiate a reflex-meter siege
- Time your strike in the **gold zone** on the power meter
- Successful hit shatters the defender's shield and earns **+5 EB Conquest Bounty**
- Defender keeps 100% of their banked loot
- **Anti-abuse:** Cannot siege any citadel within 250m of your own home Hold

### Garrison Defense

- Station your 3D avatar inside your citadel
- Live defense ticker shows protection countdown
- Hourly yields accumulate while garrisoned

---

## Elden Stops

### What Are Elden Stops?

Public landmark beacons (similar to PokeStops) where players walk to spin a disc for rewards.

### How They Work

1. **Construction phase:** New stops take **30 minutes** to build
2. **Spin requirement:** Walk within **75 meters** of the beacon
3. **Cooldown:** **15 minutes** per stop after spinning
4. **Rewards:** Server-rolled loot including diamonds, EB, and rare plot jackpots

### Disc Spin Rewards

- Diamonds (varies)
- Elden Bucks (varies)
- **1.5% chance** for a free plot jackpot

### Cinematic Mode

- Walking near an Elden Stop triggers a 3D fly-in cinematic
- The disc spins with particle effects
- Rewards display with celebration animations

---

## Companion Pet

### What Is It?

A 3D companion animal that follows your character on the map with unique behaviors.

### Features

- **Follows you** at a fixed offset behind your character
- **Idle animations** when you stand still
- **Fetch mechanic** -- pet runs to nearby objects and returns
- **Mood system** -- mood decays at 4%/hour
- **Berry collection** -- feed your pet to restore mood
- **Diamond interaction** -- using diamonds for upgrades drains mood slightly

### Mood Effects

- **High mood (75-100%):** Happy animations, faster movement
- **Medium mood (25-75%):** Normal behavior
- **Low mood (0-25%):** Sad animations, slower movement

### Managing Your Pet

- Open the Pet modal from the side HUD
- Check mood level, berry count, and total items fetched
- Feed berries to restore mood
- Trigger fetch to send pet exploring

---

## Political Titles

### How Titles Work

Based on your **plot count** in geographic areas, you earn stackable royalty titles:

| Title | Scope | Requirement | Royalty |
|---|---|---|---|
| **Mayor** | City/Town | Most plots in city | +2 EB (2%) on local purchases |
| **Governor** | State/Province | Most plots in state | +2 EB (2%) on regional purchases |
| **President** | Country | Most plots in country | +2 EB (2%) on national purchases |

### Triple Crown

Hold all 3 titles simultaneously for a **+6 EB (6%) Triple Crown Royalty** deposited to your cloud save.

### How Royalties Work

- When **any player** buys land in your territory, you earn a percentage of the cost
- Royalties are deposited automatically to your balance
- Checked and updated in real-time via Firestore snapshots

---

## Weekly Treasury Pool

### What Is It?

Every **Monday at 00:00 UTC**, the game distributes **1% of global lifetime rent** to the top 10 players.

### Distribution

| Rank | Share |
|---|---|
| 1st | 25% |
| 2nd | 15% |
| 3rd | 10% |
| 4th -- 10th | ~7.14% each |

### How to Participate

- Earn passive rent from owned land
- Climb the **Lifetime Rent leaderboard**
- Higher rank = larger share of the pool
- Rewards auto-claim on Monday -- check the Treasury Pool modal

### Anti-Duplicate Protection

- ISO-week locking prevents double-claims
- Each week is independently tracked
- Claim modal appears automatically when the pool distributes

---

## Friends System

### Adding Friends

1. Open **Player Info** on any player (via map tap or leaderboard)
2. Tap **Send Friend Request**
3. They receive a notification (red dot on their profile tab)
4. They accept or decline

### Features

- **Max 50 friends**
- **Daily gifts:** Send each friend **+5 EB/day**
- **Relationship tracking:** See friendship status and gift history
- **Friend request notifications:** Real-time red dot indicator

### Managing Friends

Open the **Friends tab** in your Player Info modal to:
- View your friends list
- Send daily gifts
- Accept or decline pending requests
- See online status

---

## Referral System

### How It Works

1. Open the **Referrals tab** in your Player Info modal
2. Generate a unique referral code (e.g., `VICNAMEabcd`)
3. Share the code with friends
4. When they sign up and enter your code:
   - **They receive:** Starting bonus
   - **You receive:** **+25 EB** per referral

### Claimable Bonuses

- Referral bonuses go to a dedicated `referral_bonuses` Firestore collection
- You must **manually claim** each bonus from the Referrals tab
- This prevents cross-player document write conflicts

### Stats

- Track total referral count
- See lifetime royalty earned from referrals

---

## Leaderboards

### Scopes

| Scope | Filter |
|---|---|
| **Global** | All players worldwide |
| **Country** | Players in your country |
| **State** | Players in your state/province |
| **City** | Players in your city |

### Tabs

| Tab | Metric |
|---|---|
| **Plots** | Total land tiles owned |
| **Rent** | Total lifetime rent earned |

### Features

- Real-time Firestore queries
- Cached for 60 seconds to reduce reads
- XSS-safe HTML escaping for player names
- Country flag emojis (ISO 3166 conversion)
- Tie-breaker: highest lifetime rent wins

### Royal Titles Display

Players with political titles show their rank:
- **Mayor:** City rulers
- **Governor:** State rulers
- **President:** Country rulers

---

## Daily Calendar & Quests

### 30-Day Login Calendar

Log in daily to claim escalating rewards:

| Day | Reward |
|---|---|
| 1 -- 6 | 3 EB each |
| 7 | 25 EB + 5 Diamonds |
| 8 -- 13 | 3 EB each |
| 14 | 50 EB + 10 Diamonds |
| 15 -- 20 | 3 EB each |
| 21 | 75 EB + 15 Diamonds |
| 22 -- 27 | 3 EB each |
| 28 | 100 EB + 25 Diamonds |
| 29 | 150 EB + 50 Diamonds |
| **30** | **200 EB + 100 Diamonds** |

### Daily Quests

Actionable goals that reset daily:

| Quest | Task | Reward |
|---|---|---|
| **Wheel Spin** | Spin the diamond wheel | EB bonus |
| **Gift a Friend** | Send a daily gift | EB bonus |
| **Survey Realm** | Use Bird's Eye View | EB bonus |
| **Land Claim** | Buy a new land plot | EB bonus |

- Quests track completion in real-time
- Claim rewards from the Calendar modal (Daily Quests tab)

---

## 50X Super Boost Events

### Schedule

- **Active period:** 24 hours
- **Cooldown period:** 72 hours (3 days)
- **Cycle:** Continuous server-locked rotation

### What Happens

- Base multiplier upgrades from **30X to 50X** for all players
- Screen shake effects during 50X (can be disabled in settings)
- Timer badge in the top bar shows countdown
- Effective multiplier follows the same anti-whale tier scaling

### Checking Status

- The **Multiplier button** shows the current base (30X or 50X)
- The **Treasury Pool modal** shows the 50X event countdown
- Top bar badge displays remaining time

---

## Global Chat

### Access

Tap the **chat bubble** button in the bottom bar to open the chat drawer.

### Features

- **Real-time messages** via Firestore snapshots
- **25-message rolling buffer**
- **Profanity filter** (client + server-side)
- **4-second anti-spam cooldown**
- **Plot-gated access** (must own land to chat)
- **Online player count** display

### Rules

- Be respectful to other players
- No spam, advertising, or offensive language
- Messages are server-filtered before broadcast
- Repeated violations may result in chat restrictions

---

## Activity Feed

### What It Shows

A live ticker of worldwide game events:
- Player joined the game
- Land purchased (with rarity and location)
- Diamonds collected
- Citadels planted or upgraded
- Friend requests sent
- Boost activations

### Features

- **50-event buffer** (scrollable)
- **Country flag emojis** for each player
- **City geocoding** for location context
- **Timestamps** showing how long ago
- **Unread badge** on the VIEW button when new events arrive

---

## Character & Wardrobe

### 3D Characters

Your avatar is a 3D animated model rendered on the map at your GPS position:

| Model | Description |
|---|---|
| **Soldier** | Vanguard warrior with idle and walk animations |
| **X-Operative** | Futuristic android with tactical animations |
| **Spirit Fox** | Low-poly mystical fox companion |
| **Cesium Runner** | Tracksuit runner with fluid motion |

### Changing Characters

1. Open **Player Info** modal
2. Tap the **pencil icon** on your profile card
3. Browse available models in the **Wardrobe modal**
4. Tap to equip -- your 3D avatar updates instantly on the map

### Animations

- **Idle:** Standing still -- character sways gently
- **Walk:** Moving -- character walks with natural gait
- **Run:** Fast movement -- character speeds up

Frame rate auto-adjusts: 15 FPS when stationary, 60 FPS when walking.

---

## Bird's Eye View

### What Is It?

A zoomed-out territory overview showing your land holdings across a **25-mile radius**.

### How to Access

1. Open **Player Info** modal
2. Tap your **plot count** stat
3. Camera flies up to reveal the full territory

### Features

- Shows all owned plots with rarity colors
- Citadel locations visible
- Exit button returns to normal gameplay view
- Useful for planning land expansion routes

---

## Map Controls

### Bottom Bar Buttons

| Button | Function |
|---|---|
| **Compass** | Resets camera to True North (0 degrees) |
| **Buy Land** | Enters land purchase mode |
| **Earn** | Opens the Diamond Wheel |
| **My Land** | Shows plot stats and land info |
| **Chat** | Opens global community chat |

### Map Gestures

- **Pinch to zoom** -- zoom in/out
- **Two-finger rotate** -- change camera bearing
- **Two-finger tilt** -- adjust camera pitch (0 degrees = flat, 60 degrees = isometric)
- **Single finger drag** -- pan the map

### Side HUD Buttons

| Button | Function |
|---|---|
| **Mine** | Opens Diamond Extractor |
| **Ranks** | Opens Leaderboards |
| **Calendar** | Opens Daily Calendar & Quests |
| **Pet** | Opens Companion Pet modal |
| **Multiplier** | Opens Boost activation modal |
| **Pool** | Opens Weekly Treasury Pool |

---

## Progression Roadmap

### Early Game (Day 1 -- 7)

1. Sign in with Google
2. Collect diamonds from the map
3. Spin the wheel 5 -- 10 times
4. Claim your first land tiles (3 -- 5 plots)
5. Activate your first 30X boost
6. Unlock the +2EB boost button
7. Complete daily quests

### Mid Game (Week 2 -- 4)

1. Accumulate 20 -- 50 land plots
2. Build the Diamond Extractor
3. Plant your first Citadel
4. Start earning political titles
5. Add friends and send daily gifts
6. Climb city-level leaderboards
7. Reach Day 30 calendar milestone

### Late Game (Month 2+)

1. Own 100+ land plots
2. Upgrade Citadels to Legendary
3. Win siege combat for +5 EB bounties
4. Climb national leaderboards
5. Earn Triple Crown (Mayor + Governor + President)
6. Compete for Weekly Treasury Pool (Top 10)
7. Max out the Diamond Extractor
8. Collect all 4 character models

### Endgame Goals

- **1000+ plots** -- become a global landlord
- **Top 10 Treasury Pool** -- earn weekly dividends
- **Legendary Citadels** -- maximum hourly yields
- **Triple Crown holder** -- stack all 3 political royalties
- **Pet maxed** -- full mood, all fetches completed

---

## Tips & Strategies

### Diamond Collection

- Walk in areas with varied terrain -- diamonds spawn across the full 1km radius
- Check the map every 2 minutes for new spawns
- Prioritize inner-circle diamonds (85m) for quick collection
- Diamonds despawn after 30 minutes -- don't wait too long

### Land Investment

- **Common plots** are cheap but low yield -- good for quantity
- **Legendary plots** are rare but 5.5x more profitable
- Focus on **connected plots** to unlock the Diamond Extractor
- Claim land in areas you visit regularly for consistent income

### Boost Management

- Always keep boost active when playing -- 30X is a massive multiplier
- Bank up to 6 hours before going offline
- Check the 50X event schedule -- activate boost during 50X events for maximum effect
- Remember: anti-whale tiers reduce effective multiplier at high plot counts

### Social Features

- Send daily gifts to all friends -- +5 EB per friend adds up fast
- Use referral codes -- +25 EB per referral is significant early game
- Climb political titles for passive royalties from other players' land purchases
- Check the leaderboard to see who's ahead and plan your expansion

### Efficiency

- Play during 50X events for maximum income
- Use Bird's Eye View to plan land expansion routes
- Keep the Extractor running -- free diamonds every 10 minutes
- Don't hoard diamonds -- spend them on spins and boosts for faster progression
