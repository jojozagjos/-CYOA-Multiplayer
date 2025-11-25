// gameLogic.js
// Core game state + simple procedural narrator (no external AI).

const THEMES = {
  dungeon: {
    name: 'Dark Dungeon',
    intro: 'You awaken in a damp stone chamber deep beneath the earth. Torches flicker on the walls, casting long shadows.',
    motifs: ['echoing footsteps', 'distant dripping water', 'whispers behind the walls', 'rusted iron gates'],
    threats: [
      { desc: 'a skeletal guardian lunges from the shadows', damage: 3 },
      { desc: 'poisonous gas seeps from cracks in the walls', damage: 2 },
      { desc: 'a shadowy warden strikes with its rusty blade', damage: 3 },
      { desc: 'the floor collapses beneath your feet', damage: 2 },
      { desc: 'a crawling horror emerges from the darkness', damage: 4 }
    ],
    discoveries: [
      { desc: 'a dusty healing potion on a skeleton', item: 'healing_potion' },
      { desc: 'ancient bandages in a forgotten chest', item: 'bandages' },
      { desc: 'a warm safe alcove to rest', heal: 2 },
      { desc: 'a mysterious glowing herb', item: 'revival_herb' },
      { desc: 'clean water dripping from the ceiling', heal: 1 }
    ],
    neutralEvents: [
      { desc: 'strange carvings on the wall that seem to tell a story' },
      { desc: 'a locked door that requires all of you to push together' },
      { desc: 'an eerie silence fills the corridor' },
      { desc: 'distant sounds of chains rattling' }
    ]
  },
  space: {
    name: 'Derelict Space Station',
    intro: 'You come to in a dimly lit control room aboard a damaged space station. Emergency lights pulse red.',
    motifs: ['metal groans in the distance', 'air vents hiss', 'alarms briefly chirp then cut out', 'gravity fluctuates slightly'],
    threats: [
      { desc: 'a rogue maintenance drone fires its laser', damage: 3 },
      { desc: 'an infected crew member attacks wildly', damage: 3 },
      { desc: 'toxic gas vents from a broken pipe', damage: 2 },
      { desc: 'an airlock breach pulls you toward space', damage: 4 },
      { desc: 'electrical sparks shock you as systems malfunction', damage: 2 }
    ],
    discoveries: [
      { desc: 'a med-kit in an emergency locker', item: 'medkit' },
      { desc: 'stimpacks in the medical bay', item: 'stimpack' },
      { desc: 'a functioning cryo-pod for quick healing', heal: 3 },
      { desc: 'emergency rations with nano-healing', heal: 1 },
      { desc: 'a portable defibrillator', item: 'defibrillator' }
    ],
    neutralEvents: [
      { desc: 'the gravity stabilizes momentarily' },
      { desc: 'you find a terminal with partial access to station logs' },
      { desc: 'a window reveals the vastness of space outside' },
      { desc: 'emergency lights flicker and change color' }
    ]
  },
  mansion: {
    name: 'Haunted Mansion',
    intro: 'You stand in the foyer of a crumbling mansion. Dust motes drift through slivers of moonlight.',
    motifs: ['floorboards creak', 'cold drafts slip under doors', 'portraits seem to watch you', 'distant piano keys press themselves'],
    threats: [
      { desc: 'a restless spirit screams and drains your life force', damage: 3 },
      { desc: 'a possessed doll slashes with a hidden blade', damage: 2 },
      { desc: 'the floor gives way and you fall into the basement', damage: 3 },
      { desc: 'a masked intruder attacks from behind a curtain', damage: 4 },
      { desc: 'supernatural cold freezes you to the bone', damage: 2 }
    ],
    discoveries: [
      { desc: 'old medicine in a dusty cabinet', item: 'old_medicine' },
      { desc: 'blessed water in the chapel', item: 'holy_water' },
      { desc: 'a warm fireplace to rest by', heal: 2 },
      { desc: 'herbal tea in the kitchen', heal: 1 },
      { desc: 'a medical bag from a previous visitor', item: 'medical_bag' }
    ],
    neutralEvents: [
      { desc: 'a portrait\'s eyes seem to follow your movements' },
      { desc: 'you discover a hidden passage behind a bookshelf' },
      { desc: 'moonlight illuminates a cryptic message on the wall' },
      { desc: 'the piano plays a haunting melody by itself' }
    ]
  },
  cyber: {
    name: 'Neon City Backstreets',
    intro: 'Rain beats down on glowing alleyways. Neon signs flicker overhead, reflecting in puddles at your feet.',
    motifs: ['drones buzz past', 'holographic ads glitch', 'sirens wail in the distance', 'data streams cascade across building walls'],
    threats: [
      { desc: 'a street enforcer fires their neural disruptor', damage: 3 },
      { desc: 'a rogue android tackles you into a wall', damage: 3 },
      { desc: 'you\'re caught in corporate crossfire', damage: 4 },
      { desc: 'a data jack feedback loop shocks your nervous system', damage: 2 },
      { desc: 'toxic runoff from a factory burns your skin', damage: 2 }
    ],
    discoveries: [
      { desc: 'nano-heal injectors in a dropped case', item: 'nano_injector' },
      { desc: 'a street doc\'s emergency kit', item: 'street_medkit' },
      { desc: 'a safe clinic where you can get treatment', heal: 3 },
      { desc: 'energy drinks with healing nanobots', heal: 1 },
      { desc: 'a portable trauma kit', item: 'trauma_kit' }
    ],
    neutralEvents: [
      { desc: 'you find a vantage point overlooking the city' },
      { desc: 'a friendly AI offers cryptic advice' },
      { desc: 'the rain intensifies, creating digital interference' },
      { desc: 'you overhear a conversation about nearby dangers' }
    ]
  }
};

