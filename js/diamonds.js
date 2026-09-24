// ============================================================
// Elden Earth — diamonds (Mapbox GL JS 3D Native Engine)
// Guaranteed 360° Horizon Field & Couch Play Spawner
// ============================================================
const Diamonds = (() => {
  let map = null;
  let markers = {};        // id -> Mapbox Marker
  let playerPos = null;    // {lat, lon}
  let onCollect = () => {};
  let onDenied = () => {};
  let spawnTimer = null;
  let spawnInFlight = false;

  // Floating Combat Text Helper
  function spawnFloatingText(x, y, htmlContent) {
    const popup = document.createElement("div");
    popup.className = "combat-text-popup";
    popup.style.left = `${x}px`;
    popup.style.top = `${y}px`;
    popup.innerHTML = htmlContent;
    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 2100);
  }

  // Flying 3D Gem Arc Particle to HUD
  function spawnFlyingGemToHUD(startX, startY) {
    const targetEl = document.getElementById("stat-diamonds");
    if (!targetEl) return;

    const targetBounds = targetEl.getBoundingClientRect();
    const endX = targetBounds.left + targetBounds.width / 2;
    const endY = targetBounds.top + targetBounds.height / 2;

    const gem = document.createElement("div");
    gem.className = "flying-3d-gem";
    gem.style.left = `${startX}px`;
    gem.style.top = `${startY}px`;
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
      gem.style.transform = `translate(${endX - startX}px, ${endY - startY}px) scale(0.4) rotate(360deg)`;
      gem.style.opacity = "0.2";
    });

    setTimeout(() => {
      gem.remove();
      targetEl.classList.remove("hud-impact-bump");
      void targetEl.offsetWidth;
      targetEl.classList.add("hud-impact-bump");
    }, 750);
  }

  // Mini Particle Burst Explosion on Tap
  function triggerParticleExplosion(x, y) {
    const container = document.createElement("div");
    container.className = "gem-explosion-container";
    container.style.left = x + "px";
    container.style.top = y + "px";
    document.body.appendChild(container);

    for (let i = 0; i < 10; i++) {
      const p = document.createElement("span");
      p.className = "burst-spark";
      const angle = (i / 10) * 360 + (Math.random() * 20 - 10);
      const dist = 30 + Math.random() * 35;
      const rad = (angle * Math.PI) / 180;
      p.style.setProperty("--tx", `${Math.cos(rad) * dist}px`);
      p.style.setProperty("--ty", `${Math.sin(rad) * dist}px`);
      container.appendChild(p);
    }
    setTimeout(() => container.remove(), 700);
  }

  // DOM-Level LOD: Far diamonds have ZERO sub-tags (Eliminates 100+ Web Animations in DevTools!)
  function createGemElement(dim, did) {
    const el = document.createElement("div");
    el.className = "diamond-3d-wrapper" + (dim ? " far" : "");

    if (dim) {
      // 🚀 FAR DIAMOND: Pure static SVG crystal (0 animations, 0 shadows, 0 sparkles registered!)
      el.innerHTML = `
        <div class="gem-anchor">
          <div class="gem-3d static-crystal">
            <svg viewBox="0 0 32 38" class="gem-svg">
              <polygon points="16,2 29,12 16,16 3,12" fill="#ff4d6d"/>
              <polygon points="3,12 16,16 16,36" fill="#8b0000"/>
              <polygon points="29,12 16,16 16,36" fill="#e60026"/>
              <polygon points="16,2 20,8 16,16 12,8" fill="rgba(255,255,255,0.85)"/>
            </svg>
          </div>
        </div>
      `;
    } else {
      // 💎 NEAR DIAMOND: Full rich 3D hover, shadow pulse & star sparkles!
      const randomDuration = (2.8 + Math.random() * 0.8).toFixed(2) + "s";
      const randomDelay = (-Math.random() * 3.0).toFixed(2) + "s";

      el.innerHTML = `
        <div class="gem-anchor" style="--hover-dur:${randomDuration}; --hover-delay:${randomDelay};">
          <div class="gem-shadow"></div>
          <div class="gem-3d">
            <svg viewBox="0 0 32 38" class="gem-svg">
              <polygon points="16,2 29,12 16,16 3,12" fill="#ff4d6d"/>
              <polygon points="3,12 16,16 16,36" fill="#8b0000"/>
              <polygon points="29,12 16,16 16,36" fill="#e60026"/>
              <polygon points="16,2 20,8 16,16 12,8" fill="rgba(255,255,255,0.85)"/>
            </svg>
            <div class="gem-sparkle-1">✦</div>
          </div>
        </div>
      `;
    }

    el.addEventListener("click", (e) => {
      e.stopPropagation();
      attemptCollect(did);
    });
    return el;
  }

  function id() {
    return "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function withinCollectRange(lat, lon) {
    if (!playerPos) return false;
    return Geo.haversine(playerPos.lat, playerPos.lon, lat, lon) <= (CONFIG.DIAMOND_COLLECT_RADIUS_METERS || 75);
  }

  function renderAll() {
    if (!map || document.hidden) return;
    const state = Store.get();
    if (!state.liveDiamonds) state.liveDiamonds = {};
    const live = state.liveDiamonds;

    // Far-zoom cull: diamonds are decorative — destroy markers, keep data
    if (map.getZoom && map.getZoom() < (CONFIG.MAP_CULL_MIN_ZOOM || 14)) {
      for (const mid in markers) {
        markers[mid].remove();
        delete markers[mid];
      }
      return;
    }

    // Remove stale markers
    for (const mid in markers) {
      if (!live[mid]) {
        markers[mid].remove();
        delete markers[mid];
      }
    }

    const collected = new Set(state.collectedDiamondIds || []);

    for (const did in live) {
      if (collected.has(did)) {
        delete live[did];
        continue;
      }
      const d = live[did];

      // Keep all diamonds within 1,500m visible on the 3D horizon
      if (playerPos) {
        const distToPlayer = Geo.haversine(playerPos.lat, playerPos.lon, d.lat, d.lon);
        if (distToPlayer > 1500) {
          if (markers[did]) { markers[did].remove(); delete markers[did]; }
          continue;
        }
      }

      const dim = !withinCollectRange(d.lat, d.lon);

      if (markers[did]) {
        const el = markers[did].getElement();
        const wasDim = el ? el.classList.contains("far") : false;
        // If proximity state changed (e.g. player walked into reach), rebuild DOM to attach/detach animations cleanly
        if (wasDim !== dim) {
          markers[did].remove();
          delete markers[did];
        }
      }

      if (!markers[did]) {
        const el = createGemElement(dim, did);
        const m = new mapboxgl.Marker({
          element: el,
          pitchAlignment: "viewport",    // Stands vertically upright in 3D
          rotationAlignment: "viewport", // Faces player camera
        })
          .setLngLat([d.lon, d.lat])
          .addTo(map);

        markers[did] = m;
      }
    }
  }

  async function attemptCollect(did) {
    const state = Store.get();
    const d = state.liveDiamonds[did];
    if (!d) return;

    // No client-side distance block: the server validates proximity against
    // canonical diamond coordinates. Client caches can be stale and were
    // wrongly rejecting valid in-radius pickups.
    let serverResult = null;
    // Fallback position: map center follows the player, so a missing/stale
    // GPS fix must never block an in-radius pickup.
    let pos = playerPos;
    if (!pos && map) {
      const c = map.getCenter();
      pos = { lat: c.lat, lon: c.lng };
    }
    // 🛡️ SERVER-SIDE COLLECT — the Admin SDK owns the balance increment.
    if (typeof ServerAntiCheat === "undefined" || !ServerAntiCheat.isReady() || !pos) {
      if (typeof showToast === "function") showToast("⚠️ Server connection required to collect diamonds.", 3500);
      return;
    }

    try {
      serverResult = await ServerAntiCheat.validateCollect(
        pos.lat, pos.lon, did, d.lat, d.lon
      );
      if (!serverResult.allowed) {
        const toastFn = window.showToast || alert;
        if (serverResult.reason === "too_far") {
          // Correct stale cached coordinates when the server returns the
          // canonical Firestore location for this diamond.
          if (Number.isFinite(serverResult.canonicalLat) && Number.isFinite(serverResult.canonicalLon)) {
            d.lat = serverResult.canonicalLat;
            d.lon = serverResult.canonicalLon;
            Store.save(false);
            renderAll();
          }
          const measuredDistance = Number(serverResult.distance);
          const distanceText = Number.isFinite(measuredDistance) ? ` (${Math.round(measuredDistance)}m away)` : "";
          toastFn(`🚶 Walk closer to collect that diamond${distanceText}.`, 3000);
        } else if (serverResult.reason === "diamond_expired" || serverResult.reason === "unknown_diamond") {
          delete state.liveDiamonds[did];
          if (markers[did]) { markers[did].remove(); delete markers[did]; }
          Store.save(false);
          toastFn("💎 That diamond has vanished.", 2500);
        } else if (serverResult.reason === "position_mismatch") {
          toastFn("📍 Position updated — try again in a moment.", 3000);
        } else if (serverResult.reason === "already_collected") {
          delete state.liveDiamonds[did];
          if (markers[did]) { markers[did].remove(); delete markers[did]; }
          toastFn("💎 Already collected!", 2500);
        } else if (serverResult.reason === "velocity_check_failed") {
          toastFn("🚫 Movement anomaly — collection blocked.", 3500);
        } else if (serverResult.reason === "rate_limited") {
          toastFn("⏳ Too many taps — wait a moment.", 2500);
        } else {
          toastFn("⚠️ Collect could not be verified.", 3000);
        }
        return;
      }
    } catch (e) {
      console.warn("[Diamonds] Server validation failed:", e.message);
      if (typeof showToast === "function") showToast("⚠️ Collect could not be verified.", 3000);
      return;
    }

    if (map) {
      const pt = map.project([d.lon, d.lat]);
      triggerParticleExplosion(pt.x, pt.y);
      spawnFloatingText(pt.x, pt.y - 20, `+1 <span class="hud-gem-icon"></span>`);
      spawnFlyingGemToHUD(pt.x, pt.y);
    }

    if (!state.collectedDiamondIds) state.collectedDiamondIds = [];
    state.collectedDiamondIds.push(did);
    if (state.collectedDiamondIds.length > 100) state.collectedDiamondIds.shift();

    delete state.liveDiamonds[did];
    state.diamonds = Number(serverResult.nextDiamonds) || ((Number(state.diamonds) || 0) + 1);
    Store.save(true);
    if (markers[did]) { markers[did].remove(); delete markers[did]; }
    onCollect();
  }

  function pruneExpired() {
    const state = Store.get();
    if (!state.liveDiamonds) state.liveDiamonds = {};
    const now = Date.now();
    let changed = false;

    for (const did in state.liveDiamonds) {
      const d = state.liveDiamonds[did];
      // 1. Expire diamonds older than 30 mins
      const isExpired = (now - d.spawnedAt > (CONFIG.DIAMOND_LIFETIME_MS || 30 * 60 * 1000));
      // 2. Purge old ghost diamonds located > 1.5km away from current GPS
      const isTooFar = playerPos && (Geo.haversine(playerPos.lat, playerPos.lon, d.lat, d.lon) > 1500);

      if (isExpired || isTooFar) {
        if (markers[did]) { markers[did].remove(); delete markers[did]; }
        delete state.liveDiamonds[did];
        changed = true;
      }
    }
    if (changed) Store.save(true);
  }

  // Guaranteed Horizon Seeder: Instantly spawns 24 diamonds across 3 visible street layers
  async function seedHorizonBatch(targetCount = 24) {
    if (!playerPos) return;
    const state = Store.get();
    if (!state.liveDiamonds) state.liveDiamonds = {};
    pruneExpired();

    const curCount = Object.keys(state.liveDiamonds).length;
    if (curCount >= targetCount) return;

    // Cap close diamonds (within 100m) to max 3 — don't request more if already have 3+
    let closeCount = 0;
    for (const did in state.liveDiamonds) {
      const d = state.liveDiamonds[did];
      if (Geo.haversine(playerPos.lat, playerPos.lon, d.lat, d.lon) <= 100) closeCount++;
    }
    const wantClose = Math.max(0, 3 - closeCount);
    const requestCount = Math.min(6, targetCount - curCount); // max 6 per batch, not 12

    if (spawnInFlight || typeof ServerAntiCheat === "undefined" || !ServerAntiCheat.isReady()) return;
    spawnInFlight = true;
    const result = await ServerAntiCheat.spawnDiamonds(playerPos.lat, playerPos.lon, requestCount);
    spawnInFlight = false;
    if (!result.spawned) return;
    result.diamonds.forEach((diamond) => { state.liveDiamonds[diamond.id] = diamond; });
    state.lastDiamondSpawn = Date.now();
    Store.save(false);
    renderAll();
  }

  async function trySpawn() {
    if (!playerPos) return;
    const state = Store.get();
    if (!state.liveDiamonds) state.liveDiamonds = {};
    pruneExpired();

    const now = Date.now();
    const spawnInterval = CONFIG.DIAMOND_SPAWN_CHECK_MS || 25000;

    if (state.lastDiamondSpawn && (now - state.lastDiamondSpawn < spawnInterval)) {
      return;
    }

    const MAX_ACTIVE = CONFIG.DIAMOND_MAX_ACTIVE || 36;
    const allDiamonds = Object.keys(state.liveDiamonds).length;
    if (allDiamonds >= MAX_ACTIVE) return;

    // Count nearby diamonds specifically (within 1200m)
    let nearbyCount = 0;
    for (const did in state.liveDiamonds) {
      const d = state.liveDiamonds[did];
      if (Geo.haversine(playerPos.lat, playerPos.lon, d.lat, d.lon) <= 1200) {
        nearbyCount++;
      }
    }

    const TARGET_NEARBY = 6;
    if (nearbyCount < TARGET_NEARBY) {
      const toSpawn = Math.min(6, TARGET_NEARBY - nearbyCount, MAX_ACTIVE - allDiamonds);
      if (toSpawn > 0) await seedHorizonBatch(toSpawn);
    }
  }

  function init(mapboxMap, callbacks) {
    map = mapboxMap;
    onCollect = callbacks.onCollect || onCollect;
    onDenied = callbacks.onDenied || onDenied;
    pruneExpired();
    renderAll();

    if (spawnTimer) clearInterval(spawnTimer);
    spawnTimer = setInterval(trySpawn, CONFIG.DIAMOND_SPAWN_CHECK_MS || 25000);
  }

  let lastPosUpdate = 0;
  let lastRenderPos = null;

  function setPlayerPosition(lat, lon) {
    const now = Date.now();
    playerPos = { lat, lon };

    // 1. Prune ghost diamonds outside 1.5km
    pruneExpired();

    // 2. Count nearby live diamonds
    const state = Store.get();
    let nearbyCount = 0;
    for (const did in (state.liveDiamonds || {})) {
      const d = state.liveDiamonds[did];
      if (Geo.haversine(lat, lon, d.lat, d.lon) <= 1200) {
        nearbyCount++;
      }
    }

    // 3. Seed diamonds if world is sparse
    if (nearbyCount < 6) {
      seedHorizonBatch(6);
    }

    const storedPosition = Store.get().lastDiamondPlayerPosition;
    const movedDistance = storedPosition
      ? Geo.haversine(storedPosition.lat, storedPosition.lon, lat, lon)
      : Infinity;
    if (!storedPosition || movedDistance >= (CONFIG.DIAMOND_MOVEMENT_THRESHOLD_METERS || 10)) {
      state.lastDiamondMovementAt = now;
      state.lastDiamondPlayerPosition = { lat, lon };
      Store.save(true);
    }

    // 4. Update markers & collection proximity
    const distMoved = lastRenderPos ? Geo.haversine(lastRenderPos.lat, lastRenderPos.lon, lat, lon) : 999;
    if (distMoved > 2 || (now - lastPosUpdate > 3000)) {
      lastPosUpdate = now;
      lastRenderPos = { lat, lon };
      pruneExpired();
      trySpawn();
      renderAll();
    }
  }

  return { init, setPlayerPosition, renderAll };
})();
