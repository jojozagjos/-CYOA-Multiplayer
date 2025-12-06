// audio.js - Contextual sound playback with spatial positioning

class AudioManager {
  constructor() {
    this.soundCache = {};
    this.settings = {
      masterVolume: 1.0,
      creatureVolume: 1.0,
      mute: false
    };
    this.lastPlayTime = {}; // Prevent sound spam
  }

  setSettings(settings) {
    this.settings = { ...this.settings, ...settings };
  }

  // Play contextual creature sound based on state and event
  playCreatureSound(creature, creatureType, soundContext, camera, worldSize) {
    if (this.settings.mute || !creatureType.soundDataUrl) return;

    // Calculate distance from camera
    const dist = this.getDistanceFromCamera(creature, camera, worldSize);
    const hearingRadius = 18; // tiles
    
    if (dist > hearingRadius) return; // Too far to hear

    // Check cooldown to prevent spam
    const cooldownKey = `${creature.id}_${soundContext}`;
    const now = performance.now();
    const lastTime = this.lastPlayTime[cooldownKey] || 0;
    const minInterval = this.getMinInterval(soundContext);
    
    if (now - lastTime < minInterval) return;
    this.lastPlayTime[cooldownKey] = now;

    // Get or create audio element
    let audio = this.soundCache[creatureType.id];
    if (!audio) {
      audio = new Audio(creatureType.soundDataUrl);
      this.soundCache[creatureType.id] = audio;
    }

    // Calculate volume based on distance and context
    const baseVolume = this.getContextVolume(soundContext);
    const distanceFalloff = Math.max(0, 1 - (dist / hearingRadius));
    const volume = baseVolume * distanceFalloff * this.settings.masterVolume * this.settings.creatureVolume;

    // Calculate stereo pan based on position relative to camera
    const pan = this.calculatePan(creature, camera, worldSize);

    // Apply audio settings
    audio.volume = Math.min(1, volume);
    
    // Apply panning if Web Audio API is available
    if (audio.audioContext) {
      const panner = audio.panNode;
      if (panner && panner.pan) {
        panner.pan.value = pan;
      }
    }

    // Play sound
    try {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } catch (e) {
      // Silent fail
    }
  }

  getDistanceFromCamera(creature, camera, worldSize) {
    if (!creature || !camera || !worldSize) return Infinity;
    
    const tileW = camera.canvasWidth / worldSize;
    const tileH = camera.canvasHeight / worldSize;
    
    const camTileX = (camera.x / tileW) + (camera.canvasWidth / (2 * tileW * camera.zoom));
    const camTileY = (camera.y / tileH) + (camera.canvasHeight / (2 * tileH * camera.zoom));
    
    const dx = (creature.x || 0) - camTileX;
    const dy = (creature.y || 0) - camTileY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  calculatePan(creature, camera, worldSize) {
    const tileW = camera.canvasWidth / worldSize;
    const camTileX = (camera.x / tileW) + (camera.canvasWidth / (2 * tileW * camera.zoom));
    
    const relativeX = creature.x - camTileX;
    const maxPan = 10; // tiles
    return Math.max(-1, Math.min(1, relativeX / maxPan));
  }

  getContextVolume(soundContext) {
    const volumeMap = {
      'idle': 0.25,
      'feeding': 0.4,
      'alarm': 1.0,
      'mating': 0.6,
      'surfacing': 0.5,
      'death': 0.8,
      'distress': 0.9
    };
    return volumeMap[soundContext] || 0.3;
  }

  getMinInterval(soundContext) {
    const intervalMap = {
      'idle': 2000,
      'feeding': 1500,
      'alarm': 800,
      'mating': 1200,
      'surfacing': 1000,
      'death': 5000,
      'distress': 1500
    };
    return intervalMap[soundContext] || 2000;
  }

  // Handle server events
  handleCreatureEvents(events, creatures, creatureTypes, camera, worldSize) {
    if (!events || !Array.isArray(events)) return;
    if (!creatures || !creatureTypes || !camera) return;
    
    try {
      for (const event of events) {
        const creature = creatures.find(c => c && c.id === event.creatureId);
        if (!creature) continue;
        
        const type = creatureTypes[creature.typeId];
        if (!type) continue;

        let soundContext = null;

        if (event.type === 'sound') {
          soundContext = event.sound;
        } else if (event.type === 'stateChange') {
          soundContext = this.mapStateToSound(event.state);
        }

        if (soundContext) {
          this.playCreatureSound(creature, type, soundContext, camera, worldSize);
        }
      }
    } catch (e) {
      console.warn('Error handling creature events in audio:', e);
    }
  }

  mapStateToSound(state) {
    const stateMap = {
      'flee': 'alarm',
      'eat': 'feeding',
      'courtship': 'mating',
      'surface_for_air': 'surfacing',
      'idle': 'idle',
      'wander': 'idle'
    };
    return stateMap[state] || null;
  }

  cleanup() {
    // Clear old entries from lastPlayTime to prevent memory leak
    const now = performance.now();
    const maxAge = 10000;
    
    for (const key in this.lastPlayTime) {
      if (now - this.lastPlayTime[key] > maxAge) {
        delete this.lastPlayTime[key];
      }
    }
  }
}

// Export singleton instance
const audioManager = new AudioManager();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AudioManager, audioManager };
}