const ITEM_TYPES = {
  healing_potion: { name: 'Healing Potion', heal: 3, targetOther: false },
  bandages: { name: 'Bandages', heal: 2, targetOther: false },
  revival_herb: { name: 'Revival Herb', heal: 2, targetOther: true },
  medkit: { name: 'Med-Kit', heal: 4, targetOther: false },
  stimpack: { name: 'Stimpack', heal: 2, targetOther: false },
  defibrillator: { name: 'Defibrillator', heal: 3, targetOther: true },
  old_medicine: { name: 'Old Medicine', heal: 2, targetOther: false },
  holy_water: { name: 'Holy Water', heal: 3, targetOther: false },
  medical_bag: { name: 'Medical Bag', heal: 4, targetOther: true },
  nano_injector: { name: 'Nano-Injector', heal: 3, targetOther: false },
  street_medkit: { name: 'Street Med-Kit', heal: 3, targetOther: false },
  trauma_kit: { name: 'Trauma Kit', heal: 5, targetOther: true }
};

const MAX_HP = 10;
const MAX_TURNS = 16;

function createLobbyState(lobbyId) {
  return {
    lobbyId,
    createdAt: Date.now(),
    players: [], // { id, name, isHost, character, hp, alive, themeVote, connected, inventory: [] }
    phase: 'CHARACTER_CREATION', // CHARACTER_CREATION, THEME_VOTE, IN_PROGRESS, ENDED
    themeKey: null,
    themeName: null,
    availableThemes: Object.keys(THEMES).map(k => ({ key: k, label: THEMES[k].name, intro: THEMES[k].intro })),
    storyLog: [],
    currentTurnIndex: 0,
    currentSituation: null,
    campaignId: `cmp_${lobbyId}_${Date.now()}`,
    turnCount: 0,
    storyIntro: null
  };
}

function joinLobbyState(lobby, playerId, playerName, isHost) {
  let existing = lobby.players.find(p => p.id === playerId);
  if (!existing) {
    existing = {
      id: playerId,
      name: playerName || 'Player',
      isHost: !!isHost,
      character: null,
      hp: MAX_HP,
      alive: true,
      themeVote: null,
      connected: true,
      inventory: []
    };
    lobby.players.push(existing);
  } else {
    existing.connected = true;
    if (playerName) existing.name = playerName;
    if (!existing.inventory) existing.inventory = [];
  }
}

