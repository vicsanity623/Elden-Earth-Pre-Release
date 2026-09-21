// ============================================================
// Elden Earth — land grid & real-time multiplayer sync (Mapbox 3D)
// ============================================================
const Grid = (() => {
  let map = null;
  let onBuyAttempt = () => {};
  let pendingTile = null;
  let globalPlots = {};
  let activeMarkers = [];
  let isBuyMode = false;
  let playerCoords = null;
  let selectedPlotId = null;

  function tileId(tx, ty) { return tx + "_" + ty; }

  function pickRarity() {
    const rarities = CONFIG.PLOT_RARITIES;
    const totalWeight = rarities.reduce((s, r) => s + r.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const r of rarities) {
      if (roll < r.weight) return r;
      roll -= r.weight;
    }
    return rarities[0];
  }

  function rarityInfo(key) {
    return CONFIG.PLOT_RARITIES.find(r => r.key === key) || CONFIG.PLOT_RARITIES[0];
  }

  function getAllPlots() {
    const state = Store.get();
    return Object.assign({}, globalPlots, state.plots);
  }

  function promptBuyTile(tx, ty) {
    // Anti-cheat: Embargo check
    if (typeof AntiCheat !== "undefined") {
      const check = AntiCheat.isActionAllowed("purchase");
      if (!check.allowed) {
        const toast = window.showToast || alert;
        toast(check.reason, 5000);
        return;
      }
    }

    const state = Store.get();

    // ⏳ 60-Second Land Purchase Cooldown (Stops rapid spam & refresh exploits)
    const now = Date.now();
    const BUY_COOLDOWN_MS = 60000; // 1 Minute Cooldown
    const lastBuy = state.lastLandPurchaseAt || 0;
    if (now - lastBuy < BUY_COOLDOWN_MS) {
      const remSec = Math.ceil((BUY_COOLDOWN_MS - (now - lastBuy)) / 1000);
      const toast = window.showToast || alert;
      toast(`⏳ Land Registry Cooldown: Please wait ${remSec}s before claiming your next parcel.`, 3000);
      return; // Block opening modal!
    }

    const ts = CONFIG.TILE_SIZE_METERS || 6.096;
    const radiusM = CONFIG.DIAMOND_COLLECT_RADIUS_METERS || 75;

    if (playerCoords && playerCoords.lat) {
      const bounds = Geo.tileBounds(tx, ty, ts);
      const cLat = (bounds[0][0] + bounds[2][0]) / 2;
      const cLon = (bounds[0][1] + bounds[2][1]) / 2;
      if (Geo.haversine(playerCoords.lat, playerCoords.lon, cLat, cLon) > radiusM) {
        return;
      }
    }
    // Strict Guest Guard: Only permanent Google accounts may claim realm land!
    const fbUser = (typeof firebase !== "undefined" && firebase.auth) ? firebase.auth().currentUser : null;
    const isGuest = fbUser ? fbUser.isAnonymous : (!state.player?.id || state.player.id.startsWith("guest-"));
    if (isGuest) {
      const toastFn = window.showToast || alert;
      toastFn("🛡️ YOU ARE A GUEST. Sign in with Google to claim permanent land plots!", 3500);
      onBuyAttempt(false, null);
      return;
    }
    const tid = tileId(tx, ty);
    const allPlots = getAllPlots();

    if (allPlots[tid]) {
      if (allPlots[tid].ownerId === state.player.id) openPlotModal(tid, allPlots[tid]);
      else showToast(`This tile is already claimed by ${allPlots[tid].ownerName || "another player"}!`);
      return;
    }

    // Check if player holds an unplanted Citadel Capsule
    const hasCapsule = state.capsule && state.capsule.awarded && !state.capsule.planted;
    const hasEldenSeed = (Number(state.eldenStopSeeds) || 0) > 0;

    // Always allow opening modal — server validates EB balance authoritatively
    pendingTile = { tx, ty };
    scheduleRender();
    const modal = document.getElementById("buy-modal");
    const plantBtn = document.getElementById("plant-capsule-confirm-btn");

    // Seamless toggle: Shows or hides the plant button without touching innerHTML!
    if (plantBtn) {
      plantBtn.style.display = hasCapsule ? "inline-block" : "none";
    }
    const eldenBtn = document.getElementById("plant-elden-stop-btn");
    if (eldenBtn) {
      eldenBtn.style.display = hasEldenSeed ? "inline-block" : "none";
      eldenBtn.textContent = `🗼 Plant Elden Stop x${Number(state.eldenStopSeeds) || 0} (Free)`;
    }
    const bagBtn = document.getElementById("plot-bag-btn");
    if (bagBtn) bagBtn.style.display = hasBagPlots(state) ? "inline-block" : "none";

    if (modal) modal.classList.remove("hidden");
  }

  function hasBagPlots(state) {
    return Object.values(state.plotBag || {}).some(count => Number(count) > 0);
  }

  function addPlotToBag(state, rarityKey) {
    state.plotBag = state.plotBag || {};
    let slot = rarityKey;
    let suffix = 0;
    while (Number(state.plotBag[slot]) >= 99) {
      suffix++;
      slot = `${rarityKey}_${suffix}`;
    }
    state.plotBag[slot] = (Number(state.plotBag[slot]) || 0) + 1;
  }

  function openPlotModal(tid, plot) {
    selectedPlotId = tid;
    const state = Store.get();
    const rarity = rarityInfo(plot.rarity);
    document.getElementById("plot-modal-rarity").textContent = `${rarity.label} PLOT`;
    document.getElementById("plot-modal-rarity").style.color = rarity.color;
    document.getElementById("plot-modal-name").textContent = `${plot.ownerName || "Traveler"}'s Plot`;
    document.getElementById("plot-modal-coords").textContent = `Coords: [${plot.tx}, ${plot.ty}]`;
    document.getElementById("plot-modal-rate").textContent = `${rarity.rate} EB / sec`;
    document.getElementById("plot-modal-location").textContent = [plot.city, plot.state, plot.country].filter(Boolean).join(", ") || "Unknown";
    // Show relocate button only for the player's own plots
    const relocateBtn = document.getElementById("plot-relocate-btn");
    if (relocateBtn) {
      relocateBtn.style.display = (plot.ownerId === state.player?.id) ? "inline-block" : "none";
    }
    document.getElementById("plot-modal")?.classList.remove("hidden");
  }

  async function relocatePlot() {
    if (!selectedPlotId) return;
    const state = Store.get();
    const plot = state.plots[selectedPlotId] || getAllPlots()[selectedPlotId];
    if (!plot || plot.ownerId !== state.player?.id) {
      showToast("⚠️ You can only relocate your own plots.", 3500);
      return;
    }

    if (!(await window.gameConfirm("Pick up this plot and add it to your Plot Bag? You can place it at a new location later.", { okText: "Pick Up" }))) {
      return;
    }

    if (typeof ServerAntiCheat === "undefined" || !ServerAntiCheat.isReady()) {
      showToast("⚠️ Server connection required to relocate a plot.", 4000);
      return;
    }

    const result = await ServerAntiCheat.pickupPlot(selectedPlotId);
    if (!result.allowed) {
      const msgs = {
        plot_not_found: "⚠️ This plot no longer exists.",
        not_your_plot: "⚠️ You can only relocate your own plots.",
        plot_already_claimed: "⚠️ This plot was just claimed by someone else!",
      };
      showToast(msgs[result.reason] || "⚠️ Could not pick up plot.", 3500);
      return;
    }

    // Update local state from server result
    state.plots = result.plots || state.plots;
    state.plotBag = result.plotBag || state.plotBag;
    delete globalPlots[selectedPlotId];
    Store.save(true);

    document.getElementById("plot-modal")?.classList.add("hidden");
    selectedPlotId = null;
    render();
    showToast(`📦 Plot picked up! Added ${result.rarity.toUpperCase()} Plot to your bag.`, 3500);
  }

  function openPlotBag() {
    const state = Store.get();
    const items = document.getElementById("plot-bag-items");
    if (!items) return;
    items.innerHTML = "";
    for (const slot in (state.plotBag || {})) {
      const rarityKey = slot.split("_")[0];
      const rarity = rarityInfo(rarityKey);
      const count = Number(state.plotBag[slot]) || 0;
      if (!count) continue;
      const button = document.createElement("button");
      button.className = "btn btn-primary";
      button.textContent = `${rarity.label} Plot x${count}`;
      button.style.borderColor = rarity.color;
      button.addEventListener("click", () => placeBagPlot(slot));
      items.appendChild(button);
    }
    document.getElementById("buy-modal")?.classList.add("hidden");
    document.getElementById("plot-bag-modal")?.classList.remove("hidden");
  }

  async function placeBagPlot(slot) {
    if (!pendingTile) return;
    const state = Store.get();
    const { tx, ty } = pendingTile;
    const tid = tileId(tx, ty);
    const rarityKey = slot.split("_")[0];
    const count = Number(state.plotBag?.[slot]) || 0;
    if (!count || getAllPlots()[tid]) return;

    const corners = Geo.tileBounds(tx, ty, CONFIG.TILE_SIZE_METERS);
    const centerLat = (corners[0][0] + corners[2][0]) / 2;
    const centerLon = (corners[0][1] + corners[2][1]) / 2;
    const territory = await Geo.getTerritoryInfo(centerLat, centerLon);
    if (!territory || !territory.city || !territory.country) {
      if (typeof showToast === "function") showToast("📍 Could not resolve location — try a different area.", 3500);
      return;
    }
    const rarity = rarityInfo(rarityKey);

    if (typeof ServerAntiCheat === "undefined" || !ServerAntiCheat.isReady()) {
      if (typeof showToast === "function") showToast("⚠️ Server connection required to relocate a plot.", 4000);
      return;
    }

    const serverResult = await ServerAntiCheat.relocatePlot(slot, tx, ty);
    if (!serverResult.allowed) {
      if (typeof showToast === "function") showToast("⚠️ Couldn't place plot: " + serverResult.reason, 4000);
      return;
    }

    const serverPlotData = serverResult.plotData;
    const serverTid = serverResult.tid;

    state.plotBag[slot] = count - 1;
    if (!state.plotBag[slot]) delete state.plotBag[slot];
    state.plots[serverTid] = serverPlotData;
    globalPlots[serverTid] = serverPlotData;
    pendingTile = null;
    Store.save(true);
    document.getElementById("plot-bag-modal")?.classList.add("hidden");
    render();
    showPlotFloatText(tx, ty, `RELOCATED ${rarity.label.toUpperCase()} TO NEW LOCATION`);
  }

  function showPlotFloatText(tx, ty, text) {
    if (!map) return;
    const corners = Geo.tileBounds(tx, ty, CONFIG.TILE_SIZE_METERS);
    const lat = (corners[0][0] + corners[2][0]) / 2;
    const lon = (corners[0][1] + corners[2][1]) / 2;
    const pt = map.project([lon, lat]);
    const popup = document.createElement("div");
    popup.className = "combat-text-popup";
    popup.style.left = `${pt.x}px`;
    popup.style.top = `${pt.y}px`;
    popup.textContent = text;
    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 1500);
  }

  async function executeBuy() {
    if (!pendingTile) return;
    if (typeof Store !== "undefined" && Store.isSessionActive && !Store.isSessionActive()) {
      const toast = window.showToast || alert;
      toast("⛔ Account active on another tab! Please refresh.", 3500);
      return;
    }
    const { tx, ty } = pendingTile;
    pendingTile = null;

    const state = Store.get();

    // 1. Strict Guest Guard: Catches Firebase Anonymous Guests too!
    const fbUser = (typeof firebase !== "undefined" && firebase.auth) ? firebase.auth().currentUser : null;
    const isGuest = fbUser ? fbUser.isAnonymous : (!state.player?.id || state.player.id.startsWith("guest-"));
    if (isGuest) {
      const toastFn = window.showToast || alert;
      toastFn("🛡️ YOU ARE A GUEST. Sign in with Google to claim permanent land!", 3500);
      onBuyAttempt(false, null);
      return;
    }

    // Cloud sync gate — block purchases until account data is fully loaded from Firestore
    if (typeof Store !== "undefined" && !Store.isCloudSyncComplete()) {
      const toastFn = window.showToast || alert;
      toastFn("⏳ Syncing your account data — please wait a moment...", 3000);
      onBuyAttempt(false, null);
      return;
    }

    // Anti-cheat: Rate limiting & replay protection
    if (typeof AntiCheat !== "undefined") {
      const purchaseId = AntiCheat.generatePurchaseId("land", tx, ty);
      const rateCheck = AntiCheat.canPurchase("land", purchaseId);
      if (!rateCheck.allowed) {
        const toastFn = window.showToast || alert;
        toastFn("🛡️ " + rateCheck.reason, 3000);
        onBuyAttempt(false, null);
        return;
      }
    }

    const modal = document.getElementById("buy-modal");
    if (modal) modal.classList.add("hidden");

    const tid = tileId(tx, ty);
    const allPlots = getAllPlots();
    if (allPlots[tid]) return;

    if (typeof ServerAntiCheat === "undefined" || !ServerAntiCheat.isReady()) {
      const toastFn = window.showToast || alert;
      toastFn("⚠️ Server connection required to claim land.", 3500);
      onBuyAttempt(false, null);
      return;
    }

    const corners = Geo.tileBounds(tx, ty, CONFIG.TILE_SIZE_METERS);
    const centerLat = (corners[0][0] + corners[2][0]) / 2;
    const centerLon = (corners[0][1] + corners[2][1]) / 2;
    const territory = await Geo.getTerritoryInfo(centerLat, centerLon);

    if (!territory || !territory.city || !territory.country) {
      if (typeof showToast === "function") showToast("📍 Could not resolve location — try a different area.", 3500);
      onBuyAttempt(false, null);
      return;
    }

    // 🛡️ SERVER-SIDE PURCHASE VALIDATION — authoritative check before any client write
    if (typeof ServerAntiCheat !== "undefined" && ServerAntiCheat.isReady() && playerCoords) {
      try {
        // Force a fresh position ping so stationary players never hit
        // "waiting for GPS lock" — the purchase itself re-verifies server-side.
        if (ServerAntiCheat.sendPosition) {
          await ServerAntiCheat.sendPosition({
            latitude: playerCoords.lat,
            longitude: playerCoords.lon,
            accuracy: 10,
            altitude: null,
            speed: null,
            altitudeAccuracy: null,
            timestamp: Date.now(),
          }, true);
        }
        const serverResult = await ServerAntiCheat.validatePurchase(
          playerCoords.lat, playerCoords.lon, tx, ty, territory
        );
        if (!serverResult.allowed) {
          const toastFn = window.showToast || alert;
          // Sync server's cooldown timestamp to keep client in check
          if (serverResult.lastLandPurchaseAt) {
            state.lastLandPurchaseAt = serverResult.lastLandPurchaseAt;
            Store.save(true);
          }
          // Sync server's EB balance if provided
          if (typeof serverResult.nextEb === "number") {
            state.eb = serverResult.nextEb;
            Store.save(true);
          }
          let msg = "🛡️ Purchase rejected by server.";
          if (serverResult.reason === "insufficient_eb") msg = "⚠️ Not enough EB — you need 100 EB to claim land.";
          else if (serverResult.reason === "cooldown") msg = `⏳ Purchase cooldown active. Wait ${Math.ceil((serverResult.waitMs || 60000) / 1000)}s.`;
          else if (serverResult.reason === "plot_already_claimed") msg = "⚠️ This tile was just claimed by someone else!";
          else if (serverResult.reason === "too_far_from_tile") msg = "🚶 You must walk closer to claim this tile.";
          else if (serverResult.reason === "velocity_check_failed") msg = "🚫 Movement anomaly detected.";
          else if (serverResult.reason === "position_not_verified") msg = "📍 Waiting for GPS lock — try again in a moment.";
          else if (serverResult.reason === "location_not_resolved") msg = "📍 Could not resolve location — try a different area.";
          else if (serverResult.reason) msg = "🛡️ " + serverResult.reason;
          toastFn(msg, 3500);
          onBuyAttempt(false, null);
          return;
        }
        // Server approved — apply authoritative results FIRST so a later
        // decoration error can never undo the purchase or misreport failure.
        const serverPlotData = serverResult.plotData;
        const serverTid = serverResult.tid;

        // Use server-authoritative EB balance and cooldown timestamp
        if (typeof serverResult.nextEb === "number") state.eb = serverResult.nextEb;
        if (serverResult.lastLandPurchaseAt) state.lastLandPurchaseAt = serverResult.lastLandPurchaseAt;
        state.plots[serverTid] = serverPlotData;
        globalPlots[serverTid] = serverPlotData;
        Store.save(true);

        const rarityObj = CONFIG.PLOT_RARITIES.find(r => r.key === serverPlotData.rarity) || CONFIG.PLOT_RARITIES[0];
        onBuyAttempt(true, rarityObj);
        render();

        // Feed broadcast + territory dividends are now server-authoritative
        // (validatePurchase posts them), so the client no longer duplicates them.
        // Non-critical extras — isolated so they can never fail the purchase
        try {
          const rarityLabel = rarityObj.label || serverPlotData.rarity;

          if (typeof map !== "undefined" && map) {
            const pt = map.project([centerLon, centerLat]);
            const popup = document.createElement("div");
            popup.className = "combat-text-popup";
            popup.style.left = `${pt.x}px`;
            popup.style.top = `${pt.y}px`;
            popup.innerHTML = `+1 ${rarityLabel} Plot!`;
            document.body.appendChild(popup);
            setTimeout(() => popup.remove(), 1100);
          }

          if (typeof AntiCheat !== "undefined") AntiCheat.recordPurchase("land", serverTid);
          if (typeof window.completeDailyQuest === "function") window.completeDailyQuest("survey");

          if (typeof Leaderboard !== "undefined" && Leaderboard.invalidateCache) Leaderboard.invalidateCache();
        } catch (extraErr) {
          console.warn("[Grid] Post-purchase extras notice:", extraErr && extraErr.message);
        }

        return;
      } catch (e) {
        console.warn("[Grid] Server validation failed:", e && e.stack || e);
        if (typeof showToast === "function") showToast("⚠️ Land claim could not be verified. Try again.", 3500);
        onBuyAttempt(false, null);
        return;
      }
    }
  }

  function visibleTileRange() {
    const bounds = map.getBounds();
    const ts = CONFIG.TILE_SIZE_METERS;
    const sw = Geo.tileForLatLon(bounds.getSouth(), bounds.getWest(), ts);
    const ne = Geo.tileForLatLon(bounds.getNorth(), bounds.getEast(), ts);
    return {
      minTx: Math.min(sw.tx, ne.tx), maxTx: Math.max(sw.tx, ne.tx),
      minTy: Math.min(sw.ty, ne.ty), maxTy: Math.max(sw.ty, ne.ty),
    };
  }

  let renderScheduled = false;

  function scheduleRender() {
    if (renderScheduled || document.hidden) return;
    renderScheduled = true;
    requestAnimationFrame(() => {
      render();
      renderScheduled = false;
    });
  }

  function render() {
    // Battery Saver: Don't spend GPU/CPU cycles if phone is in pocket or map not ready!
    if (!map || !map.getStyle() || document.hidden) return;

    activeMarkers.forEach(m => m.remove());
    activeMarkers = [];

    const state = Store.get();
    const allPlots = getAllPlots();
    const zoom = map.getZoom();

    // Update 3D Standing Grass Foliage (Safeguarded against WebGL context interruption)
    if (typeof Foliage !== "undefined" && Foliage.update) {
      try {
        Foliage.update();
      } catch (err) {
        console.warn("[Foliage] Update safely bypassed:", err);
      }
    }

    // 1. RENDER CLAIMED PLOTS (With 5-Mile Horizon Culling)
    const claimedFeatures = [];
    const myPlayerId = state.player?.id;
    const refLat = (playerCoords && playerCoords.lat) ? playerCoords.lat : (map ? map.getCenter().lat : null);
    const refLon = (playerCoords && playerCoords.lon) ? playerCoords.lon : (map ? map.getCenter().lng : null);

    for (const tid in allPlots) {
      const plot = allPlots[tid];
      const bounds = Geo.tileBounds(plot.tx, plot.ty, CONFIG.TILE_SIZE_METERS);
      const coords = bounds.map(pt => [pt[1], pt[0]]);
      coords.push(coords[0]);

      // 5-Mile Horizon Culling: Skip polygons in Ohio, Canada, or Puerto Rico!
      if (refLat && refLon) {
        const cLat = (bounds[0][0] + bounds[2][0]) / 2;
        const cLon = (bounds[0][1] + bounds[2][1]) / 2;
        if (Geo.haversine(refLat, refLon, cLat, cLon) > 8000) {
          continue; // Skip distant plots!
        }
      }

      const isSelf = Boolean(myPlayerId && plot.ownerId === myPlayerId);

      claimedFeatures.push({
        type: "Feature",
        properties: {
          color: rarityInfo(plot.rarity).color,
          rarity: plot.rarity,
          ownerId: plot.ownerId,
          isSelf: isSelf,
        },
        geometry: { type: "Polygon", coordinates: [coords] },
      });
    }

    const claimedGeoJSON = { type: "FeatureCollection", features: claimedFeatures };

    if (map.getSource("plots-source")) {
      map.getSource("plots-source").setData(claimedGeoJSON);
    } else {
      map.addSource("plots-source", { type: "geojson", data: claimedGeoJSON });

      // 1. Lush Green Grass Base (ONLY on Epic & Legendary Parcels)
      map.addLayer({
        id: "plots-grass-base",
        type: "fill",
        source: "plots-source",
        paint: {
          "fill-color": "#27ae60",
          "fill-opacity": [
            "case",
            ["in", ["get", "rarity"], ["literal", ["epic", "legendary"]]],
            ["case", ["==", ["get", "isSelf"], true], 0.35, 0.12],
            0
          ],
        },
      });

      // 2. Rarity Tint (Bright on your plots, dimmed on rivals)
      map.addLayer({
        id: "plots-fill",
        type: "fill",
        source: "plots-source",
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": ["case", ["==", ["get", "isSelf"], true], 0.55, 0.20],
        },
      });

      // 3. Neon Rarity Borders (Thick on your plots, thin on rivals)
      map.addLayer({
        id: "plots-line",
        type: "line",
        source: "plots-source",
        paint: {
          "line-color": ["get", "color"],
          "line-width": ["case", ["==", ["get", "isSelf"], true], 2.5, 1.2],
          "line-opacity": ["case", ["==", ["get", "isSelf"], true], 0.95, 0.45],
        },
      });
    }

    // 2. RENDER EMPTY PURCHASE GRID ONLY IN "BUY LAND" MODE OR ZOOM 18+
    const emptyGridFeatures = [];
    if (isBuyMode && playerCoords) {
      const ts = CONFIG.TILE_SIZE_METERS;
      const radiusM = CONFIG.DIAMOND_COLLECT_RADIUS_METERS || 50;
      const centerTile = Geo.tileForLatLon(playerCoords.lat, playerCoords.lon, ts);
      const tileRadius = Math.ceil(radiusM / ts);

      for (let dx = -tileRadius; dx <= tileRadius; dx++) {
        for (let dy = -tileRadius; dy <= tileRadius; dy++) {
          const tx = centerTile.tx + dx;
          const ty = centerTile.ty + dy;
          const tid = tileId(tx, ty);
          if (allPlots[tid]) continue;

          const bounds = Geo.tileBounds(tx, ty, ts);
          const cLat = (bounds[0][0] + bounds[2][0]) / 2;
          const cLon = (bounds[0][1] + bounds[2][1]) / 2;

          // Only tiles inside player radius
          if (Geo.haversine(playerCoords.lat, playerCoords.lon, cLat, cLon) <= radiusM) {
            const coords = bounds.map(pt => [pt[1], pt[0]]);
            coords.push(coords[0]);

            emptyGridFeatures.push({
              type: "Feature",
              properties: {
                tx,
                ty,
                selected: pendingTile && pendingTile.tx === tx && pendingTile.ty === ty,
              },
              geometry: { type: "Polygon", coordinates: [coords] },
            });
          }
        }
      }
    }

    const emptyGeoJSON = { type: "FeatureCollection", features: emptyGridFeatures };

    if (map.getSource("empty-grid-source")) {
      map.getSource("empty-grid-source").setData(emptyGeoJSON);
    } else {
      map.addSource("empty-grid-source", { type: "geojson", data: emptyGeoJSON });

      map.addLayer({
        id: "empty-grid-fill",
        type: "fill",
        source: "empty-grid-source",
        paint: {
          "fill-color": ["case", ["==", ["get", "selected"], true], "#ffffff", "#4fd6c4"],
          "fill-opacity": ["case", ["==", ["get", "selected"], true], 0.65, 0.14],
        },
      });

      map.addLayer({
        id: "empty-grid-line",
        type: "line",
        source: "empty-grid-source",
        paint: {
          "line-color": ["case", ["==", ["get", "selected"], true], "#ffffff", "#4fd6c4"],
          "line-width": ["case", ["==", ["get", "selected"], true], 2.5, 1.2],
        },
      });
    }

    // 3. RENDER CLUSTERED AVATARS & EXTRACTOR BEACONS (1 Avatar per Connected Territory)
    if (zoom >= 14) {
      const visited = new Set();
      let playerExtractorRendered = false;

      // Find all connected tile clusters using 4-directional flood fill
      for (const startTid in allPlots) {
        if (visited.has(startTid)) continue;

        const startPlot = allPlots[startTid];
        const clusterOwnerId = startPlot.ownerId;
        const cluster = [];
        const queue = [startPlot];
        visited.add(startTid);

        while (queue.length > 0) {
          const current = queue.shift();
          cluster.push(current);

          // Guarantee integer values to prevent string concatenation ("100" + 1 = "1001")
          const cx = parseInt(current.tx, 10);
          const cy = parseInt(current.ty, 10);

          // Check 4 adjacent orthogonal neighbors (N, S, E, W)
          const neighbors = [
            tileId(cx + 1, cy),
            tileId(cx - 1, cy),
            tileId(cx, cy + 1),
            tileId(cx, cy - 1),
          ];

          for (const nId of neighbors) {
            if (!visited.has(nId) && allPlots[nId] && allPlots[nId].ownerId === clusterOwnerId) {
              visited.add(nId);
              queue.push(allPlots[nId]);
            }
          }
        }

        // Calculate average centroid for the entire connected cluster
        let totalLat = 0;
        let totalLon = 0;

        for (const p of cluster) {
          let px = parseInt(p.tx, 10);
          let py = parseInt(p.ty, 10);

          // Auto-recover tx/ty from plot ID if missing in Firestore!
          if (isNaN(px) || isNaN(py)) {
            const tidStr = p.id || startTid || "";
            const parts = tidStr.split("_");
            if (parts.length === 2) {
              px = parseInt(parts[0], 10);
              py = parseInt(parts[1], 10);
              p.tx = px;
              p.ty = py;
            }
          }

          if (!isNaN(px) && !isNaN(py)) {
            const centerMerc = Geo.fromMercator(
              px * CONFIG.TILE_SIZE_METERS + CONFIG.TILE_SIZE_METERS / 2,
              py * CONFIG.TILE_SIZE_METERS + CONFIG.TILE_SIZE_METERS / 2
            );
            totalLat += centerMerc.lat;
            totalLon += centerMerc.lon;
          }
        }

        if (cluster.length === 0) continue;

        const centroidLat = totalLat / cluster.length;
        const centroidLon = totalLon / cluster.length;

        // 🛡️ NaN SANITY GUARD: Never pass invalid NaN coordinates to MapLibre!
        if (isNaN(centroidLat) || isNaN(centroidLon) || !isFinite(centroidLat) || !isFinite(centroidLon)) {
          continue; // Skip invalid marker safely without crashing!
        }

        // 5KM HORIZON CULLING: Don't render signboards for plots in Ohio, Canada, or Indiana!
        const refLat = (playerCoords && playerCoords.lat) ? playerCoords.lat : (map ? map.getCenter().lat : null);
        const refLon = (playerCoords && playerCoords.lon) ? playerCoords.lon : (map ? map.getCenter().lng : null);
        if (refLat && refLon) {
          const dist = Geo.haversine(refLat, refLon, centroidLat, centroidLon);
          if (dist > 40000) continue; // 25-mile bird's-eye city view; keep city billboard density readable
        }

        const isSelf = clusterOwnerId === state.player.id;
        const rep = cluster[0];
        const avatar = isSelf ? (state.player.avatar || "🙂") : (rep.avatar || "🙂");

        const innerContent = avatar.startsWith("img:")
          ? `<img src="${avatar.slice(4)}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;display:block;">`
          : `<span style="font-size:15px;line-height:1;">${avatar}</span>`;

        // Count badge if more than 1 tile connected
        const countBadge = cluster.length > 1
          ? `<span style="position:absolute;bottom:-4px;right:-4px;background:#d4af61;color:#0b1118;font-size:10px;font-weight:800;border-radius:10px;padding:1px 5px;box-shadow:0 0 4px rgba(0,0,0,0.9);line-height:1.2;">${cluster.length}</span>`
          : "";

        const el = document.createElement("div");
        el.className = "custom-plot-icon standing-plot-sign";
        el.innerHTML = `
          <div class="sign-avatar-disc">
            ${innerContent}
            ${countBadge}
          </div>
          <div class="sign-stem"></div>
          <div class="sign-ground-shadow"></div>
        `;

        el.addEventListener("click", () => {
          const evt = new CustomEvent("openPlayerInfo", { detail: { cluster, isSelf } });
          window.dispatchEvent(evt);
        });

        // "viewport" makes the sign stand vertically upright & billboard toward the player camera
        const m = new mapboxgl.Marker({
          element: el,
          anchor: "bottom",              // Anchors the bottom tip of the stem to the exact ground coordinates
          pitchAlignment: "viewport",    // Stands vertically upright (not flat on the ground)
          rotationAlignment: "viewport", // Rotates to continuously face the camera
        })
          .setLngLat([centroidLon, centroidLat])
          .addTo(map);

        activeMarkers.push(m);

        // Mount Extractor at the centroid if criteria met
        if (isSelf && Object.keys(state.plots || {}).length >= (CONFIG.EXTRACTOR_MIN_TILES || 5) && !playerExtractorRendered) {
          playerExtractorRendered = true;

          const beaconEl = document.createElement("div");
          beaconEl.className = "extractor-3d-wrap standing-extractor-wrap";
          beaconEl.innerHTML = `
            <div class="beacon-root">
              <div class="beacon-ground-aura"></div>
              <div class="orbit-ring ring-1"></div>
              <div class="orbit-ring ring-2"></div>
              <div class="beacon-core-gem">
                <svg viewBox="0 0 32 38" class="beacon-svg">
                  <polygon points="16,2 29,12 16,16 3,12" fill="#ff6b81"></polygon>
                  <polygon points="3,12 16,16 16,36" fill="#8b0000"></polygon>
                  <polygon points="29,12 16,16 16,36" fill="#ff1744"></polygon>
                  <polygon points="16,2 20,8 16,16 12,8" fill="#ffffff"></polygon>
                </svg>
              </div>
            </div>
          `;
          beaconEl.addEventListener("click", () => {
            const evt = new CustomEvent("openExtractorModal");
            window.dispatchEvent(evt);
          });

          // Upright 2.5D billboard that faces the player's camera smoothly
          const extMarker = new mapboxgl.Marker({
            element: beaconEl,
            anchor: "bottom",              // Grounded at the bottom
            pitchAlignment: "viewport",    // Stands vertically upright in 3D
            rotationAlignment: "viewport", // Always rotates to face the player
          })
            .setLngLat([centroidLon + 0.00008, centroidLat + 0.00008])
            .addTo(map);

          activeMarkers.push(extMarker);
        }
      }
    }
  }

  function setPlayerPosition(lat, lon) {
    playerCoords = { lat, lon };
  }

  function setBuyMode(active, coords = null) {
    isBuyMode = active;
    if (coords) playerCoords = coords;
    scheduleRender();
  }

  function setGlobalPlot(tid, data) {
    globalPlots[tid] = data;
    scheduleRender();
  }

  function listenToGlobalPlots() {
    const db = Store.getDb();
    if (!db) return;

    try {
      db.collection("plots").onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          const tid = change.doc.id;
          const data = change.doc.data();
          if (change.type === "added" || change.type === "modified") {
            globalPlots[tid] = data;
          } else if (change.type === "removed") {
            delete globalPlots[tid];
          }
        });
        render();
      }, (err) => console.warn("[Multiplayer] Sync error:", err));
    } catch (err) {
      console.warn("[Multiplayer] Listener error:", err);
    }
  }

  function init(mapboxMap, callbacks) {
    map = mapboxMap;
    onBuyAttempt = callbacks.onBuyAttempt || onBuyAttempt;

    map.on("click", (e) => {
      if (!isBuyMode) return; // Only allow buying in Buy Land mode
      const { lng, lat } = e.lngLat;
      const ts = CONFIG.TILE_SIZE_METERS || 6.096;
      const radiusM = CONFIG.DIAMOND_COLLECT_RADIUS_METERS || 75;

      // Strict Reach Radius Guard: Block any tile clicked outside the circle!
      if (playerCoords && playerCoords.lat) {
        const dist = Geo.haversine(playerCoords.lat, playerCoords.lon, lat, lng);
        if (dist > radiusM) {
          if (typeof showToast === "function") {
            showToast("🚶 Walk closer! That tile is outside your reach circle.", 2500);
          }
          return; // Block click!
        }
      }

      const t = Geo.tileForLatLon(lat, lng, ts);
      promptBuyTile(t.tx, t.ty);
    });

    // Wire up Persistent Click Listeners for Claim Modal
    const confirmBtn = document.getElementById("buy-confirm-btn");
    const cancelBtn = document.getElementById("buy-cancel-btn");
    const plantBtn = document.getElementById("plant-capsule-confirm-btn");
    const bagBtn = document.getElementById("plot-bag-btn");
    const buyModal = document.getElementById("buy-modal");

    confirmBtn?.addEventListener("click", () => {
      executeBuy();
    });

    cancelBtn?.addEventListener("click", () => {
      pendingTile = null;
      if (buyModal) buyModal.classList.add("hidden");
    });

    plantBtn?.addEventListener("click", () => {
      if (pendingTile && typeof Citadels !== "undefined") {
        const corners = Geo.tileBounds(pendingTile.tx, pendingTile.ty, CONFIG.TILE_SIZE_METERS);
        const cLat = (corners[0][0] + corners[2][0]) / 2;
        const cLon = (corners[0][1] + corners[2][1]) / 2;
        const planted = Citadels.plantCapsule(pendingTile.tx, pendingTile.ty, cLat, cLon);
        if (planted) {
          pendingTile = null;
          if (buyModal) buyModal.classList.add("hidden");
        }
      }
    });

    document.getElementById("plant-elden-stop-btn")?.addEventListener("click", async () => {
      if (!pendingTile || typeof EldenStops === "undefined") return;
      const planted = await EldenStops.plantSeed(pendingTile.tx, pendingTile.ty);
      if (planted) {
        pendingTile = null;
        if (buyModal) buyModal.classList.add("hidden");
      }
    });

    bagBtn?.addEventListener("click", openPlotBag);
    document.getElementById("plot-relocate-btn")?.addEventListener("click", relocatePlot);

    // Debounced renders prevent lag during rapid zoom/orbit gestures
    map.on("moveend zoomend", scheduleRender);

    // Auto-refresh plots when phone is unlocked
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        scheduleRender();
      }
    });

    listenToGlobalPlots();
    scheduleRender();
  }

  return { init, render, promptBuyTile, executeBuy, getAllPlots, setBuyMode, setGlobalPlot, setPlayerPosition };
})();
