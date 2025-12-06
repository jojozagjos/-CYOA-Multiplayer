// environment.js - Tile regeneration, weather, seasonal cycles

function updateEnvironment(world, dt) {
  if (!world || !world.tiles) return { season: 0, weatherEvents: [] };
  
  const tiles = world.tiles;
  const size = world.size;
  
  // Update world time and seasonal cycle
  world.time = (world.time || 0) + dt;
  const yearLength = 10000; // ticks per year
  const seasonPhase = (world.time % yearLength) / yearLength;
  const season = Math.sin(seasonPhase * Math.PI * 2); // -1 to 1

  // Weather events (heatwaves, cold snaps, rain)
  if (!world.weatherEvents) world.weatherEvents = [];
  
  // Chance to spawn new weather event
  if (Math.random() < 0.0001 * dt) {
    const eventTypes = ['heatwave', 'coldsnap', 'rain', 'drought'];
    const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
    
    world.weatherEvents.push({
      type: eventType,
      centerX: Math.floor(Math.random() * size),
      centerY: Math.floor(Math.random() * size),
      radius: 5 + Math.floor(Math.random() * 10),
      intensity: 0.5 + Math.random() * 0.5,
      duration: 200 + Math.floor(Math.random() * 500),
      age: 0
    });
  }

  // Update and age weather events
  for (let i = world.weatherEvents.length - 1; i >= 0; i--) {
    const event = world.weatherEvents[i];
    event.age += dt;
    
    if (event.age > event.duration) {
      world.weatherEvents.splice(i, 1);
    }
  }

  // Update each tile
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tile = tiles[y][x];
      
      // Base temperature with seasonal variation
      tile.temp = tile.tempBase + season * 5;
      tile.moist = Math.max(0, Math.min(1, tile.moistBase + season * 0.1));

      // Apply weather effects
      for (const event of world.weatherEvents) {
        const dx = x - event.centerX;
        const dy = y - event.centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < event.radius) {
          const influence = (event.radius - dist) / event.radius * event.intensity;
          
          switch (event.type) {
            case 'heatwave':
              tile.temp += influence * 15;
              tile.moist = Math.max(0, tile.moist - influence * 0.3);
              break;
            case 'coldsnap':
              tile.temp -= influence * 15;
              break;
            case 'rain':
              tile.moist = Math.min(1, tile.moist + influence * 0.4);
              tile.food = Math.min(30, tile.food + influence * 0.5 * dt);
              break;
            case 'drought':
              tile.moist = Math.max(0, tile.moist - influence * 0.3);
              break;
          }
        }
      }

      // Food regeneration based on biome and moisture
      if (tile.biome !== 'water' && tile.biome !== 'mountain') {
        const regenRate = 0.01 * dt * (0.5 + tile.moist);
        const maxFood = tile.biome === 'forest' ? 40 : (tile.biome === 'grass' ? 30 : 20);
        tile.food = Math.min(tile.food + regenRate, maxFood);

        // Vegetation growth
        if (!tile.vegetation && tile.food > 10) {
          if (tile.biome === 'grass' && Math.random() < 0.0001 * dt * tile.moist) {
            tile.vegetation = Math.random() < 0.3 ? 'bush' : null;
            if (tile.vegetation) tile.food += 3;
          } else if (tile.biome === 'forest' && Math.random() < 0.0002 * dt * tile.moist) {
            tile.vegetation = Math.random() < 0.7 ? 'tree' : 'bush';
            if (tile.vegetation === 'bush') tile.food += 3;
            if (tile.vegetation === 'tree') tile.food += 5;
          }
        }

        // Vegetation death in extreme conditions
        if (tile.vegetation && (tile.temp < -10 || tile.temp > 45 || tile.moist < 0.1)) {
          if (Math.random() < 0.001 * dt) {
            tile.vegetation = null;
            tile.food = Math.max(0, tile.food - 5);
          }
        }
      }

      // Water tile regeneration (algae/plankton)
      if (tile.biome === 'water') {
        const waterRegenRate = 0.008 * dt;
        tile.food = Math.min(tile.food + waterRegenRate, 25);
        
        // Water temperature affects oxygen
        if (tile.waterTemp === undefined) tile.waterTemp = tile.temp;
        tile.waterTemp = tile.temp * 0.9; // Water moderates temperature
        
        // Depth affects oxygen levels
        if (tile.oxygen === undefined) tile.oxygen = 1.0;
        const depthFactor = Math.max(0.5, 1 - (tile.depth || 0) * 0.05);
        tile.oxygen = Math.min(1, tile.oxygen + 0.001 * dt * depthFactor);
      }
    }
  }

  return { season, weatherEvents: world.weatherEvents };
}

module.exports = { updateEnvironment };
