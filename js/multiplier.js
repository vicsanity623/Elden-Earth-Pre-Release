// ============================================================
// Elden Earth — Multiplier Module
// Handles all 30X/50X boost multiplier logic and +2EB boost
// ============================================================
const Multiplier = (() => {
  const el = (id) => document.getElementById(id);
  // --- Constants ---
  const BOOST_DURATION_MS = 3600 * 1000;          // 1 Hour per activation
  const BOOST_MAX_BANK_MS = 6 * 3600 * 1000;     // Max 6 Hours banked
  const BOOST_COOLDOWN_MS = 20 * 60 * 1000;      // 20 Minutes for +2EB
  // 50X event schedule now lives in CONFIG (single source of truth, matches
  // the eventAnchor baked into functions/index.js activateBoost).

  // --- DOM Elements Cache ---
  let multBtn = null;
  let activateBoostBtn = null;
  let boostBtn = null;
  let timerBadge = null;
  let heroCard = null;
  let boostHideTimer = null;
  let boostScheduleTimer = null;

  // --- Core Functions ---

  /**
   * Check if the global 50X event is currently active
   * @returns {boolean}
   */
  function is50XActive() {
    return CONFIG.is50XActive();
  }

  /**
   * Get the boost tier factor based on number of plots owned
   * Uses CONFIG.BOOST_TIERS anti-whale curve to scale down multiplier.
   * @param {number} plotCount - Total number of plots owned
   * @returns {number} Tier factor (1.0 = full multiplier, lower = scaled down)
   */
  function getTierFactor(plotCount) {
    const tiers = CONFIG.BOOST_TIERS;
    for (let i = tiers.length - 1; i >= 0; i--) {
      if (plotCount >= tiers[i].minPlots) return tiers[i].tierFactor;
    }
    return 1.0;
  }

  /**
   * Get the currently active base multiplier value (30 or 50)
   * @returns {number}
   */
  function getActiveMultiplier() {
    return is50XActive() ? 50 : 30;
  }

  /**
   * Get the effective multiplier after applying boost tier collapse
   * @param {object} state - Game state object
   * @returns {number} Effective multiplier (base * tierFactor)
   */
  function getEffectiveMultiplier(state) {
    const base = state.boostMultiplier || getActiveMultiplier();
    const plotCount = state.plots ? Object.keys(state.plots).length : 0;
    const tierFactor = getTierFactor(plotCount);
    return Math.round(base * tierFactor);
  }

  /**
   * Apply boost multiplier to a rate if boost is active, with tier collapse
   * @param {number} rate - Base rate to multiply
   * @param {object} state - Game state object
   * @param {boolean} isOtherPlayer - If viewing another player's stats
   * @returns {number} Rate with multiplier applied if applicable
   */
  function applyMultiplier(rate, state, isOtherPlayer = false) {
    if (isOtherPlayer) return rate;
    if (state.boostExpiry && Date.now() < state.boostExpiry) {
      const base = state.boostMultiplier || 30;
      const plotCount = state.plots ? Object.keys(state.plots).length : 0;
      const tierFactor = getTierFactor(plotCount);
      return rate * base * tierFactor;
    }
    return rate;
  }

  /**
   * Activate boost for 1 hour, stacking up to 6 hours max
   * @param {object} state - Game state object
   */
  async function activateBoost(state) {
    if (typeof ServerAntiCheat === "undefined" || !ServerAntiCheat.isReady()) return null;
    const result = await ServerAntiCheat.activateBoost();
    if (!result.activated) return null;
    state.boostExpiry = result.boostExpiry;
    state.boostMultiplier = result.boostMultiplier;
    Store.save(true);
    return result.boostMultiplier;
  }

  /**
   * Schedule the +2EB boost button appearance
   */
  function scheduleBoost() {
    if (!boostBtn) return;
    clearTimeout(boostScheduleTimer);

    const state = Store.get();
    const now = Date.now();
    const lastClaim = state?.lastBoostClaim || 0;
    const elapsed = now - lastClaim;

    // Calculate remaining wait time (prevents multi-tab and refresh exploits)
    const waitTime = Math.max(0, BOOST_COOLDOWN_MS - elapsed);

    boostScheduleTimer = setTimeout(() => {
      if (!boostBtn) return;
      boostBtn.classList.remove("hidden");

      // Stays visible for 45 seconds so human players have plenty of time to tap
      boostHideTimer = setTimeout(() => {
        boostBtn.classList.add("hidden");
        scheduleBoost();
      }, 45000);
    }, waitTime);
  }

  /**
   * Handle +2EB boost claim
   * @returns {object} { success: boolean, message: string }
   */
  async function claimBoost() {
    const state = Store.get();
    const now = Date.now();
    const lastClaim = state?.lastBoostClaim || 0;

    // Session lock check
    if (typeof Store !== "undefined" && !Store.isSessionActive()) {
      return { success: false, message: "🔒 Account active on another tab. Close the other tab first." };
    }

    // Anti-cheat: Embargo check
    if (typeof AntiCheat !== "undefined") {
      const check = AntiCheat.isActionAllowed("earn");
      if (!check.allowed) {
        return { success: false, message: check.reason };
      }
    }

    clearTimeout(boostHideTimer);
    boostBtn?.classList.add("hidden");

    if (typeof ServerAntiCheat === "undefined" || !ServerAntiCheat.isReady()) {
      return { success: false, message: "⚠️ Server connection required." };
    }
    const serverResult = await ServerAntiCheat.claimBoost();
    if (!serverResult.claimed) {
      return { success: false, message: serverResult.reason === "cooldown" ? "⏳ Cooldown active — boost available every 20 minutes." : "⚠️ Boost could not be verified." };
    }
    state.lastBoostClaim = serverResult.lastBoostClaim;
    state.eb = serverResult.nextEb;
    Store.save(true);

    // Get button position for particle effect
    const rect = boostBtn?.getBoundingClientRect();
    const originX = rect ? rect.left + rect.width / 2 : 0;
    const originY = rect ? rect.top + rect.height / 2 : 0;

    // Schedule next 20-minute cycle
    scheduleBoost();

    return {
      success: true,
      message: "⚡ Claimed +2.00 EB Boost! (Next in 20m)",
      originX,
      originY
    };
  }

  // --- Screen Shake Controller ---

  /**
   * Set screen shake preference
   * @param {boolean} disabled - Disable shake effect
   */
  function setShakePreference(disabled) {
    const state = Store.get();
    state.disableShake = disabled;
    document.body.classList.toggle("no-shake", disabled);

    // Synchronize all checkboxes across all modals
    document.querySelectorAll("#toggle-shake-fx, .toggle-switch-input").forEach((box) => {
      box.checked = !disabled;
    });

    Store.save(true);
    const toastFn = window.showToast || alert;
    toastFn(disabled ? "🛡️ 50X Screen Shake disabled (Calm Mode)" : "🔥 50X Screen Shake enabled!", 2500);
  }

  /**
   * Initialize screen shake state on boot
   */
  function initShakeState() {
    const initialDisabled = Boolean(Store.get()?.disableShake);
    document.body.classList.toggle("no-shake", initialDisabled);
    document.querySelectorAll("#toggle-shake-fx, .toggle-switch-input").forEach((box) => {
      box.checked = !initialDisabled;
    });
  }

  // --- UI Update Functions ---

  /**
   * Update all multiplier-related UI elements
   * @param {object} state - Game state object
   */
  function updateUI(state) {
    const now = Date.now();
    const is50XEvent = is50XActive();
    const isBoosted = state.boostExpiry && state.boostExpiry > now;

    // Update Floating Button Tag (50X vs 30X)
    const multLabel = el("mult-label");
    if (multLabel) multLabel.textContent = is50XEvent ? "50X" : "30X";

    if (multBtn) {
      if (is50XEvent) multBtn.classList.add("event-50x");
      else multBtn.classList.remove("event-50x");

      // Only show the button once a full extra hour can be banked again (remaining < 5h),
      // otherwise it stays hidden while the boost ticks down (including while offline).
      const remainingForBtn = isBoosted ? (state.boostExpiry - now) : 0;
      const canBankMore = remainingForBtn < (BOOST_MAX_BANK_MS - BOOST_DURATION_MS);
      multBtn.classList.toggle("hidden", !canBankMore);
    }

    if (isBoosted) {
      const remainingMs = state.boostExpiry - now;
      // AUTOMATIC UPGRADE: If event is active, force active multiplier to 50X!
      const baseMult = is50XEvent ? 50 : (state.boostMultiplier || 30);
      const plotCount = state.plots ? Object.keys(state.plots).length : 0;
      const tierFactor = getTierFactor(plotCount);
      const effectiveMult = Math.round(baseMult * tierFactor);

      heroCard?.classList.add("boosted");
      timerBadge?.classList.remove("hidden");

      // Shaking & Vibrate Effect when 50X is active!
      if (baseMult === 50) {
        heroCard?.classList.add("super-50x");
        timerBadge?.classList.add("super-50x");
      } else {
        heroCard?.classList.remove("super-50x");
        timerBadge?.classList.remove("super-50x");
      }

      const hrs = Math.floor(remainingMs / 3600000);
      const mins = Math.floor((remainingMs % 3600000) / 60000);
      const secs = Math.floor((remainingMs % 60000) / 1000);
      const timerStr = `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

      if (timerBadge) {
        const icon = baseMult === 50 ? "🔥" : "⚡";
        const tierLabel = tierFactor < 1.0 ? ` (${tierFactor === 0.67 ? '20' : tierFactor === 0.5 ? '15' : tierFactor === 0.4 ? '12' : tierFactor === 0.3 ? '9' : tierFactor === 0.2 ? '6' : '2'}X)` : '';
        timerBadge.innerHTML = `${icon} ${effectiveMult}X BOOST${tierLabel} <span id="boost-countdown">${timerStr}</span>`;
      }
    } else {
      heroCard?.classList.remove("boosted", "super-50x");
      timerBadge?.classList.add("hidden");
      timerBadge?.classList.remove("super-50x");
    }
  }

  /**
   * Get 50X event countdown data for pool modal
   * @returns {object} { isLive: boolean, remSec: number, label: string }
   */
  function get50XCountdownData() {
    const now = Date.now();
    const totalCycle = CONFIG.EVENT_50X_DURATION_MS + CONFIG.EVENT_50X_COOLDOWN_MS;
    let elapsed = (now - CONFIG.EVENT_50X_ANCHOR_MS) % totalCycle;
    if (elapsed < 0) elapsed += totalCycle;

    const isLive = elapsed < CONFIG.EVENT_50X_DURATION_MS;
    const remMs = isLive ? (CONFIG.EVENT_50X_DURATION_MS - elapsed) : (totalCycle - elapsed);
    const remSec = Math.max(0, Math.floor(remMs / 1000));

    const d = Math.floor(remSec / 86400);
    const h = Math.floor((remSec % 86400) / 3600);
    const m = Math.floor((remSec % 3600) / 60);
    const s = remSec % 60;

    const timerStr = `${String(d).padStart(2, "0")}D : ${String(h).padStart(2, "0")}H : ${String(m).padStart(2, "0")}M : ${String(s).padStart(2, "0")}s`;
    const label = isLive ? "🔥 50X Event Active! Ends In:" : "🔥 Next 50X Super Boost In:";

    return { isLive, remSec, timerStr, label };
  }

  // --- Event Listeners Setup ---

  /**
   * Wire up multiplier button and activate boost button
   */
  function wireButtons() {
    multBtn = el("multiplier-btn");
    activateBoostBtn = el("activate-boost-btn");

    if (multBtn) {
      multBtn.addEventListener("click", () => {
        const is50X = is50XActive();
        const targetMult = is50X ? 50 : 30;
        el("mult-label").textContent = targetMult + "X";
        el("booster-modal-title").textContent = is50X ? "🔥 Activate 50X Super Boost" : "Activate 30X Boost";
        el("modal-mult-rate").textContent = `${targetMult}X Income`;
        document.getElementById("booster-modal")?.classList.remove("hidden");
      });
    }

    if (activateBoostBtn) {
      activateBoostBtn.addEventListener("click", () => {
        const state = Store.get();
        activateBoost(state).then((activeMult) => {
          if (!activeMult) {
            showToast("⚠️ Boost could not be verified by the server.", 3500);
            return;
          }
        document.getElementById("booster-modal")?.classList.add("hidden");
        updateTopbar();
        const icon = activeMult === 50 ? "🔥" : "⚡";
        showToast(`${icon} ${activeMult}X Multiplier Activated! (+1 Hr)`);
        });
      });
    }
  }

  /**
   * Wire up the +2EB boost button
   */
  function wireBoostButton() {
    boostBtn = el("boost-btn");

    if (boostBtn) {
      boostBtn.addEventListener("click", (e) => {
        claimBoost().then((result) => {

        if (!result.success) {
          showToast(result.message, 4000);
          return;
        }

        updateTopbar();
        showToast(result.message);

        // Launch flying EB particle sparks into the HUD!
        if (typeof launchFlyingEBStream === "function" && result.originX) {
          launchFlyingEBStream(result.originX, result.originY, 2);
        }
        });
      });

      // Start initial cooldown check
      scheduleBoost();
    }
  }

  /**
   * Wire up screen shake toggle
   */
  function wireShakeToggle() {
    // Delegated click listener (Guaranteed to catch clicks in Weekly Pool modal!)
    document.addEventListener("change", (e) => {
      if (e.target && (e.target.id === "toggle-shake-fx" || e.target.classList.contains("toggle-switch-input"))) {
        setShakePreference(!e.target.checked);
      }
    });
  }

  // --- Initialization ---

  /**
   * Initialize the Multiplier module
   */
  function init() {
    heroCard = el("hero-balance-card");
    timerBadge = el("boost-timer-badge");
    multBtn = el("multiplier-btn");

    initShakeState();
    wireButtons();
    wireBoostButton();
    wireShakeToggle();
    updateUI(Store.get());
  }

  // Public API
  return {
    init,
    is50XActive,
    getActiveMultiplier,
    getEffectiveMultiplier,
    getTierFactor,
    applyMultiplier,
    activateBoost,
    scheduleBoost,
    claimBoost,
    setShakePreference,
    updateUI,
    get50XCountdownData,
    BOOST_COOLDOWN_MS
  };
})();
