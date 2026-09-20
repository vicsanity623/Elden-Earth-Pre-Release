// ============================================================
// Elden Earth — 1% Weekly Realm Treasury Pool Distribution
// Distributes 1% of Global Lifetime Rent to Top 10 Every Monday 12:00 AM UTC
// ============================================================
const WeeklyPool = (() => {
  let modal = null;
  let rewardModal = null;
  let pendingRewardAmount = 0;

  // Calculates ISO Week ID: "2025-W36" (Ensures exactly 1 claim per week)
  function getISOWeekId(date = new Date()) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  }

  // Next Monday 00:00:00 UTC timestamp
  function getNextMondayUTCTimestamp() {
    const now = new Date();
    const result = new Date(now.getTime());
    result.setUTCHours(0, 0, 0, 0);
    const day = result.getUTCDay();
    const daysUntilMonday = (day === 0 ? 1 : 8 - day);
    result.setUTCDate(result.getUTCDate() + daysUntilMonday);
    return result.getTime();
  }

  // Calculate Total Global Lifetime Rent & Global $/Sec Across All Players
  async function calculateGlobalPool() {
    if (typeof Leaderboard === "undefined" || !Leaderboard.fetchRankings) {
      return { totalGlobalRent: 1.0, weeklyPool: 0.01, globalRateSec: 0, sortedTop10: [] };
    }

    const data = await Leaderboard.fetchRankings();
    const players = data?.players || [];

    let totalGlobalRent = 0;
    let globalRateSec = 0;

    // Fast Rarity Rate Lookup Table (nerfed by 1/4)
    const RATE_MAP = {
      common: 0.0000000004,
      rare: 0.000000000675,
      epic: 0.0000000011,
      legendary: 0.0000000022
    };
    // Calculate global lifetime rent AND global velocity
    // --- 14-Day (2-Week) Fiscal Period Reset Engine ---
    const now = Date.now();
    const TWO_WEEKS_MS = 14 * 24 * 3600 * 1000; // 14-Day Period
    const MAX_PERIOD_SEC = 14 * 86400;           // Hard cap: Cannot exceed 14 days!
    const PERIOD_ANCHOR_MS = 1704067200000;      // Monday, Jan 1, 2024 00:00:00 UTC (In the PAST)

    const periodElapsed = Math.abs((now - PERIOD_ANCHOR_MS) % TWO_WEEKS_MS);
    const periodStartTime = now - periodElapsed;

    // Calculate rent generated ONLY during this active 14-day fiscal period
    players.forEach(p => {
      if (p.plots) {
        for (const tid in p.plots) {
          const plot = p.plots[tid];
          const rKey = plot.rarity?.key || plot.rarity || "common";
          const rate = RATE_MAP[rKey] || 0.0000000011;

          // Safe timestamp check
          let plotClaimedTime = Number(plot.claimedAt) || periodStartTime;
          if (plotClaimedTime > 0 && plotClaimedTime < 1e11) plotClaimedTime *= 1000; // convert sec to ms
          
          const activeSince = Math.max(plotClaimedTime, periodStartTime);
          // Hard-cap at MAX_PERIOD_SEC so it can NEVER calculate years of rent
          const periodAgeSec = Math.min(MAX_PERIOD_SEC, Math.max(0, (now - activeSince) / 1000));

          totalGlobalRent += (periodAgeSec * rate);
          globalRateSec += rate;
        }
      } else if (p.plotsCount) {
        const fallbackRate = p.plotsCount * 0.0000000011;
        const periodSec = Math.min(MAX_PERIOD_SEC, Math.max(0, (now - periodStartTime) / 1000));
        totalGlobalRent += (periodSec * fallbackRate);
        globalRateSec += fallbackRate;
      }
    });

    const weeklyPool = totalGlobalRent * 0.01; // 1% of this period's rent!

    // Top 10 sorted by plots + lifetimeRent
    const sortedTop10 = [...players].sort((a, b) => {
      const pDiff = (b.plotsCount || 0) - (a.plotsCount || 0);
      if (pDiff !== 0) return pDiff;
      return (Number(b.lifetimeRent || b.cash) || 0) - (Number(a.lifetimeRent || a.cash) || 0);
    }).slice(0, 10);

    return { totalGlobalRent, weeklyPool, globalRateSec, sortedTop10 };
  }

  // Check if today is Monday & user is in Top 10 for claim
  async function checkMondayDistribution() {
    const now = new Date();
    const isMonday = now.getUTCDay() === 1; // 1 = Monday in UTC
    
    // STRICT GUARD: ONLY triggers on Mondays!
    if (!isMonday) return;

    const currentWeekId = getISOWeekId(now);
    const state = Store.get();
    if (!state || !state.player?.id) return;

    // Strict 1-Claim Per Week Lock
    if (state.lastWeeklyPoolClaim === currentWeekId) return;

    const { weeklyPool, sortedTop10 } = await calculateGlobalPool();
    const myRankIdx = sortedTop10.findIndex(p => p.id === state.player.id);

    // Only Top 10 Players qualify!
    if (myRankIdx >= 0 && myRankIdx < 10) {
      const myRank = myRankIdx + 1;
      let sharePct = 0.0714; // Default ~7.14% for 4th-10th

      if (myRank === 1) sharePct = 0.25;      // 1st gets 25%
      else if (myRank === 2) sharePct = 0.15; // 2nd gets 15%
      else if (myRank === 3) sharePct = 0.10; // 3rd gets 10%

      pendingRewardAmount = weeklyPool * sharePct;

      // Show Celebration Modal
      const rankBadgeEl = document.getElementById("reward-user-rank");
      const cashValEl = document.getElementById("reward-user-cash");
      const modalEl = document.getElementById("weekly-reward-modal");

      const rankIcon = myRank === 1 ? "🥇" : myRank === 2 ? "🥈" : myRank === 3 ? "🥉" : "🏅";
      if (rankBadgeEl) rankBadgeEl.textContent = `${rankIcon} Rank #${myRank} Global Landlord`;
      if (cashValEl) cashValEl.textContent = `+$${pendingRewardAmount.toFixed(6)}`;

      if (modalEl) modalEl.classList.remove("hidden");
    }
  }

  function claimWeeklyReward() {
    if (pendingRewardAmount <= 0) return;
    const state = Store.get();
    const currentWeekId = getISOWeekId();

    state.cash = (Number(state.cash) || 0) + pendingRewardAmount;
    state.lifetimeRent = (Number(state.lifetimeRent) || 0) + pendingRewardAmount;
    state.lastWeeklyPoolClaim = currentWeekId;
    Store.save(true);

    document.getElementById("weekly-reward-modal")?.classList.add("hidden");
    if (typeof showToast === "function") {
      showToast(`👑 Claimed +$${pendingRewardAmount.toFixed(6)} from the Weekly Dividend Pool!`, 4000);
    }
    pendingRewardAmount = 0;
  }

  let cachedHudCountdown = null;
  let cachedModalCountdown = null;
  let lastHudText = "";

  // Battery-Efficient Countdown Ticker (Zero Unnecessary DOM Updates)
  function updateCountdownTicker() {
    if (document.hidden) return; // 0% CPU in pocket

    const nextMondayMs = getNextMondayUTCTimestamp();
    const now = Date.now();
    const diffSec = Math.max(0, Math.floor((nextMondayMs - now) / 1000));

    const days = Math.floor(diffSec / 86400);
    const hrs = Math.floor((diffSec % 86400) / 3600);
    const mins = Math.floor((diffSec % 3600) / 60);
    const secs = diffSec % 60;

    // 1. Only update HUD text if the hour string actually changed
    const newHudText = `${days}D ${hrs}H`;
    if (newHudText !== lastHudText && cachedHudCountdown) {
      cachedHudCountdown.textContent = newHudText;
      lastHudText = newHudText;
    }

    // 2. ONLY update the second-by-second timers if the modal is currently OPEN!
    if (modal && !modal.classList.contains("hidden")) {
      if (cachedModalCountdown) {
        cachedModalCountdown.textContent = `${String(days).padStart(2, "0")}D : ${String(hrs).padStart(2, "0")}H : ${String(mins).padStart(2, "0")}M : ${String(secs).padStart(2, "0")}s`;
      }

      // 3. Real-Time 50X Super Boost Countdown (Delegated to Multiplier module)
      const timer50xEl = document.getElementById("modal-50x-countdown-timer");
      const label50xEl = document.getElementById("modal-50x-label");
      const card50xEl = document.querySelector(".event-50x-countdown-card");

      if (timer50xEl && label50xEl && typeof Multiplier !== "undefined") {
        const countdownData = Multiplier.get50XCountdownData();
        
        if (countdownData.isLive) {
          card50xEl?.classList.add("active-now");
        } else {
          card50xEl?.classList.remove("active-now");
        }

        label50xEl.textContent = countdownData.label;
        timer50xEl.textContent = countdownData.timerStr;
      }
    }
  }

  async function open() {
    if (!modal) modal = document.getElementById("weekly-pool-modal");
    if (modal) modal.classList.remove("hidden");

    updateCountdownTicker();
    const { totalGlobalRent, weeklyPool, globalRateSec } = await calculateGlobalPool();
    
    document.getElementById("modal-global-rent-val").textContent = `$${totalGlobalRent.toFixed(6)}`;
    document.getElementById("modal-weekly-pool-val").textContent = `$${weeklyPool.toFixed(6)}`;
    
    const rateEl = document.getElementById("modal-global-rate-val");
    if (rateEl) rateEl.textContent = `+$${globalRateSec.toFixed(10)} / sec`;
  }

  function init() {
    modal = document.getElementById("weekly-pool-modal");
    rewardModal = document.getElementById("weekly-reward-modal");
    cachedHudCountdown = document.getElementById("hud-pool-countdown");
    cachedModalCountdown = document.getElementById("modal-pool-countdown-timer");

    document.getElementById("weekly-pool-hud-btn")?.addEventListener("click", open);
    document.getElementById("claim-weekly-reward-btn")?.addEventListener("click", claimWeeklyReward);

    // Single 1-Second Ticker with Sleep Guard
    setInterval(updateCountdownTicker, 1000);
    updateCountdownTicker();

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        updateCountdownTicker();
      }
    });

    setTimeout(checkMondayDistribution, 2500);
  }

  return { init, open, calculateGlobalPool, checkMondayDistribution };
})();
