import { describe, it, expect } from 'vitest';
import { decideBotActions, runBotTick } from '../engine/AIBot.js';
import { ActionQueue } from '../engine/ActionQueue.js';
import { EQUIPMENT_SLOTS } from '../engine/Bonuses.js';

const emptyEq = () => Object.fromEntries(EQUIPMENT_SLOTS.map(s => [s, null]));

function makeState(overrides = {}) {
  return {
    levels: { attack: 99, strength: 99, defence: 99, hitpoints: 99, prayer: 99, ranged: 99, magic: 99 },
    boosts: { attack: 0, strength: 0, defence: 0, ranged: 0, magic: 0 },
    current: { hp: 99, prayer: 99, specEnergy: 100 },
    activePrayers: [],
    attackStyle: 'aggressive',
    attackCooldown: 0,
    eatCooldown: 0,
    comboCooldown: 0,
    equipment: { ...emptyEq() },
    inventory: [],
    ...overrides
  };
}

function actionTypes(actions) {
  return actions.map(a => a.type);
}

function findAction(actions, type, payloadKey, payloadValue) {
  return actions.find(a =>
    a.type === type &&
    (payloadKey === undefined || a.payload?.[payloadKey] === payloadValue)
  );
}

// ── Prayer switching ─────────────────────────────────────────────────────────

describe('decideBotActions — prayer switching', () => {
  it('activates protect_from_melee vs melee opponent', () => {
    const bot = makeState();
    const player = makeState({ equipment: { ...emptyEq(), weapon: 'abyssal_whip' } });
    const actions = decideBotActions(bot, player);
    expect(findAction(actions, 'activate_prayer', 'prayerId', 'protect_from_melee')).toBeDefined();
  });

  it('activates protect_from_missiles vs ranged opponent', () => {
    const bot = makeState();
    const player = makeState({ equipment: { ...emptyEq(), weapon: 'rune_crossbow' } });
    const actions = decideBotActions(bot, player);
    expect(findAction(actions, 'activate_prayer', 'prayerId', 'protect_from_missiles')).toBeDefined();
  });

  it('activates protect_from_magic vs magic opponent', () => {
    const bot = makeState();
    const player = makeState({ equipment: { ...emptyEq(), weapon: 'volatile_nightmare_staff' } });
    const actions = decideBotActions(bot, player);
    expect(findAction(actions, 'activate_prayer', 'prayerId', 'protect_from_magic')).toBeDefined();
  });

  it('does NOT re-enqueue prayer when already active', () => {
    const bot = makeState({ activePrayers: ['protect_from_melee'] });
    const player = makeState({ equipment: { ...emptyEq(), weapon: 'abyssal_whip' } });
    const actions = decideBotActions(bot, player);
    const found = actions.find(a => a.payload?.prayerId === 'protect_from_melee');
    expect(found).toBeUndefined();
  });

  it('switches prayer when opponent changes weapon (melee -> magic)', () => {
    const bot = makeState({ activePrayers: ['protect_from_melee'] });
    const player = makeState({ equipment: { ...emptyEq(), weapon: 'volatile_nightmare_staff' } });
    const actions = decideBotActions(bot, player);
    expect(findAction(actions, 'activate_prayer', 'prayerId', 'protect_from_magic')).toBeDefined();
  });

  it('does NOT switch prayers when difficulty is easy', () => {
    const bot = makeState();
    const player = makeState({ equipment: { ...emptyEq(), weapon: 'abyssal_whip' } });
    const actions = decideBotActions(bot, player, { difficulty: 'easy' });
    expect(actionTypes(actions).includes('activate_prayer')).toBe(false);
  });

  it('skips prayer when out of prayer points', () => {
    const bot = makeState({ current: { hp: 99, prayer: 0, specEnergy: 100 } });
    const player = makeState({ equipment: { ...emptyEq(), weapon: 'abyssal_whip' } });
    const actions = decideBotActions(bot, player);
    expect(actionTypes(actions).includes('activate_prayer')).toBe(false);
  });
});

