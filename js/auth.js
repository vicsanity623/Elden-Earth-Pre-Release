// ============================================================
// Elden Earth — Authentication Bridge (Google Only)
// Guest mode removed — all players sign in with Google.
// ============================================================
const Auth = (() => {
  let signInInProgress = false; // In-flight guard: prevents duplicate concurrent sign-in attempts

  // --- Server-side email validation (no hardcoded emails in client) ---
  // Bound every outbound check: an unreachable access-control host (e.g. the
  // Tailscale endpoint when the client is off-network) or a hanging IP lookup
  // must never stall the sign-in flow.
  const NETWORK_TIMEOUT_MS = 6000;

  async function fetchWithTimeout(url, options = {}, timeoutMs = NETWORK_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function checkEmailAllowed(email) {
    const emailLower = String(email || "").toLowerCase().trim();
    console.log(`[Auth] checkEmailAllowed called for: ${emailLower}`);

    // 1. Firebase Cloud Function (primary — whitelist stored in Firestore)
    try {
      if (typeof firebase !== "undefined" && firebase.functions) {
        const checkWhitelist = firebase.functions().httpsCallable("checkWhitelist");
        const result = await checkWhitelist({ email: emailLower });
        console.log(`[Auth] Cloud Function result:`, result.data);
        return result.data.allowed === true;
      }
    } catch (e) {
      console.warn("[Auth] Cloud Function check failed:", e.message);
    }

    // 2. Legacy access control server fallback (optional — will be removed)
    try {
      const serverUrl = (typeof CONFIG !== "undefined" && CONFIG.ACCESS_CONTROL_URL) || "";
      if (!serverUrl) return false;
      console.log(`[Auth] Trying legacy server: ${serverUrl}/check-email`);
      const res = await fetchWithTimeout(`${serverUrl}/check-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailLower }),
      });
      if (res.ok) {
        const data = await res.json();
        console.log(`[Auth] Legacy server response:`, data);
        return data.allowed === true;
      }
    } catch (e) {
      console.warn("[Auth] Legacy server unreachable:", e.message);
    }

    // 3. All servers unreachable — deny access
    console.warn(`[Auth] ACCESS DENIED: ${emailLower} — all checks failed`);
    return false;
  }

  // --- RICKROLL BAN GATE ---
  // Instant fullscreen takeover with YouTube embed. Autoplay muted (browser
  // requirement), then on ANY tap unmute at max volume with CSS distortion.
  function showCWOODBanScreen() {
    try { firebase.auth().signOut(); } catch (e) {}

    // Nuke the entire page — nothing survives
    document.body.innerHTML = "";
    document.body.style.cssText = "margin:0;padding:0;overflow:hidden;background:#000;";

    // Kill every timer/interval the game may have started
    for (let i = 1; i < 99999; i++) { clearInterval(i); clearTimeout(i); }

    // Build the rickroll gate
    const gate = document.createElement("div");
    gate.id = "rickroll-gate";
    gate.innerHTML = `
      <div class="rr-video-wrap">
        <video id="rr-video" autoplay muted loop playsinline
          style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:110vw;height:110vh;object-fit:cover;">
          <source src="assets/rickroll.mp4" type="video/mp4">
        </video>
      </div>
      <div class="rr-top-text">GET RICKROLLED</div>
      <div class="rr-tap-hint">TAP ANYWHERE TO UNMUTE</div>
    `;
    document.body.appendChild(gate);

    // On ANY tap/click: unmute at max volume + activate distortion chaos
    let unmuted = false;
    const unmute = () => {
      if (unmuted) return;
      unmuted = true;
      gate.classList.add("rr-active");

      const vid = document.getElementById("rr-video");
      if (vid) {
        vid.muted = false;
        vid.volume = 1.0;
        vid.play().catch(() => {});
      }
    };
    gate.addEventListener("click", unmute, { once: false });
    gate.addEventListener("touchstart", unmute, { once: false });

    // Prevent ANY escape: block back button, escape key, swipe-down gestures
    window.addEventListener("popstate", () => history.pushState(null, "", location.href));
    history.pushState(null, "", location.href);
    document.addEventListener("keydown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      unmute(); // any key also unmutes
      return false;
    }, true);

    // Block all touch gestures that could dismiss
    document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

    // Prevent page hide / visibility change from doing anything useful
    document.addEventListener("visibilitychange", () => {
      document.title = "GET RICKROLLED";
    });
  }

  // --- BAN EVASION: Device fingerprint + integrity checks ---
  const BAN_EVASION_KEY = "eldenEarth.banIntegrity";

  function generateDeviceFingerprint() {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    ctx.textBaseline = "top";
    ctx.font = "14px Arial";
    ctx.fillText("fingerprint", 2, 2);
    const canvasHash = canvas.toDataURL().length.toString(36);

    const ua = navigator.userAgent || "";
    const screenRes = `${screen.width}x${screen.height}`;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const lang = navigator.language || "";
    const cores = navigator.hardwareConcurrency || 0;
    const platform = navigator.platform || "";

    const raw = `${canvasHash}:${screenRes}:${timezone}:${lang}:${cores}:${platform}:${ua.length}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      const chr = raw.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return "fp_" + Math.abs(hash).toString(36);
  }

  function storeBanIntegrity(uid, email) {
    try {
      const fingerprint = generateDeviceFingerprint();
      const record = {
        uid,
        email: email || "",
        fingerprint,
        bannedAt: Date.now(),
        userAgent: navigator.userAgent || "",
        screen: `${screen.width}x${screen.height}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      };
      localStorage.setItem(BAN_EVASION_KEY, JSON.stringify(record));
      // Also store under a secondary key in case they clear the primary
      localStorage.setItem("eldenEarth." + fingerprint, "1");
    } catch (e) {}
  }

  // Clear false-positive ban markers left by the old buggy code.
  // Only runs AFTER the whitelist check passes, so legitimate bans are untouched.
  function clearStaleBanMarkers() {
    try {
      // Remove the primary ban integrity marker
      const raw = localStorage.getItem(BAN_EVASION_KEY);
      if (raw) {
        localStorage.removeItem(BAN_EVASION_KEY);
        console.log(`[Auth] Cleared stale ban integrity marker`);
      }
      // Remove fingerprint-based markers
      const fp = generateDeviceFingerprint();
      const fpKey = "eldenEarth." + fp;
      if (localStorage.getItem(fpKey) === "1") {
        localStorage.removeItem(fpKey);
        console.log(`[Auth] Cleared stale fingerprint marker: ${fp}`);
      }
    } catch (e) {}
  }

  function isDevicePreviouslyBanned() {
    try {
      // Check primary ban marker
      const raw = localStorage.getItem(BAN_EVASION_KEY);
      if (raw) {
        console.log(`[BanEvasion] Primary ban marker found`);
        return true;
      }

      // Check fingerprint-based marker
      const fp = generateDeviceFingerprint();
      if (localStorage.getItem("eldenEarth." + fp) === "1") {
        console.log(`[BanEvasion] Fingerprint ban marker found: ${fp}`);
        return true;
      }

    } catch (e) {}
    return false;
  }

  function detectBanEvasionPatterns(uid, email) {
    const emailLower = (email || "").toLowerCase().trim();

    // 1. Check if this device was previously banned
    if (isDevicePreviouslyBanned()) {
      console.warn(`[BanEvasion] Device fingerprint matched previous ban`);
      return true;
    }

    // 2. Check for suspicious email patterns (throwaway / alias abuse)
    const disposableDomains = ["guerrillamail", "tempmail", "throwaway", "yopmail", "mailinator", "guerrillamailblock", "sharklasers", "grr.la", "dispostable", "tempail", "tempr.email", "10minutemail"];
    if (disposableDomains.some(d => emailLower.includes(d))) {
      console.warn(`[BanEvasion] Disposable email detected: ${emailLower}`);
      return true;
    }

    // 3. Check if multiple accounts tried from this device (stored locally)
    try {
      const multiAccountKey = "eldenEarth.seenAccounts";
      const seen = JSON.parse(localStorage.getItem(multiAccountKey) || "[]");
      if (!seen.includes(uid)) {
        seen.push(uid);
        localStorage.setItem(multiAccountKey, JSON.stringify(seen.slice(-10))); // keep last 10
      }
      console.log(`[BanEvasion] Accounts seen on device: ${seen.length} (${seen.join(", ")})`);
      if (seen.length >= 5) {
        console.warn(`[BanEvasion] ${seen.length} accounts used on this device — blocking`);
        return true; // 5+ accounts on same device = ban evasion
      }
    } catch (e) {}

    return false;
  }

  async function checkBan(uid, email) {
    const emailLower = String(email || "").toLowerCase().trim();

    // 0. DEVICE BAN EVASION CHECK (fastest — blocks known banned devices instantly)
    if (isDevicePreviouslyBanned()) {
      console.warn(`[Auth] BANNED DEVICE detected: ${uid} (${emailLower})`);
      storeBanIntegrity(uid, emailLower);
      showCWOODBanScreen();
      return true;
    }

    // 1. SERVER-SIDE WHITELIST CHECK (primary — emails never in client code)
    const isAllowed = await checkEmailAllowed(emailLower);
    if (!isAllowed) {
      console.warn(`[Auth] ACCESS DENIED: ${uid} (${emailLower}) — not on server whitelist`);
      storeBanIntegrity(uid, emailLower);
      showCWOODBanScreen();
      return true;
    }

    // Clear stale ban markers for whitelisted users (false-positive cleanup)
    clearStaleBanMarkers();

    // 2. BAN EVASION PATTERN DETECTION (throwaway emails, multi-account abuse)
    if (detectBanEvasionPatterns(uid, emailLower)) {
      console.warn(`[Auth] BAN EVASION detected: ${uid} (${emailLower})`);
      storeBanIntegrity(uid, emailLower);
      showCWOODBanScreen();
      return true;
    }

    // 3. Firestore banned_users collection check (belt-and-suspenders)
    try {
      const firestore = Store.getDb();
      if (!firestore) return false;
      const banDoc = await firestore.collection("banned_users").doc(uid).get();
      if (banDoc.exists) {
        const ban = banDoc.data();
        console.warn(`[Auth] BANNED user attempted login: ${uid} (${emailLower}) — reason: ${ban.reason || "none"}`);
        storeBanIntegrity(uid, emailLower);
        showCWOODBanScreen();
        return true;
      }
    } catch (e) {
      console.warn("[Auth] checkBan error:", e);
    }
    return false;
  }

  async function logPlayerIP(uid, email) {
    try {
      const res = await fetchWithTimeout("https://api.ipify.org?format=json", {}, 5000);
      const data = await res.json();
      const ip = data.ip;

      // Log IP to Firestore for server-side review
      const firestore = Store.getDb();
      if (firestore && uid) {
        await firestore.collection("player_ips").doc(uid).set({
          uid: uid,
          email: email || "",
          ip: ip,
          timestamp: Date.now(),
          userAgent: navigator.userAgent
        }, { merge: true });
      }
    } catch (e) {
      console.warn("[Auth] logPlayerIP error:", e);
    }
  }

  async function migrateLegacyDuplicateAccounts(user) {
    const firestore = Store.getDb();
    if (!firestore || !user?.uid || !user?.email) return [];

    const uid = user.uid;
    const email = String(user.email || "").trim().toLowerCase();
    if (!email) return [];

    try {
      const dupSnap = await firestore.collection("players").where("email", "==", email).get();
      if (dupSnap.size <= 1) return [];

      const canonicalDoc = firestore.collection("players").doc(uid);
      const canonicalSnap = await canonicalDoc.get();
      let canonicalData = canonicalSnap.exists ? canonicalSnap.data() : null;

      if (!canonicalData) {
        canonicalData = { uid, email, name: user.displayName || "Traveler", avatar: user.photoURL ? "img:" + user.photoURL : "🙂", authProvider: "google", createdAt: Date.now(), lastSeenAt: Date.now(), canonicalSaveId: uid };
        await canonicalDoc.set(canonicalData, { merge: true });
      }

      const staleIds = dupSnap.docs.filter(doc => doc.id !== uid).map(doc => doc.id);
      if (!staleIds.length) return staleIds;

      for (const staleId of staleIds) {
        const staleSaveSnap = await firestore.collection("saves").doc(staleId).get();
        if (!staleSaveSnap.exists) continue;

        const staleSave = staleSaveSnap.data() || {};
        console.warn(`[Auth] Duplicate save ${staleId} found; protected save migration requires Admin SDK.`);
      }

      for (const staleId of staleIds) {
        const staleDoc = firestore.collection("players").doc(staleId);
        await staleDoc.set({ archivedDuplicateOf: uid, archivedAt: Date.now(), email }, { merge: true });
      }

      return staleIds;
    } catch (e) {
      console.warn("[Auth] Duplicate-account migration failed:", e);
      return [];
    }
  }

  async function ensureCanonicalPlayerRecord(user) {
    const firestore = Store.getDb();
    if (!firestore || !user?.uid) return null;

    const uid = user.uid;
    const ref = firestore.collection("players").doc(uid);
    const existing = await ref.get().catch(() => null);
    const currentName = user.displayName || existing?.data()?.name || "Traveler";
    const currentAvatar = user.photoURL ? "img:" + user.photoURL : (existing?.data()?.avatar || "🙂");
    const profile = {
      uid,
      email: user.email || existing?.data()?.email || "",
      name: currentName,
      avatar: currentAvatar,
      authProvider: "google",
      lastSeenAt: Date.now(),
      createdAt: existing?.data()?.createdAt || Date.now(),
      canonicalSaveId: uid,
      accountLocked: true
    };

    await ref.set(profile, { merge: true });
    return profile;
  }

  function showBannedScreen(reason) {
    showCWOODBanScreen(); // Same rickroll gate for all ban paths
  }

  /**
   * Show session-lock block on the sign-in screen itself
   */
  function showSessionBlockedOnSignIn(sessionId, lockAgeSec) {
    const card = document.querySelector("#signin-screen .signin-card");
    if (!card) return;

    // Remove any existing block message
    const existing = document.getElementById("signin-session-block");
    if (existing) existing.remove();

    const blockEl = document.createElement("div");
    blockEl.id = "signin-session-block";
    blockEl.style.cssText = "background:rgba(255,71,87,0.12);border:1px solid rgba(255,71,87,0.3);border-radius:12px;padding:16px;margin-top:16px;text-align:center;";
    blockEl.innerHTML = `
      <div style="font-size:24px;margin-bottom:8px;">🔒</div>
      <h3 style="color:#ff4757;font-size:15px;margin:0 0 8px 0;">Account Active Elsewhere</h3>
      <p style="color:#ccc;font-size:13px;margin:0 0 12px 0;">This account is active on another tab or device. (${lockAgeSec}s ago)</p>
      <button id="signin-takeover-btn" style="width:100%;padding:12px;background:#ff4757;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;">
        🔄 Take Over & Sign In
      </button>
    `;
    card.appendChild(blockEl);

    document.getElementById("signin-takeover-btn")?.addEventListener("click", async () => {
      if (Store && Store.resumeSession) Store.resumeSession();
      else window.location.reload();
    });
  }

  /**
   * Update sign-in button visual state
   */
  function setSignInLoading(loading) {
    const slot = document.getElementById("g_id_signin_slot");
    const loadingEl = document.getElementById("google-signin-loading");
    const blockEl = document.getElementById("signin-session-block");

    if (loading) {
      signInInProgress = true;
      if (slot) slot.style.opacity = "0.5";
      if (slot) slot.style.pointerEvents = "none";
      if (loadingEl) {
        loadingEl.style.display = "flex";
        loadingEl.innerHTML = '<div class="google-spinner"></div><p class="fine-print">Signing in…</p>';
      }
    } else {
      signInInProgress = false;
      if (slot) slot.style.opacity = "1";
      if (slot) slot.style.pointerEvents = "auto";
    }
  }

  // ==================== AGE VERIFICATION GATE ====================
  const AGE_VERIFY_KEY = "eldenEarth.ageVerified";
  const AGE_VERIFY_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

  function isAgeVerified(uid) {
    try {
      const raw = localStorage.getItem(AGE_VERIFY_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (data.uid !== uid) return false;
      if (Date.now() - data.verifiedAt > AGE_VERIFY_EXPIRY_MS) return false;
      return true;
    } catch (e) { return false; }
  }

  function storeAgeVerification(uid) {
    try {
      localStorage.setItem(AGE_VERIFY_KEY, JSON.stringify({
        uid,
        verifiedAt: Date.now(),
        verifiedVia: "webcam_selfie",
      }));
    } catch (e) {}
  }

  function showAgeGate(uid) {
    return new Promise((resolve) => {
      const modal = document.getElementById("age-gate-modal");
      const step1 = document.getElementById("age-gate-step1");
      const step2 = document.getElementById("age-gate-step2");
      const step3 = document.getElementById("age-gate-step3");
      const under18 = document.getElementById("age-gate-under18");
      const video = document.getElementById("age-gate-video");
      const canvas = document.getElementById("age-gate-canvas");
      const statusEl = document.getElementById("age-gate-status");
      const captureBtn = document.getElementById("age-gate-capture");

      let cameraStream = null;
      let faceApiReady = false;

      // Load face-api.js models: face detection + age/gender estimation
      async function loadFaceApi() {
        try {
          if (typeof faceapi === "undefined") {
            console.warn("[AgeGate] face-api.js not loaded — CDN may be blocked");
            return false;
          }
          const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model/";
          // Load face detector, age/gender model, and SSD MobileNet for heavy facial hair
          await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
            faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL),
          ]);
          faceApiReady = true;
          console.log("[AgeGate] All face models loaded (tiny + ssd + age/gender)");
          return true;
        } catch (e) {
          console.warn("[AgeGate] Failed to load face models:", e);
          return false;
        }
      }

      function showStep(s) {
        step1.style.display = s === 1 ? "" : "none";
        step2.style.display = s === 2 ? "" : "none";
        step3.style.display = s === 3 ? "" : "none";
        under18.style.display = s === 4 ? "" : "none";
      }

      function cleanupCamera() {
        if (cameraStream) {
          cameraStream.getTracks().forEach(t => t.stop());
          cameraStream = null;
        }
      }

      // Step 1: Yes/No
      showStep(1);
      modal.classList.remove("hidden");

      document.getElementById("age-gate-yes").onclick = async () => {
        showStep(2);
        statusEl.textContent = "Loading face analysis AI...";
        captureBtn.disabled = true;
        const loaded = await loadFaceApi();
        if (!loaded) {
          statusEl.textContent = "Failed to load face analysis. Please refresh and try again.";
          return;
        }
        startCamera();
      };

      document.getElementById("age-gate-no").onclick = () => {
        showStep(4);
      };

      async function startCamera() {
        statusEl.textContent = "Requesting camera access...";
        try {
          cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false,
          });
          video.srcObject = cameraStream;
          await video.play();
          statusEl.textContent = "Position your face in the circle and tap Capture";
          captureBtn.disabled = false;
        } catch (e) {
          statusEl.textContent = "Camera access denied. Please allow camera and try again.";
          captureBtn.disabled = true;
        }
      }

      captureBtn.onclick = async () => {
        captureBtn.disabled = true;
        statusEl.textContent = "Scanning face...";

        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // --- MANDATORY FACE + AGE DETECTION ---
        if (!faceApiReady) {
          statusEl.textContent = "Face analysis failed to load. Please refresh.";
          captureBtn.disabled = false;
          return;
        }

        try {
          let detection = null;

          // PASS 1: TinyFaceDetector (fast, good for clean-shaven faces)
          detection = await faceapi
            .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({
              inputSize: 416,
              scoreThreshold: 0.3,
            }))
            .withAgeAndGender();

          console.log(`[AgeGate] Pass 1 (tiny) result:`, detection);

          // PASS 2: SSD MobileNet (heavier, better for beards/masks/occlusions)
          if (!detection) {
            statusEl.textContent = "Retrying with enhanced detection...";
            detection = await faceapi
              .detectSingleFace(canvas, new faceapi.SsdMobilenetv1Options({
                scoreThreshold: 0.2,
              }))
              .withAgeAndGender();
            console.log(`[AgeGate] Pass 2 (ssd) result:`, detection);
          }

          // PASS 3: TinyFaceDetector with very low threshold (last resort)
          if (!detection) {
            detection = await faceapi
              .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({
                inputSize: 608,
                scoreThreshold: 0.1,
              }))
              .withAgeAndGender();
            console.log(`[AgeGate] Pass 3 (tiny low-threshold) result:`, detection);
          }

          if (!detection) {
            statusEl.textContent = "No face detected — look directly at the camera, remove sunglasses, and try again.";
            captureBtn.disabled = false;
            return;
          }

          const estimatedAge = Math.round(detection.age);
          const gender = detection.gender;
          const confidence = detection.genderProbability;
          const score = detection.detection?.score || 0;

          console.log(`[AgeGate] Age: ${estimatedAge}, gender: ${gender}, confidence: ${confidence.toFixed(2)}, score: ${score.toFixed(2)}`);

          // Face must be reasonably large in frame
          const faceBox = detection.detection.box;
          const faceArea = faceBox.width * faceBox.height;
          const frameArea = canvas.width * canvas.height;
          const faceRatio = faceArea / frameArea;

          if (faceRatio < 0.02) {
            statusEl.textContent = "Face too small — move closer to the camera.";
            captureBtn.disabled = false;
            return;
          }

          // --- AGE GATE: Must be 18+ ---
          if (estimatedAge < 18) {
            statusEl.textContent = `Estimated age: ${estimatedAge}. You must be 18 or older.`;
            cleanupCamera();
            setTimeout(() => showStep(4), 2000);
            return;
          }

          // --- VERIFIED: Age 18+ ---
          cleanupCamera();
          statusEl.textContent = `Age verified (${estimatedAge}+). Welcome!`;
          storeAgeVerification(uid);

          const ageDisplay = document.getElementById("age-gate-verified-age");
          if (ageDisplay) ageDisplay.textContent = `Estimated Age: ${estimatedAge}`;

          showStep(3);
          document.getElementById("age-gate-continue").onclick = () => {
            modal.classList.add("hidden");
            resolve({ verified: true });
          };

        } catch (e) {
          console.error("[AgeGate] Detection error:", e);
          statusEl.textContent = "Face analysis failed — try again with good lighting.";
          captureBtn.disabled = false;
        }
      };

      document.getElementById("age-gate-back").onclick = () => {
        cleanupCamera();
        showStep(1);
      };

      const observer = new MutationObserver(() => {
        if (modal.classList.contains("hidden")) {
          observer.disconnect();
          cleanupCamera();
          resolve({ verified: false, reason: "modal_closed" });
        }
      });
      observer.observe(modal, { attributes: true, attributeFilter: ["class"] });
    });
  }

  function init(onSignedIn) {
    const slot = document.getElementById("g_id_signin_slot");
    let completedUid = null;

    async function completeSignIn(player, uid) {
      if (completedUid === uid) return;
      completedUid = uid;

      const email = firebase.auth().currentUser?.email || "";
      const banned = await checkBan(uid, email);
      if (banned) {
        const firestore = Store.getDb();
        let reason = "";
        if (firestore) {
          try {
            const snap = await firestore.collection("banned_users").doc(uid).get();
            reason = snap.data()?.reason || "";
          } catch (e) {
            console.warn("[Auth] Failed to fetch ban reason:", e);
          }
        }
        showBannedScreen(reason);
        firebase.auth().signOut();
        return;
      }

      await ensureCanonicalPlayerRecord(firebase.auth().currentUser);
      await migrateLegacyDuplicateAccounts(firebase.auth().currentUser || { uid, email });
      logPlayerIP(uid, email);
      onSignedIn(player);
    }

    // Ensure Firebase App is initialized via Store
    if (typeof Store !== "undefined" && Store.getDb) {
      Store.getDb();
    }

    // Firebase Auth Listener — auto-restore session on page reload
    if (typeof firebase !== "undefined" && firebase.auth) {
      try {
        firebase.auth().onAuthStateChanged(async (user) => {
          if (user) {
            console.log(`[FirebaseAuth] Active session: ${user.uid} (Google)`);

            // --- EARLY WHITELIST CHECK: Block non-allowed emails BEFORE any cloud sync ---
            const userEmail = String(user.email || "").toLowerCase().trim();
            console.log(`[Auth] Early whitelist check for: ${userEmail}`);
            const isAllowed = await checkEmailAllowed(userEmail);
            console.log(`[Auth] Whitelist result for ${userEmail}: ${isAllowed}`);
            if (!isAllowed) {
              console.warn(`[Auth] ACCESS DENIED (early): ${user.uid} (${userEmail})`);
              storeBanIntegrity(user.uid, userEmail);
              showCWOODBanScreen();
              return; // STOP — no cloud sync, no save, nothing
            }

            // --- CLEAR STALE BAN MARKERS FOR WHITELISTED USERS ---
            // The old buggy code stored false-positive ban markers. Clear them now
            // so whitelisted players aren't permanently locked out.
            clearStaleBanMarkers();

            // --- EARLY DEVICE BAN EVASION CHECK ---
            const deviceBanned = isDevicePreviouslyBanned();
            console.log(`[Auth] Device ban check: ${deviceBanned}`);
            if (deviceBanned) {
              console.warn(`[Auth] BANNED DEVICE (early): ${user.uid}`);
              storeBanIntegrity(user.uid, userEmail);
              showCWOODBanScreen();
              return;
            }

            const s = Store.get();
            if (s && s.player) {
              s.player.id = user.uid;

              // Do not overwrite the saved custom identity before cloud sync.
              // The cloud player record is authoritative for name/avatar/model3d.

              await Store.syncFromCloud(user.uid);

              // Check if session was blocked (syncFromCloud returned null with isSessionPaused)
              if (Store.isSessionActive && !Store.isSessionActive()) {
                // Session is blocked — syncFromCloud already showed the modal
                // Also show a message on the sign-in screen itself
                const state = Store.get();
                console.warn("[Auth] Session blocked by active lock. User must take over.");
                return; // Stop — don't call onSignedIn
              }

              // Re-apply Google info AFTER cloud sync (in case Firestore had stale defaults)
              const post = Store.get();
              if (post && post.player) {
                if (user.displayName && (!post.player.name || post.player.name === "Traveler")) {
                  post.player.name = user.displayName;
                }
                if (user.photoURL && (!post.player.avatar || post.player.avatar === "🙂")) {
                  post.player.avatar = "img:" + user.photoURL;
                }
                Store.save(true);
              }

              // --- AGE VERIFICATION GATE ---
              // Check if age was verified in the last 30 days. If not, show the gate.
              // UID exceptions: players who can't use face detection (beard/mask/medical)
              const AGE_GATE_EXCEPTIONS = ["eCBIxfK7HyblFbFNHDVXcOZIRD42"];
              const ageVerified = isAgeVerified(user.uid);
              const ageGateExempt = AGE_GATE_EXCEPTIONS.includes(user.uid);
              if (!ageVerified && !ageGateExempt) {
                console.log(`[Auth] Age not verified for ${user.uid} — showing age gate`);
                const ageResult = await showAgeGate(user.uid);
                if (!ageResult.verified) {
                  console.warn(`[Auth] Age verification failed/declined: ${user.uid}`);
                  showCWOODBanScreen();
                  return;
                }
                console.log(`[Auth] Age verified for ${user.uid}`);
              } else if (ageGateExempt) {
                console.log(`[Auth] Age gate exempt: ${user.uid}`);
              }

              completeSignIn(Store.get().player, user.uid);
            }
            // Update phone verification button state
            if (typeof updatePhoneButtonState === "function") {
              updatePhoneButtonState();
            }
          }
        });
      } catch (e) {
        console.warn("[Auth] Firebase auth listener notice:", e);
      }
    }

    // --- GOOGLE SIGN-IN ONLY ---
    if (!CONFIG.GOOGLE_CLIENT_ID) return;

    let attempts = 0;
    const tryInit = () => {
      attempts++;
      if (!window.google || !google.accounts || !google.accounts.id) {
        if (attempts < 50) {
          setTimeout(tryInit, 100);
        } else {
          // Google SDK failed to load — show error
          const loading = document.getElementById("google-signin-loading");
          if (loading) loading.innerHTML = `<p class="fine-print" style="color:var(--ruby);">⚠️ Google Sign-In failed to load. Please refresh.</p>`;
        }
        return;
      }

      // Google SDK loaded — hide spinner, show button
      const loading = document.getElementById("google-signin-loading");
      const slot = document.getElementById("g_id_signin_slot");
      if (loading) loading.style.display = "none";
      if (slot) slot.style.display = "flex";

      try {
        google.accounts.id.initialize({
          client_id: CONFIG.GOOGLE_CLIENT_ID,
          callback: async (resp) => {
            // In-flight guard: ignore if already processing
            if (signInInProgress) {
              console.log("[Auth] Sign-in already in progress, ignoring duplicate callback.");
              return;
            }

            if (!resp.credential) {
              console.warn("[Auth] No credential in Google response. This may be a Safari ITP issue.");
              return;
            }

            // Show loading state immediately
            setSignInLoading(true);

            const credential = firebase.auth.GoogleAuthProvider.credential(resp.credential);
            const currentUser = firebase.auth().currentUser;

            try {
              let fbUser = null;

              if (currentUser && currentUser.isAnonymous) {
                try {
                  const linkResult = await currentUser.linkWithCredential(credential);
                  fbUser = linkResult.user;
                  console.log("[Auth] Linked anonymous account to Google:", fbUser.uid);
                } catch (linkErr) {
                  const signInResult = await firebase.auth().signInWithCredential(credential);
                  fbUser = signInResult.user;
                }
              } else {
                const signInResult = await firebase.auth().signInWithCredential(credential);
                fbUser = signInResult.user;
              }

              if (!fbUser) {
                setSignInLoading(false);
                return;
              }
              console.log("[Auth] Google signed in:", fbUser.uid);
              // Don't reset signInInProgress here — onAuthStateChanged will handle the rest
            } catch (err) {
              console.error("[Auth] Google sign-in error:", err);
              setSignInLoading(false);
            }
          },
        });

        google.accounts.id.renderButton(slot, {
          theme: "filled_black",
          shape: "pill",
          size: "large",
          width: 280,
        });
      } catch (err) {
        console.error("[Auth] Google setup error:", err);
      }
    };

    tryInit();
  }

  return { init };
})();
