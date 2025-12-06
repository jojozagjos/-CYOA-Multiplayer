# LIFE Simulation - Modular Architecture

## Overview
The simulation has been refactored into a clean, modular architecture separating concerns across multiple files.

## Server Modules (`/simulation/`)

### needs.js
- **Purpose**: Creature need evaluation and urgency computation
- **Functions**:
  - `initializeNeeds(creature, type)` - Set up personality traits, energy, oxygen
  - `evaluateNeeds(creature, type, tile, creatures, world, dt)` - Compute urgencies for hunger, fear, temperature, reproduction, oxygen, depth

- **Features**:
  - Personality traits: boldness, activity, curiosity, socialness
  - Micro-variations prevent clone behavior
  - Aquatic-specific needs (oxygen, depth comfort, water temperature)

### behaviors.js
- **Purpose**: State selection and behavioral logic
- **States**: idle, wander, seek_food, eat, flee, seek_mate, courtship, reproduce, rest, seek_shelter, surface_for_air, seek_depth, school, guard, gather, return_home

- **Functions**:
  - `selectState(creature, type, urgencies, world)` - Choose state based on highest urgency
  - `applyStateEffects(creature, type, dt)` - Apply energy/hunger changes per state

- **Features**:
  - Priority-based state machine
  - Smooth transitions with blend weights
  - Contextual sound event emission

### movement.js
- **Purpose**: Smooth, purposeful movement with personality variations
- **Functions**:
  - `updateMovement(creature, type, world, dt)` - Update velocity and position
  - `initializeVelocity(creature)` - Set up movement properties

- **Features**:
  - State-specific movement speeds (flee faster, rest slower)
  - Curved paths for aquatic creatures
  - Personality affects speed and wandering
  - Smooth friction-based deceleration

### environment.js
- **Purpose**: Tile regeneration, weather, seasonal cycles
- **Functions**:
  - `updateEnvironment(world, dt)` - Update all tiles and weather events

- **Features**:
  - Seasonal temperature/moisture cycles
  - Weather events: heatwaves, cold snaps, rain, drought
  - Food regeneration based on biome and moisture
  - Vegetation growth and death
  - Water tile algae/plankton regeneration

### lifecycle.js
- **Purpose**: Growth, aging, reproduction, death, trait inheritance
- **Functions**:
  - `updateLifecycle(creature, type, dt)` - Age creature and update life stage
  - `attemptReproduction(creature, mate, types, world)` - Create offspring with inheritance
  - `checkDeath(creature, type)` - Check death conditions

- **Features**:
  - Life stages: juvenile, young_adult, adult, elderly
  - Trait inheritance with mutations
  - Personality inheritance from parents
  - Hybrid species creation with blended traits
  - Multiple death causes: starvation, old age, temperature, stranding

## Client Modules (`/public/js/`)

### audio.js
- **Purpose**: Contextual sound playback with spatial positioning
- **Class**: `AudioManager`
- **Features**:
  - Distance-based volume falloff
  - Stereo panning based on creature position
  - Context-specific sounds: idle, feeding, alarm, mating, surfacing, death
  - Cooldown system prevents sound spam
  - Aquatic sounds are muffled and less frequent

### animation.js
- **Purpose**: Smooth animation blending and state-based rendering
- **Class**: `AnimationManager`
- **Features**:
  - Position lerping for ultra-smooth movement
  - Rotation lerping for walking/swimming animation
  - State-specific animation speeds and amplitudes
  - Idle breathing/bobbing effects
  - Life stage size multipliers
  - Personality-based animation variations

## Integration Points

### Server (`server.js`)
```javascript
const { initializeNeeds, evaluateNeeds } = require('./simulation/needs');
const { selectState, applyStateEffects, STATES } = require('./simulation/behaviors');
const { updateMovement, initializeVelocity } = require('./simulation/movement');
const { updateEnvironment } = require('./simulation/environment');
const { updateLifecycle, attemptReproduction, checkDeath } = require('./simulation/lifecycle');
```