describe('decideBotActions — offensive prayer (hard difficulty)', () => {
  it('hard difficulty activates Piety with melee weapon at prayer 70+', () => {
    const bot = makeState({ equipment: { ...emptyEq(), weapon: 'abyssal_whip' } });
    const player = makeState({ equipment: { ...emptyEq(), weapon: 'abyssal_whip' } });
    const actions = decideBotActions(bot, player, { difficulty: 'hard' });
    expect(findAction(actions, 'activate_prayer', 'prayerId', 'piety')).toBeDefined();
  });

  it('hard difficulty activates Rigour with ranged weapon at prayer 74+', () => {
    const bot = makeState({ equipment: { ...emptyEq(), weapon: 'rune_crossbow' } });
    const player = makeState({ equipment: { ...emptyEq(), weapon: 'rune_crossbow' } });
    const actions = decideBotActions(bot, player, { difficulty: 'hard' });
    expect(findAction(actions, 'activate_prayer', 'prayerId', 'rigour')).toBeDefined();
  });

  it('medium difficulty does NOT activate offensive prayer', () => {
    const bot = makeState({ equipment: { ...emptyEq(), weapon: 'abyssal_whip' } });
    const player = makeState({ equipment: { ...emptyEq(), weapon: 'abyssal_whip' } });
    const actions = decideBotActions(bot, player, { difficulty: 'medium' });
    expect(findAction(actions, 'activate_prayer', 'prayerId', 'piety')).toBeUndefined();
  });
});

// ── Eat decisions ────────────────────────────────────────────────────────────

describe('decideBotActions — eat decisions', () => {
  it('eats shark when HP below threshold (oppMax + 5)', () => {
    // Opponent: whip @ 99 no prayer aggressive → max hit 25
    const bot = makeState({
      current: { hp: 25, prayer: 99, specEnergy: 100 },
      inventory: ['shark']
    });
    const player = makeState({ equipment: { ...emptyEq(), weapon: 'abyssal_whip' } });
    const actions = decideBotActions(bot, player);
    expect(findAction(actions, 'eat', 'itemId', 'shark')).toBeDefined();
  });

  it('does NOT eat at full HP', () => {
    const bot = makeState({ inventory: ['shark'] });
    const player = makeState({ equipment: { ...emptyEq(), weapon: 'abyssal_whip' } });
    const actions = decideBotActions(bot, player);
    expect(actionTypes(actions).includes('eat')).toBe(false);
  });

  it('does NOT eat when on eat cooldown', () => {
    const bot = makeState({
      current: { hp: 15, prayer: 99, specEnergy: 100 },
      eatCooldown: 2,
      inventory: ['shark']
    });
    const player = makeState({ equipment: { ...emptyEq(), weapon: 'abyssal_whip' } });
    const actions = decideBotActions(bot, player);
    expect(actionTypes(actions).includes('eat')).toBe(false);
  });

  it('falls back to manta_ray when no shark', () => {
    const bot = makeState({
      current: { hp: 15, prayer: 99, specEnergy: 100 },
      inventory: ['manta_ray']
    });
    const player = makeState({ equipment: { ...emptyEq(), weapon: 'abyssal_whip' } });
    const actions = decideBotActions(bot, player);
    expect(findAction(actions, 'eat', 'itemId', 'manta_ray')).toBeDefined();
  });

  it('no eat action when inventory has no food', () => {
    const bot = makeState({
      current: { hp: 10, prayer: 99, specEnergy: 100 },
      inventory: []
    });
    const player = makeState({ equipment: { ...emptyEq(), weapon: 'abyssal_whip' } });
    const actions = decideBotActions(bot, player);
    expect(actionTypes(actions).includes('eat')).toBe(false);
  });
});

