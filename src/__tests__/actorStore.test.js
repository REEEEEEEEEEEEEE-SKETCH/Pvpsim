import { describe, it, expect, beforeEach } from 'vitest';
import { createActorStore } from '../store/actorStore.js';
import { computeBonuses, getAttackSpeed } from '../engine/Bonuses.js';

describe('createActorStore — initial state shape', () => {
  it('exposes the full state shape specified in the brief', () => {
    const store = createActorStore();
    const s = store.getState();

    expect(s.levels).toEqual({
      attack: 99, strength: 99, defence: 99,
      hitpoints: 99, prayer: 99, ranged: 99, magic: 99
    });
    expect(s.current).toEqual({ hp: 99, prayer: 99, specEnergy: 100 });
    expect(s.boosts).toEqual({
      attack: 0, strength: 0, defence: 0, ranged: 0, magic: 0
    });
    expect(s.equipment).toEqual({
      head: null, cape: null, neck: null, ammo: null, weapon: null,
      body: null, shield: null, legs: null, hands: null, feet: null, ring: null
    });
    expect(s.activePrayers).toEqual([]);
    expect(s.attackStyle).toBe('aggressive');
    expect(s.attackCooldown).toBe(0);
    expect(s.eatCooldown).toBe(0);
    expect(s.inventory).toEqual([]);
  });

  it('respects initial overrides for levels, current, equipment', () => {
    const store = createActorStore({
      levels: { hitpoints: 75, prayer: 70 },
      current: { hp: 40, specEnergy: 50 },
      equipment: { weapon: 'abyssal_whip' }
    });
    const s = store.getState();
    expect(s.levels.hitpoints).toBe(75);
    expect(s.levels.prayer).toBe(70);
    expect(s.current.hp).toBe(40);
    expect(s.current.specEnergy).toBe(50);
    expect(s.equipment.weapon).toBe('abyssal_whip');
  });
});

describe('createActorStore — equipment and bonuses', () => {
  let store;
  beforeEach(() => {
    store = createActorStore();
  });

  // Acceptance #1 via the store
  it('equipping a whip raises slash & str bonuses by 82 each (computed live)', () => {
    store.getState().equip('weapon', 'abyssal_whip');
    const b = store.getState().getBonuses();
    expect(b.attack_slash).toBe(82);
    expect(b.melee_strength).toBe(82);
  });

  // Acceptance #2
  it('swapping weapon updates bonuses AND attack speed immediately', () => {
    store.getState().equip('weapon', 'abyssal_whip');
    expect(store.getState().getBonuses().attack_slash).toBe(82);
    expect(store.getState().getAttackSpeed()).toBe(4);

    store.getState().equip('weapon', 'armadyl_godsword');
    const after = store.getState();
    expect(after.getBonuses().attack_slash).toBe(132);
    expect(after.getBonuses().melee_strength).toBe(132);
    expect(after.getAttackSpeed()).toBe(6);
  });

  it('equipping a 2H weapon auto-clears the shield slot', () => {
    store.getState().equip('shield', 'dragon_defender');
    expect(store.getState().equipment.shield).toBe('dragon_defender');

    store.getState().equip('weapon', 'armadyl_godsword');
    expect(store.getState().equipment.weapon).toBe('armadyl_godsword');
    expect(store.getState().equipment.shield).toBe(null);
  });

  it('equipping a shield with a 2H weapon equipped clears the weapon', () => {
    store.getState().equip('weapon', 'granite_maul');
    store.getState().equip('shield', 'dragon_defender');
    expect(store.getState().equipment.weapon).toBe(null);
    expect(store.getState().equipment.shield).toBe('dragon_defender');
  });

  it('unequip clears a single slot', () => {
    store.getState().equip('weapon', 'abyssal_whip');
    store.getState().unequip('weapon');
    expect(store.getState().equipment.weapon).toBe(null);
  });

  it('invalid slot name is a no-op', () => {
    const before = store.getState().equipment;
    store.getState().equip('belt', 'abyssal_whip');
    expect(store.getState().equipment).toEqual(before);
  });
});

describe('createActorStore — HP / prayer / spec', () => {
  let store;
  beforeEach(() => {
    store = createActorStore();
  });

  it('damage clamps HP at zero', () => {
    store.getState().damage(120);
    expect(store.getState().current.hp).toBe(0);
  });

  it('heal caps at max HP by default', () => {
    store.getState().damage(50);
    store.getState().heal(99);
    expect(store.getState().current.hp).toBe(99);
  });

  it('heal can overheal (anglerfish path) when allowed', () => {
    store.getState().heal(10, true);
    expect(store.getState().current.hp).toBe(109);
  });

  it('spec energy clamps to 0..100', () => {
    store.getState().setSpec(150);
    expect(store.getState().current.specEnergy).toBe(100);
    store.getState().setSpec(-10);
    expect(store.getState().current.specEnergy).toBe(0);
  });

  it('spendSpec subtracts and floors at 0', () => {
    store.getState().spendSpec(50);
    expect(store.getState().current.specEnergy).toBe(50);
    store.getState().spendSpec(80);
    expect(store.getState().current.specEnergy).toBe(0);
  });

  it('drainPrayer floors at 0', () => {
    store.getState().drainPrayer(150);
    expect(store.getState().current.prayer).toBe(0);
  });
});

describe('createActorStore — prayers / cooldowns / inventory', () => {
  let store;
  beforeEach(() => {
    store = createActorStore();
  });

  it('activate/deactivate prayer manages the active list', () => {
    store.getState().activatePrayer('piety');
    expect(store.getState().activePrayers).toEqual(['piety']);
    store.getState().activatePrayer('piety');
    expect(store.getState().activePrayers).toEqual(['piety']);
    store.getState().deactivatePrayer('piety');
    expect(store.getState().activePrayers).toEqual([]);
  });

  it('decrementAttackCooldown floors at 0', () => {
    store.getState().setAttackCooldown(2);
    store.getState().decrementAttackCooldown();
    expect(store.getState().attackCooldown).toBe(1);
    store.getState().decrementAttackCooldown();
    store.getState().decrementAttackCooldown();
    expect(store.getState().attackCooldown).toBe(0);
  });

  it('inventory adds and removes items, capped at 28', () => {
    for (let i = 0; i < 30; i++) store.getState().addItem('shark');
    expect(store.getState().inventory.length).toBe(28);
    store.getState().removeItemAt(0);
    expect(store.getState().inventory.length).toBe(27);
  });

  it('boosts are tracked separately from base levels', () => {
    store.getState().addBoost('strength', 19);
    expect(store.getState().boosts.strength).toBe(19);
    expect(store.getState().levels.strength).toBe(99);
  });
});

describe('createActorStore — selectors are reactive to equipment changes', () => {
  it('getAttackSpeed reflects the current weapon, including after mid-tick swaps', () => {
    const store = createActorStore();
    expect(store.getState().getAttackSpeed()).toBe(4);

    store.getState().equip('weapon', 'granite_maul');
    expect(store.getState().getAttackSpeed()).toBe(7);

    store.getState().equip('weapon', 'armadyl_godsword');
    expect(store.getState().getAttackSpeed()).toBe(6);
  });

  it('getBonuses always reads live equipment (matches computeBonuses)', () => {
    const store = createActorStore();
    store.getState().equip('weapon', 'abyssal_whip');
    store.getState().equip('head', 'neitiznot_helm');
    expect(store.getState().getBonuses()).toEqual(
      computeBonuses(store.getState().equipment)
    );
  });
});