function registerThemeVote(lobby, playerId, themeKey) {
  const p = lobby.players.find(p => p.id === playerId);
  if (!p || lobby.phase !== 'THEME_VOTE') return;
  // Accept votes for either built-in THEMES or lobby.availableThemes
  const inBuilt = !!THEMES[themeKey];
  const inLobby = (lobby.availableThemes || []).some(t => t.key === themeKey);
  if (!inBuilt && !inLobby) return;
  p.themeVote = themeKey;
}

function setCharacterForPlayer(lobby, playerId, character) {
  const p = lobby.players.find(p => p.id === playerId);
  if (!p || lobby.phase !== 'CHARACTER_CREATION') return;
  p.character = {
    name: character.name || p.name,
    role: character.role || 'Adventurer',
    trait: character.trait || 'Determined',
    image: character.image || null
  };
  // Character saved. The host will start the theme vote when ready.
}

function startThemeVote(lobby, requestingPlayerId) {
  if (lobby.phase !== 'CHARACTER_CREATION') return false;
  const requester = lobby.players.find(p => p.id === requestingPlayerId);
  if (!requester || !requester.isHost) return false;
  const allHaveChars = lobby.players.length > 0 && lobby.players.every(pl => pl.character);
  if (!allHaveChars) return false;
  lobby.phase = 'THEME_VOTE';
  lobby.storyLog.push({ type: 'system', text: 'The host has started theme voting. Cast your votes!' });
  return true;
}

function maybeStartGameIfReady(lobby, force = false) {
  if (lobby.phase !== 'CHARACTER_CREATION') return false;
  const allHaveChars = lobby.players.length > 0 && lobby.players.every(p => p.character);
  if (!allHaveChars && !force) return false;

  lobby.phase = 'IN_PROGRESS';
  lobby.currentTurnIndex = 0;
  lobby.turnCount = 0;
  lobby.currentSituation = createNewSituation(lobby);
  return true;
}

function startGameAfterCredits(lobby) {
  // Called after credits finish - create detailed intro and first situation
  if (lobby.phase !== 'IN_PROGRESS' || lobby.creditsComplete) return false;
  lobby.creditsComplete = true;
  
  // Generate detailed story intro
  const theme = THEMES[lobby.themeKey] || THEMES['dungeon'];
  const playerNames = lobby.players.map(p => p.character ? p.character.name : p.name).join(', ');
  
  lobby.storyIntro = `${theme.intro}\n\nYour party consists of: ${playerNames}.\n\nYou must work together to survive the dangers ahead. Each of you carries nothing but your wits and determination. Resources are scarce, and every decision matters.`;
  
  lobby.currentSituation = createNewSituation(lobby);
  return true;
}

function createNewSituation(lobby) {
  const theme = THEMES[lobby.themeKey] || THEMES['dungeon'];
  const alivePlayers = lobby.players.filter(p => p.alive);
  if (alivePlayers.length === 0) return null;

  const motif = theme.motifs[Math.floor(Math.random() * theme.motifs.length)];
  
  // Random weights: 50% threat, 15% discovery, 35% neutral (items are rare)
  const rand = Math.random();
  let situationType, eventData, text;
  
  if (rand < 0.50) {
    // Threat situation
    const threat = theme.threats[Math.floor(Math.random() * theme.threats.length)];
    const targetPlayer = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
    
    situationType = 'threat';
    eventData = {
      threat: threat,
      targetPlayerId: targetPlayer.id,
      targetPlayerName: targetPlayer.character ? targetPlayer.character.name : targetPlayer.name
    };
    
    text = `${motif.charAt(0).toUpperCase() + motif.slice(1)}. Suddenly, ${threat.desc}!`;
    
  } else if (rand < 0.65) {
    // Discovery situation
    const discovery = theme.discoveries[Math.floor(Math.random() * theme.discoveries.length)];
    const finderPlayer = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
    
    situationType = 'discovery';
    eventData = {
      discovery: discovery,
      finderPlayerId: finderPlayer.id,
      finderPlayerName: finderPlayer.character ? finderPlayer.character.name : finderPlayer.name
    };
    
    text = `${motif.charAt(0).toUpperCase() + motif.slice(1)}. ${finderPlayer.character ? finderPlayer.character.name : finderPlayer.name} discovers ${discovery.desc}.`;
    
  } else {
    // Neutral/story event
    const neutral = theme.neutralEvents[Math.floor(Math.random() * theme.neutralEvents.length)];
    
    situationType = 'neutral';
    eventData = { description: neutral.desc };
    
    text = `${motif.charAt(0).toUpperCase() + motif.slice(1)}. ${neutral.desc.charAt(0).toUpperCase() + neutral.desc.slice(1)}.`;
  }

  // Determine if individual or group situation
  const isIndividual = situationType === 'threat' && Math.random() < 0.5;
  
  if (isIndividual) {
    const currentPlayer = alivePlayers[lobby.currentTurnIndex % alivePlayers.length];
    return {
      type: 'individual',
      situationType: situationType,
      text,
      eventData,
      currentPlayerId: currentPlayer.id,
      currentPlayerName: currentPlayer.character ? currentPlayer.character.name : currentPlayer.name,
      resolved: false,
      actionTaken: null
    };
  } else {
    return {
      type: 'group',
      situationType: situationType,
      text,
      eventData,
      proposals: [],
      votes: {},
      resolved: false
    };
  }
}

