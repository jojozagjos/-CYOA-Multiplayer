/* global io */

const socket = io();

let currentLobbyId = null;
let currentPlayerId = null;
let currentPlayerName = null;
let latestLobbyState = null;
let creditsActive = false;
let myAddedTheme = null; // key of theme added by this player (if any)
const creditsShownForLobby = {};
let _creditsList = [];
let _creditsIndex = 0;
let _creditsTimer = null;
let awaitingStartAfterCredits = false; // true after client signals creditsComplete and waits for server to start

const screens = {
  intro: document.getElementById('screen-intro'),
  main: document.getElementById('screen-main-menu'),
  lobby: document.getElementById('screen-lobby'),
  game: document.getElementById('screen-game'),
  themeVote: document.getElementById('screen-theme-vote')
};

// ====================
// BLACK FADE TRANSITION SYSTEM
// ====================
const fadeOverlay = document.getElementById('fade-overlay');

let lastShownScreen = null;

function showScreen(name, forceTransition = false) {
  // Skip transition if already on this screen unless forced
  if (lastShownScreen === name && !forceTransition) {
    return;
  }
  lastShownScreen = name;

  // Black fade transition
  if (!fadeOverlay) {
    // Fallback to instant switch
    Object.entries(screens).forEach(([key, el]) => {
      if (el) el.classList.toggle('hidden', key !== name);
    });
    return;
  }

  fadeOverlay.classList.add('active');
  setTimeout(() => {
    Object.entries(screens).forEach(([key, el]) => {
      if (el) {
        if (key === name) {
          el.classList.remove('hidden');
          el.setAttribute('data-visible', 'true');
        } else {
          el.classList.add('hidden');
          el.setAttribute('data-visible', 'false');
        }
      }
    });
    setTimeout(() => fadeOverlay.classList.remove('active'), 100);
  }, 400);
}

// ====================
// SETTINGS SYSTEM
// ====================
const SETTINGS_KEY = 'cyoa_settings';
const defaultSettings = {
  volumeMaster: 70,
  volumeMusic: 50,
  volumeSFX: 60,
  volumeNarration: 80,
  // narrationRate removed — fixed narration speed
};

let settings = { ...defaultSettings };

function loadSettings() {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) settings = { ...defaultSettings, ...JSON.parse(saved) };
  } catch (e) {}
  applySettings();
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {}
}

function applySettings() {
  // Update UI sliders
  const masterSlider = document.getElementById('volume-master');
  const musicSlider = document.getElementById('volume-music');
  const sfxSlider = document.getElementById('volume-sfx');
  const narrationSlider = document.getElementById('volume-narration');

  if (masterSlider) { masterSlider.value = settings.volumeMaster; updateVolumeDisplay('master', settings.volumeMaster); }
  if (musicSlider) { musicSlider.value = settings.volumeMusic; updateVolumeDisplay('music', settings.volumeMusic); }
  if (sfxSlider) { sfxSlider.value = settings.volumeSFX; updateVolumeDisplay('sfx', settings.volumeSFX); }
  if (narrationSlider) { narrationSlider.value = settings.volumeNarration; updateVolumeDisplay('narration', settings.volumeNarration); }
  // narration rate control removed — keep fixed spoken rate

  // Apply to audio system
  updateAudioVolumes();
}

function updateVolumeDisplay(type, value) {
  const label = document.getElementById(`volume-${type}-val`) || document.getElementById(`narration-${type}-val`);
  if (label) label.textContent = `${value}%`;
}

// Settings panel handlers
const btnSettings = document.getElementById('btn-settings');
const settingsPanel = document.getElementById('settings-panel');
const btnCloseSettings = document.getElementById('btn-close-settings');

if (btnSettings) btnSettings.addEventListener('click', () => {
  if (settingsPanel) settingsPanel.classList.remove('hidden');
});

if (btnCloseSettings) btnCloseSettings.addEventListener('click', () => {
  if (settingsPanel) settingsPanel.classList.add('hidden');
});

// Settings sliders
['master', 'music', 'sfx', 'narration'].forEach(type => {
  const slider = document.getElementById(`volume-${type}`);
  if (!slider) return;
  slider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    settings[`volume${type.charAt(0).toUpperCase() + type.slice(1)}`] = val;
    updateVolumeDisplay(type, val);
    saveSettings();
    updateAudioVolumes();
  });
});
// narration-rate UI removed — no dynamic speech rate in settings

// ====================
// AUDIO SYSTEM (with real audio file support)
// ====================
let audioContext = null;
let musicGain = null;
let sfxGain = null;
let currentMusic = null;
let currentMusicAudio = null;
const sfxSounds = {};
const loadedAudio = {};

function initAudioContext() {
  if (audioContext) return;
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    musicGain = audioContext.createGain();
    sfxGain = audioContext.createGain();
    musicGain.connect(audioContext.destination);
    sfxGain.connect(audioContext.destination);
    updateAudioVolumes();
  } catch (e) {
    console.warn('Audio context not supported', e);
  }
}

function updateAudioVolumes() {
  const masterVol = (settings.volumeMaster || 70) / 100;
  const musicVol = (settings.volumeMusic || 50) / 100;
  const sfxVol = (settings.volumeSFX || 60) / 100;
  
  if (musicGain) musicGain.gain.value = masterVol * musicVol;
  if (sfxGain) sfxGain.gain.value = masterVol * sfxVol;
  
  // Update HTML5 audio volume if using real audio files
  if (currentMusicAudio) {
    currentMusicAudio.volume = masterVol * musicVol;
  }
}

// Try to load and play real audio file, fallback to procedural
function playThemeMusic(themeKey) {
  stopMusic();
  
  // Try real audio file first
  const audioFile = `audio/${themeKey}-theme.mp3`;
  const audio = new Audio();
  
  audio.addEventListener('canplaythrough', () => {
    currentMusicAudio = audio;
    audio.loop = true;
    const masterVol = (settings.volumeMaster || 70) / 100;
    const musicVol = (settings.volumeMusic || 50) / 100;
    audio.volume = masterVol * musicVol;
    audio.play().catch(() => {
      // Silently fall back to procedural music
      fallbackProceduralMusic(themeKey);
    });
  }, { once: true });
  
  audio.addEventListener('error', () => {
    // Silently fallback to procedural if file not found (expected)
    fallbackProceduralMusic(themeKey);
  }, { once: true });
  
  audio.src = audioFile;
}

