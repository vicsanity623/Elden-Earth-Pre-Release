// ============================================================
// Elden Earth — 3D Citadels & Dyson Sphere Territory Holds
// Auto-Snaps All Old/New Citadels to Exact Tile Center + Ground Parcels
// ============================================================
const Citadels = (() => {
  let mapInstance = null;
  let activeMarkers = [];
  let globalCitadels = {};
  let selectedCitadelId = null;
  let playerCoords = { lat: 33.4484, lon: -112.0740 };

  // Siege Combat State
  let combatTarget = null;
  let combatShieldHP = 100;
  let needlePosition = 0;
  let needleDirection = 1;
  let needleAnimId = null;
  let isStriking = false;
  const showToast = (msg, time = 3500) => (typeof window !== "undefined" && window.showToast) ? window.showToast(msg, time) : console.log("[Citadels]", msg);

  function id() {
    return "citadel_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // --- 1. Capsule Drop Unlock & Cross-Device Sync Guard ---
  function checkCapsuleUnlock() {
    const state = Store.get();
    if (!state || !state.player?.id) return;

    if (!state.capsule) {
      state.capsule = { awarded: false, rarity: null, planted: false, tileId: null };
    }

    // CROSS-DEVICE CHECK: If player already has an active Citadel in the world, lock planted to true!
    const myCitadel = Object.values(globalCitadels).find(c => c.creatorId === state.player.id);
    if (myCitadel) {
      state.capsule.awarded = true;
      state.capsule.planted = true;
      state.capsule.tileId = myCitadel.id;
      state.capsule.rarity = myCitadel.rarity;
      return; // Already planted on another device, no second capsule!
    }

    // Trigger unlock only if never awarded and balance >= $0.01
    if (!state.capsule.awarded && (Number(state.lifetimeRent || state.cash) || 0) >= CONFIG.CITADEL_UNLOCK_BALANCE) {
      const rarities = Object.values(CONFIG.CITADEL_RARITIES);
      const totalWeight = rarities.reduce((s, r) => s + r.weight, 0);
      let roll = Math.random() * totalWeight;
      let picked = rarities[0];

      for (const r of rarities) {
        if (roll < r.weight) {
          picked = r;
          break;
        }
        roll -= r.weight;
      }

      state.capsule.awarded = true;
      state.capsule.rarity = picked.key;
      Store.save(true);

      showCapsuleDiscoveryModal(picked);
    }
  }

  function showCapsuleDiscoveryModal(rarityObj) {
    const modal = document.getElementById("capsule-reward-modal");
    const badge = document.getElementById("capsule-rarity-badge");
    const icon = document.getElementById("capsule-reward-icon");

    if (badge) {
      badge.textContent = `${rarityObj.label.toUpperCase()} CAPSULE`;
      badge.style.color = rarityObj.color;
      badge.style.borderColor = rarityObj.color;
    }
    if (icon) {
      icon.style.filter = `drop-shadow(0 0 16px ${rarityObj.color})`;
    }

    if (modal) modal.classList.remove("hidden");
  }

  //// --- 2. Planting on Tile (Strict 75m Territory Buffer Check) ---
  async function plantCapsule(tx, ty, lat, lon) {
    const state = Store.get();
    if (!state.capsule || !state.capsule.awarded || state.capsule.planted) {
      showToast("You have already planted your realm capsule!");
      return false;
    }

    if (tx === undefined || ty === undefined) {
      showToast("Please select an unoccupied tile on the grid first!");
      return false;
    }

    if (typeof ServerAntiCheat === "undefined" || !ServerAntiCheat.isReady()) {
      showToast("⚠️ Server connection required to plant a Citadel.", 3500);
      return false;
    }

    // Force a fresh server-side GPS ping first — after a relocate the
    // player_positions doc can be stale/old, which made plant reject as too_far.
    if (playerCoords && ServerAntiCheat.sendPosition) {
      try {
        await ServerAntiCheat.sendPosition({
          latitude: playerCoords.lat,
          longitude: playerCoords.lon,
          accuracy: 10,
          altitude: null,
          speed: null,
          altitudeAccuracy: null,
          timestamp: Date.now(),
        }, true);
      } catch (e) {}
    }

    const serverResult = await ServerAntiCheat.citadelAction("plant", { tx, ty });
    if (!serverResult.ok) {
      if (serverResult.reason === "too_far") {
        showToast("🚶 Stand directly on the empty tile to plant your Citadel.", 4000);
      } else {
        showToast("⚠️ Citadel planting rejected: " + serverResult.reason, 3500);
      }
      return false;
    }
    const serverCitadel = serverResult.citadel;
    state.capsule.planted = true;
    state.capsule.tileId = serverCitadel.id;
    state.capsule.relocated = false;
    globalCitadels[serverCitadel.id] = serverCitadel;
    Store.save(true);
    render();
    showToast(`🔮 Citadel planted on Tile [${serverCitadel.tx}, ${serverCitadel.ty}]! Stronghold parcel activated!`);
    return true;

    const cid = id();
    const rarity = state.capsule.rarity || "common";
    const wasRelocated = state.capsule.relocated === true;
    const now = Date.now();
    const growthFinish = now + (CONFIG.CITADEL_GROWTH_MS || 1800000);
    const ts = CONFIG.TILE_SIZE_METERS || 6.096;

    const tileX = parseInt(tx, 10);
    const tileY = parseInt(ty, 10);

    // 1. Exact mathematical center of the selected tile
    const center = Geo.fromMercator(
      tileX * ts + ts / 2,
      tileY * ts + ts / 2
    );

    const citadelData = {
      id: cid,
      tx: tileX,
      ty: tileY,
      lat: center.lat,
      lon: center.lon,
      rarity,
      creatorId: state.player?.id || "guest",
      creatorName: state.player?.name || "Traveler",
      createdAt: now,
      growthFinish,
      isGrown: false,
      defender: {
        id: state.player?.id || "guest",
        name: state.player?.name || "Traveler",
        avatar: state.player?.avatar || "🙂",
        startedAt: growthFinish,
      }
    };

    state.capsule.planted = true;
    state.capsule.tileId = cid;
    delete state.capsule.relocated;
    globalCitadels[cid] = citadelData;
    Store.save(true);

    if (!wasRelocated && typeof Feed !== "undefined") {
      Feed.broadcast("land", { rarity: `${CONFIG.CITADEL_RARITIES[rarity].label} Citadel`, location: "the Realm 🌐" });
    }

    render();
    showToast(`🔮 Citadel planted on Tile [${tileX}, ${tileY}]! Stronghold parcel activated!`);
    return true;
  }

  // Create 10X Colossal 3D Dyson Sphere Monument Marker (Handles Growth & Evolution)
  function createDysonSphereMarker(citadel) {
    const wrap = document.createElement("div");
    wrap.className = "citadel-3d-monument";
    const now = Date.now();

    // Check if either initial build OR 10-minute evolution is active
    const activeFinish = citadel.isEvolving ? citadel.evolutionFinish : citadel.growthFinish;
    const isUnderConstruction = activeFinish && now < activeFinish;
    const displayRarity = citadel.isEvolving ? (citadel.targetRarity || citadel.rarity) : citadel.rarity;
    const rConfig = CONFIG.CITADEL_RARITIES[displayRarity] || CONFIG.CITADEL_RARITIES.common;

    if (isUnderConstruction) {
      const remainingSec = Math.max(0, Math.floor((activeFinish - now) / 1000));
      const mins = Math.floor(remainingSec / 60);
      const secs = remainingSec % 60;
      const labelPrefix = citadel.isEvolving ? "⚡ Evolving" : "⏳";

      wrap.innerHTML = `
        <div class="citadel-growth-pin" style="--r-color: ${rConfig.color}">
          <div class="growth-ground-pulse"></div>
          <div class="growth-pin-stem"></div>
          <div class="growth-seed-core">${citadel.isEvolving ? "⚡" : "🔮"}</div>
          <div class="growth-timer-pill" data-finish="${activeFinish}" data-cid="${citadel.id}">${labelPrefix} ${mins}:${String(secs).padStart(2, "0")}</div>
        </div>
      `;
    } else {
      const defAvatar = citadel.defender?.avatar || "🛡️";
      const avatarHTML = defAvatar.startsWith("img:")
        ? `<img src="${defAvatar.slice(4)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
        : `<span>${defAvatar}</span>`;

      wrap.innerHTML = `
        <div class="dyson-monument-root" style="--core-color: ${rConfig.color}">
          <div class="dyson-ground-shadow"></div>
          <div class="dyson-ring ring-1"></div>
          <div class="dyson-ring ring-2"></div>
          <div class="dyson-ring ring-3"></div>
          <div class="dyson-core-avatar">${avatarHTML}</div>
          <div class="dyson-spire-tip">✦</div>
        </div>
      `;
    }

    wrap.dataset.cid = citadel.id;
    wrap.addEventListener("click", (e) => {
      e.stopPropagation();
      // Dyson sphere animations only run while the player is interacting
      wrap.classList.add("is-active");
      openCitadelModal(citadel.id);
    });

    return wrap;
  }

  function render() {
    // Battery Saver: Don't spend CPU rebuilding markers if phone is in pocket!
    if (!mapInstance || !mapInstance.getStyle() || document.hidden) return;

    const zoom = mapInstance.getZoom();

    // Hide Citadels at low zoom levels (zoom out too far)
    if (zoom < 14) {
      activeMarkers.forEach(m => m.remove());
      activeMarkers = [];
      // Only landplot tiles may remain — clear stronghold ground parcels too
      if (mapInstance.getSource("citadel-parcels-source")) {
        mapInstance.getSource("citadel-parcels-source").setData({ type: "FeatureCollection", features: [] });
      }
      return;
    }

    // --- AUTO-PROMOTE COMPLETED EVOLUTIONS ---
    const now = Date.now();
    for (const cid in globalCitadels) {
      const c = globalCitadels[cid];
      if (c.isEvolving && c.evolutionFinish && now >= c.evolutionFinish) {
        const promotedTier = c.targetRarity || "rare";
        c.rarity = promotedTier;
        c.isEvolving = false;
        delete c.evolutionFinish;
        delete c.targetRarity;

        if (c.creatorId === Store.get()?.player?.id && typeof ServerAntiCheat !== "undefined" && ServerAntiCheat.isReady()) {
          ServerAntiCheat.citadelAction("evolve", { citadelId: cid });
        }

        // Only broadcast once from the creator's own device
        const state = Store.get();
        if (typeof Feed !== "undefined" && c.creatorId === state?.player?.id) {
          Feed.broadcast("citadel_evolve", {
            creatorName: c.creatorName,
            tierName: CONFIG.CITADEL_RARITIES[promotedTier].label,
            location: "the Realm "
          });
        }
      }
    }

    activeMarkers.forEach(m => m.remove());
    activeMarkers = [];

    const citadelFeatures = [];
    const tileSize = CONFIG.TILE_SIZE_METERS || 6.096;

    for (const cid in globalCitadels) {
      const cit = globalCitadels[cid];
      const rConfig = CONFIG.CITADEL_RARITIES[cit.rarity] || CONFIG.CITADEL_RARITIES.common;

      // 1. RECALCULATE TX / TY IF MISSING (Fixes 100% of all old already-placed Citadels!)
      let tx = parseInt(cit.tx, 10);
      let ty = parseInt(cit.ty, 10);

      if (isNaN(tx) || isNaN(ty)) {
        const t = Geo.tileForLatLon(cit.lat, cit.lon, tileSize);
        tx = t.tx;
        ty = t.ty;
        cit.tx = tx;
        cit.ty = ty;
      }

      // 2. Exact Mathematical Center of the 10x10ft tile
      const center = Geo.fromMercator(
        tx * tileSize + tileSize / 2,
        ty * tileSize + tileSize / 2
      );
      const trueLat = center.lat;
      const trueLon = center.lon;

      // 3. METRO HORIZON CULLING (25km City Radius — Blocks distant states/countries)
      const state = Store.get();
      const myId = state?.player?.id;
      const isMine = (cit.creatorId === myId) || (cit.defender?.id === myId);

      // NEVER cull your own Citadel or one you are defending!
      if (!isMine && playerCoords && playerCoords.lat) {
        const distToPlayer = Geo.haversine(playerCoords.lat, playerCoords.lon, trueLat, trueLon);
        // Culls holds in distant states/countries (> 25km), but shows your entire metro area!
        if (distToPlayer > 25000) {
          continue;
        }
      }

      // 4. Build 10x10ft Ground Stronghold Parcel GeoJSON directly under the Hold
      const bounds = Geo.tileBounds(tx, ty, tileSize);
      const coords = bounds.map(pt => [pt[1], pt[0]]);
      coords.push(coords[0]); // Close polygon ring

      citadelFeatures.push({
        type: "Feature",
        properties: { color: rConfig.color },
        geometry: { type: "Polygon", coordinates: [coords] }
      });

      // 4. Mount Upright 10X 3D Monument firmly at the exact tile center
      const el = createDysonSphereMarker(cit);
      const marker = new mapboxgl.Marker({
        element: el,
        anchor: "bottom",
        offset: [0, 0],
        pitchAlignment: "viewport",
        rotationAlignment: "viewport",
      })
        .setLngLat([trueLon, trueLat])
        .addTo(mapInstance);

      activeMarkers.push(marker);
    }

    // Keep the tapped monument animating across re-renders while its modal is open
    if (selectedCitadelId && !document.getElementById("citadel-modal")?.classList.contains("hidden")) {
      activeMarkers.forEach(m => {
        const node = m.getElement();
        if (node && node.dataset.cid === selectedCitadelId) node.classList.add("is-active");
      });
    }

    // 5. Render Ground Stronghold Parcels Layer
    const geojsonData = { type: "FeatureCollection", features: citadelFeatures };

    if (mapInstance.getSource("citadel-parcels-source")) {
      mapInstance.getSource("citadel-parcels-source").setData(geojsonData);
    } else {
      mapInstance.addSource("citadel-parcels-source", { type: "geojson", data: geojsonData });

      // Solid glowing stronghold base
      mapInstance.addLayer({
        id: "citadel-parcels-fill",
        type: "fill",
        source: "citadel-parcels-source",
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": 0.55
        }
      });

      // Pulsing neon border
      mapInstance.addLayer({
        id: "citadel-parcels-line",
        type: "line",
        source: "citadel-parcels-source",
        paint: {
          "line-color": ["get", "color"],
          "line-width": 3,
          "line-dasharray": [2, 1]
        }
      });
    }
  }

  // --- 3. Guaranteed Progressive Defense Spoils Engine ---
  function calculateSpoils(citadel) {
    if (!citadel.defender || !citadel.defender.startedAt) return { diamonds: 0, eb: 0, hoursDefended: 0, elapsedMs: 0 };

    const rarity = citadel.rarity || "common";
    const now = Date.now();
    const elapsedMs = Math.max(0, now - citadel.defender.startedAt);
    const hours = elapsedMs / 3600000;
    const fullHours = Math.floor(hours);

    let diamondsEarned = 0;
    let ebEarned = 0;

    // Guaranteed Progressive Yields based on Rarity Tier
    if (rarity === "legendary") {
      diamondsEarned = fullHours;          // 1 Diamond every 1 hr
      ebEarned = fullHours * 3;             // Guaranteed +3 EB every 1 hr
    } else if (rarity === "epic") {
      diamondsEarned = Math.floor(hours / 1.5); // 1 Diamond every 1.5 hrs
      ebEarned = fullHours * 2;                 // Guaranteed +2 EB every 1 hr
    } else if (rarity === "rare") {
      diamondsEarned = Math.floor(hours / 2.0); // 1 Diamond every 2 hrs
      ebEarned = fullHours * 1;                 // Guaranteed +1 EB every 1 hr
    } else {
      // Common
      diamondsEarned = Math.floor(hours / 3.0); // 1 Diamond every 3 hrs
      ebEarned = Math.floor(fullHours / 2.0);   // Guaranteed +1 EB every 2 hrs
    }

    return { diamonds: diamondsEarned, eb: ebEarned, hoursDefended: hours, elapsedMs };
  }

  function openCitadelModal(cid) {
    const cit = globalCitadels[cid];
    if (!cit) return;
    selectedCitadelId = cid;

    const modal = document.getElementById("citadel-modal");
    const rConfig = CONFIG.CITADEL_RARITIES[cit.rarity] || CONFIG.CITADEL_RARITIES.common;
    const state = Store.get();
    const myId = state.player?.id;

    document.getElementById("citadel-modal-rarity").textContent = rConfig.label.toUpperCase();
    document.getElementById("citadel-modal-rarity").style.color = rConfig.color;
    document.getElementById("citadel-modal-name").textContent = `${cit.creatorName}'s Hold`;
    document.getElementById("citadel-modal-coords").textContent = `Coords: [${cit.lat.toFixed(4)}, ${cit.lon.toFixed(4)}]`;

    const ebRateDesc = cit.rarity === "legendary" ? "+5 EB / hr" : cit.rarity === "epic" ? "+3 EB / hr" : cit.rarity === "rare" ? "+2 EB / hr" : "+1 EB / 2 hrs";
    const rateText = `Mining Rate: 2 Diamond / ${rConfig.diamondHours} Hrs & Guaranteed ${ebRateDesc}`;
    const rateDescEl = document.getElementById("citadel-rate-desc");
    if (rateDescEl) rateDescEl.textContent = rateText;

    const spoils = calculateSpoils(cit);
    const def = cit.defender;

    const chamberAvatar = document.getElementById("citadel-defender-avatar");
    if (chamberAvatar) {
      if (def && def.avatar) {
        chamberAvatar.innerHTML = def.avatar.startsWith("img:")
          ? `<img src="${def.avatar.slice(4)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
          : `<span style="font-size:32px;">${def.avatar}</span>`;
      } else {
        chamberAvatar.innerHTML = `<span style="font-size:32px;">🛡️</span>`;
      }
    }

    document.getElementById("citadel-defender-name").textContent = def ? def.name : "Unclaimed Hold";

    const totalSec = Math.floor(spoils.elapsedMs / 1000);
    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    document.getElementById("citadel-defense-timer").textContent = `${String(d).padStart(2, "0")}D : ${String(h).padStart(2, "0")}H : ${String(m).padStart(2, "0")}M : ${String(s).padStart(2, "0")}s`;

    const spoilDiamonds = document.getElementById("citadel-spoils-diamonds");
    const spoilEb = document.getElementById("citadel-spoils-eb");
    if (spoilDiamonds) spoilDiamonds.textContent = spoils.diamonds;
    if (spoilEb) spoilEb.innerHTML = `${spoils.eb} <span class="eb-coin-icon"></span>`;

    const actionsWrap = document.getElementById("citadel-actions-wrap");
    actionsWrap.innerHTML = "";

    const distToCitadel = Geo.haversine(playerCoords.lat, playerCoords.lon, cit.lat, cit.lon);
    const isNearby = distToCitadel <= (CONFIG.DIAMOND_COLLECT_RADIUS_METERS || 100);

    const isOwnerOrDefender = (def && def.id === myId) || (cit.creatorId === myId);

    const relocateWrap = document.getElementById("citadel-relocate-wrap");
    if (relocateWrap) {
      relocateWrap.hidden = cit.creatorId !== myId;
    }

    // 1. REIGNING DEFENDER VIEW: Show Recall and Upgrade. NEVER show Siege!
    if (def && def.id === myId) {
      const recallBtn = document.createElement("button");
      recallBtn.className = "btn btn-primary";
      recallBtn.innerHTML = `Recall (+${spoils.diamonds} <span class="hud-gem-icon"></span> & +${spoils.eb} <span class="eb-coin-icon"></span>)`;
      recallBtn.addEventListener("click", () => recallDefender(cid));
      actionsWrap.appendChild(recallBtn);

      const currentTier = (cit.rarity?.key || cit.rarity || "common").toLowerCase();
      if (currentTier !== "legendary" && !cit.isEvolving) {
        const upgradeBtn = document.createElement("button");
        upgradeBtn.className = "btn btn-citadel-upgrade";
        const costsMap = CONFIG.CITADEL_UPGRADE_COSTS || {};
        const nextInfo = costsMap[currentTier] || { nextLabel: "Rare Hold" };
        upgradeBtn.innerHTML = `⚡ Upgrade Hold to ${nextInfo.nextLabel}`;
        upgradeBtn.addEventListener("click", () => openUpgradeModal(cid));
        actionsWrap.appendChild(upgradeBtn);
      }
    } 
    // 2. UNCLAIMED HOLD VIEW: Allow Stationing (Creators can ALWAYS station!)
    else if (!def || !def.id) {
      const isCreator = (cit.creatorId === myId);
      const canStation = isNearby || isCreator;

      const stationBtn = document.createElement("button");
      stationBtn.className = "btn btn-primary";
      stationBtn.textContent = canStation ? "Station My Avatar (Defend Hold)" : "Too Far to Station (Walk Closer)";
      stationBtn.disabled = !canStation;
      stationBtn.addEventListener("click", () => stationDefender(cid));
      actionsWrap.appendChild(stationBtn);
    }
    // 3. ENEMY DEFENDER VIEW ONLY: Allow Siege (Only when someone else is defending!)
    else if (def.id !== myId) {
      const siegeBtn = document.createElement("button");
      siegeBtn.className = "btn btn-danger";
      siegeBtn.innerHTML = isNearby ? `⚔️ Initiate Siege (Cost: 1 <span class="hud-gem-icon"></span>)` : "Too Far to Attack (Walk Closer)";
      siegeBtn.disabled = !isNearby;
      siegeBtn.addEventListener("click", () => startSiege(cid));
      actionsWrap.appendChild(siegeBtn);
    }

    // Relocate button for creator (always visible for the owner)
    if (cit.creatorId === myId) {
      const relocateBtn = document.createElement("button");
      relocateBtn.className = "btn btn-secondary";
      relocateBtn.textContent = "📦 Relocate Hold";
      relocateBtn.addEventListener("click", () => relocateCitadel(cid));
      actionsWrap.appendChild(relocateBtn);
    }

    if (modal) modal.classList.remove("hidden");
  }

  async function relocateCitadel(cid) {
    const cit = globalCitadels[cid];
    const state = Store.get();
    const myId = state?.player?.id;
    if (!cit || !state || cit.creatorId !== myId) return;

    if (!(await window.gameConfirm("Relocate this Citadel? Any accrued rewards will be recalled, the tile will become unoccupied, and your capsule will return to your pocket.", { okText: "Relocate" }))) {
      return;
    }

    if (typeof ServerAntiCheat === "undefined" || !ServerAntiCheat.isReady()) {
      showToast("⚠️ Server connection required to relocate a Citadel.", 3500);
      return;
    }
    const serverResult = await ServerAntiCheat.citadelAction("relocate", { citadelId: cid });
    if (!serverResult.ok) {
      showToast("⚠️ Citadel relocation rejected: " + serverResult.reason, 3500);
      return;
    }
    state.diamonds = serverResult.nextDiamonds;
    state.eb = serverResult.nextEb;
    state.capsule = { awarded: true, planted: false, tileId: null, rarity: state.capsule?.rarity || cit.rarity, relocated: true };
    Store.save(true);
    delete globalCitadels[cid];
    selectedCitadelId = null;
    document.getElementById("citadel-modal")?.classList.add("hidden");
    render();
    showToast(`Citadel relocated. Capsule returned! +${serverResult.spoils.diamonds} Diamonds & +${serverResult.spoils.eb} EB`, 4000);
    return;

    const spoils = cit.defender?.id === myId ? calculateSpoils(cit) : { diamonds: 0, eb: 0 };
    state.diamonds = (Number(state.diamonds) || 0) + spoils.diamonds;
    state.eb = (Number(state.eb) || 0) + spoils.eb;
    state.capsule = state.capsule || {};
    state.capsule.awarded = true;
    state.capsule.planted = false;
    state.capsule.tileId = null;
    state.capsule.rarity = state.capsule.rarity || cit.rarity || "common";
    state.capsule.relocated = true;
    Store.save(true);

    delete globalCitadels[cid];

    selectedCitadelId = null;
    document.getElementById("citadel-modal")?.classList.add("hidden");
    const relocateWrap = document.getElementById("citadel-relocate-wrap");
    if (relocateWrap) relocateWrap.hidden = true;
    render();

    if (typeof showToast === "function") {
      showToast(`Citadel relocated. Capsule returned! +${spoils.diamonds} Diamonds & +${spoils.eb} EB`, 4000);
    }
  }

  async function stationDefender(cid) {
    const cit = globalCitadels[cid];
    const state = Store.get();
    if (!cit || !state) return;

    if (typeof ServerAntiCheat === "undefined" || !ServerAntiCheat.isReady()) return;
    const serverResult = await ServerAntiCheat.citadelAction("station", { citadelId: cid });
    if (!serverResult.ok) {
      showToast("⚠️ Stationing rejected: " + serverResult.reason, 3500);
      return;
    }

    cit.defender = serverResult.defender;

    document.getElementById("citadel-modal")?.classList.add("hidden");
    render();
    if (typeof showToast === "function") showToast("🛡️ Garrisoned! Defending this Citadel!");
  }

  async function recallDefender(cid) {
    const cit = globalCitadels[cid];
    const state = Store.get();
    if (!cit || !state) return;

    if (typeof ServerAntiCheat === "undefined" || !ServerAntiCheat.isReady()) {
      showToast("⚠️ Server connection required to recall a Citadel.", 3500);
      return;
    }
    const result = await ServerAntiCheat.recallCitadel(cid);
    if (!result.recalled) {
      showToast("⚠️ Citadel recall rejected: " + result.reason, 3500);
      return;
    }
    const spoils = result.spoils || { diamonds: 0, eb: 0 };
    state.diamonds = result.nextDiamonds;
    state.eb = result.nextEb;

    cit.defender = null;

    document.getElementById("citadel-modal")?.classList.add("hidden");
    render();
    if (typeof showToast === "function") {
      showToast(`🏆 Defender Recalled! Banked +${spoils.diamonds} Diamonds & +${spoils.eb} EB!`, 3500);
    }
  }
  
  // --- CITADEL UPGRADE FORGE ENGINE ---
  let upgradingCitadelId = null;

  function openUpgradeModal(cid) {
    const cit = globalCitadels[cid];
    if (!cit || cit.rarity === "legendary") return;
    upgradingCitadelId = cid;

    const currentTier = (cit.rarity?.key || cit.rarity || "common").toLowerCase();
    const fallbackCosts = {
      common: { next: "rare", eb: 50, diamonds: 75, cashRequired: 0.50, nextLabel: "Rare Hold", nextColor: "#4fd6c4" },
      rare:   { next: "epic", eb: 100, diamonds: 125, cashRequired: 0.75, nextLabel: "Epic Hold", nextColor: "#a86ee0" },
      epic:   { next: "legendary", eb: 300, diamonds: 400, cashRequired: 1.125, nextLabel: "Legendary Hold", nextColor: "#f0d38a" },
    };
    const costs = (CONFIG.CITADEL_UPGRADE_COSTS && CONFIG.CITADEL_UPGRADE_COSTS[currentTier]) || fallbackCosts[currentTier];
    if (!costs) return;

    const currentConf = (CONFIG.CITADEL_RARITIES && CONFIG.CITADEL_RARITIES[currentTier]) || { label: "Common Hold", color: "#8fa3b8", diamondHours: 3 };
    const nextConf = (CONFIG.CITADEL_RARITIES && CONFIG.CITADEL_RARITIES[costs.next]) || { label: costs.nextLabel, color: costs.nextColor, diamondHours: 2 };

    document.getElementById("forge-current-tier").textContent = currentConf.label;
    document.getElementById("forge-current-tier").style.color = currentConf.color;
    document.getElementById("forge-current-perk").textContent = `1 ◆ / ${currentConf.diamondHours} hrs`;

    document.getElementById("forge-next-tier").textContent = nextConf.label;
    document.getElementById("forge-next-tier").style.color = nextConf.color;
    document.getElementById("forge-next-perk").textContent = `1 ◆ / ${nextConf.diamondHours} hrs & +${nextConf.ebAmount || 1} EB/hr`;

    document.getElementById("forge-cost-eb").textContent = costs.eb;
    document.getElementById("forge-cost-diamonds").textContent = costs.diamonds;

    // Cash balance lock (same pattern as extractor)
    const state = Store.get();
    const cashBalance = Number(state?.cash) || 0;
    const cashReq = costs.cashRequired || 0;
    const hasEnoughCash = cashBalance >= cashReq;

    const forgePayWrap = document.querySelector(".forge-payment-actions");
    const forgeLockedNotice = document.getElementById("forge-locked-notice");
    const forgeBtns = forgePayWrap ? forgePayWrap.querySelectorAll("button") : [];

    if (hasEnoughCash) {
      forgeBtns.forEach(b => b.style.display = "");
      if (forgeLockedNotice) {
        forgeLockedNotice.classList.remove("hidden");
        forgeLockedNotice.innerHTML = cashReq > 0
          ? `💰 Upgrading consumes <strong>$${cashReq.toFixed(2)}</strong> Cash + ${costs.eb} EB or ${costs.diamonds} ◆`
          : "";
        if (cashReq <= 0) forgeLockedNotice.classList.add("hidden");
      }
    } else {
      forgeBtns.forEach(b => b.style.display = "none");
      if (forgeLockedNotice) {
        forgeLockedNotice.classList.remove("hidden");
        forgeLockedNotice.innerHTML = `🔒 Reach $${cashReq.toFixed(2)} Cash Balance to level up!`;
      }
    }

    document.getElementById("citadel-modal")?.classList.add("hidden");
    document.getElementById("citadel-upgrade-modal")?.classList.remove("hidden");
  }

  async function executeUpgrade(paymentType) {
    if (!upgradingCitadelId) return;
    const cit = globalCitadels[upgradingCitadelId];
    if (!cit) return;

    const costs = CONFIG.CITADEL_UPGRADE_COSTS[cit.rarity];
    if (!costs) return;

    const state = Store.get();

    // Cash balance gate — must have enough to level up
    const cashBalance = Number(state?.cash) || 0;
    const cashReq = costs.cashRequired || 0;
    if (cashBalance < cashReq) {
      showToast(`🔒 Reach $${cashReq.toFixed(2)} Cash Balance to level up!`);
      return;
    }

    if (typeof ServerAntiCheat === "undefined" || !ServerAntiCheat.isReady()) {
      showToast("⚠️ Server connection required to upgrade a Citadel.", 3500);
      return;
    }
    const serverResult = await ServerAntiCheat.citadelAction("upgrade", { citadelId: cit.id, paymentType });
    if (!serverResult.ok) {
      showToast("⚠️ Citadel upgrade rejected: " + serverResult.reason, 3500);
      return;
    }
    state.eb = serverResult.nextEb;
    state.diamonds = serverResult.nextDiamonds;
    // Mirror the cash sink immediately — if local cash stayed high, the next
    // sync's max-merge would silently refund the upgrade cost.
    if (Number.isFinite(Number(serverResult.nextCash))) {
      state.cash = Math.max(0, Number(serverResult.nextCash));
    }
    cit.isEvolving = true;
    cit.evolutionFinish = serverResult.evolutionFinish;
    cit.targetRarity = serverResult.targetRarity;
    Store.save(true);
    document.getElementById("citadel-upgrade-modal")?.classList.add("hidden");
    render();
    showToast("⚡ Citadel Evolution started! 10-minute transformation underway!", 4000);
    return;

    // Verify balance
    if (paymentType === "eb") {
      if ((Number(state.eb) || 0) < costs.eb) {
        showToast(`You need ${costs.eb} EB to forge this upgrade!`);
        return;
      }
      state.eb -= costs.eb;
    } else {
      if ((Number(state.diamonds) || 0) < costs.diamonds) {
        showToast(`You need ${costs.diamonds} Diamonds to forge this upgrade!`);
        return;
      }
      state.diamonds -= costs.diamonds;
    }

    Store.save(true);

    // Trigger 10-Minute Evolution Timer
    const now = Date.now();
    const evoFinish = now + (CONFIG.CITADEL_EVOLUTION_MS || 600000);

    cit.isEvolving = true;
    cit.evolutionFinish = evoFinish;
    cit.targetRarity = costs.next;

    document.getElementById("citadel-upgrade-modal")?.classList.add("hidden");
    render();

    if (typeof showToast === "function") {
      showToast(`⚡ Citadel Evolution started! 10-minute transformation underway!`, 4000);
    }
  }

  // --- 4. Reflex Meter Siege Battle ---
  function startSiege(cid) {
    const state = Store.get();
    const targetCit = globalCitadels[cid];

    // Rule 1: Must have unlocked and planted your own Capsule first!
    if (!state.capsule || !state.capsule.planted) {
      (window.showToast || alert)("🛡️ You must reach $0.01 balance and plant your own Realm Capsule before you can launch Sieges against other players!");
      return;
    }

    // Rule 2: Cannot attack any Citadel within 250 meters of your own Citadel
    const myCitadel = Object.values(globalCitadels).find(c => c.creatorId === state.player?.id);
    if (myCitadel && targetCit) {
      const distToMyHold = Geo.haversine(myCitadel.lat, myCitadel.lon, targetCit.lat, targetCit.lon);
      if (distToMyHold < 250) {
        (window.showToast || alert)(`🛡️ Peace Treaty Active: You cannot siege holds within 250 meters of your own Citadel (currently ${Math.round(distToMyHold)}m away). Travel further to conquer foreign lands!`);
        return;
      }
    }

    // Anti-Exploit Security Check: Block self-sieges completely!
    if (targetCit && targetCit.defender && targetCit.defender.id === state.player?.id) {
      (window.showToast || alert)("🛡️ You already hold this Citadel! You cannot siege yourself.");
      return;
    }
    
    if ((Number(state.diamonds) || 0) < CONFIG.CITADEL_SIEGE_COST_DIAMONDS) {
      (window.showToast || alert)("You need at least 1 Diamond to initiate a Siege!");
      return;
    }

    state.diamonds = Math.max(0, (Number(state.diamonds) || 0) - CONFIG.CITADEL_SIEGE_COST_DIAMONDS);
    Store.save(true);

    document.getElementById("citadel-modal")?.classList.add("hidden");
    combatTarget = globalCitadels[cid];
    combatShieldHP = 100;
    isStriking = false;

    const siegeModal = document.getElementById("siege-modal");
    updateSiegeHPBar();

    const needleEl = document.getElementById("reflex-needle");
    needlePosition = 0;
    needleDirection = 1;

    function runNeedle() {
      needlePosition += needleDirection * 2.8;
      if (needlePosition >= 96) { needlePosition = 96; needleDirection = -1; }
      if (needlePosition <= 2) { needlePosition = 2; needleDirection = 1; }

      if (needleEl) needleEl.style.left = `${needlePosition}%`;
      needleAnimId = requestAnimationFrame(runNeedle);
    }
    needleAnimId = requestAnimationFrame(runNeedle);

    if (siegeModal) siegeModal.classList.remove("hidden");
  }

  function updateSiegeHPBar() {
    const hpBar = document.getElementById("siege-hp-bar");
    const hpText = document.getElementById("siege-hp-text");
    if (hpBar) hpBar.style.width = `${Math.max(0, combatShieldHP)}%`;
    if (hpText) hpText.textContent = `${Math.max(0, combatShieldHP)} / 100 HP`;
  }

  function handleSiegeStrike() {
    if (isStriking || combatShieldHP <= 0) return;
    isStriking = true;

    const isCritical = needlePosition >= 40 && needlePosition <= 60;
    const isHit = needlePosition >= 25 && needlePosition <= 75;

    let dmg = 0;
    if (isCritical) {
      dmg = 45 + Math.floor(Math.random() * 10);
      if (typeof showToast === "function") showToast("💥 CRITICAL HIT! -50 Shield HP!");
    } else if (isHit) {
      dmg = 25 + Math.floor(Math.random() * 8);
      if (typeof showToast === "function") showToast("⚔️ Clean Strike! -25 Shield HP!");
    } else {
      dmg = 10;
      if (typeof showToast === "function") showToast("🛡️ Glancing Blow! -10 HP!");
    }

    combatShieldHP -= dmg;
    updateSiegeHPBar();

    if (combatShieldHP <= 0) {
      cancelAnimationFrame(needleAnimId);
      setTimeout(() => completeConquest(), 400);
    } else {
      setTimeout(() => { isStriking = false; }, 350);
    }
  }

  async function completeConquest() {
    const state = Store.get();
    const cit = combatTarget;
    if (!cit || !state) return;

    document.getElementById("siege-modal")?.classList.add("hidden");

    if (typeof ServerAntiCheat === "undefined" || !ServerAntiCheat.isReady()) {
      showToast("⚠️ Server connection required to complete the siege.", 3500);
      return;
    }
    const result = await ServerAntiCheat.conquerCitadel(
      cit.id,
      playerCoords.lat,
      playerCoords.lon,
      state.player?.name || "Traveler",
      state.player?.avatar || "🙂"
    );
    if (!result.conquered) {
      showToast("⚠️ Siege rejected: " + result.reason, 3500);
      return;
    }
    state.eb = result.nextEb;
    state.diamonds = result.nextDiamonds;

    const oldDefenderName = cit.defender?.name || "Defender";

    cit.defender = result.defender;

    if (typeof Feed !== "undefined") {
      Feed.broadcast("land", {
        rarity: `⚔️ ${state.player?.name || "Traveler"} breached the ${cit.creatorName}'s Hold & dethroned ${oldDefenderName}! (+5 EB Bounty)`,
        location: "the Realm 🌐"
      });
    }

    render();
    if (typeof showToast === "function") {
      showToast("🏆 CITADEL BREACHED! You are the new Reigning Defender! (+5 EB Bounty)", 4000);
    }
  }

  function listen() {
    const db = Store.getDb();
    if (!db) return;

    try {
      db.collection("citadels").onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          const cid = change.doc.id;
          const data = change.doc.data();
          if (change.type === "added" || change.type === "modified") {
            globalCitadels[cid] = data;
          } else if (change.type === "removed") {
            delete globalCitadels[cid];
          }
        });
        render();
      });
    } catch (e) {
      console.warn("[Citadels] Sync notice:", e);
    }
  }

  function init(map) {
    mapInstance = map;

    document.getElementById("citadel-relocate-btn")?.addEventListener("click", () => {
      if (selectedCitadelId) relocateCitadel(selectedCitadelId);
    });

    document.getElementById("plant-capsule-btn")?.addEventListener("click", () => {
      document.getElementById("capsule-reward-modal")?.classList.add("hidden");
      if (typeof showToast === "function") {
        showToast("📍 Enter BUY LAND mode & tap an unowned tile to plant your Citadel!", 3500);
      }
    });

    document.getElementById("siege-strike-btn")?.addEventListener("click", handleSiegeStrike);
    document.getElementById("forge-pay-eb-btn")?.addEventListener("click", () => executeUpgrade("eb"));
    document.getElementById("forge-pay-diamonds-btn")?.addEventListener("click", () => executeUpgrade("diamonds"));

    // Clean up animation frame loop when siege modal is closed
    document.querySelectorAll("[data-close='siege-modal']").forEach(btn => {
      btn.addEventListener("click", () => {
        if (needleAnimId) {
          cancelAnimationFrame(needleAnimId);
          needleAnimId = null;
        }
      });
    });

    // Battery Saver: 1-Second Countdown Ticker (Paused when screen locked)
    setInterval(() => {
      if (document.hidden) return; // 0% CPU in pocket

      const pills = document.querySelectorAll(".growth-timer-pill[data-finish]");
      if (pills.length === 0) return; // No active timers, skip DOM work

      const now = Date.now();
      let needsReRender = false;

      pills.forEach((pill) => {
        const finish = parseInt(pill.dataset.finish, 10);
        const rem = Math.max(0, Math.floor((finish - now) / 1000));
        const cid = pill.dataset.cid;
        const cit = globalCitadels[cid];

        if (rem <= 0) {
          if (cit && cit.isEvolving) {
            // Finish Evolution & Promote Rarity!
            const newRarity = cit.targetRarity || "rare";
            cit.rarity = newRarity;
            cit.isEvolving = false;
            delete cit.evolutionFinish;
            delete cit.targetRarity;

            if (cit.creatorId === Store.get()?.player?.id && typeof ServerAntiCheat !== "undefined" && ServerAntiCheat.isReady()) {
              ServerAntiCheat.citadelAction("evolve", { citadelId: cid });
            }

            if (typeof Feed !== "undefined") {
              Feed.broadcast("citadel_evolve", {
                creatorName: cit.creatorName,
                tierName: CONFIG.CITADEL_RARITIES[newRarity].label,
                location: "the Realm 🌐"
              });
            }
          }

          pill.textContent = "✨ ASCENDED!";
          needsReRender = true;
        } else {
          const m = Math.floor(rem / 60);
          const s = rem % 60;
          pill.textContent = `⏳ ${m}:${String(s).padStart(2, "0")}`;
        }
      });

      if (needsReRender) {
        render();
      }

      // Live update defense timer and spoils when citadel modal is open
      if (selectedCitadelId && !document.getElementById("citadel-modal")?.classList.contains("hidden")) {
        const cit = globalCitadels[selectedCitadelId];
        if (cit && cit.defender) {
          const spoils = calculateSpoils(cit);
          const totalSec = Math.floor(spoils.elapsedMs / 1000);
          const dd = Math.floor(totalSec / 86400);
          const hh = Math.floor((totalSec % 86400) / 3600);
          const mm = Math.floor((totalSec % 3600) / 60);
          const ss = totalSec % 60;
          const timerEl = document.getElementById("citadel-defense-timer");
          if (timerEl) timerEl.textContent = `${String(dd).padStart(2, "0")}D : ${String(hh).padStart(2, "0")}H : ${String(mm).padStart(2, "0")}M : ${String(ss).padStart(2, "0")}s`;
          const dEl = document.getElementById("citadel-spoils-diamonds");
          const eEl = document.getElementById("citadel-spoils-eb");
          if (dEl) dEl.textContent = spoils.diamonds;
          if (eEl) eEl.innerHTML = `${spoils.eb} <span class="eb-coin-icon"></span>`;
        }
      }
    }, 1000);

    listen();
    checkCapsuleUnlock();
  }

  function setPlayerPosition(lat, lon) {
    playerCoords = { lat, lon };
  }

  function getMyCitadel() {
    const state = Store.get();
    const myId = state?.player?.id;
    if (!myId) return null;
    return Object.values(globalCitadels).find(c => c.creatorId === myId) || null;
  }

  return { init, checkCapsuleUnlock, plantCapsule, setPlayerPosition, render, getMyCitadel, relocateCitadel };
})();
