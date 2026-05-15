import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveAttack,
  executeAttack,
  decrementCombatCooldowns,
  makeAttackHandler
} from '../engine/CombatEngine.js';
import { createActorStore } from '../store/actorStore.js';
import { useGameStore } from '../store/gameStore.js';
import { ActionQueue } from '../engine/ActionQueue.js';
import { EQUIPMENT_SLOTS } from '../engine/Bonuses.js';

const emptyEq = () => Object.fromEntries(EQUIPMENT_SLOTS.map(s => [s, null]));

function maxMain(overrides = {}) {
  return {
    levels: {
      attack: 99, strength: 99, defence: 99,
      hitpoints: 99, prayer: 99, ranged: 99, magic: 99
    },
    boosts: { attack: 0, strength: 0, defence: 0, ranged: 0, magic: 0 },
    activePrayers: [],
    attackStyle: 'aggressive',
    attackCooldown: 0,
    eatCooldown: 0,
    equipment: emptyEq(),
    ...overrides
  };
}

// Inject scripted rng. First call is for accuracy, second for damage.
function rngSeq(...vals) {
  let i = 0;
  return () => (i < vals.length ? vals[i++] : 0);
}

describe('resolveAttack — basic flow', () => {
  it('hit produces damage in [0, maxHit]', () => {
    const attacker = maxMain({
      equipment: { ...emptyEq(), weapon: 'abyssal_whip' },
      activePrayers: ['piety']
    });
    const defender = maxMain();
    const r = resolveAttack(attacker, defender, {
      rng: rngSeq(0, 0.99)
    });
    expect(r.hit).toBe(true);
    expect(r.attackType).toBe('slash');
    expect(r.attackCooldown).toBe(4);
    expect(r.damage).toBeGreaterThan(0);
    expect(r.damage).toBeLessThanOrEqual(r.maxHit);
  });

  it('miss => damage 0, blue splat semantics', () => {
    const attacker = maxMain({
      equipment: { ...emptyEq(), weapon: 'abyssal_whip' }
    });
    const defender = maxMain();
    const r = resolveAttack(attacker, defender, {
      rng: rngSeq(0.999999, 0.99)
    });
    expect(r.hit).toBe(false);
    expect(r.damage).toBe(0);
    expect(r.rawDamage).toBe(0);
  });

  it('weapon-derived attack cooldown propagates through result', () => {
    const make = w =>
      resolveAttack(
        maxMain({ equipment: { ...emptyEq(), weapon: w } }),
        maxMain(),
        { rng: rngSeq(0, 0.5) }
      );
    expect(make('abyssal_whip').attackCooldown).toBe(4);
    expect(make('armadyl_godsword').attackCooldown).toBe(6);
    expect(make('granite_maul').attackCooldown).toBe(7);
    expect(make('rune_crossbow').attackCooldown).toBe(5);
  });
});

describe('resolveAttack — protection prayer (PvP = 0.6x)', () => {
  // ACCEPTANCE #1
  it('Protect from Melee reduces final damage by exactly 40%', () => {
    const attacker = maxMain({
      equipment: { ...emptyEq(), weapon: 'abyssal_whip' },
      activePrayers: ['piety'],
      attackStyle: 'aggressive'
    });
    // Whip + Piety + Aggressive => max hit 30.
    // rng=0.99 with maxHit=30 -> floor(0.99 * 31) = 30 (top bucket).
    const defender = maxMain({ activePrayers: ['protect_from_melee'] });
    const r = resolveAttack(attacker, defender, { rng: rngSeq(0, 0.99) });

    expect(r.hit).toBe(true);
    expect(r.rawDamage).toBe(30);
    expect(r.damage).toBe(Math.floor(30 * 0.6));   // 18
    expect(r.damage).toBe(18);
    expect(r.protectingPrayer).toBe('protect_from_melee');
  });

  it('mismatched protection prayer does NOT apply', () => {
    const attacker = maxMain({
      equipment: { ...emptyEq(), weapon: 'abyssal_whip' },
      activePrayers: ['piety']
    });
    const defender = maxMain({ activePrayers: ['protect_from_magic'] });
    const r = resolveAttack(attacker, defender, { rng: rngSeq(0, 0.99) });
    expect(r.protectingPrayer).toBe(null);
    expect(r.damage).toBe(r.rawDamage);
    expect(r.damage).toBe(30);
  });

  it('Protect from Missiles reduces ranged damage by 40%', () => {
    const attacker = maxMain({
      equipment: { ...emptyEq(), weapon: 'rune_crossbow' },
      activePrayers: ['rigour'],
      attackStyle: 'accurate'
    });
    const defender = maxMain({ activePrayers: ['protect_from_missiles'] });
    const r = resolveAttack(attacker, defender, { rng: rngSeq(0, 0.99) });
    expect(r.protectingPrayer).toBe('protect_from_missiles');
    expect(r.damage).toBe(Math.floor(r.rawDamage * 0.6));
  });

  it('Protect from Magic reduces magic damage by 40%', () => {
    const attacker = maxMain({
      equipment: { ...emptyEq(), weapon: 'volatile_nightmare_staff' }
    });
    const defender = maxMain({ activePrayers: ['protect_from_magic'] });
    const r = resolveAttack(attacker, defender, {
      rng: rngSeq(0, 0.99),
      spell: 'ice_barrage'
    });
    expect(r.protectingPrayer).toBe('protect_from_magic');
    expect(r.damage).toBe(Math.floor(r.rawDamage * 0.6));
  });
});

