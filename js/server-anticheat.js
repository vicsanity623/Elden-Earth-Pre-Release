// ============================================================
// Elden Earth — ServerAntiCheat
// Client-side bridge to Firebase Cloud Functions for
// server-side position validation, purchase verification,
// and diamond collection integrity.
// ============================================================
const ServerAntiCheat = (() => {
  let functions = null;
  let lastServerSync = 0;
  const MIN_SYNC_INTERVAL_MS = 20000; // Don't ping server more than every 20s

  function init() {
    if (typeof firebase === "undefined" || !firebase.functions) {
      console.warn("[ServerAntiCheat] Firebase Functions SDK not loaded.");
      return;
    }
    functions = firebase.functions();

    // Connect to emulator in local dev (uncomment when testing locally)
    // functions.useEmulator("localhost", 5019);
  }

  /**
   * Send current GPS position to server for velocity validation.
   * Returns { valid, speed, reason, strikes } or null on failure.
   */
  async function sendPosition(coords, force = false) {
    if (!functions) return null;

    const now = Date.now();
    if (!force && now - lastServerSync < MIN_SYNC_INTERVAL_MS) return null;

    lastServerSync = now;

    try {
      const validatePosition = functions.httpsCallable("validatePosition");
      const result = await validatePosition({
        lat: coords.latitude,
        lon: coords.longitude,
        accuracy: coords.accuracy,
        altitude: coords.altitude,
        speed: coords.speed,
        altitudeAccuracy: coords.altitudeAccuracy,
        timestamp: coords.timestamp || now,
      });
      return result.data;
    } catch (e) {
      console.warn("[ServerAntiCheat] Position sync failed:", e.message);
      return null;
    }
  }

  /**
   * Request server validation for a land purchase.
   * Returns { allowed, reason, plotData?, tid? }
   */
  async function validatePurchase(lat, lon, tx, ty, territory) {
    if (!functions) {
      return { allowed: false, reason: "functions_not_initialized" };
    }

    try {
      const validatePurchaseFn = functions.httpsCallable("validatePurchase");
      const result = await validatePurchaseFn({ lat, lon, tx, ty, territory });
      return result.data;
    } catch (e) {
      console.warn("[ServerAntiCheat] Purchase validation failed:", e.message);
      return { allowed: false, reason: "server_error" };
    }
  }

  /**
   * Request server validation for a diamond collection.
   * Returns { allowed, reason }
   * Throws on transport/auth failures so callers can fail open using the
   * client-side proximity check instead of wrongly treating it as "too far".
   */
  async function validateCollect(lat, lon, diamondId, diamondLat, diamondLon, byPet) {
    if (!functions) {
      return { allowed: false, reason: "functions_not_initialized" };
    }

    const validateCollectFn = functions.httpsCallable("validateCollect");
    const result = await validateCollectFn({
      lat,
      lon,
      diamondId,
      diamondLat,
      diamondLon,
      byPet: Boolean(byPet),
    });
    return result.data;
  }

  async function relocatePlot(slot, tx, ty) {
    if (!functions) return { allowed: false, reason: "functions_not_initialized" };
    try {
      const relocatePlotFn = functions.httpsCallable("relocatePlot");
      const result = await relocatePlotFn({ slot, tx, ty });
      return result.data;
    } catch (e) {
      console.warn("[ServerAntiCheat] Plot relocation failed:", e.message);
      return { allowed: false, reason: "server_error" };
    }
  }

  async function pickupPlot(tid) {
    if (!functions) return { allowed: false, reason: "functions_not_initialized" };
    try {
      const fn = functions.httpsCallable("pickupPlot");
      const result = await fn({ tid });
      return result.data;
    } catch (e) {
      console.warn("[ServerAntiCheat] Plot pickup failed:", e.message);
      return { allowed: false, reason: "server_error" };
    }
  }

  async function spinWheel(multiplier = 1) {
    if (!functions) return { spun: false, reason: "functions_not_initialized" };
    try {
      const spinWheelFn = functions.httpsCallable("spinWheel");
      // Pass the multiplier (1 or 10) to the Firebase Cloud Function
      const result = await spinWheelFn({ multiplier });
      return result.data;
    } catch (e) {
      console.warn("[ServerAntiCheat] Wheel spin failed:", e.message);
      return { spun: false, reason: "server_error" };
    }
  }

  async function activateBoost() {
    if (!functions) return { activated: false, reason: "functions_not_initialized" };
    try {
      const fn = functions.httpsCallable("activateBoost");
      return (await fn()).data;
    } catch (e) {
      console.warn("[ServerAntiCheat] Boost activation failed:", e.message);
      return { activated: false, reason: "server_error" };
    }
  }

  async function claimBoost() {
    if (!functions) return { claimed: false, reason: "functions_not_initialized" };
    try {
      const fn = functions.httpsCallable("claimBoost");
      return (await fn()).data;
    } catch (e) {
      console.warn("[ServerAntiCheat] Boost claim failed:", e.message);
      return { claimed: false, reason: "server_error" };
    }
  }

  async function recallCitadel(citadelId) {
    if (!functions) return { recalled: false, reason: "functions_not_initialized" };
    try {
      const fn = functions.httpsCallable("recallCitadel");
      return (await fn({ citadelId })).data;
    } catch (e) {
      console.warn("[ServerAntiCheat] Citadel recall failed:", e.message);
      return { recalled: false, reason: "server_error" };
    }
  }

  async function conquerCitadel(citadelId, lat, lon, name, avatar) {
    if (!functions) return { conquered: false, reason: "functions_not_initialized" };
    try {
      const fn = functions.httpsCallable("conquerCitadel");
      return (await fn({ citadelId, lat, lon, name, avatar })).data;
    } catch (e) {
      console.warn("[ServerAntiCheat] Citadel conquest failed:", e.message);
      return { conquered: false, reason: "server_error" };
    }
  }

  async function spawnDiamonds(lat, lon, count) {
    if (!functions) return { spawned: false, reason: "functions_not_initialized" };
    try {
      const fn = functions.httpsCallable("spawnDiamonds");
      return (await fn({ lat, lon, count })).data;
    } catch (e) {
      console.warn("[ServerAntiCheat] Diamond spawn failed:", e.message);
      return { spawned: false, reason: "server_error" };
    }
  }

  async function citadelAction(action, payload = {}) {
    if (!functions) return { ok: false, reason: "functions_not_initialized" };
    try {
      const fn = functions.httpsCallable("citadelAction");
      return (await fn({ action, ...payload })).data;
    } catch (e) {
      console.warn("[ServerAntiCheat] Citadel action failed:", e.message);
      return { ok: false, reason: "server_error" };
    }
  }

  async function claimQuestReward(questId) {
    if (!functions) return { claimed: false, reason: "functions_not_initialized" };
    try {
      const fn = functions.httpsCallable("claimQuestReward");
      return (await fn({ questId })).data;
    } catch (e) {
      console.warn("[ServerAntiCheat] Quest claim failed:", e.message);
      return { claimed: false, reason: "server_error" };
    }
  }

  async function collectExtractor() {
    if (!functions) return { collected: false, reason: "functions_not_initialized" };
    try {
      const fn = functions.httpsCallable("collectExtractor");
      return (await fn()).data;
    } catch (e) {
      console.warn("[ServerAntiCheat] Extractor collect failed:", e.message);
      return { collected: false, reason: "server_error" };
    }
  }

  async function claimReferralBonuses() {
    if (!functions) return { claimed: false, reason: "not_ready" };
    try {
      const fn = functions.httpsCallable("claimReferralBonuses");
      return (await fn()).data;
    } catch (e) {
      console.warn("[AntiCheat] claimReferralBonuses error:", e);
      return { claimed: false, reason: e.message };
    }
  }

  async function claimReferralRoyalties() {
    if (!functions) return { totalRoyalty: 0, referralCount: 0 };
    try {
      const fn = functions.httpsCallable("claimReferralRoyalties");
      return (await fn()).data;
    } catch (e) {
      console.warn("[AntiCheat] claimReferralRoyalties error:", e);
      return { totalRoyalty: 0, referralCount: 0 };
    }
  }

  function isReady() {
    return functions !== null;
  }

  async function fixAllPlotData(targetUid) {
    if (!functions) return { fixed: 0, reason: "functions_not_initialized" };
    try {
      const fn = functions.httpsCallable("fixAllPlotData");
      return (await fn({ targetUid })).data;
    } catch (e) {
      console.warn("[ServerAntiCheat] fixAllPlotData failed:", e.message);
      return { fixed: 0, reason: e.message };
    }
  }

  async function claimMailbox() {
    if (!functions) return { claimed: 0, dividendsEb: 0, giftsEb: 0 };
    try {
      const fn = functions.httpsCallable("claimMailbox");
      return (await fn({})).data;
    } catch (e) {
      console.warn("[ServerAntiCheat] claimMailbox failed:", e.message);
      return { claimed: 0, dividendsEb: 0, giftsEb: 0 };
    }
  }

  async function plantEldenStop(tx, ty) {
    if (!functions) return { ok: false, reason: "functions_not_initialized" };
    try {
      const fn = functions.httpsCallable("plantEldenStop");
      return (await fn({ tx, ty })).data;
    } catch (e) {
      console.warn("[ServerAntiCheat] plantEldenStop failed:", e.message);
      return { ok: false, reason: "server_error" };
    }
  }

  async function spinEldenStop(stopId, lat, lon) {
    if (!functions) return { ok: false, reason: "functions_not_initialized" };
    try {
      const fn = functions.httpsCallable("spinEldenStop");
      return (await fn({ stopId, lat, lon })).data;
    } catch (e) {
      console.warn("[ServerAntiCheat] spinEldenStop failed:", e.message);
      return { ok: false, reason: "server_error" };
    }
  }

  async function checkChatEligibility() {
    if (!functions) return { chatUnlocked: false, plotCount: 0 };
    try {
      const fn = functions.httpsCallable("checkChatEligibility");
      return (await fn()).data;
    } catch (e) {
      console.warn("[ServerAntiCheat] checkChatEligibility failed:", e.message);
      return { chatUnlocked: false, plotCount: 0 };
    }
  }

  async function validateUsername(name) {
    if (!functions) return { valid: false, reason: "functions_not_initialized" };
    try {
      const fn = functions.httpsCallable("validateUsername");
      return (await fn({ name })).data;
    } catch (e) {
      console.warn("[ServerAntiCheat] validateUsername failed:", e.message);
      return { valid: false, reason: "server_error" };
    }
  }

  async function filterChatMessage(text, senderName) {
    if (!functions) return { allowed: false, reason: "functions_not_initialized" };
    try {
      const fn = functions.httpsCallable("filterChatMessage");
      return (await fn({ text, senderName })).data;
    } catch (e) {
      console.warn("[ServerAntiCheat] filterChatMessage failed:", e.message);
      return { allowed: false, reason: "server_error" };
    }
  }

  return { init, sendPosition, validatePurchase, validateCollect, relocatePlot, pickupPlot, spinWheel, activateBoost, claimBoost, recallCitadel, conquerCitadel, spawnDiamonds, citadelAction, claimQuestReward, collectExtractor, claimReferralBonuses, claimReferralRoyalties, isReady, fixAllPlotData, claimMailbox, plantEldenStop, spinEldenStop, checkChatEligibility, validateUsername, filterChatMessage };
})();
