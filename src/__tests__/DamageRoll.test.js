import { describe, it, expect } from 'vitest';
import { maxHit, rollDamage, SPELL_MAX_HITS } from '../engine/DamageRoll.js';
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
    equipment: emptyEq(),
    ...overrides
  };
}

describe('maxHit — melee strength formula', () => {
  // Acceptance: max main with whip, Piety, Aggressive, full str gear = 34.
  // Loadout chosen so str bonus = 103 (whip 82 + helm 3 + fury 8 + cape 4 + def 6):
  //   eff_str = floor(99 * 1.23) + 3 + 8 = 132
  //   mh = floor(0.5 + 132 * (103 + 64) / 640) = floor(0.5 + 34.44375) = 34
  it('PHASE 6 ACCEPTANCE — max main, Piety, Aggressive = 34', () => {
    const eq = emptyEq();
    eq.weapon = 'abyssal_whip';
    eq.head = 'neitiznot_helm';
    eq.neck = 'amulet_of_fury';
    eq.cape = 'fire_cape';
    eq.shield = 'dragon_defender';
    const a = maxMain({
      equipment: eq,
      activePrayers: ['piety'],
      attackStyle: 'aggressive'
    });
    expect(maxHit(a, 'slash')).toBe(34);
  });

  it('bare whip, Piety, Aggressive = 30', () => {
    // eff_str = 132; mh = floor(0.5 + 132 * (82 + 64) / 640)
    //                   = floor(0.5 + 30.1125) = 30
    const eq = { ...emptyEq(), weapon: 'abyssal_whip' };
    const a = maxMain({ equipment: eq, activePrayers: ['piety'] });
    expect(maxHit(a, 'slash')).toBe(30);
  });

  it('Aggressive >= Controlled >= Accurate; Aggressive strictly > Accurate', () => {
    // With bare whip the eff_str step from +3 to +1 (agg->ctrl) doesn't cross a
    // floor() boundary, so they can tie. The 3-point gap between aggressive
    // and accurate always does cross one.
    const eq = { ...emptyEq(), weapon: 'abyssal_whip' };
    const make = style =>
      maxMain({ equipment: eq, activePrayers: ['piety'], attackStyle: style });
    const agg = maxHit(make('aggressive'), 'slash');
    const ctrl = maxHit(make('controlled'), 'slash');
    const acc = maxHit(make('accurate'), 'slash');
    expect(agg).toBeGreaterThanOrEqual(ctrl);
    expect(ctrl).toBeGreaterThanOrEqual(acc);
    expect(agg).toBeGreaterThan(acc);
    expect(acc).toBe(maxHit(make('defensive'), 'slash')); // both 0 style str
  });

  it('Piety > Chivalry > Ultimate > none', () => {
    const eq = { ...emptyEq(), weapon: 'abyssal_whip' };
    const make = pr =>
      maxMain({ equipment: eq, activePrayers: pr, attackStyle: 'aggressive' });
    const none = maxHit(make([]), 'slash');
    const ult = maxHit(make(['ultimate_strength']), 'slash');
    const chiv = maxHit(make(['chivalry']), 'slash');
    const piety = maxHit(make(['piety']), 'slash');
    expect(piety).toBeGreaterThan(chiv);
    expect(chiv).toBeGreaterThan(ult);
    expect(ult).toBeGreaterThan(none);
  });

  it('strength boost (super-combat-like +19) raises max hit', () => {
    const eq = { ...emptyEq(), weapon: 'abyssal_whip' };
    const base = maxMain({ equipment: eq, activePrayers: ['piety'] });
    const boosted = maxMain({
      equipment: eq,
      activePrayers: ['piety'],
      boosts: { strength: 19, attack: 0, defence: 0, ranged: 0, magic: 0 }
    });
    expect(maxHit(boosted, 'slash')).toBeGreaterThan(maxHit(base, 'slash'));
  });

  it('returns 0-ish max hit with no weapon (unarmed)', () => {
    const a = maxMain();
    // eff_str = 99 + 3 + 8 = 110; mh = floor(0.5 + 110*64/640) = floor(0.5+11) = 11
    expect(maxHit(a, 'crush')).toBe(11);
  });
});

describe('maxHit — gear-set modifiers', () => {
  it('Void melee multiplies effective strength by 1.10', () => {
    const eq = { ...emptyEq(), weapon: 'abyssal_whip' };
    const a = maxMain({ equipment: eq, activePrayers: ['piety'] });
    const base = maxHit(a, 'slash');
    const voided = maxHit(a, 'slash', { voidMelee: true });
    // eff_str 132 -> floor(132*1.10) = 145
    // mh = floor(0.5 + 145 * 146 / 640) = floor(0.5 + 33.078) = 33
    // (base = 30 with bare whip)
    expect(voided).toBeGreaterThan(base);
    expect(voided).toBe(33);
  });

  it('Slayer helm applies 7/6 multiplier after base max hit', () => {
    const eq = { ...emptyEq(), weapon: 'abyssal_whip' };
    const a = maxMain({ equipment: eq, activePrayers: ['piety'] });
    const base = maxHit(a, 'slash');
    const slayer = maxHit(a, 'slash', { slayer: true });
    expect(slayer).toBe(Math.floor(base * (7 / 6)));
    expect(slayer).toBe(35); // floor(30 * 7/6) = 35
  });
});

