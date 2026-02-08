const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");

const leftBtn = document.getElementById("left");
const rightBtn = document.getElementById("right");
const startBtn = document.getElementById("start");

const W = canvas.width;
const H = canvas.height;

const bestKey = "lane-racer-best";
let best = Number(localStorage.getItem(bestKey) || 0);
bestEl.textContent = String(best);

let running = false;
let lastTs = 0;

const road = {
  x: 60,
  w: 240,
  laneCount: 3
};

function laneCenter(laneIndex){
  const laneW = road.w / road.laneCount;
  return road.x + laneW * laneIndex + laneW / 2;
}

const player = {
  w: 40,
  h: 70,
  lane: 1,
  x: 0,
  y: H - 90
};

let enemies = [];
let spawnTimer = 0;
let spawnEvery = 0.9;

let speed = 220;
let score = 0;
let difficultyTimer = 0;

let moveDir = 0;

function resetGame(){
  player.lane = 1;
  player.x = laneCenter(player.lane) - player.w / 2;

  enemies = [];
  spawnTimer = 0;
  spawnEvery = 0.9;

  speed = 220;
  score = 0;
  difficultyTimer = 0;

  scoreEl.textContent = "0";
  lastTs = 0;
  moveDir = 0;
}

function startGame(){
  resetGame();
  running = true;
  startBtn.textContent = "Restart";
  requestAnimationFrame(loop);
}

function endGame(){
  running = false;

  best = Math.max(best, Math.floor(score));
  localStorage.setItem(bestKey, String(best));
  bestEl.textContent = String(best);

  draw();

  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0,0,W,H);

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = "bold 26px system-ui, Arial";
  ctx.fillText("Crash", W/2, H/2 - 10);

  ctx.font = "16px system-ui, Arial";
  ctx.fillText("Press Start to race again", W/2, H/2 + 20);
}

function rectHit(a,b){
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function spawnEnemy(){
  const lane = Math.floor(Math.random() * road.laneCount);
  const w = 40;
  const h = 70;
  const x = laneCenter(lane) - w/2;
  const y = -h - 10;
  const v = speed * (0.9 + Math.random() * 0.35);
  enemies.push({ x, y, w, h, v, lane });
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

  spawnTimer += dt;
  while(spawnTimer >= spawnEvery){
    spawnTimer -= spawnEvery;
    spawnEnemy();
  }

  for(const e of enemies){
    e.y += e.v * dt;
  }
  enemies = enemies.filter(e => e.y < H + 120);

  const playerRect = { x: player.x, y: player.y, w: player.w, h: player.h };
  for(const e of enemies){
    if(rectHit(playerRect, e)){
      endGame();
      return;
    }
  }

  score += dt * (speed / 3);
  scoreEl.textContent = String(Math.floor(score));

  difficultyTimer += dt;
  if(difficultyTimer >= 5){
    difficultyTimer = 0;
    speed = Math.min(520, speed + 25);
    spawnEvery = Math.max(0.38, spawnEvery - 0.05);
  }
}

let dashOffset = 0;

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

function drawCars(){
  ctx.fillStyle = "#7aa2ff";
  ctx.fillRect(player.x, player.y, player.w, player.h);

  ctx.fillStyle = "#ff6b6b";
  for(const e of enemies){
    ctx.fillRect(e.x, e.y, e.w, e.h);
  }
}

function draw(){
  drawRoad();
  drawCars();
}

function loop(ts){
  if(!running) return;
  if(!lastTs) lastTs = ts;

  const dt = Math.min(0.033, (ts - lastTs) / 1000);
  lastTs = ts;

  dashOffset += dt * speed * 0.6;

  update(dt);
  if(running){
    draw();
    requestAnimationFrame(loop);
  }
}

function pressLeft(){ moveDir = -1; }
function pressRight(){ moveDir = 1; }
function stopMove(){}

leftBtn.addEventListener("pointerdown", pressLeft);
rightBtn.addEventListener("pointerdown", pressRight);
leftBtn.addEventListener("pointerup", stopMove);
rightBtn.addEventListener("pointerup", stopMove);
leftBtn.addEventListener("pointercancel", stopMove);
rightBtn.addEventListener("pointercancel", stopMove);

document.addEventListener("keydown", (e) => {
  if(e.key === "ArrowLeft") moveDir = -1;
  if(e.key === "ArrowRight") moveDir = 1;
  if(e.key === "Enter" && !running) startGame();
});

startBtn.addEventListener("click", startGame);

player.x = laneCenter(player.lane) - player.w / 2;
draw();
