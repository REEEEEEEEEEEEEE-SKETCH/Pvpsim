import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveSpecAttack,
  executeSpecAttack,
  makeSpecHandler
} from '../engine/SpecialAttackSystem.js';
import { makeAttackHandler } from '../engine/CombatEngine.js';
import { createActorStore } from '../store/actorStore.js';
import { useGameStore } from '../store/gameStore.js';
import { ActionQueue } from '../engine/ActionQueue.js';
import { EQUIPMENT_SLOTS } from '../engine/Bonuses.js';

const emptyEq = () => Object.fromEntries(EQUIPMENT_SLOTS.map(s => [s, null]));

function maxMain(weaponId, overrides = {}) {
  return {
    levels: { attack: 99, strength: 99, defence: 99, hitpoints: 99, prayer: 99, ranged: 99, magic: 99 },
    boosts: { attack: 0, strength: 0, defence: 0, ranged: 0, magic: 0 },
    activePrayers: [],
    attackStyle: 'aggressive',
    attackCooldown: 0,
    eatCooldown: 0,
    equipment: { ...emptyEq(), weapon: weaponId },
    ...overrides
  };
}

function rngSeq(...vals) {
  let i = 0;
  return () => (i < vals.length ? vals[i++] : 0);
}

// ── Spec energy gate ─────────────────────────────────────────────────────────

describe('executeSpecAttack — energy gate', () => {
  it('blocks spec when energy < cost and returns skipped', () => {
    const a = createActorStore({ equipment: { weapon: 'armadyl_godsword' } });
    a.getState().setSpec(30); // AGS costs 50
    const r = executeSpecAttack(a, createActorStore(), 'armadyl_godsword');
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe('insufficient_spec_energy');
    expect(a.getState().current.specEnergy).toBe(30); // unchanged
  });

  it('deducts spec energy on success', () => {
    const a = createActorStore({ equipment: { weapon: 'armadyl_godsword' } });
    expect(a.getState().current.specEnergy).toBe(100);
    executeSpecAttack(a, createActorStore(), 'armadyl_godsword', { rng: rngSeq(0, 0.5) });
    expect(a.getState().current.specEnergy).toBe(50); // 100 - 50
  });

  it('dragon dagger costs 25 energy per spec', () => {
    const a = createActorStore({ equipment: { weapon: 'dragon_dagger' } });
    executeSpecAttack(a, createActorStore(), 'dragon_dagger', { rng: rngSeq(0, 0.5, 0, 0.5) });
    expect(a.getState().current.specEnergy).toBe(75); // 100 - 25
  });

  it('rejects unknown specId', () => {
    const r = executeSpecAttack(createActorStore(), createActorStore(), 'rusty_sword');
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe('unknown_spec');
  });
});

// ── Armadyl Godsword ─────────────────────────────────────────────────────────

describe('resolveSpecAttack — AGS (2.0× accuracy, 1.375× max hit)', () => {
  // ACCEPTANCE #1
  it('spec max hit = floor(base_max * 1.375)', () => {
    const attacker = maxMain('armadyl_godsword'); // no prayer, max hit = 34
    const defender = maxMain(null);
    const r = resolveSpecAttack(attacker, defender, 'armadyl_godsword', {
      rng: rngSeq(0, 0.99)
    });
    expect(r.hit).toBe(true);
    // spec max hit = floor(34 * 1.375) = 46; rollDamage(46, 0.99) = floor(0.99*47) = 46
    expect(r.totalDamage).toBe(46);
    expect(r.totalRawDamage).toBe(46);
    expect(r.hits).toHaveLength(1);
  });

  it('attack type is slash and cooldown is AGS weapon speed (6)', () => {
    const r = resolveSpecAttack(maxMain('armadyl_godsword'), maxMain(null), 'armadyl_godsword', {
      rng: rngSeq(0, 0.5)
    });
    expect(r.attackType).toBe('slash');
    expect(r.attackCooldown).toBe(6);
  });

  it('spec accuracy mult doubles the attack roll; miss with scripted rng > hitChance', () => {
    const attacker = maxMain('armadyl_godsword');
    const defender = maxMain(null);
    // Find hitChance first with rng=0 (hit) and extract it
    const hitResult = resolveSpecAttack(attacker, defender, 'armadyl_godsword', { rng: rngSeq(0, 0.5) });
    const chance = hitResult.hitChance;

    // Now roll exactly above the hitChance — should miss
    const r = resolveSpecAttack(attacker, defender, 'armadyl_godsword', {
      rng: rngSeq(chance + 0.0001, 0.5)
    });
    expect(r.hit).toBe(false);
    expect(r.totalDamage).toBe(0);
  });

  it('protection prayer reduces AGS spec damage by 40%', () => {
    const attacker = maxMain('armadyl_godsword');
    const defender = maxMain(null, { activePrayers: ['protect_from_melee'] });
    const r = resolveSpecAttack(attacker, defender, 'armadyl_godsword', {
      rng: rngSeq(0, 0.99)
    });
    // raw = 46, protected = floor(46 * 0.6) = 27
    expect(r.totalRawDamage).toBe(46);
    expect(r.totalDamage).toBe(27);
    expect(r.protectingPrayer).toBe('protect_from_melee');
  });
});