describe('maxHit — ranged formula', () => {
  it('Rigour ranged_strength_mult applies (1.23)', () => {
    // Bare rune crossbow has 0 ranged_strength (it's a launcher; bolts add str).
    // Test with a fabricated bonus via no ammo; we just verify the formula path.
    const eq = { ...emptyEq(), weapon: 'rune_crossbow' };
    const a = maxMain({
      equipment: eq,
      activePrayers: ['rigour'],
      attackStyle: 'accurate'
    });
    // eff_rng_str = floor(99 * 1.23) + 3 + 8 = 132
    // mh = floor(0.5 + 132 * (0 + 64) / 640) = floor(0.5 + 13.2) = 13
    expect(maxHit(a, 'ranged')).toBe(13);
  });

  it('Void ranged multiplies effective ranged strength by 1.10', () => {
    const eq = { ...emptyEq(), weapon: 'rune_crossbow' };
    const a = maxMain({ equipment: eq, activePrayers: ['rigour'], attackStyle: 'accurate' });
    const base = maxHit(a, 'ranged');
    const voided = maxHit(a, 'ranged', { voidRanged: true });
    expect(voided).toBeGreaterThan(base);
  });
});

describe('maxHit — magic formula (spell-based)', () => {
  it('Ice Barrage from staff with no magic damage = 30', () => {
    const eq = { ...emptyEq() };
    const a = maxMain({ equipment: eq });
    expect(maxHit(a, 'magic', { spell: 'ice_barrage' })).toBe(30);
  });

  it('Ice Barrage from Volatile staff (15% magic damage) = floor(30 * 1.15) = 34', () => {
    const eq = { ...emptyEq(), weapon: 'volatile_nightmare_staff' };
    const a = maxMain({ equipment: eq });
    expect(maxHit(a, 'magic', { spell: 'ice_barrage' })).toBe(34);
  });

  it('Fire Surge 24, Ice Blitz 26 from the spell table', () => {
    expect(SPELL_MAX_HITS.fire_surge).toBe(24);
    expect(SPELL_MAX_HITS.ice_blitz).toBe(26);
    const a = maxMain();
    expect(maxHit(a, 'magic', { spell: 'fire_surge' })).toBe(24);
    expect(maxHit(a, 'magic', { spell: 'ice_blitz' })).toBe(26);
  });

  it('returns 0 if no spell is supplied', () => {
    const a = maxMain();
    expect(maxHit(a, 'magic')).toBe(0);
    expect(maxHit(a, 'magic', { spell: 'unknown' })).toBe(0);
  });

  it('Slayer 7/6 multiplier also applies to magic damage', () => {
    const eq = { ...emptyEq(), weapon: 'volatile_nightmare_staff' };
    const a = maxMain({ equipment: eq });
    expect(maxHit(a, 'magic', { spell: 'ice_barrage', slayer: true })).toBe(
      Math.floor(34 * (7 / 6))
    );
  });
});

describe('rollDamage — uniform [0, maxHit] inclusive', () => {
  it('rng=0 rolls 0', () => {
    expect(rollDamage(20, () => 0)).toBe(0);
  });

  it('rng just under 1 rolls maxHit (top bucket inclusive)', () => {
    // floor(0.999... * 21) = 20
    expect(rollDamage(20, () => 0.9999999)).toBe(20);
  });

  it('maxHit=0 always rolls 0', () => {
    expect(rollDamage(0)).toBe(0);
    expect(rollDamage(0, () => 0.9)).toBe(0);
  });

  it('rng = k/(max+1) deterministically rolls integer k', () => {
    const max = 10;
    for (let k = 0; k <= max; k++) {
      // rng must be the *start* of bucket k, so use k/(max+1) plus epsilon
      const rng = () => k / (max + 1) + 1e-9;
      expect(rollDamage(max, rng)).toBe(k);
    }
  });

  // Acceptance #2: distribution covers [0, max] inclusive
  it('1000 rolls span every value in [0, max]', () => {
    const max = 20;
    const seen = new Set();
    for (let i = 0; i < 1000; i++) seen.add(rollDamage(max));
    for (let v = 0; v <= max; v++) expect(seen.has(v)).toBe(true);
  });

  it('10000 rolls give roughly uniform distribution (mean ~max/2)', () => {
    const max = 30;
    let sum = 0;
    const n = 10000;
    for (let i = 0; i < n; i++) sum += rollDamage(max);
    const mean = sum / n;
    expect(mean).toBeGreaterThan(max / 2 - 1.0);
    expect(mean).toBeLessThan(max / 2 + 1.0);
  });
});
