// ============================================================
// Elden Earth — Anti-Cheat & Anti-Spoofing System
// GPS velocity checks, North Korea embargo, rate limiting,
// balance validation, replay protection.
// ============================================================
const AntiCheat = (() => {

  // ======================== CONFIG ========================
  const MAX_SPEED_MPS = 55;           // ~200 km/h — faster than any car on normal roads
  const MAX_ACCEL_MPS2 = 15;          // ~54 km/h per second — impossible for humans
  const POSITION_HISTORY_SIZE = 10;   // Track last 10 GPS readings
  const POSITION_STALE_MS = 30000;    // Ignore positions older than 30s
  const PURCHASE_COOLDOWN_MS = 5000;  // 5s minimum between ANY purchase type
  const MAX_PURCHASES_PER_MINUTE = 5; // Hard cap on purchases per 60s window
  const BALANCE_MAX_EB = 500000;      // Impossible EB balance threshold
  const BALANCE_MAX_DIAMONDS = 10000; // Impossible diamond threshold
  const MAX_TRACKED_PURCHASE_IDS = 500; // Replay-protection ring buffer size

  // ======================== EMBARGO LIST ========================
  const EMBARGOED_COUNTRIES = [
    "north korea", "dprk", "democratic people's republic of korea",
    "corée du nord", "korea (democratic people's republic of)",
    "朝鲜民主主义人民共和国"
  ];

  const EMBARGOED_DISPLAY_NAMES = [
    "North Korea", "DPRK", "Democratic People's Republic of Korea"
  ];

  // ======================== STATE ========================
  let positionHistory = [];
  let lastPurchaseTime = 0;
  let purchaseTimestamps = [];
  let purchaseIdSet = new Set();
  let playerCountry = null;
  let isEmbargoed = false;
  let spoofingWarnings = 0;
  let lastWarningTime = 0;

  // ======================== GPS SPOOFING DETECTION ========================

  /**
   * Feed a new GPS position into the anti-spoofing system.
   * Returns { valid: bool, reason: string, speed: number }
   */
  function validatePosition(lat, lon, accuracy, timestamp) {
    const now = Date.now();
    const posTime = timestamp || now;

    // Skip if position is stale
    if (now - posTime > POSITION_STALE_MS) {
      return { valid: true, reason: "stale", speed: 0 };
    }

    const newPos = { lat, lon, time: posTime, accuracy };

    // First position — just record it
    if (positionHistory.length === 0) {
      positionHistory.push(newPos);
      return { valid: true, reason: "initial", speed: 0 };
    }

    const prev = positionHistory[positionHistory.length - 1];
    const dt = (posTime - prev.time) / 1000; // seconds

    // Skip if time delta is too small (division by near-zero)
    if (dt < 0.1) {
      return { valid: true, reason: "tiny_dt", speed: 0 };
    }

    // Calculate distance and speed
    const dist = haversine(prev.lat, prev.lon, lat, lon);
    const speed = dist / dt; // meters per second

    // GPS accuracy gate — badly-degraded fixes (>150m) are too unreliable to trust at all.
    // Fixes between 50-150m are common outdoors/urban and are still accepted so the player's
    // position keeps updating (rejecting them entirely used to freeze the player in place,
    // which then made in-range diamonds falsely report as "too far").
    if (accuracy > 150) {
      return { valid: false, reason: "low_accuracy_" + accuracy.toFixed(0), speed };
    }

    // Skip the speed/acceleration spoof checks (but still accept the position) when accuracy
    // is degraded, since GPS drift alone can fake a "speed violation" at low accuracy.
    if (accuracy > 50) {
      positionHistory.push(newPos);
      trimHistory();
      return { valid: true, reason: "low_accuracy_accepted_" + accuracy.toFixed(0), speed };
    }

    // SPEED CHECK
    if (speed > MAX_SPEED_MPS) {
      spoofingWarnings++;
      lastWarningTime = now;
      console.warn(`[AntiCheat] SPEED VIOLATION: ${speed.toFixed(1)} m/s (${(speed * 3.6).toFixed(0)} km/h) — max ${MAX_SPEED_MPS} m/s`);
      positionHistory.push(newPos);
      trimHistory();
      return {
        valid: false,
        reason: `speed_violation_${speed.toFixed(0)}ms`,
        speed
      };
    }

    // ACCELERATION CHECK (need at least 3 positions)
    if (positionHistory.length >= 2) {
      const prev2 = positionHistory[positionHistory.length - 2];
      const dt2 = (prev.time - prev2.time) / 1000;
      if (dt2 > 0.1) {
        const speed1 = haversine(prev2.lat, prev2.lon, prev.lat, prev.lon) / dt2;
        const accel = Math.abs(speed - speed1) / dt;

        if (accel > MAX_ACCEL_MPS2) {
          spoofingWarnings++;
          lastWarningTime = now;
          console.warn(`[AntiCheat] ACCELERATION VIOLATION: ${accel.toFixed(1)} m/s² — max ${MAX_ACCEL_MPS2} m/s²`);
          positionHistory.push(newPos);
          trimHistory();
          return {
            valid: false,
            reason: `accel_violation_${accel.toFixed(0)}ms2`,
            speed
          };
        }
      }
    }

    positionHistory.push(newPos);
    trimHistory();
    return { valid: true, reason: "ok", speed };
  }

  function trimHistory() {
    if (positionHistory.length > POSITION_HISTORY_SIZE) {
      positionHistory = positionHistory.slice(-POSITION_HISTORY_SIZE);
    }
  }

  // ======================== NORTH KOREA EMBARGO ========================

  /**
   * Set the player's country from reverse geocoding.
   * Call this whenever geo.js resolves territory info.
   */
  function setPlayerCountry(country) {
    if (!country) return;
    const lower = country.toLowerCase().trim();
    isEmbargoed = EMBARGOED_COUNTRIES.some(e => lower.includes(e));
    playerCountry = country;

    if (isEmbargoed) {
      console.warn(`[AntiCheat] EMBARGO ACTIVATED — Country: ${country}`);
    }
  }

  function getEmbargoStatus() {
    return {
      isEmbargoed,
      country: playerCountry,
      displayCountry: isEmbargoed ? "Restricted Territory" : playerCountry
    };
  }

  /**
   * Check if a game action is allowed under embargo.
   * Actions: "purchase", "spin", "earn", "gift", "citadel"
   */
  function isActionAllowed(action) {
    if (!isEmbargoed) return { allowed: true };

    // Reading/looking is always allowed
    if (action === "view" || action === "chat") return { allowed: true };

    return {
      allowed: false,
      reason: `⛔ ${playerCountry || "Restricted Territory"} — gameplay actions are suspended due to international sanctions compliance.`
    };
  }

  // ======================== PURCHASE RATE LIMITING ========================

  /**
   * Check if a purchase is allowed (rate limiting + replay protection).
   * @param {string} purchaseType - "land", "spin", "calendar", "citadel", "upgrade", "gift"
   * @param {string} [purchaseId] - Unique ID for replay protection
   * @returns {{ allowed: bool, reason?: string, waitMs?: number }}
   */
  function canPurchase(purchaseType, purchaseId) {
    const now = Date.now();

    // Embargo check
    const embargo = isActionAllowed(purchaseType);
    if (!embargo.allowed) return embargo;

    // Replay protection — prevent double-spend
    if (purchaseId) {
      if (purchaseIdSet.has(purchaseId)) {
        console.warn(`[AntiCheat] REPLAY BLOCKED: ${purchaseId}`);
        return { allowed: false, reason: "Replay detected — this action was already performed." };
      }
    }

    // Cooldown between ANY purchases
    if (now - lastPurchaseTime < PURCHASE_COOLDOWN_MS) {
      const waitMs = PURCHASE_COOLDOWN_MS - (now - lastPurchaseTime);
      return {
        allowed: false,
        reason: `Too fast! Wait ${(waitMs / 1000).toFixed(1)}s.`,
        waitMs
      };
    }

    // Rolling window: max N purchases per 60 seconds
    purchaseTimestamps = purchaseTimestamps.filter(t => now - t < 60000);
    if (purchaseTimestamps.length >= MAX_PURCHASES_PER_MINUTE) {
      const oldest = purchaseTimestamps[0];
      const waitMs = 60000 - (now - oldest);
      console.warn(`[AntiCheat] RATE LIMIT: ${purchaseTimestamps.length} purchases in 60s`);
      return {
        allowed: false,
        reason: `Purchase rate limit reached. Wait ${(waitMs / 1000).toFixed(0)}s.`,
        waitMs
      };
    }

    return { allowed: true };
  }

  /**
   * Record that a purchase was made. Call this AFTER a successful purchase.
   */
  function recordPurchase(purchaseType, purchaseId) {
    const now = Date.now();
    lastPurchaseTime = now;
    purchaseTimestamps.push(now);

    if (purchaseId) {
      // Re-insert so the ID moves to the end of the insertion-ordered Set
      purchaseIdSet.delete(purchaseId);
      purchaseIdSet.add(purchaseId);
      // Evict the OLDEST tracked IDs one at a time. Wiping the whole set on
      // threshold (the previous behaviour) re-opened a replay window for every
      // ID still inside its validity period.
      while (purchaseIdSet.size > MAX_TRACKED_PURCHASE_IDS) {
        const oldest = purchaseIdSet.values().next().value;
        if (oldest === undefined) break;
        purchaseIdSet.delete(oldest);
      }
    }
  }

  // ======================== BALANCE SANITY CHECKS ========================

  /**
   * Validate that a balance is within sane limits before a transaction.
   */
  function validateBalance(eb, diamonds) {
    const issues = [];

    const ebNum = Number(eb);
    const diaNum = Number(diamonds);

    // NaN/Infinity bypass every `<` / `>` comparison, so reject them up front.
    if (!Number.isFinite(ebNum)) issues.push("EB balance is not a finite number");
    if (!Number.isFinite(diaNum)) issues.push("Diamond balance is not a finite number");
    if (Number.isFinite(ebNum) && ebNum < 0) issues.push("Negative EB balance");
    if (Number.isFinite(ebNum) && ebNum > BALANCE_MAX_EB) issues.push(`EB balance impossibly high: ${eb}`);
    if (Number.isFinite(diaNum) && diaNum < 0) issues.push("Negative diamond balance");
    if (Number.isFinite(diaNum) && diaNum > BALANCE_MAX_DIAMONDS) issues.push(`Diamond balance impossibly high: ${diamonds}`);

    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Validate a transaction won't create an impossible state.
   */
  function validateTransaction(currentEB, currentDiamonds, costEB, costDiamonds, earnEB, earnDiamonds) {
    const num = (v) => {
      const x = Number(v);
      return Number.isFinite(x) ? x : 0;
    };
    const safeCostEB = num(costEB);
    const safeCostDiamonds = num(costDiamonds);
    const safeEarnEB = num(earnEB);
    const safeEarnDiamonds = num(earnDiamonds);

    const curEB = Number(currentEB);
    const curDiamonds = Number(currentDiamonds);
    if (!Number.isFinite(curEB) || !Number.isFinite(curDiamonds)) {
      return { valid: false, reason: "Current balance is not a finite number" };
    }

    const newEB = curEB - safeCostEB + safeEarnEB;
    const newDiamonds = curDiamonds - safeCostDiamonds + safeEarnDiamonds;

    if (newEB < 0) return { valid: false, reason: `Insufficient EB: need ${costEB}, have ${currentEB}` };
    if (newDiamonds < 0) return { valid: false, reason: `Insufficient diamonds: need ${costDiamonds}, have ${currentDiamonds}` };
    if (newEB > BALANCE_MAX_EB) return { valid: false, reason: "Transaction would create impossible EB balance" };
    if (newDiamonds > BALANCE_MAX_DIAMONDS) return { valid: false, reason: "Transaction would create impossible diamond balance" };

    return { valid: true };
  }

  // ======================== PURCHASE ID GENERATOR ========================

  /**
   * Generate a unique purchase ID for replay protection.
   */
  function generatePurchaseId(type, tx, ty) {
    const ts = Date.now();
    let rand;
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      const buf = new Uint32Array(2);
      crypto.getRandomValues(buf);
      rand = buf[0].toString(36) + buf[1].toString(36);
    } else {
      rand = Math.random().toString(36).slice(2, 8);
    }
    return `${type}_${tx || 0}_${ty || 0}_${ts}_${rand}`;
  }

  // ======================== CHEAT REPORTING ========================

  /**
   * Log a cheat detection to Firestore for admin review.
   */
  function reportViolation(type, details) {
    const state = (typeof Store !== "undefined" && Store.get) ? Store.get() : null;
    const db = (typeof Store !== "undefined" && Store.getDb) ? Store.getDb() : null;
    if (!db || !state?.player?.id) return;

    db.collection("cheat_reports").add({
      playerId: state.player.id,
      playerName: state.player.name || "Unknown",
      type,
      details,
      timestamp: Date.now(),
      position: positionHistory.length > 0 ? positionHistory[positionHistory.length - 1] : null
    }).catch(e => console.warn("[AntiCheat] Report failed:", e));
  }

  // ======================== UTILITY ========================

  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function reset() {
    positionHistory = [];
    lastPurchaseTime = 0;
    purchaseTimestamps = [];
    purchaseIdSet.clear();
    spoofingWarnings = 0;
  }

  // ======================== PUBLIC API ========================
  return {
    validatePosition,
    setPlayerCountry,
    getEmbargoStatus,
    isActionAllowed,
    canPurchase,
    recordPurchase,
    validateBalance,
    validateTransaction,
    generatePurchaseId,
    reportViolation,
    reset,
    EMBARGOED_COUNTRIES,
    EMBARGOED_DISPLAY_NAMES
  };
})();
