// game.js
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const targetEl = document.getElementById("targetWord");

const leftBtn = document.getElementById("left");
const rightBtn = document.getElementById("right");
const startBtn = document.getElementById("start");
const muteBtn = document.getElementById("mute");
const difficultySel = document.getElementById("difficulty");

// Basic checks
const required = [
  ["game", canvas],
  ["score", scoreEl],
  ["best", bestEl],
  ["targetWord", targetEl],
  ["left", leftBtn],
  ["right", rightBtn],
  ["start", startBtn],
  ["difficulty", difficultySel]
];
for (const [id, el] of required) {
  if (!el) throw new Error(`Missing element with id="${id}" in index.html`);
}

const W = canvas.width;
const H = canvas.height;

// Difficulty tuning
const SETTINGS = {
  easy:   { startSpeed: 135, maxSpeed: 250, speedStep: 6,  dashFactor: 0.35 },
  medium: { startSpeed: 150, maxSpeed: 320, speedStep: 8,  dashFactor: 0.40 },
  hard:   { startSpeed: 165, maxSpeed: 380, speedStep: 10, dashFactor: 0.45 },
  wordFont: 12,
  wordMaxLen: 16
};

// ---------- Sound ----------
const sound = {
  enabled: true,
  engine: new Audio("sounds/engine.mp3"),
  crash: new Audio("sounds/crash.mp3"),
  correct: new Audio("sounds/correct.mp3"),
  unlocked: false
};

sound.engine.loop = true;
sound.engine.volume = 0.25;
sound.crash.volume = 0.85;
sound.correct.volume = 0.65;

function unlockAudioOnce() {
  if (sound.unlocked) return;
  sound.unlocked = true;

  const tryPrime = async (a) => {
    try {
      a.currentTime = 0;
      await a.play();
      a.pause();
      a.currentTime = 0;
    } catch (_) {}
  };

  tryPrime(sound.engine);
  tryPrime(sound.crash);
  tryPrime(sound.correct);
}

async function playEngine() {
  if (!sound.enabled) return;
  try { await sound.engine.play(); } catch (_) {}
}

function stopEngine() {
  try { sound.engine.pause(); } catch (_) {}
}

async function playCrash() {
  if (!sound.enabled) return;
  try {
    sound.crash.currentTime = 0;
    await sound.crash.play();
  } catch (_) {}
}

async function playCorrect() {
  if (!sound.enabled) return;
  try {
    sound.correct.currentTime = 0;
    await sound.correct.play();
  } catch (_) {}
}

// Unlock audio on first user interaction
startBtn.addEventListener("pointerdown", unlockAudioOnce);
leftBtn.addEventListener("pointerdown", unlockAudioOnce);
rightBtn.addEventListener("pointerdown", unlockAudioOnce);
canvas.addEventListener("pointerdown", unlockAudioOnce);

// Mute toggle
if (muteBtn) {
  muteBtn.addEventListener("click", () => {
    sound.enabled = !sound.enabled;
    muteBtn.textContent = sound.enabled ? "Sound: On" : "Sound: Off";
    if (!sound.enabled) stopEngine();
    if (sound.enabled && running) playEngine();
  });
}

// ---------- Storage ----------
const bestKey = "spelling-racer-best";
let best = Number(localStorage.getItem(bestKey) || 0);
bestEl.textContent = String(best);

// ---------- Game state ----------
let running = false;
let lastTs = 0;

const road = { x: 40, w: 280, laneCount: 3 };

function laneCenter(laneIndex) {
  const laneW = road.w / road.laneCount;
  return road.x + laneW * laneIndex + laneW / 2;
}

const player = {
  w: 42,
  h: 76,
  lane: 1,
  x: 0,
  y: H - 110
};

let score = 0;
let speed = SETTINGS.medium.startSpeed;
let dashOffset = 0;
let moveDir = 0;

let currentDashFactor = SETTINGS.medium.dashFactor;
let currentMaxSpeed = SETTINGS.medium.maxSpeed;
let currentSpeedStep = SETTINGS.medium.speedStep;

let wordPools = { easy: [], medium: [], hard: [] };
let wordBank = [];

let currentTarget = "";
let optionCars = [];
let roundActive = false;

