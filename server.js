const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');
const {
  createLobbyState,
  joinLobbyState,
  registerThemeVote,
  tryFinalizeTheme,
  setCharacterForPlayer,
  startThemeVote,
  maybeStartGameIfReady,
  handlePlayerAction,
  handleGroupProposal,
  handleGroupVote,
  getPublicLobbyState,
  serializeCampaign,
  deserializeCampaign,
  startGameAfterCredits,
  ITEM_TYPES
} = require('./gameLogic');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*'
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

// In-memory lobby storage
const lobbies = new Map(); // lobbyId -> lobbyState

// In-memory campaign saves (host can save/load)
const campaignSaves = new Map(); // campaignId -> serialized campaign data

// Health check for Render
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// Socket.io handlers
io.on('connection', (socket) => {
  console.log('Client connected', socket.id);

  socket.on('createLobby', ({ playerName }, cb) => {
    const lobbyId = generateLobbyId();
    const lobbyState = createLobbyState(lobbyId);
    lobbies.set(lobbyId, lobbyState);

    const playerId = socket.id;
    joinLobbyState(lobbyState, playerId, playerName, true);
    socket.join(lobbyId);
    console.log(`Lobby ${lobbyId} created by ${playerName} (${playerId})`);

    if (cb) cb({ lobbyId, playerId, lobby: getPublicLobbyState(lobbyState, playerId) });
    io.to(lobbyId).emit('lobbyUpdate', getPublicLobbyState(lobbyState));
  });

  socket.on('joinLobby', ({ lobbyId, playerName }, cb) => {
    const id = (lobbyId || '').toUpperCase();
    const lobby = lobbies.get(id);
    if (!lobby) {
      if (cb) cb({ error: 'Lobby not found' });
      return;
    }
    const playerId = socket.id;
    joinLobbyState(lobby, playerId, playerName, false);
    socket.join(id);
    console.log(`Player ${playerName} (${playerId}) joined lobby ${id}`);
    if (cb) cb({ lobbyId: id, playerId, lobby: getPublicLobbyState(lobby, playerId) });
    io.to(id).emit('lobbyUpdate', getPublicLobbyState(lobby));
  });

  socket.on('themeVote', ({ lobbyId, themeKey }) => {
    const id = (lobbyId || '').toUpperCase();
    const lobby = lobbies.get(id);
    if (!lobby) return;
    registerThemeVote(lobby, socket.id, themeKey);
    io.to(id).emit('lobbyUpdate', getPublicLobbyState(lobby));

    if (tryFinalizeTheme(lobby)) {
      io.to(id).emit('lobbyUpdate', getPublicLobbyState(lobby));
    }
  });

  socket.on('setCharacter', ({ lobbyId, character }) => {
    const id = (lobbyId || '').toUpperCase();
    const lobby = lobbies.get(id);
    if (!lobby) return;
    setCharacterForPlayer(lobby, socket.id, character);
    io.to(id).emit('lobbyUpdate', getPublicLobbyState(lobby));
  });

  socket.on('addTheme', ({ lobbyId, themeKey, label, intro }) => {
    const id = (lobbyId || '').toUpperCase();
    const lobby = lobbies.get(id);
    if (!lobby) return;
    if (!themeKey || !label) return;

    lobby.availableThemes = lobby.availableThemes || [];

    // prevent duplicates by key or label
    const exists = lobby.availableThemes.find(t => t.key === themeKey || t.label === label);
    if (exists) {
      socket.emit('addThemeResult', { ok: false, error: 'Theme already exists' });
      socket.emit('lobbyUpdate', getPublicLobbyState(lobby));
      return;
    }

    // prevent same player from adding more than one custom theme
    const alreadyAddedByPlayer = lobby.availableThemes.find(t => t.addedById === socket.id);
    if (alreadyAddedByPlayer) {
      socket.emit('addThemeResult', { ok: false, error: 'You have already added a custom theme' });
      socket.emit('lobbyUpdate', getPublicLobbyState(lobby));
      return;
    }

    const player = (lobby.players || []).find(p => p.id === socket.id) || {};
    const addedBy = player.name || 'Unknown';
    const cleanIntro = intro && ('' + intro).trim() ? ('' + intro).trim() : undefined;
    lobby.availableThemes.push({ key: themeKey, label: label, intro: cleanIntro, addedBy, addedById: socket.id });
    io.to(id).emit('lobbyUpdate', getPublicLobbyState(lobby));
    socket.emit('addThemeResult', { ok: true });
  });

  socket.on('startGame', ({ lobbyId }) => {
    const id = (lobbyId || '').toUpperCase();
    const lobby = lobbies.get(id);
    if (!lobby) return;
    // Host triggers start of theme voting when everyone has created characters
    if (startThemeVote(lobby, socket.id)) {
      io.to(id).emit('lobbyUpdate', getPublicLobbyState(lobby));
    } else {
      // if not allowed, send updated state back to requester only
      socket.emit('lobbyUpdate', getPublicLobbyState(lobby, socket.id));
    }
  });

  socket.on('playerAction', ({ lobbyId, actionText, itemToUse }) => {
    const id = (lobbyId || '').toUpperCase();
    const lobby = lobbies.get(id);
    if (!lobby) return;
    handlePlayerAction(lobby, socket.id, actionText, itemToUse);
    io.to(id).emit('lobbyUpdate', getPublicLobbyState(lobby));
  });

  socket.on('groupProposal', ({ lobbyId, proposalText, itemToAttach }) => {
    const id = (lobbyId || '').toUpperCase();
    const lobby = lobbies.get(id);
    if (!lobby) return;
    handleGroupProposal(lobby, socket.id, proposalText, itemToAttach);
    io.to(id).emit('lobbyUpdate', getPublicLobbyState(lobby));
  });

  socket.on('groupVote', ({ lobbyId, proposalId }) => {
    const id = (lobbyId || '').toUpperCase();
    const lobby = lobbies.get(id);
    if (!lobby) return;
    handleGroupVote(lobby, socket.id, proposalId);
    io.to(id).emit('lobbyUpdate', getPublicLobbyState(lobby));
  });

  socket.on('saveCampaign', ({ lobbyId }, cb) => {
    const id = (lobbyId || '').toUpperCase();
    const lobby = lobbies.get(id);
    if (!lobby) {
      if (cb) cb({ error: 'Lobby not found' });
      return;
    }
    // Only host can save
    const player = lobby.players.find(p => p.id === socket.id);
    if (!player || !player.isHost) {
      if (cb) cb({ error: 'Only host can save campaigns' });
      return;
    }
    if (!lobby.campaignId) {
      if (cb) cb({ error: 'No campaign ID to save' });
      return;
    }
    const savePayload = serializeCampaign(lobby);
    campaignSaves.set(lobby.campaignId, savePayload);
    console.log(`Campaign ${lobby.campaignId} saved by host`);
    if (cb) cb({ ok: true, campaignId: lobby.campaignId });
  });

  socket.on('loadCampaign', ({ campaignId, newLobbyId }, cb) => {
    const payload = campaignSaves.get(campaignId);
    if (!payload) {
      if (cb) cb({ error: 'Campaign not found' });
      return;
    }
    // Create a new lobby with the loaded campaign state
    const lobbyId = newLobbyId || generateLobbyId();
    const lobbyState = deserializeCampaign(payload);
    lobbyState.lobbyId = lobbyId;
    lobbies.set(lobbyId, lobbyState);
    
    // Add the loading player as host
    const playerId = socket.id;
    const playerName = payload.players && payload.players[0] ? payload.players[0].name : 'Host';
    joinLobbyState(lobbyState, playerId, playerName, true);
    socket.join(lobbyId);
    
    console.log(`Campaign ${campaignId} loaded into lobby ${lobbyId}`);
    if (cb) cb({ ok: true, lobbyId, lobby: getPublicLobbyState(lobbyState, playerId) });
    io.to(lobbyId).emit('lobbyUpdate', getPublicLobbyState(lobbyState));
  });

  socket.on('creditsComplete', ({ lobbyId }) => {
    const id = (lobbyId || '').toUpperCase();
    const lobby = lobbies.get(id);
    if (!lobby) return;
    if (startGameAfterCredits(lobby)) {
      io.to(id).emit('lobbyUpdate', getPublicLobbyState(lobby));
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected', socket.id);
    // We keep lobbies alive; players can reconnect. Could add cleanup if desired.
  });
});

function generateLobbyId() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 4; i++) {
    id += letters[Math.floor(Math.random() * letters.length)];
  }
  if (lobbies.has(id)) return generateLobbyId();
  return id;
}

server.listen(PORT, () => {
  console.log('Server listening on port', PORT);
});