// ── Dragon Dagger ─────────────────────────────────────────────────────────────

describe('resolveSpecAttack — DDagger (2 hits, 1.15× each)', () => {
  it('returns exactly 2 hits', () => {
    const r = resolveSpecAttack(maxMain('dragon_dagger'), maxMain(null), 'dragon_dagger', {
      rng: rngSeq(0, 0.99, 0, 0.99)
    });
    expect(r.hits).toHaveLength(2);
  });

  it('each hit uses floor(base_max * 1.15) as max hit', () => {
    // base max hit for dagger @ 99 no prayer aggressive = 18
    // spec max = floor(18 * 1.15) = 20
    const r = resolveSpecAttack(maxMain('dragon_dagger'), maxMain(null), 'dragon_dagger', {
      rng: rngSeq(0, 0.99, 0, 0.99)
    });
    // both hits rng=0.99 → floor(0.99 * 21) = 20
    expect(r.hits[0].rawDamage).toBe(20);
    expect(r.hits[1].rawDamage).toBe(20);
    expect(r.totalRawDamage).toBe(40);
  });

  it('each hit rolled independently — one can miss while other lands', () => {
    // acc1=0 (hit), dmg1=0.99 (20), acc2=0.9999 (miss), dmg irrelevant
    const r = resolveSpecAttack(maxMain('dragon_dagger'), maxMain(null), 'dragon_dagger', {
      rng: rngSeq(0, 0.99, 0.9999, 0.99)
    });
    expect(r.hits[0].rawDamage).toBe(20);
    expect(r.hits[1].rawDamage).toBe(0);
    expect(r.hit).toBe(true); // anyHit = true
    expect(r.totalRawDamage).toBe(20);
  });
});

// ── Dragon Warhammer ──────────────────────────────────────────────────────────

describe('resolveSpecAttack / executeSpecAttack — DWH (1.5× hit, -30% defence)', () => {
  // ACCEPTANCE #2
  it('spec max hit = floor(base_max * 1.5)', () => {
    // base max at 99 no prayer aggressive = 27; spec = floor(27 * 1.5) = 40
    const r = resolveSpecAttack(maxMain('dragon_warhammer'), maxMain(null), 'dragon_warhammer', {
      rng: rngSeq(0, 0.99)
    });
    expect(r.hit).toBe(true);
    // rollDamage(40, 0.99) = floor(0.99 * 41) = 40
    expect(r.totalDamage).toBe(40);
  });

  it('on_hit_effect is "reduce_defence_30pct"', () => {
    const r = resolveSpecAttack(maxMain('dragon_warhammer'), maxMain(null), 'dragon_warhammer', {
      rng: rngSeq(0, 0.99)
    });
    expect(r.onHitEffect).toBe('reduce_defence_30pct');
  });

  it('executeSpecAttack on hit reduces defender defence to floor(current * 0.70)', () => {
    const a = createActorStore({ equipment: { weapon: 'dragon_warhammer' } });
    const d = createActorStore(); // levels.defence = 99, boosts.defence = 0
    executeSpecAttack(a, d, 'dragon_warhammer', { rng: rngSeq(0, 0.99) });
    // current_def = 99, new = floor(99 * 0.7) = 69, boost = 69 - 99 = -30
    expect(d.getState().boosts.defence).toBe(-30);
  });

  it('executeSpecAttack on miss does NOT apply defence drain', () => {
    const a = createActorStore({ equipment: { weapon: 'dragon_warhammer' } });
    const d = createActorStore();
    // force miss: very high rng value for accuracy roll
    executeSpecAttack(a, d, 'dragon_warhammer', { rng: rngSeq(0.9999, 0.5) });
    expect(d.getState().boosts.defence).toBe(0); // unchanged
  });

  it('DWH stacks: a second hit further reduces already-drained defence', () => {
    const a = createActorStore({ equipment: { weapon: 'dragon_warhammer' } });
    const d = createActorStore();
    executeSpecAttack(a, d, 'dragon_warhammer', { rng: rngSeq(0, 0.5) });
    // after first hit: current_def = 99, new = 69, boost = -30
    const boostAfter1 = d.getState().boosts.defence; // -30
    expect(boostAfter1).toBe(-30);

    a.getState().setSpec(100); // restore spec energy
    executeSpecAttack(a, d, 'dragon_warhammer', { rng: rngSeq(0, 0.5) });
    // current_def = 99 + (-30) = 69, new = floor(69 * 0.7) = 48, boost = 48 - 99 = -51
    expect(d.getState().boosts.defence).toBe(48 - 99);
  });
});

