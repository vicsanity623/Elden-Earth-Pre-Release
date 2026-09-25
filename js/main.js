// ============================================================
// Elden Earth — main
// Wires sign-in -> location permission -> map -> game loop.
// ============================================================
(() => {
  let map, watchId;
  const _savedStore = (typeof Store !== "undefined" && Store.get) ? Store.get() : null;
  let currentPos = _savedStore?.lastDiamondPlayerPosition || null;
  let toastTimer = null;
  let pulseAnimId = null;

  // --- AUTOMATION / HEADLESS DETECTION ---
  function detectAutomation() {
    if (typeof window === "undefined") return false;

    // 1. Selenium / Puppeteer / Playwright webdriver flag
    if (navigator.webdriver === true) return true;

    // 2. Chrome DevTools protocol detection
    if (window.chrome && window.chrome.runtime && window.chrome.runtime.id) return true;

    // 3. Missing hardware sensors (common in headless)
    if (typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceMotionEvent !== "undefined") {
      // Both exist — likely real device or emulator with sensor spoofing
    } else if (typeof DeviceOrientationEvent === "undefined" &&
               typeof DeviceMotionEvent === "undefined") {
      // Neither exists — suspicious on desktop, but could be desktop browser
      // Only flag if also has headless indicators
      if (navigator.userAgent.includes("HeadlessChrome") ||
          navigator.userAgent.includes("headless")) {
        return true;
      }
    }

    // 4. Known headless user agent patterns
    const ua = (navigator.userAgent || "").toLowerCase();
    if (ua.includes("headlesschrome") ||
        ua.includes("phantomjs") ||
        ua.includes("slimerjs") ||
        ua.includes("nightmare") ||
        ua.includes("puppeteer")) {
      return true;
    }

    // 5. Missing plugins (headless browsers typically have 0 plugins)
    if (navigator.plugins && navigator.plugins.length === 0 &&
        navigator.userAgent.includes("Chrome")) {
      // Chrome with 0 plugins is suspicious
    }

    // 6. Languages check — headless often has empty languages
    if (navigator.languages && navigator.languages.length === 0) return true;

    return false;
  }

  // Teleportation Watchdog State
  let _tp_lastLat = 0;
  let _tp_lastLon = 0;
  let _tp_lastTimestamp = 0;
  const TELEPORT_SPEED_KMH = 900;
  const TELEPORT_MIN_DISTANCE_KM = 5;

  function escapeHtmlFallback(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }
  let isOrbiting = false;
  let isUserInteracting = false;

  const el = (id) => document.getElementById(id);

  // ======================== REFRESH RAPID DETECTION ========================
  (() => {
    const KEY = "elden_refresh_log";
    const MAX_REFRESHES = 5;
    const WINDOW_MS = 30000; // 30 seconds
    const WARN_THRESHOLD = 3;

    const now = Date.now();
    let log = [];
    try { log = JSON.parse(sessionStorage.getItem(KEY) || "[]"); } catch (e) { log = []; }

    // Prune entries older than window
    log = log.filter(t => now - t < WINDOW_MS);
    log.push(now);
    sessionStorage.setItem(KEY, JSON.stringify(log));

    if (log.length >= WARN_THRESHOLD && log.length < MAX_REFRESHES) {
      // Show warning float text after a short delay (let game init first)
      setTimeout(() => {
        if (typeof window.showToast === "function") {
          window.showToast(`⚠️ Rapid refresh detected (${log.length}x in 30s). Stop or you will be signed out.`, 6000);
        }
      }, 2000);
    }

    if (log.length >= MAX_REFRESHES) {
      // Reset the counter and warn — never wipe the save or force sign-out here, since
      // desktop/private-tab testing legitimately reloads several times in a row and
      // that must never cost the player their real progress.
      sessionStorage.removeItem(KEY);
      document.addEventListener("DOMContentLoaded", () => {
        if (typeof window.showToast === "function") {
          window.showToast("⚠️ Rapid refresh detected. Please slow down.", 6000);
        }
      });
    }
  })();

  // ======================== UNIVERSAL CUSTOM CONFIRM ========================
  window.gameConfirm = function(message, opts = {}) {
    return new Promise(resolve => {
      const modal = document.getElementById("game-confirm-modal");
      if (!modal) {
        showToast(message, 5000);
        resolve(false);
        return;
      }
      const msgEl = modal.querySelector(".confirm-msg");
      const okBtn = modal.querySelector(".confirm-ok");
      const cancelBtn = modal.querySelector(".confirm-cancel");
      if (msgEl) msgEl.textContent = message;
      if (okBtn) okBtn.textContent = opts.okText || "Confirm";
      if (cancelBtn) cancelBtn.textContent = opts.cancelText || "Cancel";
      modal.classList.remove("hidden");

      function cleanup(result) {
        modal.classList.add("hidden");
        okBtn?.removeEventListener("click", onOk);
        cancelBtn?.removeEventListener("click", onCancel);
        resolve(result);
      }
      function onOk() { cleanup(true); }
      function onCancel() { cleanup(false); }
      okBtn?.addEventListener("click", onOk);
      cancelBtn?.addEventListener("click", onCancel);
    });
  };

  function showToast(msg, ms = 2200) {
    const t = el("toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add("hidden"), ms);
  }
  // Other modules (multiplier.js, friends.js, referrals.js, etc.) call this by name
  // or via window.showToast — it was only ever local to this IIFE, never exposed.
  window.showToast = showToast;

  function openModal(id) { el(id).classList.remove("hidden"); }
  function closeModal(id) {
    const m = el(id);
    if (m) m.classList.add("hidden");
    deactivateMapObjectAnimations(id);
  }

  // Dyson/ring animations on map markers only run while the player is
  // interacting with that object. Closing its modal freezes them again.
  function deactivateMapObjectAnimations(modalId) {
    if (modalId === "extractor-modal") {
      document.querySelectorAll(".extractor-3d-wrap.is-active").forEach(n => n.classList.remove("is-active"));
    }
    if (modalId === "citadel-modal" || modalId === "citadel-upgrade-modal" || modalId === "siege-modal") {
      document.querySelectorAll(".citadel-3d-monument.is-active").forEach(n => n.classList.remove("is-active"));
    }
  }

  let cachedCashWhole = null;
  let cachedCashDecimal = null;

  // High-Efficiency Cached State Tracker (Zero Redundant DOM Reflows)
  let lastCashStr = "";
  let lastEBVal = -1;
  let lastDiaVal = -1;
  let lastRateVal = "";

  function updateTopbar() {
    window.updateTopbar = updateTopbar;
    if (document.hidden) return; // Battery Saver: Skip UI work when phone is in pocket!
    const state = Store.get();
    if (state.cash === undefined) state.cash = 0;

    // 1. Ultra-Fast Cash Interpolator (Direct TextNode Injection)
    const cashContainer = el("stat-cash");
    if (cashContainer) {
      const val = Number(state.cash) || 0;
      const fixedStr = val.toFixed(15);
      if (fixedStr !== lastCashStr) {
        lastCashStr = fixedStr;
        const parts = fixedStr.split(".");
        const whole = parseInt(parts[0], 10);
        const decimals = parts[1] || "000000000000000";
        const wholeHTML = whole > 0 ? `<span class="cash-whole">${whole}</span>` : "";
        cashContainer.innerHTML = `<span class="cash-dollar">$</span>${wholeHTML}<span class="cash-point">.</span><span class="cash-decimal">${decimals}</span>`;
      }
    }

    // 2. Dirty-Checked Currency Updates (Only updates DOM if numbers actually changed)
    const currentEB = Math.floor(Number(state.eb) || 0);
    if (currentEB !== lastEBVal) {
      lastEBVal = currentEB;
      if (el("stat-eb")) {
        el("stat-eb").innerHTML = `${currentEB} <span class="eb-coin-icon"></span>`;
      }
      if (el("wheel-eb-display")) {
        el("wheel-eb-display").innerHTML = `${currentEB} <span class="eb-coin-icon"></span>`;
      }
    }

    const currentDiamonds = Number(state.diamonds) || 0;
    if (currentDiamonds !== lastDiaVal) {
      lastDiaVal = currentDiamonds;
      if (el("stat-diamonds")) el("stat-diamonds").innerHTML = `${currentDiamonds} <span class="hud-gem-icon"></span>`;
      if (el("wheel-diamond-display")) el("wheel-diamond-display").innerHTML = `${currentDiamonds} <span class="hud-gem-icon"></span>`;
    }

    const currentRate = "$" + Store.totalRate().toFixed(11) + "/s";
    if (currentRate !== lastRateVal) {
      lastRateVal = currentRate;
      if (el("stat-rate")) el("stat-rate").textContent = currentRate;
    }

    // 3. Global 50X/30X Multiplier UI (Delegated to Multiplier module)
    if (typeof Multiplier !== "undefined") {
      Multiplier.updateUI(state);
    }

    // 4. Live Player Identity Chip (Name & Photo Avatar)
    const playerNameEl = el("player-name");
    const playerAvatarEl = el("player-avatar");
    const pName = state.player?.name || "Traveler";
    const pAvatar = state.player?.avatar || "🙂";

    if (playerNameEl && playerNameEl.textContent !== pName) {
      playerNameEl.textContent = pName;
    }

    if (playerAvatarEl) {
      if (pAvatar.startsWith("img:")) {
        const imgSrc = pAvatar.slice(4);
        if (!playerAvatarEl.querySelector("img") || playerAvatarEl.querySelector("img").src !== imgSrc) {
          playerAvatarEl.innerHTML = `<img src="${imgSrc}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">`;
        }
      } else if (playerAvatarEl.textContent !== pAvatar) {
        playerAvatarEl.textContent = pAvatar;
      }
    }
  }

  function formatRate(val) {
    if (!val) return "0";
    return val.toFixed(12).replace(/\.?0+$/, "");
  }

  function updateLandModal() {
    const state = Store.get();
    el("land-count").textContent = Object.keys(state.plots).length;
    el("land-rate").textContent = Store.totalRate().toFixed(11);

    // Count plots by rarity
    const counts = { common: 0, rare: 0, epic: 0, legendary: 0 };
    for (const id in state.plots) {
      const r = state.plots[id].rarity?.key || state.plots[id].rarity;
      if (counts[r] !== undefined) counts[r]++;
    }

    if (el("count-common")) el("count-common").textContent = counts.common;
    if (el("count-rare")) el("count-rare").textContent = counts.rare;
    if (el("count-epic")) el("count-epic").textContent = counts.epic;
    if (el("count-legendary")) el("count-legendary").textContent = counts.legendary;

    const total = counts.common + counts.rare + counts.epic + counts.legendary;
    CONFIG.PLOT_RARITIES.forEach(rarity => {
      const pct = total > 0 ? ((counts[rarity.key] / total) * 100).toFixed(1) : "0.0";
      if (el(`weight-${rarity.key}`)) el(`weight-${rarity.key}`).textContent = pct;
      if (el(`rate-${rarity.key}`)) el(`rate-${rarity.key}`).textContent = formatRate(rarity.rate * (counts[rarity.key] || 0));
    });
  }
  
  async function updatePlayerInfoModal(targetPlayerData = null) {
    const state = Store.get();
    const isOtherPlayer = targetPlayerData && targetPlayerData.ownerId !== state.player.id;
    
    const name = isOtherPlayer ? (targetPlayerData.ownerName || "Traveler") : (state.player.name || "Traveler");
    // Image Safety Review Status: Shows centered banner while pending; vanishes when approved!
    const isPending = !isOtherPlayer && state.player?.avatarStatus === "pending";
    if (el("avatar-pending-banner")) el("avatar-pending-banner").classList.toggle("hidden", !isPending);
    const avatar = isOtherPlayer ? (targetPlayerData.avatar || "🙂") : (state.player.avatar || "🙂");

    el("info-name").textContent = name;
    
    // Avatar
    const av = el("info-avatar");
    if (avatar && avatar.startsWith("img:")) {
      av.innerHTML = `<img src="${avatar.slice(4)}">`;
    } else {
      av.textContent = avatar || "🙂";
    }

    // Only show edit buttons on your own profile
    const editAvatarBtn = el("edit-avatar-btn");
    const uploadOverlay = el("avatar-upload-overlay");
    const editNameBtn = el("edit-name-btn");
    const reportBtn = el("report-player-btn");
    if (editAvatarBtn) editAvatarBtn.style.display = isOtherPlayer ? "none" : "flex";
    if (uploadOverlay) uploadOverlay.style.display = isOtherPlayer ? "none" : "flex";
    if (editNameBtn) editNameBtn.style.display = isOtherPlayer ? "none" : "inline-flex";

    // Report button — only on other players
    if (reportBtn) {
      reportBtn.classList.toggle("hidden", !isOtherPlayer);
      reportBtn.onclick = () => {
        const db = Store.getDb();
        if (db && targetPlayerData?.ownerId) {
          db.collection("player_reports").add({
            reporterId: state.player.id,
            reporterName: state.player.name || "Traveler",
            reportedId: targetPlayerData.ownerId,
            reportedName: targetPlayerData.ownerName || "Unknown",
            reason: "player_report",
            timestamp: Date.now()
          }).then(() => {
            showToast("🚨 Player reported. Thank you for helping keep the realm safe!", 3500);
            reportBtn.disabled = true;
            reportBtn.textContent = "✅ Reported";
          }).catch(() => {
            showToast("⚠️ Could not submit report. Try again later.", 3000);
          });
        }
      };
    }

    // Hide "Sign in with Google" button — Google sign-in only, no guest mode
    const googleLinkSection = el("info-google-link-section");
    if (googleLinkSection) {
      googleLinkSection.style.display = "none";
    }

    // Phone verification status
    const phoneVerifiedEl = el("info-phone-verified");
    const phoneNotVerifiedEl = el("info-phone-not-verified");
    if (phoneVerifiedEl && phoneNotVerifiedEl) {
      if (!isOtherPlayer) {
        const user = firebase.auth().currentUser;
        const hasPhone = user && user.providerData.some(p => p.providerId === "phone");
        phoneVerifiedEl.classList.toggle("hidden", !hasPhone);
        phoneNotVerifiedEl.classList.toggle("hidden", hasPhone);
      } else {
        phoneVerifiedEl.classList.add("hidden");
        phoneNotVerifiedEl.classList.add("hidden");
      }
    }

    // Reset to Profile tab
    document.querySelectorAll(".pi-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".pi-tab-panel").forEach(p => p.classList.remove("active"));
    const profileTab = document.querySelector('[data-pi-tab="profile"]');
    const profilePanel = document.querySelector('[data-pi-panel="profile"]');
    if (profileTab) profileTab.classList.add("active");
    if (profilePanel) profilePanel.classList.add("active");

    // Show/hide Citadel tab (own profile only)
    const citadelTab = document.querySelector('[data-pi-tab="citadel"]');
    if (citadelTab) citadelTab.style.display = isOtherPlayer ? "none" : "";

    // Initial Rent Display (Shows Lifetime Accrued Rent, NOT spendable balance)
    let rentVal = isOtherPlayer ? 0 : (state.lifetimeRent || state.cash || 0);
    el("info-total-rent").textContent = "$" + Number(rentVal).toFixed(11);

    // Fetch and display the other player's live cloud earnings (including offline accumulation)
    if (isOtherPlayer && targetPlayerData.ownerId) {
      const db = Store.getDb();
      if (db) {
        try {
          const doc = await db.collection("saves").doc(targetPlayerData.ownerId).get();
          if (doc.exists) {
            const dData = doc.data();
            const now = Date.now();
            const lastActive = dData.lastTick || dData.createdAt || now;
            const offlineSec = Math.max(0, (now - lastActive) / 1000);

            // Calculate target player's base rate
            let playerBaseRate = 0;
            for (const id in allPlots) {
              if (allPlots[id].ownerId === targetPlayerData.ownerId) {
                const rKey = allPlots[id].rarity?.key || allPlots[id].rarity;
                const confR = CONFIG.PLOT_RARITIES.find(r => r.key === rKey);
                playerBaseRate += (confR ? confR.rate : CONFIG.PLOT_RARITIES[0].rate);
              }
            }

            const offlineEarned = offlineSec * playerBaseRate;
            let lRent = (dData.lifetimeRent !== undefined ? dData.lifetimeRent : (dData.cash || 0)) + offlineEarned;

            el("info-total-rent").textContent = "$" + Number(lRent).toFixed(11);
          }
        } catch (e) {
          console.warn("[PlayerInfo] Error fetching player cash:", e);
        }
      }
    }

    // Calculate Counts from global plots
    const allPlots = (typeof Grid !== "undefined" && Grid.getAllPlots) ? Grid.getAllPlots() : state.plots;
    const targetOwnerId = isOtherPlayer ? targetPlayerData.ownerId : state.player.id;

    const counts = { common: 0, rare: 0, epic: 0, legendary: 0 };
    let total = 0;

    for (const id in allPlots) {
      if (allPlots[id].ownerId === targetOwnerId) {
        const r = allPlots[id].rarity?.key || allPlots[id].rarity;
        if (counts[r] !== undefined) counts[r]++;
        total++;
      }
    }

    el("info-total-plots").textContent = total;
    el("info-count-common").textContent = counts.common;
    el("info-count-rare").textContent = counts.rare;
    el("info-count-epic").textContent = counts.epic;
    el("info-count-legendary").textContent = counts.legendary;

    // Calculate and display income rate ($/s)
    let incomeRate = 0;
    for (const id in allPlots) {
      if (allPlots[id].ownerId === targetOwnerId) {
        const rKey = allPlots[id].rarity?.key || allPlots[id].rarity;
        const confR = CONFIG.PLOT_RARITIES.find(r => r.key === rKey);
        incomeRate += (confR ? confR.rate : CONFIG.PLOT_RARITIES[0].rate);
      }
    }
    // Apply boost multiplier if viewing self (delegated to Multiplier module)
    if (typeof Multiplier !== "undefined") {
      incomeRate = Multiplier.applyMultiplier(incomeRate, state, isOtherPlayer);
    }
    const incomeEl = el("info-income-rate");
    if (incomeEl) incomeEl.textContent = `$${incomeRate.toFixed(11)} /s`;

    // --- Populate Mayorship & Dividends Card ---
    const mayorStatusEl = el("info-mayor-status");
    const dividendsEl = el("info-total-dividends");
    const royaltyBadge = el("info-royalty-badge") || document.querySelector(".mayorship-dividends-card .btn-royalty, .mayorship-dividends-card span:last-child");

    let totalDiv = isOtherPlayer ? 0 : (state.totalDividends || 0);
    if (dividendsEl) dividendsEl.textContent = `${totalDiv} EB`;

    if (mayorStatusEl) {
      mayorStatusEl.textContent = "Checking realm...";
      if (typeof Leaderboard !== "undefined" && Leaderboard.fetchRankings) {
        Leaderboard.fetchRankings(true).then((data) => { // ⚡ Always force fresh titles when opening profile!
          const targetPlayerStat = (data.players || []).find(p => p.id === targetOwnerId);
          const titlesList = [];

          if (targetPlayerStat && targetPlayerStat.badges) {
            targetPlayerStat.badges.forEach(b => {
              titlesList.push(`${b.icon} ${b.title}`);
            });
          }

          if (titlesList.length > 0) {
            mayorStatusEl.innerHTML = titlesList.join("<br>");
            mayorStatusEl.className = "mayor-crown-pill active-mayor";

            const myMayors = targetPlayerStat?.badges?.filter(b => b.scope === "city") || [];
            const myGovs = targetPlayerStat?.badges?.filter(b => b.scope === "state") || [];
            const myPres = targetPlayerStat?.badges?.filter(b => b.scope === "country") || [];
            
            const stackRate = Math.min(6, (myMayors.length ? 2 : 0) + (myGovs.length ? 2 : 0) + (myPres.length ? 2 : 0));
            if (royaltyBadge) {
              royaltyBadge.textContent = `${stackRate}% Royalty`;
              royaltyBadge.style.display = "inline-block";
            }
          } else {
            mayorStatusEl.innerHTML = `🛡️ Citizen of the Realm`;
            mayorStatusEl.className = "mayor-crown-pill";
            if (royaltyBadge) {
              royaltyBadge.textContent = "0% (Citizen)";
              royaltyBadge.style.opacity = "0.6";
            }
          }
        });
      } else {
        mayorStatusEl.textContent = "🛡️ Citizen of the Realm";
      }
    }

    // --- Permanent Stronghold Status Hub (Never Disappears!) ---
    const remoteCard = el("info-citadel-remote-card");
    const recallBtn = el("remote-recall-citadel-btn");

    if (remoteCard) {
      if (isOtherPlayer) {
        remoteCard.style.display = "none"; // Hide on other players' profiles
      } else {
        remoteCard.style.display = "flex"; // Always visible on YOUR profile!

        const myCit = (typeof Citadels !== "undefined" && Citadels.getMyCitadel) ? Citadels.getMyCitadel() : null;

        if (myCit) {
          if (el("remote-citadel-title")) el("remote-citadel-title").textContent = `${myCit.creatorName}'s Hold (${myCit.rarity.toUpperCase()})`;
          if (el("remote-citadel-coords")) el("remote-citadel-coords").textContent = `Coords: [${myCit.lat.toFixed(3)}, ${myCit.lon.toFixed(3)}]`;
          if (recallBtn) {
            recallBtn.disabled = false;
            recallBtn.innerHTML = "📦 Recall to Bag";
            recallBtn.style.opacity = "1";
            recallBtn.style.cursor = "pointer";
          }
        } else {
          if (el("remote-citadel-title")) el("remote-citadel-title").textContent = "No Active Stronghold";
          if (el("remote-citadel-coords")) el("remote-citadel-coords").textContent = "Capsule in bag — Plant via Buy Land!";
          if (recallBtn) {
            recallBtn.disabled = true;
            recallBtn.innerHTML = "🔒 Not Planted";
            recallBtn.style.opacity = "0.45";
            recallBtn.style.cursor = "not-allowed";
          }
        }
      }
    }

    // Render friends tab content
    if (typeof Friends !== "undefined" && !isOtherPlayer) {
      Friends.renderFriendsTab();
      // One-time: claim any pending referral bonuses
      if (!window._referralBonusesClaimed && typeof Referrals !== "undefined") {
        window._referralBonusesClaimed = true;
        Referrals.claimReferralBonuses();
      }
      // One-time: claim any pending friend gifts
      if (!window._friendGiftsClaimed && typeof Friends !== "undefined") {
        window._friendGiftsClaimed = true;
        Friends.claimDailyGifts();
      }
    } else if (isOtherPlayer) {
      // Show relationship-aware friend UI for other players (not a blind "send request" every time)
      const friendsPanel = document.querySelector('[data-pi-panel="friends"]');
      if (friendsPanel) {
        const container = friendsPanel.querySelector(".friends-list-container");
        if (container) {
          const targetId = targetPlayerData.ownerId;
          const targetName = escapeHtmlFallback(targetPlayerData.ownerName || "Player");
          const targetAvatar = targetPlayerData.avatar || "🙂";

          container.innerHTML = `
            <div class="friends-placeholder-inner">
              <div class="friends-placeholder-icon">👤</div>
              <h3>${targetName}</h3>
              <p id="friend-relationship-status">Checking friendship status…</p>
            </div>`;

          if (typeof Friends !== "undefined" && Friends.getRelationshipStatus) {
            Friends.getRelationshipStatus(targetId).then((rel) => {
              const statusEl = container.querySelector("#friend-relationship-status");
              const wrap = container.querySelector(".friends-placeholder-inner");
              if (!wrap) return;

              if (rel.status === "friends") {
                wrap.innerHTML = `
                  <div class="friends-placeholder-icon">👤</div>
                  <h3>${targetName}</h3>
                  <p>✅ You're already friends!</p>`;
              } else if (rel.status === "pending_sent") {
                wrap.innerHTML = `
                  <div class="friends-placeholder-icon">👤</div>
                  <h3>${targetName}</h3>
                  <p>📨 Friend request sent — awaiting response.</p>`;
              } else if (rel.status === "pending_received") {
                wrap.innerHTML = `
                  <div class="friends-placeholder-icon">👤</div>
                  <h3>${targetName}</h3>
                  <p>📬 ${targetName} sent you a request! Accept it in your Friends tab.</p>`;
              } else if (rel.status === "self") {
                wrap.innerHTML = `
                  <div class="friends-placeholder-icon">👤</div>
                  <h3>${targetName}</h3>
                  <p>This is you!</p>`;
              } else {
                wrap.innerHTML = `
                  <div class="friends-placeholder-icon">👤</div>
                  <h3>${targetName}</h3>
                  <p>Send a friend request to connect!</p>
                  <button class="btn btn-primary" style="margin-top:12px"
                    onclick="Friends.sendRequest('${targetId}','${targetName}','${targetAvatar}');this.textContent='✅ Sent!';this.disabled=true;">
                    📨 Send Friend Request
                  </button>`;
              }
            }).catch(() => {
              if (statusEl) statusEl.textContent = "⚠️ Could not check friendship status.";
            });
          }
        }
      }
    }

    // Render referrals tab content
    if (typeof Referrals !== "undefined" && !isOtherPlayer) {
      Referrals.renderReferralsTab();
    } else if (isOtherPlayer) {
      const referralsPanel = document.querySelector('[data-pi-panel="referrals"]');
      if (referralsPanel) {
        referralsPanel.innerHTML = `
          <div class="referrals-placeholder">
            <div class="referrals-placeholder-icon">🔒</div>
            <h3>Private</h3>
            <p>Referral stats are private to each player.</p>
          </div>`;
      }
    }
  }

  // ---------------- Sign-in & Sequenced Boot ----------------
  function onSignedIn(playerData) {
    const player = playerData || Store.get()?.player || { name: "Traveler" };
    console.log("[Main] onSignedIn called with player:", player);

    // Force immediate dismissal of signin screen on all browsers (Brave, Chrome, Safari)
    const signin = document.getElementById("signin-screen");
    if (signin) {
      signin.classList.add("hidden");
      signin.style.display = "none";
    }

    // Execute the professional 3D load pipeline
    if (typeof Bootloader !== "undefined" && Bootloader.run) {
      Bootloader.run(player, (coords) => {
        launchGame(coords);
        beginWatch();
      });
    } else {
      launchGame();
    }
  }

  // ---------------- Location ----------------
  function startLocating() {
    if (!("geolocation" in navigator)) {
      showLocationRequired();
      return;
    }
    el("locate-status").textContent = "Locating…";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        hideLocationRequired();
        launchGame(pos.coords);
        beginWatch();
      },
      (err) => {
        console.warn("[Location] Permission denied or error:", err.code);
        showLocationRequired();
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  }

  function showLocationRequired() {
    const screen = document.getElementById("location-required-screen");
    if (screen) screen.classList.remove("hidden");
  }

  function hideLocationRequired() {
    const screen = document.getElementById("location-required-screen");
    if (screen) screen.classList.add("hidden");
  }

  // High-Efficiency GPS Hardware Controller (Saves 40% Battery)
  let lastProcessedLat = 0;
  let lastProcessedLon = 0;

  function beginWatch() {
    if (!navigator.geolocation) return;
    if (watchId) navigator.geolocation.clearWatch(watchId);

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        // Battery Guard: Don't spend CPU if phone screen is locked
        if (document.hidden) return;

        const { latitude, longitude } = pos.coords;

        const distMoved = Geo.haversine(lastProcessedLat, lastProcessedLon, latitude, longitude);
        if (distMoved > 1.5 || lastProcessedLat === 0) {
          // Calculate exact walking direction vector (N, S, E, W)
          if (lastProcessedLat !== 0 && typeof Character3D !== "undefined" && Character3D.setHeading) {
            const y = Math.sin((longitude - lastProcessedLon) * Math.PI / 180) * Math.cos(latitude * Math.PI / 180);
            const x = Math.cos(lastProcessedLat * Math.PI / 180) * Math.sin(latitude * Math.PI / 180) -
                      Math.sin(lastProcessedLat * Math.PI / 180) * Math.cos(latitude * Math.PI / 180) * Math.cos((longitude - lastProcessedLon) * Math.PI / 180);
            const walkBearingRad = Math.atan2(y, x);
            Character3D.setHeading(walkBearingRad);
          }

          lastProcessedLat = latitude;
          lastProcessedLon = longitude;
          handlePosition(pos.coords);
        }
      },
      (err) => console.warn("watchPosition error", err),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
  }

  // Turn off GPS satellite radio when screen is locked in pocket
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (watchId) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    } else {
      if (!watchId) beginWatch();
    }
  });

  function updatePlayerRadiusLayer() {
    if (!map || !currentPos) return;
    const radiusM = CONFIG.DIAMOND_COLLECT_RADIUS_METERS || 100;
    const ringCoords = Geo.createCirclePolygon(currentPos.lat, currentPos.lon, radiusM);

    const data = {
      type: "FeatureCollection",
      features: [
        // 100m boundary polygon
        {
          type: "Feature",
          properties: { type: "boundary" },
          geometry: { type: "Polygon", coordinates: [ringCoords] }
        },
        // Center point for the pulsing shockwave
        {
          type: "Feature",
          properties: { type: "center" },
          geometry: { type: "Point", coordinates: [currentPos.lon, currentPos.lat] }
        }
      ]
    };

    if (map.getSource("player-sonar-source")) {
      map.getSource("player-sonar-source").setData(data);
    }
  }

  function gateCashoutButtons(block) {
    if (typeof window === "undefined") return;
    document.querySelectorAll(".cashout-teaser-card, .lp-cashout-card, [data-cashout]").forEach(btn => {
      if (block) {
        btn.style.opacity = "0.35";
        btn.style.pointerEvents = "none";
        btn.title = "Disabled — VPN or datacenter connection detected";
      } else {
        btn.style.opacity = "";
        btn.style.pointerEvents = "";
        btn.title = "";
      }
    });
  }

  function triggerInstantBan() {
    console.error("[AntiCheat] Excessive teleportation strikes — flagging for review (no longer wipes local data).");
    showToast("🛡️ Unusual movement detected. Land/collect actions are temporarily paused.", 6000);
    if (typeof Store !== "undefined" && Store.getDb && Store.get().player?.id) {
      const db = Store.getDb();
      if (db) {
        db.collection("cheat_reports").add({
          playerId: Store.get().player.id,
          playerName: Store.get().player.name || "Unknown",
          type: "instant_ban_teleport",
          details: "Exceeded 3 teleportation strikes",
          timestamp: Date.now()
        }).catch(() => {});
      }
    }
    // NOTE: previously signed the player out and wiped their local save here.
    // Desktop/private-tab geolocation is frequently coarse and jumpy (Wi-Fi/IP based),
    // which made this trip constantly on completely legitimate players and destroyed
    // real progress. We now only log the report and reset the strike counter below
    // so a real player is never permanently punished for a false positive.
    const state = Store.get();
    state.antiCheatStrikes = 0;
    Store.save(true);
  }

  function checkTeleportation(lat, lon, timestamp, accuracy) {
    // Coarse Wi-Fi/IP-based fixes (common on desktop & private-tab browsers) can jump
    // many km between reads with no real movement — don't treat those as teleportation.
    if (typeof accuracy === "number" && accuracy > 1000) {
      return true;
    }
    const now = Date.now();
    if (_tp_lastTimestamp === 0) {
      _tp_lastLat = lat;
      _tp_lastLon = lon;
      _tp_lastTimestamp = now;
      return true;
    }

    const deltaMs = now - _tp_lastTimestamp;
    const deltaHours = deltaMs / 3600000;
    if (deltaHours < 0.001) {
      _tp_lastLat = lat;
      _tp_lastLon = lon;
      _tp_lastTimestamp = now;
      return true;
    }

    const distMeters = Geo.haversine(_tp_lastLat, _tp_lastLon, lat, lon);
    const distKm = distMeters / 1000;
    const speedKmh = distKm / deltaHours;

    _tp_lastLat = lat;
    _tp_lastLon = lon;
    _tp_lastTimestamp = now;

    if (distKm > TELEPORT_MIN_DISTANCE_KM && speedKmh > TELEPORT_SPEED_KMH) {
      const state = Store.get();
      state.antiCheatStrikes = (state.antiCheatStrikes || 0) + 1;
      Store.save(true);
      console.warn(`[AntiCheat] TELEPORT STRIKE ${state.antiCheatStrikes}/3: ${distKm.toFixed(1)}km in ${deltaHours.toFixed(3)}h (${speedKmh.toFixed(0)} km/h)`);
      if (typeof AntiCheat !== "undefined" && typeof AntiCheat.reportViolation === "function") {
        AntiCheat.reportViolation("teleport", `${distKm.toFixed(0)}km in ${deltaHours.toFixed(3)}h`);
      }
      if (state.antiCheatStrikes >= 3) {
        triggerInstantBan();
        return false;
      }
      showToast(`⚠️ Teleportation detected (${distKm.toFixed(0)}km). Strike ${state.antiCheatStrikes}/3.`, 5000);
      return false;
    }

    return true;
  }

  function detectMockProvider(coords) {
    const { accuracy, altitude, speed, altitudeAccuracy } = coords;

    if (typeof accuracy === "number" && accuracy <= 0) {
      return { flagged: true, reason: "invalid_accuracy_" + accuracy };
    }

    if (typeof accuracy === "number" && accuracy === 5 && altitudeAccuracy === 0) {
      return { flagged: true, reason: "simulator_default_accuracy" };
    }

    const accStr = String(accuracy);
    if (/^\d+\.\d{6,}$/.test(accStr)) {
      const decPart = accStr.split(".")[1];
      if (decPart.replace(/0/g, "").length === 0) {
        return { flagged: true, reason: "artificial_accuracy_" + decPart.slice(0, 4) };
      }
    }

    // NOTE: null_alt_and_speed check REMOVED — legitimate browsers (desktop, Safari private)
    // often don't report altitude/speed. This caused false rejections for real players.

    return { flagged: false, reason: null };
  }

  let lastCameraCenter = null;

  function handlePosition(coords) {
    currentPos = { lat: coords.latitude, lon: coords.longitude };
    if (!map) return;

    // Anti-cheat: Validate GPS position for spoofing
    if (typeof AntiCheat !== "undefined") {
      const gpsCheck = AntiCheat.validatePosition(
        coords.latitude, coords.longitude,
        coords.accuracy, coords.timestamp
      );
      if (!gpsCheck.valid) {
        console.warn(`[AntiCheat] GPS rejected: ${gpsCheck.reason}`);
        showToast("🛡️ GPS anomaly detected. Please verify your location.", 4000);
        if (typeof AntiCheat.reportViolation === "function") {
          AntiCheat.reportViolation("gps_spoof", gpsCheck.reason);
        }
        return; // Reject this position
      }
    }

    // Teleportation Sanity Watchdog
    if (!checkTeleportation(coords.latitude, coords.longitude, coords.timestamp, coords.accuracy)) {
      return;
    }

    // GPS Accuracy & Mock Provider Detection
    const mockCheck = detectMockProvider(coords);
    if (mockCheck.flagged) {
      console.warn(`[AntiCheat] MOCK GPS FLAGGED: ${mockCheck.reason}`);
      showToast("⚠️ Mock location detected. Please use real GPS.", 4000);
      if (typeof AntiCheat !== "undefined" && typeof AntiCheat.reportViolation === "function") {
        AntiCheat.reportViolation("mock_gps", mockCheck.reason);
      }
      return;
    }

    // Server-side position validation (async — doesn't block game loop)
    if (typeof ServerAntiCheat !== "undefined" && ServerAntiCheat.isReady()) {
      ServerAntiCheat.sendPosition(coords).then(result => {
        if (result && !result.valid) {
          console.warn(`[ServerAntiCheat] REJECTED: ${result.reason} (speed=${result.speed}km/h)`);
          // Show user-friendly message instead of raw reason codes
          const friendlyMessages = {
            "rate_limited": "Too many updates. Slow down.",
            "invalid_coordinates": "Invalid GPS coordinates detected.",
            "coordinates_out_of_range": "GPS coordinates out of range.",
            "stale_position": "Position data is outdated.",
            "invalid_accuracy": "GPS accuracy issue detected.",
            "simulator_default_accuracy": "Simulator detected. Please use a real device.",
            "artificial_accuracy": "GPS accuracy anomaly detected.",
            "teleportation": "Movement too fast. Possible GPS spoofing.",
            "excessive_speed": "Movement speed exceeded limit.",
          };
          const msg = friendlyMessages[result.reason] || "Position rejected. Please verify your location.";
          showToast("🛡️ " + msg, 5000);
          if (result.reason && result.reason.includes("banned")) {
            setTimeout(() => { window.location.href = "/"; }, 3000);
          }
        }
      }).catch(() => {});
    }
    
    if (typeof Citadels !== "undefined") Citadels.setPlayerPosition(currentPos.lat, currentPos.lon);
    if (typeof EldenStops !== "undefined") EldenStops.setPlayerPosition(currentPos.lat, currentPos.lon);
    
    // 1. Move 3D Character & Radius Layer
    Character3D.setPlayerPosition(currentPos.lon, currentPos.lat);
    if (typeof CompanionPet !== "undefined") {
      CompanionPet.setPlayerPosition(currentPos.lon, currentPos.lat);
    }
    updatePlayerRadiusLayer();
    Diamonds.setPlayerPosition(currentPos.lat, currentPos.lon);

    // Anti-cheat: Periodic territory check for embargo (every ~500m movement)
    if (typeof AntiCheat !== "undefined" && typeof Geo !== "undefined") {
      const _acs = Store.get();
      const lastTerritory = _acs?.lastTerritoryCheck || { lat: 0, lon: 0 };
      const territoryDist = Geo.haversine(lastTerritory.lat, lastTerritory.lon, currentPos.lat, currentPos.lon);
      if (territoryDist > 500 || !lastTerritory.lat) {
        _acs.lastTerritoryCheck = { lat: currentPos.lat, lon: currentPos.lon };
        Store.save(true);
        Geo.getTerritoryInfo(currentPos.lat, currentPos.lon).then(info => {
          if (AntiCheat.getEmbargoStatus().isEmbargoed) {
            const emModal = document.getElementById("embargo-modal");
            if (emModal) emModal.classList.remove("hidden");
          }
        }).catch(() => {});
      }
    }

    // 2. Camera Follow Deadzone: Only glide camera if player actually moved > 0.8 meters
    const dist = lastCameraCenter ? Geo.haversine(lastCameraCenter.lat, lastCameraCenter.lon, currentPos.lat, currentPos.lon) : 999;

    if (dist > 0.8 && !isUserInteracting && !isOrbiting && !(typeof EldenStops !== "undefined" && EldenStops.isCinematicOpen())) {
      lastCameraCenter = { lat: currentPos.lat, lon: currentPos.lon };
      map.easeTo({
        center: [currentPos.lon, currentPos.lat],
        duration: 1000,
        easing: (t) => t,
        essential: true
      });
    }
  }
  
  // ---------------- 3D Map / Game Launch with Auto-Fallback ----------------
  function launchGame(coords) {
    document.body.classList.toggle("no-shake", Boolean(Store.get()?.disableShake));
    currentPos = { lat: coords.latitude, lon: coords.longitude };

    // --- HARD VPN BLOCK: Run verification BEFORE showing the game screen ---
    // VPN/Datacenter users are blocked entirely — no gameplay allowed.
    if (typeof Geo !== "undefined" && Geo.NetworkVerifier) {
      Geo.NetworkVerifier.verify(coords.latitude, coords.longitude).then(result => {
        const state = Store.get();
        state.networkVerification = result;
        Store.save(true);

        if (result.isVPN || result.isDatacenter) {
          const reason = result.isVPN ? "VPN" : "datacenter";
          el("locate-screen")?.classList.add("hidden");
          el("loading-screen")?.classList.add("hidden");
          el("game-screen")?.classList.add("hidden");

          const blockModal = document.getElementById("vpn-block-modal");
          const reasonEl = document.getElementById("vpn-block-reason");
          if (reasonEl) {
            reasonEl.textContent = reason === "VPN"
              ? "VPN connections are not allowed in Elden Earth."
              : "Datacenter/proxy connections are not allowed.";
          }
          if (blockModal) blockModal.classList.remove("hidden");

          gateCashoutButtons(true);
          return;
        }

        if (result.isSuspicious) {
          showToast("⚠️ Network location mismatch. Please disable VPN.", 5000);
          gateCashoutButtons(true);
        }

        // Network clean — launch the game
        el("locate-screen")?.classList.add("hidden");
        el("loading-screen")?.classList.add("hidden");
        el("game-screen")?.classList.remove("hidden");
        _finishGameLaunch();
      }).catch(() => {
        // If verification fails entirely, allow gameplay but flag for review
        el("locate-screen")?.classList.add("hidden");
        el("loading-screen")?.classList.add("hidden");
        el("game-screen")?.classList.remove("hidden");
        _finishGameLaunch();
      });
      return; // Defer — verification handles the launch
    }

    // No NetworkVerifier available — launch immediately
    el("locate-screen")?.classList.add("hidden");
    el("loading-screen")?.classList.add("hidden");
    el("game-screen")?.classList.remove("hidden");
    _finishGameLaunch();
  }

  // Shared object visibility (normal view + Bird's Eye; outer IIFE scope).
  function applyBirdsEyeLayerVisibility() {
    if (typeof map === "undefined" || !map) return;
    const off = (k) => document.body.classList.contains("be-off-" + k);
    const culled = document.body.classList.contains("map-culled-far") ||
      map.getZoom() < (CONFIG.MAP_CULL_MIN_ZOOM || 14);
    const setVis = (id, visible) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    };
    setVis("plots-grass-base", !off("plots"));
    setVis("plots-fill", !off("plots"));
    setVis("plots-line", !off("plots"));
    setVis("player-sonar-fill", !off("player") && !culled);
    setVis("player-sonar-line", !off("player") && !culled);
    setVis("foliage-layer", !off("foliage") && !culled);
    setVis("citadel-parcels-fill", !off("citadel") && !culled);
    setVis("citadel-parcels-line", !off("citadel") && !culled);
  }

  function _finishGameLaunch() {
    const MAP_STYLES = {
      "elden-earth": "https://tiles.openfreemap.org/styles/dark",
      liberty: "https://tiles.openfreemap.org/styles/liberty",
      positron: "https://tiles.openfreemap.org/styles/positron",
      bright: "https://tiles.openfreemap.org/styles/bright",
    };
    const mapStyle = localStorage.getItem("eldenEarth.mapStyle") || "elden-earth";
    const styleUrl = MAP_STYLES[mapStyle] || MAP_STYLES.dark;

    // 1. Initialize 3D Camera with 2-Finger Vertical Tilt & 1-Finger Orbit
    map = new mapboxgl.Map({
      container: "map",
      style: styleUrl,
      center: [currentPos.lon, currentPos.lat],
      zoom: 18.0,
      minZoom: 2,        // Allow full globe zoom-out
      maxZoom: 20.0,     // Street-level max zoom-in
      pitch: 75,         // Default 60° angle
      minPitch: 0,       // Allows flat 0° top-down view
      maxPitch: 75,      // Allows cinematic 70° low angle
      bearing: 0,
      antialias: false, // Saves 30% GPU load
      dragPan: false,    // Map stays locked to player (cannot scroll away)
      dragRotate: true,
      touchZoomRotate: true,
      touchPitch: true,  // Enables native 2-finger vertical swipe to tilt camera angle!
      fadeDuration: 0, // Eliminates expensive GPU alpha-blending on tile loads
      canvasContextAttributes: { antialias: false, powerPreference: "low-power" } // Routes graphics through mobile energy-efficiency cores
    });

    // --- MAP STYLE TOGGLE ---
    function toggle3DBuildings(enable) {
      if (!map) return;
      const layers = map.getStyle().layers;
      let labelLayerId;
      for (let i = 0; i < layers.length; i++) {
        if (layers[i].type === "symbol" && layers[i].layout["text-field"]) {
          labelLayerId = layers[i].id;
          break;
        }
      }
      if (map.getLayer("3d-buildings")) {
        map.removeLayer("3d-buildings");
      }
      if (enable && labelLayerId) {
        map.addLayer({
          id: "3d-buildings",
          source: "carto",
          "source-layer": "building",
          type: "fill-extrusion",
          minzoom: 15,
          paint: {
            "fill-extrusion-color": [
              "interpolate", ["linear"], ["get", "render_height"], 0, "#1a1a2e", 50, "#2a3a5c", 100, "#3a5a8c"
            ],
            "fill-extrusion-height": ["get", "render_height"],
            "fill-extrusion-base": ["get", "render_min_height"],
            "fill-extrusion-opacity": 0.7,
          },
        }, labelLayerId);
      }
    }

    function applyMapStyle(styleKey) {
      if (!map) return;
      const is3D = styleKey === "3d";
      const url = is3D ? (MAP_STYLES["elden-earth"]) : (MAP_STYLES[styleKey] || MAP_STYLES["elden-earth"]);
      map.setStyle(url);
      map.once("style.load", () => {
        // Re-add all game layers that setStyle destroyed
        Grid.render();
        setupGameLayers();
        toggle3DBuildings(is3D);
        Diamonds.renderAll();
        if (typeof Citadels !== "undefined") Citadels.render();
        // Style swap recreated layers — force a fresh LOD visibility pass
        lastCulledState = null;
        applyMapLod();
        refreshMapModulesAfterZoom();
      });
      localStorage.setItem("eldenEarth.mapStyle", styleKey);
      document.querySelectorAll(".map-style-btn").forEach(btn => {
        btn.classList.toggle("is-active", btn.dataset.style === styleKey);
        btn.style.borderColor = "";
        btn.style.color = "";
        btn.style.background = "";
      });
    }

    document.querySelectorAll(".map-style-btn").forEach(btn => {
      btn.addEventListener("click", () => applyMapStyle(btn.dataset.style));
    });
    applyMapStyle(mapStyle);

    // Multi-touch Controller: 1-finger orbit & 2-finger pitch/zoom
    let lastTouchX = 0;
    const canvas = map.getCanvas();

    canvas.addEventListener("touchstart", (e) => {
      isUserInteracting = true;
      if (e.touches.length === 1) {
        isOrbiting = true;
        lastTouchX = e.touches[0].clientX;
      } else {
        // 2 fingers on screen: Hand control directly to MapLibre for vertical pitch & pinch-zoom
        isOrbiting = false;
      }
    }, { passive: true });

    canvas.addEventListener("touchmove", (e) => {
      // 1-finger horizontal swipe rotates camera around player
      if (isOrbiting && e.touches.length === 1) {
        const deltaX = e.touches[0].clientX - lastTouchX;
        lastTouchX = e.touches[0].clientX;
        map.setBearing(map.getBearing() + deltaX * 0.45);
      }
    }, { passive: true });

    canvas.addEventListener("touchend", () => {
      isOrbiting = false;
      // Grace period before GPS auto-follow resumes
      setTimeout(() => { isUserInteracting = false; }, 350);
    });

    // Re-lock center strictly when gestures finish (never interrupts animations mid-flight)
    map.on("zoomend", () => {
      if (currentPos) map.setCenter([currentPos.lon, currentPos.lat]);
      applyMapLod();
      refreshMapModulesAfterZoom();
    });

    // Cheap per-frame LOD toggle while pinching/scrolling (class + CSS var only).
    // Layer visibility + marker teardown happen on zoomend.
    map.on("zoom", applyMapLod);

    // ======================== FAR-ZOOM LOD CULLING ========================
    // When the player zooms out past MAP_CULL_MIN_ZOOM (or enters Bird's Eye),
    // destroy every decorative 3D/DOM game object. Only landplot tile polygons
    // stay on the map. This is the main phone-GPU heat relief valve.
    let lastCulledState = null;

    function applyMapLod() {
      if (!map || !map.getStyle) return;
      const zoom = map.getZoom();
      const cullZoom = CONFIG.MAP_CULL_MIN_ZOOM || 14;
      const culled = zoom < cullZoom;

      document.body.classList.toggle("map-culled-far", culled);

      // World-anchored beacon scale: shrinks Elden Stops as the player zooms out
      // so they keep a fixed map size instead of a fixed (massive) screen size.
      const refZoom = CONFIG.ELDEN_STOP_BASE_ZOOM || 18;
      const minScale = CONFIG.ELDEN_STOP_MIN_SCALE || 0.4;
      const maxScale = CONFIG.ELDEN_STOP_MAX_SCALE || 1.15;
      const scale = Math.min(maxScale, Math.max(minScale, Math.pow(2, zoom - refZoom)));
      document.documentElement.style.setProperty("--eld-stop-scale", scale.toFixed(3));

      // Layer visibility only when the culled flag actually flips
      if (culled !== lastCulledState) {
        lastCulledState = culled;
        const beOff = (k) => document.body.classList.contains("be-off-" + k);
        const setVis = (id, visible) => {
          if (map.getLayer(id)) {
            map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
          }
        };
        // Keep ONLY landplot tiles when culled (unless Bird's Eye toggle hides them)
        setVis("plots-grass-base", !beOff("plots"));
        setVis("plots-fill", !beOff("plots"));
        setVis("plots-line", !beOff("plots"));
        setVis("player-sonar-fill", !culled && !beOff("player"));
        setVis("player-sonar-line", !culled && !beOff("player"));
        setVis("foliage-layer", !culled && !beOff("foliage"));
        setVis("citadel-parcels-fill", !culled && !beOff("citadel"));
        setVis("citadel-parcels-line", !culled && !beOff("citadel"));
        setVis("empty-grid-fill", !culled);
        setVis("empty-grid-line", !culled);
        setVis("3d-buildings", !culled);
        applyBirdsEyeLayerVisibility();
      }
    }

    function refreshMapModulesAfterZoom() {
      if (typeof Grid !== "undefined" && Grid.render) Grid.render();
      if (typeof EldenStops !== "undefined") {
        EldenStops.renderAll();
        EldenStops.renderAllBerries();
      }
      if (typeof Citadels !== "undefined") Citadels.render();
      if (typeof Diamonds !== "undefined") Diamonds.renderAll();
      if (typeof Foliage !== "undefined") Foliage.update();
      applyMapLod();
    }

    // Initial LOD pass once the map exists
    applyMapLod();

    // --- Instant Identity Recovery (Pulls Name & Photo from your 25 plots) ---
    const state = Store.get();
    if (state && state.player && (!state.player.name || state.player.name === "Traveler")) {
      const allPlots = (typeof Grid !== "undefined" && Grid.getAllPlots) ? Grid.getAllPlots() : (state.plots || {});
      for (const id in allPlots) {
        const p = allPlots[id];
        if (p.ownerId === state.player.id && p.ownerName && p.ownerName !== "Traveler") {
          state.player.name = p.ownerName;
          if (p.avatar && p.avatar !== "🙂") state.player.avatar = p.avatar;
          console.log(`[Main] Restored player identity: ${state.player.name}`);
          Store.save(true);
          break;
        }
      }
    }
    
    function setupGameLayers() {
      if (!map || !map.getStyle()) return;

      // 0. Privacy: hide street / road / address labels on every style
      try {
        (map.getStyle().layers || []).forEach((l) => {
          if (l.type !== "symbol") return;
          const id = String(l.id || "").toLowerCase();
          const srcLayer = String(l["source-layer"] || "").toLowerCase();
          const isStreetLabel =
            id.includes("road") ||
            id.includes("street") ||
            id.includes("highway") ||
            id.includes("motorway") ||
            id.includes("address") ||
            id.includes("housenumber") ||
            id.includes("path") ||
            id.includes("track") ||
            srcLayer.includes("transportation") ||
            srcLayer.includes("road") ||
            srcLayer.includes("street");
          if (isStreetLabel) {
            try { map.setLayoutProperty(l.id, "visibility", "none"); } catch (_) {}
          }
        });
      } catch (err) {
        console.warn("[MapEngine] Street label hide notice:", err);
      }

      // 1. Dynamic Street & Road Illuminator (Brightens pitch-black vector tiles)
      try {
        const layers = map.getStyle().layers || [];
        layers.forEach((l) => {
          // Brighten and highlight all roads, streets, highways, and paths
          if (l.type === "line" && (l.id.includes("road") || l.id.includes("street") || l.id.includes("highway") || l.id.includes("transportation") || l.id.includes("path") || l.id.includes("track"))) {
            map.setPaintProperty(l.id, "line-color", "#2d4059");
            map.setPaintProperty(l.id, "line-opacity", 0.9);
          }
          // Lift pitch-black background to rich midnight obsidian
          if (l.type === "background") {
            map.setPaintProperty(l.id, "background-color", "#0e1522");
          }
        });
      } catch (err) {
        console.warn("[MapEngine] Street brighten notice:", err);
      }

      // 2. Add True 3D Extruded Buildings (if source exists)
      try {
        const layers = map.getStyle().layers || [];
        const labelLayerId = layers.find(l => l.type === "symbol" && l.layout && l.layout["text-field"])?.id;

        if (!map.getLayer("3d-buildings") && (map.getSource("composite") || map.getSource("openmaptiles"))) {
          const buildingSource = map.getSource("composite") ? "composite" : "openmaptiles";
          map.addLayer({
            id: "3d-buildings",
            source: buildingSource,
            "source-layer": "building",
            filter: ["==", "extrude", "true"],
            type: "fill-extrusion",
            minzoom: 15,
            paint: {
              "fill-extrusion-color": "#1f2c40",
              "fill-extrusion-height": ["get", "height"],
              "fill-extrusion-base": ["get", "min_height"],
              "fill-extrusion-opacity": 0.85,
            },
          }, labelLayerId);
        }
      } catch (err) {
        console.log("[MapEngine] 3D buildings setup note:", err);
      }

      // 3. Mount 3D Animated Character
      Character3D.init(map, currentPos.lon, currentPos.lat);

      // 3.1. Mount 3D Companion Pet System
      if (typeof CompanionPet !== "undefined") {
        CompanionPet.init(map, currentPos.lon, currentPos.lat);
      }

      // 3.2. Initialize 3D Standing Foliage Engine
      if (typeof Foliage !== "undefined") {
        Foliage.init(map);
      }
      
      // 3.5. Mount 3D Ground Sonar Layer (Locked to exact real-world meters)
      const radiusM = CONFIG.DIAMOND_COLLECT_RADIUS_METERS || 100;
      const initialRing = Geo.createCirclePolygon(currentPos.lat, currentPos.lon, radiusM);

      if (!map.getSource("player-sonar-source")) {
        map.addSource("player-sonar-source", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: { type: "boundary" },
                geometry: { type: "Polygon", coordinates: [initialRing] }
              },
              {
                type: "Feature",
                properties: { type: "center" },
                geometry: { type: "Point", coordinates: [currentPos.lon, currentPos.lat] }
              }
            ]
          }
        });

        map.addLayer({
          id: "player-sonar-fill",
          type: "fill",
          source: "player-sonar-source",
          filter: ["==", ["get", "type"], "boundary"],
          paint: {
            "fill-color": "#4fd6c4",
            "fill-opacity": 0.05
          }
        });

        map.addLayer({
          id: "player-sonar-line",
          type: "line",
          source: "player-sonar-source",
          paint: {
            "line-color": "#4fd6c4",
            "line-width": 2,
            "line-dasharray": [3, 2],
            "line-opacity": 0.85
          }
        });
      }

      // 4. Initialize Core Game Subsystems
      Grid.init(map, {
        onBuyAttempt: (success, rarity) => {
          if (success) {
            showToast(`Claimed a ${rarity.label} plot!`);
            updateTopbar();

            // Check if pet should be unlocked (50 plots milestone)
            if (typeof CompanionPet !== "undefined") {
              CompanionPet.checkUnlockMilestone();
              CompanionPet.updatePetHUD();
            }

            // Refresh leaderboard data every 60 seconds so passive rent stays current
            if (now - lastLeaderboardRefresh >= 60000) {
              lastLeaderboardRefresh = now;
              if (typeof Leaderboard !== "undefined" && Leaderboard.fetchRankings) {
                Leaderboard.fetchRankings(true);
              }
            }
            updateLandModal();
          } else {
            // Grid already shows the precise failure reason (cooldown, distance,
            // already claimed, EB...). Never mislabel failures as "need 100 EB".
          }
        },
      });
      Grid.render();

      Diamonds.init(map, {
        onCollect: () => { updateTopbar(); showToast("Found a diamond! ◆ +1"); },
        onDenied: () => {},
      });
      Diamonds.setPlayerPosition(currentPos.lat, currentPos.lon);
      // Hoist 3D Character to top of all map layers so it always renders above ground plots!
      if (map.getLayer("3d-player-character")) {
        map.moveLayer("3d-player-character");
      }
    }

    map.on("load", () => {
      setupGameLayers();

      // Atmospheric Horizon Fog (Atlas Earth Style Sky/Horizon Blend)
      try {
        if (map.setFog) {
          map.setFog({
            range: [0.5, 3.5], // Blends the horizon smoothly into clean dark sky
            color: "#080d14",  // Deep midnight obsidian sky
            "horizon-blend": 0.5
          });
        }
      } catch (e) {}
      // Apply 3D buildings if user has 3D style selected
      if ((localStorage.getItem("eldenEarth.mapStyle") || "elden-earth") === "3d") {
        toggle3DBuildings(true);
      }
      // Game layers now exist — apply far-zoom LOD visibility for real
      lastCulledState = null;
      applyMapLod();
    });

    Wheel.init();
    if (typeof Feed !== "undefined") Feed.init();
    if (typeof Leaderboard !== "undefined") Leaderboard.init();
    if (typeof Chat !== "undefined") Chat.init();
    if (typeof Citadels !== "undefined") {
      Citadels.init(map);
      Citadels.setPlayerPosition(currentPos.lat, currentPos.lon); // Immediate GPS sync on boot!
    }
    if (typeof EldenStops !== "undefined") {
      EldenStops.init(map, { 
        onRewards: () => {
          updateTopbar();
          // Award berries when spinning Elden Stops
          if (typeof CompanionPet !== "undefined") {
            const berryCount = Math.floor(Math.random() * 3) + 1; // 1-3 berries per spin
            CompanionPet.addBerries(berryCount);
            showToast(`🍓 +${berryCount} Berries from Elden Stop!`);
          }
        }
      });
      EldenStops.setPlayerPosition(currentPos.lat, currentPos.lon);
    }
    if (typeof WeeklyPool !== "undefined") WeeklyPool.init();
    startIncomeLoop();
    wireUI();

    // --- Battery Saver & Background Sleep Controller (0% Battery in Pocket) ---
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        // Phone screen locked or app backgrounded -> Put game to complete sleep!
        console.log("[Power] Screen locked/backgrounded — Game asleep (0% GPU/CPU).");
      } else {
        // Phone unlocked -> Wake up & calculate accrued offline rent in 0ms!
        console.log("[Power] Screen active — Game resumed.");
        Store.applyOfflineProgress();
        updateTopbar();
        if (typeof Leaderboard !== "undefined" && Leaderboard.fetchRankings) {
          Leaderboard.fetchRankings(true);
        }
      }
    });
  }

  function startIncomeLoop() {
    const earned = Store.applyOfflineProgress();
    const state = Store.get();
    const pName = (state?.player?.name || "").toLowerCase();

    updateTopbar();
    // Automatically claim all territory royalties deposited while offline!
    if (typeof Leaderboard !== "undefined" && Leaderboard.claimPendingDividends) {
      setTimeout(() => Leaderboard.claimPendingDividends(), 2500);
    }

    // High-Performance Ticker: Calculates exact delta & saves locally without network thrashing
    let lastTickTime = Date.now();
    let lastIncomeCloudSave = Date.now();
    let lastLeaderboardRefresh = Date.now();
    setInterval(() => {
      if (document.hidden) return; // Sleep income ticker calculations when app is minimized
      if (typeof Store !== "undefined" && !Store.isSessionActive()) return; // Session paused, stop earning

      if (typeof Citadels !== "undefined") Citadels.checkCapsuleUnlock();
      const now = Date.now();
      const rawDelta = (now - lastTickTime) / 1000;
      
      // Anti-cheat: Reject anomalous tick deltas (speed hack / Date manipulation)
      if (rawDelta < 0.3 || rawDelta > 120) {
        lastTickTime = now;
        return; // Skip this tick entirely
      }
      const deltaSec = Math.min(60, rawDelta); // Cap tick at 60s max
      lastTickTime = now;

      // Always re-read state from Store (broadcast handler may have updated it)
      const state = Store.get();
      if (state.cash === undefined) state.cash = 0;
      if (state.lifetimeRent === undefined) state.lifetimeRent = state.cash;

      const deltaEarned = Store.totalRate() * deltaSec;
      state.cash += deltaEarned;
      state.lifetimeRent += deltaEarned;
      state.lastTick = now;

      // Periodic cloud save every 20 seconds from income loop (also refreshes session lock heartbeat)
      if (now - lastIncomeCloudSave >= 20000) {
        lastIncomeCloudSave = now;
        if (state.sessionLock) state.sessionLock.lockedAt = now;
        Store.save(true);
      }

      // 🔥 CRITICAL: Update 30X/50X button label and countdown timers every second!
      if (typeof Multiplier !== "undefined" && Multiplier.updateUI) {
        Multiplier.updateUI(state);
      }

      // Update Companion Pet HUD (mood decay, berry count)
      if (typeof CompanionPet !== "undefined" && CompanionPet.updatePetHUD) {
        CompanionPet.updatePetHUD();
      }

      updateTopbar();
    }, 1000);
  }

  // ---------------- UI wiring ----------------
  function wireUI() {
    window.addEventListener("openPlayerInfo", (e) => {       const cluster = e.detail?.cluster;       updatePlayerInfoModal(cluster ? cluster[0] : null);       openModal("player-info-modal");     });

    // --- Flying 3D Gem Arc Particle to HUD ---
    function spawnFlyingGemToHUD(startX, startY) {
      launchFlyingGemStream(startX, startY, 1);
    }

    // --- Multi-Gem Flying Diamond Stream Launcher ---
    function launchFlyingGemStream(startX, startY, count) {
      const targetEl = el("stat-diamonds");
      if (!targetEl) return;

      const targetBounds = targetEl.getBoundingClientRect();
      const endX = targetBounds.left + targetBounds.width / 2;
      const endY = targetBounds.top + targetBounds.height / 2;

      const particleCount = Math.min(25, Math.max(1, count));

      for (let i = 0; i < particleCount; i++) {
        setTimeout(() => {
          const spreadX = (Math.random() - 0.5) * 80;
          const spreadY = (Math.random() - 0.5) * 50;

          const gem = document.createElement("div");
          gem.className = "flying-3d-gem";
          gem.style.left = `${startX + spreadX}px`;
          gem.style.top = `${startY + spreadY}px`;
          gem.innerHTML = `
            <svg viewBox="0 0 32 38" style="filter: drop-shadow(0 0 6px rgba(255, 0, 40, 0.8));">
              <polygon points="16,2 29,12 16,16 3,12" fill="#ff6b81"/>
              <polygon points="3,12 16,16 16,36" fill="#8b0000"/>
              <polygon points="29,12 16,16 16,36" fill="#ff1744"/>
              <polygon points="16,2 20,8 16,16 12,8" fill="rgba(255,255,255,0.85)"/>
            </svg>
          `;
          document.body.appendChild(gem);

          requestAnimationFrame(() => {
            const dx = endX - (startX + spreadX);
            const dy = endY - (startY + spreadY);
            gem.style.transform = `translate(${dx}px, ${dy}px) scale(0.4) rotate(${Math.random() * 360}deg)`;
            gem.style.opacity = "0.2";
          });

          setTimeout(() => {
            gem.remove();
            targetEl.classList.remove("hud-impact-bump");
            void targetEl.offsetWidth;
            targetEl.classList.add("hud-impact-bump");
          }, 750);
        }, i * (count > 5 ? 40 : 80));
      }
    }

    // --- Multi-Particle Flying EB Stream Launcher ---
    function launchFlyingEBStream(startX, startY, totalAmount) {
      const targetEl = el("stat-eb");
      if (!targetEl) return;

      const targetBounds = targetEl.getBoundingClientRect();
      const endX = targetBounds.left + targetBounds.width / 2;
      const endY = targetBounds.top + targetBounds.height / 2;

      // Launch individual particles up to total amount (max 50)
      const particleCount = Math.min(50, totalAmount);
      const isJackpot = totalAmount >= 25;

      for (let i = 0; i < particleCount; i++) {
        // Stagger each particle slightly in time & random burst spread
        setTimeout(() => {
          const eb = document.createElement("div");
          eb.className = "flying-eb-coin" + (isJackpot ? " jackpot-spark" : "");
          
          // Random burst jitter from origin
          const spreadX = (Math.random() - 0.5) * (isJackpot ? 120 : 60);
          const spreadY = (Math.random() - 0.5) * (isJackpot ? 120 : 60);
          eb.style.left = `${startX + spreadX}px`;
          eb.style.top = `${startY + spreadY}px`;
          eb.innerHTML = isJackpot
            ? `<img src="assets/eb-coin.png" class="flying-coin-img"><span class="jackpot-lightning">⚡</span>`
            : `<img src="assets/eb-coin.png" class="flying-coin-img">`;
          document.body.appendChild(eb);

          requestAnimationFrame(() => {
            const dx = endX - (startX + spreadX);
            const dy = endY - (startY + spreadY);
            eb.style.transform = `translate(${dx}px, ${dy}px) scale(0.45) rotate(${Math.random() * 360}deg)`;
            eb.style.opacity = "0.15";
          });

          setTimeout(() => {
            eb.remove();
            targetEl.classList.remove("hud-impact-bump");
            void targetEl.offsetWidth;
            targetEl.classList.add("hud-impact-bump");
          }, 750);
        }, i * (totalAmount > 10 ? 25 : 80)); // Fast machine-gun cascade for 50 EB
      }
    }

    // --- 30-Day Daily Login Calendar System (Tamper-Proof 20-Hour Cooldown) ---
    function getCalendarState() {
      const state = Store.get();
      if (!state.calendar) {
        state.calendar = {
          claimedDays: 0,       // Exact count of days claimed (0 to 30)
          lastClaimTime: 0,     // Timestamp of last claim
          lastClaimDate: null   // Legacy migration support
        };
      }
      // Migrate legacy formats
      if (state.calendar.currentDay !== undefined && state.calendar.claimedDays === undefined) {
        state.calendar.claimedDays = Math.max(0, state.calendar.currentDay - 1);
        delete state.calendar.currentDay;
      }
      // Migrate old date-string format to timestamp if present
      if (state.calendar.lastClaimDate && !state.calendar.lastClaimTime) {
        state.calendar.lastClaimTime = new Date(state.calendar.lastClaimDate).getTime() || Date.now();
      }
      return state.calendar;
    }

    function isRewardReady() {
      const cal = getCalendarState();
      if (!cal.lastClaimTime) return true;
      const HOURS_20 = 20 * 3600 * 1000; // 20 hours minimum between claims
      return (Date.now() - cal.lastClaimTime) >= HOURS_20;
    }

    function updateCalendarHUD() {
      const cal = getCalendarState();
      const ready = isRewardReady();

      const now = new Date();
      const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
      if (el("cal-hud-month")) el("cal-hud-month").textContent = months[now.getMonth()];
      if (el("cal-hud-day")) el("cal-hud-day").textContent = now.getDate();

      const unreadDot = el("calendar-unread-dot");
      if (unreadDot) {
        if (ready && (cal.claimedDays || 0) < 30) {
          unreadDot.classList.remove("hidden");
        } else {
          unreadDot.classList.add("hidden");
        }
      }
    }

    function renderCalendarModal() {
      const list = el("calendar-days-list");
      if (!list) return;
      list.innerHTML = "";

      const cal = getCalendarState();
      const ready = isRewardReady();
      const claimedCount = cal.claimedDays || 0;
      const rewards = CONFIG.DAILY_CALENDAR_REWARDS || [];

      rewards.forEach((r) => {
        const dayNum = r.day;
        const isAlreadyClaimed = dayNum <= claimedCount;
        const isReadyToClaim = (dayNum === claimedCount + 1) && ready;
        const isLockedTomorrow = (dayNum === claimedCount + 1) && !ready;
        const isFutureLocked = dayNum > claimedCount + 1;

        // Check if day has diamonds
        const diamondText = r.diamonds ? ` & +${r.diamonds} ◆` : "";
        const rewardLabel = `+${r.eb} EB${diamondText}`;

        const row = document.createElement("div");
        row.className = "cal-day-row" + (isReadyToClaim ? " active" : "") + (isAlreadyClaimed ? " claimed" : "") + (isLockedTomorrow || isFutureLocked ? " locked" : "");

        let actionHtml = "";
        if (isAlreadyClaimed) {
          actionHtml = `<span class="cal-status-claimed">✓ Claimed</span>`;
        } else if (isReadyToClaim) {
          actionHtml = `<button class="cal-claim-btn" id="claim-day-${dayNum}">Claim ${rewardLabel}</button>`;
        } else if (isLockedTomorrow) {
          const remainingMs = Math.max(0, (cal.lastClaimTime + (20 * 3600 * 1000)) - Date.now());
          const remHrs = Math.floor(remainingMs / 3600000);
          const remMins = Math.floor((remainingMs % 3600000) / 60000);
          actionHtml = `<span class="cal-status-locked" style="color:var(--teal);opacity:0.85;">⏳ ${remHrs}h ${remMins}m</span>`;
        } else {
          actionHtml = `<span class="cal-status-locked">🔒 Day ${dayNum}</span>`;
        }

        row.innerHTML = `
          <div class="cal-day-left">
            <span class="cal-day-badge">Day ${dayNum}</span>
            <span class="cal-reward-amount">${rewardLabel}</span>
          </div>
          <div class="cal-day-right">
            ${actionHtml}
          </div>
        `;

        list.appendChild(row);

        if (isReadyToClaim) {
          const claimBtn = row.querySelector(".cal-claim-btn");
          claimBtn?.addEventListener("click", () => {
            const rect = claimBtn.getBoundingClientRect();
            claimDailyReward(r.eb, r.diamonds || 0, rect.left + rect.width / 2, rect.top + rect.height / 2);
          });
        }
      });
    }

    async function claimDailyReward(ebAmount, diamondAmount, clickX, clickY) {
      // Session lock: block if paused
      if (typeof Store !== "undefined" && !Store.isSessionActive()) {
        showToast("🔒 Account active on another tab. Close the other tab first.", 4000);
        return;
      }

      // Anti-cheat: Embargo check
      if (typeof AntiCheat !== "undefined") {
        const check = AntiCheat.isActionAllowed("earn");
        if (!check.allowed) { showToast(check.reason, 5000); return; }
      }

      const state = Store.get();
      const cal = getCalendarState();

      if (!isRewardReady()) return; // Strict 20h cooldown guard

      if (typeof firebase === "undefined" || !firebase.functions) {
        showToast("⚠️ Server connection required to claim daily rewards.", 4000);
        return;
      }

      let serverResult;
      try {
        const claimDailyReward = firebase.functions().httpsCallable("claimDailyReward");
        serverResult = (await claimDailyReward()).data;
      } catch (err) {
        console.warn("[Calendar] Server claim failed:", err);
        showToast("⚠️ Daily reward could not be verified. Try again.", 4000);
        return;
      }
      if (!serverResult?.claimed) {
        if (serverResult?.reason === "cooldown") showToast("⏳ Daily reward is still on cooldown.", 3500);
        return;
      }

      const totalEB = serverResult.eb;
      cal.lastClaimTime = serverResult.calendar.lastClaimTime;
      cal.claimedDays = serverResult.calendar.claimedDays;
      cal.lastClaimDate = serverResult.calendar.lastClaimDate;
      state.dailyQuests = serverResult.dailyQuests;
      state.eb = serverResult.nextEb;
      state.diamonds = serverResult.nextDiamonds;
      Store.save(true);

      updateTopbar();
      updateCalendarHUD();

      // Trigger visual particles with full EB amount to the sub stat bar
      launchFlyingEBStream(clickX, clickY, totalEB);
      if (diamondAmount > 0) {
        setTimeout(() => launchFlyingGemStream(clickX, clickY, diamondAmount), 300);
      }
      
      const diaToast = serverResult.diamonds > 0 ? ` & +${serverResult.diamonds} Diamonds` : "";
      const questMsg = serverResult.eb > ebAmount ? ` (+${serverResult.eb - ebAmount} EB Quest Bonus)` : "";
      showToast(`🎉 Claimed +${totalEB} EB${questMsg}${diaToast} Daily Reward!`);

      // Broadcast login streak
      if (typeof Feed !== "undefined") {
        Feed.broadcast("daily", { day: cal.claimedDays });
      }

      // Re-render modal to show "✓ Claimed" and countdown
      renderCalendarModal();
      renderDailyQuests();

      setTimeout(() => {
        closeModal("calendar-modal");
      }, 650);
    }

    const QUEST_DEFS = [
      { id: "login", title: "Claim daily login bonus", reward: 5, rewardText: "+5 EB", action: "login" },
      { id: "wheel", title: "Spin the Diamond Wheel", reward: 10, rewardText: "+10 EB", action: "wheel" },
      { id: "gift", title: "Send a gift to a friend", reward: 10, rewardText: "+10 EB", action: "gift" },
      { id: "mayor", title: "Check Mayorship & Dividends", reward: 5, rewardText: "+5 EB", action: "mayor" },
      { id: "survey", title: "Explore & survey 1 new area", reward: 15, rewardText: "+15 EB", action: "survey" }
    ];

    function getDailyQuestsState() {
      const state = Store.get();
      if (!state) return { date: "", quests: {} };
      const today = new Date().toISOString().slice(0, 10);
      if (!state.dailyQuests || state.dailyQuests.date !== today) {
        state.dailyQuests = {
          date: today,
          quests: {
            login: { completed: false, claimed: false },
            wheel: { completed: false, claimed: false },
            gift: { completed: false, claimed: false },
            mayor: { completed: false, claimed: false },
            survey: { completed: false, claimed: false }
          }
        };
      }
      QUEST_DEFS.forEach(q => {
        if (!state.dailyQuests.quests[q.id]) {
          state.dailyQuests.quests[q.id] = { completed: false, claimed: false };
        }
      });
      // If calendar reward was claimed, ensure login quest is marked completed
      const cal = getCalendarState();
      if (cal && cal.claimedDays > 0) {
        state.dailyQuests.quests.login.completed = true;
      }
      return state.dailyQuests;
    }

    function completeDailyQuest(questId) {
      const qState = getDailyQuestsState();
      if (qState.quests[questId] && !qState.quests[questId].completed) {
        qState.quests[questId].completed = true;
        Store.save(true);
        renderDailyQuests();
      }
    }
    window.completeDailyQuest = completeDailyQuest;

    async function claimQuestReward(questId, startX, startY) {
      if (typeof Store !== "undefined" && !Store.isSessionActive()) {
        showToast("🔒 Account active on another tab. Close the other tab first.", 4000);
        return;
      }
      const qState = getDailyQuestsState();
      const itemState = qState.quests[questId];
      if (!itemState || !itemState.completed || itemState.claimed) return;

      const qDef = QUEST_DEFS.find(q => q.id === questId);
      if (!qDef) return;

      if (typeof ServerAntiCheat === "undefined" || !ServerAntiCheat.isReady()) {
        showToast("⚠️ Server connection required to claim quest reward.", 3500);
        return;
      }

      const result = await ServerAntiCheat.claimQuestReward(questId);
      if (!result.claimed) {
        if (result.reason === "not_ready") {
          showToast("⚠️ Quest not ready or already claimed.", 3500);
        } else {
          showToast("⚠️ Quest claim could not be verified.", 3500);
        }
        return;
      }

      const state = Store.get();
      state.eb = result.nextEb;
      state.dailyQuests = result.dailyQuests;
      Store.save(true);
      updateTopbar();

      const originX = (typeof startX === "number" && startX > 0) ? startX : window.innerWidth / 2;
      const originY = (typeof startY === "number" && startY > 0) ? startY : window.innerHeight / 2;
      launchFlyingEBStream(originX, originY, result.reward);

      showToast(`🎉 Quest Claimed! +${result.reward} EB added to balance!`);
      renderDailyQuests();
    }
    window.claimQuestReward = claimQuestReward;

    function renderDailyQuests() {
      const questList = el("calendar-quest-list");
      if (!questList) return;

      const qState = getDailyQuestsState();

      questList.innerHTML = QUEST_DEFS.map(q => {
        const item = qState.quests[q.id] || { completed: false, claimed: false };
        let actionHtml = "";
        if (item.claimed) {
          actionHtml = `<div class="quest-check done" title="Claimed">✓</div>`;
        } else if (item.completed) {
          actionHtml = `<button class="cal-claim-btn quest-claim-btn" data-quest-id="${q.id}">Claim ${q.rewardText}</button>`;
        } else {
          actionHtml = `<div class="quest-check">○</div>`;
        }

        return `
          <div class="calendar-quest-item ${item.completed && !item.claimed ? 'ready-claim' : ''}" data-quest-id="${q.id}" style="${!item.completed || !item.claimed ? 'cursor:pointer;' : ''}">
            <div>
              <div class="quest-title">${q.title}</div>
              <div class="quest-reward">${q.rewardText}</div>
            </div>
            <div class="quest-action-slot">
              ${actionHtml}
            </div>
          </div>
        `;
      }).join("");

      // Wire up claim buttons
      questList.querySelectorAll(".quest-claim-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const qId = btn.getAttribute("data-quest-id");
          const rect = btn.getBoundingClientRect();
          claimQuestReward(qId, rect.left + rect.width / 2, rect.top + rect.height / 2);
        });
      });

      // Allow clicking uncompleted quests to navigate directly to their action
      questList.querySelectorAll(".calendar-quest-item").forEach(row => {
        row.addEventListener("click", (e) => {
          if (e.target.closest(".quest-claim-btn")) return;
          const qId = row.getAttribute("data-quest-id");
          const item = qState.quests[qId];
          if (item && item.completed && !item.claimed) {
            const rect = row.getBoundingClientRect();
            claimQuestReward(qId, rect.left + rect.width / 2, rect.top + rect.height / 2);
            return;
          }
          if (item && !item.completed) {
            closeModal("calendar-modal");
            if (qId === "login") {
              openModal("calendar-modal");
              document.querySelector('[data-calendar-tab="rewards"]')?.click();
            } else if (qId === "wheel") {
              openModal("wheel-modal");
            } else if (qId === "gift") {
              updatePlayerInfoModal();
              openModal("player-info-modal");
              document.querySelector('[data-pi-tab="friends"]')?.click();
            } else if (qId === "mayor") {
              updatePlayerInfoModal();
              openModal("player-info-modal");
              completeDailyQuest("mayor");
            } else if (qId === "survey") {
              closeModal("calendar-modal");
              if (typeof toggleBuyMode === "function") toggleBuyMode(true);
              showToast("🗺️ Walk or tap an unclaimed parcel to claim land!");
            }
          }
        });
      });
    }

    // Calendar & Quests Tab Switcher
    document.querySelectorAll(".calendar-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".calendar-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        const target = tab.getAttribute("data-calendar-tab");
        const rewardsPanel = el("calendar-rewards-panel");
        const questsPanel = el("calendar-quests-panel");
        if (target === "quests") {
          rewardsPanel?.classList.add("hidden");
          rewardsPanel?.classList.remove("active");
          questsPanel?.classList.remove("hidden");
          questsPanel?.classList.add("active");
          renderDailyQuests();
        } else {
          questsPanel?.classList.add("hidden");
          questsPanel?.classList.remove("active");
          rewardsPanel?.classList.remove("hidden");
          rewardsPanel?.classList.add("active");
          renderCalendarModal();
        }
      });
    });
    
    el("calendar-btn")?.addEventListener("click", () => {
      renderCalendarModal();
      renderDailyQuests();
      openModal("calendar-modal");
    });

    updateCalendarHUD();

    // --- 3D Character Wardrobe Selector ---
    function renderWardrobe() {
      const grid = el("wardrobe-grid");
      if (!grid) return;
      grid.innerHTML = "";

      const state = Store.get();
      const currentModelId = state?.player?.model3d || "soldier";
      const characters = CONFIG.AVAILABLE_CHARACTERS || [];

      characters.forEach((char) => {
        const isSelected = char.id === currentModelId;
        const card = document.createElement("div");
        card.className = "wardrobe-card" + (isSelected ? " selected" : "");
        card.innerHTML = `
          <span class="char-icon">${char.icon || "👤"}</span>
          <span class="char-name">${char.name}</span>
          <span class="char-status">${isSelected ? "EQUIPPED" : "Equip"}</span>
        `;

        card.addEventListener("click", () => {
          if (typeof Character3D !== "undefined" && Character3D.changeCharacter) {
            Character3D.changeCharacter(char.id);
            showToast(`Equipped ${char.name}!`);
          }
          closeModal("wardrobe-modal");
          updatePlayerInfoModal();
        });

        grid.appendChild(card);
      });
    }

    // Open Wardrobe on Avatar Pencil Tap
    el("edit-avatar-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      renderWardrobe();
      openModal("wardrobe-modal");
    });

    // Rename Player on Name Pencil Tap (With Unique Name Registry & "Vic" Lock)
    el("edit-name-btn")?.addEventListener("click", async () => {
      const state = Store.get();
      const db = Store.getDb();
      const currentName = state?.player?.name || "Traveler";
      const myId = state?.player?.id;

      const newName = prompt("Choose your unique realm name (2–16 characters):", currentName);
      if (!newName) return;
      const cleanName = newName.trim().slice(0, 16);
      if (cleanName.length < 2 || cleanName === currentName) return;

      // Server-side validation (profanity filter + strike system)
      if (typeof ServerAntiCheat !== "undefined" && ServerAntiCheat.isReady()) {
        try {
          const result = await ServerAntiCheat.validateUsername(cleanName);
          
          if (!result.valid) {
            if (result.banned) {
              showToast(`⛔ ${result.reason}`, 5000);
              setTimeout(() => window.location.reload(), 3000);
              return;
            }
            if (result.nameReset) {
              showToast(` ${result.reason}`, 4000);
              if (typeof Store.syncFromCloud === "function") {
                await Store.syncFromCloud();
                updateTopbar();
                updatePlayerInfoModal();
              }
              return;
            }
            showToast(`⚠️ ${result.reason}`, 3500);
            return;
          }

          state.player.name = result.name;
          Store.save(true);
          updateTopbar();
          updatePlayerInfoModal();
          showToast(`Name updated to "${result.name}"!`);
        } catch (err) {
          console.warn("[Name] Server validation failed:", err);
          showToast("️ Name change unavailable. Try again.", 3000);
          return;
        }
      } else {
        // Fallback: client-side validation only
        const lowerName = cleanName.toLowerCase();
        const reservedSystemNames = ["vic", "admin", "developer", "system", "moderator", "official"];
        if (reservedSystemNames.includes(lowerName)) {
          showToast(`⛔ The handle "${cleanName}" is a reserved developer handle and cannot be claimed.`, 4000);
          return;
        }

        if (db && myId) {
          try {
            const nameDoc = await db.collection("usernames").doc(lowerName).get();
            if (nameDoc.exists) {
              const existingOwner = nameDoc.data().uid;
              if (existingOwner && existingOwner !== myId) {
                showToast(`⚠️ The name "${cleanName}" is already taken by another player. Please pick a unique name!`, 4000);
                return;
              }
            }

            await db.collection("usernames").doc(lowerName).set({
              uid: myId,
              name: cleanName,
              updatedAt: Date.now()
            });

            if (currentName && currentName !== "Traveler" && currentName.toLowerCase() !== lowerName) {
              db.collection("usernames").doc(currentName.toLowerCase()).delete().catch(() => {});
            }
          } catch (err) {
            console.warn("[Registry] Username check notice:", err);
          }
        }

        state.player.name = cleanName;
        Store.save(true);
        updateTopbar();
        updatePlayerInfoModal();
        showToast(`Name updated to "${cleanName}"!`);
      }

      // 4. Broadcast name change to all owned plots in Firestore so other players see it
      if (db && myId && state.plots) {
        try {
          const batch = db.batch();
          const snap = await db.collection("plots").where("ownerId", "==", myId).get();
          snap.forEach((doc) => {
            batch.update(doc.ref, { ownerName: cleanName });
          });
          await batch.commit();

          if (typeof Grid !== "undefined" && Grid.render) {
            for (const tid in state.plots) {
              if (state.plots[tid].ownerId === myId) {
                state.plots[tid].ownerName = cleanName;
              }
            }
            Grid.render();
          }
        } catch (err) {
          console.warn("[Multiplayer] Error updating name across plots:", err);
        }
      }
    });

    // 1. Remote Citadel Recall
    el("remote-recall-citadel-btn")?.addEventListener("click", () => {
      const activeCit = typeof Citadels !== "undefined" ? Citadels.getMyCitadel() : null;
      if (activeCit && typeof Citadels !== "undefined") {
        Citadels.relocateCitadel(activeCit.id);
        closeModal("player-info-modal");
      }
    });

    // 1b. Player Info Modal Tab Switching
    document.querySelectorAll(".pi-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        const target = tab.dataset.piTab;
        document.querySelectorAll(".pi-tab").forEach(t => t.classList.remove("active"));
        document.querySelectorAll(".pi-tab-panel").forEach(p => p.classList.remove("active"));
        tab.classList.add("active");
        const panel = document.querySelector(`[data-pi-panel="${target}"]`);
        if (panel) panel.classList.add("active");
      });
    });

    // --- Companion Pet UI Handlers ---
    el("pet-hud-btn")?.addEventListener("click", () => {
      if (typeof CompanionPet !== "undefined") {
        CompanionPet.openPetModal();
      }
    });

    el("pet-feed-btn")?.addEventListener("click", () => {
      if (typeof CompanionPet !== "undefined") {
        CompanionPet.feedBerry();
      }
    });

    el("pet-rename-btn")?.addEventListener("click", () => {
      if (typeof CompanionPet !== "undefined") {
        CompanionPet.renamePet();
      }
    });

    // 1c. Avatar Tap to Upload — triggers hidden file input
    el("avatar-upload-trigger")?.addEventListener("click", () => {
      const state = Store.get();
      if (state.player?.avatarUploaded) {
        showToast("🔒 Custom photo already uploaded.", 3000);
        return;
      }
      el("avatar-file-input")?.click();
    });

    // 2. Client-Side Canvas 96x96 Photo Resizer (Zero Storage Cost)
    const avatarInput = el("avatar-file-input");

    avatarInput?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          // Off-screen Canvas Resizer: Downsamples to lightweight 96x96 thumbnail
          const canvas = document.createElement("canvas");
          canvas.width = 96;
          canvas.height = 96;
          const ctx = canvas.getContext("2d");

          // Center Crop to Square
          const minSide = Math.min(img.width, img.height);
          const sx = (img.width - minSide) / 2;
          const sy = (img.height - minSide) / 2;
          ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, 96, 96);

          // Convert to Blob for Firebase Storage upload
          canvas.toBlob(async (blob) => {
            if (!blob) return;
            const state = Store.get();
            const userId = state.player?.id;
            if (!userId) return;

            try {
              // Upload to Firebase Storage
              const storageRef = firebase.storage().ref();
              const avatarRef = storageRef.child(`avatars/${userId}.jpg`);
              await avatarRef.put(blob, { contentType: "image/jpeg" });
              const downloadURL = await avatarRef.getDownloadURL();

              // Update player state with Storage URL
              state.player.pendingAvatar = "img:" + downloadURL;
              state.player.avatarStatus = "pending";
              state.player.avatarUploaded = true;
              Store.save(true);

              // Queue to Firestore for safety moderation
              const db = Store.getDb();
              if (db) {
                await db.collection("avatar_reviews").doc(userId).set({
                  userId,
                  userName: state.player.name || "Traveler",
                  avatarData: "img:" + downloadURL,
                  submittedAt: Date.now(),
                  status: "pending"
                });
              }

              updatePlayerInfoModal();
              showToast("📷 Photo submitted! Pending community safety review.", 4000);
            } catch (uploadErr) {
              console.warn("[Avatar] Upload error:", uploadErr);
              showToast("⚠️ Upload failed. Please try again.", 3000);
            }
          }, "image/jpeg", 0.82);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });

    // 3. Cinematic "Bird's Eye View" — Globe Zoom with Anonymized Territories
    let isBirdsEye = false;

    function enterBirdsEye() {
      if (isBirdsEye || !map || !currentPos) return;
      isBirdsEye = true;
      document.body.classList.add("birds-eye-mode");

      // Bird's Eye keeps landplot tiles visible (player wants ONLY the plot
      // squares on screen when zoomed all the way out — no billboards/3D).
      // Empty buy-grid is irrelevant at globe zoom.
      ["empty-grid-fill", "empty-grid-line"].forEach(id => {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
      });
      applyBirdsEyeLayerVisibility();

      // Build anonymized territory fills from ALL plots (grouped by state)
      const state = Store.get();
      const plots = state.plots || {};
      const stateGroups = {};

      for (const tid in plots) {
        const p = plots[tid];
        const stateKey = (p.state || "").replace(/\s+/g, " ").trim();
        if (!stateKey || stateKey === "Unknown State") continue;
        if (!stateGroups[stateKey]) stateGroups[stateKey] = [];
        const ts = CONFIG.TILE_SIZE_METERS || 6.096;
        const bounds = Geo.tileBounds(Number(p.tx), Number(p.ty), ts);
        stateGroups[stateKey].push(bounds);
      }

      const territoryFeatures = [];
      for (const stateKey in stateGroups) {
        const tiles = stateGroups[stateKey];
        let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
        for (const b of tiles) {
          minLat = Math.min(minLat, b[0][0], b[3][0]);
          maxLat = Math.max(maxLat, b[1][0], b[2][0]);
          minLon = Math.min(minLon, b[0][1], b[1][1]);
          maxLon = Math.max(maxLon, b[2][1], b[3][1]);
        }
        // Pad the bounding box for visibility at low zoom
        const padLat = (maxLat - minLat) * 0.3 + 0.05;
        const padLon = (maxLon - minLon) * 0.3 + 0.05;
        minLat -= padLat; maxLat += padLat;
        minLon -= padLon; maxLon += padLon;

        territoryFeatures.push({
          type: "Feature",
          properties: { state: stateKey, count: tiles.length },
          geometry: {
            type: "Polygon",
            coordinates: [[
              [minLon, minLat], [maxLon, minLat], [maxLon, maxLat], [minLon, maxLat], [minLon, minLat]
            ]]
          }
        });
      }

      if (territoryFeatures.length > 0 && !map.getSource("territory-overview-source")) {
        map.addSource("territory-overview-source", {
          type: "geojson",
          data: { type: "FeatureCollection", features: territoryFeatures }
        });
        map.addLayer({
          id: "territory-overview-fill",
          type: "fill",
          source: "territory-overview-source",
          paint: {
            "fill-color": "#5a6a7a",
            "fill-opacity": 0.25,
          }
        }, "plots-grass-base");
        map.addLayer({
          id: "territory-overview-line",
          type: "line",
          source: "territory-overview-source",
          paint: {
            "line-color": "#8892a2",
            "line-width": 1.5,
            "line-opacity": 0.5,
          }
        }, "plots-grass-base");
      } else if (map.getSource("territory-overview-source")) {
        map.getSource("territory-overview-source").setData({
          type: "FeatureCollection", features: territoryFeatures
        });
      }

      // Fly to globe view
      map.flyTo({
        center: [currentPos.lon, currentPos.lat],
        zoom: 3,
        pitch: 0,
        bearing: 0,
        duration: 2500,
        essential: true
      });

      showToast("🦅 Bird's Eye — Globe View", 3500);
      showExitBirdsEye();
    }

    function exitBirdsEye() {
      if (!isBirdsEye || !map || !currentPos) return;
      isBirdsEye = false;
      document.body.classList.remove("birds-eye-mode");
      // Kill the exit control first so a later cleanup error can't strand it on the main HUD.
      hideExitBirdsEye();

      try {
        // Remove territory overview layers
        if (map.getLayer("territory-overview-line")) map.removeLayer("territory-overview-line");
        if (map.getLayer("territory-overview-fill")) map.removeLayer("territory-overview-fill");
        if (map.getSource("territory-overview-source")) map.removeSource("territory-overview-source");

        // Restore layers from current toggle prefs (applyMapLod is out of scope here)
        ["empty-grid-fill", "empty-grid-line", "3d-buildings"].forEach(id => {
          if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "visible");
        });
        applyBirdsEyeLayerVisibility();
      } catch (err) {
        console.warn("[Bird's Eye] exit cleanup:", err);
      }

      // Smooth fly back to player
      map.flyTo({
        center: [currentPos.lon, currentPos.lat],
        zoom: 18.5,
        pitch: 70,
        bearing: 0,
        duration: 2000,
        essential: true
      });

      showToast("📍 Back to your location", 2500);
    }

    // ---- Permanent View hub (collapse + toggles) ----
    const BE_KEYS = ["player", "diamonds", "mine", "citadel", "foliage", "stops", "plots"];

    document.getElementById("be-hub-header")?.addEventListener("click", () => {
      const hub = document.getElementById("be-visibility-hub");
      if (!hub) return;
      const open = hub.classList.toggle("is-open");
      document.getElementById("be-hub-header")?.setAttribute("aria-expanded", open ? "true" : "false");
    });

    const beHub = document.getElementById("be-visibility-hub");
    if (beHub) {
      beHub.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: true });
      beHub.addEventListener("touchmove", (e) => e.stopPropagation(), { passive: true });
      beHub.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });
    }

    function resetBirdsEyeToggles() {
      document.querySelectorAll(".be-toggle").forEach(cb => {
        cb.checked = true;
      });
      BE_KEYS.forEach(k => document.body.classList.remove("be-off-" + k));
      applyBirdsEyeLayerVisibility();
    }

    function syncBirdsEyeToggleClasses() {
      document.querySelectorAll(".be-toggle").forEach(cb => {
        const key = cb.dataset.be;
        if (!key) return;
        document.body.classList.toggle("be-off-" + key, !cb.checked);
      });
    }

    document.querySelectorAll(".be-toggle").forEach(cb => {
      cb.addEventListener("change", () => {
        syncBirdsEyeToggleClasses();
        applyBirdsEyeLayerVisibility();
      });
    });

    function showExitBirdsEye() {
      let exitBtn = document.getElementById("exit-birds-eye-btn");
      if (!exitBtn) {
        exitBtn = document.createElement("button");
        exitBtn.id = "exit-birds-eye-btn";
        exitBtn.type = "button";
        exitBtn.textContent = "✕ Exit Bird's Eye";
        exitBtn.addEventListener("click", exitBirdsEye);
        document.body.appendChild(exitBtn);
      }
      exitBtn.classList.remove("hidden");
    }

    function hideExitBirdsEye() {
      const exitBtn = document.getElementById("exit-birds-eye-btn");
      if (exitBtn) exitBtn.remove();
    }

    el("birds-eye-trigger-btn")?.addEventListener("click", () => {
      closeModal("player-info-modal");
      enterBirdsEye();
    });
    // --- Diamond Extractor Dynamic Level Math (2-min base, up to 50 gems) ---
    function getExtractorStats(level = 1) {
      const baseInterval = CONFIG.EXTRACTOR_INTERVAL_MS || 600000; // 10 mins (600,000ms)
      const timeUpgrades = Math.floor((level - 1) / 2);
      const storageUpgrades = Math.floor(level / 2);

      // 0.0001% safe time reduction per time upgrade
      const interval = baseInterval * Math.pow(1 - 0.000001, timeUpgrades);
      const maxStored = (CONFIG.EXTRACTOR_MAX_STORED || 50) + storageUpgrades;
      const nextCost = level * 1.0; // $1.00, $2.00, $3.00...
      const nextIsCapacity = level % 2 === 1;

      return { interval, maxStored, nextCost, nextIsCapacity };
    }

    function checkExtractorTick() {
      if (document.hidden) return; // Battery Saver: 0% CPU while phone in pocket

      const state = Store.get();
      if (!state.extractor) state.extractor = { built: false, level: 1, lastHarvest: Date.now(), stored: 0 };
      if (!state.extractor.built) return;

      const lvl = state.extractor.level || 1;
      const { interval, maxStored, nextCost, nextIsCapacity } = getExtractorStats(lvl);

      const now = Date.now();
      const baseLastHarvest = Number(state.extractor.lastHarvest) || now;
      const timeSince = now - baseLastHarvest;
      const readyCount = Math.floor(timeSince / interval);

      // SERVER-AUTHORITATIVE: Don't modify lastHarvest or stored — they get synced to cloud.
      // Compute display values locally only. Server recomputes stored in collectExtractor.
      const displayStored = Math.min(maxStored, readyCount);
      const displayLastHarvest = readyCount > 0 ? now - (timeSince % interval) : baseLastHarvest;

      // Live UI Updates
      const remainingMs = Math.max(0, interval - (now - displayLastHarvest));
      const hrs = Math.floor(remainingMs / 3600000);
      const mins = Math.floor((remainingMs % 3600000) / 60000);
      const secs = Math.floor((remainingMs % 60000) / 1000);

      if (el("extractor-lvl-badge")) el("extractor-lvl-badge").textContent = `Level ${lvl}`;
      if (el("extractor-next-timer")) el("extractor-next-timer").textContent = `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
      if (el("extractor-stored-count")) el("extractor-stored-count").innerHTML = `${displayStored} / ${maxStored} <span class="hud-gem-icon"></span>`;
      if (el("extractor-next-perk")) el("extractor-next-perk").textContent = nextIsCapacity ? "Next: +1 Max Diamond Capacity" : "Next: -0.0001% Mining Time";
      
      // $1.00 Unlock Condition Check
      const upgradeBtn = el("upgrade-extractor-btn");
      const lockNotice = el("extractor-locked-notice");
      const hasReachedOneDollar = (Number(state.cash) || 0) >= 1.00 || lvl > 1;

      if (upgradeBtn && lockNotice) {
        if (hasReachedOneDollar) {
          upgradeBtn.style.display = "block";
          upgradeBtn.textContent = `⚡ Upgrade ($${nextCost.toFixed(2)})`;
          lockNotice.classList.add("hidden");
        } else {
          upgradeBtn.style.display = "none";
          lockNotice.classList.remove("hidden");
        }
      }

      if (el("collect-extractor-btn")) {
        el("collect-extractor-btn").innerHTML = `Collect All (${displayStored} <span class="hud-gem-icon"></span>)`;
        el("collect-extractor-btn").disabled = displayStored === 0;
      }

      // Live Update Extractor Side HUD Button & Red Notification Dot
      const extractorHudBtn = el("extractor-hud-btn");
      const extractorRedDot = el("extractor-unread-dot");

      if (extractorHudBtn) {
        if (state.extractor.built) {
          extractorHudBtn.classList.remove("hidden");
          if (extractorRedDot) {
            if (displayStored > 0) {
              extractorRedDot.classList.remove("hidden");
            } else {
              extractorRedDot.classList.add("hidden");
            }
          }
        } else {
          extractorHudBtn.classList.add("hidden");
        }
      }
    }

    function openExtractorModal() {
      const state = Store.get();
      if (!state.extractor) state.extractor = { built: false, lastHarvest: Date.now(), stored: 0 };

      if (!state.extractor.built) {
        el("extractor-unbuilt-view")?.classList.remove("hidden");
        el("extractor-active-view")?.classList.add("hidden");
      } else {
        el("extractor-unbuilt-view")?.classList.add("hidden");
        el("extractor-active-view")?.classList.remove("hidden");
        checkExtractorTick();
      }
      openModal("extractor-modal");
    }

    window.addEventListener("openExtractorModal", openExtractorModal);

    // Tap Quick Extractor Button to Open Modal
    el("extractor-hud-btn")?.addEventListener("click", openExtractorModal);

    // Upgrade Extractor Button (Spends Cash Balance)
    el("upgrade-extractor-btn")?.addEventListener("click", () => {
      const state = Store.get();
      if (!state.extractor || !state.extractor.built) return;

      const lvl = state.extractor.level || 1;
      const { nextCost } = getExtractorStats(lvl);

      if ((state.cash || 0) < nextCost) {
        showToast(`You need $${nextCost.toFixed(2)} in Cash Balance to upgrade.`);
        return;
      }

      state.cash -= nextCost;
      state.extractor.level = lvl + 1;
      Store.save(true);
      updateTopbar();
      showToast(`⚡ Extractor Upgraded to Level ${lvl + 1}!`);
      checkExtractorTick();
    });

    // Build Extractor Button
    el("build-extractor-btn")?.addEventListener("click", () => {
      const state = Store.get();
      const cost = CONFIG.EXTRACTOR_BUILD_COST_EB || 50;
      if (state.eb < cost) {
        showToast(`You need ${cost} EB to construct the Extractor.`);
        return;
      }
      state.eb -= cost;
      if (!state.extractor) state.extractor = { level: 1 };
      state.extractor.built = true;
      state.extractor.level = 1;
      state.extractor.lastHarvest = Date.now();
      state.extractor.stored = 0;
      Store.save(true);
      updateTopbar();

      // Immediately render 3D Extractor Beacon on map
      if (typeof Grid !== "undefined" && Grid.render) {
        Grid.render();
      }

      showToast("💎 Diamond Extractor Constructed!");
      openExtractorModal();
    });

    // Collect Diamonds Button with Multi-Gem Particle Shower & Auto-Close
    const collectExtBtn = el("collect-extractor-btn");
    if (collectExtBtn) {
      collectExtBtn.addEventListener("click", async (e) => {
        const state = Store.get();
        const now = Date.now();
        const lvl = Number(state.extractor && state.extractor.level) || 1;
        const stats = getExtractorStats(lvl);
        const ready = Math.floor((now - (Number(state.extractor && state.extractor.lastHarvest) || now)) / stats.interval);
        if (!state.extractor || ready <= 0) return;

        if (typeof ServerAntiCheat === "undefined" || !ServerAntiCheat.isReady()) {
          showToast("⚠️ Server connection required to collect diamonds.", 3500);
          return;
        }

        const rect = collectExtBtn.getBoundingClientRect();
        const originX = rect.left + rect.width / 2;
        const originY = rect.top + rect.height / 2;

        const result = await ServerAntiCheat.collectExtractor();
        if (!result.collected) {
          if (result.reason === "nothing_stored") {
            showToast("💎 Nothing to collect yet!", 2500);
          } else {
            showToast("⚠️ Collect could not be verified.", 3500);
          }
          return;
        }

        state.diamonds = result.nextDiamonds;
        const timeSince = now - (Number(state.extractor.lastHarvest) || now);
        state.extractor.lastHarvest = now - (timeSince % stats.interval);
        state.extractor.stored = 0;
        Store.save(true);
        updateTopbar();
        showToast(`💎 Collected ${result.count} Diamond${result.count > 1 ? "s" : ""} from Extractor!`);
        checkExtractorTick();

        // Launch flying diamonds straight into top HUD Diamonds counter!
        launchFlyingGemStream(originX, originY, result.count);

        // Auto-close Extractor modal after short celebration delay
        setTimeout(() => {
          closeModal("extractor-modal");
        }, 250);
      });
    }

    // Check extractor every 2 seconds
    setInterval(checkExtractorTick, 2000);
    // --- Global Multiplier & +2EB Boost Wiring (Delegated to Multiplier module) ---
    if (typeof Multiplier !== "undefined") {
      Multiplier.init();
      Multiplier.updateUI(Store.get());
    }

    // --- Smooth BUY LAND 2D Camera Transition (Zero Black Flash) ---
    const buyLandBtn = el("buy-land-mode-btn");
    const exitBuyBtn = el("exit-buy-mode-btn");
    const buyBanner = el("buy-mode-banner");

    // Top banner copy: buying land vs relocating a bagged plot
    function updateBuyModeBanner() {
      const state = Store.get();
      const bagCount = Object.values(state.plotBag || {}).reduce((s, n) => s + (Number(n) || 0), 0);
      const titleEl = el("buy-mode-title");
      const descEl = el("buy-mode-desc");
      if (bagCount > 0) {
        if (titleEl) titleEl.textContent = "Place Plot";
        if (descEl) descEl.textContent = "These squares represent land around you in the real world. Tap an empty tile inside your circle to relocate a plot from your Bag.";
      } else {
        if (titleEl) titleEl.textContent = "Buy Land";
        if (descEl) descEl.textContent = "These squares represent land around you in the real world. Tap an empty tile inside your circle to claim it for 100 EB.";
      }
    }

    function enterBuyLandMode() {
      if (!map || !currentPos) return;
      document.body.classList.add("buy-mode");
      updateBuyModeBanner();
      buyBanner?.classList.remove("hidden");
      Grid.setBuyMode(true, currentPos);

      // 1. Lock camera strictly to 2D Top-Down View (minPitch = 0, maxPitch = 0)
      map.setMinPitch(0);
      map.setMaxPitch(0); // Physically impossible to tilt into 3D!

      // 2. Wide framing — whole 75m reach circle visible at once (Atlas Earth style)
      map.setMinZoom(17.5);
      map.setMaxZoom(20.0);

      map.flyTo({
        center: [currentPos.lon, currentPos.lat],
        pitch: 0,
        bearing: 0,
        zoom: 18.0,
        duration: 800,
        essential: true,
      });
    }

    function exitBuyLandMode() {
      document.body.classList.remove("buy-mode");
      buyBanner?.classList.add("hidden");
      Grid.setBuyMode(false);

      // 1. Restore normal 3D tilt limits (Allows 0° to 70° cinematic tilt)
      map.setMinPitch(0);
      map.setMaxPitch(70);

      // 2. Restore normal zoom limits
      map.setMinZoom(2);
      map.setMaxZoom(20.0);

      // 3. Smoothly tilt back to 58° 3D perspective
      map.setMinPitch(0);
      map.setMaxPitch(80);
      map.flyTo({
        center: [currentPos.lon, currentPos.lat],
        pitch: 70,
        zoom: 18.4,
        duration: 800,
        essential: true,
      });
    }

    buyLandBtn?.addEventListener("click", enterBuyLandMode);
    exitBuyBtn?.addEventListener("click", exitBuyLandMode);

    // Reset Camera to True North & Default Zoom Level
    el("recenter-btn")?.addEventListener("click", () => {
      if (currentPos && map) {
        map.flyTo({
          center: [currentPos.lon, currentPos.lat],
          bearing: 0,      // Snaps camera back to True North
          pitch: 70,       // Resets to 3D Isometric View
          zoom: 18.5,      // Returns to default sweetspot zoom
          duration: 750,
          essential: true,
        });
      }
    });
    
    // Tap Profile Chip to open Player Info Modal (balance card now opens cashout)
    function openPlayerInfo() {
      updatePlayerInfoModal();
      openModal("player-info-modal");
      if (typeof window.completeDailyQuest === "function") {
        window.completeDailyQuest("mayor");
      }
    }
    document.querySelector(".player-chip")?.addEventListener("click", openPlayerInfo);
    // Wire up Guest "Sign in with Google" button in Player Info Modal
    document.getElementById("google-link-btn")?.addEventListener("click", () => {
      // Wipe all guest data from localStorage before signing in with Google
      console.log("[Auth] Wiping guest data before Google sign-in...");
      localStorage.removeItem("eldenEarth.save.v1");
      localStorage.removeItem("eldenEarth.guestModeUsed");
      // Sign out of Firebase anonymous session to force fresh Google auth
      if (typeof firebase !== "undefined" && firebase.auth && firebase.auth().currentUser) {
        firebase.auth().signOut();
      }
      // Force page reload to show clean sign-in screen
      window.location.reload();
    });

    el("earn-btn").addEventListener("click", () => {
      // Safety unlock in case modal was closed mid-spin
      const spinBtn = el("spin-btn");
      if (spinBtn && !el("wheel-result").textContent.includes("Spinning")) {
        spinBtn.disabled = false;
        if (typeof Wheel !== "undefined" && Wheel.resetSpinningState) Wheel.resetSpinningState();
      }
      openModal("wheel-modal");
      updateTopbar();
      // Update spin button text for free spins
      const st = Store.get();
      const freeSpinsLeft = Number(st.player.freeSpins) || 0;
      const noDiamondCost = st.player.freeSpinsNoDiamondCost;
      if (freeSpinsLeft > 0 && noDiamondCost) {
        spinBtn.innerHTML = `FREE SPINS REMAINING ${freeSpinsLeft}`;
        const wheelSub = el("wheel-sub");
        if (wheelSub) wheelSub.textContent = `Free spins — no diamonds needed!`;
      } else {
        spinBtn.innerHTML = `Spin (2 <span class="hud-gem-icon"></span>)`;
        const wheelSub = el("wheel-sub");
        if (wheelSub) wheelSub.innerHTML = `2 <span class="hud-gem-icon"></span> per spin`;
      }
    });
    el("land-btn").addEventListener("click", () => { updateLandModal(); openModal("land-modal"); });

    // --- Tutorial Unread Alert Dot Logic ---
    const menuDot = el("menu-unread-dot");
    const TUTORIAL_KEY = "eldenEarth.tutorialViewed.v1";

    // Show glowing red dot if player hasn't opened the updated guide yet
    if (!localStorage.getItem(TUTORIAL_KEY) && menuDot) {
      menuDot.classList.remove("hidden");
    }

    el("menu-btn").addEventListener("click", () => {
      // Mark viewed & remove alert dot
      localStorage.setItem(TUTORIAL_KEY, "true");
      if (menuDot) menuDot.classList.add("hidden");
      openModal("menu-modal");
      // Update phone verification button state when menu opens
      updatePhoneButtonState();
    });

    // Wire up Session Conflict Resume Button
    document.getElementById("resume-session-btn")?.addEventListener("click", () => {
      if (typeof Store !== "undefined" && Store.resumeSession) {
        Store.resumeSession();
      } else {
        window.location.reload();
      }
    });
    
    // --- Google AdSense Compliant 60-Second Treasury Ad Refresher ---
    function initTreasuryAdRefresher() {
      const adContainer = el("treasury-ad-container");
      if (!adContainer) return;

      const REFRESH_INTERVAL_MS = 60000; // Strictly 60-second compliant interval
      let lastAdRefreshTime = Date.now();

      function refreshAd() {
        if (document.hidden) return;

        try {
          const ins = adContainer.querySelector("ins.adsbygoogle");
          if (ins) {
             // Google documentation recommends clearing the innerHTML 
             // and pushing to the global queue again
             (window.adsbygoogle = window.adsbygoogle || []).push({});
             lastAdRefreshTime = Date.now();
             console.log("[AdSense] Refreshed banner successfully.");
          }
        } catch (e) {
          console.warn("[AdSense] Refresh notice:", e);
        }
      }

      // Initial push on game load
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {}

      // 60-Second Refresh Ticker
      setInterval(() => {
        const now = Date.now();
        if (now - lastAdRefreshTime >= REFRESH_INTERVAL_MS) {
          refreshAd();
        }
      }, REFRESH_INTERVAL_MS);

      // Refresh when waking up if 60 seconds have elapsed
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden && (Date.now() - lastAdRefreshTime >= REFRESH_INTERVAL_MS)) {
          refreshAd();
        }
      });
    }

    initTreasuryAdRefresher();

    // --- PWA Standalone Status Bar & Battery Guard for Fullscreen Ads ---
    const adObserver = new MutationObserver(() => {
      const overlays = document.querySelectorAll('body > div[style*="2147483647"], body > div[id*="aswift"]');
      overlays.forEach(el => {
        if (el.style.top !== "54px") {
          el.style.setProperty("top", "max(54px, env(safe-area-inset-top))", "important");
          el.style.setProperty("height", "calc(100vh - 54px)", "important");
        }
      });
    });
    adObserver.observe(document.body, { childList: true, subtree: false });

    document.querySelectorAll("[data-close]").forEach(btn => {
      btn.addEventListener("click", () => closeModal(btn.dataset.close));
    });
    document.querySelectorAll(".modal").forEach(modal => {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          modal.classList.add("hidden");
          deactivateMapObjectAnimations(modal.id);
        }
      });
    });

    // --- 10X Multi-Spin Toggle Wiring ---
    const toggle10x = document.getElementById("wheel-10x-toggle");
    const spinBtn = el("spin-btn");

    function updateSpinButtonState() {
      const is10x = toggle10x && toggle10x.checked;
      const mult = is10x ? 10 : 1;
      const cost = is10x ? 20 : 2;

      // 1. Tell Wheel to update numbers on canvas
      if (typeof Wheel !== "undefined" && Wheel.setMultiplier) {
        Wheel.setMultiplier(mult);
        Wheel.redraw();
      }

      // 2. Update top subtitle text
      const wheelSub = el("wheel-sub");
      if (wheelSub && !el("wheel-result")?.textContent?.includes("Spinning")) {
        wheelSub.innerHTML = `${cost} <span class="hud-gem-icon"></span> per spin`;
      }

      // 3. Update Spin button text
      if (spinBtn && !el("wheel-result")?.textContent?.includes("Spinning")) {
        spinBtn.innerHTML = `Spin (${cost} <span class="hud-gem-icon"></span>)`;
      }
    }

    if (toggle10x) {
      toggle10x.addEventListener("change", () => {
        updateSpinButtonState();
      });
    }

    // --- Spin Button Execution ---
    el("spin-btn").addEventListener("click", async () => {
      // Session lock: block if paused
      if (typeof Store !== "undefined" && !Store.isSessionActive()) {
        showToast("🔒 Account active on another tab. Close the other tab first.", 4000);
        return;
      }

      // Anti-cheat: Embargo check
      if (typeof AntiCheat !== "undefined") {
        const check = AntiCheat.isActionAllowed("spin");
        if (!check.allowed) { showToast(check.reason, 5000); return; }
      }

      const state = Store.get();

      if (typeof ServerAntiCheat === "undefined" || !ServerAntiCheat.isReady()) {
        showToast("⚠️ Server connection required to spin the wheel.", 3500);
        return;
      }

      const currentMult = (typeof Wheel !== "undefined" && Wheel.getMultiplier) ? Wheel.getMultiplier() : 1;
      const spinCost = 2 * currentMult;

      // Client-side diamond check before hitting server
      const hasFreeSpins = Number(state.player?.freeSpins) > 0 && state.player?.freeSpinsNoDiamondCost && currentMult === 1;
      if (!hasFreeSpins && (Number(state.diamonds) || 0) < spinCost) {
        showToast(`Not enough diamonds — you need ${spinCost} diamonds for this spin!`, 3500);
        return;
      }

      // Pass the multiplier (1 or 10) to the server
      const spinResult = await ServerAntiCheat.spinWheel(currentMult);
      if (!spinResult.spun) {
        const msgs = {
          insufficient_diamonds: `Not enough diamonds — you need ${spinCost} diamonds!`,
          no_save_found: "⚠️ Account not found. Please restart the game.",
          functions_not_initialized: "⚠️ Server connection required to spin the wheel.",
        };
        showToast(msgs[spinResult.reason] || "⚠️ Wheel spin could not be verified.", 3500);
        return;
      }

      el("spin-btn").disabled = true;
      el("wheel-result").textContent = "Spinning...";

      Wheel.spin((slice) => {
        // Update currency AFTER animation completes, not before
        state.diamonds = spinResult.nextDiamonds;
        state.eb = spinResult.nextEb;
        state.player.freeSpins = spinResult.nextFreeSpins;
        state.player.freeSpinsNoDiamondCost = spinResult.nextFreeSpins > 0;
        Store.save(true);
        updateTopbar();

        const s = Store.get();
        if (!slice) return;

        if (typeof window.completeDailyQuest === "function") {
          window.completeDailyQuest("wheel");
        }

        // Coordinates from the center of the wheel for flying particle fountains
        const wheelEl = el("wheel-canvas");
        const wRect = wheelEl ? wheelEl.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0, height: 0 };
        const originX = wRect.left + wRect.width / 2;
        const originY = wRect.top + wRect.height / 2;

        const multAward = currentMult; // 1 or 10

        if (slice.type === "diamond") {
          const winDiamonds = 1 * multAward;
          el("wheel-result").textContent = `Your diamond found its way back to you. (◆ +${winDiamonds})`;
          showToast(`💎 +${winDiamonds} Diamond${winDiamonds > 1 ? 's' : ''} Refunded!`);
          launchFlyingGemStream(originX, originY, winDiamonds);

        } else if (slice.type === "diamond_jackpot") {
          // 💎 +12 or +24 Diamond Jackpot!
          const winDiamonds = (Number(slice.amount) || 12) * multAward;
          el("wheel-result").textContent = `🎉 MEGA JACKPOT! +${winDiamonds} Diamonds!`;
          showToast(`💎 MEGA JACKPOT! Won +${winDiamonds} Diamonds!`);

          // Only broadcast diamond jackpots on 1X spins (not 10X) to prevent feed flooding
          if (multAward === 1 && typeof Feed !== "undefined") {
            Feed.broadcast("diamond_jackpot", { amount: winDiamonds });
          }

          launchFlyingGemStream(originX, originY, winDiamonds);

        } else if (slice.type === "miss") {
          el("wheel-result").textContent = "Better luck next time! (No reward)";
          showToast("🚫 Nothing this time — keep searching!");

        } else {
          // 🪙 Elden Bucks Winner
          const winAmount = (Number(slice.amount) || 0) * multAward;
          el("wheel-result").textContent = `🎉 You won ${winAmount} EB!`;
          showToast(`🎉 Won +${winAmount} Elden Bucks!`);

          // Only broadcast 25+ EB Jackpots on 1X spins (not 10X) to prevent feed flooding
          if (winAmount >= 25 && multAward === 1 && typeof Feed !== "undefined") {
            Feed.broadcast("jackpot", { amount: winAmount });
          }

          launchFlyingEBStream(originX, originY, winAmount);
        }

        updateTopbar();
        el("spin-btn").disabled = false;
        updateSpinButtonState();
      }, spinResult.slice);
    });

    // --- LOG OUT BUTTON ---
    el("logout-btn")?.addEventListener("click", async () => {
      if (await window.gameConfirm("Log out of Elden Earth?")) {
        if (typeof firebase !== "undefined" && firebase.auth) {
          firebase.auth().signOut();
        }
        localStorage.removeItem("eldenEarth.save.v1");
        window.location.reload();
      }
    });

    // --- DELETE ACCOUNT PERMANENTLY ---
    el("delete-account-btn")?.addEventListener("click", async () => {
      if (!await window.gameConfirm("DELETE your account PERMANENTLY? This cannot be undone. All your data will be erased from Firebase.", { okText: "Delete" })) return;
      if (!await window.gameConfirm("Are you absolutely sure? Your plots, balance, and progress will be gone forever.", { okText: "Yes, Delete" })) return;

      try {
        const user = firebase.auth().currentUser;
        if (!user) {
          showToast("No user logged in.");
          return;
        }
        const uid = user.uid;
        const db = Store.getDb();

        // Reauthenticate with Google (required for account deletion)
        showToast("Reauthenticating... please sign in again to confirm deletion.");
        const provider = new firebase.auth.GoogleAuthProvider();
        try {
          await user.reauthenticateWithPopup(provider);
        } catch (reauthErr) {
          showToast("Reauthentication cancelled — account not deleted.");
          return;
        }

        showToast("Deleting account data...");

        // 1. Delete all Firestore data in parallel (fastest wipe)
        if (db) {
          const deletePromises = [];
          const userCollections = ["saves", "plots", "presence", "dividends", "usernames", "avatar_reviews"];
          for (const col of userCollections) {
            deletePromises.push(db.collection(col).doc(uid).delete().catch(() => {}));
          }
          // Delete citadels owned by this user
          try {
            const citadelSnap = await db.collection("citadels").where("creatorId", "==", uid).get();
            citadelSnap.forEach(doc => deletePromises.push(doc.ref.delete().catch(() => {})));
          } catch (e) {}
          await Promise.all(deletePromises);
        }

        // 2. Delete Firebase Auth account (must be last)
        await user.delete();
        console.log("[Auth] Account deleted:", uid);

        // 3. Wipe ALL local storage for this game
        localStorage.removeItem("eldenEarth.save.v1");
        localStorage.removeItem("eldenEarth.guestModeUsed");
        localStorage.removeItem("elden_sess_token");

        // 4. Clear IndexedDB (Firestore persistence cache)
        try {
          const dbs = await indexedDB.databases();
          for (const dbInfo of dbs) {
            if (dbInfo.name) indexedDB.deleteDatabase(dbInfo.name);
          }
        } catch (e) {}

        // 5. Clear sessionStorage
        try { sessionStorage.clear(); } catch (e) {}

        showToast("Account permanently deleted. Redirecting...");
        // 6. Instant redirect — no delay
        window.location.replace(window.location.href.split("?")[0]);
      } catch (err) {
        console.error("[Auth] Delete account error:", err);
        if (err.code === "auth/requires-recent-login") {
          showToast("Session expired — please log out and log back in, then try again.");
        } else {
          showToast("Failed to delete account: " + err.message);
        }
      }
    });

    // --- LINK PHONE NUMBER ---
    let phoneConfirmationResult = null;
    let recaptchaVerifier = null;
    let recaptchaWidgetId = null;

    function resetPhoneModal() {
      el("phone-step-input").classList.remove("hidden");
      el("phone-step-verify").classList.add("hidden");
      el("phone-step-loading").classList.add("hidden");
      el("phone-number-input").value = "";
      el("phone-code-input").value = "";
      phoneConfirmationResult = null;
      if (recaptchaVerifier) {
        try { recaptchaVerifier.clear(); } catch (e) {}
        recaptchaVerifier = null;
        recaptchaWidgetId = null;
      }
      // Clear the reCAPTCHA container HTML
      const container = el("recaptcha-container");
      if (container) container.innerHTML = "";
      // Reset send button state
      const sendBtn = el("phone-send-code-btn");
      if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.style.opacity = "0.5";
        sendBtn.textContent = "Complete reCAPTCHA first";
      }
    }

    async function sendPhoneCode() {
      const phoneNumber = el("phone-number-input").value.trim();
      if (!phoneNumber || phoneNumber.length < 7) {
        showToast("Please enter a valid phone number with country code.");
        return;
      }
      const user = firebase.auth().currentUser;
      if (!user) { showToast("Please log in first."); return; }

      if (!recaptchaVerifier) {
        showToast("Verification not ready. Please close and reopen the modal.");
        return;
      }

      el("phone-step-input").classList.add("hidden");
      el("phone-step-loading").classList.remove("hidden");

      try {
        phoneConfirmationResult = await firebase.auth().signInWithPhoneNumber(phoneNumber, recaptchaVerifier);
        el("phone-step-loading").classList.add("hidden");
        el("phone-step-verify").classList.remove("hidden");
        showToast("SMS code sent!");
      } catch (err) {
        console.error("[Phone] Send code error:", err);
        el("phone-step-loading").classList.add("hidden");
        el("phone-step-input").classList.remove("hidden");
        if (err.code === "auth/too-many-requests") {
          showToast("Too many attempts. Please try again later.");
        } else if (err.code === "auth/invalid-phone-number") {
          showToast("Invalid phone number format.");
        } else if (err.code === "auth/captcha-check-failed") {
          showToast("reCAPTCHA check failed. Please try again.");
        } else {
          showToast("Failed to send code: " + err.message);
        }
        if (recaptchaVerifier) {
          try { grecaptcha.reset(recaptchaWidgetId); } catch (e) {}
        }
      }
    }

    function updatePhoneButtonState() {
      const user = firebase.auth().currentUser;
      const btn = el("link-phone-btn");
      const label = el("phone-verified-label");
      if (!btn || !label) return;
      
      if (user) {
        const phoneProvider = user.providerData.find(p => p.providerId === "phone");
        if (phoneProvider) {
          // Phone is verified - show green checkmark state
          btn.textContent = "✓ Verified";
          btn.style.background = "linear-gradient(180deg, #4ade80, #22c55e)";
          btn.style.color = "#ffffff";
          btn.style.border = "1px solid #4ade80";
          btn.style.boxShadow = "0 4px 12px rgba(74, 222, 128, 0.3)";
          btn.disabled = true;
          label.classList.remove("hidden");
          return;
        }
      }
      // Not verified - show default state
      btn.textContent = "Link Phone Number";
      btn.style.background = "";
      btn.style.color = "";
      btn.style.border = "";
      btn.style.boxShadow = "";
      btn.disabled = false;
      label.classList.add("hidden");
    }
    window.updatePhoneButtonState = updatePhoneButtonState;

    el("link-phone-btn")?.addEventListener("click", async () => {
      const user = firebase.auth().currentUser;
      if (!user) { showToast("Please log in first."); return; }
      const phoneProvider = user.providerData.find(p => p.providerId === "phone");
      if (phoneProvider) {
        showToast("Phone number already verified: " + phoneProvider.phoneNumber);
        return;
      }
      resetPhoneModal();
      el("phone-link-modal").classList.remove("hidden");
      console.log("[Phone] Modal opened");
      
      // Disable send button initially
      const sendBtn = el("phone-send-code-btn");
      if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.style.opacity = "0.5";
        sendBtn.textContent = "Complete reCAPTCHA first";
      }
      
      // Wait for modal to be visible, then render reCAPTCHA
      await new Promise(resolve => setTimeout(resolve, 300));
      try {
        if (!recaptchaVerifier) {
          const container = el("recaptcha-container");
          console.log("[Phone] Container visible:", container.offsetParent !== null);
          recaptchaVerifier = new firebase.auth.RecaptchaVerifier("recaptcha-container", {
            size: "normal",
            callback: () => {
              console.log("[Phone] reCAPTCHA solved - enabling send button");
              if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.style.opacity = "1";
                sendBtn.textContent = "Send Code";
              }
            },
            "expired-callback": () => {
              showToast("reCAPTCHA expired. Please try again.");
              if (sendBtn) {
                sendBtn.disabled = true;
                sendBtn.style.opacity = "0.5";
                sendBtn.textContent = "Complete reCAPTCHA first";
              }
              if (recaptchaVerifier) {
                try { grecaptcha.reset(recaptchaWidgetId); } catch (e) {}
              }
            }
          });
          recaptchaWidgetId = await recaptchaVerifier.render();
          console.log("[Phone] reCAPTCHA rendered, widgetId:", recaptchaWidgetId);
        }
      } catch (err) {
        console.error("[Phone] reCAPTCHA render error:", err);
        showToast("Failed to load verification. Please refresh and try again.");
      }
    });

    el("phone-cancel-btn")?.addEventListener("click", () => {
      el("phone-link-modal").classList.add("hidden");
      resetPhoneModal();
    });

    el("phone-back-btn")?.addEventListener("click", () => {
      el("phone-step-verify").classList.add("hidden");
      el("phone-step-input").classList.remove("hidden");
      phoneConfirmationResult = null;
      // Reset send button state
      const sendBtn = el("phone-send-code-btn");
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.style.opacity = "1";
        sendBtn.textContent = "Send Code";
      }
    });

    el("phone-send-code-btn")?.addEventListener("click", () => {
      sendPhoneCode();
    });

    el("phone-verify-btn")?.addEventListener("click", async () => {
      const code = el("phone-code-input").value.trim();
      if (!code || code.length < 4) {
        showToast("Please enter the verification code.");
        return;
      }
      if (!phoneConfirmationResult) {
        showToast("Please request a code first.");
        return;
      }

      el("phone-step-verify").classList.add("hidden");
      el("phone-step-loading").classList.remove("hidden");
      el("phone-step-loading").querySelector("p").textContent = "Verifying code...";

      try {
        const credential = firebase.auth.PhoneAuthProvider.credential(
          phoneConfirmationResult.verificationId,
          code
        );
        const user = firebase.auth().currentUser;
        await user.linkWithCredential(credential);
        el("phone-link-modal").classList.add("hidden");
        resetPhoneModal();
        el("phone-step-loading").querySelector("p").textContent = "Sending SMS code...";
        showToast("Phone number linked successfully!");
        updatePhoneButtonState();
      } catch (err) {
        console.error("[Phone] Verify error:", err);
        el("phone-step-loading").classList.add("hidden");
        el("phone-step-verify").classList.remove("hidden");
        el("phone-step-loading").querySelector("p").textContent = "Sending SMS code...";
        if (err.code === "auth/invalid-verification-code") {
          showToast("Invalid code. Please try again.");
        } else if (err.code === "auth/code-expired") {
          showToast("Code expired. Please request a new one.");
        } else if (err.code === "auth/credential-already-in-use") {
          showToast("This phone number is already linked to another account.");
        } else {
          showToast("Verification failed: " + err.message);
        }
      }
    });
  }

  // ===================== CASHOUT / CONVERT PAGE =====================
  let cashoutConvertAmount = 1;

  function openCashoutPage() {
    const state = Store.get();
    const cashBalance = state.cash || 0;
    el("cashout-cash-amount").textContent = cashBalance.toFixed(11);
    cashoutConvertAmount = 1;
    updateCashoutDisplay();
    el("cashout-page").classList.remove("hidden");
  }

  function closeCashoutPage() {
    el("cashout-page").classList.add("hidden");
  }

  function updateCashoutDisplay() {
    el("cashout-convert-amount").textContent = cashoutConvertAmount;
    el("cashout-eb-reward").textContent = cashoutConvertAmount * 25;
    el("cashout-diamond-reward").textContent = cashoutConvertAmount * 10;

    const state = Store.get();
    const cashBalance = state.cash || 0;
    const convertBtn = el("cashout-convert-btn");
    if (convertBtn) {
      convertBtn.disabled = cashBalance < cashoutConvertAmount;
    }
  }

  // Wire up cashout page
  el("hero-balance-card")?.addEventListener("click", openCashoutPage);

  el("cashout-close-btn")?.addEventListener("click", closeCashoutPage);

  // Tap black background to close
  el("cashout-page")?.addEventListener("click", (e) => {
    if (e.target.id === "cashout-page" || e.target.classList.contains("cashout-overlay-bg")) {
      closeCashoutPage();
    }
  });

  el("cashout-decrease-btn")?.addEventListener("click", () => {
    if (cashoutConvertAmount > 1) {
      cashoutConvertAmount--;
      updateCashoutDisplay();
    }
  });

  el("cashout-increase-btn")?.addEventListener("click", () => {
    const state = Store.get();
    const cashBalance = state.cash || 0;
    if (cashoutConvertAmount < Math.floor(cashBalance) && cashoutConvertAmount < 1000) {
      cashoutConvertAmount++;
      updateCashoutDisplay();
    }
  });

  el("cashout-convert-btn")?.addEventListener("click", async () => {
    const state = Store.get();
    const cashBalance = state.cash || 0;

    if (cashBalance < cashoutConvertAmount) {
      showToast("Insufficient cash balance.");
      return;
    }

    const convertBtn = el("cashout-convert-btn");
    if (convertBtn) {
      convertBtn.disabled = true;
      convertBtn.textContent = "CONVERTING...";
    }

    try {
      const convertFn = firebase.functions().httpsCallable("convertCash");
      const result = await convertFn({ amount: cashoutConvertAmount });

      if (result.data?.ok) {
        showToast(`✓ Converted $${cashoutConvertAmount} → +${result.data.ebReward} EB +${result.data.diamondReward} Diamonds!`, 4000);
        // Update local state
        state.cash = result.data.newCash;
        state.eb = result.data.newEb;
        state.diamonds = result.data.newDiamonds;
        Store.save(true);
        updateTopbar();
        closeCashoutPage();
      } else {
        showToast("Conversion failed. Please try again.");
      }
    } catch (err) {
      console.error("[Cashout] Convert error:", err);
      if (err.code === "permission-denied") {
        showToast("Phone verification required. Please link your phone number first.");
      } else if (err.code === "failed-precondition") {
        showToast("Insufficient cash balance.");
      } else {
        showToast("Conversion failed: " + err.message);
      }
    } finally {
      if (convertBtn) {
        convertBtn.disabled = false;
        convertBtn.textContent = "CONVERT";
      }
    }
  });

  // Hardware Compass: Rotates 3D Character when turning your body in place
  if (typeof window !== "undefined" && window.DeviceOrientationEvent) {
    window.addEventListener("deviceorientation", (e) => {
      if (document.hidden) return;
      const compassHeading = e.webkitCompassHeading || (e.alpha ? 360 - e.alpha : null);
      if (compassHeading !== null && !isNaN(compassHeading)) {
        if (typeof Character3D !== "undefined" && Character3D.setHeading) {
          Character3D.setHeading((compassHeading * Math.PI) / 180);
        }
      }
    }, { passive: true });
  }

  // Hardware Compass: Rotates 3D Character when turning your body in place
    document.getElementById("resume-session-btn")?.addEventListener("click", () => {
      if (typeof Store !== "undefined" && Store.resumeSession) {
        Store.resumeSession();
      } else {
        window.location.reload();
      }
    });

  // Expose for leaderboard cross-module access
  window.updatePlayerInfoModal = updatePlayerInfoModal;
  window.openModal = openModal;

  // ---------------- Boot ----------------
  document.addEventListener("DOMContentLoaded", () => {
    const repairHosts = new Set([]);
    if (repairHosts.has(window.location.hostname)) {
      document.body.innerHTML = `
        <main style="min-height:100vh;display:grid;place-items:center;background:#0e1522;color:#f4f0e8;font-family:Manrope,system-ui,sans-serif;text-align:center;padding:24px;">
          <section style="max-width:520px;border:1px solid #3a4b5c;border-radius:14px;padding:32px 24px;background:#172235;">
            <div style="font-size:48px;margin-bottom:16px;">🛠️</div>
            <h1 style="margin:0 0 12px;font-family:Cinzel,serif;">Realm Under Repair</h1>
            <p style="color:#b8c2d1;line-height:1.6;margin:0 0 24px;">This version is temporarily unavailable. Please use the official game link below.</p>
            <a href="https://vicsanity623.github.io/Elden-Earth-Pre-Release/" style="display:inline-block;padding:13px 20px;border-radius:8px;background:#4fd6c4;color:#0e1522;font-weight:800;text-decoration:none;">Open Elden Earth</a>
          </section>
        </main>`;
      return;
    }

    // --- AUTOMATION / HEADLESS BROWSER DETECTION ---
    if (typeof detectAutomation === "function" && detectAutomation()) {
      console.error("[AntiCheat] Automated browser detected — aborting game init.");
      document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0e1522;color:#ff4757;font-family:system-ui;font-size:1.4rem;text-align:center;padding:2rem;">🛡️ Automated browser detected.<br>Please use a real browser to play Elden Earth.</div>';
      return;
    }

    Store.load();
    if (Store.get()?._epochWiped) {
      showToast("✨ A new Realm Era has begun! Your account has been reset for the new season.", 6000);
      // Consume the flag so the toast never repeats on future logins
      Store.get()._epochWiped = false;
      Store.save(false);
    }
    Auth.init(onSignedIn);
    if (typeof ServerAntiCheat !== "undefined") ServerAntiCheat.init();
    el("locate-btn")?.addEventListener("click", startLocating);
    el("retry-location-btn")?.addEventListener("click", startLocating);

    // --- VPN Block Retry ---
    el("vpn-block-retry")?.addEventListener("click", () => window.location.reload());

    // Periodic friend request notification dot check (every 30s)
    setInterval(() => {
      const id = Store.get()?.player?.id;
      const d = Store.getDb();
      if (!id || !d) return;
      d.collection("friend_requests")
        .where("toId", "==", id)
        .where("status", "==", "pending")
        .get()
        .then(snap => {
          const dot = document.getElementById("friend-request-dot");
          if (dot) {
            if (snap.size > 0) dot.classList.remove("hidden");
            else dot.classList.add("hidden");
          }
        })
        .catch(() => {});
    }, 30000);
  });
})();