describe('decideBotActions — combo eat (hard difficulty)', () => {
  it('combo eats shark + karambwan at critical HP (hp <= oppMax)', () => {
    // Player AGS @ 99 no prayer aggressive → max hit 34, so combo trigger at hp <= 34
    const bot = makeState({
      current: { hp: 30, prayer: 99, specEnergy: 100 },
      inventory: ['shark', 'karambwan']
    });
    const player = makeState({ equipment: { ...emptyEq(), weapon: 'armadyl_godsword' } });
    const actions = decideBotActions(bot, player, { difficulty: 'hard' });
    expect(findAction(actions, 'eat', 'itemId', 'shark')).toBeDefined();
    expect(findAction(actions, 'eat', 'itemId', 'karambwan')).toBeDefined();
  });

  it('eats only primary food when HP not critical (hp > oppMax)', () => {
    // Player whip max=25, hp=27 (between 25 and 25+5=30) → eat shark but not combo
    const bot = makeState({
      current: { hp: 27, prayer: 99, specEnergy: 100 },
      inventory: ['shark', 'karambwan']
    });
    const player = makeState({ equipment: { ...emptyEq(), weapon: 'abyssal_whip' } });
    const actions = decideBotActions(bot, player, { difficulty: 'hard' });
    expect(findAction(actions, 'eat', 'itemId', 'shark')).toBeDefined();
    expect(findAction(actions, 'eat', 'itemId', 'karambwan')).toBeUndefined();
  });

  it('medium difficulty does NOT combo eat even at critical HP', () => {
    const bot = makeState({
      current: { hp: 10, prayer: 99, specEnergy: 100 },
      inventory: ['shark', 'karambwan']
    });
    const player = makeState({ equipment: { ...emptyEq(), weapon: 'armadyl_godsword' } });
    const actions = decideBotActions(bot, player, { difficulty: 'medium' });
    expect(findAction(actions, 'eat', 'itemId', 'shark')).toBeDefined();
    expect(findAction(actions, 'eat', 'itemId', 'karambwan')).toBeUndefined();
  });

  it('does NOT combo eat when comboCooldown > 0', () => {
    const bot = makeState({
      current: { hp: 5, prayer: 99, specEnergy: 100 },
      comboCooldown: 1,
      inventory: ['shark', 'karambwan']
    });
    const player = makeState({ equipment: { ...emptyEq(), weapon: 'armadyl_godsword' } });
    const actions = decideBotActions(bot, player, { difficulty: 'hard' });
    expect(findAction(actions, 'eat', 'itemId', 'karambwan')).toBeUndefined();
  });
});

// ── KO spec decisions ────────────────────────────────────────────────────────

describe('decideBotActions — KO spec', () => {
  it('uses AGS spec when player HP within KO range', () => {
    // AGS spec max ≈ floor(34 * 1.375) = 46
    const bot = makeState({ equipment: { ...emptyEq(), weapon: 'armadyl_godsword' } });
    const player = makeState({ current: { hp: 30, prayer: 99, specEnergy: 100 } });
    const actions = decideBotActions(bot, player);
    expect(findAction(actions, 'toggle_spec', 'specId', 'armadyl_godsword')).toBeDefined();
  });

  it('does NOT spec when player HP is above KO range', () => {
    // AGS spec max ~46; player at 99 HP is not in KO range
    const bot = makeState({ equipment: { ...emptyEq(), weapon: 'armadyl_godsword' } });
    const player = makeState({ current: { hp: 99, prayer: 99, specEnergy: 100 } });
    const actions = decideBotActions(bot, player);
    expect(actionTypes(actions).includes('toggle_spec')).toBe(false);
  });

  it('does NOT spec when not enough energy', () => {
    const bot = makeState({
      equipment: { ...emptyEq(), weapon: 'armadyl_godsword' },
      current: { hp: 99, prayer: 99, specEnergy: 30 } // need 50
    });
    const player = makeState({ current: { hp: 20, prayer: 99, specEnergy: 100 } });
    const actions = decideBotActions(bot, player);
    expect(actionTypes(actions).includes('toggle_spec')).toBe(false);
  });

  it('easy difficulty never specs', () => {
    const bot = makeState({ equipment: { ...emptyEq(), weapon: 'armadyl_godsword' } });
    const player = makeState({ current: { hp: 5, prayer: 99, specEnergy: 100 } });
    const actions = decideBotActions(bot, player, { difficulty: 'easy' });
    expect(actionTypes(actions).includes('toggle_spec')).toBe(false);
  });

  it('does NOT spec when player is already dead (hp 0)', () => {
    const bot = makeState({ equipment: { ...emptyEq(), weapon: 'armadyl_godsword' } });
    const player = makeState({ current: { hp: 0, prayer: 99, specEnergy: 100 } });
    const actions = decideBotActions(bot, player);
    expect(actionTypes(actions).includes('toggle_spec')).toBe(false);
  });

  it('Dragon Claws spec triggers at higher player HP (4 cumulative hits)', () => {
    // claws estimated KO = base_max(21) * 1.0 * 4 hits = 84
    const bot = makeState({ equipment: { ...emptyEq(), weapon: 'dragon_claws' } });
    const player = makeState({ current: { hp: 60, prayer: 99, specEnergy: 100 } });
    const actions = decideBotActions(bot, player);
    expect(findAction(actions, 'toggle_spec', 'specId', 'dragon_claws')).toBeDefined();
  });
});

