const socket = io();

let currentWorld = null;
let currentPlayer = null;
let creatureTypes = {};
let creatures = [];
let civilizations = [];
let selectedSpeciesId = null;
let selectedCreature = null;
let currentPower = null;
let worldSize = 64;
let viewMode = 'biome';

// Camera controls
let cameraX = 0;
let cameraY = 0;
let cameraZoom = 1;
// Whether an uploaded creature image is present (disables freehand drawing)
let creatureImageLoaded = false;

// Clamp camera so it cannot move far outside the playable world bounds
function clampCamera() {
  if (!currentWorld || !gameCanvas) return;
  const size = currentWorld.size || worldSize;
  const tileW = gameCanvas.width / size;
  const tileH = gameCanvas.height / size;
  const worldW = size * tileW;
  const worldH = size * tileH;
  const viewW = gameCanvas.width / cameraZoom;
  const viewH = gameCanvas.height / cameraZoom;

  let minX, maxX, minY, maxY;
  if (worldW <= viewW) {
    minX = maxX = (worldW - viewW) / 2;
  } else {
    minX = 0;
    maxX = worldW - viewW;
  }
  if (worldH <= viewH) {
    minY = maxY = (worldH - viewH) / 2;
  } else {
    minY = 0;
    maxY = worldH - viewH;
  }

  // small margin (in pixels) so user can pan a bit outside the playable border
  // Allow a margin equal to a few tiles so the camera can show some ocean around the world
  const marginTiles = 2; // how many tiles of margin to allow
  const margin = marginTiles * tileW;
  cameraX = Math.max(minX - margin, Math.min(maxX + margin, cameraX));
  cameraY = Math.max(minY - margin, Math.min(maxY + margin, cameraY));
}

// Prevent zooming out so far the world becomes tiny on screen
function clampZoom() {
  // Hard limits
  const ABS_MIN = 0.05;
  const ABS_MAX = 6;
  if (!gameCanvas || !currentWorld) {
    cameraZoom = Math.max(ABS_MIN, Math.min(ABS_MAX, cameraZoom));
    return;
  }

  const size = currentWorld.size || worldSize;
  const marginTiles = 2; // match clampCamera margin

  // We want the visible width (gameCanvas.width / cameraZoom) to be at most
  // worldWidth + 2*marginPixels. worldWidth in world-coordinates equals gameCanvas.width.
  // Solve for cameraZoom: cameraZoom >= 1 / (1 + 2*marginTiles/size)
  const minZoom = 1 / (1 + (2 * marginTiles) / Math.max(1, size));

  cameraZoom = Math.max(minZoom, Math.min(ABS_MAX, cameraZoom));
}

// client-side settings
const defaultSettings = {
  masterVolume: 1,
  creatureVolume: 0.8,
  mute: false,
  showGrid: true,
  reduceEffects: false
};
let settings = { ...defaultSettings };

function loadSettings() {
  try {
    const raw = localStorage.getItem('godSimSettings');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    settings = { ...defaultSettings, ...parsed };
  } catch (e) {
    console.warn('Failed to load settings', e);
  }
}

