// ============================================================
// Elden Earth — Elden Stops (Dyson Disc Beacons)
// PokéStop-style public POI beacons: plant seeds on validated
// landmarks, fly in, swipe the Dyson Disc, collect server-rolled
// rewards. 15-minute recharge cooldown per player per stop.
// ============================================================
const EldenStops = (() => {
  let map = null;
  let playerPos = null;
  let onRewards = () => {};
  let globalStops = {};       // stopId -> Firestore beacon data
  let markers = {};           // stopId -> mapboxgl.Marker
  let selectedStopId = null;
  let prevCamera = null;
  let cinematicOpen = false;
  let spinning = false;
  let spinTimeout = null;
  let lastRenderPos = null;
  let lastPosUpdate = 0;
  let announcedBuilds = {};
  const justActivated = new Set();
  let globalCooldowns = {}; // stopId -> readyAt (global 5-min cooldown after any spin)

  const COOLDOWN_MS = () => CONFIG.ELDEN_STOP_COOLDOWN_MS || 15 * 60 * 1000;
  const SPIN_RADIUS = () => CONFIG.ELDEN_STOP_SPIN_RADIUS_METERS || 75;

  // ---------------- CONSTRUCTION PHASE (Citadel-style growth timer) ----------------
  function buildFinish(stop) {
    return Number(stop && stop.constructionFinish) || 0;
  }

  function isConstructing(stop) {
    const f = buildFinish(stop);
    return f > Date.now();
  }

  function formatCountdown(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  // ---------------- COOLDOWN CACHE (UI mirror; server is authoritative) ----------------
  function getReadyAt(stopId) {
    const state = Store.get();
    return Number(state.eldenStopCooldowns && state.eldenStopCooldowns[stopId]) || 0;
  }

  function setReadyAt(stopId, readyAt) {
    const state = Store.get();
    if (!state.eldenStopCooldowns) state.eldenStopCooldowns = {};
    state.eldenStopCooldowns[stopId] = readyAt;
    // Keep the cache from growing forever
    const keys = Object.keys(state.eldenStopCooldowns);
    if (keys.length > 80) {
      const now = Date.now();
      keys.sort((a, b) => (state.eldenStopCooldowns[a] || 0) - (state.eldenStopCooldowns[b] || 0));
      for (const k of keys.slice(0, keys.length - 60)) {
        if ((state.eldenStopCooldowns[k] || 0) < now) delete state.eldenStopCooldowns[k];
      }
    }
    Store.save(true);
    refreshStopVisual(stopId);
  }

  function getGlobalCooldown(stopId) {
    return Number(globalCooldowns[stopId]) || 0;
  }

  function setGlobalCooldown(stopId, readyAt) {
    globalCooldowns[stopId] = readyAt;
    refreshStopVisual(stopId);
  }

  function onCooldown(stopId) {
    const now = Date.now();
    return getReadyAt(stopId) > now || getGlobalCooldown(stopId) > now;
  }

  function formatCooldown(stopId) {
    const now = Date.now();
    const perPlayer = getReadyAt(stopId);
    const global = getGlobalCooldown(stopId);
    const rem = Math.max(0, Math.max(perPlayer, global) - now);
    const m = Math.floor(rem / 60000);
    const s = Math.floor((rem % 60000) / 1000);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  // ---------------- MAP MARKERS ----------------
  function createStopElement(stop, near, cooling) {
    const el = document.createElement("div");
    const building = isConstructing(stop);
    el.className = "elden-stop-marker" + (near ? "" : " far") + (cooling ? " cooling" : "") + (building ? " building" : "");
    el.dataset.stage = building ? "build" : "ready";
    el.dataset.stopId = stop.id;

    // Inner scale root: MapLibre owns the marker element's transform for
    // positioning, so zoom-proportional scaling lives on this child instead.
    const scaleRoot = document.createElement("div");
    scaleRoot.className = "elden-scale-root";

    if (building) {
      // 🏗️ CONSTRUCTION VIEW — holographic billboard + live growth countdown
      scaleRoot.innerHTML = `
        <div class="elden-construct-anchor">
          <div class="elden-construct-pulse"></div>
          <div class="elden-construct-beam"></div>
          <div class="elden-construct-billboard">
            <div class="elden-construct-name">${stop.poiName || "Elden Stop"}</div>
            <div class="elden-construct-timer">⏳ <span class="elden-construct-countdown" data-finish="${buildFinish(stop)}">${formatCountdown(buildFinish(stop) - Date.now())}</span></div>
            <span class="elden-construct-label">CONSTRUCTING</span>
          </div>
        </div>
      `;
    } else {
      // 🌟 ACTIVE VIEW — crimson Dyson Disc beacon, stacked exactly like the
      // Citadel monument: ground rune → stem → floating disc → spire tip.
      const ruby = (cls, ch) => `<span class="elden-ruby ${cls}">${ch}</span>`;
      if (justActivated.has(stop.id)) {
        el.classList.add("just-built");
        setTimeout(() => justActivated.delete(stop.id), 4000);
      }
      scaleRoot.innerHTML = `
        <div class="elden-ground-pulse"></div>
        <div class="elden-beam"></div>
        <div class="elden-stop-disc" data-stop="${stop.id}">
          <div class="elden-ring elden-ring-a"></div>
          <div class="elden-ring elden-ring-b"></div>
          <div class="elden-disc-core">
            <img src="assets/eb-coin.png" alt="" class="elden-core-coin">
            ${ruby("r1", "◆")}${ruby("r2", "◆")}${ruby("r3", "◆")}${ruby("r4", "◆")}
          </div>
          <div class="cooldown-timer-overlay">${cooling ? formatCooldown(stop.id) : ""}</div>
        </div>
        <div class="elden-spire-tip">✦</div>
        <div class="elden-stop-plate">${stop.poiName || "Elden Stop"}</div>
      `;
    }

    el.appendChild(scaleRoot);

    el.addEventListener("click", (e) => {
      e.stopPropagation();
      openStopSession(stop.id);
    });
    return el;
  }

  function refreshStopVisual(stopId) {
    const entry = markers[stopId];
    const stop = globalStops[stopId];
    if (!entry || !stop) return;
    const el = entry.getElement();
    if (!el) return;
    const cooling = onCooldown(stopId);
    el.classList.toggle("cooling", cooling);
    const timerEl = el.querySelector(".cooldown-timer-overlay");
    if (timerEl) timerEl.textContent = cooling ? formatCooldown(stopId) : "";
  }

  function renderAll() {
    if (!map || !map.getStyle || !map.getStyle() || document.hidden) return;

    const zoom = map.getZoom();

    // Hide Elden Stops at low zoom levels (zoom out too far)
    if (zoom < 14) {
      for (const sid in markers) {
        markers[sid].remove();
        delete markers[sid];
      }
      return;
    }

    for (const sid in markers) {
      if (!globalStops[sid]) {
        markers[sid].remove();
        delete markers[sid];
      }
    }

    const visibleIds = new Set();
    for (const sid in globalStops) {
      const stop = globalStops[sid];
      if (playerPos) {
        const dist = Geo.haversine(playerPos.lat, playerPos.lon, Number(stop.lat), Number(stop.lon));
        if (dist > (CONFIG.ELDEN_STOP_VISIBILITY_METERS || 1500)) continue;
      }
      visibleIds.add(sid);

      const near = playerPos &&
        Geo.haversine(playerPos.lat, playerPos.lon, Number(stop.lat), Number(stop.lon)) <= SPIN_RADIUS();
      const cooling = onCooldown(sid);

      if (markers[sid]) {
        const el = markers[sid].getElement();
        const stageNow = isConstructing(stop) ? "build" : "ready";
        const wasFar = el ? el.classList.contains("far") : true;
        // Rebuild DOM when the LOD tier or construction stage flips
        if (el && (el.dataset.stage !== stageNow || wasFar === near)) {
          markers[sid].remove();
          delete markers[sid];
        }
      }

      if (!markers[sid]) {
        const el = createStopElement(stop, near, cooling);
        // Keep the open/interacted beacon animating across LOD rebuilds
        if (sid === selectedStopId) el.classList.add("is-active");
        const m = new mapboxgl.Marker({
          element: el,
          anchor: "bottom",
          pitchAlignment: "viewport",
          rotationAlignment: "viewport",
        })
          .setLngLat([Number(stop.lon), Number(stop.lat)])
          .addTo(map);
        markers[sid] = m;
      } else {
        refreshStopVisual(sid);
      }
    }

    for (const sid in markers) {
      if (!visibleIds.has(sid)) {
        markers[sid].remove();
        delete markers[sid];
      }
    }
  }

  function listen() {
    const db = Store.getDb();
    if (!db) return;
    try {
      db.collection("elden_stops").onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          const sid = change.doc.id;
          if (change.type === "added" || change.type === "modified") {
            globalStops[sid] = { id: sid, ...change.doc.data() };
          } else if (change.type === "removed") {
            delete globalStops[sid];
          }
        });
        renderAll();
      }, (err) => console.warn("[EldenStops] Sync error:", err));
    } catch (e) {
      console.warn("[EldenStops] Listener error:", e);
    }
  }

  // ---------------- CAMERA CINEMATICS ----------------
  function flyIntoStop(stop) {
    if (!map) return;
    prevCamera = {
      center: map.getCenter(),
      zoom: map.getZoom(),
      pitch: map.getPitch(),
      bearing: map.getBearing(),
    };
    cinematicOpen = true;
    map.flyTo({
      center: [Number(stop.lon), Number(stop.lat)],
      zoom: 19.8,
      pitch: 65,
      bearing: (prevCamera.bearing || 0) + 45,
      duration: 1200,
      essential: true,
    });
  }

  function returnCameraAndClose() {
    if (!map) return;
    cinematicOpen = false;
    const target = playerPos || map.getCenter();
    map.flyTo({
      center: [Number.isFinite(target.lon) ? target.lon : target.lng, Number.isFinite(target.lat) ? target.lat : target.lat],
      zoom: 18.5,
      pitch: 70,
      bearing: prevCamera ? prevCamera.bearing : 0,
      duration: 1400,
      essential: true,
    });
    prevCamera = null;
  }

  function isCinematicOpen() {
    return cinematicOpen;
  }

  // ---------------- TAP → FLY-IN → OVERLAY ----------------
  function openStopSession(stopId) {
    // Prevent opening multiple sessions simultaneously
    if (selectedStopId || spinning) {
      if (typeof showToast === "function") showToast("⏳ Finish your current spin first!", 2000);
      return;
    }

    const stop = globalStops[stopId];
    if (!stop || !map) return;

    if (isConstructing(stop)) {
      if (typeof showToast === "function") showToast(`🏗️ Under construction — this beacon comes online in ${formatCountdown(buildFinish(stop) - Date.now())}!`, 3500);
      return;
    }

    if (!playerPos || Geo.haversine(playerPos.lat, playerPos.lon, Number(stop.lat), Number(stop.lon)) > SPIN_RADIUS()) {
      if (typeof showToast === "function") showToast("🚶 Walk closer to commune with that Elden Stop!", 3000);
      return;
    }

    selectedStopId = stopId;
    // Dyson disc animations ONLY run while this stop session is open
    const activeMarker = markers[stopId];
    if (activeMarker) activeMarker.getElement()?.classList.add("is-active");
    flyIntoStop(stop);

    const overlay = document.getElementById("elden-stop-overlay");
    const titleEl = document.getElementById("elden-stop-title");
    const subEl = document.getElementById("elden-stop-sub");
    if (titleEl) titleEl.textContent = stop.poiName || "Elden Stop";
    if (subEl) {
      const isEstate = String(stop.poiKind || "") === "legendary_estate";
      const kind = isEstate ? "legendary estate 👑" : (String(stop.poiKind || "").split("=")[1] || "landmark");
      const by = stop.creatorName ? ` · planted by ${stop.creatorName}` : "";
      subEl.textContent = `⚓ ${kind.replace(/_/g, " ")}${by}`;
    }

    // Wait for the fly-in to land before revealing the disc
    setTimeout(() => {
      if (selectedStopId === stopId && overlay) overlay.classList.remove("hidden");
      syncOverlayCooldown();
    }, 1100);
  }

  function closeStopSession() {
    if (spinTimeout) {
      clearTimeout(spinTimeout);
      spinTimeout = null;
    }
    // Always reset spinning state when closing session
    spinning = false;
    const discEl = document.getElementById("elden-spin-disc");
    if (discEl) {
      discEl.classList.remove("spinning");
      discEl.style.transform = "";
    }
    const hint = document.getElementById("elden-swipe-hint");
    if (hint) hint.textContent = "Swipe the Dyson Disc to absorb its energy!";
    
    const overlay = document.getElementById("elden-stop-overlay");
    if (overlay) overlay.classList.add("hidden");
    selectedStopId = null;
    // Freeze all map-beacon Dyson animations the moment the session ends
    for (const sid in markers) {
      markers[sid].getElement()?.classList.remove("is-active");
    }
    const lucky = document.getElementById("lucky-plot-modal");
    if (lucky && !lucky.classList.contains("hidden")) {
      // Lucky plot modal owns the exit — camera returns when it closes.
      return;
    }
    returnCameraAndClose();
  }

  function syncOverlayCooldown() {
    if (!selectedStopId) return;
    const disc = document.getElementById("elden-spin-disc");
    const banner = document.getElementById("eld-cooldown-banner");
    const hint = document.getElementById("elden-swipe-hint");
    if (!disc || !banner) return;
    const cooling = onCooldown(selectedStopId);
    disc.classList.toggle("cooldown", cooling);
    banner.classList.toggle("hidden", !cooling);
    if (hint) hint.classList.toggle("hidden", cooling);
    if (cooling) {
      const t = document.getElementById("eld-cooldown-time");
      if (t) t.textContent = formatCooldown(selectedStopId);
    }
  }

  // ---------------- DISC SWIPE PHYSICS ----------------
  function wireDiscPhysics() {
    const discEl = document.getElementById("elden-spin-disc");
    if (!discEl) return;

    let startX = 0;
    let dragging = false;
    let velocity = 0;
    let discAngle = 0;

    discEl.addEventListener("pointerdown", (e) => {
      if (spinning) return;
      dragging = true;
      startX = e.clientX;
      velocity = 0;
      discEl.setPointerCapture(e.pointerId);
    });

    discEl.addEventListener("pointermove", (e) => {
      if (!dragging || spinning) return;
      const deltaX = e.clientX - startX;
      velocity = deltaX * 0.8;
      discAngle += velocity;
      discEl.style.transform = `rotateY(${discAngle}deg)`;
      startX = e.clientX;
    });

    const release = () => {
      if (!dragging || spinning) return;
      dragging = false;
      if (Math.abs(velocity) > 15) {
        triggerDiscSpin();
      } else {
        // Settle back with inertia decay
        const decay = () => {
          velocity *= 0.9;
          discAngle += velocity;
          discEl.style.transform = `rotateY(${discAngle}deg)`;
          if (Math.abs(velocity) > 0.5 && !spinning) requestAnimationFrame(decay);
        };
        requestAnimationFrame(decay);
      }
      velocity = 0;
    };

    discEl.addEventListener("pointerup", release);
    discEl.addEventListener("pointercancel", release);
  }

  function triggerDiscSpin() {
    if (spinning || !selectedStopId) return;

    if (onCooldown(selectedStopId)) {
      const now = Date.now();
      const perPlayer = getReadyAt(selectedStopId);
      const global = getGlobalCooldown(selectedStopId);
      const isGlobal = global > perPlayer;
      const readyAt = isGlobal ? global : perPlayer;
      const mins = Math.floor((readyAt - now) / 60000);
      const secs = Math.floor(((readyAt - now) % 60000) / 1000);
      const msg = isGlobal
        ? `🌐 Another player just spun this stop. Ready in ${mins}m ${secs}s`
        : ` Recharging! Available again in ${mins}m ${secs}s`;
      if (typeof showToast === "function") showToast(msg, 3000);
      return;
    }

    spinning = true;
    const discEl = document.getElementById("elden-spin-disc");
    if (discEl) {
      discEl.classList.add("spinning");
      discEl.style.transform = "";
    }
    const hint = document.getElementById("elden-swipe-hint");
    if (hint) hint.textContent = "Absorbing crimson energy…";

    // 2.5s cinematic rotation, server validated while the disc twirls
    setTimeout(() => {
      resolveSpin();
    }, 2500);
  }

  async function resolveSpin() {
    const stopId = selectedStopId;
    const stop = globalStops[stopId];
    try {
      if (!stop) return finishSpinFailure();
      if (typeof ServerAntiCheat === "undefined" || !ServerAntiCheat.isReady()) {
        if (typeof showToast === "function") showToast("⚠️ Server connection required to spin.", 3000);
        return finishSpinFailure();
      }

      // Force a fresh GPS ping so stationary players never hit "no_position"
      if (playerPos && ServerAntiCheat.sendPosition) {
        try {
          await ServerAntiCheat.sendPosition({
            latitude: playerPos.lat,
            longitude: playerPos.lon,
            accuracy: 10,
            altitude: null,
            speed: null,
            altitudeAccuracy: null,
            timestamp: Date.now(),
          }, true);
        } catch (e) {}
      }

      const result = await ServerAntiCheat.spinEldenStop(stopId, playerPos ? playerPos.lat : undefined, playerPos ? playerPos.lon : undefined);

      if (!result || !result.ok) {
        if (result && result.reason === "cooldown") {
          if (result.readyAt) setReadyAt(stopId, result.readyAt);
          if (typeof showToast === "function") showToast(result.message || "⏳ This Elden Stop is recharging.", 3500);
        } else if (result && result.reason === "global_cooldown") {
          // Global cooldown — another player just spun it, show purple for everyone
          if (result.readyAt) setGlobalCooldown(stopId, result.readyAt);
          if (typeof showToast === "function") showToast(result.message || "🌐 Another player just spun this stop. Wait a few minutes.", 3500);
        } else if (result && result.reason === "under_construction") {
          const stop = globalStops[stopId];
          if (stop && result.waitMs) stop.constructionFinish = Date.now() + Number(result.waitMs);
          if (typeof showToast === "function") showToast(result.message || "🏗️ This Elden Stop is still under construction.", 3500);
          renderAll();
        } else if (result && result.reason === "too_far") {
          if (typeof showToast === "function") showToast("🚶 Too far away — stand beside the beacon to spin.", 3000);
        } else if (result && result.reason === "no_position") {
          if (typeof showToast === "function") showToast("📍 Waiting for GPS lock — try again in a moment.", 3000);
        } else {
          if (typeof showToast === "function") showToast("⚠️ The disc could not be charged. Try again.", 3000);
        }
        return finishSpinFailure();
      }

      // Success! Cache the 15-minute recharge window locally
      setReadyAt(stopId, Number(result.readyAt) || Date.now() + COOLDOWN_MS());
      celebrateRewards(result);
    } catch (e) {
      console.warn("[EldenStops] Spin failed:", e);
      finishSpinFailure();
    }
  }

  function finishSpinFailure() {
    spinning = false;
    const discEl = document.getElementById("elden-spin-disc");
    if (discEl) {
      discEl.classList.remove("spinning");
      discEl.style.transform = "";
    }
    const hint = document.getElementById("elden-swipe-hint");
    if (hint) hint.textContent = "Swipe the Dyson Disc to absorb its energy!";
    syncOverlayCooldown();
  }

  // ---------------- REWARD VFX ----------------
  function discCenter() {
    const discEl = document.getElementById("elden-spin-disc");
    if (discEl) {
      const r = discEl.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  }

  function spawnFloatingText(x, y, htmlContent) {
    const popup = document.createElement("div");
    popup.className = "combat-text-popup";
    popup.style.left = `${x}px`;
    popup.style.top = `${y}px`;
    popup.innerHTML = htmlContent;
    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 2100);
  }

  function spawnFlyingGems(x, y, count) {
    const targetEl = document.getElementById("stat-diamonds");
    if (!targetEl) return;
    const bounds = targetEl.getBoundingClientRect();
    const endX = bounds.left + bounds.width / 2;
    const endY = bounds.top + bounds.height / 2;
    const n = Math.min(12, count);
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        const sx = x + (Math.random() - 0.5) * 80;
        const sy = y + (Math.random() - 0.5) * 60;
        const gem = document.createElement("div");
        gem.className = "flying-3d-gem";
        gem.style.left = `${sx}px`;
        gem.style.top = `${sy}px`;
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
          gem.style.transform = `translate(${endX - sx}px, ${endY - sy}px) scale(0.4) rotate(${Math.random() * 360}deg)`;
          gem.style.opacity = "0.2";
        });
        setTimeout(() => {
          gem.remove();
          targetEl.classList.remove("hud-impact-bump");
          void targetEl.offsetWidth;
          targetEl.classList.add("hud-impact-bump");
        }, 750);
      }, i * 60);
    }
  }

  function spawnFlyingEBCoins(x, y, count) {
    const targetEl = document.getElementById("stat-eb");
    if (!targetEl) return;
    const bounds = targetEl.getBoundingClientRect();
    const endX = bounds.left + bounds.width / 2;
    const endY = bounds.top + bounds.height / 2;
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const sx = x + (Math.random() - 0.5) * 70;
        const sy = y + (Math.random() - 0.5) * 50;
        const coin = document.createElement("div");
        coin.className = "flying-eb-coin";
        coin.style.left = `${sx}px`;
        coin.style.top = `${sy}px`;
        coin.innerHTML = `<img src="assets/eb-coin.png" class="flying-coin-img">`;
        document.body.appendChild(coin);
        requestAnimationFrame(() => {
          coin.style.transform = `translate(${endX - sx}px, ${endY - sy}px) scale(0.4) rotate(${Math.random() * 360}deg)`;
          coin.style.opacity = "0.2";
        });
        setTimeout(() => {
          coin.remove();
          targetEl.classList.remove("hud-impact-bump");
          void targetEl.offsetWidth;
          targetEl.classList.add("hud-impact-bump");
        }, 750);
      }, i * 80);
    }
  }

  function celebrateRewards(result) {
    const state = Store.get();
    if (Number.isFinite(Number(result.nextDiamonds))) state.diamonds = Number(result.nextDiamonds);
    if (Number.isFinite(Number(result.nextEb))) state.eb = Number(result.nextEb);
    if (Number.isFinite(Number(result.nextBerries))) state.berries = Number(result.nextBerries);
    Store.save(true);
    if (typeof onRewards === "function") onRewards(result);

    const c = discCenter();
    if (result.diamonds > 0) {
      spawnFloatingText(c.x, c.y - 30, `+${result.diamonds} <span class="hud-gem-icon"></span>`);
      spawnFlyingGems(c.x, c.y, result.diamonds);
    }
    if (result.eb > 0) {
      setTimeout(() => {
        spawnFloatingText(c.x + 40, c.y - 10, `+${result.eb} <span class="eb-coin-icon"></span>`);
        spawnFlyingEBCoins(c.x, c.y, Math.min(5, result.eb));
      }, 250);
    }

    // Spawn berry drops on map (1-3 berries around the stop)
    if (result.berries > 0) {
      spawnBerryDrops(result.berries);
    }

    // Always reset spinning state immediately after successful spin
    spinning = false;
    const discEl = document.getElementById("elden-spin-disc");
    if (discEl) {
      discEl.classList.remove("spinning");
      discEl.style.transform = "";
    }
    const hint = document.getElementById("elden-swipe-hint");
    if (hint) hint.textContent = "⚡ Energy absorbed!";

    if (result.wonPlot) {
      addLuckyPlotToBag(result);
      // Close the stop session first to free up the player, then open lucky plot modal
      closeStopSession();
      setTimeout(() => openLuckyPlotModal(result.wonPlot.rarity), 900);
      if (typeof Feed !== "undefined") {
        const rr = CONFIG.PLOT_RARITIES.find((r) => r.key === result.wonPlot.rarity) || CONFIG.PLOT_RARITIES[0];
        Feed.broadcast("elden_stop_lucky", { rarityLabel: rr.label });
      }
    } else {
      // No plot won - close session after showing rewards
      if (spinTimeout) {
        clearTimeout(spinTimeout);
        spinTimeout = null;
      }
      spinTimeout = setTimeout(() => {
        closeStopSession();
      }, 2300);
    }
  }

  // ---------------- BERRY DROPS ----------------
  let berryMarkers = {};

  function spawnBerryDrops(count) {
    if (!map || !playerPos) return;
    const state = Store.get();
    if (!state.liveBerries) state.liveBerries = {};

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 10 + Math.random() * 30; // 10-40 meters from stop
      const lat = playerPos.lat + (Math.cos(angle) * distance) / 111320;
      const lon = playerPos.lon + (Math.sin(angle) * distance) / (111320 * Math.cos(playerPos.lat * Math.PI / 180));

      const berryId = `berry_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`;
      state.liveBerries[berryId] = {
        id: berryId,
        lat,
        lon,
        spawnedAt: Date.now(),
        stopId: selectedStopId
      };

      createBerryMarker(berryId, lat, lon);
    }

    Store.save(true);
    showToast(`🍓 ${count} Berries dropped nearby! Tap to collect!`, 3000);
  }

  function createBerryMarker(berryId, lat, lon) {
    const el = document.createElement("div");
    el.className = "berry-marker";
    el.innerHTML = `
      <div class="berry-icon">🍓</div>
      <div class="berry-glow"></div>
    `;
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      collectBerry(berryId);
    });

    const marker = new mapboxgl.Marker({ element: el })
      .setLngLat([lon, lat])
      .addTo(map);

    berryMarkers[berryId] = marker;
  }

  function collectBerry(berryId) {
    const state = Store.get();
    if (!state.liveBerries || !state.liveBerries[berryId]) return;

    const berry = state.liveBerries[berryId];
    const dist = Geo.haversine(playerPos.lat, playerPos.lon, berry.lat, berry.lon);

    if (dist > 75) {
      showToast("🚶 Walk closer to collect that berry!", 2500);
      return;
    }

    // Remove from map
    if (berryMarkers[berryId]) {
      berryMarkers[berryId].remove();
      delete berryMarkers[berryId];
    }

    // Add to inventory
    state.berries = (state.berries || 0) + 1;
    delete state.liveBerries[berryId];
    Store.save(true);

    // Visual feedback
    const marker = berryMarkers[berryId];
    if (marker) {
      const pt = map.project([berry.lon, berry.lat]);
      spawnFloatingText(pt.x, pt.y, "+1 🍓");
    }

    if (typeof CompanionPet !== "undefined") {
      CompanionPet.updatePetHUD();
    }

    showToast("🍓 Berry collected!", 2000);
  }

  function pruneExpiredBerries() {
    const state = Store.get();
    if (!state.liveBerries) return;

    const now = Date.now();
    const BERRY_LIFETIME_MS = 5 * 60 * 1000; // 5 minutes

    for (const berryId in state.liveBerries) {
      const berry = state.liveBerries[berryId];
      if (now - berry.spawnedAt > BERRY_LIFETIME_MS) {
        if (berryMarkers[berryId]) {
          berryMarkers[berryId].remove();
          delete berryMarkers[berryId];
        }
        delete state.liveBerries[berryId];
      }
    }

    Store.save(true);
  }

  function renderAllBerries() {
    if (!map || document.hidden) return;
    const state = Store.get();
    if (!state.liveBerries) state.liveBerries = {};

    // Far-zoom cull: berries are decorative — destroy markers, keep inventory data
    if (map.getZoom && map.getZoom() < (CONFIG.MAP_CULL_MIN_ZOOM || 14)) {
      for (const berryId in berryMarkers) {
        berryMarkers[berryId].remove();
        delete berryMarkers[berryId];
      }
      return;
    }

    // Remove stale markers
    for (const berryId in berryMarkers) {
      if (!state.liveBerries[berryId]) {
        berryMarkers[berryId].remove();
        delete berryMarkers[berryId];
      }
    }

    // Add missing markers
    for (const berryId in state.liveBerries) {
      if (!berryMarkers[berryId]) {
        const berry = state.liveBerries[berryId];
        createBerryMarker(berryId, berry.lat, berry.lon);
      }
    }
  }

  // ---------------- LUCKY PLOT ----------------
  function addLuckyPlotToBag(spinResult) {
    const state = Store.get();
    const result = spinResult || {};
    // Phase 2: mirror the server's authoritative bag (the new instance id).
    if (result.plotBagItems && typeof result.plotBagItems === "object") {
      state.plotBagItems = { ...result.plotBagItems };
    }
    if (result.plotBag && typeof result.plotBag === "object") {
      state.plotBag = { ...result.plotBag };
    }
    Store.save(true); // immediate sync response re-mirrors the bag as a backstop
  }

  function openLuckyPlotModal(rarityKey) {
    const rarity = CONFIG.PLOT_RARITIES.find((r) => r.key === rarityKey) || CONFIG.PLOT_RARITIES[0];
    const card = document.getElementById("lucky-plot-card");
    if (card) {
      card.classList.remove("rarity-common", "rarity-rare", "rarity-epic", "rarity-legendary");
      card.classList.add(`rarity-${rarity.key}`);
    }
    const badge = document.getElementById("lucky-plot-badge");
    if (badge) {
      badge.textContent = `${rarity.label.toUpperCase()} PLOT`;
      badge.style.borderColor = rarity.color;
      badge.style.color = rarity.color;
    }
    const rate = document.getElementById("lucky-plot-rate");
    if (rate) rate.textContent = `Passive Rent: $${rarity.rate}/s`;
    const modal = document.getElementById("lucky-plot-modal");
    if (modal) modal.classList.remove("hidden");
  }

  function closeLuckyPlotModal() {
    const modal = document.getElementById("lucky-plot-modal");
    if (modal) modal.classList.add("hidden");
    // Session state is already reset by closeStopSession() before modal opened
    const overlay = document.getElementById("elden-stop-overlay");
    if (overlay) overlay.classList.add("hidden");
    selectedStopId = null;
    spinning = false;
    for (const sid in markers) {
      markers[sid].getElement()?.classList.remove("is-active");
    }
    returnCameraAndClose();
  }

  // ---------------- PLANTING A SEED (buy-mode tile flow) ----------------
  async function plantSeed(tx, ty) {
    const state = Store.get();
    const toast = window.showToast || alert;

    if ((Number(state.eldenStopSeeds) || 0) < 1) {
      toast("🌱 You have no Elden Stop Seeds left.", 3000);
      return false;
    }
    if (typeof ServerAntiCheat === "undefined" || !ServerAntiCheat.isReady()) {
      toast("⚠️ Server connection required to plant a Beacon.", 3500);
      return false;
    }
    if (typeof Store !== "undefined" && Store.isCloudSyncComplete && !Store.isCloudSyncComplete()) {
      toast("⏳ Syncing your account data — please wait a moment...", 3000);
      return false;
    }

    // Force a fresh server-side GPS ping (stationary players must never be
    // wrongly rejected by the planting proximity gate).
    if (playerPos) {
      try {
        await ServerAntiCheat.sendPosition({
          latitude: playerPos.lat,
          longitude: playerPos.lon,
          accuracy: 10,
          altitude: null,
          speed: null,
          altitudeAccuracy: null,
          timestamp: Date.now(),
        }, true);
      } catch (e) {}
    }

    toast("📡 Scanning OpenStreetMap for public landmark anchors…", 2500);
    const result = await ServerAntiCheat.plantEldenStop(tx, ty);

    if (!result || !result.ok) {
      const reason = result && result.reason;
      if (result && result.message) toast(result.message, 5000);
      else if (reason === "no_seed") toast("🌱 You have no Elden Stop Seeds left.", 3000);
      else if (reason === "too_far") toast("🚶 Stand directly on the tile to plant a Beacon.", 3000);
      else if (reason === "stop_exists") toast("⚔️ An Elden Stop already anchors this tile.", 3000);
      else if (reason === "plot_claimed") toast("⚠️ That tile is owned land — find a public landmark.", 3000);
      else if (reason === "estate_limit") toast("Sorry — only one Legendary Estate stop is allowed at your home base. Please plant elsewhere in a public place.", 5000);
      else if (reason === "rate_limited") toast("⏳ Slow down, planter — try again in a minute.", 3000);
      else toast("⚠️ The Beacon seed failed to take root. Try again.", 3000);
      return false;
    }

    state.eldenStopSeeds = Number(result.nextSeeds) || 0;
    Store.save(true);
    if (typeof Feed !== "undefined") {
      Feed.broadcast("elden_stop_planted", { name: (result.stop && result.stop.poiName) || "a landmark" });
    }
    toast("🏗️ Beacon seed took root — construction begins! Your Dyson Disc comes online in 30 minutes.", 4500);
    renderAll();
    return true;
  }

  // ---------------- LIFECYCLE ----------------
  function init(mapInstance, callbacks) {
    map = mapInstance;
    onRewards = (callbacks && callbacks.onRewards) || onRewards;

    listen();
    renderAll();
    wireDiscPhysics();

    document.getElementById("elden-stop-close")?.addEventListener("click", closeStopSession);
    document.getElementById("claim-lucky-plot-btn")?.addEventListener("click", closeLuckyPlotModal);
    document.getElementById("lucky-plot-close")?.addEventListener("click", closeLuckyPlotModal);

    // Block double-tap zoom during the cinematic
    const overlay = document.getElementById("elden-stop-overlay");
    if (overlay) {
      let lastTap = 0;
      overlay.addEventListener("touchstart", (e) => {
        const now = Date.now();
        if (now - lastTap < 300) {
          e.preventDefault();
        }
        lastTap = now;
      }, { passive: false });
    }

    // 1-second ticker: recharge countdowns (purple → crimson) + construction growth
    setInterval(() => {
      if (document.hidden) return;
      const now = Date.now();
      let needsRender = false;

      for (const sid in markers) {
        const stop = globalStops[sid];
        if (stop && buildFinish(stop) > now) {
          // Tick the construction billboard countdown
          const cd = markers[sid].getElement() && markers[sid].getElement().querySelector(".elden-construct-countdown");
          if (cd) cd.textContent = formatCountdown(buildFinish(stop) - now);
        } else if (stop && buildFinish(stop) > 0 && !announcedBuilds[sid]) {
          // 🏗️ → 🗼 Growth complete: promote to a live Dyson Disc beacon!
          announcedBuilds[sid] = true;
          justActivated.add(sid);
          needsRender = true;
          if (playerPos && Geo.haversine(playerPos.lat, playerPos.lon, Number(stop.lat), Number(stop.lon)) <= 150) {
            if (typeof showToast === "function") showToast(`🗼 ${stop.poiName || "Elden Stop"} is ONLINE — spin the Dyson Disc!`, 4500);
          }
        }

        const readyAt = getReadyAt(sid);
        const globalAt = getGlobalCooldown(sid);
        if (readyAt > 0 && readyAt < now + COOLDOWN_MS()) refreshStopVisual(sid);
        if (globalAt > 0 && globalAt < now + 300000) refreshStopVisual(sid); // 5 min global
      }

      if (needsRender) renderAll();
      syncOverlayCooldown();
    }, 1000);
  }

  function setPlayerPosition(lat, lon) {
    playerPos = { lat, lon };
    const now = Date.now();
    const distMoved = lastRenderPos ? Geo.haversine(lastRenderPos.lat, lastRenderPos.lon, lat, lon) : 999;
    if (distMoved > 2 || (now - lastPosUpdate > 3000)) {
      lastPosUpdate = now;
      lastRenderPos = { lat, lon };
      renderAll();
      pruneExpiredBerries();
      renderAllBerries();
    }
  }

  return { init, setPlayerPosition, renderAll, plantSeed, isCinematicOpen, closeStopSession, spawnBerryDrops, collectBerry, renderAllBerries };
})();
