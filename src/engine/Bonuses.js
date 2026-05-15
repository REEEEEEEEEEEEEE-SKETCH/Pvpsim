import items from '../data/items.json';

export const BONUS_KEYS = Object.freeze([
  'attack_stab', 'attack_slash', 'attack_crush', 'attack_magic', 'attack_ranged',
  'defence_stab', 'defence_slash', 'defence_crush', 'defence_magic', 'defence_ranged',
  'melee_strength', 'ranged_strength', 'magic_damage', 'prayer'
]);

export const EQUIPMENT_SLOTS = Object.freeze([
  'head', 'cape', 'neck', 'ammo', 'weapon', 'body',
  'shield', 'legs', 'hands', 'feet', 'ring'
]);

export function emptyBonuses() {
  const b = {};
  for (const k of BONUS_KEYS) b[k] = 0;
  return b;
}

export function getItem(itemId, itemsDb = items) {
  if (!itemId) return null;
  return itemsDb[itemId] ?? null;
}

export function computeBonuses(equipment, itemsDb = items) {
  const total = emptyBonuses();
  if (!equipment) return total;
  for (const slot of EQUIPMENT_SLOTS) {
    const item = getItem(equipment[slot], itemsDb);
    if (!item?.equipment) continue;
    for (const k of BONUS_KEYS) {
      total[k] += item.equipment[k] ?? 0;
    }
  }
  return total;
}

export function getWeapon(equipment, itemsDb = items) {
  return getItem(equipment?.weapon, itemsDb);
}

// 4-tick is the OSRS unarmed/punching default.
export function getAttackSpeed(equipment, itemsDb = items) {
  return getWeapon(equipment, itemsDb)?.attack_speed ?? 4;
}

export function getAttackType(equipment, itemsDb = items) {
  return getWeapon(equipment, itemsDb)?.default_attack_type ?? 'crush';
}

export function isTwoHanded(equipment, itemsDb = items) {
  return !!getWeapon(equipment, itemsDb)?.two_handed;
}