// Handle player actions (individual situations)
function handlePlayerAction(lobby, playerId, actionText, itemToUse = null) {
  if (lobby.phase !== 'IN_PROGRESS') return;
  const situation = lobby.currentSituation;
  if (!situation || situation.type !== 'individual') return;
  if (situation.currentPlayerId !== playerId) return;
  
  const player = lobby.players.find(p => p.id === playerId);
  if (!player || !player.alive) return;
  
  const cleaned = (actionText || '').trim();
  if (!cleaned) return;
  
  // Validate item if provided
  let itemUsed = null;
  if (itemToUse) {
    const itemIndex = player.inventory.indexOf(itemToUse);
    if (itemIndex !== -1) {
      player.inventory.splice(itemIndex, 1);
      itemUsed = itemToUse;
    }
  }
  
  situation.actionTaken = {
    playerId,
    playerName: player.character ? player.character.name : player.name,
    text: cleaned,
    itemUsed
  };
  
  // Resolve the situation
  resolveSituation(lobby);
}

// Handle group proposals
function handleGroupProposal(lobby, playerId, proposalText, itemToAttach = null) {
  if (lobby.phase !== 'IN_PROGRESS') return;
  const situation = lobby.currentSituation;
  if (!situation || situation.type !== 'group') return;
  
  const player = lobby.players.find(p => p.id === playerId && p.alive);
  if (!player) return;
  
  const cleaned = (proposalText || '').trim();
  if (!cleaned) return;
  
  // Check if item exists in inventory (but don't remove yet)
  let hasItem = false;
  if (itemToAttach) {
    hasItem = player.inventory.includes(itemToAttach);
  }
  
  const existing = situation.proposals.find(pr => pr.fromPlayerId === playerId);
  if (existing) {
    existing.text = cleaned;
    existing.itemAttached = hasItem ? itemToAttach : null;
  } else {
    situation.proposals.push({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      fromPlayerId: playerId,
      fromName: player.character ? player.character.name : player.name,
      text: cleaned,
      itemAttached: hasItem ? itemToAttach : null,
      votes: 0
    });
  }
}

// Handle group votes
function handleGroupVote(lobby, playerId, proposalId) {
  if (lobby.phase !== 'IN_PROGRESS') return;
  const situation = lobby.currentSituation;
  if (!situation || situation.type !== 'group') return;
  
  const player = lobby.players.find(p => p.id === playerId && p.alive);
  if (!player) return;
  
  if (!situation.proposals.find(pr => pr.id === proposalId)) return;
  
  situation.votes[playerId] = proposalId;
  
  const aliveCount = lobby.players.filter(p => p.alive).length;
  const voteCount = Object.keys(situation.votes).length;
  
  // If all alive players voted, resolve
  if (voteCount >= aliveCount && situation.proposals.length > 0) {
    // Count votes
    const tally = {};
    Object.values(situation.votes).forEach(pid => {
      tally[pid] = (tally[pid] || 0) + 1;
    });
    
    let winnerId = situation.proposals[0].id;
    let maxVotes = -1;
    Object.entries(tally).forEach(([pid, count]) => {
      if (count > maxVotes) {
        maxVotes = count;
        winnerId = pid;
      }
    });
    
    const winningProposal = situation.proposals.find(p => p.id === winnerId);
    
    // Remove item from winner's inventory if they attached one
    if (winningProposal.itemAttached) {
      const proposer = lobby.players.find(p => p.id === winningProposal.fromPlayerId);
      if (proposer) {
        const itemIndex = proposer.inventory.indexOf(winningProposal.itemAttached);
        if (itemIndex !== -1) {
          proposer.inventory.splice(itemIndex, 1);
        }
      }
    }
    
    situation.chosenProposal = winningProposal;
    resolveSituation(lobby);
  }
}

