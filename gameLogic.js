// gameLogic.js
// Core game state + simple procedural narrator (no external AI).

const THEMES = {
  dungeon: {
    name: 'Dark Dungeon',
    intro: 'You awaken in a damp stone chamber deep beneath the earth. Torches flicker on the walls, casting long shadows.',
    motifs: ['echoing footsteps', 'distant dripping water', 'whispers behind the walls', 'rusted iron gates'],
    foes: ['skeletal guardian', 'shadowy warden', 'crawling horror', 'ancient jailer spirit'],
    goals: ['find a way out', 'recover a lost relic', 'appease the restless dead', 'seal a cursed door']
  },
  space: {
    name: 'Derelict Space Station',
    intro: 'You come to in a dimly lit control room aboard a damaged space station. Emergency lights pulse red.',
    motifs: ['metal groans in the distance', 'air vents hiss', 'alarms briefly chirp then cut out', 'gravity fluctuates slightly'],
    foes: ['rogue maintenance drone', 'infected crew member', 'unknown organism in the vents', 'glitching security AI'],
    goals: ['restore power to the core', 're-establish communications', 'reach the escape pods', 'stop a reactor meltdown']
  },
  mansion: {
    name: 'Haunted Mansion',
    intro: 'You stand in the foyer of a crumbling mansion. Dust motes drift through slivers of moonlight.',
    motifs: ['floorboards creak', 'cold drafts slip under doors', 'portraits seem to watch you', 'distant piano keys press themselves'],
    foes: ['restless spirit', 'possessed doll', 'masked intruder', 'shadow at the top of the stairs'],
    goals: ['uncover the house\'s secret', 'lay a spirit to rest', 'survive until sunrise', 'escape the locked grounds']
  },
  cyber: {
    name: 'Neon City Backstreets',
    intro: 'Rain beats down on glowing alleyways. Neon signs flicker overhead, reflecting in puddles at your feet.',
    motifs: ['drones buzz past', 'holographic ads glitch', 'sirens wail in the distance', 'data streams cascade across building walls'],
    foes: ['street enforcer', 'rogue android', 'data broker gone bad', 'corporate hunter'],
    goals: ['deliver a stolen data shard', 'erase your identity file', 'expose a corporate cover-up', 'survive a gang war']
  }
};

const MAX_HP = 10;
const MAX_TURNS = 16;

function createLobbyState(lobbyId) {
  return {
    lobbyId,
    createdAt: Date.now(),
    players: [], // { id, name, isHost, character, hp, alive, themeVote, connected }
    phase: 'CHARACTER_CREATION', // CHARACTER_CREATION, THEME_VOTE, IN_PROGRESS, ENDED
    themeKey: null,
    themeName: null,
    availableThemes: Object.keys(THEMES).map(k => ({ key: k, label: THEMES[k].name, intro: THEMES[k].intro })),
    storyLog: [],
    currentTurnIndex: 0,
    currentSituation: null, // { type: 'individual'|'group', text, proposals: [], votes: {} ...}
    campaignId: `cmp_${lobbyId}_${Date.now()}`,
    turnCount: 0
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
      connected: true
    };
    lobby.players.push(existing);
  } else {
    existing.connected = true;
    if (playerName) existing.name = playerName;
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
  lobby.currentSituation = createNewSituation(lobby, 'group');
  lobby.storyLog.push({
    type: 'narration',
    text: lobby.currentSituation.text
  });
  return true;
}

function startGameAfterCredits(lobby) {
  // Called after credits finish - create first situation
  if (lobby.phase !== 'IN_PROGRESS' || lobby.creditsComplete) return false;
  lobby.creditsComplete = true;
  lobby.currentSituation = createNewSituation(lobby, 'group');
  lobby.storyLog.push({
    type: 'narration',
    text: lobby.currentSituation.text
  });
  return true;
}

