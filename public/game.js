const socket = io();

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoresDiv = document.getElementById("scores");
const overlay = document.getElementById("overlay");
const statusDiv = document.getElementById("status");

let myId = null;
let roundSeconds = 60;
let timeLeft = 60;

let state = {
  players: [],
  coin: null,
  roundNumber: 1
};

// ----------------------
// Socket Events
// ----------------------

socket.on("welcome", data => {
  myId = data.id;
  roundSeconds = data.roundSeconds;
  timeLeft = roundSeconds;
  statusDiv.textContent = "Connected";
});

socket.on("roundStarted", data => {
  timeLeft = roundSeconds;
  overlay.classList.remove("hidden");
  overlay.textContent = `Round ${data.roundNumber} Started!`;
  setTimeout(() => overlay.classList.add("hidden"), 1500);
});

socket.on("roundEnded", data => {
  overlay.classList.remove("hidden");
  overlay.textContent = `Round ${data.roundNumber} Ended!`;
  setTimeout(() => overlay.classList.add("hidden"), 2000);
});

socket.on("state", newState => {
  state = newState;
  updateScores();
});

// ----------------------
// Input Handling
// ----------------------

const keys = { up: false, down: false, left: false, right: false };

document.addEventListener("keydown", e => {
  if (e.key === "w" || e.key === "ArrowUp") keys.up = true;
  if (e.key === "s" || e.key === "ArrowDown") keys.down = true;
  if (e.key === "a" || e.key === "ArrowLeft") keys.left = true;
  if (e.key === "d" || e.key === "ArrowRight") keys.right = true;
  socket.emit("input", keys);
});

document.addEventListener("keyup", e => {
  if (e.key === "w" || e.key === "ArrowUp") keys.up = false;
  if (e.key === "s" || e.key === "ArrowDown") keys.down = false;
  if (e.key === "a" || e.key === "ArrowLeft") keys.left = false;
  if (e.key === "d" || e.key === "ArrowRight") keys.right = false;
  socket.emit("input", keys);
});

// ----------------------
// Scoreboard
// ----------------------

function updateScores() {
  scoresDiv.innerHTML = "";
  state.players
    .sort((a, b) => b.score - a.score)
    .forEach(p => {
      const div = document.createElement("div");
      div.textContent = `${p.id === myId ? "(You)" : p.id}: ${p.score}`;
      div.style.color = p.color;
      scoresDiv.appendChild(div);
    });
}

// ----------------------
// Rendering
// ----------------------

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw coin
  if (state.coin) {
    ctx.fillStyle = "gold";
    ctx.beginPath();
    ctx.arc(state.coin.x, state.coin.y, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw players
  for (const p of state.players) {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.font = "14px Arial";
    ctx.fillText(p.score, p.x - 5, p.y + 5);
  }

  // Draw timer
  ctx.fillStyle = "#fff";
  ctx.font = "24px Arial";
  ctx.fillText(`⏱ ${timeLeft}s`, 20, 40);

  requestAnimationFrame(draw);
}

draw();

// ----------------------
// Local Timer Countdown
// ----------------------

setInterval(() => {
  if (timeLeft > 0) timeLeft--;
}, 1000);
