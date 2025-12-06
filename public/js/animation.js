// animation.js - Smooth animation blending and state-based rendering

class AnimationManager {
  constructor() {
    this.animationStates = {};
  }

  // Initialize or update creature animation state
  updateCreature(creature, dt) {
    if (!this.animationStates[creature.id]) {
      this.animationStates[creature.id] = {
        lerpX: creature.x,
        lerpY: creature.y,
        lerpRotation: 0,
        walkPhase: Math.random() * Math.PI * 2, // Random start phase
        idlePhase: Math.random() * Math.PI * 2,
        blendWeight: 0, // For state transitions
        previousState: creature.state
      };
    }

    const anim = this.animationStates[creature.id];

    // Detect state change
    if (anim.previousState !== creature.state) {
      anim.blendWeight = 0; // Reset blend for new state
      anim.previousState = creature.state;
    }

    // Blend weight increases over time (smooth transition)
    anim.blendWeight = Math.min(1, anim.blendWeight + dt * 0.05);

    // Update walk phase based on speed
    const speed = creature.speed || 0;
    if (speed > 0.0001) {
      const walkSpeed = 3 + speed * 200; // Faster movement = faster animation
      anim.walkPhase += dt * walkSpeed * 0.01;
    }

    // Update idle phase (breathing, subtle movement)
    anim.idlePhase += dt * 0.002;

    return anim;
  }

  // Get interpolated position for smooth rendering
  getLerpedPosition(creature, worldSize, canvasWidth, canvasHeight, lerpFactor = 0.15) {
    const anim = this.animationStates[creature.id];
    if (!anim) return { x: creature.x, y: creature.y };

    const targetX = creature.x * (canvasWidth / worldSize);
    const targetY = creature.y * (canvasHeight / worldSize);

    // Smooth interpolation
    anim.lerpX += (targetX - anim.lerpX) * lerpFactor;
    anim.lerpY += (targetY - anim.lerpY) * lerpFactor;

    return { x: anim.lerpX, y: anim.lerpY };
  }

  // Get walking/swimming rotation animation
  getWalkRotation(creature, type) {
    const anim = this.animationStates[creature.id];
    if (!anim) return 0;

    const speed = creature.speed || 0;
    const isMoving = speed > 0.0001;

    if (!isMoving) {
      // Blend back to zero rotation when not moving
      const targetRotation = 0;
      anim.lerpRotation += (targetRotation - anim.lerpRotation) * 0.2;
      return anim.lerpRotation;
    }

    // Walking/swimming animation based on state
    let amplitude = 0.1;
    let frequency = 1;

    switch (creature.state) {
      case 'flee':
        amplitude = 0.15;
        frequency = 2;
        break;
      case 'courtship':
        amplitude = 0.2;
        frequency = 1.5;
        break;
      case 'rest':
      case 'idle':
        amplitude = 0.02;
        frequency = 0.5;
        break;
      default:
        amplitude = 0.1;
        frequency = 1;
    }

    // Aquatic creatures have smoother, flowing motion
    if (type.habitat === 'water') {
      amplitude *= 0.7;
    }

    const targetRotation = Math.sin(anim.walkPhase * frequency) * amplitude;
    
    // Smooth lerp to target rotation
    anim.lerpRotation += (targetRotation - anim.lerpRotation) * 0.2;
    
    return anim.lerpRotation;
  }

  // Get idle breathing/bobbing animation
  getIdleAnimation(creature, type) {
    const anim = this.animationStates[creature.id];
    if (!anim) return { offsetX: 0, offsetY: 0, scale: 1 };

    const speed = creature.speed || 0;
    
    // Only apply idle animation when not moving much
    if (speed > 0.01) {
      return { offsetX: 0, offsetY: 0, scale: 1 };
    }

    // Breathing/bobbing effect
    const breatheAmount = 0.5;
    const offsetY = Math.sin(anim.idlePhase) * breatheAmount;
    
    // Subtle horizontal sway
    const swayAmount = 0.3;
    const offsetX = Math.sin(anim.idlePhase * 0.7) * swayAmount;

    // Slight scale pulsing (breathing)
    const scaleAmount = 0.02;
    const scale = 1 + Math.sin(anim.idlePhase) * scaleAmount;

    return { offsetX, offsetY, scale };
  }

  // Get size multiplier based on life stage
  getSizeMultiplier(creature) {
    return creature.sizeMultiplier || 1.0;
  }

  // Cleanup old animation states for creatures that no longer exist
  cleanup(activeCreatureIds) {
    const idsToKeep = new Set(activeCreatureIds);
    
    for (const id in this.animationStates) {
      if (!idsToKeep.has(id)) {
        delete this.animationStates[id];
      }
    }
  }
}

// Export singleton
const animationManager = new AnimationManager();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AnimationManager, animationManager };
}
