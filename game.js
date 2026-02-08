// Spelling Racer (Lane-based)
// Files expected in the same folder: index.html, style.css, game.js, words.json

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const targetEl = document.getElementById("targetWord");

const leftBtn = document.getElementById("left");
const rightBtn = document.getElementById("right");
const startBtn = document.getElementById("start");

// Safety checks
const required = [
  ["game", canvas],
  ["score", scoreEl],
  ["best", bestEl],
  ["targetWord", targetEl],
  ["left", leftBtn],
  ["right", rightBtn],
  ["start", startBtn]
];
for (const [id, el] of required) {
  if (!el) {
    throw new Error(`Missing element with id="${id}" in index.html`);
  }
}

const W = canvas.width;
const H = canvas.height;

// Difficulty tuning
const SETTINGS = {
  startSpeed: 150,          // slower base speed for reading
  maxSpeed: 320,            // cap speed to keep it readable
  speedStepOnCorrect: 8,    // gentle increase per correct pick
  dashFactor: 0.4,          // road movement multiplier
  wordFont: 12,             // option car text font size
  wordMaxLen: 16            // truncate long words on cars
};

const bestKey = "spelling-racer-best";
let best = Number(localStorage.getItem(bestKey) || 0);
bestEl.textContent = String(best);

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
let speed = SETTINGS.startSpeed;
let dashOffset = 0;
let moveDir = 0;

let wordBank = [];
let currentTarget = "";
let currentOptions = [];
let optionCars = [];
let roundActive = false;

// ---------- Utilities ----------
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

// Create realistic wrong spellings by small edits
function makeWrongVariant(word) {
  if (typeof word !== "string") return "";
  const w = word.trim();
  if (w.length < 4) return w;

  const variants = [];

  // swap adjacent letters
  const i = 1 + Math.floor(Math.random() * (w.length - 2));
  variants.push(w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2));

  // delete one letter
  const d = 1 + Math.floor(Math.random() * (w.length - 2));
  variants.push(w.slice(0, d) + w.slice(d + 1));

  // duplicate one letter
  const u = 1 + Math.floor(Math.random() * (w.length - 2));
  variants.push(w.slice(0, u) + w[u] + w.slice(u));

  // replace one letter with a nearby keyboard-ish letter (simple mapping)
  const map = {
    a: "s", e: "w", i: "o", o: "i", u: "y",
    s: "a", w: "e", y: "u",
    c: "x", x: "c",
    m: "n", n: "m",
    r: "t", t: "r",
    p: "o", l: "k", k: "l"
  };
  const r = 1 + Math.floor(Math.random() * (w.length - 2));
  const ch = w[r].toLowerCase();
  if (map[ch]) {
    const repl = w[r] === ch ? map[ch] : map[ch].toUpperCase();
    variants.push(w.slice(0, r) + repl + w.slice(r + 1));
  }

  for (const v of variants) {
    if (v && v !== w) return v;
  }
  return w;
}

function truncateWord(text) {
  const t = String(text || "");
  if (t.length <= SETTINGS.wordMaxLen) return t;
  return t.slice(0, SETTINGS.wordMaxLen - 1) + "…";
}

// ---------- Words loading ----------
async function loadWords() {
  try {
    const res = await fetch("words.json", { cache: "no-store" });
    if (!res.ok) throw new Error("words.json fetch failed");
    const data = await res.json();

    const words = Array.isArray(data.words) ? data.words : [];
    const cleaned = words
      .map((w) => String(w || "").trim())
      .filter((w) => w.length >= 3);

    if (cleaned.length < 10) throw new Error("words.json too small");

    wordBank = cleaned;
  } catch (e) {
    // fallback list
    wordBank = [
      "accommodate",
      "achievement",
      "beginning",
      "calendar",
      "conscience",
      "definitely",
      "embarrass",
      "environment",
      "favourite",
      "government",
      "independent",
      "necessary",
      "occasionally",
      "separate",
      "tomorrow"
    ];
  }
}

