const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const targetEl = document.getElementById("targetWord");

const leftBtn = document.getElementById("left");
const rightBtn = document.getElementById("right");
const startBtn = document.getElementById("start");

const W = canvas.width;
const H = canvas.height;

const bestKey = "spelling-racer-best";
let best = Number(localStorage.getItem(bestKey) || 0);
bestEl.textContent = String(best);

let running = false;
let lastTs = 0;

const road = { x: 40, w: 280, laneCount: 3 };

function laneCenter(laneIndex){
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

let moveDir = 0;
let dashOffset = 0;

let speed = 120;

let wordBank = [];
let currentTarget = "";
let currentOptions = [];
let optionCars = [];
let roundActive = false;

function clamp(v, min, max){
  return Math.max(min, Math.min(max, v));
}

function rectHit(a,b){
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function pickRandom(arr){
  return arr[Math.floor(Math.random() * arr.length)];
}

function mutateWord(word){
  if(word.length < 4) return word;
  const ops = [];

  const i = 1 + Math.floor(Math.random() * (word.length - 2));
  ops.push(word.slice(0,i) + word[i+1] + word[i] + word.slice(i+2));

  const j = 1 + Math.floor(Math.random() * (word.length - 2));
  ops.push(word.slice(0,j) + word[j] + word.slice(j+1));

  const k = 1 + Math.floor(Math.random() * (word.length - 2));
  ops.push(word.slice(0,k) + word[k+1] + word.slice(k+2));

  for(const m of ops){
    if(m !== word && m.length >= 3) return m;
  }
  return word;
}

function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random() * (i+1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function loadWords(){
  try{
    const res = await fetch("words.json", { cache: "no-store" });
    if(!res.ok) throw new Error("words.json not found");
    const data = await res.json();
    if(!data.words || !Array.isArray(data.words) || data.words.length < 5){
      throw new Error("words.json has invalid format");
    }
    wordBank = data.words.map(w => String(w).trim()).filter(Boolean);
  }catch(e){
    wordBank = [
      "accommodate","achievement","beginning","calendar","conscience",
      "definitely","embarrass","environment","favourite","government",
      "independent","necessary","occasionally","separate","tomorrow"
    ];
  }
}

function resetGame(){
  player.lane = 1;
  player.x = laneCenter(player.lane) - player.w / 2;

  score = 0;
  scoreEl.textContent = "0";

  speed = 150;
  dashOffset = 0;

  optionCars = [];
  roundActive = false;

  currentTarget = "";
  currentOptions = [];
  targetEl.textContent = "-";

  lastTs = 0;
  moveDir = 0;
}

function endGame(reason){
  running = false;

  best = Math.max(best, Math.floor(score));
  localStorage.setItem(bestKey, String(best));
  bestEl.textContent = String(best);

  draw();

  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0,0,W,H);

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = "bold 24px system-ui, Arial";
  ctx.fillText(reason || "Run Over", W/2, H/2 - 10);

  ctx.font = "16px system-ui, Arial";
  ctx.fillText("Press Start to play again", W/2, H/2 + 20);
}

function newRound(){
  if(wordBank.length < 3){
    endGame("No words loaded");
    return;
  }

  currentTarget = pickRandom(wordBank);

  const wrong1 = mutateWord(currentTarget);
  const wrong2 = mutateWord(currentTarget);

  let opts = [currentTarget, wrong1, wrong2];

  opts = opts.map(o => o.trim());
  opts = opts.filter(Boolean);

  while(new Set(opts).size < 3){
    opts[1] = mutateWord(currentTarget);
    opts[2] = mutateWord(currentTarget);
  }

  currentOptions = shuffle(opts);
  targetEl.textContent = currentTarget;

  optionCars = [];
  for(let lane=0; lane<road.laneCount; lane++){
    const w = 80;
    const h = 90;
    const x = laneCenter(lane) - w/2;
    const y = -120;
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

function startGame(){
  resetGame();
  running = true;
  startBtn.textContent = "Restart";
  if(!wordBank.length){
    loadWords().then(() => {
      newRound();
      requestAnimationFrame(loop);
    });
    return;
  }
  newRound();
  requestAnimationFrame(loop);
}

function handleInput(){
  if(moveDir === 0) return;

  const next = player.lane + moveDir;
  if(next >= 0 && next < road.laneCount){
    player.lane = next;
    player.x = laneCenter(player.lane) - player.w/2;
  }
  moveDir = 0;
}

function update(dt){
  handleInput();

  dashOffset += dt * speed * 0.4;

  if(!roundActive){
    newRound();
  }

  for(const c of optionCars){
    c.y += speed * dt;
  }

  const p = { x: player.x, y: player.y, w: player.w, h: player.h };

  for(const c of optionCars){
    if(rectHit(p, c)){
      if(c.isCorrect){
        score += 10;
        scoreEl.textContent = String(Math.floor(score));

        speed = Math.min(320, speed + 18);

        roundActive = false;
        optionCars = [];
        return;
      }else{
        endGame("Wrong Spelling");
        return;
      }
    }
  }

  const passed = optionCars.length && optionCars[0].y > H + 140;
  if(passed){
    endGame("Too Slow");
    return;
  }
}

function drawRoad(){
  ctx.fillStyle = "#0f1b33";
  ctx.fillRect(0,0,W,H);

  ctx.fillStyle = "#0b1220";
  ctx.fillRect(road.x, 0, road.w, H);

  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(road.x - 4, 0, 4, H);
  ctx.fillRect(road.x + road.w, 0, 4, H);

  const laneW = road.w / road.laneCount;
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  for(let i=1;i<road.laneCount;i++){
    const lx = road.x + laneW * i;
    const dashH = 26;
    const gap = 18;
    for(let y=-dashH; y<H+dashH; y += dashH + gap){
      const yy = y + (dashOffset % (dashH + gap));
      ctx.fillRect(lx - 2, yy, 4, dashH);
    }
  }
}

function drawPlayer(){
  ctx.fillStyle = "#7aa2ff";
  ctx.fillRect(player.x, player.y, player.w, player.h);
}

function drawOptionCars(){
  for(const c of optionCars){
    ctx.fillStyle = c.isCorrect ? "#2dd4bf" : "#ff6b6b";
    ctx.fillRect(c.x, c.y, c.w, c.h);

    ctx.fillStyle = "#0b1220";
    ctx.font = "12px system-ui, Arial";
    ctx.textAlign = "center";

    const text = c.text.length > 14 ? c.text.slice(0,14) + "…" : c.text;
    ctx.fillText(text, c.x + c.w/2, c.y + c.h/2);
  }
}

function draw(){
  drawRoad();
  drawPlayer();
  drawOptionCars();
}

function loop(ts){
  if(!running) return;
  if(!lastTs) lastTs = ts;

  const dt = Math.min(0.033, (ts - lastTs) / 1000);
  lastTs = ts;

  update(dt);
  if(running){
    draw();
    requestAnimationFrame(loop);
  }
}

function pressLeft(){ moveDir = -1; }
function pressRight(){ moveDir = 1; }

leftBtn.addEventListener("pointerdown", pressLeft);
rightBtn.addEventListener("pointerdown", pressRight);

document.addEventListener("keydown", (e) => {
  if(e.key === "ArrowLeft") moveDir = -1;
  if(e.key === "ArrowRight") moveDir = 1;
  if(e.key === "Enter" && !running) startGame();
});

startBtn.addEventListener("click", startGame);

player.x = laneCenter(player.lane) - player.w / 2;
draw();
loadWords();
