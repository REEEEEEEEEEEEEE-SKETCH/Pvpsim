import { describe, it, expect } from 'vitest';
import {
  rollAccuracy,
  hitChance,
  maxAttackRoll,
  maxDefenceRoll
} from '../engine/AccuracyRoll.js';
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

describe('hitChance — branch selection', () => {
  it('uses the high-roll formula when atk > def', () => {
    expect(hitChance(100, 50)).toBeCloseTo(1 - 52 / 202, 6);
  });

  it('uses the low-roll formula when atk < def', () => {
    expect(hitChance(50, 100)).toBeCloseTo(50 / 202, 6);
  });

  it('TIE — when max_atk == max_def, uses the low-roll (<=) branch', () => {
    // Per the spec, the tie falls into the else branch.
    // Low-roll at parity: X / (2X+2) — slightly under 50% (defender edge).
    expect(hitChance(100, 100)).toBeCloseTo(100 / 202, 6);
    expect(hitChance(100, 100)).toBeLessThan(0.5);
  });
});

describe('maxAttackRoll — formula', () => {
  it('produces eff_atk = 126 for max main, Piety, Aggressive (no gear)', () => {
    // floor(99 * 1.20) + 0 + 8 = 118 + 8 = 126
    const a = maxMain({ attackStyle: 'aggressive', activePrayers: ['piety'] });
    expect(maxAttackRoll(a, 'slash')).toBe(126 * 64);
  });

  it('Accurate style adds +3 to attack level', () => {
    const a = maxMain({ attackStyle: 'accurate', activePrayers: ['piety'] });
    expect(maxAttackRoll(a, 'slash')).toBe(129 * 64);
  });

  it('Controlled style adds +1 to attack level', () => {
    const a = maxMain({ attackStyle: 'controlled', activePrayers: ['piety'] });
    expect(maxAttackRoll(a, 'slash')).toBe(127 * 64);
  });

  it('Defensive style adds +0 attack but +3 defence', () => {
    const a = maxMain({ attackStyle: 'defensive' });
    expect(maxAttackRoll(a, 'slash')).toBe((99 + 0 + 8) * 64);
    expect(maxDefenceRoll(a, 'slash')).toBe((99 + 3 + 8) * 64);
  });

  it('whip bonus enters via (attack_slash + 64) factor', () => {
    const eq = emptyEq();
    eq.weapon = 'abyssal_whip';
    const a = maxMain({ equipment: eq, activePrayers: ['piety'] });
    expect(maxAttackRoll(a, 'slash')).toBe(126 * (82 + 64));
  });

  it('different attack types pull different slot bonuses', () => {
    const eq = emptyEq();
    eq.weapon = 'abyssal_whip'; // slash 82, stab 0, crush 0
    const a = maxMain({ equipment: eq });
    expect(maxAttackRoll(a, 'slash')).toBeGreaterThan(maxAttackRoll(a, 'stab'));
    expect(maxAttackRoll(a, 'stab')).toBe(maxAttackRoll(a, 'crush'));
  });

  it('Piety raises defence mult to 1.25', () => {
    const a = maxMain({ activePrayers: ['piety'] });
    expect(maxDefenceRoll(a, 'slash')).toBe(131 * 64);
  });
});

describe('maxAttackRoll — ranged & magic dispatch', () => {
  it('ranged uses ranged level + attack_ranged + ranged prayer mult (Rigour 1.20)', () => {
    const eq = emptyEq();
    eq.weapon = 'rune_crossbow'; // attack_ranged = 90
    const a = maxMain({
      equipment: eq,
      activePrayers: ['rigour'],
      attackStyle: 'accurate'
    });
    // floor(99 * 1.20) + 3 + 8 = 129;  max = 129 * (90 + 64) = 129 * 154
    expect(maxAttackRoll(a, 'ranged')).toBe(129 * 154);
  });

  it('magic uses magic level + attack_magic + magic prayer mult (Augury 1.25)', () => {
    const eq = emptyEq();
    eq.weapon = 'volatile_nightmare_staff'; // attack_magic = 16
    const a = maxMain({ equipment: eq, activePrayers: ['augury'] });
    // floor(99 * 1.25) + 0 + 8 = 131
    expect(maxAttackRoll(a, 'magic')).toBe(131 * (16 + 64));
  });
});