function saveSettings() {
  try {
    localStorage.setItem('godSimSettings', JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save settings', e);
  }
}

loadSettings();

// DOM references
const introScreenEl = document.getElementById('introScreen');
const mainMenuEl = document.getElementById('mainMenu');
const newWorldScreenEl = document.getElementById('newWorldScreen');
const lobbyEl = document.getElementById('lobby');
const settingsScreenEl = document.getElementById('settingsScreen');
const gameEl = document.getElementById('game');
const yourWorldsScreenEl = document.getElementById('yourWorldsScreen');

const btnStartIntro = document.getElementById('btnStartIntro');
const btnNewWorld = document.getElementById('btnNewWorld');
const btnMultiplayer = document.getElementById('btnMultiplayer');
const btnYourWorlds = document.getElementById('btnYourWorlds');
const btnSettings = document.getElementById('btnSettings');

const backFromNewWorldBtn = document.getElementById('backFromNewWorldBtn');
const backFromMultiplayerBtn = document.getElementById('backFromMultiplayerBtn');
const backFromYourWorldsBtn = document.getElementById('backFromYourWorldsBtn');
const backFromSettingsBtn = document.getElementById('backFromSettingsBtn');

// Track previous screen for context-aware navigation
let previousScreen = null;

const worldNameInput = document.getElementById('worldNameInput');
const createWorldBtn = document.getElementById('createWorldBtn');

const menuPlayerNameInput = document.getElementById('menuPlayerNameInput');

const joinWorldIdInput = document.getElementById('joinWorldIdInput');
const joinWorldBtn = document.getElementById('joinWorldBtn');

const refreshWorldsBtn = document.getElementById('refreshWorldsBtn');
const worldListEl = document.getElementById('worldList');
const worldPreviewCanvas = document.getElementById('worldPreviewCanvas');
const worldPreviewInfo = document.getElementById('worldPreviewInfo');
const enterWorldBtn = document.getElementById('enterWorldBtn');
const copyWorldIdBtn = document.getElementById('copyWorldIdBtn');
const exportWorldBtn = document.getElementById('exportWorldBtn');
const importWorldBtn = document.getElementById('importWorldBtn');
const importWorldFile = document.getElementById('importWorldFile');
let selectedWorldForPreview = null;

const playersListEl = document.getElementById('playersList');

const worldLabel = document.getElementById('worldLabel');
const playerLabel = document.getElementById('playerLabel');
const xpLabel = document.getElementById('xpLabel');
const levelLabel = document.getElementById('levelLabel');
const powersLabel = document.getElementById('powersLabel');
const backToMainMenuBtn = document.getElementById('backToMainMenuBtn');

const gameCanvas = document.getElementById('gameCanvas');
const gameCtx = gameCanvas.getContext('2d');

const creatureCanvas = document.getElementById('creatureCanvas');
const creatureCtx = creatureCanvas.getContext('2d');
const clearCreatureCanvasBtn = document.getElementById('clearCreatureCanvasBtn');
const creatureImageUpload = document.getElementById('creatureImageUpload');
const creatureNameInput = document.getElementById('creatureNameInput');
const creatureDietSelect = document.getElementById('creatureDietSelect');
const creatureSizeInput = document.getElementById('creatureSizeInput');
const creatureSpeedInput = document.getElementById('creatureSpeedInput');
const createCreatureTypeBtn = document.getElementById('createCreatureTypeBtn');

const startRecordingBtn = document.getElementById('startRecordingBtn');
const stopRecordingBtn = document.getElementById('stopRecordingBtn');
const recordingStatus = document.getElementById('recordingStatus');

const speciesListEl = document.getElementById('speciesList');

const powerTerraformBtn = document.getElementById('powerTerraformBtn');
const powerFertilityBtn = document.getElementById('powerFertilityBtn');
const powerRainBtn = document.getElementById('powerRainBtn');
const powerHeatwaveBtn = document.getElementById('powerHeatwaveBtn');

const viewBiomeBtn = document.getElementById('viewBiomeBtn');
const viewFoodBtn = document.getElementById('viewFoodBtn');
const viewTempBtn = document.getElementById('viewTempBtn');

const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const resetCameraBtn = document.getElementById('resetCameraBtn');

const copyJoinCodeBtn = document.getElementById('copyJoinCodeBtn');

const toolbarCreatorBtn = document.getElementById('toolbarCreatorBtn');
const creatorPanel = document.getElementById('creatorPanel');

const tileInfoEl = document.getElementById('tileInfo');
const creatureCountLabel = document.getElementById('creatureCountLabel');
const pauseBtn = document.getElementById('pauseBtn');
const speedSelect = document.getElementById('speedSelect');

// Game state
let isPaused = false;
let gameSpeed = 1;
let lastSpeed = '1';

// settings controls
const settingMasterVolume = document.getElementById('settingMasterVolume');
const settingCreatureVolume = document.getElementById('settingCreatureVolume');
const settingMute = document.getElementById('settingMute');
const settingShowGrid = document.getElementById('settingShowGrid');
const settingReduceEffects = document.getElementById('settingReduceEffects');

// audio caches
const speciesSoundCache = {};
const speciesLastSoundTime = {};

// --- notification system ---
function ensureNotificationContainer() {
  let container = document.getElementById('notifications');
  if (!container) {
    container = document.createElement('div');
    container.id = 'notifications';
    container.className = 'notifications';
    document.body.appendChild(container);
  }
  return container;
}

function showNotification(message, type = 'info', duration = 4000) {
  const container = ensureNotificationContainer();

  // limit concurrent notifications
  while (container.children.length >= 6) {
    const first = container.children[0];
    first.classList.remove('visible');
    first.addEventListener('transitionend', () => first.remove(), { once: true });
  }

  const n = document.createElement('div');
  n.className = `notification notification-${type}`;

  const msg = document.createElement('div');
  msg.className = 'notification-message';
  msg.textContent = message;

  n.appendChild(msg);
  container.appendChild(n);

  // entrance
  requestAnimationFrame(() => n.classList.add('visible'));

  if (duration > 0) {
    const dismiss = () => {
      n.classList.remove('visible');
      n.addEventListener('transitionend', () => n.remove(), { once: true });
    };

    setTimeout(dismiss, duration);
  }
}

function clearNotifications() {
  const container = ensureNotificationContainer();
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
}

// --- screen management ---

function showScreen(screen, trackPrevious = true) {
  const currentVisible = [introScreenEl, mainMenuEl, newWorldScreenEl, lobbyEl, settingsScreenEl, gameEl, yourWorldsScreenEl].find(el => 
    el && el.classList.contains('visible')
  );
  
  // Track previous screen unless we're showing settings
  if (trackPrevious && screen !== settingsScreenEl && currentVisible !== settingsScreenEl) {
    previousScreen = currentVisible;
  }
  
  [introScreenEl, mainMenuEl, newWorldScreenEl, lobbyEl, settingsScreenEl, gameEl, yourWorldsScreenEl].forEach(el => {
    if (!el) return;
    el.classList.remove('visible');
    el.classList.add('hidden');
  });
  screen.classList.add('visible');
  screen.classList.remove('hidden');
}

// initial - show intro screen
showScreen(introScreenEl);

// Intro screen button
if (btnStartIntro) {
  btnStartIntro.addEventListener('click', () => {
    showScreen(mainMenuEl);
  });
}

// --- persistent player name (single input on main menu) ---
function getSavedPlayerName() {
  try {
    const menuVal = (menuPlayerNameInput && menuPlayerNameInput.value && menuPlayerNameInput.value.trim());
    if (menuVal) return menuVal;
    const stored = localStorage.getItem('godSimPlayerName');
    if (stored) return stored;
  } catch (e) {
    console.warn('Failed to read saved player name', e);
  }
  return 'Player';
}

function setSavedPlayerName(name) {
  try {
    const v = (name || '').trim();
    if (menuPlayerNameInput) menuPlayerNameInput.value = v;
    if (v) localStorage.setItem('godSimPlayerName', v);
    else localStorage.removeItem('godSimPlayerName');
  } catch (e) {
    console.warn('Failed to save player name', e);
  }
}

// initialize from storage
try {
  const stored = localStorage.getItem('godSimPlayerName');
  if (stored) setSavedPlayerName(stored);
} catch (e) {
  console.warn('Failed to initialize player name', e);
}

if (menuPlayerNameInput) {
  menuPlayerNameInput.addEventListener('input', (e) => {
    setSavedPlayerName(e.target.value);
  });
}

// menu buttons
btnNewWorld.onclick = () => showScreen(newWorldScreenEl);
btnMultiplayer.onclick = () => showScreen(lobbyEl);
btnYourWorlds.onclick = () => {
  showScreen(yourWorldsScreenEl);
  loadWorldsList();
};
btnSettings.onclick = () => {
  previousScreen = mainMenuEl; // Explicitly set main menu as previous screen
  showScreen(settingsScreenEl, false);
};

backFromNewWorldBtn.onclick = () => showScreen(mainMenuEl);
backFromMultiplayerBtn.onclick = () => showScreen(mainMenuEl);
backFromYourWorldsBtn.onclick = () => showScreen(mainMenuEl);
backFromSettingsBtn.onclick = () => {
  // Return to previous screen, or main menu if none
  showScreen(previousScreen || mainMenuEl, false);
};

backToMainMenuBtn.onclick = () => {
  // Clean up in-game state and return to main menu without reloading the page
  try {
    currentWorld = null;
    currentPlayer = null;
    creatures = [];
    creatureTypes = {};
  } catch (e) {
    console.warn('Error clearing world state', e);
  }
  showScreen(mainMenuEl);
};

// --- new world / multiplayer flows ---

// Update island size display
const islandSizeSlider = document.getElementById('islandSizeSlider');
const islandSizeValue = document.getElementById('islandSizeValue');
if (islandSizeSlider && islandSizeValue) {
  islandSizeSlider.addEventListener('input', () => {
    islandSizeValue.textContent = islandSizeSlider.value + '%';
  });
}

createWorldBtn.onclick = () => {
  const worldName = worldNameInput.value.trim() || 'My island world';
  const worldSize = document.getElementById('worldSizeSelect')?.value || 64;
  const islandSize = document.getElementById('islandSizeSlider')?.value || 50;
  const climate = document.getElementById('climateSelect')?.value || 'temperate';
  const seedInput = document.getElementById('worldSeedInput')?.value;
  const seed = seedInput ? parseInt(seedInput) : undefined;
  const playerName = getSavedPlayerName();
  
  socket.emit('createWorld', { 
    name: worldName, 
    size: worldSize, 
    islandSize: islandSize,
    climate: climate,
    seed: seed
  }, (res) => {
    if (!res.ok) {
      showNotification('Failed to create world: ' + res.error, 'error');
      return;
    }
    joinWorld(res.worldId, playerName);
  });
};

joinWorldBtn.onclick = () => {
  const worldId = joinWorldIdInput.value.trim();
  const playerName = getSavedPlayerName();
  if (!worldId) {
    showNotification('Enter a world ID.', 'error');
    return;
  }
  joinWorld(worldId, playerName);
};

async function loadWorldsList() {
  try {
    const res = await fetch('/api/worlds');
    const data = await res.json();
    worldListEl.innerHTML = '';
    data.forEach(w => {
      const li = document.createElement('li');
      li.className = 'world-item';
      li.innerHTML = `
        <div class="world-info">
          <div class="world-name">${w.name}</div>
          <div class="world-id">${w.id.slice(0, 8)}</div>
        </div>
      `;
      li.title = w.id;
      li.onclick = () => {
        previewWorld(w);
      };
      li.oncontextmenu = async (e) => {
        e.preventDefault();
        if (confirm(`Delete world "${w.name}"? This cannot be undone.`)) {
          try {
            const delRes = await fetch(`/api/worlds/${w.id}`, { method: 'DELETE' });
            const delData = await delRes.json();
            if (delData.ok) {
              li.remove();
              showNotification(`World "${w.name}" deleted.`, 'success');
            } else {
              showNotification('Failed to delete: ' + delData.error, 'error');
            }
          } catch (err) {
            showNotification('Error deleting world: ' + err.message, 'error');
          }
        }
      };
      worldListEl.appendChild(li);
    });
  } catch (e) {
    console.error(e);
    showNotification('Failed to load worlds.', 'error');
  }
}
function previewWorld(worldMeta) {
  selectedWorldForPreview = worldMeta;
  if (worldPreviewInfo) {
    worldPreviewInfo.textContent = `${worldMeta.name} • ${worldMeta.id.slice(0,8)}`;
  }
  if (copyWorldIdBtn) {
    copyWorldIdBtn.disabled = false;
    copyWorldIdBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(worldMeta.id);
        showNotification('World ID copied to clipboard.', 'success');
      } catch (err) {
        showNotification('Failed to copy ID: ' + err.message, 'error');
      }
    };
  }
  if (exportWorldBtn) {
    exportWorldBtn.disabled = false;
    exportWorldBtn.onclick = async () => {
      if (!selectedWorldForPreview) return;
      try {
        const res = await fetch(`/api/worlds/${selectedWorldForPreview.id}/export`);
        if (!res.ok) throw new Error('Export failed');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `world-${selectedWorldForPreview.id}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showNotification('World exported.', 'success');
      } catch (err) {
        showNotification('Export failed: ' + (err.message || err), 'error');
      }
    };
  }
  if (enterWorldBtn) {
    enterWorldBtn.disabled = false;
    enterWorldBtn.onclick = () => {
      const playerName = getSavedPlayerName();
      joinWorld(worldMeta.id, playerName);
    };
  }

  // request preview data from server
  socket.emit('getWorldPreview', { worldId: worldMeta.id }, (res) => {
    if (!res || !res.ok) {
      showNotification('Failed to load preview.', 'error');
      return;
    }
    renderWorldPreview(res.preview);
  });
}

function renderWorldPreview(preview) {
  if (!worldPreviewCanvas) return;
  // Make the canvas pixel-perfect for the preview and ensure full coverage
  const size = preview.size || 64;
  const displayCss = Math.max(64, Math.floor(worldPreviewCanvas.clientWidth || 360));
  const dpr = window.devicePixelRatio || 1;
  const pixelSize = Math.max(1, Math.floor(displayCss * dpr));
  // Set canvas internal pixel size to avoid scaling artifacts and ensure we draw every cell
  worldPreviewCanvas.width = pixelSize;
  worldPreviewCanvas.height = pixelSize;
  // Keep the displayed CSS size the same
  worldPreviewCanvas.style.width = displayCss + 'px';
  worldPreviewCanvas.style.height = displayCss + 'px';
  const ctx = worldPreviewCanvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, worldPreviewCanvas.width, worldPreviewCanvas.height);

  // Compute cell size in device pixels (may be fractional) and draw using integer rounding
  const cell = worldPreviewCanvas.width / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = preview.colors[y * size + x] || '#000';
      ctx.fillStyle = c;
      const x0 = Math.round(x * cell);
      const y0 = Math.round(y * cell);
      const x1 = Math.round((x + 1) * cell);
      const y1 = Math.round((y + 1) * cell);
      ctx.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
    }
  }
  // show metadata if available
  if (preview.seed !== undefined || preview.climate || preview.creatureCount !== undefined) {
    const meta = [];
    if (preview.seed !== undefined) meta.push(`Seed: ${preview.seed}`);
    if (preview.climate) meta.push(`Climate: ${preview.climate}`);
    if (preview.islandSize !== undefined) meta.push(`Island: ${preview.islandSize}%`);
    if (preview.creatureCount !== undefined) meta.push(`Creatures: ${preview.creatureCount}`);
    if (worldPreviewInfo) worldPreviewInfo.textContent = meta.join(' • ');
  }
}

refreshWorldsBtn.onclick = loadWorldsList;

// Import UI wiring
if (importWorldBtn && importWorldFile) {
  importWorldBtn.onclick = () => importWorldFile.click();
  importWorldFile.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const res = await fetch('/api/worlds/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.ok) {
        showNotification('World imported successfully.', 'success');
        loadWorldsList();
      } else {
        showNotification('Import failed: ' + (data.error || 'unknown'), 'error');
      }
    } catch (err) {
      console.error('Import error', err);
      showNotification('Failed to import world: ' + (err.message || err), 'error');
    } finally {
      importWorldFile.value = '';
    }
  });
}

function joinWorld(worldId, playerName) {
  socket.emit('joinWorld', { worldId, playerName }, (res) => {
    if (!res.ok) {
      showNotification('Failed to join world: ' + res.error, 'error');
      return;
    }
    showNotification(`Joined world as ${playerName}!`, 'success');
    currentWorld = res.world;
    currentPlayer = res.world.player;
    worldSize = currentWorld.size;
    creatureTypes = currentWorld.creatureTypes || {};
    creatures = currentWorld.creatures || [];
    civilizations = currentWorld.civilizations || [];

    showScreen(gameEl);
    updateTopBar();
    rebuildSpeciesList();
    initCreatureCanvas();
    // Ensure canvas matches container size and adjust zoom for visibility
    resizeGameCanvas();
    adjustInitialZoom();
    drawWorld();
    updateCreatureCount();
  });
}

function resizeGameCanvas() {
  try {
    const container = document.getElementById('canvasContainer') || gameCanvas.parentElement;
    // Keep the canvas square so tiles render as squares.
    // Fill the container as much as possible while staying square
    const maxW = Math.max(50, Math.floor(container.clientWidth));
    const maxH = Math.max(50, Math.floor(container.clientHeight));
    const size = Math.min(maxW, maxH);
    gameCanvas.style.width = size + 'px';
    gameCanvas.style.height = size + 'px';
    gameCanvas.width = size;
    gameCanvas.height = size;
  } catch (e) {
    console.warn('Failed to resize game canvas', e);
  }
}

function adjustInitialZoom() {
  if (!currentWorld) return;
  const size = currentWorld.size || worldSize;
  const tilePx = gameCanvas.width / size;
  const desiredTilePx = 10; // make tiles larger by default
  if (tilePx > 0) {
    const factor = desiredTilePx / tilePx;
    cameraZoom = cameraZoom * factor;
    clampZoom();
  }
  // center on world
  const tileW = gameCanvas.width / size;
  const worldCenterX = (size / 2) * tileW;
  const worldCenterY = (size / 2) * (gameCanvas.height / size);
  cameraX = worldCenterX - (gameCanvas.width / (2 * cameraZoom));
  cameraY = worldCenterY - (gameCanvas.height / (2 * cameraZoom));
  clampCamera();
}

window.addEventListener('resize', () => {
  if (gameEl && gameEl.classList.contains('visible')) {
    resizeGameCanvas();
    // keep view consistent
    clampCamera();
    drawWorld();
  }
});

// --- settings wiring ---

function applySettingsToControls() {
  settingMasterVolume.value = settings.masterVolume;
  settingCreatureVolume.value = settings.creatureVolume;
  settingMute.checked = settings.mute;
  settingShowGrid.checked = settings.showGrid;
  settingReduceEffects.checked = settings.reduceEffects;
}
applySettingsToControls();

settingMasterVolume.oninput = () => {
  settings.masterVolume = parseFloat(settingMasterVolume.value);
  saveSettings();
};
settingCreatureVolume.oninput = () => {
  settings.creatureVolume = parseFloat(settingCreatureVolume.value);
  saveSettings();
};
settingMute.onchange = () => {
  settings.mute = settingMute.checked;
  saveSettings();
};
settingShowGrid.onchange = () => {
  settings.showGrid = settingShowGrid.checked;
  saveSettings();
  drawWorld(); // Redraw immediately to show/hide grid
};
settingReduceEffects.onchange = () => {
  settings.reduceEffects = settingReduceEffects.checked;
  saveSettings();
  drawWorld(); // Redraw immediately to apply effects changes
};

// --- creature drawing ---

function initCreatureCanvas() {
  if (!creatureCanvas || !creatureCtx) {
    console.error('Creature canvas not available');
    return;
  }
  // Clear with transparent background
  creatureCtx.clearRect(0, 0, creatureCanvas.width, creatureCanvas.height);
  creatureCtx.strokeStyle = '#ffffff';
  creatureCtx.lineWidth = 4;
  creatureCtx.lineCap = 'round';
  // Ensure drawing mode is enabled after init
  creatureImageLoaded = false;
  creatureCanvas.style.cursor = 'crosshair';
  if (creatureCanvas.classList) creatureCanvas.classList.remove('has-image');
}

let drawing = false;
creatureCanvas.addEventListener('mousedown', (e) => {
  if (creatureImageLoaded) return; // prevent drawing when an image is loaded
  drawing = true;
  creatureCtx.beginPath();
  const rect = creatureCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  creatureCtx.moveTo(x, y);
});
creatureCanvas.addEventListener('mousemove', (e) => {
  if (creatureImageLoaded) return;
  if (!drawing) return;
  const rect = creatureCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  creatureCtx.lineTo(x, y);
  creatureCtx.stroke();
});
creatureCanvas.addEventListener('mouseup', () => {
  drawing = false;
});
creatureCanvas.addEventListener('mouseleave', () => {
  if (creatureImageLoaded) return;
  drawing = false;
});

clearCreatureCanvasBtn.onclick = () => initCreatureCanvas();

// Initialize canvas on page load
initCreatureCanvas();

creatureImageUpload.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      initCreatureCanvas();
      const scale = Math.min(creatureCanvas.width / img.width, creatureCanvas.height / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const x = (creatureCanvas.width - w) / 2;
      const y = (creatureCanvas.height - h) / 2;
      // Draw the uploaded image as a preview (disable smoothing for pixel art clarity)
      try { creatureCtx.imageSmoothingEnabled = false; } catch (e) {}
      creatureCtx.drawImage(img, x, y, w, h);
      // When an image is uploaded, disable the freehand drawing option and mark preview state
      creatureImageLoaded = true;
      creatureCanvas.style.cursor = 'default';
      if (creatureCanvas.classList) creatureCanvas.classList.add('has-image');
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

// --- sound recording ---

let mediaRecorder = null;
let recordedChunks = [];
let creatureSoundDataUrl = null;

startRecordingBtn.onclick = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    recordedChunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'audio/webm' });
      const reader = new FileReader();
      reader.onloadend = () => {
        creatureSoundDataUrl = reader.result;
        recordingStatus.textContent = 'Sound recorded';
      };
      reader.readAsDataURL(blob);
    };

    mediaRecorder.start();
    // Auto stop after max duration
    const MAX_MS = 5000;
    setTimeout(() => {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }
    }, MAX_MS);
    startRecordingBtn.disabled = true;
    stopRecordingBtn.disabled = false;
    recordingStatus.textContent = 'Recording...';
  } catch (err) {
    console.error(err);
    showNotification('Could not start recording. Check microphone permissions.', 'error');
  }
};

stopRecordingBtn.onclick = () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
  startRecordingBtn.disabled = false;
  stopRecordingBtn.disabled = true;
};

createCreatureTypeBtn.onclick = () => {
  if (!currentWorld) {
    showNotification('Join a world first.', 'error');
    return;
  }
  const name = creatureNameInput.value.trim() || 'Unnamed Species';
  const diet = creatureDietSelect.value;
  const size = parseFloat(creatureSizeInput.value) || 1;
  const speed = parseFloat(creatureSpeedInput.value) || 1;
  const imageDataUrl = creatureCanvas.toDataURL('image/png');

  const creatureType = {
    name,
    diet,
    size,
    speed,
    imageDataUrl,
    soundDataUrl: creatureSoundDataUrl || null
  };

  socket.emit('createCreatureType', { worldId: currentWorld.id, creatureType }, (res) => {
    if (!res.ok) {
      showNotification('Failed to create species: ' + res.error, 'error');
      return;
    }
    const type = res.type;
    creatureTypes[type.id] = type;
    rebuildSpeciesList();
    creatureSoundDataUrl = null;
    recordingStatus.textContent = 'No sound recorded';
    showNotification(`Species "${name}" created!`, 'success');
  });
};

// Rebuild species list with spawn limits
function rebuildSpeciesList() {
  speciesListEl.innerHTML = '';
  Object.values(creatureTypes).forEach(type => {
    const li = document.createElement('li');
    const spawned = type.spawned || 0;
    const limit = type.spawnLimit || 10;
    const remaining = limit - spawned;
    const limitText = remaining > 0 ? ` (${remaining}/${limit} left)` : ' (LIMIT REACHED)';
    li.textContent = type.name + ' [' + (type.diet || '?') + ']' + limitText;
    li.style.opacity = remaining > 0 ? '1' : '0.5';
    li.onclick = () => {
      if (remaining <= 0) {
        showNotification('Spawn limit reached for this species', 'warning');
        return;
      }
      selectedSpeciesId = type.id;
      Array.from(speciesListEl.children).forEach(c => c.classList.remove('selected'));
      li.classList.add('selected');
    };
    speciesListEl.appendChild(li);
  });
}

// Hybrid image generation - blend two parent images
function generateHybridImage(parent1Type, parent2Type, hybridType) {
  if (!parent1Type.imageDataUrl && !parent2Type.imageDataUrl) return null;
  
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  
  // Load both parent images
  const img1 = new Image();
  const img2 = new Image();
  
  let loaded = 0;
  const onLoad = () => {
    loaded++;
    if (loaded === 2) {
      // Draw both images with alpha blending
      ctx.globalAlpha = 0.5;
      if (parent1Type.imageDataUrl) {
        ctx.drawImage(img1, 0, 0, 256, 256);
      }
      if (parent2Type.imageDataUrl) {
        ctx.drawImage(img2, 0, 0, 256, 256);
      }
      
      // Convert to data URL
      hybridType.imageDataUrl = canvas.toDataURL('image/png');
    }
  };
  
  if (parent1Type.imageDataUrl) {
    img1.onload = onLoad;
    img1.src = parent1Type.imageDataUrl;
  } else {
    loaded++;
  }
  
  if (parent2Type.imageDataUrl) {
    img2.onload = onLoad;
    img2.src = parent2Type.imageDataUrl;
  } else {
    loaded++;
  }
}

// --- powers ---

function setPower(newPower) {
  currentPower = currentPower === newPower ? null : newPower;
  [powerTerraformBtn, powerFertilityBtn, powerRainBtn, powerHeatwaveBtn].forEach(b => b.classList.remove('active'));
  if (currentPower === 'terraformSmall') powerTerraformBtn.classList.add('active');
  if (currentPower === 'fertilityBoost') powerFertilityBtn.classList.add('active');
  if (currentPower === 'rainstorm') powerRainBtn.classList.add('active');
  if (currentPower === 'heatwave') powerHeatwaveBtn.classList.add('active');
}

powerTerraformBtn.onclick = () => setPower('terraformSmall');
powerFertilityBtn.onclick = () => setPower('fertilityBoost');
powerRainBtn.onclick = () => setPower('rainstorm');
powerHeatwaveBtn.onclick = () => setPower('heatwave');

// toolbar creator
toolbarCreatorBtn.onclick = () => {
  openCreatorModal();
};

// Overlay creator modal
let creatorOverlayEl;
function openCreatorModal() {
  if (!creatorOverlayEl) {
    creatorOverlayEl = document.createElement('div');
    creatorOverlayEl.className = 'creator-overlay';
    const modal = document.createElement('div');
    modal.className = 'creator-modal';
    modal.innerHTML = `
      <div class="panel-header">
        <h3>Creature Creator</h3>
        <button class="creator-close" id="creatorCloseBtn">Close</button>
      </div>
      <div id="creatorPanel" class="panel" style="display:block;">
        ${document.getElementById('creatorPanel').innerHTML}
      </div>
    `;
    creatorOverlayEl.appendChild(modal);
    document.body.appendChild(creatorOverlayEl);
    document.getElementById('creatorCloseBtn').onclick = closeCreatorModal;
  }
  creatorOverlayEl.style.display = 'flex';
  
  // Re-attach all event listeners to the cloned elements in the modal
  setTimeout(() => {
    const modalCreatureCanvas = document.querySelector('.creator-modal #creatureCanvas');
    const modalCreatureCtx = modalCreatureCanvas ? modalCreatureCanvas.getContext('2d') : null;
    const modalClearBtn = document.querySelector('.creator-modal #clearCreatureCanvasBtn');
    const modalImageUpload = document.querySelector('.creator-modal #creatureImageUpload');
    const modalStartRecording = document.querySelector('.creator-modal #startRecordingBtn');
    const modalStopRecording = document.querySelector('.creator-modal #stopRecordingBtn');
    const modalRecordingStatus = document.querySelector('.creator-modal #recordingStatus');
    const modalCreateBtn = document.querySelector('.creator-modal #createCreatureTypeBtn');
    const modalNameInput = document.querySelector('.creator-modal #creatureNameInput');
    const modalDietSelect = document.querySelector('.creator-modal #creatureDietSelect');
    const modalSizeInput = document.querySelector('.creator-modal #creatureSizeInput');
    const modalSpeedInput = document.querySelector('.creator-modal #creatureSpeedInput');
    
    if (!modalCreatureCanvas || !modalCreatureCtx) {
      console.error('Modal canvas not found');
      return;
    }
    
    // Initialize canvas
    modalCreatureCtx.clearRect(0, 0, modalCreatureCanvas.width, modalCreatureCanvas.height);
    modalCreatureCtx.strokeStyle = '#ffffff';
    modalCreatureCtx.lineWidth = 4;
    modalCreatureCtx.lineCap = 'round';
    modalCreatureCanvas.style.cursor = 'crosshair';
    modalCreatureCanvas.classList.remove('has-image');
    
    let modalDrawing = false;
    let modalImageLoaded = false;
    let modalSoundDataUrl = null;
    let modalMediaRecorder = null;
    let modalRecordedChunks = [];
    
    // Mouse events for drawing
    modalCreatureCanvas.addEventListener('mousedown', (e) => {
      if (modalImageLoaded) return;
      modalDrawing = true;
      modalCreatureCtx.beginPath();
      const rect = modalCreatureCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      modalCreatureCtx.moveTo(x, y);
    });
    
    modalCreatureCanvas.addEventListener('mousemove', (e) => {
      if (modalImageLoaded || !modalDrawing) return;
      const rect = modalCreatureCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      modalCreatureCtx.lineTo(x, y);
      modalCreatureCtx.stroke();
    });
    
    modalCreatureCanvas.addEventListener('mouseup', () => {
      modalDrawing = false;
    });
    
    modalCreatureCanvas.addEventListener('mouseleave', () => {
      if (modalImageLoaded) return;
      modalDrawing = false;
    });
    
    // Clear button
    if (modalClearBtn) {
      modalClearBtn.onclick = () => {
        modalCreatureCtx.clearRect(0, 0, modalCreatureCanvas.width, modalCreatureCanvas.height);
        modalCreatureCtx.strokeStyle = '#ffffff';
        modalCreatureCtx.lineWidth = 4;
        modalCreatureCtx.lineCap = 'round';
        modalImageLoaded = false;
        modalCreatureCanvas.style.cursor = 'crosshair';
        modalCreatureCanvas.classList.remove('has-image');
      };
    }
    
    // Image upload
    if (modalImageUpload) {
      modalImageUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
            // Clear and prepare canvas
            modalCreatureCtx.clearRect(0, 0, modalCreatureCanvas.width, modalCreatureCanvas.height);
            modalCreatureCtx.strokeStyle = '#ffffff';
            modalCreatureCtx.lineWidth = 4;
            modalCreatureCtx.lineCap = 'round';
            
            // Draw image scaled to fit
            const scale = Math.min(
              modalCreatureCanvas.width / img.width,
              modalCreatureCanvas.height / img.height
            );
            const w = img.width * scale;
            const h = img.height * scale;
            const x = (modalCreatureCanvas.width - w) / 2;
            const y = (modalCreatureCanvas.height - h) / 2;
            modalCreatureCtx.drawImage(img, x, y, w, h);
            
            modalImageLoaded = true;
            modalCreatureCanvas.style.cursor = 'default';
            modalCreatureCanvas.classList.add('has-image');
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      });
    }
    
    // Recording
    if (modalStartRecording) {
      modalStartRecording.onclick = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          modalMediaRecorder = new MediaRecorder(stream);
          modalRecordedChunks = [];
          
          modalMediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) modalRecordedChunks.push(e.data);
          };
          
          modalMediaRecorder.onstop = () => {
            const blob = new Blob(modalRecordedChunks, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.onloadend = () => {
              modalSoundDataUrl = reader.result;
              if (modalRecordingStatus) modalRecordingStatus.textContent = 'Sound recorded';
            };
            reader.readAsDataURL(blob);
          };
          
          modalMediaRecorder.start();
          const MAX_MS = 5000;
          setTimeout(() => {
            if (modalMediaRecorder && modalMediaRecorder.state === 'recording') {
              modalMediaRecorder.stop();
            }
          }, MAX_MS);
          
          modalStartRecording.disabled = true;
          if (modalStopRecording) modalStopRecording.disabled = false;
          if (modalRecordingStatus) modalRecordingStatus.textContent = 'Recording...';
        } catch (err) {
          console.error(err);
          showNotification('Could not start recording. Check microphone permissions.', 'error');
        }
      };
    }
    
    if (modalStopRecording) {
      modalStopRecording.onclick = () => {
        if (modalMediaRecorder && modalMediaRecorder.state === 'recording') {
          modalMediaRecorder.stop();
        }
        if (modalStartRecording) modalStartRecording.disabled = false;
        modalStopRecording.disabled = true;
      };
    }
    
    // Create species button
    if (modalCreateBtn) {
      modalCreateBtn.onclick = () => {
        if (!currentWorld) {
          showNotification('Join a world first.', 'error');
          return;
        }
        const name = modalNameInput ? modalNameInput.value.trim() || 'Unnamed Species' : 'Unnamed Species';
        const diet = modalDietSelect ? modalDietSelect.value : 'omnivore';
        const size = modalSizeInput ? parseFloat(modalSizeInput.value) || 1 : 1;
        const speed = modalSpeedInput ? parseFloat(modalSpeedInput.value) || 1 : 1;
        
        const imageDataUrl = modalCreatureCanvas.toDataURL('image/png');
        socket.emit('createCreatureType', {
          worldId: currentWorld.id,
          creatureType: {
            name,
            diet,
            size,
            speed,
            imageDataUrl,
            soundDataUrl: modalSoundDataUrl
          }
        });
        showNotification('Species "' + name + '" created!', 'success');
        closeCreatorModal();
      };
    }
  }, 50);
}

function closeCreatorModal() {
  if (creatorOverlayEl) creatorOverlayEl.style.display = 'none';
}

// camera controls
zoomInBtn.onclick = () => {
  if (!gameCanvas) return;
  const rect = gameCanvas.getBoundingClientRect();
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  zoomAt(centerX, centerY, 1.2);
};
zoomOutBtn.onclick = () => {
  if (!gameCanvas) return;
  const rect = gameCanvas.getBoundingClientRect();
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  zoomAt(centerX, centerY, 1 / 1.2);
};
resetCameraBtn.onclick = () => {
  cameraX = 0;
  cameraY = 0;
  cameraZoom = 1;
  clampZoom();
  clampCamera();
};

function zoomAt(clientX, clientY, factor) {
  if (!gameCanvas) return;
  const rect = gameCanvas.getBoundingClientRect();
  const mouseX = clientX;
  const mouseY = clientY;
  // World coords before zoom
  const worldX = mouseX / cameraZoom + cameraX;
  const worldY = mouseY / cameraZoom + cameraY;

  // Apply factor and clamp
  cameraZoom = cameraZoom * factor;
  clampZoom();

  // Adjust camera so the same world point remains under the mouse
  cameraX = worldX - (mouseX / cameraZoom);
  cameraY = worldY - (mouseY / cameraZoom);
  clampCamera();
}

// Pause and speed controls
if (pauseBtn) {
  pauseBtn.onclick = () => {
    isPaused = !isPaused;
    pauseBtn.textContent = isPaused ? '▶️ Resume' : '⏸️ Pause';
    if (isPaused) {
      try { lastSpeed = speedSelect.value || lastSpeed; } catch (e) {}
      if (speedSelect) {
        speedSelect.value = '0';
        speedSelect.disabled = true;
      }
    } else {
      if (speedSelect) {
        speedSelect.disabled = false;
        speedSelect.value = lastSpeed || '1';
        gameSpeed = parseFloat(speedSelect.value) || 1;
      }
    }
  };
}

if (speedSelect) {
  speedSelect.addEventListener('change', () => {
    const val = speedSelect.value;
    if (val === '0') {
      isPaused = true;
      pauseBtn.textContent = '▶️ Resume';
      speedSelect.disabled = true;
    } else {
      isPaused = false;
      pauseBtn.textContent = '⏸️ Pause';
      speedSelect.disabled = false;
      gameSpeed = parseFloat(val) || 1;
      lastSpeed = val;
    }
  });
}

// view modes
function setView(mode) {
  viewMode = mode;
  [viewBiomeBtn, viewFoodBtn, viewTempBtn].forEach(b => b.classList.remove('active'));
  if (mode === 'biome') viewBiomeBtn.classList.add('active');
  if (mode === 'food') viewFoodBtn.classList.add('active');
  if (mode === 'temp') viewTempBtn.classList.add('active');
}
viewBiomeBtn.onclick = () => setView('biome');
viewFoodBtn.onclick = () => setView('food');
viewTempBtn.onclick = () => setView('temp');
setView('biome');

// --- game canvas interaction ---

let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
let mouseCanvasX = 0;
let mouseCanvasY = 0;

gameCanvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) { // left click
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    isDragging = true;
  }
});

gameCanvas.addEventListener('mousemove', (e) => {
  if (isDragging) {
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    cameraX -= dx / cameraZoom;
    cameraY -= dy / cameraZoom;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    clampCamera();
  }
  
  if (!currentWorld) return;
  const rect = gameCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  // track mouse position relative to canvas for zoom buttons
  mouseCanvasX = x;
  mouseCanvasY = y;
  const tileX = Math.floor((x / cameraZoom + cameraX) / (gameCanvas.width / worldSize));
  const tileY = Math.floor((y / cameraZoom + cameraY) / (gameCanvas.height / worldSize));
  updateTileInfo(tileX, tileY, true);
});

gameCanvas.addEventListener('mouseup', () => {
  isDragging = false;
});

gameCanvas.addEventListener('mouseleave', () => {
  isDragging = false;
});

gameCanvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (!currentWorld) return;
  
  const rect = gameCanvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  
  // Get world coords at mouse position before zoom
  const worldX = mouseX / cameraZoom + cameraX;
  const worldY = mouseY / cameraZoom + cameraY;
  
  // Update zoom
  const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
  cameraZoom = cameraZoom * zoomDelta;
  clampZoom();

  // Adjust camera to keep the world coords at mouse position
  cameraX = worldX - (mouseX / cameraZoom);
  cameraY = worldY - (mouseY / cameraZoom);
  clampCamera();
});

gameCanvas.addEventListener('click', (e) => {
  if (!currentWorld) return;
  const rect = gameCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  // Convert screen coordinates to world coordinates
  const worldX = (x / cameraZoom + cameraX) / (gameCanvas.width / worldSize);
  const worldY = (y / cameraZoom + cameraY) / (gameCanvas.height / worldSize);
  
  const tileX = Math.floor(worldX);
  const tileY = Math.floor(worldY);

  // Check if clicking on a creature first
  let clickedCreature = null;
  for (const c of creatures) {
    const type = creatureTypes[c.typeId];
    if (!type) continue;
    const dx = worldX - c.x;
    const dy = worldY - c.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clickRadius = (type.size || 1) * 0.15; // Adjust click hitbox
    
    if (dist < clickRadius) {
      clickedCreature = c;
      break;
    }
  }
  
  if (clickedCreature) {
    selectedCreature = clickedCreature;
    updateCreatureInfo(clickedCreature);
    drawFamilyTree(clickedCreature);
    drawWorld(); // Redraw to show selection highlight
    return;
  }

  // Enforce world border - don't allow interactions outside world bounds
  if (tileX < 0 || tileY < 0 || tileX >= worldSize || tileY >= worldSize) {
    showNotification('Cannot interact outside world border!', 'warning', 2000);
    return;
  }

  if (currentPower) {
    socket.emit('usePower', {
      worldId: currentWorld.id,
      powerId: currentPower,
      payload: { x: tileX, y: tileY, radius: 3 }
    }, (res) => {
      if (!res.ok) showNotification(res.error, 'error');
    });
    return;
  }

  // Removed spawn creature functionality
  updateTileInfo(tileX, tileY);
});

function updateTileInfo(tx, ty, hoverOnly) {
  if (!currentWorld || !currentWorld.tiles) return;
  if (tx < 0 || ty < 0 || tx >= worldSize || ty >= worldSize) return;
  const tile = currentWorld.tiles[ty][tx];
  if (!tile) return;
  
  const vegText = tile.vegetation ? `<br>Vegetation: ${tile.vegetation}` : '';
  
  const text = `Tile (${tx}, ${ty})<br>
    Biome: ${tile.biome}${vegText}<br>
    Height: ${tile.h.toFixed(2)}<br>
    Food: ${tile.food !== undefined ? tile.food.toFixed(2) : '0'}<br>
    Temp: ${tile.temp !== undefined ? tile.temp.toFixed(1) : 'n/a'}°C<br>
    Moisture: ${tile.moist !== undefined ? tile.moist.toFixed(2) : 'n/a'}`;
  tileInfoEl.innerHTML = text;
}

function updateCreatureInfo(creature) {
  const creatureInfoEl = document.getElementById('creatureInfo');
  if (!creatureInfoEl || !creature) {
    if (creatureInfoEl) creatureInfoEl.innerHTML = '<p class="hint">Click on a creature to view its stats</p>';
    return;
  }
  
  const type = creatureTypes[creature.typeId];
  if (!type) return;
  
  const parent1 = creatures.find(c => c.id === creature.parentId);
  const parent2 = creatures.find(c => c.id === creature.parent2Id);
  const parent1Type = parent1 ? creatureTypes[parent1.typeId] : null;
  const parent2Type = parent2 ? creatureTypes[parent2.typeId] : null;
  
  const parentText = parent1Type && parent2Type 
    ? `<br><strong>Parents:</strong> ${parent1Type.name} × ${parent2Type.name}`
    : parent1Type 
    ? `<br><strong>Parent:</strong> ${parent1Type.name}`
    : '';
  
  const healthPercent = ((creature.health || 100) / 100 * 100).toFixed(0);
  const hungerPercent = (Math.max(0, Math.min(1, creature.hunger)) * 100).toFixed(0);
  
  creatureInfoEl.innerHTML = `
    <strong>${type.name}</strong> ${type.isHybrid ? '(Hybrid)' : ''}<br>
    <strong>Age:</strong> ${Math.floor(creature.age || 0)}<br>
    <strong>Generation:</strong> ${creature.generation || 0}<br>
    <strong>Health:</strong> ${healthPercent}%<br>
    <strong>Hunger:</strong> ${hungerPercent}%<br>
    <strong>Size:</strong> ${(type.size || 1).toFixed(1)}<br>
    <strong>Speed:</strong> ${(type.speed || 1).toFixed(1)}<br>
    <strong>Diet:</strong> ${type.diet || 'herbivore'}${parentText}
  `;
}

function drawFamilyTree(creature) {
  const canvas = document.getElementById('familyTreeCanvas');
  const emptyMsg = document.getElementById('familyTreeEmpty');
  if (!canvas || !creature) {
    if (canvas) canvas.style.display = 'none';
    if (emptyMsg) emptyMsg.style.display = 'block';
    return;
  }
  
  canvas.style.display = 'block';
  if (emptyMsg) emptyMsg.style.display = 'none';
  
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Build family tree structure
  const tree = buildFamilyTree(creature, 3); // 3 generations
  
  // Draw tree
  ctx.fillStyle = '#f9fafb';
  ctx.font = '10px Inter, sans-serif';
  ctx.textAlign = 'center';
  
  drawTreeNode(ctx, tree, canvas.width / 2, 20, 0, creature.id);
}

function buildFamilyTree(creature, depth) {
  if (!creature || depth <= 0) return null;
  
  const type = creatureTypes[creature.typeId];
  const parent1 = creatures.find(c => c.id === creature.parentId);
  const parent2 = creatures.find(c => c.id === creature.parent2Id);
  
  return {
    creature,
    type,
    left: parent1 ? buildFamilyTree(parent1, depth - 1) : null,
    right: parent2 ? buildFamilyTree(parent2, depth - 1) : null
  };
}

function drawTreeNode(ctx, node, x, y, level, selectedId) {
  if (!node) return;
  
  const nodeSize = 16;
  const vertSpacing = 50;
  const horzSpacing = Math.max(30, 80 - level * 15);
  
  // Draw lines to parents
  if (node.left) {
    const leftX = x - horzSpacing;
    const leftY = y + vertSpacing;
    ctx.strokeStyle = '#4b5563';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + nodeSize/2);
    ctx.lineTo(leftX, leftY - nodeSize/2);
    ctx.stroke();
    drawTreeNode(ctx, node.left, leftX, leftY, level + 1, selectedId);
  }
  
  if (node.right) {
    const rightX = x + horzSpacing;
    const rightY = y + vertSpacing;
    ctx.strokeStyle = '#4b5563';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + nodeSize/2);
    ctx.lineTo(rightX, rightY - nodeSize/2);
    ctx.stroke();
    drawTreeNode(ctx, node.right, rightX, rightY, level + 1, selectedId);
  }
  
  // Draw node
  const isSelected = node.creature.id === selectedId;
  ctx.fillStyle = isSelected ? '#fbbf24' : (node.type && node.type.isHybrid ? '#a855f7' : '#6366f1');
  ctx.beginPath();
  ctx.arc(x, y, nodeSize/2, 0, Math.PI * 2);
  ctx.fill();
  
  if (isSelected) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  
  // Draw label
  const label = node.type ? node.type.name.substring(0, 10) : '?';
  ctx.fillStyle = '#f9fafb';
  ctx.fillText(label, x, y + nodeSize/2 + 12);
}

// --- rendering ---

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function colorFromTemp(temp) {
  const tNorm = clamp01((temp - 0) / 40);
  const r = lerp(0, 255, tNorm);
  const g = lerp(0, 128, 1 - Math.abs(tNorm - 0.5) * 2);
  const b = lerp(255, 0, tNorm);
  return `rgb(${r|0},${g|0},${b|0})`;
}

function colorFromFood(food) {
  const f = clamp01((food || 0) / 30);
  const r = lerp(30, 10, f);
  const g = lerp(20, 255, f);
  const b = lerp(30, 20, f);
  return `rgb(${r|0},${g|0},${b|0})`;
}

function drawWorld() {
  if (!currentWorld || !currentWorld.tiles) return;
  const tiles = currentWorld.tiles;
  const size = currentWorld.size;
  const tileW = gameCanvas.width / size;
  const tileH = gameCanvas.height / size;

  gameCtx.save();
  gameCtx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
  
  // Apply camera transformations
  gameCtx.scale(cameraZoom, cameraZoom);
  gameCtx.translate(-cameraX, -cameraY);

  // Calculate visible tile range (with extra buffer for infinite ocean)
  const startX = Math.floor(cameraX / tileW) - 10;
  const endX = Math.ceil((cameraX + gameCanvas.width / cameraZoom) / tileW) + 10;
  const startY = Math.floor(cameraY / tileH) - 10;
  const endY = Math.ceil((cameraY + gameCanvas.height / cameraZoom) / tileH) + 10;

  // Draw infinite ocean background beyond world bounds
  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const isOutOfBounds = x < 0 || y < 0 || x >= size || y >= size;
      
      if (isOutOfBounds) {
        // Draw ocean for out-of-bounds tiles with slight overlap to prevent gaps
        gameCtx.fillStyle = '#1e3a8a';
        gameCtx.fillRect(x * tileW, y * tileH, tileW + 0.5, tileH + 0.5);
      } else {
        // Draw normal tile with slight overlap to prevent sub-pixel gaps
        const tile = tiles[y][x];
        let color = '#000033';
        if (viewMode === 'biome') {
          if (tile.biome === 'water') color = '#1e3a8a';
          else if (tile.biome === 'beach') color = '#e7d4a8';
          else if (tile.biome === 'grass') color = '#65a30d';
          else if (tile.biome === 'forest') color = '#15803d';
          else if (tile.biome === 'mountain') color = '#78716c';
        } else if (viewMode === 'food') {
          color = colorFromFood(tile.food);
        } else if (viewMode === 'temp') {
          color = colorFromTemp(tile.temp || tile.tempBase || 0);
        }
        gameCtx.fillStyle = color;
        gameCtx.fillRect(x * tileW, y * tileH, tileW + 0.5, tileH + 0.5);
      }
    }
  }

  // Draw vegetation only for in-bounds tiles
  if (viewMode === 'biome') {
    for (let y = Math.max(0, startY); y < Math.min(size, endY); y++) {
      for (let x = Math.max(0, startX); x < Math.min(size, endX); x++) {
        const tile = tiles[y][x];
        if (!tile.vegetation) continue;
        
        const cx = x * tileW + tileW / 2;
        const cy = y * tileH + tileH / 2;
        
        if (tile.vegetation === 'tree') {
          // Draw tree
          gameCtx.fillStyle = '#422006';
          gameCtx.fillRect(cx - tileW * 0.1, cy - tileH * 0.1, tileW * 0.2, tileH * 0.3);
          gameCtx.fillStyle = '#166534';
          gameCtx.beginPath();
          gameCtx.arc(cx, cy - tileH * 0.15, tileW * 0.3, 0, Math.PI * 2);
          gameCtx.fill();
        } else if (tile.vegetation === 'bush') {
          // Draw bush
          gameCtx.fillStyle = '#22c55e';
          gameCtx.beginPath();
          gameCtx.arc(cx, cy, tileW * 0.2, 0, Math.PI * 2);
          gameCtx.fill();
        } else if (tile.vegetation === 'rock') {
          // Draw rock
          gameCtx.fillStyle = '#57534e';
          gameCtx.fillRect(cx - tileW * 0.15, cy - tileH * 0.15, tileW * 0.3, tileH * 0.3);
        }
      }
    }
  }

  if (settings.showGrid && !settings.reduceEffects) {
    gameCtx.strokeStyle = 'rgba(15,23,42,0.35)';
    gameCtx.lineWidth = 0.5 / cameraZoom; // Adjust for zoom so grid stays thin
    gameCtx.beginPath();
    for (let x = 0; x <= size; x += 1) {
      const gx = x * tileW;
      gameCtx.moveTo(gx, 0);
      gameCtx.lineTo(gx, size * tileH);
    }
    for (let y = 0; y <= size; y += 1) {
      const gy = y * tileH;
      gameCtx.moveTo(0, gy);
      gameCtx.lineTo(size * tileW, gy);
    }
    gameCtx.stroke();
  }

  // Draw world border
  gameCtx.strokeStyle = 'rgba(255, 100, 100, 0.6)';
  gameCtx.lineWidth = 3 / cameraZoom; // Adjust for zoom
  gameCtx.strokeRect(0, 0, size * tileW, size * tileH);

  for (const civ of civilizations) {
    const cx = civ.x * (gameCanvas.width / size);
    const cy = civ.y * (gameCanvas.height / size);
    const techNorm = clamp01((civ.techLevel - 1) / 9);
    const r = lerp(200, 255, techNorm);
    const g = lerp(180, 230, techNorm);
    const b = lerp(80, 255, techNorm);
    const s = 10 + techNorm * 10;
    gameCtx.fillStyle = `rgba(${r|0},${g|0},${b|0},0.9)`;
    gameCtx.fillRect(cx - s/2, cy - s/2, s, s);
  }

  for (const c of creatures) {
    const type = creatureTypes[c.typeId];
    if (!type) continue;
    const cx = c.x * (gameCanvas.width / size);
    const cy = c.y * (gameCanvas.height / size);
    const baseSize = (type.size || 1) * 8;
    const drawSize = settings.reduceEffects ? baseSize : baseSize + Math.sin(performance.now() / 300 + (c.id && c.id.toString().length)) * 0.5;

    // Calculate rotation based on velocity
    const vx = c.vx || 0;
    const vy = c.vy || 0;
    const rotation = Math.atan2(vy, vx);
    const hasVelocity = Math.abs(vx) > 0.001 || Math.abs(vy) > 0.001;

    gameCtx.save();
    gameCtx.translate(cx, cy);
    if (hasVelocity) {
      gameCtx.rotate(rotation);
    }

    if (!type._imageObj) {
      const img = new Image();
      if (type.imageDataUrl) {
        img.src = type.imageDataUrl;
        img.onerror = () => {
          console.warn('Failed to load creature image for', type.name);
        };
      }
      type._imageObj = img;
    }
    const img = type._imageObj;
    if (img.complete && type.imageDataUrl) {
      gameCtx.drawImage(img, -drawSize/2, -drawSize/2, drawSize, drawSize);
    } else {
      // Default circle if no image
      gameCtx.fillStyle = type.isHybrid ? '#a855f7' : '#f97316';
      gameCtx.beginPath();
      gameCtx.arc(0, 0, drawSize/2, 0, Math.PI * 2);
      gameCtx.fill();
      
      // Direction indicator
      if (hasVelocity) {
        gameCtx.fillStyle = '#fff';
        gameCtx.beginPath();
        gameCtx.arc(drawSize/3, 0, drawSize/6, 0, Math.PI * 2);
        gameCtx.fill();
      }
    }
    
    // Draw selection highlight if selected
    if (selectedCreature && selectedCreature.id === c.id) {
      gameCtx.strokeStyle = '#fbbf24';
      gameCtx.lineWidth = 2 / cameraZoom;
      gameCtx.beginPath();
      gameCtx.arc(0, 0, drawSize/2 + 3, 0, Math.PI * 2);
      gameCtx.stroke();
    }

    gameCtx.restore();
  }

  gameCtx.restore();
  maybePlayCreatureSounds();
}

function maybePlayCreatureSounds() {
  if (settings.mute || settings.masterVolume <= 0 || settings.creatureVolume <= 0) return;
  const now = performance.now();
  const baseChance = settings.reduceEffects ? 0.001 : 0.002;
  for (const typeId of Object.keys(creatureTypes)) {
    const type = creatureTypes[typeId];
    if (!type.soundDataUrl) continue;
    if (Math.random() > baseChance) continue;
    const lastTime = speciesLastSoundTime[typeId] || 0;
    if (now - lastTime < 2000) continue;
    let audio = speciesSoundCache[typeId];
    if (!audio) {
      audio = new Audio(type.soundDataUrl);
      speciesSoundCache[typeId] = audio;
    }
    audio.volume = settings.masterVolume * settings.creatureVolume;
    audio.currentTime = 0;
    audio.play().catch(() => {});
    speciesLastSoundTime[typeId] = now;
  }
}

function loop() {
  drawWorld();
  updateCreatureCount();
  requestAnimationFrame(loop);
}
loop();

function updateCreatureCount() {
  if (creatureCountLabel && creatures) {
    creatureCountLabel.textContent = `🦎 ${creatures.length}`;
  }
}

// --- socket events ---

socket.on('creatureTypeCreated', (data) => {
  const type = data.type;
  creatureTypes[type.id] = type;
  rebuildSpeciesList();
  
  // Generate hybrid image if needed
  if (data.needsHybridImage && data.parent1 && data.parent2) {
    generateHybridImage(data.parent1, data.parent2, data.type);
  }
});

socket.on('creatureSpawned', (data) => {
  creatures.push(data.creature);
  updateCreatureCount();
  // Update spawned count if type info provided
  if (data.type && creatureTypes[data.type.id]) {
    creatureTypes[data.type.id].spawned = data.type.spawned;
    rebuildSpeciesList();
  }
});

socket.on('worldUpdate', (data) => {
  creatures = data.creatures || creatures;
  civilizations = data.civilizations || civilizations;
  updateCreatureCount();
  
  // Update selected creature if it still exists
  if (selectedCreature) {
    const stillExists = creatures.find(c => c.id === selectedCreature.id);
    if (stillExists) {
      selectedCreature = stillExists;
      updateCreatureInfo(stillExists);
    } else {
      selectedCreature = null;
      updateCreatureInfo(null);
      const canvas = document.getElementById('familyTreeCanvas');
      const emptyMsg = document.getElementById('familyTreeEmpty');
      if (canvas) canvas.style.display = 'none';
      if (emptyMsg) emptyMsg.style.display = 'block';
    }
  }
});

socket.on('tilesUpdated', (data) => {
  const updates = data.updates || [];
  if (!currentWorld || !currentWorld.tiles) return;
  for (const u of updates) {
    if (u.y >= 0 && u.y < currentWorld.size && u.x >= 0 && u.x < currentWorld.size) {
      currentWorld.tiles[u.y][u.x] = u.tile;
    }
  }
});

socket.on('playerUpdate', (data) => {
  currentPlayer = data.player;
  updateTopBar();
});

socket.on('playersListUpdated', (data) => {
  const players = data.players || [];
  renderPlayersList(players);
});

function renderPlayersList(players) {
  if (!playersListEl) return;
  playersListEl.innerHTML = '';
  
  if (players.length === 0) {
    playersListEl.innerHTML = '<li style="color: var(--text-muted);">No players in world</li>';
    return;
  }
  
  // Deduplicate players by ID in case of duplicates from server
  const seen = new Set();
  const uniquePlayers = players.filter(p => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
  
  uniquePlayers.forEach(p => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="player-name">${p.name}</span>
      <span class="player-status">Lvl ${p.level}</span>
    `;
    playersListEl.appendChild(li);
  });
}

