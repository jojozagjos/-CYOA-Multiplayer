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
  charEditor: document.getElementById('screen-char-editor'),
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

// Dynamic theme music from API
function playThemeMusic(themeKey) {
  stopMusic();
  
  // Map theme to specific genre tags for audio search
  const themeToGenre = {
    dungeon: 'dark ambient',
    space: 'space ambient',
    mansion: 'horror',
    cyber: 'cyberpunk electronic',
    island: 'tropical',
    wilds: 'nature ambient',
    steampunk: 'steampunk',
    noir: 'jazz noir',
    default: 'ambient'
  };
  
  const genre = themeToGenre[themeKey] || themeToGenre.default;
  
  // Use ccMixter API (Creative Commons music, no auth needed)
  const apiUrl = `https://ccmixter.org/api/query?f=json&tags=${encodeURIComponent(genre)}&limit=20&sort=rank`;
  
  console.log(`[Audio] Fetching theme music for: ${themeKey} (${genre})`);
  
  fetch(apiUrl)
    .then(res => res.json())
    .then(data => {
      if (data && Array.isArray(data) && data.length > 0) {
        // Filter for tracks with valid file URLs
        const validTracks = data.filter(track => 
          track.files && 
          track.files.length > 0 &&
          track.files[0].download_url
        );
        
        if (validTracks.length > 0) {
          // Pick a random track from results
          const track = validTracks[Math.floor(Math.random() * validTracks.length)];
          const audioUrl = track.files[0].download_url;
          const audio = new Audio(audioUrl);
          currentMusicAudio = audio;
          audio.loop = true;
          const masterVol = (settings.volumeMaster || 70) / 100;
          const musicVol = (settings.volumeMusic || 50) / 100;
          audio.volume = masterVol * musicVol * 0.6;
          
          audio.play()
            .then(() => console.log(`[Audio] Playing: ${track.upload_name || 'Unknown'}`))
            .catch(err => {
              console.log('[Audio] Playback failed, using procedural:', err);
              fallbackProceduralMusic(themeKey);
            });
        } else {
          console.log('[Audio] No valid tracks found, using procedural');
          fallbackProceduralMusic(themeKey);
        }
      } else {
        console.log('[Audio] No results from API, using procedural');
        fallbackProceduralMusic(themeKey);
      }
    })
    .catch(err => {
      console.log('[Audio] API fetch failed, using procedural:', err);
      fallbackProceduralMusic(themeKey);
    });
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

// Story-context aware sound effects from API
function playSFX(storyContext) {
  if (!storyContext || typeof storyContext !== 'string') return;
  
  // Analyze story text for sound effect keywords
  const context = storyContext.toLowerCase();
  let sfxQuery = '';
  
  // Map story keywords to sound effects
  if (context.includes('door') || context.includes('creak')) sfxQuery = 'door creak';
  else if (context.includes('footstep') || context.includes('walk')) sfxQuery = 'footsteps';
  else if (context.includes('explosion') || context.includes('explode')) sfxQuery = 'explosion';
  else if (context.includes('sword') || context.includes('blade')) sfxQuery = 'sword swing';
  else if (context.includes('fire') || context.includes('flame')) sfxQuery = 'fire burning';
  else if (context.includes('water') || context.includes('splash')) sfxQuery = 'water splash';
  else if (context.includes('wind') || context.includes('breeze')) sfxQuery = 'wind howl';
  else if (context.includes('thunder') || context.includes('lightning')) sfxQuery = 'thunder';
  else if (context.includes('scream') || context.includes('yell')) sfxQuery = 'scream';
  else if (context.includes('bell') || context.includes('chime')) sfxQuery = 'bell ring';
  else if (context.includes('glass') || context.includes('shatter')) sfxQuery = 'glass shatter';
  else if (context.includes('metal') || context.includes('clang')) sfxQuery = 'metal clang';
  else if (context.includes('creature') || context.includes('growl')) sfxQuery = 'monster growl';
  else if (context.includes('magic') || context.includes('spell')) sfxQuery = 'magic spell';
  else if (context.includes('hit') || context.includes('punch')) sfxQuery = 'punch impact';
  else return; // No matching keyword, don't play SFX
  
  // Use Freesound API for dynamic sound effects
  const query = encodeURIComponent(sfxQuery);
  const apiUrl = `https://freesound.org/apiv2/search/text/?query=${query}&filter=duration:[0+TO+5]&fields=id,name,previews&token=YOUR_API_TOKEN`;
  
  console.log(`[SFX] Would fetch sound for: ${sfxQuery}`);
  // Fallback to procedural for demo
  fallbackProceduralSFX('notification');
  
  // Uncomment when you have an API token:
  /*
  fetch(apiUrl)
    .then(res => res.json())
    .then(data => {
      if (data.results && data.results.length > 0) {
        const sound = data.results[0];
        const audio = new Audio(sound.previews['preview-hq-mp3']);
        const masterVol = (settings.volumeMaster || 70) / 100;
        const sfxVol = (settings.volumeSFX || 60) / 100;
        audio.volume = masterVol * sfxVol;
        audio.play().catch(() => fallbackProceduralSFX('notification'));
      } else {
        fallbackProceduralSFX('notification');
      }
    })
    .catch(err => {
      console.log('[SFX] API fetch failed, using procedural');
      fallbackProceduralSFX('notification');
    });
  */
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
const canvasBgColor = document.getElementById('canvas-bg-color');
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
  // Use CSS background so changing the color doesn't require re-writing pixel data.
  // Keep canvas pixel buffer transparent so the eraser can remove pixels (destination-out).
  const bg = (canvasBgColor && canvasBgColor.value) ? canvasBgColor.value : '#ffffff';
  canvas.style.background = bg;
  ctx.clearRect(0, 0, cssW, cssH);
  try { BLANK_CANVAS = canvas.toDataURL('image/png'); } catch (e) { BLANK_CANVAS = null; }
  pushHistory();
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
    ctx.strokeStyle = '#000000';
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
  canvas.addEventListener('touchmove', (e) => { e.preventDefault(); if (!isDrawing) return; const p = getPos(e); ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over'; ctx.strokeStyle = '#000000'; ctx.lineWidth = parseInt(brushSize.value || 3, 10); if (isEraser) ctx.lineWidth = Math.max(8, ctx.lineWidth); if (lastPos) { ctx.beginPath(); ctx.moveTo(lastPos.x, lastPos.y); ctx.quadraticCurveTo((lastPos.x + p.x) / 2, (lastPos.y + p.y) / 2, p.x, p.y); ctx.stroke(); } else { ctx.lineTo(p.x, p.y); ctx.stroke(); } lastPos = p; });

  btnClearCanvas.addEventListener('click', () => {
    const cssW = parseInt(canvas.style.width || canvas.width, 10);
    const cssH = parseInt(canvas.style.height || canvas.height, 10);
    // Clear pixel buffer and ensure CSS background shows behind transparent pixels
    ctx.clearRect(0, 0, cssW, cssH);
    const bg = (canvasBgColor && canvasBgColor.value) ? canvasBgColor.value : '#ffffff';
    canvas.style.background = bg;
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
  });

  // Note: Save Drawing and Download buttons removed per user request.

  // gallery removed — drawings are no longer previewed/saved locally

  // brush input handlers
  brushSize.addEventListener('input', () => {});
  if (canvasBgColor) {
    canvasBgColor.addEventListener('input', () => {
      if (!canvas) return;
      const bgColor = canvasBgColor.value || '#ffffff';
      // Only change CSS background so pixel data remains intact (transparent background)
      canvas.style.background = bgColor;
      // record this change in history (no pixel rewrite)
      pushHistory();
    });
  }

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
// Game UI elements
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

let selectedItemForAction = null;

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
      image: null,
      bgColor: (canvasBgColor && canvasBgColor.value) || '#ffffff'
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
        // load background color if provided
        if (json.bgColor && canvasBgColor) {
          canvasBgColor.value = json.bgColor;
          if (canvas) canvas.style.background = json.bgColor;
        }
        // load image into preview and canvas
            if (json.image) {
              // draw on canvas
              const im = new Image();
              im.onload = () => {
                const cssW = parseInt(canvas.style.width || canvas.width, 10);
                const cssH = parseInt(canvas.style.height || canvas.height, 10);
                const bgColor = (canvasBgColor && canvasBgColor.value) || '#ffffff';
                ctx.clearRect(0, 0, cssW, cssH);
                ctx.fillStyle = bgColor;
                ctx.fillRect(0, 0, cssW, cssH);
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

// Game action handlers with item attachment
if (btnSendAction) btnSendAction.addEventListener('click', () => {
  const text = (inputAction.value || '').trim();
  if (!text || !currentLobbyId) return;
  socket.emit('playerAction', { 
    lobbyId: currentLobbyId, 
    actionText: text,
    itemToUse: selectedItemForAction
  });
  inputAction.value = '';
  selectedItemForAction = null;
});

if (btnSendProposal) btnSendProposal.addEventListener('click', () => {
  const text = (inputProposal.value || '').trim();
  if (!text || !currentLobbyId) return;
  socket.emit('groupProposal', { 
    lobbyId: currentLobbyId, 
    proposalText: text,
    itemToAttach: selectedItemForAction
  });
  inputProposal.value = '';
  selectedItemForAction = null;
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

  // Update player count
  const playerCountEl = document.getElementById('player-count');
  if (playerCountEl) {
    playerCountEl.textContent = lobby.players.length;
  }

  // Players list with modern styling
  listPlayers.innerHTML = '';
  lobby.players.forEach(p => {
    const li = document.createElement('li');
    
    // Create player info with icons
    const playerInfo = document.createElement('div');
    playerInfo.style.cssText = 'display:flex;align-items:center;gap:12px;flex:1';
    
    // Status icon
    const statusIcon = document.createElement('span');
    statusIcon.style.cssText = 'font-size:20px';
    statusIcon.textContent = p.character ? '✅' : '⏳';
    
    // Player name and details
    const playerDetails = document.createElement('div');
    playerDetails.style.cssText = 'flex:1';
    
    const nameSpan = document.createElement('div');
    nameSpan.style.cssText = 'font-weight:600;color:#e8f0f2;margin-bottom:2px';
    nameSpan.textContent = p.name + (p.isHost ? ' 👑' : '');
    
    const detailsSpan = document.createElement('div');
    detailsSpan.style.cssText = 'font-size:12px;color:var(--muted)';
    if (p.character) {
      detailsSpan.textContent = `${p.character.name} • ${p.character.role}`;
    } else {
      detailsSpan.textContent = 'Creating character...';
    }
    
    playerDetails.appendChild(nameSpan);
    playerDetails.appendChild(detailsSpan);
    
    playerInfo.appendChild(statusIcon);
    playerInfo.appendChild(playerDetails);
    li.appendChild(playerInfo);
    
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
  
  // Show story intro if it exists
  if (lobby.storyIntro && narrationTextEl) {
    const introDiv = document.getElementById('story-intro');
    if (introDiv && !introDiv.dataset.shown) {
      introDiv.textContent = lobby.storyIntro;
      introDiv.style.display = 'block';
      introDiv.dataset.shown = 'true';
    }
  }
  
  if (situation && situation.text && lobby.phase === 'IN_PROGRESS') {
    if (currentNarrationEl) currentNarrationEl.classList.remove('hidden');
    if (narrationTextEl) {
      // Only re-render if the situation text has changed
      if (narrationTextEl.dataset.lastText !== situation.text) {
        // Clear and show current situation with typewriter effect
        narrationTextEl.innerHTML = '';
        const mainSpan = document.createElement('span');
        mainSpan.className = 'narration-line current-situation-text';
        narrationTextEl.appendChild(mainSpan);
        
        // Use typewriter effect for narration
        typewriterEffect(mainSpan, situation.text, 25);

        // Speak narration on update
        if (!creditsActive && !awaitingStartAfterCredits) speakNarration(situation.text);
        narrationTextEl.dataset.lastText = situation.text;
      }
    }
  } else {
    if (currentNarrationEl) currentNarrationEl.classList.add('hidden');
  }

  // Append new story-log entries to the story log area
  const storyLogEl = document.getElementById('story-log');
  const storyLog = (lobby.storyLog || []);
  if (storyLog.length < lastStoryLogLen) lastStoryLogLen = 0; // reset if cleared/reloaded
  if (storyLog.length > lastStoryLogLen) {
    const newEntries = storyLog.slice(lastStoryLogLen);
    newEntries.forEach((entry, idx) => {
      let text = '';
      if (entry.type === 'action' || entry.type === 'groupAction') {
        text = `"${entry.text}" (roll: ${entry.roll}, ${entry.successLevel}) — ${entry.outcomeText}`;
        // Play story-context sound effect based on action outcome
        if (entry.outcomeText) {
          setTimeout(() => playSFX(entry.outcomeText), idx * 100);
        }
      } else {
        text = entry.text;
        // Play sound effect based on narration text
        setTimeout(() => playSFX(text), idx * 100);
      }
      if (storyLogEl) {
        const p = document.createElement('p');
        p.className = `story-entry ${entry.type || 'narration'}`;
        p.textContent = text;
        storyLogEl.appendChild(p);
        // Auto-scroll to bottom
        storyLogEl.scrollTop = storyLogEl.scrollHeight;
      }
    });
    lastStoryLogLen = storyLog.length;
  }

  // Party sidebar with HP and inventory
  if (sidebarPlayers) {
    sidebarPlayers.innerHTML = '';
    (lobby.players || []).forEach((p, idx) => {
      const li = document.createElement('li');
      li.className = 'player-row';
      if (!p.alive) li.classList.add('dead');

      const nameDiv = document.createElement('div');
      nameDiv.className = 'player-name';
      nameDiv.textContent = p.character ? p.character.name : p.name;

      const hpDiv = document.createElement('div');
      hpDiv.className = 'player-hp';
      hpDiv.textContent = `HP: ${p.hp}/10`;

      const roleDiv = document.createElement('div');
      roleDiv.className = 'player-role';
      if (p.character && p.character.role) {
        roleDiv.textContent = p.character.role;
      }

      // Show inventory items
      const inventoryDiv = document.createElement('div');
      inventoryDiv.className = 'player-inventory';
      if (p.inventory && p.inventory.length > 0) {
        inventoryDiv.textContent = `Items: ${p.inventory.length}`;
      }

      li.appendChild(nameDiv);
      li.appendChild(hpDiv);
      if (p.character && p.character.role) li.appendChild(roleDiv);
      if (p.inventory && p.inventory.length > 0) li.appendChild(inventoryDiv);
      sidebarPlayers.appendChild(li);
    });
  }

  if (gamePhaseLabel) gamePhaseLabel.textContent = `Phase: ${lobby.phase}`;
  if (campaignIdLabel) campaignIdLabel.textContent = lobby.campaignId ? `ID: ${lobby.campaignId}` : '';

  // Reset panels
  if (individualPanel) individualPanel.classList.add('hidden');
  if (groupProposalPanel) groupProposalPanel.classList.add('hidden');
  if (groupVotePanel) groupVotePanel.classList.add('hidden');
  if (proposalList) proposalList.innerHTML = '';

  if (lobby.phase !== 'IN_PROGRESS' || !situation) return;

  const me = lobby.players.find(p => p.id === currentPlayerId);
  
  // Show inventory panel for current player
  updateInventoryDisplay(me, situation);
  
  // Show appropriate input panel based on situation type
  if (situation.type === 'individual') {
    if (situation.currentPlayerId === currentPlayerId && me && me.alive) {
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
    let displayText = `${pr.fromName}: "${pr.text}"`;
    if (pr.itemAttached) {
      displayText += ` [Using: ${getItemName(pr.itemAttached)}]`;
    }
    btn.textContent = displayText;
    btn.addEventListener('click', () => {
      if (!currentLobbyId) return;
      socket.emit('groupVote', { lobbyId: currentLobbyId, proposalId: pr.id });
    });
    proposalList.appendChild(btn);
  });
}

function updateInventoryDisplay(player, situation) {
  const inventoryPanel = document.getElementById('inventory-panel');
  const inventoryList = document.getElementById('inventory-list');
  
  if (!inventoryPanel || !inventoryList || !player) return;
  
  if (player.inventory && player.inventory.length > 0) {
    inventoryPanel.classList.remove('hidden');
    inventoryList.innerHTML = '';
    
    player.inventory.forEach(itemType => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'inventory-item';
      if (selectedItemForAction === itemType) {
        itemDiv.classList.add('selected');
      }
      
      const itemName = document.createElement('span');
      itemName.textContent = getItemName(itemType);
      itemName.className = 'item-name';
      
      const attachBtn = document.createElement('button');
      attachBtn.textContent = selectedItemForAction === itemType ? 'Attached ✓' : 'Attach';
      attachBtn.className = 'btn-attach-item';
      attachBtn.onclick = () => toggleItemSelection(itemType);
      
      itemDiv.appendChild(itemName);
      itemDiv.appendChild(attachBtn);
      inventoryList.appendChild(itemDiv);
    });
  } else {
    inventoryPanel.classList.add('hidden');
  }
}

function toggleItemSelection(itemType) {
  if (selectedItemForAction === itemType) {
    selectedItemForAction = null;
  } else {
    selectedItemForAction = itemType;
  }
  
  // Refresh inventory display
  const lobby = currentLobbyState;
  if (lobby) {
    const me = lobby.players.find(p => p.id === currentPlayerId);
    updateInventoryDisplay(me, lobby.currentSituation);
  }
}

function getItemName(itemType) {
  const names = {
    healing_potion: 'Healing Potion',
    bandages: 'Bandages',
    revival_herb: 'Revival Herb',
    medkit: 'Med-Kit',
    stimpack: 'Stimpack',
    defibrillator: 'Defibrillator',
    old_medicine: 'Old Medicine',
    holy_water: 'Holy Water',
    medical_bag: 'Medical Bag',
    nano_injector: 'Nano-Injector',
    street_medkit: 'Street Med-Kit',
    trauma_kit: 'Trauma Kit'
  };
  return names[itemType] || itemType;
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
// CHARACTER EDITOR SCREEN
// ====================
const btnCharEditor = document.getElementById('btn-char-editor');
const editorCanvas = document.getElementById('editor-canvas');
const editorCanvasBg = document.getElementById('editor-canvas-bg');
const editorBrushColor = document.getElementById('editor-brush-color');
const editorBrushSize = document.getElementById('editor-brush-size');
const editorBtnClear = document.getElementById('editor-btn-clear');
const editorBtnUndo = document.getElementById('editor-btn-undo');
const editorBtnRedo = document.getElementById('editor-btn-redo');
const editorBtnEraser = document.getElementById('editor-btn-eraser');
const editorCharName = document.getElementById('editor-char-name');
const editorCharRole = document.getElementById('editor-char-role');
const editorCharTrait = document.getElementById('editor-char-trait');
const editorBtnExport = document.getElementById('editor-btn-export');
const editorBtnImport = document.getElementById('editor-btn-import');
const editorInputImport = document.getElementById('editor-input-import');
const editorBtnNew = document.getElementById('editor-btn-new');
const editorBtnBack = document.getElementById('editor-btn-back');

let editorCtx = null;
let editorIsDrawing = false;
let editorIsEraser = false;
let editorDrawHistory = [];
let editorHistoryIndex = -1;
let editorBlankCanvas = null;

if (editorCanvas) {
  editorCtx = editorCanvas.getContext('2d');
  
  function setupEditorCanvas() {
    if (!editorCanvas || !editorCtx) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = editorCanvas.width;
    const cssH = editorCanvas.height;
    editorCanvas.style.width = cssW + 'px';
    editorCanvas.style.height = cssH + 'px';
    editorCanvas.width = Math.floor(cssW * dpr);
    editorCanvas.height = Math.floor(cssH * dpr);
    editorCtx.scale(dpr, dpr);
    editorCtx.lineCap = 'round';
    editorCtx.lineJoin = 'round';
    const bg = (editorCanvasBg && editorCanvasBg.value) ? editorCanvasBg.value : '#ffffff';
    // Use CSS background so changing the color doesn't require re-writing pixel data.
    // Keep canvas pixel buffer transparent so the eraser can remove pixels (destination-out).
    editorCanvas.style.background = bg;
    editorCtx.clearRect(0, 0, cssW, cssH);
    try { editorBlankCanvas = editorCanvas.toDataURL('image/png'); } catch (e) { editorBlankCanvas = null; }
    editorPushHistory();
  }  function editorPushHistory() {
    if (!editorCanvas) return;
    try {
      const data = editorCanvas.toDataURL('image/png');
      if (editorHistoryIndex < editorDrawHistory.length - 1) editorDrawHistory = editorDrawHistory.slice(0, editorHistoryIndex + 1);
      editorDrawHistory.push(data);
      if (editorDrawHistory.length > 30) editorDrawHistory.shift();
      editorHistoryIndex = editorDrawHistory.length - 1;
    } catch (e) {}
    try { updateExportButtonState(); } catch (e) {}
  }

  function editorRestoreHistory(idx) {
    if (!editorDrawHistory[idx]) return;
    const img = new Image();
    img.onload = () => {
      const cssW = parseInt(editorCanvas.style.width || editorCanvas.width, 10);
      const cssH = parseInt(editorCanvas.style.height || editorCanvas.height, 10);
      editorCtx.clearRect(0, 0, cssW, cssH);
      editorCtx.drawImage(img, 0, 0, cssW, cssH);
    };
    img.src = editorDrawHistory[idx];
  }


  function getEditorPos(e) {
    const rect = editorCanvas.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return { x, y };
  }

  let editorLastPos = null;

  editorCanvas.addEventListener('mousedown', (e) => {
    editorIsDrawing = true;
    editorPushHistory();
    const p = getEditorPos(e);
    editorLastPos = p;
    editorCtx.beginPath();
    editorCtx.moveTo(p.x, p.y);
  });
  
  window.addEventListener('mouseup', () => { if (editorIsDrawing) { editorIsDrawing = false; editorCtx.closePath(); editorLastPos = null; } });
  
  editorCanvas.addEventListener('mousemove', (e) => {
    if (!editorIsDrawing) return;
    const p = getEditorPos(e);
    editorCtx.globalCompositeOperation = editorIsEraser ? 'destination-out' : 'source-over';
    editorCtx.strokeStyle = '#000000';
    editorCtx.lineWidth = parseInt(editorBrushSize.value || 3, 10);
    if (editorIsEraser) editorCtx.lineWidth = Math.max(8, editorCtx.lineWidth);
    if (editorLastPos) {
      editorCtx.beginPath();
      editorCtx.moveTo(editorLastPos.x, editorLastPos.y);
      editorCtx.quadraticCurveTo((editorLastPos.x + p.x) / 2, (editorLastPos.y + p.y) / 2, p.x, p.y);
      editorCtx.stroke();
    } else {
      editorCtx.lineTo(p.x, p.y);
      editorCtx.stroke();
    }
    editorLastPos = p;
  });

  // Touch support
  editorCanvas.addEventListener('touchstart', (e) => { e.preventDefault(); editorIsDrawing = true; editorPushHistory(); const p = getEditorPos(e); editorLastPos = p; editorCtx.beginPath(); editorCtx.moveTo(p.x, p.y); });
  window.addEventListener('touchend', () => { if (editorIsDrawing) { editorIsDrawing = false; editorCtx.closePath(); editorLastPos = null; } });
  editorCanvas.addEventListener('touchmove', (e) => { e.preventDefault(); if (!editorIsDrawing) return; const p = getEditorPos(e); editorCtx.globalCompositeOperation = editorIsEraser ? 'destination-out' : 'source-over'; editorCtx.strokeStyle = '#000000'; editorCtx.lineWidth = parseInt(editorBrushSize.value || 3, 10); if (editorIsEraser) editorCtx.lineWidth = Math.max(8, editorCtx.lineWidth); if (editorLastPos) { editorCtx.beginPath(); editorCtx.moveTo(editorLastPos.x, editorLastPos.y); editorCtx.quadraticCurveTo((editorLastPos.x + p.x) / 2, (editorLastPos.y + p.y) / 2, p.x, p.y); editorCtx.stroke(); } else { editorCtx.lineTo(p.x, p.y); editorCtx.stroke(); } editorLastPos = p; });

  if (editorBtnClear) {
    editorBtnClear.addEventListener('click', () => {
      const cssW = parseInt(editorCanvas.style.width || editorCanvas.width, 10);
      const cssH = parseInt(editorCanvas.style.height || editorCanvas.height, 10);
      // Clear pixel buffer and ensure CSS background shows behind transparent pixels
      editorCtx.clearRect(0, 0, cssW, cssH);
      const bg = (editorCanvasBg && editorCanvasBg.value) ? editorCanvasBg.value : '#ffffff';
      editorCanvas.style.background = bg;
      editorPushHistory();
      notify('Canvas cleared', 'info');
    });
  }

  if (editorBtnUndo) {
    editorBtnUndo.addEventListener('click', () => {
      if (editorHistoryIndex > 0) {
        editorHistoryIndex -= 1;
        editorRestoreHistory(editorHistoryIndex);
      } else {
        notify('Nothing to undo', 'warn');
      }
    });
  }

  if (editorBtnRedo) {
    editorBtnRedo.addEventListener('click', () => {
      if (editorHistoryIndex < editorDrawHistory.length - 1) {
        editorHistoryIndex += 1;
        editorRestoreHistory(editorHistoryIndex);
      } else {
        notify('Nothing to redo', 'warn');
      }
    });
  }

  if (editorBtnEraser) {
    editorBtnEraser.addEventListener('click', () => {
      editorIsEraser = !editorIsEraser;
      editorBtnEraser.classList.toggle('active', editorIsEraser);
    });
  }

  if (editorBrushSize) {
    editorBrushSize.addEventListener('input', () => {});
  }

  if (editorCanvasBg) {
    editorCanvasBg.addEventListener('input', () => {
      if (!editorCanvas) return;
      const cssW = parseInt(editorCanvas.style.width || editorCanvas.width, 10);
      const cssH = parseInt(editorCanvas.style.height || editorCanvas.height, 10);
      const bgColor = editorCanvasBg.value || '#ffffff';
      // Only change CSS background so pixel data remains intact (transparent background)
      editorCanvas.style.background = bgColor;
      // record this change in history (no pixel rewrite)
      editorPushHistory();
    });
  }

  setupEditorCanvas();
}

if (btnCharEditor) {
  btnCharEditor.addEventListener('click', () => {
    showScreen('charEditor');
  });
}

if (editorBtnBack) {
  editorBtnBack.addEventListener('click', () => {
    showScreen('main');
  });
}

if (editorBtnNew) {
  editorBtnNew.addEventListener('click', () => {
    if (editorCharName) editorCharName.value = '';
    if (editorCharRole) editorCharRole.value = '';
    if (editorCharTrait) editorCharTrait.value = '';
    if (editorCanvas && editorCtx) {
      const cssW = parseInt(editorCanvas.style.width || editorCanvas.width, 10);
      const cssH = parseInt(editorCanvas.style.height || editorCanvas.height, 10);
      // Clear pixel buffer but keep CSS background color visible behind transparent pixels
      editorCtx.clearRect(0, 0, cssW, cssH);
      const bg = (editorCanvasBg && editorCanvasBg.value) || '#ffffff';
      editorCanvas.style.background = bg;
      editorPushHistory();
    }
    notify('New character started', 'info');
  });
}

if (editorBtnExport) {
  editorBtnExport.addEventListener('click', () => {
    const nameVal = (editorCharName.value || '').trim();
    const roleVal = (editorCharRole.value || '').trim();
    const traitVal = (editorCharTrait.value || '').trim();
    
    const payload = {
      name: nameVal || 'Hero',
      role: roleVal || 'Adventurer',
      trait: traitVal || 'Determined',
      image: null,
      bgColor: (editorCanvasBg && editorCanvasBg.value) || '#ffffff'
    };
    
    try {
      if (editorCanvas && editorCtx) payload.image = editorCanvas.toDataURL('image/png');
    } catch (e) {}

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

if (editorBtnImport && editorInputImport) {
  editorBtnImport.addEventListener('click', () => editorInputImport.click());
  editorInputImport.addEventListener('change', (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result);
        if (!json || typeof json !== 'object') throw new Error('Invalid file');
        
        editorCharName.value = json.name || '';
        editorCharRole.value = json.role || '';
        editorCharTrait.value = json.trait || '';
        
        if (json.bgColor && editorCanvasBg) {
          editorCanvasBg.value = json.bgColor;
          if (editorCanvas) editorCanvas.style.background = json.bgColor;
        }
        
        if (json.image) {
          const im = new Image();
          im.onload = () => {
            const cssW = parseInt(editorCanvas.style.width || editorCanvas.width, 10);
            const cssH = parseInt(editorCanvas.style.height || editorCanvas.height, 10);
            const bgColor = (editorCanvasBg && editorCanvasBg.value) || '#ffffff';
            // Use CSS background so the canvas pixel buffer remains transparent where appropriate.
            editorCanvas.style.background = bgColor;
            editorCtx.clearRect(0, 0, cssW, cssH);
            editorCtx.drawImage(im, 0, 0, cssW, cssH);
            editorPushHistory();
            notify('Character loaded successfully.', 'success');
          };
          im.src = json.image;
        } else {
          notify('Character data loaded (no image).', 'info');
        }
      } catch (err) {
        console.error(err);
        notify('Failed to load character file.', 'error');
      }
    };
    reader.readAsText(f);
    editorInputImport.value = '';
  });
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
