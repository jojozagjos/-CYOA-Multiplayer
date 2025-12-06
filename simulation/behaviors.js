// behaviors.js - State selection and behavioral logic

const STATES = {
  IDLE: 'idle',
  WANDER: 'wander',
  SEEK_FOOD: 'seek_food',
  EAT: 'eat',
  FLEE: 'flee',
  SEEK_MATE: 'seek_mate',
  COURTSHIP: 'courtship',
  REPRODUCE: 'reproduce',
  REST: 'rest',
  SEEK_SHELTER: 'seek_shelter',
  SURFACE_FOR_AIR: 'surface_for_air',
  SEEK_DEPTH: 'seek_depth',
  SCHOOL: 'school', // for aquatic group behavior
  GUARD: 'guard', // civilization
  GATHER: 'gather', // civilization
  RETURN_HOME: 'return_home' // civilization
};

function selectState(creature, type, urgencies, world) {
  if (!creature || !type || !urgencies) {
    return { state: 'idle', events: [] };
  }
  
  let newState = creature.state || STATES.IDLE;
  let maxUrgency = 0;
  const events = [];

  // Priority system - higher urgencies override lower ones
  const statePriorities = [
    { urgency: urgencies.fear, state: STATES.FLEE, threshold: 0.25 },
    { urgency: urgencies.oxygen, state: STATES.SURFACE_FOR_AIR, threshold: 0.7 },
    { urgency: urgencies.hunger, state: STATES.SEEK_FOOD, threshold: 0.3 },
    { urgency: urgencies.depth, state: STATES.SEEK_DEPTH, threshold: 0.5 },
    { urgency: urgencies.waterTemp, state: STATES.SEEK_SHELTER, threshold: 0.6 },
    { urgency: urgencies.temperature, state: STATES.SEEK_SHELTER, threshold: 0.6 },
    { urgency: urgencies.reproduction * 0.7, state: STATES.SEEK_MATE, threshold: 0.4 },
    { urgency: urgencies.fatigue * 0.9, state: STATES.REST, threshold: 0.7 }
  ];

  for (const priority of statePriorities) {
    if (priority.urgency > priority.threshold && priority.urgency > maxUrgency) {
      maxUrgency = priority.urgency;
      newState = priority.state;
    }
  }

  // Default states when no urgency is high
  if (maxUrgency < 0.2) {
    // Activity level affects idle vs wander choice
    const activityThreshold = 0.6 * creature.personality.activity;
    newState = (creature.energy > activityThreshold) ? STATES.WANDER : STATES.IDLE;
  }

  // Special transitions
  if (creature.state === STATES.SEEK_FOOD && creature.atFood) {
    newState = STATES.EAT;
  }

  if (creature.state === STATES.SEEK_MATE && creature.nearMate) {
    newState = STATES.COURTSHIP;
  }

  // State change event
  if (newState !== creature.state) {
    events.push({ 
      creatureId: creature.id, 
      type: 'stateChange', 
      oldState: creature.state,
      state: newState 
    });
    
    // Emit specific sound events for certain transitions
    if (newState === STATES.FLEE) {
      events.push({ creatureId: creature.id, type: 'sound', sound: 'alarm' });
    } else if (newState === STATES.COURTSHIP) {
      events.push({ creatureId: creature.id, type: 'sound', sound: 'mating' });
    } else if (newState === STATES.EAT) {
      events.push({ creatureId: creature.id, type: 'sound', sound: 'feeding' });
    } else if (newState === STATES.SURFACE_FOR_AIR) {
      events.push({ creatureId: creature.id, type: 'sound', sound: 'surfacing' });
    }
  }

  creature.state = newState;
  return { state: newState, events };
}

function applyStateEffects(creature, type, dt) {
  const effects = [];

  switch (creature.state) {
    case STATES.REST:
      // Restore energy while resting
      creature.energy = Math.min(1, creature.energy + 0.002 * dt);
      break;

    case STATES.FLEE:
      // Fleeing drains energy and increases hunger faster
      creature.energy = Math.max(0, creature.energy - 0.001 * dt);
      creature.hunger = Math.min(5, creature.hunger + 0.001 * dt);
      break;

    case STATES.EAT:
      // Eating handled elsewhere, but increases energy slightly
      creature.energy = Math.min(1, creature.energy + 0.0005 * dt);
      break;

    case STATES.SURFACE_FOR_AIR:
      // Restore oxygen when surfacing
      if (creature.oxygen < 1) {
        creature.oxygen = Math.min(1, creature.oxygen + 0.005 * dt);
        if (creature.oxygen > 0.8) {
          effects.push({ creatureId: creature.id, type: 'surfaceComplete' });
        }
      }
      break;

    case STATES.WANDER:
      // Slight energy drain from activity
      creature.energy = Math.max(0, creature.energy - 0.0003 * dt);
      break;

    case STATES.COURTSHIP:
      // Courtship drains energy
      creature.energy = Math.max(0, creature.energy - 0.0007 * dt);
      break;
  }

  return effects;
}

module.exports = { STATES, selectState, applyStateEffects };
