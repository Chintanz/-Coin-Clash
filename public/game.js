const socket = io();
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const scoresEl = document.getElementById("scores");
const playerCountEl = document.getElementById("playerCount");
const overlay = document.getElementById("overlay");

let myId = null;
let state = null;
let keys = {
  up: false,
  down: false,
  left: false,
  right: false
};

socket.on("welcome", data => {
  myId = data.id;
  statusEl.textContent = "🟢 Connected";
});

socket.on("full", () => {
  statusEl.textContent = "Arena full";
  overlay.classList.remove("hidden");
  overlay.innerHTML = "This game is full.<br><small>Try again later.</small>";
});

socket.on("connect", () => {
  statusEl.textContent = "🟢 Connected";
});

socket.on("disconnect", () => {
  statusEl.textContent = "🔴 Disconnected";
});

socket.on("state", s => {
  state = s;
  renderScores();
});

const keyMap = {
  w: "up",
  ArrowUp: "up",
  s: "down",
  ArrowDown: "down",
  a: "left",
  ArrowLeft: "left",
  d: "right",
  ArrowRight: "right"
};

window.addEventListener("keydown", e => {
  const direction = keyMap[e.key];
  if (!direction) return;
  e.preventDefault();
  if (!keys[direction]) {
    keys[direction] = true;
    sendInput();
  }
});

window.addEventListener("keyup", e => {
  const direction = keyMap[e.key];
  if (!direction) return;
  e.preventDefault();
  if (keys[direction]) {
    keys[direction] = false;
    sendInput();
  }
});

window.addEventListener("blur", releaseAllControls);

function releaseAllControls() {
  let changed = false;
  for (const direction of Object.keys(keys)) {
    if (keys[direction]) {
      keys[direction] = false;
      changed = true;
    }
  }
  document.querySelectorAll(".control.active").forEach(btn => btn.classList.remove("active"));
  if (changed) sendInput();
}

function sendInput() {
  socket.emit("input", keys);
}

// Mobile / tablet touch controls.
// Pointer Events let this work with touchscreens and also mouse/pen input.
document.querySelectorAll(".control").forEach(button => {
  const direction = button.dataset.dir;

  const press = e => {
    e.preventDefault();
    button.setPointerCapture?.(e.pointerId);
    button.classList.add("active");
    keys[direction] = true;
    sendInput();
  };

  const release = e => {
    e.preventDefault();
    button.classList.remove("active");
    keys[direction] = false;
    sendInput();
  };

  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
});

// Prevent accidental page scrolling while using the game area.
document.getElementById("gameWrap").addEventListener("touchmove", e => {
  e.preventDefault();
}, { passive: false });

function renderScores() {
  if (!state) return;

  const remaining = Math.max(0, Math.ceil((state.roundEndsAt - Date.now()) / 1000));
  statusEl.textContent = `🟢 Live · Round ${state.roundNumber} · ${remaining}s`;
  playerCountEl.textContent = `${state.players.length}/6 players`;

  const sorted = [...state.players].sort((a, b) => b.score - a.score);

  scoresEl.innerHTML = sorted.map((p, i) =>
    `<div class="score ${p.id === myId ? "me" : ""}">
      <span style="color:${p.color}">●</span>
      <span>${p.id === myId ? "<strong>You</strong>" : "Player " + (i + 1)}</span>
      <strong class="score-value">${p.score}</strong>
    </div>`
  ).join("");
}

function drawArena() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#111722";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#1d2633";
  ctx.lineWidth = 1;

  for (let x = 0; x < canvas.width; x += 45) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  for (let y = 50; y < canvas.height; y += 45) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  if (!state) return;

  ctx.fillStyle = "#171e2a";
  ctx.fillRect(0, 0, canvas.width, 50);
  ctx.fillStyle = "#aeb8c8";
  ctx.font = "bold 18px system-ui";
  ctx.fillText("COLLECT THE COIN", 18, 32);

  const c = state.coin;
  ctx.beginPath();
  ctx.arc(c.x, c.y, 10, 0, Math.PI * 2);
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

  for (const p of state.players) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
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
    const winner = [...state.players].sort((a, b) => b.score - a.score)[0];

    if (winner) {
      overlay.classList.remove("hidden");
      overlay.innerHTML = winner.id === myId
        ? "🏆 You won!<br><small>New round starting…</small>"
        : "🏆 Round over<br><small>New round starting…</small>";
    }
  } else if (!overlay.textContent.includes("This game is full")) {
    overlay.classList.add("hidden");
  }
}

function loop() {
  drawArena();
  requestAnimationFrame(loop);
}

loop();