// ── Granite Maul (instant) ────────────────────────────────────────────────────

describe('resolveSpecAttack — Gmaul (instant: attackCooldown = 0)', () => {
  // ACCEPTANCE #3 — Gmaul stacking
  it('attackCooldown is 0 (not weapon speed 7) after Gmaul spec', () => {
    const r = resolveSpecAttack(maxMain('granite_maul'), maxMain(null), 'granite_maul', {
      rng: rngSeq(0, 0.99)
    });
    expect(r.attackCooldown).toBe(0);
  });

  it('executeSpecAttack sets attacker attackCooldown to 0 for Gmaul', () => {
    const a = createActorStore({ equipment: { weapon: 'granite_maul' } });
    executeSpecAttack(a, createActorStore(), 'granite_maul', { rng: rngSeq(0, 0.99) });
    expect(a.getState().attackCooldown).toBe(0);
  });

  it('non-instant spec sets attackCooldown to weapon speed', () => {
    const a = createActorStore({ equipment: { weapon: 'armadyl_godsword' } });
    executeSpecAttack(a, createActorStore(), 'armadyl_godsword', { rng: rngSeq(0, 0.5) });
    expect(a.getState().attackCooldown).toBe(6); // AGS speed
  });
});

// ── Dragon Claws cascade ──────────────────────────────────────────────────────

describe('resolveSpecAttack — Dragon Claws cascade (4 hits)', () => {
  it('returns exactly 4 hits', () => {
    const r = resolveSpecAttack(maxMain('dragon_claws'), maxMain(null), 'dragon_claws', {
      rng: rngSeq(0, 0.99, 0.99, 0.99, 0.99)
    });
    expect(r.hits).toHaveLength(4);
  });

  it('cascade max hits descend: H1 max = base/2, H2 max = H1/2, H3 = H2/2, H4 = H3/2', () => {
    // base max = 21; H1 max=10, H2 max=5, H3 max=2, H4 max=1
    // rng=0.99 for all damage rolls → each hit = max of its range
    const r = resolveSpecAttack(maxMain('dragon_claws'), maxMain(null), 'dragon_claws', {
      rng: rngSeq(0, 0.99, 0.99, 0.99, 0.99) // acc, H1, H2, H3, H4
    });
    expect(r.hits[0].rawDamage).toBe(10); // floor(0.99 * 11) = 10
    expect(r.hits[1].rawDamage).toBe(5);  // floor(0.99 * 6) = 5  (H2 max = H1/2 = 5)
    expect(r.hits[2].rawDamage).toBe(2);  // floor(0.99 * 3) = 2  (H3 max = H2/2 = 2)
    expect(r.hits[3].rawDamage).toBe(1);  // floor(0.99 * 2) = 1  (H4 max = H3/2 = 1)
    expect(r.totalRawDamage).toBe(18);
  });

  it('when first hit rolls 0, fallback max hits kick in', () => {
    // H1 = 0 (rng=0), H2 fallback max = floor(21 * 3/8) = 7
    const r = resolveSpecAttack(maxMain('dragon_claws'), maxMain(null), 'dragon_claws', {
      rng: rngSeq(0, 0, 0.99, 0, 0) // acc=hit, H1=0, H2=max(7), H3=0, H4=0
    });
    expect(r.hits[0].rawDamage).toBe(0);
    expect(r.hits[1].rawDamage).toBe(7); // floor(0.99 * 8) = 7
  });

  it('all 4 zeros when accuracy fails', () => {
    const r = resolveSpecAttack(maxMain('dragon_claws'), maxMain(null), 'dragon_claws', {
      rng: rngSeq(0.9999) // miss
    });
    expect(r.hit).toBe(false);
    expect(r.totalDamage).toBe(0);
    expect(r.hits.every(h => h.rawDamage === 0)).toBe(true);
  });
});

