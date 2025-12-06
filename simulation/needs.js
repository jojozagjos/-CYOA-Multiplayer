// needs.js - Creature need evaluation and urgency computation

function initializeNeeds(creature, type) {
  if (creature.energy === undefined) creature.energy = 1.0; // 1.0 = fully rested
  if (creature.oxygen === undefined && type.habitat === 'water') creature.oxygen = 1.0;
  if (creature.reproDrive === undefined) creature.reproDrive = 0;
  if (creature.personality === undefined) {
    // Personality traits add micro-variation
    creature.personality = {
      boldness: 0.3 + Math.random() * 0.7, // 0.3-1.0
      activity: 0.3 + Math.random() * 0.7,
      curiosity: 0.3 + Math.random() * 0.7,
      socialness: 0.3 + Math.random() * 0.7
    };
  }
}

function evaluateNeeds(creature, type, tile, creatures, world, dt) {
  if (!creature || !type || !tile) return {};
  
  const needs = {};
  const senseRange = (type.senseRange || 6) * (creature.personality?.curiosity || 0.5);

  // Energy drain varies by activity and personality
  const energyDrainRate = 0.0005 * (0.5 + creature.personality.activity);
  creature.energy = Math.max(0, creature.energy - energyDrainRate * dt);

  // Temperature comfort
  const preferredTemp = type.preferredTemp !== undefined ? type.preferredTemp : (tile.tempBase || 20);
  const tempDiff = Math.abs((tile.temp || tile.tempBase || 20) - preferredTemp);
  needs.tempDiscomfort = Math.min(1, tempDiff / 20);

  // Fear detection - bold creatures have higher threshold
  let fearLevel = 0;
  for (const other of creatures) {
    if (other.id === creature.id) continue;
    const otherType = world.creatureTypes[other.typeId];
    if (!otherType) continue;
    
    const isThreat = (otherType.diet === 'carnivore' || otherType.isPredator) && 
                     otherType.size > (type.size || 1) * 0.8;
    
    if (isThreat) {
      const dx = other.x - creature.x;
      const dy = other.y - creature.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const detectionRange = senseRange / creature.personality.boldness;
      
      if (dist < detectionRange) {
        const proximityFear = (detectionRange - dist) / detectionRange;
        fearLevel = Math.max(fearLevel, proximityFear);
      }
    }
  }
  needs.fear = fearLevel;

  // Reproduction drive
  const adultAge = type.maturityAge || 50;
  const oldAge = type.maxAge ? type.maxAge * 0.7 : 1400;
  
  if (creature.age > adultAge && creature.age < oldAge && creature.reproductionCooldown <= 0) {
    creature.reproDrive = Math.min(1, creature.reproDrive + 0.0005 * dt * creature.personality.socialness);
  } else {
    creature.reproDrive = Math.max(0, creature.reproDrive - 0.001 * dt);
  }

  // Aquatic-specific needs
  if (type.habitat === 'water') {
    // Oxygen drain - deeper divers use less oxygen
    const oxygenDrainRate = type.preferredDepth > 5 ? 0.0002 : 0.0004;
    creature.oxygen = Math.max(0, creature.oxygen - oxygenDrainRate * dt);
    needs.needAir = type.needsAir && creature.oxygen < 0.3 ? 1.0 : 0;

    // Depth comfort - check if at preferred depth
    const tileDepth = tile.depth || 0;
    const prefDepth = type.preferredDepth || 3;
    const depthDiff = Math.abs(tileDepth - prefDepth);
    needs.depthDiscomfort = Math.min(1, depthDiff / 10);

    // Water temperature comfort
    const waterTemp = tile.waterTemp || tile.temp || 15;
    const prefWaterTemp = type.preferredWaterTemp || 18;
    const waterTempDiff = Math.abs(waterTemp - prefWaterTemp);
    needs.waterTempDiscomfort = Math.min(1, waterTempDiff / 15);
  }

  // Compute urgencies
  const urgencies = {
    hunger: Math.max(0, Math.min(1, creature.hunger)),
    fatigue: 1 - creature.energy,
    temperature: needs.tempDiscomfort,
    fear: needs.fear,
    reproduction: creature.reproDrive,
    oxygen: needs.needAir || 0,
    depth: needs.depthDiscomfort || 0,
    waterTemp: needs.waterTempDiscomfort || 0
  };

  return urgencies;
}

module.exports = { initializeNeeds, evaluateNeeds };
