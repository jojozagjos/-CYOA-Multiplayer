# Quick Start Guide

## Installation
```bash
npm install
```

## Running the Simulation
```bash
npm start
```

Then open `http://localhost:3000` in your browser.

## Creating Your First Creature

1. **Enter your display name** in the main menu
2. Click **"New World"**
3. Configure your world (size, climate, etc.)
4. Click **"Create World"**
5. In the game, click the **Species Panel** (right side)
6. Click **"Create New Species"**
7. **Record a sound** (this will be used contextually: idle, alarm, mating, etc.)
8. **Draw or upload an image** for your creature
9. Set species traits:
   - **Diet**: herbivore, carnivore, omnivore
   - **Habitat**: land or water
   - **Size**: affects visual size and interactions
   - **Speed**: base movement speed
   - **Preferred Temperature**: comfort zone
   - For aquatic: **Preferred Depth**, **Needs Air**
10. Click **"Create Species"**
11. Click the species in the list to enter spawn mode
12. Click on the map to spawn creatures (max 10 per species)

## What to Observe

### Need-Driven Behaviors
- **Hungry creatures** seek high-food tiles (green areas)
- **Tired creatures** rest and stop moving
- **Frightened creatures** flee from larger carnivores
- **Adult creatures** seek mates when well-fed

### Personality Variations
- Some creatures are **bold** (approach threats closely)
- Some are **active** (wander more)
- Some are **curious** (explore further)
- Some are **social** (seek mates eagerly)

### Aquatic Features
- Water creatures **surface for air** when oxygen is low
- They seek their **preferred depth**
- **Schooling behavior** (future feature)
- Smooth, curved swimming paths

### Audio System
- **Alarm calls** when fleeing
- **Mating calls** during courtship
- **Feeding sounds** while eating
- Sounds **fade with distance** from camera
- **Stereo panning**: creatures on left/right of screen pan audio

### Animations
- **Smooth position lerping** prevents jittering
- **Walking/swimming cycles** with rotation
- **State-specific speeds**: flee is fast, rest is slow
- **Idle breathing** when stationary
- **Size changes** through life stages (juvenile → adult → elderly)

### Environment
- **Seasonal cycles**: temperature and moisture shift
- **Weather events**: heatwaves, cold snaps, rain, drought
  - Watch for temperature spikes causing migrations
- **Food regeneration**: tiles slowly regrow vegetation
- **Vegetation growth**: bushes and trees appear in fertile areas

### Lifecycle
- **Juveniles**: smaller, weaker, can't reproduce
- **Adults**: full size, can mate
- **Elderly**: slower, declining health
- **Trait inheritance**: offspring have blended traits + mutations
- **Hybrid species**: different species can crossbreed

### Evolution Over Time
- Traits mutate slightly each generation
- **Heat tolerance** adapts to local climate
- **Speed** optimizes for survival
- **Size** varies based on resource availability
- Watch for species divergence across different biomes!

## Controls

### Camera
- **Drag** to pan
- **Mouse wheel** to zoom
- **ESC** to cancel spawn mode

### World View Modes
- **Biome**: see terrain types
- **Food**: see resource density (green = high food)
- **Temperature**: see heat/cold zones

### Powers (unlock with XP)
- **Terraform**: modify terrain
- More powers coming soon!

## Tips

1. **Start with herbivores** - they're easier to sustain
2. **Create diverse habitats** - forests, grasslands, water
3. **Watch the family tree** - click creatures to see lineage
4. **Monitor hunger** - creatures die if starved
5. **Aquatic species** need water tiles (blue areas)
6. **Speed affects**: 
   - **Slow mode** (0.5x): watch behaviors closely
   - **Fast mode** (2x): see populations evolve rapidly

## Troubleshooting

**Creatures dying too fast?**
- Hunger rate is balanced for 1x speed
- Ensure enough food tiles (green/forest biomes)
- Slow down time to observe what's happening

**No sound?**
- Check browser audio permissions
- Adjust volume in settings
- Make sure you recorded a sound when creating the species

**Creatures not reproducing?**
- They need to be adults (age > 50)
- Must have low hunger
- Reproduction has a cooldown (200 ticks)
- Mates must be nearby

**Performance issues?**
- Reduce creature count
- Enable "Reduce Effects" in settings
- Lower simulation speed

## Next Features (Not Yet Implemented)

- **Civilizations**: village formation, territories
- **Predation**: carnivores hunting prey
- **Schooling**: group movement for fish
- **Disease**: health system
- **Player god powers**: lightning, rainfall, etc.

## File Structure

All simulation logic is modular:

**Server** (`/simulation/`):
- `needs.js` - Hunger, energy, fear, etc.
- `behaviors.js` - State machine
- `movement.js` - Physics and pathfinding
- `environment.js` - Weather, seasons, tiles
- `lifecycle.js` - Birth, growth, death, evolution

**Client** (`/public/js/`):
- `audio.js` - Spatial sound system
- `animation.js` - Smooth rendering

See `ARCHITECTURE.md` for full technical details.

## Have Fun!

Experiment! Create weird species, watch ecosystems emerge, and enjoy the chaos of evolution!
