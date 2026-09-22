const CompanionPet = (() => {
  let mapInstance = null;
  let customLayer = null;
  let scene, camera, renderer;
  let mixer = null;
  let currentAction = null;
  let animationsMap = {};
  let petModel = null;
  let playerCoords = { lng: 0, lat: 0 };
  let petCoords = { lng: 0, lat: 0 };
  let petHeading = 0;
  let targetHeading = 0;
  let isFollowing = false;
  let isFetching = false;
  let fetchTarget = null;
  let fetchReturnPhase = false;
  let fetchState = "idle";
  let moodDecayInterval = null;
  let scanInterval = null;
  let lastAnimChange = 0;
  let currentAnimState = "idle";

  const FOLLOW_OFFSET_METERS = 4.5;
  const FETCH_RADIUS_METERS = 500;
  const WALK_SPEED = 0.00003;
  const RUN_SPEED = 0.00012;
  const LERP_FACTOR = 0.08;
  const HEADING_LERP = 0.12;
  const MOOD_DECAY_PER_HOUR = 4;
  const MOOD_DRAIN_PER_DIAMOND = 15;
  const PET_FOLLOW_OFFSET_LAT = -0.0001;
  const PET_FOLLOW_OFFSET_LNG = -0.0001;
  const IDLE_ROAM_RADIUS = 0.00006;
  const IDLE_ROAM_INTERVAL_MS = 6000;
  const IDLE_EMOTE_INTERVAL_MS = 8000;
  const ANIM_COOLDOWN_MS = 500;
  const FETCH_MOVEMENT_SPEED = 0.015;
  const RETURN_MOVEMENT_SPEED = 0.02;
  const TURN_THRESHOLD = 0.3;

  const projMatrix = new THREE.Matrix4();
  const worldMatrix = new THREE.Matrix4();
  const scaleVector = new THREE.Vector3();
  const rotXMatrix = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  const rotYMatrix = new THREE.Matrix4();
  const MODEL_HEADING_OFFSET = Math.PI;

  function init(map, initialLng, initialLat) {
    mapInstance = map;
    playerCoords = { lng: initialLng, lat: initialLat };
    petCoords = {
      lng: initialLng + PET_FOLLOW_OFFSET_LNG,
      lat: initialLat + PET_FOLLOW_OFFSET_LAT
    };

    // Auto-unlock if player already has 75+ plots (for existing saves)
    const state = Store.get();
    if (!state.pet) {
      console.log("[CompanionPet] state.pet missing, initializing...");
      state.pet = { unlocked: false, nickname: "Buddy", mood: 100, lastFedAt: 0, totalFetched: 0 };
      Store.save(true);
    }
    if (state && state.pet && !state.pet.unlocked) {
      const plotCount = Object.keys(state.plots || {}).length;
      console.log(`[CompanionPet] Checking unlock: ${plotCount} plots (need 75)`);
      if (plotCount >= 75) {
        console.log(`[CompanionPet] Auto-unlocking pet (player has ${plotCount} plots)`);
        unlockPet();
      }
    }

    customLayer = {
      id: "3d-companion-pet",
      type: "custom",
      renderingMode: "3d",
      onAdd: function (map, gl) {
        camera = new THREE.Camera();
        scene = new THREE.Scene();

        const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
        scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xf0d38a, 1.8);
        dirLight.position.set(15, 40, 15);
        scene.add(dirLight);

        const dirLight2 = new THREE.DirectionalLight(0x4fd6c4, 1.0);
        dirLight2.position.set(-15, -40, 10);
        scene.add(dirLight2);

        renderer = new THREE.WebGLRenderer({
          canvas: map.getCanvas(),
          context: gl,
          antialias: false,
          powerPreference: "low-power"
        });
        renderer.autoClear = false;

        loadPetModel();
      },
      render: function (gl, matrix) {
        if (!petModel || document.hidden) return;

        // 🛡️ HARD GATE: Pet must NEVER render if locked (under 75 plots)
        const state = Store.get();
        if (!state.pet || !state.pet.unlocked) return;

        const modelCoord = mapboxgl.MercatorCoordinate.fromLngLat(
          [petCoords.lng, petCoords.lat],
          0
        );

        const scale = modelCoord.meterInMercatorCoordinateUnits() * 1.2;
        scaleVector.set(scale, -scale, scale);

        projMatrix.fromArray(matrix);

        // 🎯 THE EXACT HEADING FIX FOR ROBOTEXPRESSIVE:
        // Geographic heading to Three.js Y-rotation is: -petHeading
        // Plus 180 degrees (Math.PI) because the model's front is facing South by default in Mercator coordinates.
        rotYMatrix.makeRotationY(-petHeading + Math.PI);

        worldMatrix
          .makeTranslation(modelCoord.x, modelCoord.y, modelCoord.z)
          .scale(scaleVector)
          .multiply(rotXMatrix)
          .multiply(rotYMatrix);

        camera.projectionMatrix.copy(projMatrix).multiply(worldMatrix);

        gl.clear(gl.DEPTH_BUFFER_BIT);

        renderer.resetState();
        renderer.render(scene, camera);
      },
    };

    if (mapInstance.getLayer("3d-companion-pet")) {
      mapInstance.removeLayer("3d-companion-pet");
    }
    mapInstance.addLayer(customLayer);
    
    // Move pet layer to top so it renders above plots and other map elements
    setTimeout(() => {
      if (mapInstance.getLayer("3d-companion-pet")) {
        mapInstance.moveLayer("3d-companion-pet");
      }
    }, 100);

    let clock = new THREE.Clock();
    let animFrameId = null;

    function animate() {
      if (document.hidden) {
        animFrameId = null;
        return;
      }

      animFrameId = requestAnimationFrame(animate);

      // 1. Smooth delta time (capped to prevent tab-switch jumps)
      const delta = Math.min(clock.getDelta(), 0.05);

      if (mixer) {
        mixer.update(delta);
        if (mapInstance) mapInstance.triggerRepaint();
      }

      // 2. Update idle movement smoothly
      updateIdleRoaming();
    }
    animate();

    startMoodDecay();
    startDiamondScan();
    startIdleRoaming();
    setupPetTapHandler();
  }

  function setupPetTapHandler() {
    if (!mapInstance) return;

    const canvas = mapInstance.getCanvas();
    let lastTapTime = 0;

    canvas.addEventListener("click", (e) => {
      const now = Date.now();
      if (now - lastTapTime < 300) return;
      lastTapTime = now;

      const state = Store.get();
      if (!state.pet || !state.pet.unlocked) {
        console.log("[CompanionPet] Tap ignored - pet not unlocked");
        return;
      }

      const petScreenPos = projectPetToScreen();
      if (!petScreenPos) return;

      const clickX = e.clientX;
      const clickY = e.clientY;
      const dist = Math.sqrt(
        Math.pow(clickX - petScreenPos.x, 2) + Math.pow(clickY - petScreenPos.y, 2)
      );

      console.log("[CompanionPet] Tap distance from pet:", dist.toFixed(0), "px");

      if (dist < 60) {
        console.log("[CompanionPet] Opening pet modal");
        openPetModal();
      }
    });

    canvas.addEventListener("touchend", (e) => {
      if (e.changedTouches.length !== 1) return;

      const now = Date.now();
      if (now - lastTapTime < 300) return;
      lastTapTime = now;

      const state = Store.get();
      if (!state.pet || !state.pet.unlocked) return;

      const petScreenPos = projectPetToScreen();
      if (!petScreenPos) return;

      const touch = e.changedTouches[0];
      const clickX = touch.clientX;
      const clickY = touch.clientY;
      const dist = Math.sqrt(
        Math.pow(clickX - petScreenPos.x, 2) + Math.pow(clickY - petScreenPos.y, 2)
      );

      console.log("[CompanionPet] Touch distance from pet:", dist.toFixed(0), "px");

      if (dist < 60) {
        console.log("[CompanionPet] Opening pet modal (touch)");
        openPetModal();
      }
    });
  }

  function projectPetToScreen() {
    if (!mapInstance || !petCoords.lng || !petCoords.lat) return null;

    const point = mapInstance.project([petCoords.lng, petCoords.lat]);
    if (!point) return null;

    return { x: point.x, y: point.y };
  }

  function loadPetModel() {
    const loader = new THREE.GLTFLoader();

    loader.load(
      "models/RobotExpressive.glb",
      (gltf) => {
        if (petModel) {
          scene.remove(petModel);
          disposePetModel(petModel);
        }

        petModel = gltf.scene;
        mixer = new THREE.AnimationMixer(petModel);
        animationsMap = {};

        gltf.animations.forEach((clip) => {
          animationsMap[clip.name.toLowerCase()] = mixer.clipAction(clip);
        });

        const idleKey = Object.keys(animationsMap).find((k) =>
          k.includes("idle") || k.includes("standing")
        ) || Object.keys(animationsMap)[0];

        if (idleKey && animationsMap[idleKey]) {
          currentAction = animationsMap[idleKey];
          currentAction.setEffectiveTimeScale(0.8);
          currentAction.play();
        }

        // Detect morph targets for facial expressions
        petMorphTargets = {};
        petModel.traverse((child) => {
          if (child.isMesh && child.morphTargetDictionary) {
            const dict = child.morphTargetDictionary;
            if (dict.Angry !== undefined) petMorphTargets.angry = { mesh: child, index: dict.Angry };
            if (dict.Sad !== undefined) petMorphTargets.sad = { mesh: child, index: dict.Sad };
            if (dict.Surprised !== undefined) petMorphTargets.surprised = { mesh: child, index: dict.Surprised };
          }
        });
        console.log("[CompanionPet] Morph targets found:", Object.keys(petMorphTargets));

        scene.add(petModel);
        console.log("[CompanionPet] RobotExpressive loaded successfully.");
      },
      undefined,
      (err) => console.warn("[CompanionPet] Load error:", err)
    );
  }

  function disposePetModel(model) {
    if (!model) return;
    if (mixer) {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
    }
    model.traverse((child) => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => {
              if (m.map) m.map.dispose();
              m.dispose();
            });
          } else {
            if (child.material.map) child.material.map.dispose();
            child.material.dispose();
          }
        }
      }
    });
  }

  function playAnimation(animName) {
    if (!petModel || !mixer) return;

    const lower = animName.toLowerCase();
    
    // 🛡️ Prevent restarting an animation that is already active!
    if (currentAnimState === lower) return;

    const key = Object.keys(animationsMap).find((k) => k.includes(lower));
    if (!key || !animationsMap[key]) return;

    const nextAction = animationsMap[key];
    if (currentAction === nextAction) return;

    // 🧘 Sitting must play ONCE and HOLD its final pose!
    if (lower.includes("sit")) {
      nextAction.reset();
      nextAction.setLoop(THREE.LoopOnce, 1);
      nextAction.clampWhenFinished = true; // Stays seated peacefully!
      nextAction.fadeIn(0.4).play();
    } else {
      nextAction.reset();
      nextAction.setLoop(THREE.LoopRepeat);
      nextAction.clampWhenFinished = false;
      nextAction.fadeIn(0.3).play();
    }

    if (currentAction) {
      currentAction.fadeOut(0.3);
    }

    currentAction = nextAction;
    currentAnimState = lower;
  }

  function smoothHeadingUpdate(targetAngle) {
    let diff = targetAngle - petHeading;
    // Wrap to [-PI, PI] so it always turns the shortest direction
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    
    // Snappier rotation so it doesn't run while still turning sideways
    petHeading += diff * 0.25; 
  }

  function setPlayerPosition(lng, lat) {
    playerCoords = { lng, lat };
    updateFollowLogic();
  }

  let isAngryCatchingUp = false;

  function updateFollowLogic() {
    const state = Store.get();
    if (isFetching) return;

    const isAngry = (state.pet?.mood || 0) <= 15;

    const targetLng = playerCoords.lng + PET_FOLLOW_OFFSET_LNG;
    const targetLat = playerCoords.lat + PET_FOLLOW_OFFSET_LAT;
    const dist = Geo.haversine(playerCoords.lat, playerCoords.lng, petCoords.lat, petCoords.lng);

    // ================= ANGRY / EXHAUSTED PET BEHAVIOR =================
    if (isAngry) {
      // 1. Ignore small GPS drift (under 3.5 meters) — let it sit in peace!
      if (!isAngryCatchingUp && dist < 3.5) {
        isFollowing = false;
        playAnimation("sitting");
        return;
      }

      // 2. Player walked or drifted far away (> 3.5m) — reluctantly stand up and catch up!
      if (dist >= 3.5) {
        isAngryCatchingUp = true;
      }

      // 3. Slowly walk to catch up
      if (isAngryCatchingUp) {
        if (dist <= 1.8) {
          // Arrived! Sit back down grumpily
          isAngryCatchingUp = false;
          isFollowing = false;
          playAnimation("sitting");
          return;
        }

        isFollowing = true;
        const targetAngle = computeTargetHeading(petCoords.lat, petCoords.lng, targetLat, targetLng);
        smoothHeadingUpdate(targetAngle);

        // Reluctant, slow walk (constant step)
        const step = 0.000008;
        const totalDist = Math.hypot(targetLng - petCoords.lng, targetLat - petCoords.lat);
        if (totalDist > 0) {
          petCoords.lng += ((targetLng - petCoords.lng) / totalDist) * step;
          petCoords.lat += ((targetLat - petCoords.lat) / totalDist) * step;
        }

        playAnimation("walk");
        return;
      }
    }

    // ================= NORMAL HAPPY / CONTENT PET BEHAVIOR =================
    isAngryCatchingUp = false;
    if (dist > 1.2) {
      isFollowing = true;
      const targetAngle = computeTargetHeading(petCoords.lat, petCoords.lng, targetLat, targetLng);
      smoothHeadingUpdate(targetAngle);

      const step = 0.000012; // Normal follow speed
      const totalDist = Math.hypot(targetLng - petCoords.lng, targetLat - petCoords.lat);
      if (totalDist > 0) {
        petCoords.lng += ((targetLng - petCoords.lng) / totalDist) * step;
        petCoords.lat += ((targetLat - petCoords.lat) / totalDist) * step;
      }

      playAnimation("walk");
    } else {
      isFollowing = false;
      playAnimation("idle");
    }
  }
  let idleRoamInterval = null;
  let idleEmoteInterval = null;
  let idleRoamTarget = null;
  let petModalScene = null;
  let petModalCamera = null;
  let petModalRenderer = null;
  let petModalModel = null;
  let petModalMixer = null;
  let petModalAnimations = {};
  let petModalCurrentAction = null;
  let petHudScene = null;
  let petHudCamera = null;
  let petHudRenderer = null;
  let petHudModel = null;
  let petHudMixer = null;
  let petHudAnimations = {};
  let petHudCurrentAction = null;
  let petHudAnimFrameId = null;
  let petMorphTargets = {};

  function startIdleRoaming() {
    if (idleRoamInterval) clearInterval(idleRoamInterval);
    if (idleEmoteInterval) clearInterval(idleEmoteInterval);

    idleRoamInterval = setInterval(() => {
      const state = Store.get();
      if (!state.pet || !state.pet.unlocked) {
        console.log("[CompanionPet] Roam skipped - pet not unlocked");
        return;
      }
      if (isFetching || isFollowing) return;
      if (state.pet.mood <= 0) {
        console.log("[CompanionPet] Roam skipped - pet is angry");
        return;
      }

      const angle = Math.random() * Math.PI * 2;
      const distance = IDLE_ROAM_RADIUS * (0.5 + Math.random() * 0.5);

      idleRoamTarget = {
        lng: playerCoords.lng + PET_FOLLOW_OFFSET_LNG + Math.cos(angle) * distance,
        lat: playerCoords.lat + PET_FOLLOW_OFFSET_LAT + Math.sin(angle) * distance
      };
      console.log("[CompanionPet] Idle roam target set:", idleRoamTarget);
    }, IDLE_ROAM_INTERVAL_MS);

    idleEmoteInterval = setInterval(() => {
      const state = Store.get();
      if (!state.pet || !state.pet.unlocked) return;
      if (isFetching || isFollowing) return;
      if (state.pet.mood <= 0) {
        console.log("[CompanionPet] Emote skipped - pet is angry");
        return;
      }

      const emotes = ["wave", "dance", "thumbsup", "jump"];
      const randomEmote = emotes[Math.floor(Math.random() * emotes.length)];
      console.log("[CompanionPet] Playing idle emote:", randomEmote);
      playAnimation(randomEmote);

      setTimeout(() => {
        if (!isFetching && !isFollowing) {
          playAnimation("idle");
        }
      }, 3000);
    }, IDLE_EMOTE_INTERVAL_MS);
  }

  function updateIdleRoaming() {
    const state = Store.get();
    
    // 🛡️ If pet is angry, NEVER wander or roam!
    if ((state.pet?.mood || 0) <= 15) {
      idleRoamTarget = null;
      if (!isFollowing && !isAngryCatchingUp) {
        playAnimation("sitting");
      }
      return;
    }

    if (!idleRoamTarget || isFetching || isFollowing) return;

    const dist = Geo.haversine(petCoords.lat, petCoords.lng, idleRoamTarget.lat, idleRoamTarget.lng);
    if (dist < 0.8) {
      idleRoamTarget = null;
      playAnimation("idle");
      return;
    }

    const targetAngle = computeTargetHeading(petCoords.lat, petCoords.lng, idleRoamTarget.lat, idleRoamTarget.lng);
    smoothHeadingUpdate(targetAngle);

    const step = 0.000005;
    const totalDist = Math.hypot(idleRoamTarget.lng - petCoords.lng, idleRoamTarget.lat - petCoords.lat);
    if (totalDist > 0) {
      petCoords.lng += ((idleRoamTarget.lng - petCoords.lng) / totalDist) * step;
      petCoords.lat += ((idleRoamTarget.lat - petCoords.lat) / totalDist) * step;
    }

    playAnimation("walk");
  }

  function startDiamondScan() {
    if (scanInterval) clearInterval(scanInterval);

    scanInterval = setInterval(() => {
      const state = Store.get();
      if (!state.pet || !state.pet.unlocked) {
        console.log("[CompanionPet] Scan skipped - pet not unlocked");
        return;
      }
      if (isFetching) return;
      if (state.pet.mood <= 0) {
        console.log("[CompanionPet] Scan skipped - pet is angry");
        return;
      }

      const nearbyDiamond = findNearestDiamond();
      if (nearbyDiamond) {
        console.log("[CompanionPet] Found diamond, starting fetch:", nearbyDiamond);
        startFetch(nearbyDiamond);
      }
    }, 3000);
  }

  function findNearestDiamond() {
    const state = Store.get();
    if (!state.liveDiamonds) return null;

    let nearest = null;
    let nearestDist = Infinity;

    for (const did in state.liveDiamonds) {
      const d = state.liveDiamonds[did];
      const dist = Geo.haversine(petCoords.lat, petCoords.lng, d.lat, d.lon);

      if (dist <= FETCH_RADIUS_METERS && dist < nearestDist) {
        nearest = { id: did, lat: d.lat, lon: d.lon };
        nearestDist = dist;
      }
    }

    return nearest;
  }


  function startFetch(diamond) {
    const state = Store.get();
    if (!state.pet || state.pet.mood <= 0) {
      console.log("[CompanionPet] Pet mood too low to fetch");
      return;
    }

    isFetching = true;
    fetchTarget = diamond;
    fetchReturnPhase = false;
    fetchState = "turning_to_target";

    console.log("[CompanionPet] Starting fetch to:", diamond);
    playAnimation("idle");

    const fetchInterval = setInterval(() => {
      if (!isFetching || !fetchTarget) {
        clearInterval(fetchInterval);
        return;
      }

      const distToTarget = Geo.haversine(petCoords.lat, petCoords.lng, fetchTarget.lat, fetchTarget.lon);

      // 1. Arrived!
      if (distToTarget < 3.0) {
        collectDiamond(fetchTarget.id);
        clearInterval(fetchInterval);
        return;
      }

      const dx = fetchTarget.lon - petCoords.lng;
      const dy = fetchTarget.lat - petCoords.lat;
      const targetAngle = computeTargetHeading(petCoords.lat, petCoords.lng, fetchTarget.lat, fetchTarget.lon);

      smoothHeadingUpdate(targetAngle);

      // 2. Move at constant speed (No crawling slowdown)
      const step = 0.000015; // Constant forward speed
      const totalDist = Math.hypot(dx, dy);
      if (totalDist > 0) {
        petCoords.lng += (dx / totalDist) * step;
        petCoords.lat += (dy / totalDist) * step;
      }

      playAnimation("run");
    }, 50);
  }

  // --- Geographic Heading Calculator ---
  function computeTargetHeading(fromLat, fromLng, toLat, toLng) {
    const dLng = toLng - fromLng;
    const dLat = toLat - fromLat;
    return Math.atan2(dLng, dLat);
  }

  function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  }

  async function collectDiamond(diamondId) {
    const state = Store.get();
    const d = state.liveDiamonds[diamondId];
    if (!d) {
      console.log("[CompanionPet] Diamond not found, returning");
      returnToPlayer();
      return;
    }

    // Server-side validation with byPet flag for extended 500m range
    if (typeof ServerAntiCheat === "undefined" || !ServerAntiCheat.isReady()) {
      console.log("[CompanionPet] Server not ready, cannot collect");
      returnToPlayer();
      return;
    }

    try {
      const result = await ServerAntiCheat.validateCollect(
        petCoords.lat, petCoords.lng, diamondId, d.lat, d.lon, true
      );

      if (!result || !result.allowed) {
        console.log("[CompanionPet] Server rejected collection:", result?.reason);
        if (result?.reason === "too_far") {
          console.log("[CompanionPet] Diamond too far even for pet range");
        }
        returnToPlayer();
        return;
      }

      console.log("[CompanionPet] Collecting diamond:", diamondId);
      
      // Drain mood by 15% per diamond
      state.pet.mood = Math.max(0, (state.pet.mood || 100) - MOOD_DRAIN_PER_DIAMOND);
      
      if (!state.collectedDiamondIds) state.collectedDiamondIds = [];
      state.collectedDiamondIds.push(diamondId);
      if (state.collectedDiamondIds.length > 100) state.collectedDiamondIds.shift();

      delete state.liveDiamonds[diamondId];
      state.diamonds = Number(result.nextDiamonds) || ((Number(state.diamonds) || 0) + 1);
      state.pet.totalFetched = (state.pet.totalFetched || 0) + 1;
      Store.save(true);

      if (typeof Diamonds !== "undefined" && Diamonds.renderAll) {
        Diamonds.renderAll();
      }

      if (typeof showToast === "function") {
        showToast(`🎁 Your Buddy found a gift! (+1 ◆) Mood: ${Math.round(state.pet.mood)}%`);
      }

      playAnimation("jump");
      
      setTimeout(() => {
        returnToPlayer();
      }, 1500);
    } catch (e) {
      console.warn("[CompanionPet] Collect failed:", e);
      returnToPlayer();
    }
  }

  function returnToPlayer() {
    console.log("[CompanionPet] Returning to player");
    fetchReturnPhase = true;
    fetchState = "turning_to_player";
    playAnimation("idle");
    
    const returnInterval = setInterval(() => {
      const targetLng = playerCoords.lng + PET_FOLLOW_OFFSET_LNG;
      const targetLat = playerCoords.lat + PET_FOLLOW_OFFSET_LAT;

      const dist = Geo.haversine(petCoords.lat, petCoords.lng, targetLat, targetLng);

      // 1. Arrived back at player!
      if (dist < 2.0) {
        clearInterval(returnInterval);
        finishFetch();
        return;
      }

      const dx = targetLng - petCoords.lng;
      const dy = targetLat - petCoords.lat;
      const targetAngle = computeTargetHeading(petCoords.lat, petCoords.lng, targetLat, targetLng);

      smoothHeadingUpdate(targetAngle);

      // 2. Move at constant speed
      const step = 0.000018; // Constant return sprint
      const totalDist = Math.hypot(dx, dy);
      if (totalDist > 0) {
        petCoords.lng += (dx / totalDist) * step;
        petCoords.lat += (dy / totalDist) * step;
      }

      playAnimation("run");
    }, 50);
  }

  function finishFetch() {
    isFetching = false;
    fetchTarget = null;
    fetchReturnPhase = false;
    playAnimation("idle");
  }

  function startMoodDecay() {
    if (moodDecayInterval) clearInterval(moodDecayInterval);

    moodDecayInterval = setInterval(() => {
      const state = Store.get();
      if (!state.pet || !state.pet.unlocked) return;

      const now = Date.now();
      const hoursSinceLastFed = (now - (state.pet.lastFedAt || now)) / 3600000;
      const moodLoss = hoursSinceLastFed * MOOD_DECAY_PER_HOUR;

      state.pet.mood = Math.max(0, (state.pet.mood || 0) - moodLoss);
      Store.save(false);

      updateMoodAnimation();
      updatePetHUD();
    }, 60000);
  }

  function updateMoodAnimation() {
    const state = Store.get();
    if (!state.pet) return;

    const mood = Number(state.pet.mood) || 0;

    // Apply facial expression morph targets cleanly
    applyMoodExpression(mood);

    // If fetching or following the player, let movement animation take priority
    if (isFetching || isFollowing) return;

    // 🛑 Low Mood States:
    if (mood <= 15) {
      // Sit down on the ground and STAY seated (No twitching)
      playAnimation("sitting");
    } else if (mood < 40) {
      // Content / Mildly hungry: calm standing idle
      playAnimation("idle");
    }
  }

  let lastAppliedMoodTier = null;

  function applyMoodExpression(mood) {
    if (!petModel || Object.keys(petMorphTargets).length === 0) return;

    // Only update morph target if the mood category actually changed!
    // This stops the violent vertex twitching.
    let currentTier = "happy";
    if (mood <= 15) currentTier = "angry";
    else if (mood <= 40) currentTier = "sad";

    if (lastAppliedMoodTier === currentTier) return; // Already applied, don't spam!
    lastAppliedMoodTier = currentTier;

    // Reset influences
    for (const key in petMorphTargets) {
      const { mesh, index } = petMorphTargets[key];
      if (mesh.morphTargetInfluences) {
        mesh.morphTargetInfluences[index] = 0;
      }
    }

    // Apply clean facial expression
    if (currentTier === "angry" && petMorphTargets.angry) {
      const { mesh, index } = petMorphTargets.angry;
      mesh.morphTargetInfluences[index] = 1.0;
    } else if (currentTier === "sad" && petMorphTargets.sad) {
      const { mesh, index } = petMorphTargets.sad;
      mesh.morphTargetInfluences[index] = 1.0;
    } else if (currentTier === "happy" && petMorphTargets.surprised) {
      const { mesh, index } = petMorphTargets.surprised;
      mesh.morphTargetInfluences[index] = 0.4;
    }
  }

  function feedBerry() {
    const state = Store.get();
    if (!state.pet || !state.pet.unlocked) {
      if (typeof showToast === "function") showToast("🔒 Pet not unlocked yet.");
      return;
    }

    if ((state.berries || 0) <= 0) {
      if (typeof showToast === "function") showToast("🍓 No berries! Spin Elden Stops to get berries.");
      return;
    }

    state.berries--;
    state.pet.mood = Math.min(100, (state.pet.mood || 0) + 25);
    state.pet.lastFedAt = Date.now();
    Store.save(true);

    playAnimation("jump");
    if (typeof showToast === "function") showToast("🍓 Fed your buddy! Mood restored.");

    updatePetHUD();
    updatePetModal();
  }

  function addBerries(count) {
    const state = Store.get();
    state.berries = (state.berries || 0) + count;
    Store.save(true);
    updatePetHUD();
  }

  function unlockPet() {
    const state = Store.get();
    if (state.pet.unlocked) return;

    state.pet.unlocked = true;
    state.pet.mood = 100;
    state.pet.lastFedAt = Date.now();
    Store.save(true);

    if (typeof showToast === "function") {
      showToast("🐾 Companion Unlocked! A loyal Realm Familiar has joined your side!");
    }

    updatePetHUD();
  }

  function checkUnlockMilestone() {
    const state = Store.get();
    if (state.pet.unlocked) return;

    const plotCount = Object.keys(state.plots || {}).length;
    if (plotCount >= 75) {
      unlockPet();
    }
  }

  function updatePetHUD() {
    const state = Store.get();
    const hudBtn = document.getElementById("pet-hud-btn");
    const moodBadge = document.getElementById("pet-mood-badge");
    const berryCount = document.getElementById("pet-berry-count");

    if (!hudBtn) return;

    if (!state.pet || !state.pet.unlocked) {
      hudBtn.classList.add("hidden");
      return;
    }

    hudBtn.classList.remove("hidden");

    if (moodBadge) {
      const mood = Math.round(state.pet.mood || 0);
      moodBadge.textContent = `${mood}%`;
      moodBadge.className = "pet-mood-badge";
      if (mood >= 75) moodBadge.classList.add("mood-happy");
      else if (mood >= 40) moodBadge.classList.add("mood-content");
      else if (mood >= 15) moodBadge.classList.add("mood-sad");
      else moodBadge.classList.add("mood-angry");
    }

    if (berryCount) {
      berryCount.textContent = state.berries || 0;
    }

    initPetHud3D();
  }

  function initPetHud3D() {
    const container = document.getElementById("pet-hud-3d-container");
    if (!container) return;

    if (!petHudRenderer) {
      petHudScene = new THREE.Scene();
      petHudCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
      petHudCamera.position.z = 4.5;

      petHudRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      petHudRenderer.setSize(40, 40);
      petHudRenderer.setClearColor(0x000000, 0);
      container.appendChild(petHudRenderer.domElement);

      const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
      petHudScene.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0xf0d38a, 1.8);
      dirLight.position.set(1, 2, 1);
      petHudScene.add(dirLight);

      loadPetHudModel();
    }

    if (!petHudAnimFrameId) {
      animatePetHud();
    }
  }

  function loadPetHudModel() {
    const loader = new THREE.GLTFLoader();
    loader.load(
      "models/RobotExpressive.glb",
      (gltf) => {
        if (petHudModel) {
          petHudScene.remove(petHudModel);
        }

        petHudModel = gltf.scene;
        petHudModel.scale.set(0.6, 0.6, 0.6);
        petHudModel.position.y = -0.5;
        petHudMixer = new THREE.AnimationMixer(petHudModel);
        petHudAnimations = {};

        gltf.animations.forEach((clip) => {
          petHudAnimations[clip.name.toLowerCase()] = petHudMixer.clipAction(clip);
        });

        const idleKey = Object.keys(petHudAnimations).find((k) =>
          k.includes("idle") || k.includes("standing")
        ) || Object.keys(petHudAnimations)[0];

        if (idleKey && petHudAnimations[idleKey]) {
          petHudCurrentAction = petHudAnimations[idleKey];
          petHudCurrentAction.setEffectiveTimeScale(0.8);
          petHudCurrentAction.play();
        }

        petHudScene.add(petHudModel);
      },
      undefined,
      (err) => console.warn("[PetHud] Load error:", err)
    );
  }

  function animatePetHud() {
    if (!petHudRenderer || !petHudScene || !petHudCamera) return;

    petHudAnimFrameId = requestAnimationFrame(animatePetHud);

    if (petHudMixer) {
      const delta = 0.016;
      petHudMixer.update(delta);
    }

    if (petHudModel) {
      petHudModel.rotation.y += 0.005;
    }

    petHudRenderer.render(petHudScene, petHudCamera);
  }

  function updatePetModal() {
    const state = Store.get();
    if (!state.pet || !state.pet.unlocked) return;

    // Daily reset of fetched count
    const today = new Date().toISOString().slice(0, 10);
    if (state.pet.lastFetchedResetDate !== today) {
      state.pet.totalFetched = 0;
      state.pet.lastFetchedResetDate = today;
      Store.save(true);
    }

    const modal = document.getElementById("pet-modal");
    if (!modal || modal.classList.contains("hidden")) return;

    const nameEl = document.getElementById("pet-modal-name");
    const moodBarEl = document.getElementById("pet-modal-mood-bar");
    const moodTextEl = document.getElementById("pet-modal-mood-text");
    const berryCountEl = document.getElementById("pet-modal-berry-count");
    const fetchedEl = document.getElementById("pet-modal-fetched");

    if (nameEl) nameEl.textContent = state.pet.nickname || "Buddy";

    const mood = Math.round(state.pet.mood || 0);
    if (moodBarEl) moodBarEl.style.width = `${mood}%`;
    if (moodTextEl) {
      if (mood >= 75) moodTextEl.textContent = `Ecstatic (${mood}%)`;
      else if (mood >= 40) moodTextEl.textContent = `Content (${mood}%)`;
      else if (mood >= 15) moodTextEl.textContent = `Hungry (${mood}%)`;
      else moodTextEl.textContent = `Angry (${mood}%)`;
    }

    if (berryCountEl) berryCountEl.textContent = state.berries || 0;
    if (fetchedEl) fetchedEl.textContent = state.pet.totalFetched || 0;

    initPetModal3D();
  }

  function initPetModal3D() {
    const container = document.getElementById("pet-modal-3d-container");
    if (!container) return;

    if (!petModalRenderer) {
      petModalScene = new THREE.Scene();
      petModalCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
      petModalCamera.position.set(0, 0.5, 4);
      petModalCamera.lookAt(0, -0.3, 0);

      petModalRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      petModalRenderer.setSize(140, 140);
      petModalRenderer.setClearColor(0x000000, 0);
      container.appendChild(petModalRenderer.domElement);

      const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
      petModalScene.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0xf0d38a, 1.8);
      dirLight.position.set(2, 3, 2);
      petModalScene.add(dirLight);

      loadPetModalModel();
    }

    animatePetModal();
  }

  function loadPetModalModel() {
    const loader = new THREE.GLTFLoader();
    loader.load(
      "models/RobotExpressive.glb",
      (gltf) => {
        if (petModalModel) {
          petModalScene.remove(petModalModel);
        }

        petModalModel = gltf.scene;
        petModalModel.scale.set(0.3, 0.3, 0.3);
        petModalModel.position.y = -0.9;
        petModalMixer = new THREE.AnimationMixer(petModalModel);
        petModalAnimations = {};

        gltf.animations.forEach((clip) => {
          petModalAnimations[clip.name.toLowerCase()] = petModalMixer.clipAction(clip);
        });

        const idleKey = Object.keys(petModalAnimations).find((k) =>
          k.includes("idle") || k.includes("standing")
        ) || Object.keys(petModalAnimations)[0];

        if (idleKey && petModalAnimations[idleKey]) {
          petModalCurrentAction = petModalAnimations[idleKey];
          petModalCurrentAction.setEffectiveTimeScale(0.8);
          petModalCurrentAction.play();
        }

        petModalScene.add(petModalModel);
      },
      undefined,
      (err) => console.warn("[PetModal] Load error:", err)
    );
  }

  function animatePetModal() {
    if (!petModalRenderer || !petModalScene || !petModalCamera) return;

    requestAnimationFrame(animatePetModal);

    if (petModalMixer) {
      const delta = 0.016;
      petModalMixer.update(delta);
    }

    if (petModalModel) {
      petModalModel.rotation.y += 0.008;
    }

    petModalRenderer.render(petModalScene, petModalCamera);
  }

  function openPetModal() {
    const state = Store.get();
    if (!state.pet || !state.pet.unlocked) return;

    const modal = document.getElementById("pet-modal");
    if (modal) modal.classList.remove("hidden");

    // Delay 3D init slightly to ensure container is visible
    setTimeout(() => {
      updatePetModal();
    }, 100);
  }

  function closePetModal() {
    const modal = document.getElementById("pet-modal");
    if (modal) modal.classList.add("hidden");
  }

  function renamePet() {
    const state = Store.get();
    if (!state.pet || !state.pet.unlocked) return;

    const newName = prompt("Give your companion a nickname:", state.pet.nickname || "Buddy");
    if (!newName) return;

    const cleanName = newName.trim().slice(0, 16);
    if (cleanName.length < 1) return;

    state.pet.nickname = cleanName;
    Store.save(true);
    updatePetModal();
    if (typeof showToast === "function") showToast(`Pet renamed to "${cleanName}"!`);
  }

  return {
    init,
    setPlayerPosition,
    feedBerry,
    addBerries,
    checkUnlockMilestone,
    updatePetHUD,
    openPetModal,
    closePetModal,
    renamePet,
  };
})();
