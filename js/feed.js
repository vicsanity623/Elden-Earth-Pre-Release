// ============================================================
// Elden Earth — Live Activity Feed (Permanent, Scrollable, 50-Event Log)
// ============================================================
const Feed = (() => {
  let feedCard = null;
  let feedList = null;
  let toggleBtn = null;
  let unreadBadge = null;
  let isCollapsed = false;
  let unreadCount = 0;
  const MAX_EVENTS = 50;
  const events = [];

  // Universal ISO 3166-1 country code to flag emoji
  function getFlagEmoji(countryCode) {
    if (!countryCode || countryCode.length !== 2) return "🌐";
    const codePoints = countryCode
      .toUpperCase()
      .split("")
      .map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  }

  let cachedCityName = null;
  async function resolveCity(lat, lon) {
    if (cachedCityName) return cachedCityName;
    if (!lat || !lon) return "the Realm 🌐";

    const US_STATES = {
      "Alabama":"AL","Alaska":"AK","Arizona":"AZ","Arkansas":"AR","California":"CA","Colorado":"CO",
      "Connecticut":"CT","Delaware":"DE","Florida":"FL","Georgia":"GA","Hawaii":"HI","Idaho":"ID",
      "Illinois":"IL","Indiana":"IN","Iowa":"IA","Kansas":"KS","Kentucky":"KY","Louisiana":"LA",
      "Maine":"ME","Maryland":"MD","Massachusetts":"MA","Michigan":"MI","Minnesota":"MN",
      "Mississippi":"MS","Missouri":"MO","Montana":"MT","Nebraska":"NE","Nevada":"NV",
      "New Hampshire":"NH","New Jersey":"NJ","New Mexico":"NM","New York":"NY","North Carolina":"NC",
      "North Dakota":"ND","Ohio":"OH","Oklahoma":"OK","Oregon":"OR","Pennsylvania":"PA",
      "Rhode Island":"RI","South Carolina":"SC","South Dakota":"SD","Tennessee":"TN","Texas":"TX",
      "Utah":"UT","Vermont":"VT","Virginia":"VA","Washington":"WA","West Virginia":"WV",
      "Wisconsin":"WI","Wyoming":"WY","District of Columbia":"DC"
    };

    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`, {
        headers: { "User-Agent": "EldenEarth/1.0 (vicsanity623.github.io)" }
      });
      const data = await res.json();
      const addr = data.address || {};
      const city = addr.city || addr.town || addr.municipality || addr.village || "";
      const rawState = addr.state || "";
      const stateCode = US_STATES[rawState] || (rawState.length === 2 ? rawState.toUpperCase() : "");
      const stateStr = stateCode ? `, ${stateCode}` : "";
      const flag = getFlagEmoji(addr.country_code);

      cachedCityName = `${city}${stateStr} ${flag}`;
      return cachedCityName;
    } catch (e) {
      return "the Realm 🌐";
    }
  }

  // Format relative time (e.g., "Just now", "2m ago")
  function formatTime(timestamp) {
    const diffSec = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSec < 45) return "Just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  }

  let renderScheduled = false;

  // ---- Feed Message Sanitization ---------------------------------------
  // Feed messages are HTML strings persisted in Firestore and rendered by
  // every client, so they are attacker-influenced (player names, territory
  // labels, Elden Stop names). Only a tiny set of presentational tags is
  // ever produced by broadcast(), so everything else is unwrapped/removed
  // before the message touches innerHTML.
  const ALLOWED_TAGS = new Set(["STRONG", "B", "EM", "I", "U", "SMALL", "BR", "SPAN"]);
  // These carry no user-visible text worth keeping (script/style payloads,
  // replaced/embedded resources) — drop the element AND its contents.
  const DROP_CONTENT_TAGS = new Set([
    "SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "TEMPLATE", "NOSCRIPT",
    "LINK", "META", "BASE", "SVG", "MATH", "CANVAS", "PICTURE", "MAP", "AREA",
    "VIDEO", "AUDIO", "SOURCE", "TRACK", "APPLET", "FORM", "INPUT", "BUTTON",
    "SELECT", "TEXTAREA", "OPTION", "FRAME", "FRAMESET"
  ]);

  function sanitizeNode(parent) {
    const children = Array.from(parent.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.COMMENT_NODE) {
        child.remove();
        continue;
      }
      if (child.nodeType === Node.TEXT_NODE) continue;
      if (child.nodeType !== Node.ELEMENT_NODE) {
        child.remove();
        continue;
      }
      if (DROP_CONTENT_TAGS.has(child.tagName)) {
        child.remove();
        continue;
      }
      if (!ALLOWED_TAGS.has(child.tagName)) {
        // Unwrap the disallowed element (drop the tag, keep readable text)
        // and re-run over this level so the promoted children are inspected.
        while (child.firstChild) parent.insertBefore(child.firstChild, child);
        child.remove();
        sanitizeNode(parent);
        return;
      }
      // Presentational tags keep no attributes in our own templates —
      // strip everything (class/style/on* handlers) defensively.
      for (const attr of Array.from(child.attributes)) child.removeAttribute(attr.name);
      sanitizeNode(child);
    }
  }

  function sanitizeHtml(html) {
    if (!html) return "";
    const tpl = document.createElement("template");
    tpl.innerHTML = String(html);
    sanitizeNode(tpl.content);
    return tpl.innerHTML;
  }

  // Escape a dynamic value before it is embedded in a message template.
  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // High-Performance Batched DOM Renderer (Zero Reflow Stutter)
  function renderFeedList() {
    // Battery Saver: Don't spend CPU building DOM elements if phone is in pocket!
    if (!feedList || document.hidden) return;

    if (events.length === 0) {
      feedList.innerHTML = `<div class="feed-empty-msg">No activity yet. Claim a plot to begin!</div>`;
      return;
    }

    // Build off-screen with DocumentFragment (1 single browser paint)
    const fragment = document.createDocumentFragment();

    events.forEach((ev) => {
      const row = document.createElement("div");
      row.className = "feed-item";
      row.innerHTML = `
        <div class="feed-item-content">${sanitizeHtml(ev.message)}</div>
        <div class="feed-item-time">${escapeHtml(formatTime(ev.timestamp))}</div>
      `;
      fragment.appendChild(row);
    });

    feedList.innerHTML = "";
    feedList.appendChild(fragment);
  }

  function scheduleRender() {
    if (renderScheduled || document.hidden) return;
    renderScheduled = true;
    requestAnimationFrame(() => {
      renderFeedList();
      renderScheduled = false;
    });
  }

  function addEventLocally(ev) {
    if (!ev || !ev.message || !ev.message.trim()) return;

    const isDuplicate = events.some(e => 
      e.id === ev.id || 
      (e.message === ev.message && Math.abs(e.timestamp - ev.timestamp) < 8000)
    );
    if (isDuplicate) return;

    events.push(ev);
    events.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    if (events.length > MAX_EVENTS) {
      events.length = MAX_EVENTS;
    }

    if (isCollapsed) {
      unreadCount++;
      updateBadge();
    }

    // Batch renders together smoothly
    scheduleRender();
  }

  function updateBadge() {
    if (!unreadBadge) return;
    if (unreadCount > 0 && isCollapsed) {
      unreadBadge.textContent = unreadCount > 9 ? "9+" : unreadCount;
      unreadBadge.classList.remove("hidden");
    } else {
      unreadBadge.classList.add("hidden");
    }
  }

  function toggleCollapse() {
    isCollapsed = !isCollapsed;
    if (isCollapsed) {
      feedCard.classList.add("collapsed");
      if (toggleBtn) toggleBtn.textContent = "▾";
    } else {
      feedCard.classList.remove("collapsed");
      if (toggleBtn) toggleBtn.textContent = "▴";
      unreadCount = 0;
      updateBadge();
    }
  }

  // Push an event to Firebase Firestore
  async function broadcast(type, details = {}) {
    const db = Store.getDb();
    const state = Store.get();
    const playerName = state?.player?.name || "Traveler";

    let message = "";
    if (type === "land") {
      const location = details.location || "the Realm 🌐";
      const rarityLabel = details.rarity || "land";
      message = `<strong>${escapeHtml(playerName)}</strong> claimed a ${escapeHtml(rarityLabel)} plot in <em>${escapeHtml(location)}</em>`;
    } else if (type === "citadel_evolve") {
      const creator = details.creatorName || playerName;
      const tier = details.tierName || "Legendary Hold";
      const location = details.location || "the Realm 🌐";
      message = `✨ <strong>${escapeHtml(creator)}</strong> ascended their Hold to a <strong>${escapeHtml(tier)}</strong> in <em>${escapeHtml(location)}</em>!`;
    } else if (type === "jackpot") {
      const amount = details.amount || 25;
      message = `🎉 <strong>${escapeHtml(playerName)}</strong> hit the <strong>${escapeHtml(amount)} EB</strong> Jackpot on the Wheel!`;
    } else if (type === "diamond_jackpot") {
      const amount = details.amount || 12;
      message = `💎 <strong>${escapeHtml(playerName)}</strong> hit the <strong>+${escapeHtml(amount)} Diamond Jackpot</strong> on the Wheel! 🚀`;
    } else if (type === "daily") {
      const day = details.day || 1;
      message = `📅 <strong>${escapeHtml(playerName)}</strong> has logged in for <strong>${escapeHtml(day)} day${day > 1 ? "s" : ""} in a row!</strong> Welcome back! 🔥`;
    } else if (type === "elden_stop_planted") {
      const name = details.name || "a public landmark";
      message = `🗼 <strong>${escapeHtml(playerName)}</strong> planted a new <em>Elden Stop</em> Dyson Beacon at ${escapeHtml(name)}!`;
    } else if (type === "elden_stop_lucky") {
      const rarityLabel = details.rarityLabel || (details.rarity ? String(details.rarity).toUpperCase() : "LUCKY");
      message = `🍀 <strong>${escapeHtml(playerName)}</strong> discovered a <strong>${escapeHtml(rarityLabel)} Lucky Land Plot</strong> spinning an Elden Stop!`;
    } else if (type === "dividend") {
      const ruler = details.rulerName || details.mayorName || "The Ruler";
      const territory = details.territory || details.city || "the Realm";
      const amount = details.amount || 2;
      const titleBadge = details.titleBadge || "Royalty";
      const titleIcon = details.titleIcon || "👑";

      message = `${escapeHtml(titleIcon)} <strong>${escapeHtml(ruler)}</strong> (<em>${escapeHtml(titleBadge)}</em>) collected <strong>+${escapeHtml(amount)} EB</strong> royalty from land in <em>${escapeHtml(territory)}</em>!`;
    }

    const now = Date.now();
    const localEv = {
      id: "ev_" + now + "_" + Math.random().toString(36).slice(2, 6),
      message,
      type,
      timestamp: now,
    };

    // Instant local preview
    addEventLocally(localEv);

    if (!db) return;

    try {
      await db.collection("feed").add({
        message,
        type,
        timestamp: now,
      });
    } catch (err) {
      console.warn("[Feed] Broadcast error:", err);
    }
  }

  // Live Firestore listener (fetches last 50, then listens for new)
  function listen() {
    const db = Store.getDb();
    if (!db) return;

    try {
      db.collection("feed")
        .orderBy("timestamp", "desc")
        .limit(MAX_EVENTS)
        .onSnapshot((snapshot) => {
          snapshot.docChanges().forEach((change) => {
            const data = change.doc.data();
            const ev = {
              id: change.doc.id,
              message: data.message,
              type: data.type,
              timestamp: data.timestamp || Date.now(),
            };

            if (change.type === "added") {
              addEventLocally(ev);
            }
          });
        }, (err) => console.warn("[Feed] Listener warning:", err));
    } catch (e) {
      console.warn("[Feed] Setup error:", e);
    }
  }

  function init() {
    feedCard = document.getElementById("live-feed-card");
    feedList = document.getElementById("feed-scroll-container");
    toggleBtn = document.getElementById("feed-toggle-icon");
    unreadBadge = document.getElementById("feed-unread-badge");

    const header = document.getElementById("feed-interactive-header");
    if (header) {
      header.addEventListener("click", toggleCollapse);
    }

    // Stop wheel / map gesture propagation when scrolling inside feed
    if (feedCard) {
      feedCard.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: true });
      feedCard.addEventListener("touchmove", (e) => e.stopPropagation(), { passive: true });
      feedCard.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });
    }

    // Add initial welcoming realm broadcast so the box is never blank
    addEventLocally({
      id: "welcome_ev",
      message: `✨ Welcome to <strong>Elden Earth</strong>. Walk the realm & claim the ground beneath your feet!`,
      type: "system",
      timestamp: Date.now()
    });

    // Auto-update timestamps when user unlocks their phone
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        renderFeedList();
      }
    });

    listen();
  }

  return { init, broadcast, resolveCity };
})();