// ---------- Utils ----------
function rectHit(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function truncateWord(text) {
  const t = String(text || "");
  if (t.length <= SETTINGS.wordMaxLen) return t;
  return t.slice(0, SETTINGS.wordMaxLen - 1) + "…";
}

// Create realistic wrong spellings by small edits
function makeWrongVariant(word) {
  const w = String(word || "").trim();
  if (w.length < 4) return w;

  const variants = [];

  const i = 1 + Math.floor(Math.random() * (w.length - 2));
  variants.push(w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2));

  const d = 1 + Math.floor(Math.random() * (w.length - 2));
  variants.push(w.slice(0, d) + w.slice(d + 1));

  const u = 1 + Math.floor(Math.random() * (w.length - 2));
  variants.push(w.slice(0, u) + w[u] + w.slice(u));

  for (const v of variants) {
    if (v && v !== w) return v;
  }
  return w;
}

// ---------- Words ----------
async function loadWordPools() {
  try {
    const res = await fetch("words_levels.json", { cache: "no-store" });
    if (!res.ok) throw new Error("words_levels.json fetch failed");
    const data = await res.json();

    const safe = (x) =>
      Array.isArray(x)
        ? x.map((w) => String(w || "").trim()).filter((w) => w.length >= 3)
        : [];

    wordPools.easy = safe(data.easy);
    wordPools.medium = safe(data.medium);
    wordPools.hard = safe(data.hard);

    if (wordPools.easy.length + wordPools.medium.length + wordPools.hard.length < 50) {
      throw new Error("word pools too small");
    }
  } catch (e) {
    wordPools = {
      easy: ["tomorrow", "separate", "favourite", "government", "necessary"],
      medium: ["environment", "definitely", "embarrass", "calendar", "beginning"],
      hard: ["equatoguinean", "grandiloquent", "gravimetry"]
    };
  }
}

function applyDifficultyPool() {
  const chosen = difficultySel.value || "medium";
  const pool = wordPools[chosen] && wordPools[chosen].length ? wordPools[chosen] : wordPools.medium;
  wordBank = pool;

  const s = SETTINGS[chosen] || SETTINGS.medium;
  speed = s.startSpeed;
  currentDashFactor = s.dashFactor;
  currentMaxSpeed = s.maxSpeed;
  currentSpeedStep = s.speedStep;
}

// ---------- Game flow ----------
function resetGame() {
  player.lane = 1;
  player.x = laneCenter(player.lane) - player.w / 2;

  score = 0;
  scoreEl.textContent = "0";

  dashOffset = 0;
  moveDir = 0;

  currentTarget = "";
  optionCars = [];
  roundActive = false;

  targetEl.textContent = "-";
  lastTs = 0;
}

function startGame() {
  resetGame();
  applyDifficultyPool();

  running = true;
  startBtn.textContent = "Restart";

  playEngine();

  requestAnimationFrame(loop);
}

function endGame(reason) {
  running = false;

  stopEngine();
  playCrash();

  best = Math.max(best, Math.floor(score));
  localStorage.setItem(bestKey, String(best));
  bestEl.textContent = String(best);

  draw();

  ctx.fillStyle = "rgba(0,0,0,0.60)";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = "bold 24px system-ui, Arial";
  ctx.fillText(reason || "Game Over", W / 2, H / 2 - 20);

  ctx.font = "15px system-ui, Arial";
  if (currentTarget) {
    ctx.fillText("Correct spelling:", W / 2, H / 2 + 10);
    ctx.font = "bold 18px system-ui, Arial";
    ctx.fillText(currentTarget, W / 2, H / 2 + 35);
  }

  ctx.font = "15px system-ui, Arial";
  ctx.fillText("Press Start to play again", W / 2, H / 2 + 70);
}

function startRound() {
  if (!wordBank.length) {
    endGame("No words loaded");
    return;
  }

  currentTarget = pickRandom(wordBank);

  let w1 = makeWrongVariant(currentTarget);
  let w2 = makeWrongVariant(currentTarget);

  let guard = 0;
  while ((w1 === currentTarget || w2 === currentTarget || w1 === w2) && guard < 40) {
    if (w1 === currentTarget || w1 === w2) w1 = makeWrongVariant(currentTarget);
    if (w2 === currentTarget || w2 === w1) w2 = makeWrongVariant(currentTarget);
    guard++;
  }

  const options = shuffle([currentTarget, w1, w2]);
  targetEl.textContent = currentTarget;

  optionCars = [];
  for (let lane = 0; lane < road.laneCount; lane++) {
    const w = 92;
    const h = 92;
    optionCars.push({
      lane,
      x: laneCenter(lane) - w / 2,
      y: -140,
      w,
      h,
      text: options[lane],
      isCorrect: options[lane] === currentTarget
    });
  }

  roundActive = true;
}

