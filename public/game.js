const socket = io();
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const scoresEl = document.getElementById("scores");
const overlay = document.getElementById("overlay");

let myId = null;
let state = null;
let keys = {};

socket.on("welcome", data => {
  myId = data.id;
  statusEl.textContent = "🟢 Connected";
});

socket.on("full", () => {
  statusEl.textContent = "Arena full";
  overlay.classList.remove("hidden");
  overlay.textContent = "This game is full. Try again later.";
});

socket.on("connect", () => statusEl.textContent = "🟢 Connected");
socket.on("disconnect", () => statusEl.textContent = "🔴 Disconnected");
socket.on("state", s => {
  state = s;
  renderScores();
});

const controlKeys = new Set(["w","a","s","d","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"]);
window.addEventListener("keydown", e => {
  if (controlKeys.has(e.key)) {
    e.preventDefault();
    keys[e.key] = true;
    sendInput();
  }
});
window.addEventListener("keyup", e => {
  if (controlKeys.has(e.key)) {
    e.preventDefault();
    keys[e.key] = false;
    sendInput();
  }
});
function sendInput() {
  socket.emit("input", {
    up: keys.w || keys.ArrowUp,
    down: keys.s || keys.ArrowDown,
    left: keys.a || keys.ArrowLeft,
    right: keys.d || keys.ArrowRight
  });
}

function renderScores() {
  if (!state) return;
  const remaining = Math.max(0, Math.ceil((state.roundEndsAt - Date.now()) / 1000));
  statusEl.textContent = `🟢 Live · Round ${state.roundNumber} · ${remaining}s`;
  const sorted = [...state.players].sort((a,b) => b.score - a.score);
  scoresEl.innerHTML = sorted.map((p, i) =>
    `<div class="score ${p.id === myId ? "me" : ""}">
      <span style="color:${p.color}">●</span>
      ${p.id === myId ? "<strong>You</strong>" : "Player " + (i+1)}
      <strong>${p.score}</strong>
    </div>`
  ).join("");
}

function drawArena() {
  ctx.clearRect(0,0,canvas.width,canvas.height);

  ctx.fillStyle = "#111722";
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // grid
  ctx.strokeStyle = "#1d2633";
  ctx.lineWidth = 1;
  for (let x=0;x<canvas.width;x+=45) {
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke();
  }
  for (let y=50;y<canvas.height;y+=45) {
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke();
  }

  if (!state) return;

  // top bar
  ctx.fillStyle = "#171e2a";
  ctx.fillRect(0,0,canvas.width,50);
  ctx.fillStyle = "#aeb8c8";
  ctx.font = "bold 18px system-ui";
  ctx.fillText("COLLECT THE COIN", 18, 32);

  // coin
  const c = state.coin;
  ctx.beginPath();
  ctx.arc(c.x,c.y,10,0,Math.PI*2);
  ctx.fillStyle = "#ffd84d";
  ctx.fill();
  ctx.strokeStyle = "#fff2a3";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "#7d5a00";
  ctx.font = "bold 11px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("$", c.x, c.y);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // players
  for (const p of state.players) {
    ctx.beginPath();
    ctx.arc(p.x,p.y,18,0,Math.PI*2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.lineWidth = p.id === myId ? 4 : 2;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();

    if (p.id === myId) {
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("YOU", p.x, p.y - 27);
      ctx.textAlign = "left";
    }
  }

  const remaining = Math.max(0, Math.ceil((state.roundEndsAt - Date.now()) / 1000));
  if (remaining === 0) {
    const winner = [...state.players].sort((a,b)=>b.score-a.score)[0];
    if (winner) {
      overlay.classList.remove("hidden");
      overlay.innerHTML = winner.id === myId
        ? "🏆 You won!<br><small>New round starting…</small>"
        : "🏆 Round over<br><small>New round starting…</small>";
      setTimeout(() => overlay.classList.add("hidden"), 1200);
    }
  } else {
    overlay.classList.add("hidden");
  }
}

function loop() {
  drawArena();
  requestAnimationFrame(loop);
}
loop();