describe('rollAccuracy — Phase 5 acceptance', () => {
  // Max main with whip vs max main, both Piety, slash → hit chance ~70-75%.
  // Loadout: whip + amulet of fury both sides (canonical "max main slash" reference
  // setup for accuracy; full tank gear pushes hit chance into the 30-40% band).
  it('max main (whip+fury) vs max main (whip+fury), both Piety, slash ~73%', () => {
    const eq = () => {
      const e = emptyEq();
      e.weapon = 'abyssal_whip';
      e.neck = 'amulet_of_fury';
      return e;
    };
    const a = maxMain({
      equipment: eq(),
      activePrayers: ['piety'],
      attackStyle: 'aggressive'
    });
    const d = maxMain({
      equipment: eq(),
      activePrayers: ['piety'],
      attackStyle: 'aggressive'
    });
    const { hitChance: hc } = rollAccuracy(a, d, 'slash', { rng: () => 0.5 });

    // Hand math:
    //   eff_atk = floor(99*1.20) + 0 + 8 = 126; max_atk = 126 * (92 + 64) = 19656
    //   eff_def = floor(99*1.25) + 0 + 8 = 131; max_def = 131 * (15 + 64) = 10349
    //   hit = 1 - (10349 + 2) / (2 * (19656 + 1)) ≈ 0.7367
    expect(hc).toBeGreaterThan(0.70);
    expect(hc).toBeLessThan(0.75);
    expect(hc).toBeCloseTo(0.7367, 3);
  });

  it('attacker style ladder: accurate > controlled > aggressive', () => {
    const eq = () => {
      const e = emptyEq();
      e.weapon = 'abyssal_whip';
      e.neck = 'amulet_of_fury';
      return e;
    };
    const d = maxMain({
      equipment: eq(),
      activePrayers: ['piety'],
      attackStyle: 'aggressive'
    });
    const styleHC = style =>
      rollAccuracy(
        maxMain({
          equipment: eq(),
          activePrayers: ['piety'],
          attackStyle: style
        }),
        d,
        'slash',
        { rng: () => 0.5 }
      ).hitChance;

    expect(styleHC('accurate')).toBeGreaterThan(styleHC('controlled'));
    expect(styleHC('controlled')).toBeGreaterThan(styleHC('aggressive'));
  });
});

describe('rollAccuracy — roll outcome', () => {
  it('rng <= hitChance => hit', () => {
    const a = maxMain({ equipment: { ...emptyEq(), weapon: 'abyssal_whip' } });
    const d = maxMain();
    const { hit, hitChance: hc } = rollAccuracy(a, d, 'slash', { rng: () => 0 });
    expect(hit).toBe(true);
    expect(hc).toBeGreaterThan(0.5);
  });

  it('rng > hitChance => miss', () => {
    const a = maxMain({ equipment: { ...emptyEq(), weapon: 'abyssal_whip' } });
    const d = maxMain();
    const { hit } = rollAccuracy(a, d, 'slash', { rng: () => 0.999999 });
    expect(hit).toBe(false);
  });

  it('rng EXACTLY equal to hitChance => hit (boundary uses <=)', () => {
    const a = maxMain({ equipment: { ...emptyEq(), weapon: 'abyssal_whip' } });
    const d = maxMain();
    const { hitChance: hc } = rollAccuracy(a, d, 'slash', { rng: () => 0 });
    const { hit } = rollAccuracy(a, d, 'slash', { rng: () => hc });
    expect(hit).toBe(true);
  });
});

describe('rollAccuracy — defender prayer prevents some hits', () => {
  it('defender Piety reduces hit chance vs identical no-prayer attacker', () => {
    const eq = () => {
      const e = emptyEq();
      e.weapon = 'abyssal_whip';
      e.neck = 'amulet_of_fury';
      return e;
    };
    const a = maxMain({ equipment: eq(), activePrayers: ['piety'] });
    const dBare = maxMain({ equipment: eq(), activePrayers: [] });
    const dPiety = maxMain({ equipment: eq(), activePrayers: ['piety'] });
    const hcBare = rollAccuracy(a, dBare, 'slash', { rng: () => 0.5 }).hitChance;
    const hcPiety = rollAccuracy(a, dPiety, 'slash', { rng: () => 0.5 }).hitChance;
    expect(hcPiety).toBeLessThan(hcBare);
  });
});
