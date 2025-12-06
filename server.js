
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const WORLDS_FILE = path.join(DATA_DIR, 'worlds.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

// In-memory store
let worlds = {}; // worldId -> world object

function saveWorldsToDisk() {
  // Create a minimized copy without players (socket IDs are invalid after restart)
  const worldsToSave = {};
  for (const [id, world] of Object.entries(worlds)) {
    worldsToSave[id] = {
      id: world.id,
      name: world.name,
      seed: world.seed,
      size: world.size,
      islandSize: world.islandSize,
      climate: world.climate,
      tiles: world.tiles,
      creatureTypes: world.creatureTypes,
      creatures: world.creatures,
      civilizations: world.civilizations,
      time: world.time,
      createdAt: world.createdAt,
      updatedAt: world.updatedAt
      // Exclude players - they reconnect with fresh socket IDs
    };
  }
  // Save without indentation to reduce file size
  fs.writeFileSync(WORLDS_FILE, JSON.stringify(worldsToSave));
}

function loadWorldsFromDisk() {
  if (fs.existsSync(WORLDS_FILE)) {
    try {
      const raw = fs.readFileSync(WORLDS_FILE, 'utf-8');
      worlds = JSON.parse(raw);
      // Initialize players object for all loaded worlds
      for (const world of Object.values(worlds)) {
        if (!world.players) world.players = {};
      }
    } catch (e) {
      console.error('Failed to load worlds.json, starting fresh', e);
      worlds = {};
    }
  }
}

loadWorldsFromDisk();

// --- World generation ---

function rand(seed) {
  let x = seed % 2147483647;
  if (x <= 0) x += 2147483646;
  return function() {
    x = x * 16807 % 2147483647;
    return (x - 1) / 2147483646;
  };
}

// Perlin-like noise function for smoother terrain
function noise2D(x, y, seed) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x, y, seed, scale) {
  const X = Math.floor(x / scale);
  const Y = Math.floor(y / scale);
  const fracX = (x / scale) - X;
  const fracY = (y / scale) - Y;
  
  const v1 = noise2D(X, Y, seed);
  const v2 = noise2D(X + 1, Y, seed);
  const v3 = noise2D(X, Y + 1, seed);
  const v4 = noise2D(X + 1, Y + 1, seed);
  
  const i1 = v1 * (1 - fracX) + v2 * fracX;
  const i2 = v3 * (1 - fracX) + v4 * fracX;
  
  return i1 * (1 - fracY) + i2 * fracY;
}

function generateWorld(seed, size, islandSize = 50, climate = 'temperate') {
  const rnd = rand(seed);
  const tiles = [];
  const centerX = size / 2;
  const centerY = size / 2;
  const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);
  
  // Climate modifiers
  const climateData = {
    tropical: { tempMod: 10, moistMod: 0.3, forestChance: 0.7 },
    temperate: { tempMod: 0, moistMod: 0, forestChance: 0.5 },
    arid: { tempMod: 15, moistMod: -0.4, forestChance: 0.2 },
    cold: { tempMod: -10, moistMod: -0.2, forestChance: 0.3 }
  };
  const cData = climateData[climate] || climateData.temperate;
  
  // First pass: generate height map with island shape
  const heightMap = [];
  for (let y = 0; y < size; y++) {
    const row = [];
    for (let x = 0; x < size; x++) {
      // Distance from center (for island shape)
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const distFactor = 1 - Math.min(1, dist / (maxDist * (islandSize / 100)));
      
      // Multi-octave noise for natural terrain
      let h = smoothNoise(x, y, seed, 8) * 0.5;
      h += smoothNoise(x, y, seed + 1, 16) * 0.25;
      h += smoothNoise(x, y, seed + 2, 4) * 0.125;
      h /= 0.875;
      
      // Apply island shape
      h = h * distFactor * distFactor;
      
      row.push(h);
    }
    heightMap.push(row);
  }
  
  // Second pass: determine biomes and create tiles
  for (let y = 0; y < size; y++) {
    const row = [];
    for (let x = 0; x < size; x++) {
      const h = heightMap[y][x];
      
      // Determine biome based on height
      let biome = 'water';
      let vegetation = null;
      
      if (h <= 0.3) {
        biome = 'water';
      } else if (h <= 0.35) {
        biome = 'beach';
      } else if (h <= 0.65) {
        biome = 'grass';
        // Add vegetation
        if (rnd() < 0.15) vegetation = 'bush';
        if (rnd() < 0.05) vegetation = 'tree';
      } else if (h <= 0.85) {
        biome = 'forest';
        // Dense vegetation
        if (rnd() < cData.forestChance) vegetation = 'tree';
        else if (rnd() < 0.3) vegetation = 'bush';
      } else {
        biome = 'mountain';
        if (rnd() < 0.1) vegetation = 'rock';
      }
      
      // Food sources based on biome and vegetation
      let food = 0;
      if (biome === 'grass') food = Math.floor(rnd() * 3) + 2;
      if (biome === 'forest') food = Math.floor(rnd() * 5) + 3;
      if (vegetation === 'bush') food += 3;
      if (vegetation === 'tree') food += 2;
      
      // Temperature and moisture
      const tempBase = 20 + (1 - h) * 10 + cData.tempMod;
      const moistBase = Math.min(1, Math.max(0, 
        (biome === 'water' ? 1.0 :
         biome === 'beach' ? 0.4 :
         biome === 'grass' ? 0.6 :
         biome === 'forest' ? 0.8 : 0.3) + cData.moistMod
      ));
      
      row.push({
        h,
        biome,
        vegetation,
        food,
        tempBase,
        moistBase,
        temp: tempBase,
        moist: moistBase
      });
    }
    tiles.push(row);
  }
  
  return tiles;
}