// ---------- Game flow ----------
function resetGame() {
  player.lane = 1;
  player.x = laneCenter(player.lane) - player.w / 2;

  score = 0;
  scoreEl.textContent = "0";

  speed = SETTINGS.startSpeed;
  dashOffset = 0;
  moveDir = 0;

  currentTarget = "";
  currentOptions = [];
  optionCars = [];
  roundActive = false;

  targetEl.textContent = "-";

  lastTs = 0;
}

function startGame() {
  resetGame();
  running = true;
  startBtn.textContent = "Restart";

  if (!wordBank.length) {
    loadWords().then(() => {
      startRound();
      requestAnimationFrame(loop);
    });
    return;
  }

  startRound();
  requestAnimationFrame(loop);
}

function endGame(reason) {
  running = false;

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
    ctx.font = "15px system-ui, Arial";
  }

  ctx.fillText("Press Start to play again", W / 2, H / 2 + 70);
}

function startRound() {
  if (!wordBank.length) {
    endGame("No words loaded");
    return;
  }

  currentTarget = pickRandom(wordBank);

  // build 2 distinct wrong options
  let w1 = makeWrongVariant(currentTarget);
  let w2 = makeWrongVariant(currentTarget);

  let guard = 0;
  while ((w1 === currentTarget || w2 === currentTarget || w1 === w2) && guard < 30) {
    if (w1 === currentTarget || w1 === w2) w1 = makeWrongVariant(currentTarget);
    if (w2 === currentTarget || w2 === w1) w2 = makeWrongVariant(currentTarget);
    guard++;
  }

  currentOptions = shuffle([currentTarget, w1, w2]);
  targetEl.textContent = currentTarget;

  optionCars = [];
  for (let lane = 0; lane < road.laneCount; lane++) {
    const w = 92;
    const h = 92;
    const x = laneCenter(lane) - w / 2;
    const y = -140;

    optionCars.push({
      lane,
      x,
      y,
      w,
      h,
      text: currentOptions[lane],
      isCorrect: currentOptions[lane] === currentTarget
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

function pressLeft() {
  moveDir = -1;
}

function pressRight() {
  moveDir = 1;
}

leftBtn.addEventListener("pointerdown", pressLeft);
rightBtn.addEventListener("pointerdown", pressRight);

document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") moveDir = -1;
  if (e.key === "ArrowRight") moveDir = 1;
  if (e.key === "Enter" && !running) startGame();
});

startBtn.addEventListener("click", startGame);

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

  dashOffset += dt * speed * SETTINGS.dashFactor;

  if (!roundActive) {
    startRound();
  }

  for (const c of optionCars) {
    c.y += speed * dt;
  }

  const p = { x: player.x, y: player.y, w: player.w, h: player.h };

  for (const c of optionCars) {
    if (rectHit(p, c)) {
      if (c.isCorrect) {
        score += 10;
        scoreEl.textContent = String(Math.floor(score));

        speed = Math.min(SETTINGS.maxSpeed, speed + SETTINGS.speedStepOnCorrect);

        roundActive = false;
        optionCars = [];
        return;
      }

      endGame("Wrong spelling");
      return;
    }
  }

  // If options pass the player without being chosen, end the run
  const passed = optionCars.length > 0 && optionCars[0].y > H + 160;
  if (passed) {
    endGame("Too slow");
  }
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
  // No colour hints. Every option car uses the same colour.
  for (const c of optionCars) {
    ctx.fillStyle = "#64748b";
    ctx.fillRect(c.x, c.y, c.w, c.h);

    ctx.fillStyle = "#0b1220";
    ctx.textAlign = "center";
    ctx.font = `${SETTINGS.wordFont}px system-ui, Arial`;

    ctx.fillText(
      truncateWord(c.text),
      c.x + c.w / 2,
      c.y + c.h / 2
    );
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
loadWords();