// Resolve situation based on type and player actions
function resolveSituation(lobby) {
  const situation = lobby.currentSituation;
  if (!situation || situation.resolved) return;
  
  situation.resolved = true;
  
  if (situation.situationType === 'threat') {
    handleThreatResolution(lobby, situation);
  } else if (situation.situationType === 'discovery') {
    handleDiscoveryResolution(lobby, situation);
  } else {
    handleNeutralResolution(lobby, situation);
  }
  
  advanceToNextSituation(lobby);
}

function handleThreatResolution(lobby, situation) {
  const targetPlayer = lobby.players.find(p => p.id === situation.eventData.targetPlayerId);
  if (!targetPlayer || !targetPlayer.alive) return;
  
  const damage = situation.eventData.threat.damage;
  let actionText = '';
  let itemEffect = '';
  
  if (situation.type === 'individual' && situation.actionTaken) {
    actionText = `${situation.actionTaken.playerName} attempts to ${situation.actionTaken.text}. `;
    
    if (situation.actionTaken.itemUsed) {
      const itemInfo = ITEM_TYPES[situation.actionTaken.itemUsed];
      if (itemInfo) {
        const healed = Math.min(itemInfo.heal, MAX_HP - targetPlayer.hp);
        targetPlayer.hp = Math.min(MAX_HP, targetPlayer.hp + itemInfo.heal);
        itemEffect = `They use ${itemInfo.name} and recover ${healed} HP! `;
      }
    }
  } else if (situation.type === 'group' && situation.chosenProposal) {
    actionText = `The group decides to ${situation.chosenProposal.text}. `;
    
    if (situation.chosenProposal.itemAttached) {
      const itemInfo = ITEM_TYPES[situation.chosenProposal.itemAttached];
      if (itemInfo) {
        const healed = Math.min(itemInfo.heal, MAX_HP - targetPlayer.hp);
        targetPlayer.hp = Math.min(MAX_HP, targetPlayer.hp + itemInfo.heal);
        itemEffect = `${situation.chosenProposal.fromName} uses ${itemInfo.name} to help, restoring ${healed} HP! `;
      }
    }
  }
  
  targetPlayer.hp -= damage;
  
  let damageText = `${situation.eventData.targetPlayerName} takes ${damage} damage!`;
  
  if (targetPlayer.hp <= 0) {
    targetPlayer.hp = 0;
    targetPlayer.alive = false;
    damageText += ` ${situation.eventData.targetPlayerName} has fallen...`;
  }
  
  lobby.storyLog.push({
    type: 'threat',
    text: actionText + itemEffect + damageText
  });
}

function handleDiscoveryResolution(lobby, situation) {
  const finderPlayer = lobby.players.find(p => p.id === situation.eventData.finderPlayerId);
  const discovery = situation.eventData.discovery;
  
  if (!finderPlayer || !finderPlayer.alive) return;
  
  if (discovery.item) {
    finderPlayer.inventory.push(discovery.item);
    const itemInfo = ITEM_TYPES[discovery.item];
    lobby.storyLog.push({
      type: 'discovery',
      text: `${situation.eventData.finderPlayerName} obtained ${itemInfo.name}!`
    });
  } else if (discovery.heal) {
    const oldHp = finderPlayer.hp;
    finderPlayer.hp = Math.min(MAX_HP, finderPlayer.hp + discovery.heal);
    const healed = finderPlayer.hp - oldHp;
    lobby.storyLog.push({
      type: 'discovery',
      text: `${situation.eventData.finderPlayerName} recovered ${healed} HP!`
    });
  }
}

