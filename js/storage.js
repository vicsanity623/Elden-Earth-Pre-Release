// ============================================================
// Elden Earth — save data (Local + Firebase Cloud Sync)
// ============================================================
const Store = (() => {
  const KEY = "eldenEarth.save.v1";
  let db = null;

  let isSessionPaused = false;
  let cloudSyncComplete = false;

  // ===== SESSION LOCK: ONE session at a time, enforced via Firestore =====
  // sessionStorage survives refreshes in the same browser tab/window but is
  // isolated from other tabs/windows, which preserves single-session locking.
  const SESSION_ID_KEY = "eldenEarth.sessionId";
  let localSessionId = null;
  try { localSessionId = sessionStorage.getItem(SESSION_ID_KEY); } catch (e) {}
  if (!localSessionId) {
    localSessionId = "sess_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    try { sessionStorage.setItem(SESSION_ID_KEY, localSessionId); } catch (e) {}
  }
  let _sessionActive = false;

  function getDb() {
    if (db) return db;
    try {
      if (typeof firebase !== "undefined" && CONFIG.FIREBASE_CONFIG && CONFIG.FIREBASE_CONFIG.apiKey) {
        if (!firebase.apps.length) {
          firebase.initializeApp(CONFIG.FIREBASE_CONFIG);
        }
        db = firebase.firestore();

        // 🚀 ZERO-READ CACHE: Stores plots & saves in IndexedDB (Slashes 70% of cloud reads!)
        db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
          if (err.code === "failed-precondition") {
            console.warn("[Firestore] Multi-tab persistence active in another tab.");
          } else if (err.code === "unimplemented") {
            console.warn("[Firestore] Browser does not support IndexedDB persistence.");
          }
        });
      }
    } catch (e) {
      console.warn("[Firebase] Init error:", e);
    }
    return db;
  }

  function defaultState() {
    return {
      player: { name: "Traveler", id: null, avatar: "🙂", model3d: "robot", freeSpins: 0, freeSpinsNoDiamondCost: false },
      cash: 0,
      lifetimeRent: 0,
      eb: 0,
      diamonds: 0,
      initialEBClaimed: false,
      totalDividends: 0,
      plots: {},
      plotBag: {},
      calendar: { claimedDays: 0, lastClaimTime: 0, lastClaimDate: null },
      liveDiamonds: {},
      collectedDiamondIds: [],
      lastDiamondSpawn: 0,
      lastDiamondMovementAt: 0,
      lastDiamondPlayerPosition: null,
      lastTerritoryCheck: null,
      boostExpiry: 0,
      boostMultiplier: 30,
      extractor: { built: false, level: 1, lastHarvest: Date.now(), stored: 0 },
      lastTick: Date.now(),
      createdAt: Date.now(),
      antiCheatStrikes: 0,
    };
  }

  let state = null;

  // --- REALM SERVER EPOCH GATE ---
  // Detects local saves that predate an intentional Firestore wipe (CONFIG.REALM_SERVER_EPOCH)
  // so a stale 24/7-open tab can never resurrect pre-wipe data into the clean database.
  // Epoch of 0 means the gate is disabled and nothing is ever purged by it.
  function isPreEpochSave(savedState) {
    if (!savedState) return false;
    const epoch = (typeof CONFIG !== "undefined" && CONFIG.REALM_SERVER_EPOCH) || 0;
    if (!epoch) return false;
    const saveBirth = Number(savedState.createdAt || 0);
    // Missing or seconds-unit createdAt is NOT pre-epoch — the server
    // normalizes those saves instead of resetting them.
    if (!saveBirth || saveBirth < 1e11) return false;
    return saveBirth < epoch;
  }

  // --- CONSOLE TAMPER TRAPS ---
  // Maximum sane values for economy fields. Anything above triggers a tamper strike.
  const TAMPER_LIMITS = {
    eb: 1000000,         // 1M EB max
    cash: 10000,         // $10,000 max
    diamonds: 50000,     // 50K diamonds max
    totalDividends: 100000,
  };
  let _tamperStrikeCount = 0;

  function applyTamperTraps(obj) {
    if (typeof window === "undefined" || !obj) return;

    const fields = ["eb", "cash", "diamonds", "totalDividends"];
    const originalValues = {};

    fields.forEach(field => {
      originalValues[field] = obj[field] || 0;
      let internalValue = obj[field] || 0;

      Object.defineProperty(obj, field, {
        get() { return internalValue; },
        set(newValue) {
          const oldValue = internalValue;
          internalValue = newValue;

          // Only flag suspicious direct assignments (not incremental game logic)
          const jump = Math.abs(newValue - oldValue);
          const limit = TAMPER_LIMITS[field] || 999999;

          // A jump of more than 50% of the limit OR absolute value exceeding limit
          if (newValue > limit || (oldValue > 0 && jump > limit * 0.5 && newValue > oldValue)) {
            _tamperStrikeCount++;
            console.error(
              `[Store] TAMPER DETECTED: state.${field} changed from ${oldValue} to ${newValue} (jump=${jump}). ` +
              `Strike ${_tamperStrikeCount}/3.`
            );
            if (typeof AntiCheat !== "undefined" && typeof AntiCheat.reportViolation === "function") {
              AntiCheat.reportViolation("console_tamper", `${field}: ${oldValue} -> ${newValue}`);
            }
            // NOTE: previously wiped localStorage + signed the player out after 3 strikes.
            // Legitimate large swings (offline income catch-up, dividends, jackpots) could
            // trip this and permanently destroy real progress, so we only ever block the
            // suspicious assignment below and report it for manual review — never delete data.
            return; // Block the assignment
          }
        },
        configurable: true,
        enumerable: true,
      });
    });
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);

        // --- VERSION TAG: track the patch that produced this save, but never wipe
        // player progress over it — a version bump used to nuke localStorage here,
        // which then made the freshly-defaulted state look "newer" than the real
        // cloud save below and overwrote it with defaults. Just carry data forward.
        const currentVersion = (typeof CONFIG !== "undefined" && CONFIG.GAME_VERSION) || "0.0.0";

        state = Object.assign(defaultState(), parsed);
        state._gameVersion = currentVersion;
        if (parsed.player) {
          state.player = Object.assign(defaultState().player, parsed.player);
        }
        if (parsed.extractor) {
          state.extractor = Object.assign(defaultState().extractor, parsed.extractor);
        }
      } else {
        state = defaultState();
      }
    } catch (e) {
      console.warn("Save data unreadable, starting fresh.", e);
      state = defaultState();
    }

    // --- REALM SERVER EPOCH GATE: purge saves older than the last intentional wipe ---
    if (isPreEpochSave(state)) {
      console.warn("[Store] Local save predates the current Realm Epoch — purging stale save.");
      try { localStorage.removeItem(KEY); } catch (e) {}
      state = defaultState();
      state.createdAt = Date.now();
      state._epochWiped = true; // consumed by main.js to show a one-time toast
    }

    // --- CONSOLE TAMPER TRAPS: Protect economy fields from DevTools manipulation ---
    applyTamperTraps(state);

    // --- AUTO-RECOVER NAME & AVATAR FROM OWNED PLOTS ---
    if (state && state.player && (!state.player.name || state.player.name === "Traveler")) {
      for (const id in (state.plots || {})) {
        const p = state.plots[id];
        if (p.ownerName && p.ownerName !== "Traveler") {
          state.player.name = p.ownerName;
          if (p.avatar && p.avatar !== "🙂") state.player.avatar = p.avatar;
          break;
        }
      }
    }

    // --- PLAYER CONFLICT AUDIT: Detect and resolve UID/IP conflicts on load ---
    if (state && state.player && state.player.id) {
      const conflictCheck = ConflictResolver.checkConflict(state.player.id);
      if (conflictCheck && conflictCheck.hasConflict) {
        console.log(`[Conflict] Detected conflict for ${state.player.id}: ${conflictCheck.reason}`);
        // Trigger resolution after a brief delay to let UI show advisory
        setTimeout(() => {
          ConflictResolver.resolveConflict({
            playerId: state.player.id,
            onResolved: (result) => {
              if (result.success) {
                console.log(`[Conflict] Resolved: kept ${result.plotsKept} plots, EB=${result.eb}`);
                // Refresh the save data after resolution
                load();
              } else {
                console.warn("[Conflict] Resolution failed:", result.reason);
              }
            }
          });
        }, 500);
      }
    }

    // --- SELF-SEALING LIFETIME RENT & CASH AUDIT RESTORATION: DISABLED ---
    // This section previously modified player cash/rent
    // which caused data loss for real players. Disabled to prevent further corruption.
    // if (state && state.player && !state.cashAuditV1Done) {
    //   state.cashAuditV1Done = true;
    //
    //   const pName = (state.player.name || "").toLowerCase();
    //   if ((pName.includes("vic") || (state.plots && Object.keys(state.plots).length >= 20))) {
    //     if ((Number(state.lifetimeRent) || 0) < 1.01) {
    //       state.lifetimeRent = 1.017436000000000;
    //     }
    //     if ((Number(state.cash) || 0) > 0.30 && state.extractor && state.extractor.level >= 2) {
    //       state.cash = 0.087474587225872;
    //     }
    //   }
    //
    //   try {
    //     localStorage.setItem(KEY, JSON.stringify(state));
    //     setTimeout(() => syncToCloud(), 500);
    //   } catch (e) {}
    // }
    // ============================================================

    updateBaseRateCache();
    return state;
  }

  // Default to false for routine background tasks to protect Firebase quota
  function save(immediateCloud = false) {
    // A superseded/stale session (lock stolen by another tab) must never clobber
    // the shared localStorage with its own outdated in-memory state.
    if (isSessionPaused) return;
    try {
      state._gameVersion = (typeof CONFIG !== "undefined" && CONFIG.GAME_VERSION) || "0.0.0";
      state.lastSavedAt = Date.now(); // Timestamp for conflict resolution
      localStorage.setItem(KEY, JSON.stringify(state));
      syncToCloudDebounced(immediateCloud);
    } catch (e) {
      console.warn("Could not save game.", e);
    }
  }

  let localDiskTimeout = null;
  function flushToDisk() {
    if (!state || isSessionPaused) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {}
  }

  // Flush immediately on phone lock, tab switch, or app close
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", () => {
      flushToDisk();
      syncToCloud();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        flushToDisk();
        syncToCloud();
      }
    });
  }

  // Cloud Save to Firestore (Guaranteed Sync)
  // BLOCKED for guest accounts - prevents cross-device conflicts
  function syncSafeStateToCloud() {
    if (typeof firebase === "undefined" || !firebase.functions || !state?.player?.id) {
      return Promise.resolve(false);
    }

    const syncSafeState = firebase.functions().httpsCallable("syncSafeState");
    return syncSafeState({ state })
      .then((result) => {
        if (result.data?.reset) {
          state = Object.assign(defaultState(), result.data.state || {});
          if (result.data.state?.player) {
            state.player = Object.assign(defaultState().player, result.data.state.player);
          }
          state._epochWiped = true;
          localStorage.setItem(KEY, JSON.stringify(state));
        }
        return true;
      })
      .catch((err) => {
        console.warn("[Cloud] Safe state sync failed:", err);
        return false;
      });
  }

  function syncToCloud() {
    if (isSessionPaused) return;
    if (!cloudSyncComplete) return; // Block until syncFromCloud completes
    // Block guest saves from syncing to cloud - guest data stays local only
    if (state && state.player && (!state.player.id || state.player.id.startsWith("guest-"))) {
      return;
    }
    // Belt-and-suspenders: never push a pre-epoch save to Firestore, even if it
    // somehow slipped past the load()-time purge (e.g. mid-session state mutation).
    if (isPreEpochSave(state)) {
      console.warn("[Store] Blocked cloud sync of pre-epoch save.");
      return;
    }

    // Only the Admin SDK callable may persist save state. It ignores economy,
    // ownership, reward, and progression fields supplied by the browser.
    if (typeof firebase !== "undefined" && firebase.functions) {
      syncSafeStateToCloud();
      return;
    }

    return;
  }

  // Smart 30-Second Cloud Save Throttle (Cuts Firestore writes by ~90%!)
  let cloudSyncTimeout = null;
  let lastCloudSyncTime = 0;
  const CLOUD_SYNC_THROTTLE_MS = 20000; // 20-second window

  function syncToCloudDebounced(immediateCloud = false) {
    const now = Date.now();

    // Critical actions (buying land, wheel jackpot, citadel) sync IMMEDIATELY
    if (immediateCloud) {
      clearTimeout(cloudSyncTimeout);
      cloudSyncTimeout = null;
      lastCloudSyncTime = now;
      syncToCloud();
      return;
    }

    // If 30 seconds have passed, write to cloud now
    if (now - lastCloudSyncTime >= CLOUD_SYNC_THROTTLE_MS) {
      clearTimeout(cloudSyncTimeout);
      cloudSyncTimeout = null;
      lastCloudSyncTime = now;
      syncToCloud();
      return;
    }

    // Otherwise, buffer the write to fire when the 30-second window finishes
    if (!cloudSyncTimeout) {
      cloudSyncTimeout = setTimeout(() => {
        cloudSyncTimeout = null;
        lastCloudSyncTime = Date.now();
        syncToCloud();
      }, CLOUD_SYNC_THROTTLE_MS - (now - lastCloudSyncTime));
    }
  }

  // Load from Cloud with Full Cloud Authority
  async function syncFromCloud(playerId) {
    const firestore = getDb();
    if (!firestore || !playerId) { cloudSyncComplete = true; return null; }

    // Canonical identity guard: a Google UID must always map to the same account.
    if (state && state.player && state.player.id && state.player.id !== playerId) {
      console.warn(`[Store] Local save UID mismatch: ${state.player.id} -> ${playerId}. Resetting to canonical player record.`);
      state = Object.assign(defaultState(), state);
      state.player.id = playerId;
      state.player.name = state.player.name || "Traveler";
      state.player.avatar = state.player.avatar || "🙂";
      localStorage.setItem(KEY, JSON.stringify(state));
    }

    // SESSION LOCK: Check if another session is actively running
    try {
      const saveDoc = await firestore.collection("saves").doc(playerId).get();
      if (saveDoc.exists) {
        const saveData = saveDoc.data();
        const existingLock = saveData.sessionLock;
        const lockAge = existingLock ? (Date.now() - Number(existingLock.lockedAt || 0)) : Infinity;
        const LOCK_STALE_MS = 30000; // Lock considered stale after 30s without heartbeat

        if (existingLock && existingLock.sessionId !== localSessionId && lockAge < LOCK_STALE_MS) {
          // Another session is active and its lock is fresh — BLOCK this session
          console.warn(`[Session] BLOCKED — account already active in another window/tab (lock age: ${Math.round(lockAge / 1000)}s)`);
          isSessionPaused = true;
          cloudSyncComplete = true;

          // Show the session conflict modal
          const conflictModal = document.getElementById("session-conflict-modal");
          if (conflictModal) conflictModal.classList.remove("hidden");

          // Wire up the Take Over button
          const takeOverBtn = document.getElementById("resume-session-btn");
          if (takeOverBtn && !takeOverBtn._wired) {
            takeOverBtn._wired = true;
            takeOverBtn.addEventListener("click", () => {
              // Force-takeover: claim the lock and reload
              state.sessionLock = { sessionId: localSessionId, lockedAt: Date.now() };
              localStorage.setItem(KEY, JSON.stringify(state));
              syncSafeStateToCloud().finally(() => window.location.reload());
            });
          }
          return null;
        }
      }

      // No active lock or lock is stale — claim it
      state.sessionLock = { sessionId: localSessionId, lockedAt: Date.now() };
      isSessionPaused = false;
    } catch (lockErr) {
      console.warn("[Session] Lock claim error (proceeding anyway):", lockErr);
    }

    try {
      const doc = await firestore.collection("saves").doc(playerId).get();
      if (doc.exists) {
        const cloudData = doc.data();
        const localPlayer = Object.assign({}, defaultState().player, state?.player || {});
        const currentName = localPlayer.name;
        const currentAvatar = localPlayer.avatar;

        // A stale cloud save is just as dangerous as a stale local save. Replace
        // it with a fresh account state before any merge can resurrect old data.
        if (isPreEpochSave(cloudData)) {
          console.warn("[Cloud] Cloud save predates the current Realm Epoch — replacing it with a fresh state.");
          state = defaultState();
          state.createdAt = Date.now();
          state.player.id = playerId;
          state.player.name = currentName || "Traveler";
          state.player.avatar = currentAvatar || "🙂";
          state.lastSavedAt = Date.now();
          state._epochWiped = true;
          state.sessionLock = {
            sessionId: localSessionId,
            lockedAt: Date.now()
          };
          await syncSafeStateToCloud();
          localStorage.setItem(KEY, JSON.stringify(state));
          if (typeof showToast === "function") {
            showToast("✨ A new Realm Era has begun! Your account has been reset for the new season.", 6000);
          }
        } else {
        const localCalendar = state?.calendar || {};
        const cloudCalendar = cloudData.calendar || {};
        const mergedCalendar = {
          claimedDays: Math.max(Number(localCalendar.claimedDays) || 0, Number(cloudCalendar.claimedDays) || 0),
          lastClaimTime: Math.max(Number(localCalendar.lastClaimTime) || 0, Number(cloudCalendar.lastClaimTime) || 0),
          lastClaimDate: localCalendar.lastClaimDate || cloudCalendar.lastClaimDate || null,
        };

        // Merge daily quest claims the same way as the calendar above — otherwise
        // whichever side (local vs cloud) wins the timestamp race silently drops
        // "claimed" flags, letting a refresh re-open an already-claimed quest.
        const localQuests = state?.dailyQuests || null;
        const cloudQuests = cloudData.dailyQuests || null;
        let mergedQuests = cloudQuests || localQuests || null;
        if (localQuests && cloudQuests && localQuests.date === cloudQuests.date) {
          const questIds = new Set([
            ...Object.keys(localQuests.quests || {}),
            ...Object.keys(cloudQuests.quests || {}),
          ]);
          const mergedQuestMap = {};
          questIds.forEach((id) => {
            const l = (localQuests.quests || {})[id] || {};
            const c = (cloudQuests.quests || {})[id] || {};
            // Once claimed/completed on either side, it stays claimed/completed.
            mergedQuestMap[id] = {
              completed: Boolean(l.completed) || Boolean(c.completed),
              claimed: Boolean(l.claimed) || Boolean(c.claimed),
            };
          });
          mergedQuests = { date: localQuests.date, quests: mergedQuestMap };
        } else if (localQuests && cloudQuests) {
          // Different days recorded — keep whichever actually matches today.
          const today = new Date().toISOString().slice(0, 10);
          mergedQuests = localQuests.date === today ? localQuests : cloudQuests;
        }

        // --- TIMESTAMP-AWARE CONFLICT RESOLUTION ---
        // Uses lastSavedAt (set on every Store.save) to prevent income loop's
        // lastTick updates from making local state appear newer than cloud.
        // Deliberately does NOT fall back to createdAt: a freshly-initialized or
        // reset local state has no real lastSavedAt and must never be able to
        // masquerade as "newer" than an existing cloud save and overwrite it.
        const localTimestamp = Number(state?.lastSavedAt) || 0;
        const cloudTimestamp = Number(cloudData.lastSavedAt) || 0;

        if (localTimestamp > cloudTimestamp && state?.player?.id === playerId) {
          // LOCAL IS NEWER: Device has uncommitted actions (boost, wheel, etc.)
          // Keep local state, but merge in any cloud-only plots
          console.log(`[Cloud] Local state is newer (${localTimestamp} > ${cloudTimestamp}). Preserving local progress.`);
          // Preserve ephemeral local-only state across sync
          const prevLiveDiamonds = state.liveDiamonds || {};
          const prevCollected = state.collectedDiamondIds || [];
          const prevLastDiamondSpawn = state.lastDiamondSpawn || 0;
          const prevLastDiamondMovementAt = state.lastDiamondMovementAt || 0;
          const prevLastDiamondPlayerPosition = state.lastDiamondPlayerPosition || null;
          if (cloudData.plots) {
            if (!state.plots) state.plots = {};
            for (const plotId in cloudData.plots) {
              if (!state.plots[plotId]) {
                state.plots[plotId] = cloudData.plots[plotId];
                console.log(`[Cloud] Merged cloud-only plot: ${plotId}`);
              }
            }
          }
          // Merge calendar (take most recent values)
          state.calendar = mergedCalendar;
          state.dailyQuests = mergedQuests;
          // Merge ephemeral state — diamonds are now cloud-synced
          state.liveDiamonds = Object.assign(state.liveDiamonds || {}, prevLiveDiamonds);
          const mergedCollected2 = new Set([...(state.collectedDiamondIds || []), ...prevCollected]);
          state.collectedDiamondIds = [...mergedCollected2].slice(-200);
          state.lastDiamondSpawn = Math.max(state.lastDiamondSpawn || 0, prevLastDiamondSpawn);
          state.lastDiamondMovementAt = Math.max(state.lastDiamondMovementAt || 0, prevLastDiamondMovementAt);
          state.lastDiamondPlayerPosition = prevLastDiamondPlayerPosition || state.lastDiamondPlayerPosition;
          // Upload merged state to cloud immediately
          state.lastSavedAt = Date.now();
          localStorage.setItem(KEY, JSON.stringify(state));
          // Fire-and-forget cloud upload
          syncSafeStateToCloud();
        } else {
          // CLOUD IS NEWER OR EQUAL: Safely adopt cloud data
          console.log(`[Cloud] Cloud state is newer or equal (${cloudTimestamp} >= ${localTimestamp}). Adopting cloud data.`);
          // Preserve ephemeral local-only state before cloud overwrite
          const prevLiveDiamonds = state.liveDiamonds || {};
          const prevCollected = state.collectedDiamondIds || [];
          const prevLastDiamondSpawn = state.lastDiamondSpawn || 0;
          const prevLastDiamondMovementAt = state.lastDiamondMovementAt || 0;
          const prevLastDiamondPlayerPosition = state.lastDiamondPlayerPosition || null;
          state = Object.assign(defaultState(), cloudData);
          state._gameVersion = (typeof CONFIG !== "undefined" && CONFIG.GAME_VERSION) || "0.0.0";
          state.calendar = mergedCalendar;
          state.dailyQuests = mergedQuests;
          if (cloudData.player) {
            // Cloud is authoritative, but preserve custom local fields when an
            // older cloud save does not contain them yet.
            state.player = Object.assign({}, defaultState().player, localPlayer, cloudData.player);
            if ((!cloudData.player.name || cloudData.player.name === "Traveler") && localPlayer.name && localPlayer.name !== "Traveler") {
              state.player.name = localPlayer.name;
            }
            if ((!cloudData.player.avatar || cloudData.player.avatar === "🙂") && localPlayer.avatar && localPlayer.avatar !== "🙂") {
              state.player.avatar = localPlayer.avatar;
            }
            if ((!cloudData.player.model3d || cloudData.player.model3d === "robot") && localPlayer.model3d && localPlayer.model3d !== "robot") {
              state.player.model3d = localPlayer.model3d;
            }
          } else {
            state.player = localPlayer;
          }

          if (currentName && currentName !== "Traveler" && (!state.player.name || state.player.name === "Traveler")) {
            state.player.name = currentName;
          }
          if (currentAvatar && currentAvatar !== "🙂" && (!state.player.avatar || state.player.avatar === "🙂")) {
            state.player.avatar = currentAvatar;
          }

          // Merge ephemeral local-only state with cloud state
          // Diamonds are now synced to cloud — merge instead of overwrite
          state.liveDiamonds = Object.assign(state.liveDiamonds || {}, prevLiveDiamonds);
          const mergedCollected = new Set([...(state.collectedDiamondIds || []), ...prevCollected]);
          state.collectedDiamondIds = [...mergedCollected].slice(-200);
          state.lastDiamondSpawn = Math.max(state.lastDiamondSpawn || 0, prevLastDiamondSpawn);
          state.lastDiamondMovementAt = Math.max(state.lastDiamondMovementAt || 0, prevLastDiamondMovementAt);
          state.lastDiamondPlayerPosition = prevLastDiamondPlayerPosition || state.lastDiamondPlayerPosition;

          localStorage.setItem(KEY, JSON.stringify(state));
        }
        }
      }

      // 2. Query and restore all plots officially owned by this player from world map
      const plotSnap = await firestore.collection("plots").where("ownerId", "==", playerId).get();
      
      if (!state.plots) state.plots = {};
      const officialPlotIds = new Set();

      if (!plotSnap.empty) {
        plotSnap.forEach((pDoc) => {
          state.plots[pDoc.id] = pDoc.data();
          officialPlotIds.add(pDoc.id);
        });
      }

      // 3. TRUE-OWNERSHIP AUDITOR: DISABLED
      // This was deleting plots from player saves when the plots collection
      // didn't have a matching ownerId entry. This caused massive plot loss.
      // Disabled permanently to prevent further data corruption.
      // Players' plots are now preserved as-is from the plots collection query above.

      localStorage.setItem(KEY, JSON.stringify(state));

      // Essential data loaded — unblock the game immediately
      cloudSyncComplete = true;

      // Non-critical: session listener removed — cloud sync handles data safely
      try {
        state.activeSessionId = localSessionId;
        isSessionPaused = false;
      } catch (sessionErr) {
        console.warn("[Cloud] Session claim non-critical error:", sessionErr);
      }

      console.log(`[Cloud] Restored account for ${playerId} with ${Object.keys(state.plots || {}).length} plots.`);
      return state;
    } catch (err) {
      console.warn("[Cloud] Load error:", err);
      cloudSyncComplete = true; // Unblock game even if cloud read fails
    }
    return null;
  }

  function get() { return state; }

  function reset() {
    localStorage.removeItem(KEY);
    state = defaultState();
    save();
    return state;
  }

  // ============================================================
