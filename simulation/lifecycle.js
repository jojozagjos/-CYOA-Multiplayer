// lifecycle.js - Growth, aging, reproduction, death, trait inheritance

const { v4: uuidv4 } = require('uuid');

function updateLifecycle(creature, type, dt) {
  // Age creature (slower rate)
  creature.age += dt * 0.2;

  // Life stage determination
  const juvenileAge = (type.maturityAge || 50) * 0.3;
  const adultAge = type.maturityAge || 50;
  const oldAge = (type.maxAge || 2000) * 0.7;

  if (creature.age < juvenileAge) {
    creature.lifeStage = 'juvenile';
    // Juveniles are smaller and weaker
    creature.sizeMultiplier = 0.5 + (creature.age / juvenileAge) * 0.5;
    creature.speedMultiplier = 0.7 + (creature.age / juvenileAge) * 0.3;
  } else if (creature.age < adultAge) {
    creature.lifeStage = 'young_adult';
    creature.sizeMultiplier = 1.0;
    creature.speedMultiplier = 1.0;
  } else if (creature.age < oldAge) {
    creature.lifeStage = 'adult';
    creature.sizeMultiplier = 1.0;
    creature.speedMultiplier = 1.0;
  } else {
    creature.lifeStage = 'elderly';
    // Old age causes decline
    const ageRatio = (creature.age - oldAge) / ((type.maxAge || 2000) - oldAge);
    creature.sizeMultiplier = 1.0;
    creature.speedMultiplier = Math.max(0.5, 1.0 - ageRatio * 0.5);
    creature.health = Math.max(0, 100 - ageRatio * 50);
  }
}

function attemptReproduction(creature, mate, types, world) {
  if (!creature || !mate || !types || !world) return null;
  if (!creature.personality || !mate.personality) return null;
  
  const events = [];
  const creatures = world.creatures;
  const size = world.size;

  const type = types[creature.typeId];
  const mateType = types[mate.typeId];

  let babyTypeId = creature.typeId;
  let isHybrid = false;

  // Check if parents are different species - create hybrid
  if (creature.typeId !== mate.typeId && type && mateType) {
    isHybrid = true;
    const hybridId = uuidv4();
    
    // Inherit traits with mutations
    const inheritTrait = (trait1, trait2, mutationRange = 0.1) => {
      const avg = (trait1 + trait2) / 2;
      const mutation = (Math.random() - 0.5) * mutationRange;
      return Math.max(0.1, avg + mutation);
    };

    const hybridType = {
      id: hybridId,
      name: `${type.name}-${mateType.name} Hybrid`,
      diet: type.diet,
      habitat: type.habitat || 'land',
      size: inheritTrait(type.size || 1, mateType.size || 1, 0.15),
      speed: inheritTrait(type.speed || 1, mateType.speed || 1, 0.15),
      senseRange: inheritTrait(type.senseRange || 6, mateType.senseRange || 6, 1),
      preferredTemp: inheritTrait(
        type.preferredTemp || 20, 
        mateType.preferredTemp || 20, 
        3
      ),
      maturityAge: Math.floor(inheritTrait(
        type.maturityAge || 50, 
        mateType.maturityAge || 50, 
        10
      )),
      maxAge: Math.floor(inheritTrait(
        type.maxAge || 2000, 
        mateType.maxAge || 2000, 
        200
      )),
      generation: Math.max(type.generation, mateType.generation) + 1,
      parentTypeId: type.id,
      parent2TypeId: mateType.id,
      evoScore: 0,
      imageDataUrl: null,
      soundDataUrl: null,
      isHybrid: true,
      // Aquatic traits if parents are aquatic
      preferredDepth: type.preferredDepth !== undefined ? 
        inheritTrait(type.preferredDepth, mateType.preferredDepth || type.preferredDepth, 1) : 
        undefined,
      needsAir: type.needsAir || mateType.needsAir,
      preferredWaterTemp: type.preferredWaterTemp !== undefined ?
        inheritTrait(type.preferredWaterTemp, mateType.preferredWaterTemp || type.preferredWaterTemp, 2) :
        undefined
    };

    types[hybridId] = hybridType;
    babyTypeId = hybridId;

    events.push({
      type: 'hybridCreated',
      hybridType,
      parent1: type,
      parent2: mateType
    });
  }

  // Inherit personality traits from parents with variation
  const inheritPersonality = (p1, p2, variance = 0.2) => {
    const avg = (p1 + p2) / 2;
    return Math.max(0.1, Math.min(1, avg + (Math.random() - 0.5) * variance));
  };

  const baby = {
    id: uuidv4(),
    typeId: babyTypeId,
    x: Math.max(0, Math.min(size - 0.001, creature.x + (Math.random() - 0.5) * 0.5)),
    y: Math.max(0, Math.min(size - 0.001, creature.y + (Math.random() - 0.5) * 0.5)),
    vx: 0,
    vy: 0,
    targetX: null,
    targetY: null,
    hunger: 0.2,
    age: 0,
    health: 100,
    energy: 1.0,
    oxygen: 1.0,
    reproductionCooldown: 200,
    reproDrive: 0,
    generation: Math.max(creature.generation || 0, mate.generation || 0) + 1,
    parentId: creature.id,
    parent2Id: mate.id,
    ownerSocketId: creature.ownerSocketId,
    state: 'idle',
    lifeStage: 'juvenile',
    sizeMultiplier: 0.5,
    speedMultiplier: 0.7,
    personality: {
      boldness: inheritPersonality(creature.personality.boldness, mate.personality.boldness),
      activity: inheritPersonality(creature.personality.activity, mate.personality.activity),
      curiosity: inheritPersonality(creature.personality.curiosity, mate.personality.curiosity),
      socialness: inheritPersonality(creature.personality.socialness, mate.personality.socialness)
    }
  };

  creatures.push(baby);

  // Parents pay reproduction cost
  creature.hunger += 0.3;
  mate.hunger += 0.3;
  creature.energy = Math.max(0, creature.energy - 0.3);
  mate.energy = Math.max(0, mate.energy - 0.3);
  creature.reproductionCooldown = 200;
  mate.reproductionCooldown = 200;
  creature.reproDrive = 0;
  mate.reproDrive = 0;

  events.push({
    type: 'birth',
    baby,
    parent1: creature,
    parent2: mate
  });

  return { baby, events };
}

function checkDeath(creature, type) {
  const maxAge = type.maxAge || 2000;
  const maxHunger = 5;

  // Death conditions
  if (creature.hunger > maxHunger) {
    creature.dead = true;
    creature.deathCause = 'starvation';
    return { died: true, cause: 'starvation' };
  }

  if (creature.age > maxAge) {
    creature.dead = true;
    creature.deathCause = 'old_age';
    return { died: true, cause: 'old_age' };
  }

  if (creature.health <= 0) {
    creature.dead = true;
    creature.deathCause = 'health';
    return { died: true, cause: 'health' };
  }

  // Environmental death
  const tile = creature.currentTile;
  if (tile) {
    // Extreme temperature
    if (tile.temp < -20 || tile.temp > 50) {
      if (Math.random() < 0.001) {
        creature.dead = true;
        creature.deathCause = 'temperature';
        return { died: true, cause: 'temperature' };
      }
    }

    // Aquatic creatures out of water
    if (type.habitat === 'water' && tile.biome !== 'water') {
      creature.dead = true;
      creature.deathCause = 'stranded';
      return { died: true, cause: 'stranded' };
    }
  }

  return { died: false };
}

module.exports = { updateLifecycle, attemptReproduction, checkDeath };