describe('resolveAttack — Smite drain', () => {
  // ACCEPTANCE #2
  it('Smite drains floor(damage/4) when damage > 0', () => {
    const attacker = maxMain({
      equipment: { ...emptyEq(), weapon: 'abyssal_whip' },
      activePrayers: ['piety', 'smite'],
      attackStyle: 'aggressive'
    });
    const defender = maxMain();
    const r = resolveAttack(attacker, defender, { rng: rngSeq(0, 0.99) });
    expect(r.damage).toBe(30);
    expect(r.smitePrayerLoss).toBe(Math.floor(30 / 4)); // 7
  });

  it('Smite drain uses POST-protection damage, not raw', () => {
    const attacker = maxMain({
      equipment: { ...emptyEq(), weapon: 'abyssal_whip' },
      activePrayers: ['piety', 'smite']
    });
    const defender = maxMain({ activePrayers: ['protect_from_melee'] });
    const r = resolveAttack(attacker, defender, { rng: rngSeq(0, 0.99) });
    expect(r.damage).toBe(18);
    expect(r.smitePrayerLoss).toBe(Math.floor(18 / 4)); // 4, not 30/4=7
  });

  it('no Smite => no drain', () => {
    const attacker = maxMain({
      equipment: { ...emptyEq(), weapon: 'abyssal_whip' },
      activePrayers: ['piety']
    });
    const r = resolveAttack(attacker, maxMain(), { rng: rngSeq(0, 0.99) });
    expect(r.smitePrayerLoss).toBe(0);
  });

  it('Smite + miss => no drain (damage is 0)', () => {
    const attacker = maxMain({
      equipment: { ...emptyEq(), weapon: 'abyssal_whip' },
      activePrayers: ['smite']
    });
    const r = resolveAttack(attacker, maxMain(), {
      rng: rngSeq(0.999999, 0.5)
    });
    expect(r.hit).toBe(false);
    expect(r.smitePrayerLoss).toBe(0);
  });
});

describe('executeAttack — cooldown gating', () => {
  // ACCEPTANCE #3
  it('attackCooldown > 0 blocks the attack from firing', () => {
    const a = createActorStore({ equipment: { weapon: 'abyssal_whip' } });
    const d = createActorStore();
    a.getState().setAttackCooldown(3);

    const r = executeAttack(a, d, { rng: rngSeq(0, 0.99) });
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe('cooldown');
    // Defender HP unchanged.
    expect(d.getState().current.hp).toBe(99);
  });

  it('after firing, attacker cooldown is set to weapon speed', () => {
    const a = createActorStore({ equipment: { weapon: 'abyssal_whip' } });
    const d = createActorStore();
    expect(a.getState().attackCooldown).toBe(0);

    executeAttack(a, d, { rng: rngSeq(0, 0.99) });
    expect(a.getState().attackCooldown).toBe(4); // whip
  });

  it('decrement chain unlocks the next attack after weapon-speed ticks', () => {
    const a = createActorStore({ equipment: { weapon: 'abyssal_whip' } });
    const d = createActorStore();

    executeAttack(a, d, { rng: rngSeq(0, 0.99) });
    expect(a.getState().attackCooldown).toBe(4);

    // Three ticks pass — still on cooldown, attack skipped.
    for (let i = 0; i < 3; i++) {
      decrementCombatCooldowns(a, d);
      const r = executeAttack(a, d, { rng: rngSeq(0, 0.99) });
      expect(r.skipped).toBe(true);
    }
    // Fourth tick — cooldown reaches 0, attack fires.
    decrementCombatCooldowns(a, d);
    expect(a.getState().attackCooldown).toBe(0);
    const r = executeAttack(a, d, { rng: rngSeq(0, 0.99) });
    expect(r.skipped).toBeUndefined();
    expect(a.getState().attackCooldown).toBe(4);
  });
});

