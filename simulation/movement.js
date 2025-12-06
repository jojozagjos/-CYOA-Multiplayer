// movement.js - Purposeful movement with smooth transitions and personality

const { STATES } = require('./behaviors');

function updateMovement(creature, type, world, dt) {
  if (!creature || !type || !world) return;
  
  const size = world.size;
  const tiles = world.tiles;
  if (!tiles || !Array.isArray(tiles)) return;
  
  // Movement parameters based on state and personality
  let baseSpeed = (type.speed || 1) * 0.005;
  let accelerationFactor = 0.3;
  let frictionFactor = 0.95;
  
  // Ensure personality exists
  if (!creature.personality) {
    creature.personality = {
      boldness: 0.5,
      activity: 0.5,
      curiosity: 0.5,
      socialness: 0.5
    };
  }
  
  // Micro-variations based on personality
  baseSpeed *= (0.8 + creature.personality.activity * 0.4);
  
  // State-specific movement modifiers
  switch (creature.state) {
    case STATES.FLEE:
      baseSpeed *= 2.5;
      accelerationFactor = 0.8;
      frictionFactor = 0.88;
      break;
    case STATES.SEEK_FOOD:
    case STATES.SEEK_MATE:
    case STATES.SEEK_SHELTER:
    case STATES.SEEK_DEPTH:
      baseSpeed *= 1.3;
      accelerationFactor = 0.5;
      break;
    case STATES.COURTSHIP:
      baseSpeed *= 0.7;
      accelerationFactor = 0.4;
      break;
    case STATES.REST:
    case STATES.IDLE:
      baseSpeed *= 0.2;
      accelerationFactor = 0.1;
      frictionFactor = 0.98;
      break;
    case STATES.SURFACE_FOR_AIR:
      // Move toward surface (y=0 for shallow water)
      baseSpeed *= 1.5;
      accelerationFactor = 0.6;
      break;
    case STATES.WANDER:
      baseSpeed *= (0.5 + creature.personality.curiosity * 0.5);
      break;
  }

  // Determine target based on state
  let targetX = creature.targetX;
  let targetY = creature.targetY;

  if (creature.state === STATES.SURFACE_FOR_AIR && type.habitat === 'water') {
    // Find nearest shallow tile
    const searchRadius = 8;
    let bestDist = Infinity;
    for (let dy = -searchRadius; dy <= searchRadius; dy++) {
      for (let dx = -searchRadius; dx <= searchRadius; dx++) {
        const checkX = Math.max(0, Math.min(size - 1, Math.floor(creature.x) + dx));
        const checkY = Math.max(0, Math.min(size - 1, Math.floor(creature.y) + dy));
        const tile = tiles[checkY][checkX];
        if (tile && (tile.depth || 0) < 2) {
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < bestDist) {
            bestDist = dist;
            targetX = checkX + 0.5;
            targetY = checkY + 0.5;
          }
        }
      }
    }
  }

  // Smooth velocity-based movement with curved paths
  if (targetX !== null && targetY !== null) {
    const dirX = targetX - creature.x;
    const dirY = targetY - creature.y;
    const dist = Math.sqrt(dirX * dirX + dirY * dirY);

    if (dist > 0.1) {
      // Normalize direction
      const ndx = dirX / dist;
      const ndy = dirY / dist;

      // Add gentle acceleration with slight arc for aquatic creatures
      let accelX = ndx * baseSpeed * dt * accelerationFactor;
      let accelY = ndy * baseSpeed * dt * accelerationFactor;

      // Aquatic creatures use curved paths
      if (type.habitat === 'water' && creature.state !== STATES.FLEE) {
        const curveAmount = 0.2 * creature.personality.curiosity;
        const perpX = -ndy * curveAmount;
        const perpY = ndx * curveAmount;
        const phase = (creature.id || '').length * 1000 + performance.now() * 0.001;
        const curve = Math.sin(phase) * baseSpeed * dt;
        accelX += perpX * curve;
        accelY += perpY * curve;
      }

      creature.vx += accelX;
      creature.vy += accelY;
      creature.targetX = targetX;
      creature.targetY = targetY;
    } else {
      // Reached target
      creature.targetX = null;
      creature.targetY = null;
      creature.atFood = creature.state === STATES.SEEK_FOOD;
    }
  } else {
    // Random wandering with personality-based variation
    const wanderChance = 0.003 * dt * creature.personality.activity;
    if (Math.random() < wanderChance) {
      const wanderStrength = 0.3 * creature.personality.curiosity;
      creature.vx += (Math.random() - 0.5) * baseSpeed * dt * wanderStrength;
      creature.vy += (Math.random() - 0.5) * baseSpeed * dt * wanderStrength;
    }
  }

  // Apply friction for smooth deceleration
  creature.vx *= Math.pow(frictionFactor, dt);
  creature.vy *= Math.pow(frictionFactor, dt);

  // Speed limit varies by state
  const maxSpeed = baseSpeed * 3;
  const speed = Math.sqrt(creature.vx * creature.vx + creature.vy * creature.vy);
  if (speed > maxSpeed) {
    creature.vx = (creature.vx / speed) * maxSpeed;
    creature.vy = (creature.vy / speed) * maxSpeed;
  }

  // Update position with boundary checks
  creature.x = Math.max(0, Math.min(size - 0.001, creature.x + creature.vx * dt));
  creature.y = Math.max(0, Math.min(size - 0.001, creature.y + creature.vy * dt));

  // Store movement info for animation
  creature.speed = speed;
  creature.isMoving = speed > 0.0001;
}

function initializeVelocity(creature) {
  if (creature.vx === undefined) creature.vx = 0;
  if (creature.vy === undefined) creature.vy = 0;
  if (creature.targetX === undefined) creature.targetX = null;
  if (creature.targetY === undefined) creature.targetY = null;
}

module.exports = { updateMovement, initializeVelocity };