function fallbackProceduralMusic(themeKey) {
  if (!audioContext) initAudioContext();
  if (!audioContext) return;

  // Theme-specific frequencies and intervals
  const themes = {
    dungeon: { base: 110, notes: [110, 146.83, 164.81, 220], interval: 4000 },
    space: { base: 82.41, notes: [82.41, 110, 130.81, 164.81], interval: 6000 },
    mansion: { base: 98, notes: [98, 123.47, 146.83, 196], interval: 5000 },
    cyber: { base: 130.81, notes: [130.81, 174.61, 196, 261.63], interval: 3000 },
    default: { base: 110, notes: [110, 130.81, 164.81, 196], interval: 4500 }
  };

  const theme = themes[themeKey] || themes.default;
  let noteIndex = 0;

  function playNote() {
    if (!audioContext) return;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = theme.notes[noteIndex % theme.notes.length];
    
    gain.gain.setValueAtTime(0, audioContext.currentTime);
    gain.gain.linearRampToValueAtTime(0.08, audioContext.currentTime + 0.5);
    gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 3);
    
    osc.connect(gain);
    gain.connect(musicGain);
    
    osc.start();
    osc.stop(audioContext.currentTime + 3);
    
    noteIndex++;
  }

  playNote();
  currentMusic = setInterval(playNote, theme.interval);
}

function stopMusic() {
  if (currentMusic) {
    clearInterval(currentMusic);
    currentMusic = null;
  }
  if (currentMusicAudio) {
    currentMusicAudio.pause();
    currentMusicAudio = null;
  }
}

function playSFX(type) {
  // Try real SFX file first
  const audioFile = `audio/${type}.mp3`;
  const audio = new Audio(audioFile);
  const masterVol = (settings.volumeMaster || 70) / 100;
  const sfxVol = (settings.volumeSFX || 60) / 100;
  audio.volume = masterVol * sfxVol;
  
  // Silently fallback to procedural if file doesn't exist
  audio.addEventListener('error', () => fallbackProceduralSFX(type), { once: true });
  audio.play().catch(() => fallbackProceduralSFX(type));
}

function fallbackProceduralSFX(type) {
  if (!audioContext) initAudioContext();
  if (!audioContext) return;

  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();

  // Different SFX types
  const sfxTypes = {
    action: { freq: 440, type: 'square', duration: 0.1 },
    success: { freq: 523.25, type: 'sine', duration: 0.2 },
    fail: { freq: 220, type: 'sawtooth', duration: 0.3 },
    notification: { freq: 659.25, type: 'sine', duration: 0.15 },
    vote: { freq: 392, type: 'triangle', duration: 0.12 },
    click: { freq: 880, type: 'sine', duration: 0.05 }
  };

  const sfx = sfxTypes[type] || sfxTypes.notification;
  
  osc.type = sfx.type;
  osc.frequency.value = sfx.freq;
  
  gain.gain.setValueAtTime(0.3, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + sfx.duration);
  
  osc.connect(gain);
  gain.connect(sfxGain);
  
  osc.start();
  osc.stop(audioContext.currentTime + sfx.duration);
}

// TTS Narration
function speakNarration(text) {
  if (!('speechSynthesis' in window)) return;
  
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();
  
  // Try to find a good narrative voice
  const preferredVoice = voices.find(v => v.name.includes('Daniel') || v.name.includes('Google UK English Male')) || voices[0];
  if (preferredVoice) utterance.voice = preferredVoice;
  
  // Fixed narration rate (user-requested removal of adjustable narration speed)
  utterance.rate = 1.0;
  utterance.volume = ((settings.volumeMaster || 70) / 100) * ((settings.volumeNarration || 80) / 100);
  utterance.pitch = 0.9;
  
  speechSynthesis.speak(utterance);
}

// ====================
// UNSPLASH BACKGROUND SYSTEM
// ====================
let currentThemeKey = null;

function loadThemeBackground(themeKey) {
  if (currentThemeKey === themeKey) return;
  currentThemeKey = themeKey;
  
  const keywords = {
    dungeon: 'dark+dungeon+castle+stone',
    space: 'space+station+sci-fi+cosmos',
    mansion: 'haunted+mansion+gothic+Victorian',
    cyber: 'cyberpunk+neon+city+night',
    default: 'fantasy+landscape+mystical'
  };
  
  const query = keywords[themeKey] || keywords.default;
  const bgDiv = document.getElementById('dynamic-bg');
  if (!bgDiv) return;
  
  // Use Unsplash Source API (no key required)
  const imageUrl = `https://source.unsplash.com/1920x1080/?${query}`;
  bgDiv.style.backgroundImage = `url(${imageUrl})`;
  bgDiv.style.opacity = '0.15';
}

// Initialize
loadSettings();

// Main menu
const inputName = document.getElementById('input-name');
const btnHost = document.getElementById('btn-host');
const btnJoin = document.getElementById('btn-join');
const joinPanel = document.getElementById('join-panel');
const inputLobbyCode = document.getElementById('input-lobby-code');
const btnJoinConfirm = document.getElementById('btn-join-confirm');

// Persist display name in browser
const SAVED_NAME_KEY = 'cyoa_display_name';
try {
  const saved = localStorage.getItem(SAVED_NAME_KEY);
  if (saved && (!inputName.value || inputName.value.trim() === '')) {
    inputName.value = saved;
  }
} catch (e) {
  // localStorage may be unavailable in some environments; ignore silently
}

// Enable/disable host & join buttons based on name presence and persist name
if (inputName) inputName.addEventListener('input', () => {
  try {
    const v = (inputName.value || '').trim();
    if (v) localStorage.setItem(SAVED_NAME_KEY, v);
    else localStorage.removeItem(SAVED_NAME_KEY);
    if (btnHost) btnHost.disabled = !v;
    if (btnJoin) btnJoin.disabled = !v;
  } catch (e) {}
});

// Initialize host/join disabled state on load
if (btnHost) btnHost.disabled = !(inputName && (inputName.value || '').trim());
if (btnJoin) btnJoin.disabled = !(inputName && (inputName.value || '').trim());