describe('executeAttack — store side effects', () => {
  let a, d;
  beforeEach(() => {
    a = createActorStore({
      equipment: { weapon: 'abyssal_whip' },
      activePrayers: ['piety', 'smite']
    });
    d = createActorStore();
  });

  it('damage decrements defender HP', () => {
    executeAttack(a, d, { rng: rngSeq(0, 0.99) });
    expect(d.getState().current.hp).toBe(99 - 30);
  });

  it('damage cannot drop HP below 0', () => {
    d.getState().setHP(10);
    executeAttack(a, d, { rng: rngSeq(0, 0.99) });
    expect(d.getState().current.hp).toBe(0);
  });

  it('smite drains defender prayer pts', () => {
    executeAttack(a, d, { rng: rngSeq(0, 0.99) });
    expect(d.getState().current.prayer).toBe(99 - Math.floor(30 / 4));
  });

  it('miss leaves defender untouched', () => {
    executeAttack(a, d, { rng: rngSeq(0.999999, 0.5) });
    expect(d.getState().current.hp).toBe(99);
    expect(d.getState().current.prayer).toBe(99);
  });
});

describe('makeAttackHandler — ActionQueue integration', () => {
  beforeEach(() => {
    useGameStore.getState().clearLog();
  });

  it('handler executes attack via ActionQueue at priority 5', () => {
    const playerStore = createActorStore({
      equipment: { weapon: 'abyssal_whip' },
      activePrayers: ['piety']
    });
    const botStore = createActorStore();
    const q = new ActionQueue();
    q.register('attack', makeAttackHandler());

    q.enqueue({
      actor: 'player',
      type: 'attack',
      payload: { rng: rngSeq(0, 0.99) }
    });
    q.flushTick({ player: playerStore, bot: botStore, game: useGameStore, tick: 1 });

    expect(botStore.getState().current.hp).toBe(99 - 30);
    expect(playerStore.getState().attackCooldown).toBe(4);
    expect(useGameStore.getState().combatLog.length).toBeGreaterThan(0);
  });

  it('handler routes bot->player attacks correctly', () => {
    const playerStore = createActorStore();
    const botStore = createActorStore({
      equipment: { weapon: 'abyssal_whip' },
      activePrayers: ['piety']
    });
    const q = new ActionQueue();
    q.register('attack', makeAttackHandler());

    q.enqueue({
      actor: 'bot',
      type: 'attack',
      payload: { rng: rngSeq(0, 0.99) }
    });
    q.flushTick({ player: playerStore, bot: botStore });

    expect(playerStore.getState().current.hp).toBe(99 - 30);
    expect(botStore.getState().attackCooldown).toBe(4);
  });

  it('eat (P4) resolves before attack (P5) — full tick-eat integration', () => {
    const playerStore = createActorStore({});
    playerStore.getState().setHP(25);
    const botStore = createActorStore({
      equipment: { weapon: 'abyssal_whip' },
      activePrayers: ['piety']
    });
    const q = new ActionQueue();
    q.register('attack', makeAttackHandler());
    q.register('eat', (action, ctx) => {
      const store = action.actor === 'player' ? ctx.player : ctx.bot;
      store.getState().heal(action.payload.heal);
    });

    // Bot's max hit = 30 will land via scripted rng.
    q.enqueue({
      actor: 'bot',
      type: 'attack',
      payload: { rng: rngSeq(0, 0.99) }
    });
    q.enqueue({ actor: 'player', type: 'eat', payload: { heal: 20 } });
    q.flushTick({ player: playerStore, bot: botStore });

    // Player at 25, heals first (45), then takes 30 -> 15. Survives.
    expect(playerStore.getState().current.hp).toBe(15);
  });
});