function createNewSituation(lobby, forcedType = null) {
  const theme = THEMES[lobby.themeKey] || THEMES['dungeon'];
  const alivePlayers = lobby.players.filter(p => p.alive);
  const motifs = theme.motifs;
  const foes = theme.foes;
  const goals = theme.goals;

  const motif = motifs[Math.floor(Math.random() * motifs.length)];
  const foe = foes[Math.floor(Math.random() * foes.length)];
  const goal = goals[Math.floor(Math.random() * goals.length)];

  const type = forcedType || (Math.random() < 0.5 ? 'individual' : 'group');

  let text;
  if (type === 'individual') {
    const current = alivePlayers[lobby.currentTurnIndex % alivePlayers.length];
    text = `${motif.charAt(0).toUpperCase() + motif.slice(1)}. ` +
      `The group senses danger as a ${foe} blocks the way forward. ` +
      `${current.character.name} must act first to help the party ${goal}. What does ${current.character.name} do?`;
  } else {
    text = `${motif.charAt(0).toUpperCase() + motif.slice(1)}. ` +
      `You all realise the next decision could shape your fate. Together, you must choose how to ${goal}. ` +
      `Each of you may propose a course of action for the group.`;
  }

  return {
    type,
    text,
    proposals: [], // { id, fromPlayerId, text, votes: 0 }
    votes: {} // playerId -> proposalId
  };
}

function handlePlayerAction(lobby, playerId, actionText) {
  if (lobby.phase !== 'IN_PROGRESS') return;
  const situation = lobby.currentSituation;
  if (!situation || situation.type !== 'individual') return;

  const currentPlayer = getCurrentTurnPlayer(lobby);
  if (!currentPlayer || currentPlayer.id !== playerId) return;

  const cleaned = (actionText || '').trim();
  if (!cleaned) return;

  const outcome = resolveActionOutcome(lobby, currentPlayer, cleaned);
  lobby.storyLog.push({
    type: 'action',
    playerId,
    playerName: currentPlayer.character.name,
    text: cleaned,
    outcomeText: outcome.outcomeText,
    roll: outcome.roll,
    successLevel: outcome.successLevel
  });

  applyOutcomeDamage(lobby, outcome);
  advanceTurnOrEnd(lobby);
}

function handleGroupProposal(lobby, playerId, proposalText) {
  if (lobby.phase !== 'IN_PROGRESS') return;
  const situation = lobby.currentSituation;
  if (!situation || situation.type !== 'group') return;
  const p = lobby.players.find(p => p.id === playerId && p.alive);
  if (!p) return;

  const cleaned = (proposalText || '').trim();
  if (!cleaned) return;

  const existing = situation.proposals.find(pr => pr.fromPlayerId === playerId);
  if (existing) {
    existing.text = cleaned;
  } else {
    situation.proposals.push({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      fromPlayerId: playerId,
      fromName: p.character ? p.character.name : p.name,
      text: cleaned,
      votes: 0
    });
  }
}

function handleGroupVote(lobby, playerId, proposalId) {
  if (lobby.phase !== 'IN_PROGRESS') return;
  const situation = lobby.currentSituation;
  if (!situation || situation.type !== 'group') return;
  const p = lobby.players.find(p => p.id === playerId && p.alive);
  if (!p) return;
  if (!situation.proposals.find(pr => pr.id === proposalId)) return;

  situation.votes[playerId] = proposalId;

  const aliveCount = lobby.players.filter(p => p.alive).length;
  const voteCount = Object.keys(situation.votes).length;

  // If all alive players have voted and there's at least one proposal, resolve.
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
    const groupActionText = winningProposal ? winningProposal.text : situation.proposals[0].text;

    const outcome = resolveGroupOutcome(lobby, groupActionText);
    lobby.storyLog.push({
      type: 'groupAction',
      text: groupActionText,
      outcomeText: outcome.outcomeText,
      roll: outcome.roll,
      successLevel: outcome.successLevel
    });

    applyOutcomeDamage(lobby, outcome);
    advanceTurnOrEnd(lobby);
  }
}

function getCurrentTurnPlayer(lobby) {
  const alivePlayers = lobby.players.filter(p => p.alive);
  if (alivePlayers.length === 0) return null;
  const idx = lobby.currentTurnIndex % alivePlayers.length;
  return alivePlayers[idx];
}

function resolveActionOutcome(lobby, player, actionText) {
  const roll = rollD20();
  const bonus = 0; // Could derive from character role/trait
  const total = roll + bonus;
  let successLevel;
  if (total >= 18) successLevel = 'criticalSuccess';
  else if (total >= 12) successLevel = 'success';
  else if (total >= 7) successLevel = 'partial';
  else successLevel = 'fail';

  let outcomeText;
  switch (successLevel) {
    case 'criticalSuccess':
      outcomeText = `${player.character.name}'s attempt to "${actionText}" works far better than expected. The threat is pushed back and the group gains a brief advantage.`;
      break;
    case 'success':
      outcomeText = `${player.character.name} manages to "${actionText}" well enough to keep the group safe, at least for now.`;
      break;
    case 'partial':
      outcomeText = `${player.character.name} tries to "${actionText}". It sort of works, but there are complications and the group is left off-balance.`;
      break;
    case 'fail':
      outcomeText = `${player.character.name} attempts to "${actionText}" but it goes badly. The situation becomes more dangerous for everyone.`;
      break;
  }

  return { roll: total, rawRoll: roll, successLevel, outcomeText };
}