// Character drawing elements
const canvas = document.getElementById('char-canvas');
const brushColor = document.getElementById('brush-color');
const brushSize = document.getElementById('brush-size');
const btnClearCanvas = document.getElementById('btn-clear-canvas');

let isDrawing = false;
let isEraser = false;
let drawHistory = [];
let historyIndex = -1;
const MAX_HISTORY = 30;
const ctx = canvas ? canvas.getContext('2d') : null;
let BLANK_CANVAS = null;

function setupCanvas() {
  if (!canvas || !ctx) return;
  const dpr = window.devicePixelRatio || 1;
  // store CSS size
  const cssW = canvas.width;
  const cssH = canvas.height;
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.scale(dpr, dpr);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // fill background
  ctx.fillStyle = '#020610';
  ctx.fillRect(0, 0, cssW, cssH);
  try { BLANK_CANVAS = canvas.toDataURL('image/png'); } catch (e) { BLANK_CANVAS = null; }
  pushHistory();
  updateBrushPreview();
}

function pushHistory() {
  if (!canvas) return;
  try {
    const data = canvas.toDataURL('image/png');
    // if we're not at the end of history, drop future entries
    if (historyIndex < drawHistory.length - 1) drawHistory = drawHistory.slice(0, historyIndex + 1);
    drawHistory.push(data);
    if (drawHistory.length > MAX_HISTORY) drawHistory.shift();
    historyIndex = drawHistory.length - 1;
  } catch (e) {}
  try { updateExportButtonState(); } catch (e) { /* ignore until DOM inputs exist */ }
}

function restoreHistory(idx) {
  if (!drawHistory[idx]) return;
  const img = new Image();
  img.onload = () => {
    // draw to canvas (reset scale aware)
    const cssW = parseInt(canvas.style.width || canvas.width, 10);
    const cssH = parseInt(canvas.style.height || canvas.height, 10);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.drawImage(img, 0, 0, cssW, cssH);
  };
  img.src = drawHistory[idx];
}

function updateBrushPreview() {
  const preview = document.getElementById('brush-preview');
  if (!preview) return;
  preview.innerHTML = '';
  const dot = document.createElement('div');
  const raw = Math.max(1, parseInt(brushSize.value || 3, 10));
  // map slider range to preview size so mid-values show mid-size
  const minVal = Math.max(1, parseInt(brushSize.min || 1, 10));
  const maxVal = Math.max(minVal + 1, parseInt(brushSize.max || 40, 10));
  const maxDot = 24; // px maximum preview dot
  const minDot = 4; // px minimum preview dot
  const normalized = Math.min(1, Math.max(0, (raw - minVal) / (maxVal - minVal)));
  const previewSize = Math.round(minDot + normalized * (maxDot - minDot));
  dot.style.width = previewSize + 'px';
  dot.style.height = previewSize + 'px';
  dot.style.borderRadius = '50%';
  dot.style.background = isEraser ? '#020610' : (brushColor.value || '#4de3d7');
  dot.style.margin = 'auto';
  dot.style.boxShadow = '0 2px 6px rgba(0,0,0,0.6)';
  preview.appendChild(dot);
}