// ── Voidwaker ────────────────────────────────────────────────────────────────

describe('resolveSpecAttack — Voidwaker (guaranteed hit, [50%, 150%] max hit range)', () => {
  // ACCEPTANCE #4
  it('always hits regardless of rng roll (no accuracy check)', () => {
    // rng always returns 0.9999 — would miss normal accuracy but voidwaker bypasses
    const r = resolveSpecAttack(maxMain('voidwaker'), maxMain(null), 'voidwaker', {
      rng: rngSeq(0.9999) // only 1 rng call for damage
    });
    expect(r.hit).toBe(true);
  });

  it('damage floor = floor(maxHit * 0.5), ceiling = floor(maxHit * 1.5)', () => {
    // base max = 23 (99 str, no prayer, aggressive)
    // floor = floor(23 * 0.5) = 11, ceil = floor(23 * 1.5) = 34
    const rFloor = resolveSpecAttack(maxMain('voidwaker'), maxMain(null), 'voidwaker', {
      rng: rngSeq(0) // roll 0 → floor_dmg + 0 = 11
    });
    const rCeil = resolveSpecAttack(maxMain('voidwaker'), maxMain(null), 'voidwaker', {
      rng: rngSeq(0.99) // roll 0.99 → floor_dmg + floor(0.99 * 24) = 11 + 23 = 34
    });
    expect(rFloor.totalDamage).toBe(11);
    expect(rCeil.totalDamage).toBe(34);
  });

  it('damage is always at least floor(maxHit * 0.5)', () => {
    for (let i = 0; i < 20; i++) {
      const r = resolveSpecAttack(maxMain('voidwaker'), maxMain(null), 'voidwaker', {
        rng: Math.random
      });
      expect(r.totalDamage).toBeGreaterThanOrEqual(11);
      expect(r.totalDamage).toBeLessThanOrEqual(34);
    }
  });
});

// ── Volatile Nightmare Staff ──────────────────────────────────────────────────

describe('resolveSpecAttack — Volatile Nightmare Staff (magic spec, base 58)', () => {
  it('attack type is magic', () => {
    const r = resolveSpecAttack(maxMain('volatile_nightmare_staff'), maxMain(null), 'volatile_nightmare_staff', {
      rng: rngSeq(0, 0.99)
    });
    expect(r.attackType).toBe('magic');
  });

  it('specMax = floor(58 * (1 + magic_damage_bonus)); volatile staff has 0.15 bonus → 66', () => {
    const r = resolveSpecAttack(maxMain('volatile_nightmare_staff'), maxMain(null), 'volatile_nightmare_staff', {
      rng: rngSeq(0, 0.99) // acc=hit, dmg=0.99
    });
    expect(r.hit).toBe(true);
    // specMax = floor(58 * 1.15) = 66; rollDamage(66, 0.99) = floor(0.99 * 67) = 66
    expect(r.totalDamage).toBe(66);
  });

  it('misses deal 0 damage', () => {
    const r = resolveSpecAttack(maxMain('volatile_nightmare_staff'), maxMain(null), 'volatile_nightmare_staff', {
      rng: rngSeq(0.9999)
    });
    expect(r.hit).toBe(false);
    expect(r.totalDamage).toBe(0);
  });

  it('Protect from Magic reduces volatile spec damage by 40%', () => {
    const attacker = maxMain('volatile_nightmare_staff');
    const defender = maxMain(null, { activePrayers: ['protect_from_magic'] });
    const r = resolveSpecAttack(attacker, defender, 'volatile_nightmare_staff', {
      rng: rngSeq(0, 0.99)
    });
    expect(r.totalRawDamage).toBe(66);
    expect(r.totalDamage).toBe(Math.floor(66 * 0.6)); // 39
    expect(r.protectingPrayer).toBe('protect_from_magic');
  });
});

// ── executeSpecAttack — store side effects ────────────────────────────────────