function resolveGroupOutcome(lobby, actionText) {
  const roll = rollD20();
  let successLevel;
  if (roll >= 18) successLevel = 'criticalSuccess';
  else if (roll >= 12) successLevel = 'success';
  else if (roll >= 7) successLevel = 'partial';
  else successLevel = 'fail';

  let outcomeText;
  switch (successLevel) {
    case 'criticalSuccess':
      outcomeText = `The group agrees to "${actionText}", and it works brilliantly. You create a strong advantage and buy precious time.`;
      break;
    case 'success':
      outcomeText = `Together, you carry out the plan to "${actionText}". It succeeds, though the danger is not gone.`;
      break;
    case 'partial':
      outcomeText = `You decide to "${actionText}". The result is mixed: some things improve, but new problems appear.`;
      break;
    case 'fail':
      outcomeText = `The group attempts to "${actionText}", but it backfires. The environment and enemies seem to close in.`;
      break;
  }

  return { roll, successLevel, outcomeText };
}

function applyOutcomeDamage(lobby, outcome) {
  // Simple model: on fail/partial, random alive players take damage.
  const alive = lobby.players.filter(p => p.alive);
  if (alive.length === 0) return;

  if (outcome.successLevel === 'fail') {
    const target = alive[Math.floor(Math.random() * alive.length)];
    const dmg = 3;
    target.hp -= dmg;
    if (target.hp <= 0) {
      target.hp = 0;
      target.alive = false;
      lobby.storyLog.push({
        type: 'system',
        text: `${target.character ? target.character.name : target.name} is overwhelmed by the danger and falls.`
      });
    } else {
      lobby.storyLog.push({
        type: 'system',
        text: `${target.character ? target.character.name : target.name} is badly hurt and loses ${dmg} HP.`
      });
    }
  } else if (outcome.successLevel === 'partial') {
    const target = alive[Math.floor(Math.random() * alive.length)];
    const dmg = 1 + Math.floor(Math.random() * 2);
    target.hp -= dmg;
    if (target.hp <= 0) {
      target.hp = 0;
      target.alive = false;
      lobby.storyLog.push({
        type: 'system',
        text: `${target.character ? target.character.name : target.name} is taken out by the side effects of the plan.`
      });
    } else {
      lobby.storyLog.push({
        type: 'system',
        text: `${target.character ? target.character.name : target.name} is shaken and loses ${dmg} HP.`
      });
    }
  }
}

function advanceTurnOrEnd(lobby) {
  lobby.turnCount += 1;

  const alive = lobby.players.filter(p => p.alive);
  if (alive.length === 0) {
    lobby.phase = 'ENDED';
    lobby.storyLog.push({
      type: 'system',
      text: 'With no one left standing, the story ends in failure.'
    });
    return;
  }

  if (lobby.turnCount >= MAX_TURNS) {
    lobby.phase = 'ENDED';
    lobby.storyLog.push({
      type: 'system',
      text: 'After many trials, your story reaches its natural conclusion. Whether this counts as victory is up to you.'
    });
    return;
  }

  // Advance turn index cyclically
  lobby.currentTurnIndex = (lobby.currentTurnIndex + 1) % alive.length;

  // Alternate between individual and group situations loosely
  const forcedType = lobby.turnCount % 3 === 0 ? 'group' : null;
  lobby.currentSituation = createNewSituation(lobby, forcedType);
  lobby.currentSituation.votes = {};
  lobby.currentSituation.proposals = [];
  lobby.storyLog.push({
    type: 'narration',
    text: lobby.currentSituation.text
  });
}

function rollD20() {
  return 1 + Math.floor(Math.random() * 20);
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
  lobby.currentSituation = createNewSituation(lobby, 'group');
  lobby.storyLog.push({
    type: 'narration',
    text: lobby.currentSituation.text
  });
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
  startGameAfterCredits
};
