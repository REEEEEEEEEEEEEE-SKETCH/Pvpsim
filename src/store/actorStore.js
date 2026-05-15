import { create } from 'zustand';
import items from '../data/items.json';
import {
  EQUIPMENT_SLOTS,
  computeBonuses,
  getAttackSpeed,
  getAttackType,
  getWeapon
} from '../engine/Bonuses.js';

const emptyEquipment = () =>
  Object.fromEntries(EQUIPMENT_SLOTS.map(s => [s, null]));

const maxLevels = () => ({
  attack: 99, strength: 99, defence: 99,
  hitpoints: 99, prayer: 99, ranged: 99, magic: 99
});

const zeroBoosts = () => ({
  attack: 0, strength: 0, defence: 0, ranged: 0, magic: 0
});

export function createActorStore(initial = {}) {
  const levels = { ...maxLevels(), ...(initial.levels ?? {}) };
  const current = {
    hp: levels.hitpoints,
    prayer: levels.prayer,
    specEnergy: 100,
    ...(initial.current ?? {})
  };
  const boosts = { ...zeroBoosts(), ...(initial.boosts ?? {}) };
  const equipment = { ...emptyEquipment(), ...(initial.equipment ?? {}) };

  return create((set, get) => ({
    levels,
    current,
    boosts,
    equipment,
    activePrayers: initial.activePrayers ?? [],
    attackStyle: initial.attackStyle ?? 'aggressive',
    attackCooldown: 0,
    eatCooldown: 0,
    inventory: initial.inventory ?? [],
    // Scaled-integer accumulator for prayer drain. tickPrayerDrain adds
    // (drain_rate * 30) per tick; one prayer point drains each time the
    // accumulator crosses (100 * (30 + prayer_bonus)). Integer math, no FP drift.
    prayerDrainAcc: 0,

    // Derived selectors — always reflect the latest equipment, including
    // mid-tick switches resolved by ActionQueue at priority 2.
    getBonuses: () => computeBonuses(get().equipment),
    getAttackSpeed: () => getAttackSpeed(get().equipment),
    getAttackType: () => getAttackType(get().equipment),
    getWeapon: () => getWeapon(get().equipment),

    equip: (slot, itemId, itemsDb = items) => set(state => {
      if (!EQUIPMENT_SLOTS.includes(slot)) return state;
      const item = itemId ? itemsDb[itemId] : null;
      if (itemId && !item) return state;

      const next = { ...state.equipment, [slot]: itemId };

      // 2-handed interlock — equipping a 2H weapon empties the shield slot,
      // and equipping any shield empties a 2H weapon slot.
      if (slot === 'weapon' && item?.two_handed) {
        next.shield = null;
      } else if (slot === 'shield' && item) {
        const w = state.equipment.weapon ? itemsDb[state.equipment.weapon] : null;
        if (w?.two_handed) next.weapon = null;
      }

      return { equipment: next };
    }),

    unequip: slot =>
      set(state =>
        EQUIPMENT_SLOTS.includes(slot)
          ? { equipment: { ...state.equipment, [slot]: null } }
          : state
      ),

    setHP: hp =>
      set(state => ({
        current: {
          ...state.current,
          hp: Math.max(0, Math.min(state.levels.hitpoints, hp))
        }
      })),

    damage: amt =>
      set(state => ({
        current: { ...state.current, hp: Math.max(0, state.current.hp - amt) }
      })),

    heal: (amt, allowOverheal = false) =>
      set(state => {
        const next = state.current.hp + amt;
        const capped = allowOverheal ? next : Math.min(state.levels.hitpoints, next);
        return { current: { ...state.current, hp: capped } };
      }),

    setPrayer: pts =>
      set(state => ({
        current: {
          ...state.current,
          prayer: Math.max(0, Math.min(state.levels.prayer, pts))
        }
      })),

    drainPrayer: amt =>
      set(state => ({
        current: { ...state.current, prayer: Math.max(0, state.current.prayer - amt) }
      })),

    // Integer-math drain step. `numerator` = drain_rate * 30 added each tick;
    // when the accumulator reaches `denominator` (= 100 * (30 + prayer_bonus)),
    // one prayer point drains and the accumulator wraps. Multi-point drains
    // per tick (high rate + low bonus) handled by integer division.
    accumulatePrayerDrain: (numerator, denominator) =>
      set(state => {
        const acc = state.prayerDrainAcc + numerator;
        if (acc < denominator) return { prayerDrainAcc: acc };
        const drain = Math.floor(acc / denominator);
        const remainder = acc - drain * denominator;
        const nextPrayer = state.current.prayer - drain;
        if (nextPrayer <= 0) {
          return {
            prayerDrainAcc: 0,
            current: { ...state.current, prayer: 0 },
            activePrayers: []
          };
        }
        return {
          prayerDrainAcc: remainder,
          current: { ...state.current, prayer: nextPrayer }
        };
      }),

    setSpec: pct =>
      set(state => ({
        current: { ...state.current, specEnergy: Math.max(0, Math.min(100, pct)) }
      })),

    spendSpec: cost =>
      set(state => ({
        current: {
          ...state.current,
          specEnergy: Math.max(0, state.current.specEnergy - cost)
        }
      })),

    setBoost: (stat, value) =>
      set(state => ({ boosts: { ...state.boosts, [stat]: value } })),

    addBoost: (stat, delta) =>
      set(state => ({
        boosts: { ...state.boosts, [stat]: (state.boosts[stat] ?? 0) + delta }
      })),

    setAttackStyle: style => set({ attackStyle: style }),

    activatePrayer: id =>
      set(state =>
        state.activePrayers.includes(id)
          ? state
          : { activePrayers: [...state.activePrayers, id] }
      ),

    deactivatePrayer: id =>
      set(state => ({
        activePrayers: state.activePrayers.filter(p => p !== id)
      })),

    setActivePrayers: prayers => set({ activePrayers: [...prayers] }),

    setAttackCooldown: ticks => set({ attackCooldown: Math.max(0, ticks) }),
    decrementAttackCooldown: () =>
      set(state => ({ attackCooldown: Math.max(0, state.attackCooldown - 1) })),

    setEatCooldown: ticks => set({ eatCooldown: Math.max(0, ticks) }),
    decrementEatCooldown: () =>
      set(state => ({ eatCooldown: Math.max(0, state.eatCooldown - 1) })),

    setInventory: inv => set({ inventory: [...inv] }),
    addItem: itemId =>
      set(state =>
        state.inventory.length >= 28
          ? state
          : { inventory: [...state.inventory, itemId] }
      ),
    removeItemAt: index =>
      set(state => ({ inventory: state.inventory.filter((_, i) => i !== index) }))
  }));
}