function createNewWorld(name, options = {}) {
  const id = uuidv4();
  const seed = options.seed || Math.floor(Math.random() * 1e9);
  const size = options.size || 64;
  const islandSize = options.islandSize || 50;
  const climate = options.climate || 'temperate';
  
  const tiles = generateWorld(seed, size, islandSize, climate);
  
  const world = {
    id,
    name,
    seed,
    size,
    islandSize,
    climate,
    tiles,
    creatureTypes: {},
    creatures: [],
    players: {},
    civilizations: [],
    time: 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  worlds[id] = world;
  saveWorldsToDisk();
  return world;
}

// --- Player and progression helpers ---

function createPlayerState(playerName) {
  return {
    id: uuidv4(),
    name: playerName || 'Unknown',
    xp: 0,
    level: 1,
    unlockedPowers: ['observe', 'createPlant'],
    influence: 0,
    influenceMax: 100
  };
}

function sendPlayerUpdate(world, socketId) {
  const player = world.players[socketId];
  if (!player) return;
  io.to(socketId).emit('playerUpdate', { player });
}

function gainXp(world, socketId, amount) {
  const player = world.players[socketId];
  if (!player) return;
  player.xp += amount;
  while (player.xp >= player.level * 100) {
    player.xp -= player.level * 100;
    player.level += 1;
    if (player.level === 2 && !player.unlockedPowers.includes('createHerbivore')) {
      player.unlockedPowers.push('createHerbivore');
    }
    if (player.level === 3 && !player.unlockedPowers.includes('terraformSmall')) {
      player.unlockedPowers.push('terraformSmall');
    }
    if (player.level === 4 && !player.unlockedPowers.includes('fertilityBoost')) {
      player.unlockedPowers.push('fertilityBoost');
    }
    if (player.level === 5 && !player.unlockedPowers.includes('rainstorm')) {
      player.unlockedPowers.push('rainstorm');
    }
    if (player.level === 6 && !player.unlockedPowers.includes('heatwave')) {
      player.unlockedPowers.push('heatwave');
    }
  }
  world.updatedAt = Date.now();
  sendPlayerUpdate(world, socketId);
}

// --- Express static files ---

app.use(express.static(path.join(__dirname, 'public')));
// Parse JSON bodies for API endpoints (import)
app.use(express.json({ limit: '5mb' }));

app.get('/api/worlds', (req, res) => {
  const summary = Object.values(worlds).map(w => ({
    id: w.id,
    name: w.name,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt
  }));
  res.json(summary);
});

// Export a single world as compact JSON (sanitized for portability)
app.get('/api/worlds/:worldId/export', (req, res) => {
  const worldId = req.params.worldId;
  const world = worlds[worldId];
  if (!world) return res.status(404).json({ ok: false, error: 'World not found' });

  // Deep-copy and sanitize
  const copy = {
    id: world.id,
    name: world.name,
    seed: world.seed,
    size: world.size,
    islandSize: world.islandSize,
    climate: world.climate,
    tiles: world.tiles,
    creatureTypes: world.creatureTypes,
    creatures: (world.creatures || []).map(c => {
      const cc = Object.assign({}, c);
      // Remove runtime-only fields
      delete cc.ownerSocketId;
      delete cc.dead;
      return cc;
    }),
    civilizations: world.civilizations || [],
    time: world.time || 0,
    createdAt: world.createdAt,
    updatedAt: world.updatedAt
  };

  res.setHeader('Content-Disposition', `attachment; filename="world-${worldId}.json"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(copy));
});

// Import a world JSON payload and create a new world entry
app.post('/api/worlds/import', (req, res) => {
  const payload = req.body;
  if (!payload || !payload.tiles || !payload.size) {
    return res.status(400).json({ ok: false, error: 'Invalid world payload' });
  }

  try {
    const newId = uuidv4();
    const now = Date.now();
    const world = {
      id: newId,
      name: payload.name || (`Imported World ${newId.slice(0,8)}`),
      seed: payload.seed || Math.floor(Math.random() * 1e9),
      size: payload.size,
      islandSize: payload.islandSize || (payload.islandSize === 0 ? 0 : 50),
      climate: payload.climate || 'temperate',
      tiles: payload.tiles,
      creatureTypes: payload.creatureTypes || {},
      creatures: (payload.creatures || []).map(c => {
        const cc = Object.assign({}, c);
        // Imported creatures shouldn't carry owner socket IDs
        delete cc.ownerSocketId;
        return cc;
      }),
      civilizations: payload.civilizations || [],
      players: {},
      time: payload.time || 0,
      createdAt: now,
      updatedAt: now
    };

    // Basic validation: tiles dimensions
    if (!Array.isArray(world.tiles) || world.tiles.length !== world.size) {
      return res.status(400).json({ ok: false, error: 'Tiles array size mismatch' });
    }

    worlds[newId] = world;
    saveWorldsToDisk();
    return res.json({ ok: true, worldId: newId });
  } catch (e) {
    console.error('Import failed', e);
    return res.status(500).json({ ok: false, error: 'Import failed' });
  }
});

app.delete('/api/worlds/:worldId', (req, res) => {
  const { worldId } = req.params;
  if (!worlds[worldId]) {
    return res.status(404).json({ ok: false, error: 'World not found' });
  }
  delete worlds[worldId];
  saveWorldsToDisk();
  res.json({ ok: true });
});

// --- Socket.IO ---

io.on('connection', (socket) => {
  console.log('client connected', socket.id);

  function broadcastPlayersListForWorld(worldId) {
    const world = worlds[worldId];
    if (!world || !world.players) return;
    // Remove any stale player entries where the socket is no longer connected
    for (const pid of Object.keys(world.players)) {
      if (!io.sockets.sockets.has(pid)) {
        delete world.players[pid];
      }
    }
    const playersList = Object.entries(world.players).map(([id, p]) => ({
      id,
      name: p.name,
      level: p.level,
      xp: p.xp
    }));
    io.to(worldId).emit('playersListUpdated', { players: playersList });
  }

  socket.on('createWorld', (data, cb) => {
    const name = (data && data.name) || 'New World';
    const size = parseInt(data.size) || 64;
    const islandSize = parseInt(data.islandSize) || 50;
    const climate = data.climate || 'temperate';
    const seed = data.seed ? parseInt(data.seed) : undefined;
    
    const world = createNewWorld(name, { size, islandSize, climate, seed });
    cb && cb({ ok: true, worldId: world.id, worldName: world.name });
  });

  socket.on('joinWorld', (data, cb) => {
    const { worldId, playerName } = data || {};
    const world = worlds[worldId];
    if (!world) {
      cb && cb({ ok: false, error: 'World not found' });
      return;
    }

    socket.join(worldId);
    const playerState = createPlayerState(playerName);
    world.players[socket.id] = playerState;
    world.updatedAt = Date.now();
    saveWorldsToDisk();

    cb && cb({
      ok: true,
      world: {
        id: world.id,
        name: world.name,
        size: world.size,
        tiles: world.tiles,
        creatureTypes: world.creatureTypes,
        creatures: world.creatures,
        player: playerState,
        civilizations: world.civilizations
      }
    });

    sendPlayerUpdate(world, socket.id);
    
    // Broadcast updated, cleaned player list to all players in the world
    broadcastPlayersListForWorld(worldId);
  });

  socket.on('createCreatureType', (data, cb) => {
    const { worldId, creatureType } = data || {};
    const world = worlds[worldId];
    if (!world) {
      cb && cb({ ok: false, error: 'World not found' });
      return;
    }
    const id = uuidv4();
    const type = Object.assign({}, creatureType, {
      id,
      generation: creatureType.generation || 0,
      parentTypeId: creatureType.parentTypeId || null,
      evoScore: 0,
      spawnLimit: 10, // Maximum allowed spawns per species
      spawned: 0 // Track how many have been manually spawned
    });
    world.creatureTypes[id] = type;
    world.updatedAt = Date.now();
    saveWorldsToDisk();
    gainXp(world, socket.id, 20);

    io.to(worldId).emit('creatureTypeCreated', { type });
    cb && cb({ ok: true, type });
  });

  socket.on('spawnCreature', (data, cb) => {
    const { worldId, typeId, x, y } = data || {};
    const world = worlds[worldId];
    if (!world) {
      cb && cb({ ok: false, error: 'World not found' });
      return;
    }
    const type = world.creatureTypes[typeId];
    if (!type) {
      cb && cb({ ok: false, error: 'Creature type not found' });
      return;
    }
    
    // Check spawn limit
    const spawned = type.spawned || 0;
    const limit = type.spawnLimit || 10;
    if (spawned >= limit) {
      cb && cb({ ok: false, error: `Spawn limit reached (${limit}/${limit})` });
      return;
    }
    
    const tileX = Math.max(0, Math.min(world.size - 1, Math.floor(x)));
    const tileY = Math.max(0, Math.min(world.size - 1, Math.floor(y)));

    const instance = {
      id: uuidv4(),
      typeId,
      x: tileX + 0.5,
      y: tileY + 0.5,
      vx: 0,
      vy: 0,
      targetX: null,
      targetY: null,
      hunger: 0.1,
      age: 0,
      health: 100,
      generation: 0,
      parentId: null,
      parent2Id: null,
      ownerSocketId: socket.id
    };
    world.creatures.push(instance);
    type.spawned = spawned + 1;
    world.updatedAt = Date.now();
    saveWorldsToDisk();
    gainXp(world, socket.id, 5);

    io.to(worldId).emit('creatureSpawned', { creature: instance, type });
    cb && cb({ ok: true, creature: instance });
  });

  socket.on('usePower', (data, cb) => {
    const { worldId, powerId, payload } = data || {};
    const world = worlds[worldId];
    if (!world) {
      cb && cb({ ok: false, error: 'World not found' });
      return;
    }
    const player = world.players[socket.id];
    if (!player) {
      cb && cb({ ok: false, error: 'Player not in world' });
      return;
    }
    if (!player.unlockedPowers.includes(powerId)) {
      cb && cb({ ok: false, error: 'Power not unlocked' });
      return;
    }

    if (powerId === 'terraformSmall') {
      const { x, y, delta } = payload || {};
      const tx = Math.max(0, Math.min(world.size - 1, Math.floor(x)));
      const ty = Math.max(0, Math.min(world.size - 1, Math.floor(y)));
      const tile = world.tiles[ty][tx];
      tile.h += delta;
      if (tile.h < 0) tile.h = 0;
      if (tile.h > 1) tile.h = 1;
      let biome = 'water';
      if (tile.h > 0.2 && tile.h <= 0.4) biome = 'beach';
      else if (tile.h > 0.4 && tile.h <= 0.7) biome = 'grass';
      else if (tile.h > 0.7 && tile.h <= 0.9) biome = 'forest';
      else if (tile.h > 0.9) biome = 'mountain';
      tile.biome = biome;

      world.updatedAt = Date.now();
      saveWorldsToDisk();
      gainXp(world, socket.id, 2);

      io.to(worldId).emit('tilesUpdated', {
        updates: [{
          x: tx,
          y: ty,
          tile
        }]
      });
      cb && cb({ ok: true });
      return;
    }

    if (powerId === 'fertilityBoost') {
      const { x, y, radius } = payload || {};
      const r = radius || 2;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const tx = Math.floor(x) + dx;
          const ty = Math.floor(y) + dy;
          if (tx < 0 || ty < 0 || tx >= world.size || ty >= world.size) continue;
          const tile = world.tiles[ty][tx];
          if (tile.biome !== 'water' && tile.biome !== 'mountain') {
            tile.food = Math.min((tile.food || 0) + 3, 25);
            tile.moistBase = Math.min((tile.moistBase || 0.5) + 0.02, 1.0);
          }
        }
      }
      world.updatedAt = Date.now();
      saveWorldsToDisk();
      gainXp(world, socket.id, 3);

      io.to(worldId).emit('worldFoodUpdated', {});
      cb && cb({ ok: true });
      return;
    }

    if (powerId === 'rainstorm') {
      const { x, y, radius } = payload || {};
      const r = radius || 4;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const tx = Math.floor(x) + dx;
          const ty = Math.floor(y) + dy;
          if (tx < 0 || ty < 0 || tx >= world.size || ty >= world.size) continue;
          const tile = world.tiles[ty][tx];
          if (tile.biome !== 'mountain') {
            tile.food = Math.min((tile.food || 0) + 5, 30);
            tile.moistBase = Math.min((tile.moistBase || 0.5) + 0.05, 1.0);
          }
        }
      }
      world.updatedAt = Date.now();
      saveWorldsToDisk();
      gainXp(world, socket.id, 5);

      io.to(worldId).emit('worldFoodUpdated', {});
      cb && cb({ ok: true });
      return;
    }

    if (powerId === 'heatwave') {
      const { x, y, radius } = payload || {};
      const r = radius || 4;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const tx = Math.floor(x) + dx;
          const ty = Math.floor(y) + dy;
          if (tx < 0 || ty < 0 || tx >= world.size || ty >= world.size) continue;
          const tile = world.tiles[ty][tx];
          tile.food = Math.max(0, (tile.food || 0) - 5);
          tile.moistBase = Math.max(0.1, (tile.moistBase || 0.5) - 0.05);
        }
      }
      world.updatedAt = Date.now();
      saveWorldsToDisk();
      gainXp(world, socket.id, 5);

      io.to(worldId).emit('worldFoodUpdated', {});
      cb && cb({ ok: true });
      return;
    }

    cb && cb({ ok: false, error: 'Power not implemented' });
  });

  socket.on('disconnect', () => {
    console.log('client disconnected', socket.id);
    for (const worldId of Object.keys(worlds)) {
      const world = worlds[worldId];
      if (world.players && world.players[socket.id]) {
        delete world.players[socket.id];
        world.updatedAt = Date.now();
        // Use helper to remove any additional stale entries and broadcast
        broadcastPlayersListForWorld(worldId);
      }
    }
    saveWorldsToDisk();
  });

  // Preview data: compact color grid
  socket.on('getWorldPreview', (data, cb) => {
    const { worldId } = data || {};
    const world = worlds[worldId];
    if (!world) {
      cb && cb({ ok: false, error: 'World not found' });
      return;
    }
    const size = world.size;
    const colors = new Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const t = world.tiles[y][x];
        let c;
        if (t.biome === 'water') c = '#1e3a8a';
        else if (t.biome === 'beach') c = '#f4e4b8';
        else if (t.biome === 'grass') c = '#10b981';
        else if (t.biome === 'forest') c = '#065f46';
        else if (t.biome === 'mountain') c = '#6b7280';
        else c = '#111827';
        colors[y * size + x] = c;
      }
    }
    const creatureCount = (world.creatures || []).length;
    cb && cb({ ok: true, preview: { size, colors, seed: world.seed, islandSize: world.islandSize, climate: world.climate, creatureCount } });
  });
});

// --- Simulation, evolution, civilizations ---

function cloneCreatureType(baseType) {
  const newType = JSON.parse(JSON.stringify(baseType));
  const newId = uuidv4();
  newType.id = newId;
  newType.parentTypeId = baseType.id;
  newType.generation = (baseType.generation || 0) + 1;
  newType.evoScore = 0;
  if (typeof newType.size === 'number') {
    newType.size = Math.max(0.3, Math.min(4, newType.size * (0.8 + Math.random() * 0.4)));
  }
  if (typeof newType.speed === 'number') {
    newType.speed = Math.max(0.3, Math.min(4, newType.speed * (0.8 + Math.random() * 0.4)));
  }
  if (newType.name) {
    newType.name = newType.name + ' \u03b2';
  }
  return newType;
}

function simulateWorld(world, dt) {
  const size = world.size;
  const tiles = world.tiles;
  const creatures = world.creatures;
  const types = world.creatureTypes;

  world.time = (world.time || 0) + dt;
  const season = Math.sin(world.time * 0.001);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tile = tiles[y][x];
      tile.temp = tile.tempBase + season * 5;
      tile.moist = Math.max(0, Math.min(1, tile.moistBase + season * 0.1));
      
      if (tile.biome !== 'water' && tile.biome !== 'mountain') {
        const regenRate = 0.01 * dt * (0.5 + tile.moist);
        tile.food = Math.min((tile.food || 0) + regenRate, 30);
        
        // Vegetation growth
        if (!tile.vegetation && tile.food > 10) {
          if (tile.biome === 'grass' && Math.random() < 0.0001 * dt) {
            tile.vegetation = Math.random() < 0.3 ? 'bush' : null;
          } else if (tile.biome === 'forest' && Math.random() < 0.0002 * dt) {
            tile.vegetation = Math.random() < 0.7 ? 'tree' : 'bush';
          }
          
          // Add food when vegetation grows
          if (tile.vegetation === 'bush') tile.food += 3;
          if (tile.vegetation === 'tree') tile.food += 5;
        }
      }
    }
  }

  const typeStats = {};

  for (let c of creatures) {
    c.age += dt;
    c.hunger += 0.001 * dt; // Reduced from 0.005 to make them survive longer
    
    // Initialize velocity if not present
    if (c.vx === undefined) c.vx = 0;
    if (c.vy === undefined) c.vy = 0;

    const type = types[c.typeId];
    if (!type) continue;

    const tx = Math.max(0, Math.min(size - 1, Math.floor(c.x)));
    const ty = Math.max(0, Math.min(size - 1, Math.floor(c.y)));
    const tile = tiles[ty][tx];

    // AI: Seek food when hungry, or seek mates
    let targetX = c.targetX;
    let targetY = c.targetY;
    let seeking = null;
    
    // Seek food if hungry
    if (c.hunger > 0.3) {
      let bestFood = 0;
      const searchRadius = 10; // Increased search radius
      
      for (let dy = -searchRadius; dy <= searchRadius; dy++) {
        for (let dx = -searchRadius; dx <= searchRadius; dx++) {
          const checkX = Math.max(0, Math.min(size - 1, tx + dx));
          const checkY = Math.max(0, Math.min(size - 1, ty + dy));
          const checkTile = tiles[checkY][checkX];
          
          if (checkTile.food > bestFood && checkTile.food > 2) {
            bestFood = checkTile.food;
            targetX = checkX + 0.5;
            targetY = checkY + 0.5;
            seeking = 'food';
          }
        }
      }
    }
    
    // Seek mates if well-fed
    if (!seeking && c.hunger < 0.5 && c.age > 30 && c.age < 400) {
      let closestMate = null;
      let closestDist = 10;
      
      for (const other of creatures) {
        if (other.id === c.id) continue;
        if (other.age < 30 || other.age > 400) continue;
        if (other.hunger > 0.6) continue;
        
        const dx = other.x - c.x;
        const dy = other.y - c.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < closestDist) {
          closestDist = dist;
          closestMate = other;
        }
      }
      
      if (closestMate) {
        targetX = closestMate.x;
        targetY = closestMate.y;
        seeking = 'mate';
      }
    }

    // Smooth velocity-based movement
    const moveSpeed = (type.speed || 1) * 0.01; // Reduced for smoother movement
    const friction = 0.92; // Higher friction for smoother deceleration
    
    if (targetX !== null && targetY !== null) {
      // Move towards target
      const dirX = targetX - c.x;
      const dirY = targetY - c.y;
      const dist = Math.sqrt(dirX * dirX + dirY * dirY);
      
      if (dist > 0.1) {
        const accelX = (dirX / dist) * moveSpeed * dt;
        const accelY = (dirY / dist) * moveSpeed * dt;
        c.vx += accelX;
        c.vy += accelY;
        c.targetX = targetX;
        c.targetY = targetY;
      } else {
        // Reached target
        c.targetX = null;
        c.targetY = null;
      }
    } else {
      // Random wandering - more subtle
      if (Math.random() < 0.005 * dt) {
        c.vx += (Math.random() - 0.5) * moveSpeed * dt * 0.5;
        c.vy += (Math.random() - 0.5) * moveSpeed * dt * 0.5;
      }
    }
    
    // Apply friction
    c.vx *= Math.pow(friction, dt);
    c.vy *= Math.pow(friction, dt);
    
    // Limit speed
    const maxSpeed = moveSpeed * 2;
    const speed = Math.sqrt(c.vx * c.vx + c.vy * c.vy);
    if (speed > maxSpeed) {
      c.vx = (c.vx / speed) * maxSpeed;
      c.vy = (c.vy / speed) * maxSpeed;
    }
    
    // Update position
    c.x = Math.max(0, Math.min(size - 0.001, c.x + c.vx * dt));
    c.y = Math.max(0, Math.min(size - 0.001, c.y + c.vy * dt));

    // Update tile position after movement
    const newTx = Math.max(0, Math.min(size - 1, Math.floor(c.x)));
    const newTy = Math.max(0, Math.min(size - 1, Math.floor(c.y)));
    const newTile = tiles[newTy][newTx];

    // Eating behavior
    if (type.diet === 'herbivore' || type.diet === 'plant' || !type.diet) {
      if (newTile.food > 0 && c.hunger > 0.1) {
        const eatAmount = Math.min(newTile.food, 0.15 * dt); // Increased eating rate
        newTile.food -= eatAmount;
        c.hunger = Math.max(0, c.hunger - eatAmount * 3); // More hunger reduction per food
        
        // Consume vegetation less aggressively
        if (newTile.vegetation && Math.random() < 0.005 * dt) {
          if (newTile.vegetation === 'bush') {
            newTile.food = Math.max(0, newTile.food - 1);
            if (newTile.food < 1) newTile.vegetation = null;
          }
        }
      }
    }

    // Reproduction - check for nearby mates
    if (c.hunger < 0.5 && c.age > 30 && c.age < 400) {
      // Find nearby potential mates
      for (const mate of creatures) {
        if (mate.id === c.id) continue;
        if (mate.age < 30 || mate.age > 400) continue;
        if (mate.hunger > 0.6) continue;
        
        const dx = mate.x - c.x;
        const dy = mate.y - c.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // If close enough, reproduce
        if (dist < 0.5 && Math.random() < 0.001 * dt) {
          const parent1Type = types[c.typeId];
          const parent2Type = types[mate.typeId];
          
          let babyTypeId = c.typeId;
          let isHybrid = false;
          
          // Check if parents are different species
          if (c.typeId !== mate.typeId && parent1Type && parent2Type) {
            // Create hybrid type
            isHybrid = true;
            const hybridId = uuidv4();
            const hybridType = {
              id: hybridId,
              name: `${parent1Type.name}-${parent2Type.name} Hybrid`,
              diet: parent1Type.diet, // Inherit from first parent
              size: (parent1Type.size + parent2Type.size) / 2,
              speed: (parent1Type.speed + parent2Type.speed) / 2,
              generation: Math.max(parent1Type.generation, parent2Type.generation) + 1,
              parentTypeId: parent1Type.id,
              parent2TypeId: parent2Type.id,
              evoScore: 0,
              imageDataUrl: null, // Will be generated on client
              soundDataUrl: null,
              isHybrid: true
            };
            types[hybridId] = hybridType;
            babyTypeId = hybridId;
            
            // Emit new type to all clients
            io.to(world.id).emit('creatureTypeCreated', { type: hybridType, needsHybridImage: true, parent1: parent1Type, parent2: parent2Type });
          }
          
          const baby = {
            id: uuidv4(),
            typeId: babyTypeId,
            x: Math.max(0, Math.min(size - 0.001, c.x + (Math.random() - 0.5) * 0.5)),
            y: Math.max(0, Math.min(size - 0.001, c.y + (Math.random() - 0.5) * 0.5)),
            vx: 0,
            vy: 0,
            targetX: null,
            targetY: null,
            hunger: 0.2,
            age: 0,
            health: 100,
            generation: Math.max(c.generation || 0, mate.generation || 0) + 1,
            parentId: c.id,
            parent2Id: mate.id,
            ownerSocketId: c.ownerSocketId
          };
          creatures.push(baby);
          
          if (!typeStats[babyTypeId]) typeStats[babyTypeId] = { count: 0, births: 0 };
          typeStats[babyTypeId].births += 1;
          
          // Increase hunger after reproduction
          c.hunger += 0.2;
          mate.hunger += 0.2;
          
          break; // Only one baby per cycle
        }
      }
    }

    if (!typeStats[c.typeId]) typeStats[c.typeId] = { count: 0, births: 0 };
    typeStats[c.typeId].count += 1;

    // Death conditions - much more lenient
    if (c.hunger > 5 || c.age > 2000) {
      c.dead = true;
    }
  }

  for (let i = creatures.length - 1; i >= 0; i--) {
    if (creatures[i].dead) {
      creatures.splice(i, 1);
    }
  }

  const newTypes = [];
  for (const typeId of Object.keys(typeStats)) {
    const stats = typeStats[typeId];
    const type = types[typeId];
    if (!type) continue;
    type.evoScore = (type.evoScore || 0) + stats.births * 2 + stats.count * 0.01 * dt;
    if (type.evoScore > 200) {
      const evolvedType = cloneCreatureType(type);
      types[evolvedType.id] = evolvedType;
      type.evoScore = 0;
      newTypes.push(evolvedType);

      let spawned = 0;
      for (const c of creatures) {
        if (spawned >= 5) break;
        if (c.typeId === typeId) {
          const baby = {
            id: uuidv4(),
            typeId: evolvedType.id,
            x: c.x,
            y: c.y,
            hunger: 0.3,
            age: 0,
            generation: 0,
            ownerSocketId: c.ownerSocketId
          };
          creatures.push(baby);
          spawned += 1;
        }
      }
    }
  }

  if (newTypes.length > 0) {
    for (const t of newTypes) {
      io.to(world.id).emit('creatureTypeCreated', { type: t });
    }
  }

  const civs = world.civilizations || [];
  for (const typeId of Object.keys(typeStats)) {
    const stats = typeStats[typeId];
    const type = types[typeId];
    if (!type) continue;
    if (type.diet === 'carnivore') continue;
    if (stats.count < 40) continue;
    const already = civs.find(c => c.typeId === typeId);
    if (already) continue;

    let sx = 0, sy = 0, cnt = 0;
    for (const c of creatures) {
      if (c.typeId === typeId) {
        sx += c.x;
        sy += c.y;
        cnt++;
      }
    }
    if (cnt === 0) continue;
    const civ = {
      id: uuidv4(),
      typeId,
      x: sx / cnt,
      y: sy / cnt,
      population: Math.max(30, Math.round(stats.count / 2)),
      techLevel: 1,
      culture: Math.random() < 0.5 ? 'peaceful' : 'warlike',
      lastUpdate: Date.now()
    };
    civs.push(civ);
  }

  for (let i = civs.length - 1; i >= 0; i--) {
    const civ = civs[i];
    let sumFood = 0;
    let tilesCount = 0;
    const r = 3;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const tx = Math.floor(civ.x) + dx;
        const ty = Math.floor(civ.y) + dy;
        if (tx < 0 || ty < 0 || tx >= size || ty >= size) continue;
        const tile = tiles[ty][tx];
        sumFood += tile.food || 0;
        tilesCount++;
      }
    }
    const avgFood = tilesCount > 0 ? sumFood / tilesCount : 0;
    const growthFactor = avgFood / 50;
    civ.population += growthFactor * dt;
    civ.techLevel += 0.0001 * dt * (1 + growthFactor);
    if (civ.population < 5) {
      civs.splice(i, 1);
      continue;
    }
    civ.population = Math.min(civ.population, 10000);
    civ.techLevel = Math.min(civ.techLevel, 10);
  }

  world.civilizations = civs;
  world.updatedAt = Date.now();
}

let lastSimTime = Date.now();
let lastSaveTime = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = (now - lastSimTime) / 16;
  lastSimTime = now;

  for (const worldId of Object.keys(worlds)) {
    const world = worlds[worldId];
    simulateWorld(world, dt);
    io.to(worldId).emit('worldUpdate', {
      creatures: world.creatures,
      civilizations: world.civilizations
    });
  }

  if (now - lastSaveTime > 10000) {
    saveWorldsToDisk();
    lastSaveTime = now;
  }
}, 200);

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
