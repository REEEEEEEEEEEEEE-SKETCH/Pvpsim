import items from '../data/items.json';
import prayers from '../data/prayers.json';
import { computeBonuses } from './Bonuses.js';

// Effective level formula (attack & defence side):
//   floor((Visible_Level + Potion_Boost) * Prayer_Mult) + Style_Bonus + 8
// Max roll:
//   Effective_Level * (Equipment_Bonus + 64)
// Hit chance (canonical OSRS PvP):
//   if max_atk > max_def: 1 - (max_def + 2) / (2 * (max_atk + 1))
//   else:                 max_atk / (2 * (max_def + 1))     <-- tie falls here

function maxPrayerMult(activePrayers, key, prayersDb) {
  let m = 1.0;
  for (const id of activePrayers ?? []) {
    const p = prayersDb[id];
    const v = p?.bonuses?.[key];
    if (typeof v === 'number' && v > m) m = v;
  }
  return m;
}

function getAttackStyleBonus(style, attackType) {
  if (attackType === 'ranged') return style === 'accurate' ? 3 : 0;
  if (attackType === 'magic')  return style === 'accurate' ? 3 : 0;
  // melee
  if (style === 'accurate')   return 3;
  if (style === 'controlled') return 1;
  return 0;
}

function getDefenceStyleBonus(style) {
  if (style === 'defensive')  return 3;
  if (style === 'controlled') return 1;
  if (style === 'longrange')  return 3;
  return 0;
}

function visibleAttackLevel(actor, attackType) {
  const boosts = actor.boosts ?? {};
  if (attackType === 'ranged') return actor.levels.ranged + (boosts.ranged ?? 0);
  if (attackType === 'magic')  return actor.levels.magic  + (boosts.magic  ?? 0);
  return actor.levels.attack + (boosts.attack ?? 0);
}

function attackPrayerMult(activePrayers, attackType, prayersDb) {
  if (attackType === 'ranged') return maxPrayerMult(activePrayers, 'ranged_attack_mult', prayersDb);
  if (attackType === 'magic')  return maxPrayerMult(activePrayers, 'magic_attack_mult', prayersDb);
  return maxPrayerMult(activePrayers, 'attack_mult', prayersDb);
}

function defencePrayerMult(activePrayers, attackType, prayersDb) {
  // For magic attacks, magic-specific defence prayers (Augury, Mystic Might)
  // can boost defence_mult higher than the generic line.
  if (attackType === 'magic') {
    return Math.max(
      maxPrayerMult(activePrayers, 'defence_mult', prayersDb),
      maxPrayerMult(activePrayers, 'magic_defence_mult', prayersDb)
    );
  }
  return maxPrayerMult(activePrayers, 'defence_mult', prayersDb);
}

export function maxAttackRoll(attacker, attackType, opts = {}) {
  const { itemsDb = items, prayersDb = prayers } = opts;
  const visible = visibleAttackLevel(attacker, attackType);
  const prayerMult = attackPrayerMult(attacker.activePrayers, attackType, prayersDb);
  const styleBonus = getAttackStyleBonus(attacker.attackStyle, attackType);
  const effective = Math.floor(visible * prayerMult) + styleBonus + 8;
  const bonuses = computeBonuses(attacker.equipment, itemsDb);
  const equipBonus = bonuses[`attack_${attackType}`] ?? 0;
  return effective * (equipBonus + 64);
}

export function maxDefenceRoll(defender, attackType, opts = {}) {
  const { itemsDb = items, prayersDb = prayers } = opts;
  const visible = defender.levels.defence + (defender.boosts?.defence ?? 0);
  const prayerMult = defencePrayerMult(defender.activePrayers, attackType, prayersDb);
  const styleBonus = getDefenceStyleBonus(defender.attackStyle);
  const effective = Math.floor(visible * prayerMult) + styleBonus + 8;
  const bonuses = computeBonuses(defender.equipment, itemsDb);
  const equipBonus = bonuses[`defence_${attackType}`] ?? 0;
  return effective * (equipBonus + 64);
}

export function hitChance(maxAtk, maxDef) {
  if (maxAtk > maxDef) {
    return 1 - (maxDef + 2) / (2 * (maxAtk + 1));
  }
  return maxAtk / (2 * (maxDef + 1));
}

export function rollAccuracy(attacker, defender, attackType, opts = {}) {
  const { rng = Math.random } = opts;
  const maxAtk = maxAttackRoll(attacker, attackType, opts);
  const maxDef = maxDefenceRoll(defender, attackType, opts);
  const chance = hitChance(maxAtk, maxDef);
  const roll = rng();
  return { hit: roll <= chance, hitChance: chance, maxAtk, maxDef, roll };
}