function updateTopBar() {
  if (!currentWorld || !currentPlayer) return;
  worldLabel.textContent = `World: ${currentWorld.name} (${currentWorld.id.slice(0, 8)})`;
  playerLabel.textContent = `Player: ${currentPlayer.name}`;
  xpLabel.textContent = `XP: ${currentPlayer.xp} | Level: ${currentPlayer.level}`;
  levelLabel.textContent = `Powers: ${currentPlayer.unlockedPowers ? currentPlayer.unlockedPowers.join(', ') : 'none'}`;

  const powers = currentPlayer.unlockedPowers || [];
  powerTerraformBtn.disabled = !powers.includes('terraformSmall');
  powerFertilityBtn.disabled = !powers.includes('fertilityBoost');
  powerRainBtn.disabled = !powers.includes('rainstorm');
  powerHeatwaveBtn.disabled = !powers.includes('heatwave');
}
  // Wire up copy-join-code button to copy the current world id
  if (copyJoinCodeBtn) {
    copyJoinCodeBtn.disabled = false;
    copyJoinCodeBtn.onclick = async () => {
      try {
        const id = currentWorld && currentWorld.id ? currentWorld.id : '';
        if (!id) throw new Error('No world id available');
        await navigator.clipboard.writeText(id);
        showNotification('Join code copied to clipboard.', 'success');
      } catch (err) {
        showNotification('Failed to copy join code: ' + (err.message || err), 'error');
      }
    };
  }
