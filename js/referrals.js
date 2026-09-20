// ============================================================
// Elden Earth — Referral System (Firestore-Backed)
// ============================================================
const Referrals = (() => {
  const REFERRAL_BONUS_EB = 25;

  function db() { return Store.getDb(); }
  function myId() { return Store.get()?.player?.id; }
  function myName() { return Store.get()?.player?.name || "Traveler"; }
  function myAvatar() { return Store.get()?.player?.avatar || "🙂"; }

  function toast(msg, dur) {
    if (typeof window.showToast === "function") window.showToast(msg, dur);
    else console.log("[Referrals]", msg);
  }

  function formatRoyalty(val) {
    if (val >= 1) return val.toFixed(2);
    if (val >= 0.01) return val.toFixed(3);
    return val.toFixed(4);
  }

  // ======================== CODE GENERATION ========================
  function generateCode(playerName) {
    const base = (playerName || "traveler").replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `${base}${rand}`;
  }

  // ======================== APPLY REFERRAL ========================
  async function applyReferral(referralCode) {
    const id = myId();
    const d = db();
    if (!id || !d || !referralCode) return false;

    const state = Store.get();
    if (state.player?.referredBy) return false;

    const cleanCode = referralCode.trim().toUpperCase();
    let referrerDoc;
    try {
      const snap = await d.collection("players")
        .where("referralCode", "==", cleanCode)
        .limit(1)
        .get();

      if (snap.empty) {
        toast("❌ Invalid referral code.", 3000);
        return false;
      }
      referrerDoc = snap.docs[0];
    } catch (e) {
      console.warn("[Referrals] Code lookup error:", e);
      toast("⚠️ Could not verify code.", 3000);
      return false;
    }

    const referrerId = referrerDoc.id;
    if (referrerId === id) {
      toast("⚠️ You cannot refer yourself!", 3000);
      return false;
    }

    const referrerData = referrerDoc.data();

    try {
      await d.collection("referrals").add({
        referrerId,
        referrerName: referrerData.name || "Unknown",
        referredId: id,
        referredName: myName(),
        referredAvatar: myAvatar(),
        timestamp: Date.now(),
        bonusGiven: REFERRAL_BONUS_EB
      });
    } catch (e) {
      console.warn("[Referrals] Record error:", e);
      toast("⚠️ Could not record referral.", 3000);
      return false;
    }

    try {
      await d.collection("referral_bonuses").add({
        toId: referrerId,
        toName: referrerData.name || "Unknown",
        fromId: id,
        fromName: myName(),
        amount: REFERRAL_BONUS_EB,
        claimed: false,
        timestamp: Date.now()
      });
    } catch (e) {
      console.warn("[Referrals] Bonus create error:", e);
    }

    state.player.referredBy = referrerId;
    state.player.referredByName = referrerData.name || "Unknown";
    Store.save(true);
    try {
      await d.collection("saves").doc(id).set({
        player: { referredBy: referrerId, referredByName: referrerData.name || "Unknown" },
        referredBy: referrerId
      }, { merge: true });
    } catch (e) {
      console.warn("[Referrals] Cloud save error:", e);
    }

    const input = document.getElementById("referral-code-input");
    if (input) {
      input.value = "";
      input.disabled = true;
      const btn = document.querySelector(".referral-apply-btn");
      if (btn) {
        btn.textContent = "Applied";
        btn.disabled = true;
      }
    }

    toast("🎉 Thanks for joining — your referral bonus has been claimed!", 4000);
    return true;
  }

  // ======================== CLAIM REFERRAL BONUSES ========================
  // Called by the RECIPIENT (referrer) on load to claim pending bonuses via server
  async function claimReferralBonuses() {
    const id = myId();
    if (!id) return;

    if (typeof ServerAntiCheat !== "undefined" && ServerAntiCheat.isReady()) {
      try {
        const result = await ServerAntiCheat.claimReferralBonuses();
        if (result && result.claimed && result.totalClaimed > 0) {
          const state = Store.get();
          if (state) {
            state.eb = Number(result.nextEb) || (Number(state.eb) || 0) + result.totalClaimed;
            Store.save(true);
            if (typeof updateTopbar === "function") updateTopbar();
          }
          toast(`🎁 Claimed ${result.totalClaimed} EB referral bonus${result.totalClaimed > 1 ? 'es' : ''}!`, 4000);
        }
      } catch (e) {
        console.warn("[Referrals] Claim bonuses error:", e);
      }
    }
  }

  // ======================== RENDER REFERRALS TAB ========================
  async function renderReferralsTab() {
    const id = myId();
    const d = db();
    if (!id || !d) return;

    const panel = document.querySelector('[data-pi-panel="referrals"]');
    if (!panel) return;

    const state = Store.get();
    let myCode = state.player?.referralCode;
    const referredByName = state.player?.referredByName;

    // Generate code if missing + save to Firestore
    if (!myCode) {
      myCode = generateCode(state.player?.name || "traveler");
      state.player.referralCode = myCode;
      Store.save(true);
      try {
        await d.collection("players").doc(id).set({ referralCode: myCode }, { merge: true });
      } catch (e) {
        console.warn("[Referrals] Could not save code to Firestore:", e);
      }
    }

    // Count referrals (wrapped in try-catch for missing rules)
    let referrals = [];
    let totalBonusEarned = 0;
    try {
      const snap = await d.collection("referrals")
        .where("referrerId", "==", id)
        .get();
      referrals = snap.docs.map(doc => doc.data());
      totalBonusEarned = referrals.reduce((sum, r) => sum + (r.bonusGiven || 0), 0);
    } catch (e) {
      console.warn("[Referrals] Could not fetch referrals:", e);
    }
    const totalReferrals = referrals.length;

    let codeHtml = `
      <div class="referral-code-card">
        <div class="referral-code-label">Your Referral Code</div>
        <div class="referral-code-value" id="referral-code-display">${myCode}</div>
        <button class="btn btn-primary referral-copy-btn" onclick="Referrals.copyCode('${myCode}')">📋 Copy Code</button>
      </div>`;

    let referredSection = "";
    if (referredByName) {
      referredSection = `
        <div class="referred-by-card">
          <span class="referred-by-icon">🔗</span>
          <span>Referred by <strong>${referredByName}</strong></span>
        </div>`;
    }

    // Referral input (if not yet referred)
    let inputHtml = "";
    if (!state.player?.referredBy) {
      inputHtml = `
        <div class="referral-input-card">
          <div class="referral-input-title">Have a referral code?</div>
          <div class="referral-input-row">
            <input type="text" id="referral-code-input" class="referral-input" placeholder="Enter code..." maxlength="12" autocomplete="off" />
            <button class="btn btn-primary referral-apply-btn" onclick="Referrals.applyFromInput()">Apply</button>
          </div>
        </div>`;
    }

    let pendingBonus = 0;
    let bonusRows = [];
    try {
      const bonusSnap = await d.collection("referral_bonuses")
        .where("toId", "==", id)
        .get();
      const bonusDocs = bonusSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      pendingBonus = bonusDocs.filter(doc => !doc.claimed).reduce((sum, doc) => sum + (Number(doc.amount) || 0), 0);
      bonusRows = bonusDocs;
    } catch (e) {
      console.warn("[Referrals] Could not fetch referral bonuses:", e);
    }

    // Fetch royalty stats from cloud
    let royaltyTotal = 0;
    try {
      if (typeof ServerAntiCheat !== "undefined" && ServerAntiCheat.isReady()) {
        const royaltyResult = await ServerAntiCheat.claimReferralRoyalties();
        royaltyTotal = Number(royaltyResult?.totalRoyalty) || 0;
      }
    } catch (e) {}

    let statsHtml = "";
    if (totalReferrals > 0 || bonusRows.length > 0 || royaltyTotal > 0) {
      statsHtml = `
        <div class="referral-stats-card">
          <div class="referral-stat">
            <span class="referral-stat-val">${totalReferrals}</span>
            <span class="referral-stat-label">Referrals</span>
          </div>
          <div class="referral-stat">
            <span class="referral-stat-val">${totalBonusEarned} <span class="eb-coin-icon"></span></span>
            <span class="referral-stat-label">Bonus Earned</span>
          </div>
          <div class="referral-stat">
            <span class="referral-stat-val">${pendingBonus} <span class="eb-coin-icon"></span></span>
            <span class="referral-stat-label">Pending</span>
          </div>
          <div class="referral-stat referral-stat-royalty">
            <span class="referral-stat-val">${Math.floor(royaltyTotal)} <span class="eb-coin-icon"></span></span>
            <span class="referral-stat-label">Royalties</span>
          </div>
        </div>`;

      if (referrals.length > 0) {
        statsHtml += `<div class="referral-section-title">👥 Players You Referred</div>`;
        referrals.forEach(r => {
          const av = r.referredAvatar && r.referredAvatar.startsWith("img:")
            ? `<img src="${r.referredAvatar.slice(4)}">` : `<span>${r.referredAvatar || "🙂"}</span>`;
          statsHtml += `
            <div class="friend-row">
              <div class="friend-avatar">${av}</div>
              <div class="friend-info">
                <span class="friend-name">${escapeHtml(r.referredName)}</span>
                <span class="friend-status">+${r.bonusGiven} EB bonus</span>
              </div>
            </div>`;
        });
      }

      if (bonusRows.length > 0) {
        statsHtml += `<div class="referral-section-title">🎁 Pending Bonuses</div>`;
        bonusRows.forEach(b => {
          const status = b.claimed ? "Claimed" : "Ready";
          statsHtml += `
            <div class="friend-row">
              <div class="friend-avatar"><span>${b.fromName ? b.fromName.charAt(0).toUpperCase() : "R"}</span></div>
              <div class="friend-info">
                <span class="friend-name">${escapeHtml(b.fromName || "Referral")}</span>
                <span class="friend-status">+${Number(b.amount || 0)} EB • ${status}</span>
              </div>
            </div>`;
        });
      }
    }

    panel.innerHTML = `
      <div class="referrals-placeholder">
        <div class="referrals-placeholder-icon">🎁</div>
        <h3>Referral Program</h3>
        <p>Share your code. Earn +${REFERRAL_BONUS_EB} EB per referral + 1% of every land plot they buy!</p>
      </div>
      ${codeHtml}
      ${referredSection}
      ${inputHtml}
      ${statsHtml}
    `;
  }

  function copyCode(code) {
    navigator.clipboard.writeText(code).then(() => {
      toast("📋 Referral code copied!", 2500);
    }).catch(() => {
      toast("⚠️ Could not copy. Code: " + code, 4000);
    });
  }

  function applyFromInput() {
    const input = document.getElementById("referral-code-input");
    if (input && input.value.trim()) {
      applyReferral(input.value.trim());
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  return {
    applyReferral,
    claimReferralBonuses,
    renderReferralsTab,
    copyCode,
    applyFromInput,
    generateCode,
    REFERRAL_BONUS_EB
  };
})();