function handleNeutralResolution(lobby, situation) {
  let text = 'The party observes their surroundings carefully.';
  
  if (situation.type === 'group' && situation.chosenProposal) {
    text = `The group decides to ${situation.chosenProposal.text}.`;
  } else if (situation.type === 'individual' && situation.actionTaken) {
    text = `${situation.actionTaken.playerName} ${situation.actionTaken.text}.`;
  }
  
  lobby.storyLog.push({
    type: 'neutral',
    text
  });
}

// Handle item usage
function useItem(lobby, playerId, itemType, targetPlayerId) {
  const player = lobby.players.find(p => p.id === playerId);
  if (!player || !player.alive) return { error: 'Player not found or dead' };
  
  const itemIndex = player.inventory.indexOf(itemType);
  if (itemIndex === -1) return { error: 'Item not in inventory' };
  
  const itemInfo = ITEM_TYPES[itemType];
  if (!itemInfo) return { error: 'Invalid item' };
  
  let targetPlayer = player;
  if (itemInfo.targetOther && targetPlayerId) {
    targetPlayer = lobby.players.find(p => p.id === targetPlayerId);
    if (!targetPlayer || !targetPlayer.alive) return { error: 'Target not found or dead' };
  }
  
  // Use the item
  player.inventory.splice(itemIndex, 1);
  
  const oldHp = targetPlayer.hp;
  targetPlayer.hp = Math.min(MAX_HP, targetPlayer.hp + itemInfo.heal);
  const healed = targetPlayer.hp - oldHp;
  
  const playerName = player.character ? player.character.name : player.name;
  const targetName = targetPlayer.character ? targetPlayer.character.name : targetPlayer.name;
  
  let message;
  if (playerId === targetPlayer.id) {
    message = `${playerName} used ${itemInfo.name} and recovered ${healed} HP!`;
  } else {
    message = `${playerName} used ${itemInfo.name} on ${targetName}, restoring ${healed} HP!`;
  }
  
  lobby.storyLog.push({
    type: 'item',
    text: message
  });
  
  return { success: true };
}

function advanceToNextSituation(lobby) {
  lobby.turnCount++;
  
  const alive = lobby.players.filter(p => p.alive);
  
  // Check win/loss
  if (alive.length === 0) {
    lobby.phase = 'ENDED';
    lobby.storyLog.push({
      type: 'system',
      text: 'The entire party has fallen. Game Over.'
    });
    return;
  }
  
  if (lobby.turnCount >= MAX_TURNS) {
    lobby.phase = 'ENDED';
    lobby.storyLog.push({
      type: 'system',
      text: `After ${MAX_TURNS} harrowing encounters, the survivors have made it through! Victory!`
    });
    return;
  }
  
  // Generate next situation
  lobby.currentSituation = createNewSituation(lobby);
}

function getPublicLobbyState(lobby, requestingPlayerId = null) {
  return {
    lobbyId: lobby.lobbyId,
    phase: lobby.phase,
    themeKey: lobby.themeKey,
    themeName: lobby.themeName,
    availableThemes: (lobby.availableThemes || []).map(t => ({ key: t.key, label: t.label, intro: t.intro || undefined, addedBy: t.addedBy || undefined, addedById: t.addedById || undefined })),
    players: lobby.players.map(p => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      character: p.character,
      hp: p.hp,
      alive: p.alive,
      isYou: requestingPlayerId ? p.id === requestingPlayerId : undefined
    })),
    storyLog: lobby.storyLog.slice(-40), // last 40 entries
    currentTurnIndex: lobby.currentTurnIndex,
    currentSituation: lobby.currentSituation,
    campaignId: lobby.campaignId,
    turnCount: lobby.turnCount
  };
}

