# 🪙 Coin Clash

A real-time multiplayer browser game using Node.js, Express and Socket.IO.

## Rules

- 2 to 6 players can join the same URL.
- Move with WASD or arrow keys.
- Touch the gold coin to gain 1 point.
- Everyone sees the same live arena.
- Each round lasts 60 seconds.
- Highest score at the end of the round wins.
- A new round starts automatically.

## Run locally

```bash
npm install
npm start
```

Open http://localhost:3000.

To test two players on one computer, open two browser windows. For real devices, deploy the project to a host such as Render and share the HTTPS URL.

## Deploy on Render

1. Create a GitHub repository and upload these files.
2. In Render, create a new **Web Service** from the repository.
3. Build command: `npm install`
4. Start command: `npm start`
5. Choose a free/paid web service plan available to you.
6. Deploy.
7. Share the resulting `https://...onrender.com` URL.

No database is required. The game state lives in the Node.js server while the server is running.