describe('executeSpecAttack — store side effects', () => {
  it('damage is applied to defender HP', () => {
    const a = createActorStore({ equipment: { weapon: 'armadyl_godsword' } });
    const d = createActorStore();
    executeSpecAttack(a, d, 'armadyl_godsword', { rng: rngSeq(0, 0.99) });
    expect(d.getState().current.hp).toBe(99 - 46);
  });

  it('HP cannot go below 0', () => {
    const a = createActorStore({ equipment: { weapon: 'armadyl_godsword' } });
    const d = createActorStore();
    d.getState().setHP(10);
    executeSpecAttack(a, d, 'armadyl_godsword', { rng: rngSeq(0, 0.99) });
    expect(d.getState().current.hp).toBe(0);
  });

  it('miss leaves defender HP unchanged', () => {
    const a = createActorStore({ equipment: { weapon: 'armadyl_godsword' } });
    const d = createActorStore();
    executeSpecAttack(a, d, 'armadyl_godsword', { rng: rngSeq(0.9999, 0.5) });
    expect(d.getState().current.hp).toBe(99);
  });
});

// ── makeSpecHandler — ActionQueue integration ─────────────────────────────────

describe('makeSpecHandler — ActionQueue integration', () => {
  beforeEach(() => useGameStore.getState().clearLog());

  it('spec fires at P3 before P5 attack', () => {
    const player = createActorStore({ equipment: { weapon: 'armadyl_godsword' } });
    const bot = createActorStore();
    const q = new ActionQueue();
    q.register('toggle_spec', makeSpecHandler());
    q.register('attack', makeAttackHandler());

    q.enqueue({ actor: 'player', type: 'toggle_spec', payload: { specId: 'armadyl_godsword', rng: rngSeq(0, 0.99) } });
    q.flushTick({ player, bot, game: useGameStore, tick: 1 });

    expect(bot.getState().current.hp).toBe(99 - 46);
    expect(player.getState().current.specEnergy).toBe(50);
  });

  // ACCEPTANCE #3 — Gmaul stacking: instant spec + normal attack in one tick
  it('Gmaul instant spec (P3) allows normal attack (P5) in same tick', () => {
    const player = createActorStore({ equipment: { weapon: 'granite_maul' } });
    const bot = createActorStore();
    const q = new ActionQueue();
    q.register('toggle_spec', makeSpecHandler());
    q.register('attack', makeAttackHandler());

    // spec rng: acc=0 (hit), dmg=0.99 → rollDamage(25, 0.99) = 25
    // attack rng: acc=0 (hit), dmg=0.99 → rollDamage(25, 0.99) = 25
    q.enqueue({
      actor: 'player',
      type: 'toggle_spec',
      payload: { specId: 'granite_maul', rng: rngSeq(0, 0.99) }
    });
    q.enqueue({
      actor: 'player',
      type: 'attack',
      payload: { rng: rngSeq(0, 0.99) }
    });
    q.flushTick({ player, bot, game: useGameStore, tick: 1 });

    // Both spec and attack landed: bot took 25 + 25 = 50 damage
    expect(bot.getState().current.hp).toBe(49);
  });

  it('non-instant spec (AGS) blocks the same-tick attack', () => {
    const player = createActorStore({ equipment: { weapon: 'armadyl_godsword' } });
    const bot = createActorStore();
    const q = new ActionQueue();
    q.register('toggle_spec', makeSpecHandler());
    q.register('attack', makeAttackHandler());

    q.enqueue({
      actor: 'player',
      type: 'toggle_spec',
      payload: { specId: 'armadyl_godsword', rng: rngSeq(0, 0.99) }
    });
    q.enqueue({
      actor: 'player',
      type: 'attack',
      payload: { rng: rngSeq(0, 0.99) }
    });
    q.flushTick({ player, bot, game: useGameStore, tick: 1 });

    // Only spec landed (46 damage); normal attack was blocked by cooldown=6
    expect(bot.getState().current.hp).toBe(99 - 46);
  });

  it('failed spec logs reason without throwing', () => {
    const player = createActorStore({ equipment: { weapon: 'armadyl_godsword' } });
    player.getState().setSpec(10);
    const bot = createActorStore();
    const q = new ActionQueue();
    q.register('toggle_spec', makeSpecHandler());

    q.enqueue({ actor: 'player', type: 'toggle_spec', payload: { specId: 'armadyl_godsword' } });
    expect(() =>
      q.flushTick({ player, bot, game: useGameStore, tick: 1 })
    ).not.toThrow();
    expect(
      useGameStore.getState().combatLog.some(l => /insufficient_spec_energy/.test(l))
    ).toBe(true);
  });
});