if (canvas && ctx) {
  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return { x, y };
  }

  let lastPos = null;

  canvas.addEventListener('mousedown', (e) => {
    isDrawing = true;
    pushHistory();
    const p = getPos(e);
    lastPos = p;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  });
  window.addEventListener('mouseup', () => { if (isDrawing) { isDrawing = false; ctx.closePath(); lastPos = null; } });
  canvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    const p = getPos(e);
    ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
    ctx.strokeStyle = brushColor.value || '#4de3d7';
    ctx.lineWidth = parseInt(brushSize.value || 3, 10);
    if (isEraser) ctx.lineWidth = Math.max(8, ctx.lineWidth);
    // simple smoothing via quadratic curve
    if (lastPos) {
      ctx.beginPath();
      ctx.moveTo(lastPos.x, lastPos.y);
      ctx.quadraticCurveTo((lastPos.x + p.x) / 2, (lastPos.y + p.y) / 2, p.x, p.y);
      ctx.stroke();
    } else {
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    lastPos = p;
  });
  // touch
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); isDrawing = true; pushHistory(); const p = getPos(e); lastPos = p; ctx.beginPath(); ctx.moveTo(p.x, p.y); });
  window.addEventListener('touchend', () => { if (isDrawing) { isDrawing = false; ctx.closePath(); lastPos = null; } });
  canvas.addEventListener('touchmove', (e) => { e.preventDefault(); if (!isDrawing) return; const p = getPos(e); ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over'; ctx.strokeStyle = brushColor.value || '#4de3d7'; ctx.lineWidth = parseInt(brushSize.value || 3, 10); if (isEraser) ctx.lineWidth = Math.max(8, ctx.lineWidth); if (lastPos) { ctx.beginPath(); ctx.moveTo(lastPos.x, lastPos.y); ctx.quadraticCurveTo((lastPos.x + p.x) / 2, (lastPos.y + p.y) / 2, p.x, p.y); ctx.stroke(); } else { ctx.lineTo(p.x, p.y); ctx.stroke(); } lastPos = p; });

  btnClearCanvas.addEventListener('click', () => {
    const cssW = parseInt(canvas.style.width || canvas.width, 10);
    const cssH = parseInt(canvas.style.height || canvas.height, 10);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.fillStyle = '#020610';
      ctx.fillRect(0, 0, cssW, cssH);
    pushHistory();
    notify('Canvas cleared', 'info');
  });

  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  const btnEraser = document.getElementById('btn-eraser');

  btnUndo.addEventListener('click', () => {
    if (historyIndex > 0) {
      historyIndex -= 1;
      restoreHistory(historyIndex);
    } else {
      notify('Nothing to undo', 'warn');
    }
  });
  btnRedo.addEventListener('click', () => {
    if (historyIndex < drawHistory.length - 1) {
      historyIndex += 1;
      restoreHistory(historyIndex);
    } else {
      notify('Nothing to redo', 'warn');
    }
  });
  btnEraser.addEventListener('click', () => {
    isEraser = !isEraser;
    btnEraser.classList.toggle('active', isEraser);
    updateBrushPreview();
  });

  // Note: Save Drawing and Download buttons removed per user request.

  // gallery removed — drawings are no longer previewed/saved locally

  // brush input handlers
  brushColor.addEventListener('input', () => updateBrushPreview());
  brushSize.addEventListener('input', () => updateBrushPreview());

  // prepare canvas for HiDPI
  setupCanvas();

  window.addEventListener('resize', () => {
    // preserve drawing by pushing current to history before resize
    pushHistory();
    setupCanvas();
    // try to restore latest image
    if (historyIndex >= 0) restoreHistory(historyIndex);
  });
}

function isCanvasBlank() {
  if (!canvas) return true;
  try {
    if (!BLANK_CANVAS) return false; // can't compare, assume not blank
    const now = canvas.toDataURL('image/png');
    return now === BLANK_CANVAS;
  } catch (e) { return false; }
}

function updateExportButtonState() {
  const btn = document.getElementById('btn-export-char');
  if (!btn) return;
  const nameOk = (charNameInput.value || '').trim() !== '';
  const roleOk = (charRoleInput.value || '').trim() !== '';
  const traitOk = (charTraitInput.value || '').trim() !== '';
  const imgOk = !isCanvasBlank();
  btn.disabled = !(nameOk && roleOk && traitOk && imgOk);
  // also control the "Use Character" button
  const useBtn = document.getElementById('btn-save-char');
  if (useBtn) useBtn.disabled = !(nameOk && roleOk && traitOk && imgOk);
}

// wire up inputs to validation state
// (moved below after element declarations)

// Notification helper (non-blocking)
function notify(message, type = 'info', timeout = 3500, title = '') {
  const container = document.getElementById('notifications');
  if (!container) {
    // fallback to alert if notifications container missing
    alert(message);
    return;
  }
  const el = document.createElement('div');
  el.className = `notif ${type}`;
  if (title) {
    const t = document.createElement('div');
    t.className = 'title';
    t.textContent = title;
    el.appendChild(t);
  }
  const msg = document.createElement('div');
  msg.className = 'message';
  msg.textContent = message;
  el.appendChild(msg);

  container.appendChild(el);
  // force reflow then show
  requestAnimationFrame(() => el.classList.add('show'));

  let removed = false;
  function removeNotif(n) {
    if (removed) return; removed = true;
    n.classList.remove('show');
    setTimeout(() => { if (n.parentNode) n.parentNode.removeChild(n); }, 220);
  }
  // click-to-dismiss for convenience
  el.addEventListener('click', () => removeNotif(el));

  if (timeout > 0) setTimeout(() => removeNotif(el), timeout);
}

const lblLobbyId = document.getElementById('lbl-lobby-id');
const lblPlayerName = document.getElementById('lbl-player-name');
const listPlayers = document.getElementById('list-players');
const themeOptions = document.getElementById('theme-options');
const themeVoteSection = document.getElementById('screen-theme-vote');
const btnAddTheme = document.getElementById('btn-add-theme');
const newThemeInput = document.getElementById('new-theme-input');
const newThemeDesc = document.getElementById('new-theme-desc');
const btnThemeBack = document.getElementById('btn-theme-back');
const characterSection = document.getElementById('character-section');
const charNameInput = document.getElementById('char-name');
const charRoleInput = document.getElementById('char-role');
const charTraitInput = document.getElementById('char-trait');
const btnSaveChar = document.getElementById('btn-save-char');
const btnGoToGame = document.getElementById('btn-go-to-game');
const btnExportChar = document.getElementById('btn-export-char');
const btnImportChar = document.getElementById('btn-import-char');
const inputImportChar = document.getElementById('input-import-char');

// wire up inputs to validation state
[charNameInput, charRoleInput, charTraitInput].forEach(inp => {
  if (!inp) return;
  inp.addEventListener('input', () => updateExportButtonState());
});

// initialize export button state
updateExportButtonState();

// Game elements
// story log removed from DOM; we'll animate lines into `#narration-text` instead
let lastStoryLogLen = 0;
const individualPanel = document.getElementById('individual-panel');
const groupProposalPanel = document.getElementById('group-proposal-panel');
const groupVotePanel = document.getElementById('group-vote-panel');
const inputAction = document.getElementById('input-action');
const inputProposal = document.getElementById('input-proposal');
const btnSendAction = document.getElementById('btn-send-action');
const btnSendProposal = document.getElementById('btn-send-proposal');
const proposalList = document.getElementById('proposal-list');
const sidebarPlayers = document.getElementById('sidebar-players');
const gamePhaseLabel = document.getElementById('game-phase-label');
const campaignIdLabel = document.getElementById('campaign-id-label');
const btnSaveGame = document.getElementById('btn-save-game');
const saveStatus = document.getElementById('save-status');

// Main menu handlers
if (btnHost) btnHost.addEventListener('click', () => {
  const name = (inputName.value || '').trim();
  if (!name) {
    notify('Please enter a display name before hosting.', 'warn');
    return;
  }
  currentPlayerName = name;
  try { localStorage.setItem(SAVED_NAME_KEY, name); } catch (e) {}
  socket.emit('createLobby', { playerName: name }, (res) => {
    if (res && res.error) {
      notify(res.error || 'Failed to create lobby', 'error');
      return;
    }
    currentLobbyId = res.lobbyId;
    currentPlayerId = res.playerId;
    updateLobbyUI(res.lobby);
    showScreen('lobby');
  });
});

if (btnJoin) btnJoin.addEventListener('click', () => {
  const name = (inputName.value || '').trim();
  if (!name) {
    notify('Please enter a display name before joining a lobby.', 'warn');
    return;
  }
  if (joinPanel) joinPanel.classList.toggle('hidden');
});

if (btnJoinConfirm) {
  // keep join confirm disabled until a code is entered
  btnJoinConfirm.disabled = true;
  btnJoinConfirm.addEventListener('click', () => {
    const name = (inputName.value || '').trim();
    const code = (inputLobbyCode.value || '').trim().toUpperCase();
    if (!code) {
      notify('Enter a lobby code.', 'warn');
      return;
    }
    if (!name) {
      notify('Please enter a display name before joining.', 'warn');
      return;
    }
    currentPlayerName = name;
    try { localStorage.setItem(SAVED_NAME_KEY, name); } catch (e) {}
    socket.emit('joinLobby', { lobbyId: code, playerName: name }, (res) => {
      if (res && res.error) {
        notify(res.error || 'Failed to join lobby', 'error');
        return;
      }
      currentLobbyId = res.lobbyId;
      currentPlayerId = res.playerId;
      updateLobbyUI(res.lobby);
      showScreen('lobby');
    });
  });

  if (inputLobbyCode) {
    inputLobbyCode.addEventListener('input', () => {
      btnJoinConfirm.disabled = !(inputLobbyCode.value || '').trim();
    });
  }
} 
// ensure initial join-confirm disabled if no code
if (btnJoinConfirm && inputLobbyCode) btnJoinConfirm.disabled = !(inputLobbyCode.value || '').trim();

// Lobby handlers
if (btnSaveChar) btnSaveChar.addEventListener('click', () => {
  if (!currentLobbyId) return;
  // validate required fields and canvas before allowing use
  const nameVal = (charNameInput.value || '').trim();
  const roleVal = (charRoleInput.value || '').trim();
  const traitVal = (charTraitInput.value || '').trim();
  if (!nameVal || !roleVal || !traitVal) {
    notify('Please fill name, role, and trait before using this character.', 'warn');
    return;
  }
  if (isCanvasBlank()) {
    notify('Please draw your character on the canvas before using it.', 'warn');
    return;
  }
  const payload = {
    name: (charNameInput.value || '').trim() || currentPlayerName || 'Hero',
    role: (charRoleInput.value || '').trim() || 'Adventurer',
    trait: (charTraitInput.value || '').trim() || 'Determined',
    image: null
  };
  // Prefer the live canvas image so exported/used character always contains the actual drawing.
  try {
    if (canvas && ctx) {
      payload.image = canvas.toDataURL('image/png');
    }
  } catch (e) {
    // ignore: if canvas capture fails, payload.image remains null
  }
  socket.emit('setCharacter', { lobbyId: currentLobbyId, character: payload });
  notify('Character applied to your player.', 'success');
});

// Export / Import character to/from a file
if (btnExportChar) {
  btnExportChar.addEventListener('click', () => {
    // Validate fields and canvas before exporting
    const nameVal = (charNameInput.value || '').trim();
    const roleVal = (charRoleInput.value || '').trim();
    const traitVal = (charTraitInput.value || '').trim();
    if (!nameVal || !roleVal || !traitVal) {
      notify('Please fill name, role, and trait before exporting.', 'warn');
      return;
    }
    if (isCanvasBlank()) {
      notify('Please draw your character before exporting.', 'warn');
      return;
    }

    const payload = {
      name: nameVal || currentPlayerName || 'Hero',
      role: roleVal || 'Adventurer',
      trait: traitVal || 'Determined',
      image: null
    };
    try {
      if (canvas && ctx) payload.image = canvas.toDataURL('image/png');
    } catch (e) {}
    // payload.image should be taken from canvas; preview removed

    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const safeName = (payload.name || 'character').replace(/[^a-z0-9-_]/gi, '_');
      a.download = `cyoa_character_${safeName}_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      notify('Character exported to file.', 'success');
    } catch (e) {
      console.error(e);
      notify('Failed to export character.', 'error');
    }
  });
}

if (btnImportChar && inputImportChar) {
  btnImportChar.addEventListener('click', () => inputImportChar.click());
  inputImportChar.addEventListener('change', (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result);
        if (!json || typeof json !== 'object') throw new Error('Invalid file');
        // populate fields
        charNameInput.value = json.name || '';
        charRoleInput.value = json.role || '';
        charTraitInput.value = json.trait || '';
        // load image into preview and canvas
            if (json.image) {
              // draw on canvas
              const im = new Image();
              im.onload = () => {
                const cssW = parseInt(canvas.style.width || canvas.width, 10);
                const cssH = parseInt(canvas.style.height || canvas.height, 10);
                ctx.clearRect(0, 0, cssW, cssH);
                ctx.drawImage(im, 0, 0, cssW, cssH);
                pushHistory();
                notify('Character image loaded into canvas.', 'success');
              };
              im.src = json.image;
            } else {
              notify('Character data loaded (no image).', 'info');
            }
      } catch (err) {
        console.error(err);
        notify('Failed to load character file. Make sure it is valid JSON.', 'error');
      }
    };
    reader.readAsText(f);
    // clear input so same file can be picked again
    inputImportChar.value = '';
  });
}

if (btnGoToGame) btnGoToGame.addEventListener('click', () => {
  if (!currentLobbyId) return;
  socket.emit('startGame', { lobbyId: currentLobbyId });
  notify('Start requested. Waiting for host to start game...', 'info');
});

// Game handlers
if (btnSendAction) btnSendAction.addEventListener('click', () => {
  const text = (inputAction.value || '').trim();
  if (!text || !currentLobbyId) return;
  socket.emit('playerAction', { lobbyId: currentLobbyId, actionText: text });
  inputAction.value = '';
  playSFX('action');
});

if (btnSendProposal) btnSendProposal.addEventListener('click', () => {
  const text = (inputProposal.value || '').trim();
  if (!text || !currentLobbyId) return;
  socket.emit('groupProposal', { lobbyId: currentLobbyId, proposalText: text });
  inputProposal.value = '';
  playSFX('action');
});

if (btnSaveGame) btnSaveGame.addEventListener('click', () => {
  if (!currentLobbyId) return;
  saveStatus.textContent = 'Saving...';
  socket.emit('saveCampaign', { lobbyId: currentLobbyId }, (res) => {
    if (res && res.ok) {
      saveStatus.textContent = `Saved! Campaign ID: ${res.campaignId}`;
      notify(`Campaign saved: ${res.campaignId}`, 'success');
    } else {
      saveStatus.textContent = 'Save failed.';
      notify(res.error || 'Save failed', 'error');
    }
  });
});

// Load campaign from main menu
const btnLoadCampaign = document.getElementById('btn-load-campaign');
const inputCampaignId = document.getElementById('input-campaign-id');
const loadStatus = document.getElementById('load-status');

if (btnLoadCampaign && inputCampaignId) {
  btnLoadCampaign.addEventListener('click', () => {
    const campaignId = (inputCampaignId.value || '').trim();
    if (!campaignId) {
      notify('Enter a Campaign ID to load.', 'warn');
      return;
    }
    loadStatus.textContent = 'Loading...';
    socket.emit('loadCampaign', { campaignId }, (res) => {
      if (res && res.ok) {
        currentLobbyId = res.lobbyId;
        currentPlayerId = socket.id;
        loadStatus.textContent = `Loaded! Lobby: ${res.lobbyId}`;
        notify(`Campaign loaded into lobby ${res.lobbyId}`, 'success');
        updateLobbyUI(res.lobby);
        showScreen('lobby');
      } else {
        loadStatus.textContent = 'Load failed.';
        notify(res.error || 'Campaign not found', 'error');
      }
    });
  });
}

// Theme screen handlers
if (btnThemeBack) btnThemeBack.addEventListener('click', () => {
  // simply return to lobby view (server still controls phase)
  showScreen('lobby');
});

if (btnAddTheme && newThemeInput) btnAddTheme.addEventListener('click', () => {
  const text = (newThemeInput.value || '').trim();
  if (!text || !currentLobbyId) return;
  if (myAddedTheme) {
    notify('You have already added a custom theme.', 'warn');
    return;
  }
  const desc = newThemeDesc ? (newThemeDesc.value || '').trim() : '';
  // sanitize key
  const key = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const payload = { lobbyId: currentLobbyId, themeKey: key, label: text, intro: desc || undefined };
  // disable add while awaiting server result
  btnAddTheme.disabled = true;
  socket.emit('addTheme', payload);
  // keep inputs until server confirms; show pending notice
  notify(`Submitting theme "${text}"...`, 'info');
});

// handle addTheme result from server
socket.on('addThemeResult', (res) => {
  if (!res) return;
  btnAddTheme.disabled = false;
  if (res.ok) {
    // server will send lobbyUpdate with the new theme; mark that we added one to prevent additional adds
    // we can't know the key here reliably, but server will include it in lobby.availableThemes; infer by matching addedById later
    myAddedTheme = true; // flag to prevent repeat; real key resolved on lobbyUpdate
    notify('Theme added.', 'success');
    // clear inputs
    if (newThemeInput) newThemeInput.value = '';
    if (newThemeDesc) newThemeDesc.value = '';
  } else {
    notify(res.error || 'Failed to add theme', 'error');
  }
});

// Socket events
socket.on('lobbyUpdate', (lobby) => {
  // detect transition into IN_PROGRESS to show credits once per lobby
  const prevPhase = latestLobbyState ? latestLobbyState.phase : null;
  latestLobbyState = lobby;
  if (prevPhase !== 'IN_PROGRESS' && lobby.phase === 'IN_PROGRESS' && !creditsShownForLobby[lobby.lobbyId]) {
    // show credits/intros for players' characters
    startCredits(lobby.players || [], lobby.lobbyId);
  }
  updateLobbyUI(lobby);
  updateGameUI(lobby);
  // track if this player added a custom theme (server includes addedById)
  try {
    if (currentPlayerId && lobby.availableThemes && Array.isArray(lobby.availableThemes)) {
      const mine = lobby.availableThemes.find(t => t.addedById && t.addedById === currentPlayerId);
      if (mine) {
        myAddedTheme = mine.key;
        if (btnAddTheme) btnAddTheme.disabled = true;
        if (newThemeInput) newThemeInput.disabled = true;
        if (newThemeDesc) newThemeDesc.disabled = true;
      }
    }
  } catch (e) {}
});

// After creditsComplete the client waits for the server to create the first situation.
// When that happens the server will emit a `lobbyUpdate` with the in-progress situation.
// This listener ensures we only start music, background and show the game after the server-confirmed start.
socket.on('lobbyUpdate', (lobby) => {
  // Avoid double-handling; we already process lobbyUpdate above, so only handle the awaiting flag here.
  if (awaitingStartAfterCredits) {
    // server should now have created the initial situation (or moved phase forward)
    if (lobby.phase === 'IN_PROGRESS') {
      // Start theme music and background now that server has started the game
      if (lobby.themeKey) {
        playThemeMusic(lobby.themeKey);
        loadThemeBackground(lobby.themeKey);
      }
      playSFX('success');
      // show the game screen and update UI
      showScreen('game');
      updateGameUI(lobby);
      awaitingStartAfterCredits = false;
    }
  }
});

function startCredits(players, lobbyId) {
  if (!players || players.length === 0) return;
  const el = document.getElementById('credits-screen');
  if (!el) return;
  // only show players that have a character object
  _creditsList = (players || []).filter(p => p && p.character).map(p => ({ player: p, character: p.character }));
  if (_creditsList.length === 0) return;
  creditsShownForLobby[lobbyId] = true;
  creditsActive = true;
  _creditsIndex = 0;
  el.classList.remove('hidden');
  el.setAttribute('aria-hidden', 'false');
  showCreditsIndex(_creditsIndex);
  // auto-advance every 5 seconds
  _creditsTimer = setInterval(() => { creditsNext(); }, 5000);
}

function endCredits() {
  const el = document.getElementById('credits-screen');
  if (el) {
    el.classList.add('hidden');
    el.setAttribute('aria-hidden', 'true');
  }
  creditsActive = false;
  if (_creditsTimer) { clearInterval(_creditsTimer); _creditsTimer = null; }
  
  // Notify server that credits are complete so game can start
  if (currentLobbyId) {
    socket.emit('creditsComplete', { lobbyId: currentLobbyId });
    // wait for server to actually create the initial situation before starting music/voice/display
    awaitingStartAfterCredits = true;
  }
  // Do not start music/voice/display yet — wait for server lobbyUpdate after creditsComplete
}

function showCreditsIndex(i) {
  if (!_creditsList || _creditsList.length === 0) return endCredits();
  if (i < 0) i = 0;
  if (i >= _creditsList.length) return endCredits();
  _creditsIndex = i;
  const item = _creditsList[_creditsIndex];
  const img = document.getElementById('credits-img');
  const name = document.getElementById('credits-name');
  const role = document.getElementById('credits-role');
  const trait = document.getElementById('credits-trait');
  const desc = document.getElementById('credits-desc');
  
  // Reset animations by removing and re-adding classes
  if (name) {
    name.classList.remove('credits-name-anim');
    void name.offsetWidth; // trigger reflow
    name.classList.add('credits-name-anim');
  }
  if (role) {
    role.classList.remove('credits-role-anim');
    void role.offsetWidth;
    role.classList.add('credits-role-anim');
  }
  if (trait) {
    trait.classList.remove('credits-trait-anim');
    void trait.offsetWidth;
    trait.classList.add('credits-trait-anim');
  }
  if (desc) {
    desc.classList.remove('credits-desc-anim');
    void desc.offsetWidth;
    desc.classList.add('credits-desc-anim');
  }
  
  if (img) img.src = item.character.image || '';
  if (name) name.textContent = item.character.name || item.player.name || 'Unknown';
  if (role) role.textContent = `Role: ${item.character.role || 'Adventurer'}`;
  if (trait) trait.textContent = `Trait: ${item.character.trait || ''}`;
  if (desc) desc.textContent = `${item.player.name} introduces ${item.character.name}.`;
}

function creditsNext() {
  showCreditsIndex(_creditsIndex + 1);
}

function updateLobbyUI(lobby) {
  lblLobbyId.textContent = lobby.lobbyId;
  // Prefer server-provided `isYou`, fall back to matching `currentPlayerId` if missing
  let me = lobby.players.find(p => p.isYou);
  if (!me && currentPlayerId) me = lobby.players.find(p => p.id === currentPlayerId);
  lblPlayerName.textContent = me ? me.name : currentPlayerName || '';

  // Players list
  listPlayers.innerHTML = '';
  lobby.players.forEach(p => {
    const li = document.createElement('li');
    const hostLabel = p.isHost ? ' (Host)' : '';
    const created = p.character ? ' ✅' : '';
    li.textContent = `${p.name}${hostLabel}${created}` + (p.character ? ` — ${p.character.name} (${p.character.role})` : '');
    listPlayers.appendChild(li);
  });
  // Phase-driven UI
  const allHaveChars = lobby.players.length > 0 && lobby.players.every(pl => pl.character);
  // reuse `me` defined above

  if (lobby.phase === 'CHARACTER_CREATION') {
    characterSection.classList.remove('hidden');
    // ensure theme vote screen isn't visible
    if (themeVoteSection) themeVoteSection.classList.add('hidden');
    // only host can start voting and only when everyone has created a character
    const canStart = me && me.isHost && allHaveChars;
    if (btnGoToGame) {
      if (canStart) {
        btnGoToGame.classList.remove('hidden');
        btnGoToGame.textContent = 'Start Game';
        // notify once when the button first becomes available
        if (!btnGoToGame.dataset.visible) {
          notify('All players ready — click Start Game to continue.', 'info');
          btnGoToGame.dataset.visible = '1';
        }
      } else {
        btnGoToGame.classList.add('hidden');
        delete btnGoToGame.dataset.visible;
      }
    }
  } else if (lobby.phase === 'THEME_VOTE') {
    characterSection.classList.add('hidden');
    // show dedicated theme vote screen
    showScreen('themeVote');
    renderThemeOptions(lobby);
    if (btnGoToGame) btnGoToGame.classList.add('hidden');
  } else if (lobby.phase === 'IN_PROGRESS' || lobby.phase === 'ENDED') {
    characterSection.classList.add('hidden');
    if (themeVoteSection) themeVoteSection.classList.add('hidden');
    showScreen('game');
  }
}

function renderThemeOptions(lobby) {
  // Prefer server-provided themes (lobby.availableThemes) then fall back to built-ins
  const serverThemes = (lobby && lobby.availableThemes) ? lobby.availableThemes : null;
  const themes = serverThemes || [
    { key: 'dungeon', label: 'Dark Dungeon', description: 'A winding, torch-lit dungeon full of traps and echoes.' },
    { key: 'space', label: 'Derelict Space Station', description: 'A silent station drifting in the void, systems failing.' },
    { key: 'mansion', label: 'Haunted Mansion', description: 'An old estate with creaking floors and hidden rooms.' },
    { key: 'cyber', label: 'Neon City Backstreets', description: 'Rain-slick alleys lit by signs and conspiracies.' },
    { key: 'island', label: 'Forsaken Island', description: 'A remote island with strange ruins and wild weather.' },
    { key: 'wilds', label: 'Wilderness Expedition', description: 'Vast forests and mountains, survival against nature.' },
    { key: 'steampunk', label: 'Clockwork Metropolis', description: 'A city of gears, steam and dirigibles.' },
    { key: 'noir', label: 'City Noir', description: 'A rainy, moral-grey city of mysteries and late-night diners.' }
  ];

  if (!themeOptions) return;
  themeOptions.innerHTML = '';
  themes.forEach(t => {
    const item = document.createElement('div');
    item.className = 'theme-item';

    // Title (clickable) then description under it
    const title = document.createElement('div');
    title.className = 'theme-title';
    title.textContent = t.label;
    title.title = t.label;
    title.setAttribute('role', 'button');
    title.setAttribute('tabindex', '0');

    const activate = () => {
      document.querySelectorAll('.theme-item').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
      socket.emit('themeVote', { lobbyId: lobby.lobbyId, themeKey: t.key });
      playSFX('vote');
    };

    // prevent title clicks from bubbling (we also make the whole item clickable)
    title.addEventListener('click', (ev) => { ev.stopPropagation(); activate(); });
    title.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault(); ev.stopPropagation(); activate();
      }
    });

    // make the entire item keyboard-focusable and clickable
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.addEventListener('click', activate);
    item.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault(); activate();
      }
    });

    item.appendChild(title);

    // only show description if non-empty (use either `description` or server `intro`)
    const descText = t.description || (t.intro || '');
    if (descText && descText.trim()) {
      const desc = document.createElement('div');
      desc.className = 'theme-desc';
      desc.textContent = descText;
      item.appendChild(desc);
    }

    // show added-by metadata if present
    if (t.addedBy) {
      const meta = document.createElement('div');
      meta.className = 'theme-meta';
      const isMe = (t.addedById && currentPlayerId && t.addedById === currentPlayerId);
      meta.textContent = `Added by ${isMe ? 'You' : t.addedBy}`;
      item.appendChild(meta);
    }

    themeOptions.appendChild(item);
  });
}

function updateGameUI(lobby) {
  const gameThemeHeading = document.getElementById('game-theme-heading');
  if (gameThemeHeading) gameThemeHeading.textContent = lobby.themeName ? `${lobby.themeName}` : 'Story Log';

  // Current narration display (prominent)
  const currentNarrationEl = document.getElementById('current-narration');
  const narrationTextEl = document.getElementById('narration-text');
  const situation = lobby.currentSituation;
  
  if (situation && situation.text && lobby.phase === 'IN_PROGRESS') {
    if (currentNarrationEl) currentNarrationEl.classList.remove('hidden');
    if (narrationTextEl) {
      // Replace the narration area with the current situation text (animated with typewriter)
      narrationTextEl.innerHTML = '';
      const mainSpan = document.createElement('span');
      mainSpan.className = 'narration-line';
      narrationTextEl.appendChild(mainSpan);
      
      // Use typewriter effect for narration
      typewriterEffect(mainSpan, situation.text, 25);

      // Speak narration on update (only if different from last)
      if (narrationTextEl.dataset.lastText !== situation.text) {
        if (!creditsActive && !awaitingStartAfterCredits) speakNarration(situation.text);
        narrationTextEl.dataset.lastText = situation.text;
      }
    }
  } else {
    if (currentNarrationEl) currentNarrationEl.classList.add('hidden');
  }

  // Animate new story-log entries into the current narration area
  const storyLog = (lobby.storyLog || []);
  if (storyLog.length < lastStoryLogLen) lastStoryLogLen = 0; // reset if cleared/reloaded
  if (storyLog.length > lastStoryLogLen) {
    const newEntries = storyLog.slice(lastStoryLogLen);
    newEntries.forEach((entry, idx) => {
      let text = '';
      if (entry.type === 'action' || entry.type === 'groupAction') {
        text = `"${entry.text}" (roll: ${entry.roll}, ${entry.successLevel}) — ${entry.outcomeText}`;
      } else {
        text = entry.text;
      }
      if (narrationTextEl) {
        const span = document.createElement('span');
        span.className = 'narration-line';
        span.textContent = text;
        narrationTextEl.appendChild(span);
        // trigger animation
        void span.offsetWidth;
        span.classList.add('animate-in');
        // optionally remove `animate-in` after animation completes
        setTimeout(() => span.classList.remove('animate-in'), 1200 + (idx * 50));
      }
    });
    lastStoryLogLen = storyLog.length;
  }

  // Party sidebar with enhanced stats display
  if (sidebarPlayers) {
    sidebarPlayers.innerHTML = '';
    (lobby.players || []).forEach((p, idx) => {
      const li = document.createElement('li');
      li.className = 'player-row';
      if (!p.alive) li.classList.add('dead');
      if (idx === lobby.currentTurnIndex && lobby.phase === 'IN_PROGRESS') {
        li.classList.add('active-turn');
      }

      const nameDiv = document.createElement('div');
      nameDiv.className = 'player-name';
      nameDiv.textContent = p.character ? p.character.name : p.name;
      if (idx === lobby.currentTurnIndex && lobby.phase === 'IN_PROGRESS') {
        nameDiv.textContent += ' ⚡';
      }

      const hpBar = document.createElement('div');
      hpBar.className = 'hp-bar';
      const hpFill = document.createElement('div');
      hpFill.className = 'hp-fill';
      const hpPercent = Math.max(0, Math.min(100, (p.hp / 100) * 100));
      hpFill.style.width = `${hpPercent}%`;
      hpBar.appendChild(hpFill);

      const hpText = document.createElement('div');
      hpText.className = 'hp-text';
      hpText.textContent = `${p.hp} HP`;

      const roleDiv = document.createElement('div');
      roleDiv.className = 'player-role';
      if (p.character && p.character.role) {
        roleDiv.textContent = p.character.role;
      }

      li.appendChild(nameDiv);
      li.appendChild(hpBar);
      li.appendChild(hpText);
      if (p.character && p.character.role) li.appendChild(roleDiv);
      sidebarPlayers.appendChild(li);
    });
  }

  if (gamePhaseLabel) gamePhaseLabel.textContent = `Phase: ${lobby.phase}`;
  if (campaignIdLabel) campaignIdLabel.textContent = lobby.campaignId ? `ID: ${lobby.campaignId}` : '';

  // Input panels: reset
  if (individualPanel) individualPanel.classList.add('hidden');
  if (groupProposalPanel) groupProposalPanel.classList.add('hidden');
  if (groupVotePanel) groupVotePanel.classList.add('hidden');
  if (proposalList) proposalList.innerHTML = '';

  if (lobby.phase !== 'IN_PROGRESS' || !situation) return;

  const me = lobby.players.find(p => p.id === currentPlayerId);

  if (situation.type === 'individual') {
    const current = lobby.players[lobby.currentTurnIndex];
    if (current && current.id === currentPlayerId && me && me.alive) {
      if (individualPanel) individualPanel.classList.remove('hidden');
    }
  } else if (situation.type === 'group') {
    if (me && me.alive && groupProposalPanel) groupProposalPanel.classList.remove('hidden');
    if (situation.proposals && situation.proposals.length > 0) {
      if (groupVotePanel) groupVotePanel.classList.remove('hidden');
      renderProposalsForVoting(situation);
    }
  }
}

function renderProposalsForVoting(situation) {
  proposalList.innerHTML = '';
  situation.proposals.forEach(pr => {
    const btn = document.createElement('button');
    btn.textContent = `${pr.fromName}: "${pr.text}"`;
    btn.addEventListener('click', () => {
      if (!currentLobbyId) return;
      socket.emit('groupVote', { lobbyId: currentLobbyId, proposalId: pr.id });
    });
    proposalList.appendChild(btn);
  });
}

// ====================
// TYPEWRITER EFFECT
// ====================
function typewriterEffect(element, text, speed = 30, callback) {
  if (!element) return;
  element.textContent = '';
  let i = 0;
  const timer = setInterval(() => {
    if (i < text.length) {
      element.textContent += text.charAt(i);
      i++;
    } else {
      clearInterval(timer);
      if (callback) callback();
    }
  }, speed);
  return timer;
}

// ====================
// INTRO SCREEN
// ====================
// Auto-advance to main menu after intro
setTimeout(() => {
  showScreen('main', true);
}, 4000);

// Initial screen (start with intro)
showScreen('intro');
