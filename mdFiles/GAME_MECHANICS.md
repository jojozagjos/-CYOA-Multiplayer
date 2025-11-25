# Game Mechanics - Situation-Based Survival

## Overview
This is an **auto-advancing survival game** where players face procedurally generated situations, collect items, and try to survive 16 encounters.

## Core Changes from Dice-Based System

### Old System (Removed)
- ❌ Players typed actions
- ❌ Dice rolls determined success/failure  
- ❌ Group voting on proposals
- ❌ Turn-based individual/group phases

### New System (Current)
- ✅ Automatic situation generation
- ✅ Fixed damage/healing (no dice)
- ✅ Item-based healing system
- ✅ Auto-advancing every 3 seconds
- ✅ Procedural events (threats, discoveries, neutral)

## Situation Types

### 🔴 Threat Situations (45%)
Random player takes **fixed damage** based on threat type:
- Light threats: 2 damage
- Medium threats: 3 damage  
- Heavy threats: 4 damage

**Examples:**
- "A skeletal guardian lunges from the shadows!" (3 damage)
- "Poisonous gas seeps from cracks!" (2 damage)
- "The floor collapses beneath your feet!" (2 damage)

### 💚 Discovery Situations (35%)
Random player finds something helpful:

**Items (added to inventory):**
- Healing Potion (heals 3 HP, self-use)
- Bandages (heals 2 HP, self-use)
- Med-Kit (heals 4 HP, self-use)
- Revival Herb (heals 2 HP, can target others)
- Defibrillator (heals 3 HP, can target others)
- Trauma Kit (heals 5 HP, can target others)

**Instant Healing:**
- Safe alcove (+2 HP immediately)
- Clean water (+1 HP immediately)
- Medical bay (+3 HP immediately)

### ⚪ Neutral Situations (20%)
Atmospheric events with no mechanical effects:
- "Strange carvings on the wall tell a story"
- "Distant sounds of chains rattling"
- "Emergency lights flicker and change color"

## Inventory System

### Item Usage
- Items appear in player's inventory panel
- Click "Use" button to consume item
- Self-use items only heal the user
- Targetable items (currently) also self-use (could be expanded)
- Items are **one-time use** and removed after consumption

### Item Distribution
Items are **theme-specific**:
- **Dungeon:** Healing potions, bandages, revival herbs
- **Space Station:** Med-kits, stimpacks, defibrillators
- **Mansion:** Old medicine, holy water, medical bags
- **Cyberpunk:** Nano-injectors, street med-kits, trauma kits

## Progression

### Auto-Advance Timing
1. Situation appears with text description
2. **3 second pause** for players to read
3. Situation resolves automatically:
   - Threats → damage applied
   - Discoveries → item/heal granted
   - Neutral → story log entry added
4. Next situation generated immediately
5. Repeat until win/loss

### Win/Loss Conditions

**Victory:**
- At least 1 player survives all 16 encounters
- Survivors celebrate their escape

**Defeat:**
- All players reach 0 HP
- Game over message displayed

## Procedural Variety

### Randomization Layers
1. **Situation type** - 45/35/20 weighted random
2. **Event selection** - Random pick from theme pool
3. **Target selection** - Random alive player
4. **Motif flavor** - Random atmospheric element

### Avoiding Repetition
- Each theme has 5 threats, 5 discoveries, 4 neutral events
- 4 motifs per theme
- Total possible combinations: **400+ unique situations per theme**
- Same exact situation appearing twice: **<1% probability**

## Theme-Specific Content

### Dungeon
- **Threats:** Skeletal guardians, poison gas, floor collapses
- **Items:** Potions, bandages, herbs
- **Atmosphere:** Dripping water, whispers, rusted gates

### Space Station  
- **Threats:** Rogue drones, infected crew, airlock breaches
- **Items:** Med-kits, stimpacks, defibrillators
- **Atmosphere:** Metal groans, alarms, gravity fluctuations

### Haunted Mansion
- **Threats:** Restless spirits, possessed dolls, masked intruders
- **Items:** Old medicine, holy water, medical bags
- **Atmosphere:** Creaking floors, cold drafts, piano melodies

### Cyberpunk City
- **Threats:** Street enforcers, rogue androids, corporate crossfire
- **Items:** Nano-injectors, street med-kits, trauma kits
- **Atmosphere:** Drones, glitching holograms, sirens

## Player Stats

- **HP:** 10 max, starts at 10
- **Alive status:** Becomes false when HP reaches 0
- **Inventory:** Unlimited slots for items
- **No other stats** (no strength, defense, etc.)
