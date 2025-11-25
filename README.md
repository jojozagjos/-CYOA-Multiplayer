# CYOA (Node.js + Socket.io)

This is a small multiplayer CYOA (Choose Your Own Adventure) story game designed to run on **Render** (or any Node.js host).

Players:

- Connect through a browser.
- Host or join a lobby.
- Vote on a theme (e.g. Dark Dungeon, Derelict Space Station).
- Create simple characters.
- Take turns describing actions or proposing group actions.
- The server:
  - Rolls dice for outcomes.
  - Applies simple damage / death rules.
  - Generates simple narrative text based on the chosen theme.

There is **no external AI API**; instead, the narration is produced by a simple procedural generator in `gameLogic.js`. This avoids quotas, tokens, and external services.

## Running locally

```bash
npm install
npm start
```

Then open `http://localhost:3000` in your browser.

## Deploying on Render

1. Create a new **Web Service** on Render.
2. Connect your repository containing this project.
3. Set:
   - Build command: `npm install`
   - Start command: `npm start`
4. Use Node 18+ (defined in `package.json`).

Render will start the server on the port specified by `PORT` (handled in `server.js`).

## Save / Load

- The server exposes `POST /api/save/:lobbyId`, which writes a snapshot of the current campaign to `campaign_saves.json` on disk.
- The endpoint returns a `campaignId`.
- This is a simple file-based save mechanism and may not survive container restarts on some hosts. On Render, use it as a prototype.
- For a production-grade system, you would:
  - Replace file-based saves with a real database (Postgres, etc.).
  - Add an endpoint + UI for loading a saved campaign and reconstructing the lobby from that data.

## Important files

- `server.js` – Express + Socket.io server and REST endpoints.
- `gameLogic.js` – Game state, narration generator, dice, outcomes.
- `public/index.html` – Main UI page.
- `public/client.js` – Client-side logic using Socket.io.
- `public/styles.css` – Basic layout and styling.

You can extend this with:

- Authentication / user accounts.
- Persistent databases.
- More detailed character sheets and combat rules.
- Richer, more varied narration templates.
