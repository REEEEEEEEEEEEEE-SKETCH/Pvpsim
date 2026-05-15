import items from '../data/items.json';
import prayers from '../data/prayers.json';
import { computeBonuses } from './Bonuses.js';

// Canonical OSRS max-hit formula:
//   eff_str = floor((vis_str + boost) * prayer_mult) + style + 8
//   gear-set multipliers apply to eff_str, each floored after multiply
//   max_hit = floor(0.5 + eff_str * (equip_str + 64) / 640)
//   target multipliers (slayer helm, etc.) apply post, each floored
//
// Magic deviates: max_hit = floor(spell_base * (1 + magic_damage_bonus)).

const MELEE_TYPES = new Set(['slash', 'stab', 'crush']);

export const SPELL_MAX_HITS = Object.freeze({
  fire_surge: 24,
  ice_barrage: 30,
  ice_blitz: 26
});

function maxPrayerMult(activePrayers, key, prayersDb) {
  let m = 1.0;
  for (const id of activePrayers ?? []) {
    const v = prayersDb[id]?.bonuses?.[key];
    if (typeof v === 'number' && v > m) m = v;
  }
  return m;
}

function getStrengthStyleBonus(style, attackType) {
  if (attackType === 'ranged') return style === 'accurate' ? 3 : 0;
  if (attackType === 'magic') return 0;
  // melee
  if (style === 'aggressive') return 3;
  if (style === 'controlled') return 1;
  return 0;
}

function visibleStrengthLevel(actor, attackType) {
  const boosts = actor.boosts ?? {};
  if (attackType === 'ranged') return actor.levels.ranged + (boosts.ranged ?? 0);
  if (attackType === 'magic') return actor.levels.magic + (boosts.magic ?? 0);
  return actor.levels.strength + (boosts.strength ?? 0);
}

function strengthPrayerMult(activePrayers, attackType, prayersDb) {
  if (attackType === 'ranged') {
    return maxPrayerMult(activePrayers, 'ranged_strength_mult', prayersDb);
  }
  if (attackType === 'magic') return 1.0;
  return maxPrayerMult(activePrayers, 'strength_mult', prayersDb);
}

export function maxHit(attacker, attackType, opts = {}) {
  const {
    itemsDb = items,
    prayersDb = prayers,
    spell = null,
    voidMelee = false,
    voidRanged = false,
    slayer = false,
    // dharok = false,  // TODO: Phase 6 stub — formula activates only with
    //                  // full set + missing HP; needs Dharok loadout (not in seed).
  } = opts;

  const bonuses = computeBonuses(attacker.equipment, itemsDb);

  if (attackType === 'magic') {
    const base = spell != null ? SPELL_MAX_HITS[spell] ?? 0 : 0;
    const magicDmg = bonuses.magic_damage ?? 0;
    let mh = Math.floor(base * (1 + magicDmg));
    if (slayer) mh = Math.floor(mh * (7 / 6));
    return mh;
  }

  const visStr = visibleStrengthLevel(attacker, attackType);
  const prayerMult = strengthPrayerMult(attacker.activePrayers, attackType, prayersDb);
  const styleBonus = getStrengthStyleBonus(attacker.attackStyle, attackType);

  let effStr = Math.floor(visStr * prayerMult) + styleBonus + 8;

  if (attackType === 'ranged' && voidRanged) effStr = Math.floor(effStr * 1.10);
  if (MELEE_TYPES.has(attackType) && voidMelee) effStr = Math.floor(effStr * 1.10);

  const strBonusKey = attackType === 'ranged' ? 'ranged_strength' : 'melee_strength';
  const equipStr = bonuses[strBonusKey] ?? 0;

  let mh = Math.floor(0.5 + (effStr * (equipStr + 64)) / 640);

  if (slayer) mh = Math.floor(mh * (7 / 6));

  return mh;
}

// Inclusive uniform integer in [0, maxHit]. floor(rng * (max + 1)) gives
// max+1 buckets — never floors to maxHit+1 because rng < 1 always.
export function rollDamage(maxHitValue, rng = Math.random) {
  if (maxHitValue <= 0) return 0;
  return Math.floor(rng() * (maxHitValue + 1));
}
