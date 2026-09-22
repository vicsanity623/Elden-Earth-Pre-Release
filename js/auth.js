// ============================================================
// Elden Earth — Authentication Bridge (Google Only)
// Guest mode removed — all players sign in with Google.
// ============================================================
const Auth = (() => {
  let signInInProgress = false; // In-flight guard: prevents duplicate concurrent sign-in attempts

  // --- Server-side email validation (no hardcoded emails in client) ---
  async function checkEmailAllowed(email) {
    // First, try server-side validation
    try {
      const serverUrl = (typeof CONFIG !== "undefined" && CONFIG.ACCESS_CONTROL_URL) || "http://localhost:8877";
      const res = await fetch(`${serverUrl}/check-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.allowed === true;
      }
    } catch (e) {
      console.warn("[Auth] Access control server unreachable, using fallback check:", e.message);
    }

    // Fallback: if the gate server is down, fail OPEN — the game is public and
    // banned emails are still blocked by the Firestore banned_users check above.
    console.warn("[Auth] No server response — allowing access (bans still enforced via Firestore)");
    return true;
  }

  function showCWOODBanScreen() {
    document.body.innerHTML = `
      <div style="position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;background:#000;color:#fff;font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:24px;">
        <div style="max-width:520px;">
          <div style="font-size:64px;margin-bottom:16px;">🔒</div>
          <h1 style="color:#ff0000;font-size:28px;font-weight:900;margin:0 0 12px 0;text-transform:uppercase;letter-spacing:2px;">ACCESS DENIED</h1>
          <p style="color:#ff4444;font-size:18px;font-weight:700;margin:0 0 20px 0;">
            This account is blocked from the Realm.
          </p>
          <div style="background:rgba(255,0,0,0.1);border:1px solid rgba(255,0,0,0.3);border-radius:8px;padding:16px;margin-bottom:20px;">
            <p style="color:#ccc;font-size:14px;margin:0 0 12px 0;">If you know Vic, call him up and be like:<br><span style="color:#fff;font-weight:700;">"Yo, let me play that dope ass game, bro!"</span></p>
            <p style="color:#888;font-size:13px;margin:0;">If you don't know him — then your loss, not ours.</p>
          </div>
          <p style="color:#666;font-size:11px;">This session has been terminated.</p>
        </div>
      </div>`;
    try { firebase.auth().signOut(); } catch (e) {}
  }

  async function checkBan(uid, email) {
    const emailLower = String(email || "").toLowerCase().trim();

    // 1. SERVER-SIDE WHITELIST CHECK (primary — emails never in client code)
    const isAllowed = await checkEmailAllowed(emailLower);
    if (!isAllowed) {
      console.warn(`[Auth] ACCESS DENIED: ${uid} (${emailLower}) — not on server whitelist`);
      showCWOODBanScreen();
      return true;
    }

    // 2. Firestore banned_users collection check (belt-and-suspenders)
    try {
      const firestore = Store.getDb();
      if (!firestore) return false;
      const banDoc = await firestore.collection("banned_users").doc(uid).get();
      if (banDoc.exists) {
        const ban = banDoc.data();
        console.warn(`[Auth] BANNED user attempted login: ${uid} (${emailLower}) — reason: ${ban.reason || "none"}`);
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
      const res = await fetch("https://api.ipify.org?format=json");
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
    document.body.innerHTML = `
      <div style="position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;background:#000;color:#fff;font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:24px;">
        <div style="max-width:520px;">
          <div style="font-size:64px;margin-bottom:16px;">🚫</div>
          <h1 style="color:#ff0000;font-size:28px;font-weight:900;margin:0 0 12px 0;text-transform:uppercase;letter-spacing:2px;">ACCESS DENIED</h1>
          <p style="color:#ff4444;font-size:18px;font-weight:700;margin:0 0 20px 0;">
            This account is blocked from the Realm.
          </p>
          <div style="background:rgba(255,0,0,0.1);border:1px solid rgba(255,0,0,0.3);border-radius:8px;padding:16px;margin-bottom:20px;">
            <p style="color:#ccc;font-size:14px;margin:0 0 12px 0;">If you know Vic, call him up and be like:<br><span style="color:#fff;font-weight:700;">"Yo, let me play that dope ass game, bro!"</span></p>
            <p style="color:#888;font-size:13px;margin:0;">If you don't know him — then your loss, not ours.</p>
          </div>
          <p style="color:#666;font-size:11px;">This session has been terminated.</p>
        </div>
      </div>`;
    try { firebase.auth().signOut(); } catch (e) {}
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
            const isAllowed = await checkEmailAllowed(userEmail);
            if (!isAllowed) {
              console.warn(`[Auth] ACCESS DENIED (early): ${user.uid} (${userEmail})`);
              showCWOODBanScreen();
              return; // STOP — no cloud sync, no save, nothing
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
