let roundInterval = null;
let roundRunning = false;

const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

const WIDTH = 900;
const HEIGHT = 600;
const PLAYER_RADIUS = 18;
const COIN_RADIUS = 10;
const SPEED = 260;
const ROUND_SECONDS = 60;

const colors = ["#ff5c5c", "#4da6ff", "#ffd84d", "#8ee35f", "#c77dff", "#ff9f43"];
const players = new Map();
let coin = spawnCoin();
let roundEndsAt = Date.now() + ROUND_SECONDS * 1000;
let roundNumber = 1;

function spawnCoin() {
  return {
    x: 50 + Math.random() * (WIDTH - 100),
    y: 80 + Math.random() * (HEIGHT - 130)
  };
}

function makePlayer(id) {
  const index = players.size % colors.length;
  return {
    id,
    x: 70 + Math.random() * (WIDTH - 140),
    y: 120 + Math.random() * (HEIGHT - 170),
    color: colors[index],
    score: 0,
    keys: {}
  };
}

function publicState() {
  return {
    width: WIDTH,
    height: HEIGHT,
    players: [...players.values()].map(p => ({
      id: p.id, x: p.x, y: p.y, color: p.color, score: p.score
    })),
    coin,
    roundEndsAt,
    roundNumber
  };
}

function resetRound() {
  players.forEach(p => {
    p.score = 0;
    p.x = 70 + Math.random() * (WIDTH - 140);
    p.y = 120 + Math.random() * (HEIGHT - 170);
    p.keys = {};
  });
  coin = spawnCoin();
  roundEndsAt = Date.now() + ROUND_SECONDS * 1000;
  roundNumber++;
}

io.on("connection", socket => {
  if (players.size >= 6) {
    socket.emit("full");
    socket.disconnect(true);
    return;
  }

  const player = makePlayer(socket.id);
  players.set(socket.id, player);

  socket.emit("welcome", { id: socket.id, roundSeconds: ROUND_SECONDS });
  io.emit("state", publicState());

  socket.on("input", keys => {
    const p = players.get(socket.id);
    if (!p) return;
    p.keys = {
      up: !!keys.up,
      down: !!keys.down,
      left: !!keys.left,
      right: !!keys.right
    };
  });

  socket.on("disconnect", () => {
    players.delete(socket.id);
    io.emit("state", publicState());
  });
});

function startRound() {
  roundRunning = true;
  roundEndsAt = Date.now() + ROUND_SECONDS * 1000;

  io.emit("roundStarted", { roundNumber });

  let last = Date.now();

  roundInterval = setInterval(() => {
    const now = Date.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    // End round at exactly 60 seconds
    if (now >= roundEndsAt) {
      endRound();
      return;
    }

    // Movement + coin logic
    for (const p of players.values()) {
      let dx = (p.keys.right ? 1 : 0) - (p.keys.left ? 1 : 0);
      let dy = (p.keys.down ? 1 : 0) - (p.keys.up ? 1 : 0);

      if (dx || dy) {
        const len = Math.hypot(dx, dy);
        dx /= len; dy /= len;
        p.x += dx * SPEED * dt;
        p.y += dy * SPEED * dt;
      }

      p.x = Math.max(PLAYER_RADIUS, Math.min(WIDTH - PLAYER_RADIUS, p.x));
      p.y = Math.max(PLAYER_RADIUS + 50, Math.min(HEIGHT - PLAYER_RADIUS, p.y));

      if (Math.hypot(p.x - coin.x, p.y - coin.y) < PLAYER_RADIUS + COIN_RADIUS) {
        p.score++;
        coin = spawnCoin();
      }
    }

    io.emit("state", publicState());
  }, 50);
}

function endRound() {
  roundRunning = false;

  if (roundInterval) {
    clearInterval(roundInterval);
    roundInterval = null;
  }

  io.emit("roundEnded", { roundNumber });

  // Reset players + coin
  players.forEach(p => {
    p.score = 0;
    p.x = 70 + Math.random() * (WIDTH - 140);
    p.y = 120 + Math.random() * (HEIGHT - 170);
    p.keys = {};
  });
  coin = spawnCoin();
  roundNumber++;

  // Start next round after 3 seconds
  setTimeout(() => {
    startRound();
  }, 3000);
}

startRound();

server.listen(PORT, () => {
  console.log(`Coin Clash running on port ${PORT}`);
});