// ---------- Input ----------
function applyMove() {
  if (moveDir === 0) return;

  const next = player.lane + moveDir;
  if (next >= 0 && next < road.laneCount) {
    player.lane = next;
    player.x = laneCenter(player.lane) - player.w / 2;
  }
  moveDir = 0;
}

function pressLeft() { moveDir = -1; }
function pressRight() { moveDir = 1; }

leftBtn.addEventListener("pointerdown", pressLeft);
rightBtn.addEventListener("pointerdown", pressRight);

document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") moveDir = -1;
  if (e.key === "ArrowRight") moveDir = 1;
  if (e.key === "Enter" && !running) startGame();
});

// Prevent changing difficulty mid-run
difficultySel.addEventListener("change", () => {
  if (running) {
    difficultySel.value = currentDifficultyLocked;
    return;
  }
  applyDifficultyPool();
});

let currentDifficultyLocked = difficultySel.value || "medium";

startBtn.addEventListener("click", () => {
  currentDifficultyLocked = difficultySel.value || "medium";
  startGame();
});

// Swipe on canvas for mobile
let swipeStartX = null;
canvas.addEventListener("touchstart", (e) => {
  swipeStartX = e.touches[0].clientX;
}, { passive: true });

canvas.addEventListener("touchend", (e) => {
  if (swipeStartX === null) return;
  const endX = e.changedTouches[0].clientX;
  const diff = endX - swipeStartX;

  if (diff > 40) moveDir = 1;
  if (diff < -40) moveDir = -1;

  swipeStartX = null;
}, { passive: true });

// ---------- Update ----------
function update(dt) {
  applyMove();

  dashOffset += dt * speed * currentDashFactor;

  if (!roundActive) startRound();

  for (const c of optionCars) c.y += speed * dt;

  const p = { x: player.x, y: player.y, w: player.w, h: player.h };

  for (const c of optionCars) {
    if (rectHit(p, c)) {
      if (c.isCorrect) {
        score += 10;
        scoreEl.textContent = String(Math.floor(score));

        playCorrect();
        speed = Math.min(currentMaxSpeed, speed + currentSpeedStep);

        roundActive = false;
        optionCars = [];
        return;
      }

      endGame("Wrong spelling");
      return;
    }
  }

  const passed = optionCars.length > 0 && optionCars[0].y > H + 160;
  if (passed) endGame("Too slow");
}

// ---------- Draw ----------
function drawRoad() {
  ctx.fillStyle = "#0f1b33";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#0b1220";
  ctx.fillRect(road.x, 0, road.w, H);

  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(road.x - 4, 0, 4, H);
  ctx.fillRect(road.x + road.w, 0, 4, H);

  const laneW = road.w / road.laneCount;
  ctx.fillStyle = "rgba(255,255,255,0.10)";

  for (let i = 1; i < road.laneCount; i++) {
    const lx = road.x + laneW * i;

    const dashH = 26;
    const gap = 18;
    const period = dashH + gap;

    for (let y = -dashH; y < H + dashH; y += period) {
      const yy = y + (dashOffset % period);
      ctx.fillRect(lx - 2, yy, 4, dashH);
    }
  }
}

function drawPlayer() {
  ctx.fillStyle = "#7aa2ff";
  ctx.fillRect(player.x, player.y, player.w, player.h);
}

function drawOptionCars() {
  for (const c of optionCars) {
    ctx.fillStyle = "#64748b";
    ctx.fillRect(c.x, c.y, c.w, c.h);

    ctx.fillStyle = "#0b1220";
    ctx.textAlign = "center";
    ctx.font = `${SETTINGS.wordFont}px system-ui, Arial`;
    ctx.fillText(truncateWord(c.text), c.x + c.w / 2, c.y + c.h / 2);
  }
}

function draw() {
  drawRoad();
  drawPlayer();
  drawOptionCars();
}

// ---------- Loop ----------
function loop(ts) {
  if (!running) return;
  if (!lastTs) lastTs = ts;

  const dt = Math.min(0.033, (ts - lastTs) / 1000);
  lastTs = ts;

  update(dt);

  if (running) {
    draw();
    requestAnimationFrame(loop);
  }
}

// Boot
player.x = laneCenter(player.lane) - player.w / 2;
draw();

loadWordPools().then(() => {
  applyDifficultyPool();
  difficultySel.addEventListener("change", () => {
    if (!running) applyDifficultyPool();
  });
});