// Serialize just the parts needed to reconstruct a campaign later.
function tryFinalizeTheme(lobby) {
  if (lobby.phase !== 'THEME_VOTE') return false;
  if (lobby.players.length === 0) return false;

  // Tally votes
  const votes = {};
  lobby.players.forEach(p => {
    if (p.themeVote) {
      // only count if it's a known theme (either built-in or lobby-provided)
      const known = THEMES[p.themeVote] || (lobby.availableThemes || []).find(t => t.key === p.themeVote);
      if (known) votes[p.themeVote] = (votes[p.themeVote] || 0) + 1;
    }
  });

  // Count number of players who have cast a vote
  const votedCount = lobby.players.reduce((acc, p) => acc + (p.themeVote ? 1 : 0), 0);
  if (votedCount === 0 || votedCount < lobby.players.length) {
    // Not everyone voted yet.
    return false;
  }

  // Pick winner (most votes). Tie-breaker: first encountered.
  let winner = null;
  let maxVotes = -1;
  Object.entries(votes).forEach(([key, count]) => {
    if (count > maxVotes) {
      maxVotes = count;
      winner = key;
    }
  });
  if (!winner) winner = 'dungeon';

  // Set theme and begin the game
  lobby.themeKey = winner;
  const builtin = THEMES[winner];
  if (builtin) lobby.themeName = builtin.name;
  else {
    const custom = (lobby.availableThemes || []).find(t => t.key === winner);
    lobby.themeName = custom ? custom.label : 'Custom Theme';
  }
  lobby.phase = 'IN_PROGRESS';
  lobby.currentTurnIndex = 0;
  lobby.turnCount = 0;
  lobby.currentSituation = createNewSituation(lobby, 'group');
  // push intro narration from built-in theme or custom theme's intro
  let introText = '';
  if (builtin && builtin.intro) introText = builtin.intro;
  else {
    const custom = (lobby.availableThemes || []).find(t => t.key === winner);
    introText = custom && custom.intro ? custom.intro : `The theme is ${lobby.themeName}. Your adventure begins.`;
  }
  // System message first, then narration last
  lobby.storyLog.push({ type: 'system', text: `Theme selected: ${lobby.themeName}. The adventure begins!` });
  lobby.storyLog.push({ type: 'narration', text: introText });
  
  // Mark that credits need to play before game starts
  lobby.creditsComplete = false;
  return true;
}
// Serialize just the parts needed to reconstruct a campaign later.
function serializeCampaign(lobby) {
  return {
    lobbyId: lobby.lobbyId,
    themeKey: lobby.themeKey,
    themeName: lobby.themeName,
    players: lobby.players.map(p => ({
      name: p.name,
      isHost: p.isHost,
      character: p.character,
      hp: p.hp,
      alive: p.alive
    })),
    storyLog: lobby.storyLog,
    currentTurnIndex: lobby.currentTurnIndex,
    currentSituation: lobby.currentSituation,
    turnCount: lobby.turnCount
  };
}

function deserializeCampaign(payload) {
  const lobby = {
    lobbyId: payload.lobbyId,
    createdAt: Date.now(),
    players: payload.players.map((p, idx) => ({
      id: `rejoined_${idx}`,
      name: p.name,
      isHost: p.isHost,
      character: p.character,
      hp: p.hp,
      alive: p.alive,
      themeVote: null,
      connected: false
    })),
    phase: payload.turnCount >= MAX_TURNS ? 'ENDED' : 'IN_PROGRESS',
    themeKey: payload.themeKey,
    themeName: payload.themeName,
    storyLog: payload.storyLog || [],
    currentTurnIndex: payload.currentTurnIndex || 0,
    currentSituation: payload.currentSituation || null,
    campaignId: `restored_${Date.now()}`,
    turnCount: payload.turnCount || 0,
    creditsComplete: true // loaded games skip credits
  };
  return lobby;
}

function startGameAfterCredits(lobby) {
  // Called when credits finish - create first situation if not yet created
  if (lobby.phase !== 'IN_PROGRESS' || lobby.creditsComplete) return false;
  lobby.creditsComplete = true;
  lobby.currentSituation = createNewSituation(lobby);
  return true;
}

module.exports = {
  createLobbyState,
  joinLobbyState,
  registerThemeVote,
  startThemeVote,
  tryFinalizeTheme,
  setCharacterForPlayer,
  maybeStartGameIfReady,
  handlePlayerAction,
  handleGroupProposal,
  handleGroupVote,
  getPublicLobbyState,
  serializeCampaign,
  deserializeCampaign,
  startGameAfterCredits,
  ITEM_TYPES
};
