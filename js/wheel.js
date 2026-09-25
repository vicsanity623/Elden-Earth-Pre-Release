// ============================================================
// Elden Earth — spin wheel
// Draws the 10-slice wheel and animates it to a weighted
// randomly chosen slice.
// ============================================================
const Wheel = (() => {
  let canvas, ctx;
  let rotation = 0; // current resting rotation, degrees
  let currentMultiplier = 1;

  // 1. Create and preload the coin image
  const ebCoinImg = new Image();
  ebCoinImg.src = "assets/eb-coin.png"; // <-- double check if your filename is 'eb--coin.png' or 'eb-coin.png'
  
  // 2. Redraw the wheel automatically as soon as the image finishes downloading
  ebCoinImg.onload = () => {
    if (canvas && ctx) {
      draw();
    }
  };

  function draw() {
    const slices = CONFIG.WHEEL_SLICES;
    const n = slices.length;
    const sliceAngle = (2 * Math.PI) / n;
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const radius = Math.min(cx, cy) - 6;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Helper to render mini 3D faceted crystal onto canvas (Crimson Ruby)
    function renderCanvas3DGem(x, y, size) {
      ctx.save();
      ctx.translate(x, y);
      const w = size / 2, h = size;

      // Subtle crimson aura
      ctx.shadowColor = "rgba(255, 0, 40, 0.75)";
      ctx.shadowBlur = 6;

      // Top facet (Brighter red highlight)
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.45);
      ctx.lineTo(w, -h * 0.15);
      ctx.lineTo(0, 0);
      ctx.lineTo(-w, -h * 0.15);
      ctx.closePath();
      ctx.fillStyle = "#ff6b81";
      ctx.fill();

      // Left shadow facet (Deep ruby dark tone)
      ctx.beginPath();
      ctx.moveTo(-w, -h * 0.15);
      ctx.lineTo(0, 0);
      ctx.lineTo(0, h * 0.5);
      ctx.closePath();
      ctx.fillStyle = "#8b0000";
      ctx.fill();

      // Right bright facet (Vibrant crimson)
      ctx.beginPath();
      ctx.moveTo(w, -h * 0.15);
      ctx.lineTo(0, 0);
      ctx.lineTo(0, h * 0.5);
      ctx.closePath();
      ctx.fillStyle = "#ff1744";
      ctx.fill();

      // Turn off shadow for the specular glint
      ctx.shadowBlur = 0;

      // Specular glint (White crystal shine)
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.45);
      ctx.lineTo(w * 0.35, -h * 0.25);
      ctx.lineTo(0, 0);
      ctx.lineTo(-w * 0.35, -h * 0.25);
      ctx.closePath();
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.fill();

      ctx.restore();
    }

    for (let i = 0; i < n; i++) {
      const start = -Math.PI / 2 + i * sliceAngle;
      const end = start + sliceAngle;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = slices[i].color;
      ctx.fill();
      ctx.strokeStyle = "rgba(13,20,32,0.9)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label & 3D Icon Rendering
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(start + sliceAngle / 2);
      ctx.fillStyle = "#0d1420";
      ctx.font = "bold 15px Manrope, sans-serif";

      const displayAmount = slices[i].amount * currentMultiplier;

      if (slices[i].type === "diamond" || slices[i].type === "diamond_jackpot") {
        ctx.textAlign = "right";
        ctx.fillText("+" + displayAmount, radius - 26, 5);
        renderCanvas3DGem(radius - 14, 0, 18);
      } else {
        ctx.textAlign = "right";

        // Draw the coin if loaded, otherwise draw label as fallback
        if (ebCoinImg.complete && ebCoinImg.naturalWidth > 0) {
          // Draw the amount (e.g., "1", "2", "5", "50")
          ctx.fillText(displayAmount, radius - 28, 5);
          // Draw the coin image next to it
          ctx.drawImage(ebCoinImg, radius - 24, -9, 18, 18);
        } else {
          ctx.fillText(slices[i].label, radius - 14, 5);
        }
      }
      ctx.restore();
    }

    // hub
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.fillStyle = "#0d1420";
    ctx.fill();
    ctx.strokeStyle = "#d4af61";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function init() {
    canvas = document.getElementById("wheel-canvas");
    if (!canvas) return;
    ctx = canvas.getContext("2d", { alpha: true });
    
    // Promote Canvas to Dedicated GPU Hardware Texture
    canvas.style.transition = "none";
    canvas.style.transform = "rotate(0deg) translateZ(0)";
    canvas.style.willChange = "transform";
    
    draw();
  }

  // --- Cryptographically Secure Hardware Entropy Engine (CSPRNG) ---
  // Generates uniform floating point [0, 1) using 53 bits of kernel entropy
  function cryptoRandom() {
    if (window.crypto && window.crypto.getRandomValues) {
      const buf = new Uint32Array(2);
      window.crypto.getRandomValues(buf);
      const high = buf[0] >>> 5;
      const low = buf[1] >>> 6;
      return (high * 67108864 + low) / 9007199254740992;
    }
    return Math.random(); // Graceful fallback if unsupported
  }

  // Modulo-Bias-Free Rejection Sampling Integer Roll
  function cryptoRandomInt(max) {
    if (max <= 1) return 0;
    if (window.crypto && window.crypto.getRandomValues) {
      const array = new Uint32Array(1);
      const maxUint32 = 4294967296; // 2^32
      const limit = maxUint32 - (maxUint32 % max);
      let val;
      do {
        window.crypto.getRandomValues(array);
        val = array[0];
      } while (val >= limit); // Discards bias at the top of the integer range
      return val % max;
    }
    return Math.floor(Math.random() * max);
  }

  // Provably Fair Weighted Slice Selector (Zero Modulo Bias)
  function pickWeightedIndex() {
    const slices = CONFIG.WHEEL_SLICES;
    const totalWeight = slices.reduce((sum, s) => sum + (s.weight || 10), 0);
    
    // Cryptographic integer roll from 0 to totalWeight - 1
    let roll = cryptoRandomInt(totalWeight);

    for (let i = 0; i < slices.length; i++) {
      const w = slices[i].weight || 10;
      if (roll < w) return i;
      roll -= w;
    }
    return 0;
  }

let isCurrentlySpinning = false;
let spinTimeoutId = null;

// Spins to weighted slice with realistic landing animation & failsafe recovery
  function spin(callback, forcedSlice = null) {
    if (isCurrentlySpinning) return;
    isCurrentlySpinning = true;

    // Clear any leftover timeout from a previous aborted spin
    if (spinTimeoutId !== null) {
      clearTimeout(spinTimeoutId);
      spinTimeoutId = null;
    }

    const n = CONFIG.WHEEL_SLICES.length;
    const sliceDeg = 360 / n;
    const forcedIndex = forcedSlice
      ? CONFIG.WHEEL_SLICES.findIndex((slice) => slice.type === forcedSlice.type && slice.amount === forcedSlice.amount)
      : -1;
    const targetIndex = forcedIndex >= 0 ? forcedIndex : pickWeightedIndex();

    // Cryptographically randomized needle landing angle within slice
    const jitter = (cryptoRandom() - 0.5) * (sliceDeg * 0.75);
    const targetCenter = targetIndex * sliceDeg + sliceDeg / 2 + jitter;

    // Cryptographically randomized spin force (5 to 8 full rotations)
    const extraSpins = 5 + cryptoRandomInt(4);
    const neededRotation = (360 - targetCenter) % 360;

    // keep rotation monotonically increasing so it always spins "forward"
    const base = Math.ceil(rotation / 360) * 360;
    const finalRotation = base + extraSpins * 360 + neededRotation;

    // Silky Smooth 60fps Hardware-Accelerated Spin
    canvas.style.transition = "transform 4.2s cubic-bezier(0.16, 0.85, 0.2, 1)";
    canvas.style.transform = `rotate(${finalRotation}deg) translateZ(0)`;
    rotation = finalRotation;

    let finished = false;
    const finishSpin = () => {
      if (finished) return;
      finished = true;
      isCurrentlySpinning = false;
      canvas.removeEventListener("transitionend", finishSpin);
      if (spinTimeoutId !== null) clearTimeout(spinTimeoutId);
      spinTimeoutId = null;
      callback(CONFIG.WHEEL_SLICES[targetIndex]);
    };

    // Primary listener: CSS transition finishes
    canvas.addEventListener("transitionend", finishSpin, { once: true });

    // Failsafe backup timer: Resolves spin even if browser backgrounded or interrupted
    spinTimeoutId = setTimeout(finishSpin, 4300);
  }

  function resetSpinningState() {
    isCurrentlySpinning = false;
    if (spinTimeoutId !== null) {
      clearTimeout(spinTimeoutId);
      spinTimeoutId = null;
    }
  }

  function setMultiplier(mult) {
    currentMultiplier = mult;
  }

  function getMultiplier() {
    return currentMultiplier;
  }

  function redraw() {
    if (canvas && ctx) {
      draw();
    }
  }

  return { init, spin, resetSpinningState, setMultiplier, getMultiplier, redraw };
})();