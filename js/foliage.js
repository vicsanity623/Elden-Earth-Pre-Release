// ============================================================
// Elden Earth — 3D Parcel Foliage & Mushroom Landmarks (Zero-Context High-Perf)
// ============================================================
const Foliage = (() => {
  let mapInstance = null;
  let isImageLoaded = false;
  let activeMarkers = [];
  let cachedMushroomImgSrc = null;

  // Realistic stylized grass blade sprite
  function createGrassImage(callback) {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
        <defs>
          <linearGradient id="bladeFront" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#a8f5ec"/>
            <stop offset="30%" stop-color="#2ecc71"/>
            <stop offset="85%" stop-color="#1b7a43"/>
            <stop offset="100%" stop-color="#0e4425"/>
          </linearGradient>

          <linearGradient id="bladeBack" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#58d68d"/>
            <stop offset="50%" stop-color="#229954"/>
            <stop offset="100%" stop-color="#0b301a"/>
          </linearGradient>

          <radialGradient id="rootShadow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="rgba(0,0,0,0.6)"/>
            <stop offset="70%" stop-color="rgba(0,0,0,0.2)"/>
            <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
          </radialGradient>
        </defs>

        <ellipse cx="48" cy="90" rx="32" ry="5" fill="url(#rootShadow)"/>
        <path d="M 48 90 Q 24 65 18 38 Q 32 52 48 90" fill="url(#bladeBack)" opacity="0.9"/>
        <path d="M 48 90 Q 72 62 78 35 Q 64 50 48 90" fill="url(#bladeBack)" opacity="0.9"/>
        <path d="M 48 90 Q 34 50 30 20 Q 42 42 48 90" fill="url(#bladeFront)"/>
        <path d="M 48 90 Q 62 48 66 18 Q 54 40 48 90" fill="url(#bladeFront)"/>
        <path d="M 48 90 Q 45 32 48 6 Q 51 32 48 90" fill="url(#bladeFront)"/>
        <path d="M 48 90 Q 40 70 36 52 Q 44 64 48 90" fill="#a8f5ec"/>
        <path d="M 48 90 Q 56 70 60 52 Q 52 64 48 90" fill="#58d68d"/>
      </svg>
    `;

    const img = new Image(96, 96);
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    img.onload = () => callback(img);
  }

  // Pre-render 3D Mushroom GLB ONCE into a lightweight image sprite
  function preloadMushroom() {
    if (typeof THREE === "undefined" || !THREE.GLTFLoader) return;
    const loader = new THREE.GLTFLoader();
    loader.load(
      "models/mush_common.glb",
      (gltf) => {
        try {
          const offCanvas = document.createElement("canvas");
          offCanvas.width = 128;
          offCanvas.height = 128;

          const renderer = new THREE.WebGLRenderer({ canvas: offCanvas, alpha: true, antialias: true });
          const scene = new THREE.Scene();
          const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
          camera.position.set(0, 1.2, 2.5);
          camera.lookAt(0, 0.4, 0);

          const ambLight = new THREE.AmbientLight(0xffffff, 1.8);
          scene.add(ambLight);

          const dirLight = new THREE.DirectionalLight(0xf0d38a, 2.4);
          dirLight.position.set(3, 5, 4);
          scene.add(dirLight);

          const clone = gltf.scene.clone();
          const box = new THREE.Box3().setFromObject(clone);
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          const scale = 1.15 / maxDim;
          clone.scale.set(scale, scale, scale);

          box.setFromObject(clone);
          clone.position.y = -box.min.y;
          scene.add(clone);

          renderer.render(scene, camera);
          cachedMushroomImgSrc = offCanvas.toDataURL();

          // DISPOSE RENDERER IMMEDIATELY: Releases WebGL context so it never leaks!
          renderer.dispose();
          renderer.forceContextLoss();
          update();
        } catch (e) {
          console.warn("[Foliage] Pre-render notice:", e);
        }
      },
      undefined,
      (err) => {
        // Fallback mushroom emoji if GLB is missing
        cachedMushroomImgSrc = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><text y="50" font-size="48">🍄</text></svg>`
        );
        update();
      }
    );
  }

  // Dynamic Growth 3D Mushroom Billboard (Scales with connected territory!)
  function create3DMushroomElement(scaleMultiplier = 1.0) {
    const wrap = document.createElement("div");
    wrap.className = "parcel-prop-wrap";
    wrap.style.cssText = "will-change: transform; transform: translateZ(0); pointer-events: none;";

    const pxSize = Math.round(26 * scaleMultiplier);
    const fontPx = Math.round(18 * scaleMultiplier);

    if (cachedMushroomImgSrc) {
      wrap.innerHTML = `<img src="${cachedMushroomImgSrc}" style="width:${pxSize}px;height:${pxSize}px;object-fit:contain;display:block;">`;
    } else {
      wrap.innerHTML = `<span style="font-size:${fontPx}px;line-height:1;display:block;">🍄</span>`;
    }

    // 4+ Mega Cluster: Add glowing golden spore aura to giant colossal mushrooms!
    if (scaleMultiplier >= 2.0) {
      wrap.style.filter = "drop-shadow(0 0 10px rgba(240, 211, 138, 0.9))";
    }

    return wrap;
  }

  function init(map) {
    mapInstance = map;
    preloadMushroom();

    createGrassImage((img) => {
      if (!mapInstance.hasImage("foliage-grass")) {
        mapInstance.addImage("foliage-grass", img, { pixelRatio: 2 });
      }
      isImageLoaded = true;
      setupLayers();
      update();
    });
  }

  function setupLayers() {
    if (!mapInstance || mapInstance.getSource("foliage-source")) return;

    mapInstance.addSource("foliage-source", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });

    const layers = mapInstance.getStyle().layers || [];
    const labelLayerId = layers.find(l => l.type === "symbol" && l.layout && l.layout["text-field"])?.id;

    mapInstance.addLayer({
      id: "foliage-layer",
      type: "symbol",
      source: "foliage-source",
      minzoom: 16.5,
      layout: {
        "icon-image": "foliage-grass",
        "icon-anchor": "bottom",
        "icon-pitch-alignment": "viewport",
        "icon-rotation-alignment": "viewport",
        "icon-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          16.5, ["*", 0.16, ["get", "scale"]],
          18.5, ["*", 0.32, ["get", "scale"]],
          20,   ["*", 0.52, ["get", "scale"]]
        ],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      paint: {
        "icon-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          16.5, 0,
          17.2, 0.95
        ],
      },
    }, labelLayerId);
  }

  function seededRandom(seed) {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  }

  function update() {
    // Battery Saver: Skip foliage regeneration when screen is off
    if (!mapInstance || !isImageLoaded || !mapInstance.getSource("foliage-source") || document.hidden) return;

    activeMarkers.forEach(m => m.remove());
    activeMarkers = [];

    // Far-zoom cull: mushrooms are decorative DOM markers — drop them entirely
    if (mapInstance.getZoom && mapInstance.getZoom() < (CONFIG.MAP_CULL_MIN_ZOOM || 14)) {
      mapInstance.getSource("foliage-source").setData({ type: "FeatureCollection", features: [] });
      return;
    }

    const allPlots = (typeof Grid !== "undefined" && Grid.getAllPlots) ? Grid.getAllPlots() : {};

    // --- CONNECTED LEGENDARY TERRITORY SCANNER (Flood-Fill Clustering) ---
    const visitedLegendary = new Set();
    const legendaryClusterSizeMap = {};

    for (const tid in allPlots) {
      const p = allPlots[tid];
      const rKey = p.rarity?.key || p.rarity || "common";
      if (rKey !== "legendary" || visitedLegendary.has(tid)) continue;

      const ownerId = p.ownerId;
      const cluster = [];
      const queue = [p];
      visitedLegendary.add(tid);

      while (queue.length > 0) {
        const curr = queue.shift();
        cluster.push(curr);

        const cx = parseInt(curr.tx, 10);
        const cy = parseInt(curr.ty, 10);

        const neighbors = [
          `${cx + 1}_${cy}`,
          `${cx - 1}_${cy}`,
          `${cx}_${cy + 1}`,
          `${cx}_${cy - 1}`,
        ];

        for (const nId of neighbors) {
          const np = allPlots[nId];
          if (!visitedLegendary.has(nId) && np && np.ownerId === ownerId) {
            const nRarity = np.rarity?.key || np.rarity || "common";
            if (nRarity === "legendary") {
              visitedLegendary.add(nId);
              queue.push(np);
            }
          }
        }
      }

      // Record exact cluster size for all plots in this connected territory
      const clusterCount = cluster.length;
      for (const item of cluster) {
        const itemTid = `${item.tx}_${item.ty}`;
        legendaryClusterSizeMap[itemTid] = clusterCount;
      }
    }

    const tileSize = CONFIG.TILE_SIZE_METERS || 6.096;
    const grassFeatures = [];
    const zoom = mapInstance.getZoom();

    let mushroomCount = 0;
    const MAX_VISIBLE_MUSHROOMS = 15; // Caps DOM markers to keep 60fps smooth

    // User's active 5-mile (8,000m) horizon center
    const mapCenter = mapInstance.getCenter();
    const userLat = mapCenter ? mapCenter.lat : 33.585;
    const userLon = mapCenter ? mapCenter.lng : -112.015;

    for (const tid in allPlots) {
      const p = allPlots[tid];
      const px = parseInt(p.tx, 10);
      const py = parseInt(p.ty, 10);

      const c = Geo.fromMercator(
        px * tileSize + tileSize / 2,
        py * tileSize + tileSize / 2
      );

      // 5-MILE HORIZON CULLING: Never render grass or mushrooms for other states/cities!
      const distToPlayer = Geo.haversine(userLat, userLon, c.lat, c.lon);
      if (distToPlayer > 8000) {
        continue; // Skip! Eliminates floating sky mushrooms and saves 85% GPU power!
      }

      const rarityKey = p.rarity?.key || p.rarity || "common";
      let seed = Math.abs(px * 374761393 + py * 668265263);

      // 1. Lush 3D Grass: ONLY for Epic and Legendary plots!
      const hasGrass = (rarityKey === "epic" || rarityKey === "legendary");
      if (hasGrass) {
        const tuftCount = rarityKey === "legendary" ? 3 : 2;

        for (let i = 0; i < tuftCount; i++) {
          const offsetX = (seededRandom(seed++) - 0.5) * 0.000032;
          const offsetY = (seededRandom(seed++) - 0.5) * 0.000032;
          const randomScale = 0.85 + seededRandom(seed++) * 0.4;

          grassFeatures.push({
            type: "Feature",
            properties: { scale: randomScale },
            geometry: {
              type: "Point",
              coordinates: [c.lon + offsetX, c.lat + offsetY]
            }
          });
        }
      }

      // 2. Magical 3D Mushrooms: ONLY for Legendary plots (Evolves with territory size!)
      if (rarityKey === "legendary" && zoom >= 16.5 && mushroomCount < MAX_VISIBLE_MUSHROOMS) {
        mushroomCount++;
        const mushOffsetX = (seededRandom(seed++) - 0.5) * 0.000015;
        const mushOffsetY = (seededRandom(seed++) - 0.5) * 0.000015;

        const clusterSize = legendaryClusterSizeMap[`${px}_${py}`] || 1;
        // 1 Tile = 1.0X | 2-3 Tiles = 1.4X | 4+ Connected Tiles = 2.0X Giant Colossal!
        const territoryScale = clusterSize >= 4 ? 2.0 : (clusterSize >= 2 ? 1.4 : 1.0);

        const mushEl = create3DMushroomElement(territoryScale);
        const m = new mapboxgl.Marker({
          element: mushEl,
          anchor: "bottom",
          pitchAlignment: "viewport",
          rotationAlignment: "viewport",
        })
          .setLngLat([c.lon + mushOffsetX, c.lat + mushOffsetY])
          .addTo(mapInstance);

        activeMarkers.push(m);
      }
    }

    mapInstance.getSource("foliage-source").setData({
      type: "FeatureCollection",
      features: grassFeatures,
    });
  }

  return { init, update };
})();
