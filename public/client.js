const socket = io();

let currentWorld = null;
let currentPlayer = null;
let creatureTypes = {};
let creatures = [];
let civilizations = [];
let selectedSpeciesId = null;
let currentPower = null;
let worldSize = 64;
let viewMode = 'biome';

// Camera controls
let cameraX = 0;
let cameraY = 0;
let cameraZoom = 1;

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

const toolbarCreatorBtn = document.getElementById('toolbarCreatorBtn');
const creatorPanel = document.getElementById('creatorPanel');

const tileInfoEl = document.getElementById('tileInfo');
const creatureCountLabel = document.getElementById('creatureCountLabel');
const pauseBtn = document.getElementById('pauseBtn');
const speedSelect = document.getElementById('speedSelect');

// Game state
let isPaused = false;
let gameSpeed = 1;

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
  const ctx = worldPreviewCanvas.getContext('2d');
  const size = preview.size || 64;
  const cell = Math.floor(worldPreviewCanvas.width / size);
  ctx.clearRect(0, 0, worldPreviewCanvas.width, worldPreviewCanvas.height);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = preview.colors[y * size + x] || '#000';
      ctx.fillStyle = c;
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
}

refreshWorldsBtn.onclick = loadWorldsList;

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
    cameraZoom = Math.max(0.25, Math.min(6, cameraZoom * factor));
  }
  // center on world
  const tileW = gameCanvas.width / size;
  const worldCenterX = (size / 2) * tileW;
  const worldCenterY = (size / 2) * (gameCanvas.height / size);
  cameraX = worldCenterX - (gameCanvas.width / (2 * cameraZoom));
  cameraY = worldCenterY - (gameCanvas.height / (2 * cameraZoom));
}

window.addEventListener('resize', () => {
  if (gameEl && gameEl.classList.contains('visible')) {
    resizeGameCanvas();
    // keep view consistent
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
  // Clear with transparent background
  creatureCtx.clearRect(0, 0, creatureCanvas.width, creatureCanvas.height);
  creatureCtx.strokeStyle = '#ffffff';
  creatureCtx.lineWidth = 4;
  creatureCtx.lineCap = 'round';
}

let drawing = false;
creatureCanvas.addEventListener('mousedown', (e) => {
  drawing = true;
  creatureCtx.beginPath();
  const rect = creatureCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  creatureCtx.moveTo(x, y);
});
creatureCanvas.addEventListener('mousemove', (e) => {
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
  drawing = false;
});

clearCreatureCanvasBtn.onclick = () => initCreatureCanvas();

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
      creatureCtx.drawImage(img, x, y, w, h);
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

function rebuildSpeciesList() {
  speciesListEl.innerHTML = '';
  Object.values(creatureTypes).forEach(type => {
    const li = document.createElement('li');
    li.textContent = type.name + ' [' + (type.diet || '?') + ']';
    li.onclick = () => {
      selectedSpeciesId = type.id;
      Array.from(speciesListEl.children).forEach(c => c.classList.remove('selected'));
      li.classList.add('selected');
    };
    speciesListEl.appendChild(li);
  });
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
  cameraZoom = Math.max(0.25, Math.min(6, cameraZoom * factor));

  // Adjust camera so the same world point remains under the mouse
  cameraX = worldX - (mouseX / cameraZoom);
  cameraY = worldY - (mouseY / cameraZoom);
}

// Pause and speed controls
if (pauseBtn) {
  pauseBtn.onclick = () => {
    isPaused = !isPaused;
    pauseBtn.textContent = isPaused ? '▶️ Resume' : '⏸️ Pause';
  };
}

if (speedSelect) {
  speedSelect.addEventListener('change', () => {
    gameSpeed = parseFloat(speedSelect.value) || 1;
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
  cameraZoom = Math.max(0.25, Math.min(6, cameraZoom * zoomDelta));
  
  // Adjust camera to keep the world coords at mouse position
  cameraX = worldX - (mouseX / cameraZoom);
  cameraY = worldY - (mouseY / cameraZoom);
});

gameCanvas.addEventListener('click', (e) => {
  if (!currentWorld) return;
  const rect = gameCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const tileX = Math.floor((x / cameraZoom + cameraX) / (gameCanvas.width / worldSize));
  const tileY = Math.floor((y / cameraZoom + cameraY) / (gameCanvas.height / worldSize));

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

  if (selectedSpeciesId) {
    socket.emit('spawnCreature', {
      worldId: currentWorld.id,
      typeId: selectedSpeciesId,
      x: tileX,
      y: tileY
    }, (res) => {
      if (!res.ok) showNotification(res.error, 'error');
    });
  }

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
        // Draw ocean for out-of-bounds tiles
        gameCtx.fillStyle = '#1e3a8a';
        gameCtx.fillRect(x * tileW, y * tileH, tileW, tileH);
      } else {
        // Draw normal tile
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
        gameCtx.fillRect(x * tileW, y * tileH, tileW, tileH);
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
    gameCtx.lineWidth = 0.5;
    gameCtx.beginPath();
    for (let x = 0; x <= size; x += 4) {
      const gx = x * tileW;
      gameCtx.moveTo(gx, 0);
      gameCtx.lineTo(gx, size * tileH);
    }
    for (let y = 0; y <= size; y += 4) {
      const gy = y * tileH;
      gameCtx.moveTo(0, gy);
      gameCtx.lineTo(size * tileW, gy);
    }
    gameCtx.stroke();
  }

  // Draw world border
  gameCtx.strokeStyle = 'rgba(255, 100, 100, 0.6)';
  gameCtx.lineWidth = 3;
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

    if (!type._imageObj) {
      const img = new Image();
      img.src = type.imageDataUrl;
      type._imageObj = img;
    }
    const img = type._imageObj;
    if (img.complete) {
      gameCtx.drawImage(img, cx - drawSize/2, cy - drawSize/2, drawSize, drawSize);
    } else {
      gameCtx.fillStyle = '#f97316';
      gameCtx.beginPath();
      gameCtx.arc(cx, cy, drawSize/2, 0, Math.PI * 2);
      gameCtx.fill();
    }
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
});

socket.on('creatureSpawned', (data) => {
  creatures.push(data.creature);
  updateCreatureCount();
});

socket.on('worldUpdate', (data) => {
  creatures = data.creatures || creatures;
  civilizations = data.civilizations || civilizations;
  updateCreatureCount();
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