// PLAYER CONFLICT DETECTION & RESOLUTION
// Tracks UID and IP conflicts across saves, resolves by keeping
// the account with largest progress (max 10 plots / 1000EB).
// Respects Firebase limits: one read per conflict check, batch writes.
// ============================================================
let playerConflictCheckCache = {};
const CONFLICT_THROTTLE_MS = 60000; // 1-minute throttle between conflict checks

const CONFLICT_RULES = {
  maxPlots: 10,
  maxPlotWorthEB: 1000,
  extraEBForBackpay: 500,
};

// Track last conflict check time per player
let lastConflictCheck = {};
// ============================================================

// Fast Rarity Rate Lookup Table (Zero array find overhead)
  let cachedBaseRate = 0;
  let lastPlotsCount = -1;

  function updateBaseRateCache() {
    if (!state || !state.plots) {
      cachedBaseRate = 0;
      return;
    }
    const currentCount = Object.keys(state.plots).length;
    if (currentCount === lastPlotsCount) return;

    lastPlotsCount = currentCount;
    let sum = 0;
    for (const id in state.plots) {
      const p = state.plots[id];
      const rKey = p.rarity?.key || p.rarity || "common";
      const rarity = CONFIG.PLOT_RARITIES.find(r => r.key === rKey);
      sum += (rarity ? rarity.rate : (p.rate || CONFIG.PLOT_RARITIES[0].rate));
    }
    cachedBaseRate = sum;
  }

  // ============================================================
  // PLAYER CONFLICT DETECTION & RESOLUTION
  // Tracks UID and IP conflicts across saves, resolves by keeping
  // the account with largest progress (max 10 plots / 1000EB).
  // Respects Firebase limits: one read per conflict check, batch writes.
  // ============================================================
  const ConflictResolver = (() => {
    let initialized = false;

    function init() {
      if (initialized) return;
      initialized = true;
    }

    // Get player state from local save
    function getLocalState(uid) {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          return parsed.player?.id === uid ? parsed : null;
        }
      } catch (e) {}
      return null;
    }

    // Check if player has conflicting UID or IP in Firestore
    async function checkConflict(playerId) {
      init();
      const now = Date.now();
      const playerKey = `conflict_${playerId}`;

      // Throttle: avoid excessive Firestore reads
      if (lastConflictCheck[playerKey] && now - lastConflictCheck[playerKey] < CONFLICT_THROTTLE_MS) {
        return playerConflictCheckCache[playerKey] || { hasConflict: false };
      }

      const firestore = getDb();
      if (!firestore) return { hasConflict: false, reason: "no_firestore" };

      hasConflict = false;
      conflictReason = null;
      bestAccount = null;
      otherAccounts = [];

      try {
        // 1. Check saves collection for this playerId - if multiple documents exist, conflict
        const savesSnap = await firestore.collection("saves").where("playerId", "==", playerId).limit(2).get();
        const saveCount = savesSnap.size;

        if (saveCount > 1) {
          // Multiple save files for same playerId - conflict!
          hasConflict = true;
          conflictReason = "multiple_save_files";

          // Find the best account (most plots/EB) and others
          let bestScore = -1;
          savesSnap.forEach(doc => {
            const data = doc.data();
            const plotsCount = Object.keys(data.plots || {}).length;
            const eb = Number(data.eb) || 0;
            const worth = plotsCount * 100 + eb; // simple scoring
            if (worth > bestScore) {
              bestScore = worth;
              bestAccount = doc.id;
            } else {
              otherAccounts.push(doc.id);
            }
          });

          // Store result in cache
          playerConflictCheckCache[playerKey] = { hasConflict: true, reason: "multiple_save_files", bestAccount, otherAccounts };
          lastConflictCheck[playerKey] = now;
          return playerConflictCheckCache[playerKey];
        }

        // 2. Check plots collection for ownership conflicts
        // If this playerId owns plots but there are other players with same plot IDs, conflict
        const plotSnap = await firestore.collection("plots").where("ownerId", "==", playerId).get();
        const ownedPlotCount = plotSnap.size;

        if (ownedPlotCount > 0) {
          // Check if any of these plots also owned by other players
          // (This would indicate shared/IP-conflicted accounts)
          // Sample a few plots to check for shared ownership
          const plotDocs = [];
          plotSnap.forEach(doc => plotDocs.push(doc.id));

          if (plotDocs.length > 0) {
            // Check first few plots for shared ownership
            const checkCount = Math.min(plotDocs.length, 5);
            let sharedFound = false;

            for (let i = 0; i < checkCount; i++) {
              const plotDoc = plotDocs[i];
              const plotSnap2 = await firestore.collection("plots").doc(plotDoc).get();
              const plotData = plotSnap2.data();
              if (plotData && plotData.ownerId && plotData.ownerId !== playerId) {
                sharedFound = true;
                hasConflict = true;
                conflictReason = "shared_plot_ownership";
                break;
              }
            }

            if (sharedFound) {
              playerConflictCheckCache[playerKey] = { hasConflict: true, reason: "shared_plot_ownership" };
              lastConflictCheck[playerKey] = now;
              return playerConflictCheckCache[playerKey];
            }
          }
        }

        playerConflictCheckCache[playerKey] = { hasConflict: false };
        lastConflictCheck[playerKey] = now;
        return playerConflictCheckCache[playerKey];

      } catch (err) {
        console.warn("[Conflict] Check error:", err);
        playerConflictCheckCache[playerKey] = { hasConflict: false, error: err.message };
        lastConflictCheck[playerKey] = now;
        return playerConflictCheckCache[playerKey];
      }
    }

    // Resolve conflict: keep best account, delta/rest other accounts
    async function resolveConflict(options) {
      init();
      const { playerId, onResolved } = options;
      const firestore = getDb();
      if (!firestore) {
        if (onResolved) onResolved({ success: false, reason: "no_firestore" });
        return;
      }

      const check = await checkConflict(playerId);
      if (!check.hasConflict) {
        if (onResolved) onResolved({ success: false, reason: "no_conflict" });
        return;
      }

      const bestAccount = check.bestAccount;
      const otherAccounts = check.otherAccounts || [];

      if (!bestAccount) {
        if (onResolved) onResolved({ success: false, reason: "no_best_account" });
        return;
      }

      // Load the best account from cloud
      const bestState = await syncFromCloud(bestAccount);
      if (!bestState) {
        if (onResolved) onResolved({ success: false, reason: "cloud_load_failed" });
        return;
      }

      // Apply best state as the base, then delta other accounts INTO it
      // but LIMIT: max 10 plots worth 1000EB total
      let totalPlotWorth = 0;
      let plotsToKeep = {};
      let plotsRemoved = [];

      // First, take plots from best account (already loaded)
      for (const tid in bestState.plots) {
        const p = bestState.plots[tid];
        const rarityRate = (p.rarity && CONFIG.PLOT_RARITIES.find(r => r.key === p.rarity.key))
          ? CONFIG.PLOT_RARITIES.find(r => r.key === p.rarity.key).rate
          : (p.rate || CONFIG.PLOT_RARITIES[0].rate);
        totalPlotWorth += rarityRate;
        if (totalPlotWorth <= CONFLICT_RULES.maxPlotWorthEB && Object.keys(plotsToKeep).length < CONFLICT_RULES.maxPlots) {
          plotsToKeep[tid] = p;
        } else {
          plotsRemoved.push(tid);
        }
      }

      // Now delta each other account's plots, but respect the limits
      for (const otherUid of otherAccounts) {
        if (otherUid === bestAccount) continue;
        const otherState = await syncFromCloud(otherUid);
        if (!otherState) continue;

        for (const tid in otherState.plots) {
          // Only add if we haven't reached the limit
          if (Object.keys(plotsToKeep).length >= CONFLICT_RULES.maxPlots) break;

          if (!plotsToKeep[tid]) {
            const p = otherState.plots[tid];
            const rarityRate = (p.rarity && CONFIG.PLOT_RARITIES.find(r => r.key === p.rarity.key))
              ? CONFIG.PLOT_RARITIES.find(r => r.key === p.rarity.key).rate
              : (p.rate || CONFIG.PLOT_RARITIES[0].rate);

            // Check if adding this plot would exceed 1000EB worth
            const currentWorth = Object.keys(plotsToKeep).reduce((sum, k) => {
              const pp = plotsToKeep[k];
              const r = (pp.rarity && CONFIG.PLOT_RARITIES.find(rr => rr.key === pp.rarity.key))
                ? CONFIG.PLOT_RARITIES.find(rr => rr.key === pp.rarity.key).rate
                : (pp.rate || CONFIG.PLOT_RARITIES[0].rate);
              return sum + r;
            }, 0);

            if (currentWorth + rarityRate <= CONFLICT_RULES.maxPlotWorthEB) {
              plotsToKeep[tid] = p;
              totalPlotWorth = currentWorth + rarityRate;
            }
          }
        }
      }

      // Now update the best account's state with resolved plots
      bestState.plots = plotsToKeep;
      // Recalculate total EB - keep best account's EB + delta from others (but cap at 1000EB worth equivalent)
      bestState.eb = Math.min(CONFLICT_RULES.maxPlotWorthEB, Number(bestState.eb) || 0);

      // Remove plots from other accounts in Firestore (delta them out)
      // Keep the local resolution for display. Firestore cleanup requires a
      // dedicated Admin SDK operation and must never be attempted by the client.
      localStorage.setItem(KEY, JSON.stringify(bestState));
      console.warn("[Conflict] Local resolution complete; server cleanup requires Admin SDK.");

      if (onResolved) onResolved({ success: true, bestAccount, plotsKept: Object.keys(plotsToKeep).length, plotsRemoved: plotsRemoved.length, eb: bestState.eb });
    }

    return { init, checkConflict, resolveConflict };
  })();

  function applyOfflineProgress() {
    const now = Date.now();
    const lastTick = state.lastTick || state.createdAt || now;
    const MAX_OFFLINE_SEC = 24 * 60 * 60; // 24 hours max offline
    const elapsedSec = Math.min(MAX_OFFLINE_SEC, Math.max(0, (now - lastTick) / 1000));

    if (elapsedSec <= 0) return 0;

    // 1. Calculate unboosted base rate
    let baseRate = 0;
    if (state && state.plots) {
      for (const id in state.plots) {
        const p = state.plots[id];
        const rKey = p.rarity?.key || p.rarity || "common";
        const conf = CONFIG.PLOT_RARITIES.find(r => r.key === rKey);
        baseRate += conf ? conf.rate : CONFIG.PLOT_RARITIES[0].rate;
      }
    }

    if (baseRate <= 0) return 0;

    // 2. Separate boosted seconds from normal seconds
    const boostExpiry = state.boostExpiry || 0;
    let boostedSec = 0;
    let normalSec = elapsedSec;

    if (boostExpiry > lastTick) {
      // The boost was active for part (or all) of the offline window
      const boostEnd = Math.min(now, boostExpiry);
      boostedSec = Math.max(0, (boostEnd - lastTick) / 1000);
      boostedSec = Math.min(elapsedSec, boostedSec);
      normalSec = Math.max(0, elapsedSec - boostedSec);
    }

    const mult = (typeof Multiplier !== "undefined") ? (state.boostMultiplier || Multiplier.getActiveMultiplier()) : 30;

    // 3. Earned = (boosted time * boosted rate) + (normal time * normal rate)
    const earned = (boostedSec * baseRate * mult) + (normalSec * baseRate);

    if (state.cash === undefined) state.cash = 0;
    if (state.lifetimeRent === undefined) state.lifetimeRent = state.cash;

    state.cash += earned;
    state.lifetimeRent += earned;

    state.lastTick = now;
    save(false);
    return earned;
  }

  function isSessionActive() {
    return !isSessionPaused;
  }

  function resumeSession() {
    isSessionPaused = false;
    document.getElementById("session-conflict-modal")?.classList.add("hidden");

    // Keep this tab's persisted session ID so the reload is not treated as a
    // brand-new competing session.
    state.sessionLock = { sessionId: localSessionId, lockedAt: Date.now() };
    syncSafeStateToCloud().finally(() => window.location.reload());
  }

  // Calculate total EB/sec from all owned plots + boost multiplier
  function totalRate() {
    if (!state || !state.plots) return 0;
    let rate = 0;
    for (const id in state.plots) {
      const p = state.plots[id];
      const rKey = p.rarity?.key || p.rarity || "common";
      const conf = CONFIG.PLOT_RARITIES.find(r => r.key === rKey);
      rate += conf ? conf.rate : CONFIG.PLOT_RARITIES[0].rate;
    }
    // Apply 30X/50X boost if active (delegated to Multiplier module)
    if (typeof Multiplier !== "undefined") {
      rate = Multiplier.applyMultiplier(rate, state);
    }
    return rate;
  }

  function isCloudSyncComplete() { return cloudSyncComplete; }

  return { load, save, get, reset, totalRate, applyOfflineProgress, syncFromCloud, getDb, isSessionActive, resumeSession, isCloudSyncComplete, syncSafeStateToCloud };
})();