### Client (`index.html`)
```html
<script src="/js/audio.js"></script>
<script src="/js/animation.js"></script>
<script src="/client.js"></script>
```

### Client (`client.js`)
```javascript
// Use audioManager singleton
audioManager.setSettings(settings);
audioManager.handleCreatureEvents(events, creatures, creatureTypes, camera, worldSize);

// Use animationManager singleton
const anim = animationManager.updateCreature(creature, dt);
const pos = animationManager.getLerpedPosition(creature, worldSize, width, height);
const rotation = animationManager.getWalkRotation(creature, type);
```

## Event Flow

1. **Server Tick**:
   - `updateEnvironment()` → tiles, weather, seasons
   - For each creature:
     - `initializeNeeds()` → setup
     - `updateLifecycle()` → aging, growth
     - `evaluateNeeds()` → compute urgencies
     - `selectState()` → pick behavior state → emit events
     - `applyStateEffects()` → modify needs
     - `updateMovement()` → velocity, position
     - `attemptReproduction()` if seeking mate
     - `checkDeath()` → remove if dead
   - Emit `creatureEvents` to clients

2. **Client Receive**:
   - `socket.on('creatureEvents')` → `audioManager.handleCreatureEvents()`
   - Plays contextual sounds based on distance and state

3. **Client Render Loop**:
   - For each creature:
     - `animationManager.updateCreature()` → update animation state
     - `animationManager.getLerpedPosition()` → smooth position
     - `animationManager.getWalkRotation()` → walking animation
     - Draw with lerped values

## Testing

### Start the Server
```bash
npm start
```

### Expected Behaviors

**Needs-Based Actions**:
- Hungry creatures seek food tiles and eat
- Tired creatures rest and recover energy
- Frightened creatures flee from predators
- Adult creatures seek mates and reproduce

**Personality Variations**:
- Bold creatures approach threats closer
- Active creatures wander more
- Curious creatures explore further
- Social creatures seek mates more readily

**Aquatic Creatures**:
- Surface for air when oxygen low
- Seek preferred depth zones
- Respond to water temperature
- Smooth, curved swimming paths

**Audio**:
- Alarm calls when fleeing
- Mating calls during courtship
- Feeding sounds while eating
- Sounds fade with distance
- Stereo panning based on position

**Animation**:
- Smooth position interpolation
- Walking/swimming rotation cycles
- State-specific animation speeds
- Idle breathing effects
- Size changes through life stages

**Environment**:
- Seasonal temperature shifts
- Weather events (heatwaves, rain, etc.)
- Food regeneration in biomes
- Vegetation growth and death

**Lifecycle**:
- Juveniles smaller and weaker
- Adults can reproduce
- Elderly move slower
- Trait inheritance with mutations
- Hybrid species creation

## Next Steps (Not Yet Implemented)

### Civilizations
- Center formation around resource clusters
- Territory marking and defense
- Home-returning behavior
- Tech progression

### Additional Features
- Predation and carnivore hunting
- Schooling behavior for fish
- Migration patterns
- Disease and health systems
- Player god powers integration

## File Structure
```
-LIFE-Multiplayer/
├── server.js (main server, imports simulation modules)
├── simulation/
│   ├── needs.js
│   ├── behaviors.js
│   ├── movement.js
│   ├── environment.js
│   └── lifecycle.js
├── public/
│   ├── client.js (main client, uses audio/animation modules)
│   ├── index.html
│   ├── styles.css
│   └── js/
│       ├── audio.js
│       └── animation.js
└── data/
    └── worlds.json
```

## Performance Notes

- Modular code is easier to optimize per-system
- Audio cooldowns prevent performance issues from sound spam
- Animation lerping is frame-independent
- Environment updates can be throttled if needed
- Death checks prevent unbounded creature growth