// ── Attack decisions ─────────────────────────────────────────────────────────

describe('decideBotActions — attack', () => {
  it('enqueues attack when cooldown is 0', () => {
    const bot = makeState({ equipment: { ...emptyEq(), weapon: 'abyssal_whip' } });
    const player = makeState();
    const actions = decideBotActions(bot, player);
    expect(actionTypes(actions).includes('attack')).toBe(true);
  });

  it('does NOT attack when on cooldown', () => {
    const bot = makeState({
      equipment: { ...emptyEq(), weapon: 'abyssal_whip' },
      attackCooldown: 2
    });
    const player = makeState();
    const actions = decideBotActions(bot, player);
    expect(actionTypes(actions).includes('attack')).toBe(false);
  });

  it('attacks even on easy difficulty', () => {
    const bot = makeState();
    const player = makeState();
    const actions = decideBotActions(bot, player, { difficulty: 'easy' });
    expect(actionTypes(actions).includes('attack')).toBe(true);
  });
});

// ── runBotTick — ActionQueue integration ─────────────────────────────────────

describe('runBotTick — enqueues into ActionQueue', () => {
  it('enqueues all decided actions into the queue', () => {
    const q = new ActionQueue();
    const bot = makeState({
      equipment: { ...emptyEq(), weapon: 'armadyl_godsword' },
      current: { hp: 20, prayer: 99, specEnergy: 100 },
      inventory: ['shark', 'karambwan']
    });
    const player = makeState({
      equipment: { ...emptyEq(), weapon: 'abyssal_whip' },
      current: { hp: 25, prayer: 99, specEnergy: 100 }
    });

    const enqueued = runBotTick(q, bot, player, { difficulty: 'hard' });
    expect(enqueued.length).toBeGreaterThan(0);
    expect(q.size).toBe(enqueued.length);
  });

  it('decided actions all have actor: bot', () => {
    const q = new ActionQueue();
    const bot = makeState({ equipment: { ...emptyEq(), weapon: 'abyssal_whip' } });
    const player = makeState({ equipment: { ...emptyEq(), weapon: 'abyssal_whip' } });
    const enqueued = runBotTick(q, bot, player);
    expect(enqueued.every(a => a.actor === 'bot')).toBe(true);
  });
});

// ── End-to-end acceptance ────────────────────────────────────────────────────

describe('AIBot — end-to-end acceptance', () => {
  it('full tick: bot prayer switches, combo eats, KO specs, and attacks', () => {
    // Player on AGS (max hit ~34) — high enough threat to trigger combo eat at hp=15
    const bot = makeState({
      equipment: { ...emptyEq(), weapon: 'armadyl_godsword' },
      current: { hp: 15, prayer: 99, specEnergy: 100 },
      inventory: ['shark', 'karambwan']
    });
    const player = makeState({
      equipment: { ...emptyEq(), weapon: 'armadyl_godsword' },
      current: { hp: 30, prayer: 99, specEnergy: 100 }
    });

    const actions = decideBotActions(bot, player, { difficulty: 'hard' });

    // All four decision categories present in a single tick
    expect(findAction(actions, 'activate_prayer', 'prayerId', 'protect_from_melee')).toBeDefined();
    expect(findAction(actions, 'activate_prayer', 'prayerId', 'piety')).toBeDefined();
    expect(findAction(actions, 'eat', 'itemId', 'shark')).toBeDefined();
    expect(findAction(actions, 'eat', 'itemId', 'karambwan')).toBeDefined();
    expect(findAction(actions, 'toggle_spec', 'specId', 'armadyl_godsword')).toBeDefined();
    expect(findAction(actions, 'attack')).toBeDefined();
  });
});
