import { describe, it, expect } from 'vitest';
import {
  computeBonuses,
  emptyBonuses,
  getAttackSpeed,
  getAttackType,
  getWeapon,
  isTwoHanded,
  EQUIPMENT_SLOTS,
  BONUS_KEYS
} from '../engine/Bonuses.js';

const allSlotsEmpty = () =>
  Object.fromEntries(EQUIPMENT_SLOTS.map(s => [s, null]));

describe('computeBonuses', () => {
  it('returns all-zero bonuses for empty equipment', () => {
    expect(computeBonuses(allSlotsEmpty())).toEqual(emptyBonuses());
  });

  it('returns all-zero bonuses for null equipment (defensive)', () => {
    expect(computeBonuses(null)).toEqual(emptyBonuses());
  });

  // Acceptance #1
  it('equipping a whip raises attack_slash and melee_strength by +82 each', () => {
    const eq = { ...allSlotsEmpty(), weapon: 'abyssal_whip' };
    const b = computeBonuses(eq);
    expect(b.attack_slash).toBe(82);
    expect(b.melee_strength).toBe(82);
    // Everything else stays at zero — sanity.
    for (const k of BONUS_KEYS) {
      if (k !== 'attack_slash' && k !== 'melee_strength') {
        expect(b[k]).toBe(0);
      }
    }
  });

  it('stacks bonuses across multiple equipped slots', () => {
    const b = computeBonuses({
      ...allSlotsEmpty(),
      weapon: 'abyssal_whip',
      head: 'neitiznot_helm',
      neck: 'amulet_of_fury'
    });
    expect(b.attack_slash).toBe(82 + 0 + 10);
    expect(b.melee_strength).toBe(82 + 3 + 8);
    expect(b.prayer).toBe(0 + 3 + 5);
  });

  it('ignores unknown item ids without crashing', () => {
    const b = computeBonuses({ ...allSlotsEmpty(), weapon: 'mystery_blade' });
    expect(b).toEqual(emptyBonuses());
  });
});

describe('getAttackSpeed / getAttackType / isTwoHanded', () => {
  it('returns the equipped weapon attack speed', () => {
    expect(getAttackSpeed({ weapon: 'abyssal_whip' })).toBe(4);
    expect(getAttackSpeed({ weapon: 'armadyl_godsword' })).toBe(6);
    expect(getAttackSpeed({ weapon: 'granite_maul' })).toBe(7);
    expect(getAttackSpeed({ weapon: 'rune_crossbow' })).toBe(5);
  });

  it('defaults to 4 ticks for empty weapon slot (unarmed)', () => {
    expect(getAttackSpeed({ weapon: null })).toBe(4);
    expect(getAttackSpeed({})).toBe(4);
  });

  it('returns the weapon default attack type', () => {
    expect(getAttackType({ weapon: 'abyssal_whip' })).toBe('slash');
    expect(getAttackType({ weapon: 'dragon_dagger' })).toBe('stab');
    expect(getAttackType({ weapon: 'granite_maul' })).toBe('crush');
    expect(getAttackType({ weapon: 'volatile_nightmare_staff' })).toBe('magic');
    expect(getAttackType({ weapon: 'rune_crossbow' })).toBe('ranged');
  });

  it('flags two-handed weapons correctly', () => {
    expect(isTwoHanded({ weapon: 'armadyl_godsword' })).toBe(true);
    expect(isTwoHanded({ weapon: 'granite_maul' })).toBe(true);
    expect(isTwoHanded({ weapon: 'rune_crossbow' })).toBe(true);
    expect(isTwoHanded({ weapon: 'abyssal_whip' })).toBe(false);
    expect(isTwoHanded({ weapon: 'dragon_dagger' })).toBe(false);
    expect(isTwoHanded({ weapon: null })).toBe(false);
  });

  it('getWeapon returns the equipped item object', () => {
    expect(getWeapon({ weapon: 'abyssal_whip' })?.name).toBe('Abyssal whip');
    expect(getWeapon({ weapon: null })).toBe(null);
  });
});
