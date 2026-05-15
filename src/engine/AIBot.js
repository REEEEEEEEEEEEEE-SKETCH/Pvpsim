import items from '../data/items.json';
import prayers from '../data/prayers.json';
import specials from '../data/specials.json';
import { getAttackType } from './Bonuses.js';
import { maxHit } from './DamageRoll.js';

// Per-tick AI: inspects bot/player state, returns a list of actions to enqueue.
// Decision categories (in declaration order, but priority is set by ActionQueue):
//   P1 prayer switching, P3 spec for KO, P4 eat / combo-eat, P5 attack.
//
// Difficulty knobs:
//   easy   — no prayer switching, no spec, no combo-eat; only attacks + basic eat
//   medium — prayer switching + spec for KO + single-food eat
//   hard   — medium + combo-eat at critical HP + offensive prayer

const MELEE_TYPES = new Set(['slash', 'stab', 'crush']);

function attackTypeToProtPrayer(attackType) {
  if (MELEE_TYPES.has(attackType)) return 'protect_from_melee';
  if (attackType === 'ranged') return 'protect_from_missiles';
  if (attackType === 'magic') return 'protect_from_magic';
  return null;
}

function pickOffensivePrayer(bot, itemsDb) {
  if (bot.current.prayer <= 0) return null;
  const attackType = getAttackType(bot.equipment, itemsDb);
  const lvl = bot.levels.prayer;
  if (MELEE_TYPES.has(attackType)) {
    if (lvl >= 70) return 'piety';
    if (lvl >= 60) return 'chivalry';
    if (lvl >= 50) return 'ultimate_strength';
    return null;
  }
  if (attackType === 'ranged') {
    if (lvl >= 74) return 'rigour';
    if (lvl >= 70) return 'eagle_eye';
    return null;
  }
  if (attackType === 'magic') {
    if (lvl >= 77) return 'augury';
    if (lvl >= 50) return 'mystic_might';
    return null;
  }
  return null;
}

function findInInventory(inv, ...itemIds) {
  for (const id of itemIds) {
    if (inv?.includes(id)) return id;
  }
  return null;
}

function estimateSpecMaxHit(bot, spec, itemsDb, prayersDb) {
  const attackType = getAttackType(bot.equipment, itemsDb);
  const base = maxHit(bot, attackType, { itemsDb, prayersDb });
  // Voidwaker: guaranteed top-end of [50%, 150%] range
  if (spec.guaranteed_hit && spec.damage_ceiling_pct != null) {
    return Math.floor(base * spec.damage_ceiling_pct);
  }
  // Multi-hit (claws cascade, ddagger): sum across N hits is the rough KO threat
  const per = Math.floor(base * (spec.max_hit_mult ?? 1));
  return per * (spec.hits ?? 1);
}

export function decideBotActions(bot, player, opts = {}) {
  const {
    difficulty = 'medium',
    itemsDb = items,
    prayersDb = prayers,
    specialsDb = specials
  } = opts;

  const actions = [];
  const playerAttackType = getAttackType(player.equipment, itemsDb);
  const oppMaxHit = maxHit(player, playerAttackType, { itemsDb, prayersDb });

  // ── P1 prayer switching ──────────────────────────────────────────────
  if (difficulty !== 'easy' && bot.current.prayer > 0) {
    const wantedProt = attackTypeToProtPrayer(playerAttackType);
    if (wantedProt && !bot.activePrayers.includes(wantedProt)) {
      actions.push({
        actor: 'bot',
        type: 'activate_prayer',
        payload: { prayerId: wantedProt }
      });
    }
    if (difficulty === 'hard') {
      const offensive = pickOffensivePrayer(bot, itemsDb);
      if (offensive && !bot.activePrayers.includes(offensive)) {
        actions.push({
          actor: 'bot',
          type: 'activate_prayer',
          payload: { prayerId: offensive }
        });
      }
    }
  }

  // ── P3 spec for KO (medium+) ─────────────────────────────────────────
  if (difficulty !== 'easy') {
    const weapon = bot.equipment.weapon;
    const spec = weapon ? specialsDb[weapon] : null;
    if (spec && bot.current.specEnergy >= spec.energy_cost) {
      const playerHp = player.current.hp;
      const specMax = estimateSpecMaxHit(bot, spec, itemsDb, prayersDb);
      if (playerHp > 0 && playerHp <= specMax) {
        actions.push({
          actor: 'bot',
          type: 'toggle_spec',
          payload: { specId: weapon }
        });
      }
    }
  }

  // ── P4 eat / combo-eat ───────────────────────────────────────────────
  const hp = bot.current.hp;
  const eatThreshold = oppMaxHit + 5;
  if (hp <= eatThreshold && bot.eatCooldown === 0) {
    const primary = findInInventory(
      bot.inventory,
      'shark', 'manta_ray', 'dark_crab', 'anglerfish'
    );
    if (primary) {
      actions.push({
        actor: 'bot',
        type: 'eat',
        payload: { itemId: primary }
      });
      // Combo eat (hard only) when HP would be lethal to next hit
      if (difficulty === 'hard' && hp <= oppMaxHit && bot.comboCooldown === 0) {
        const karambwan = findInInventory(bot.inventory, 'karambwan');
        if (karambwan) {
          actions.push({
            actor: 'bot',
            type: 'eat',
            payload: { itemId: karambwan }
          });
        }
      }
    }
  }

  // ── P5 attack ────────────────────────────────────────────────────────
  if (bot.attackCooldown === 0) {
    actions.push({ actor: 'bot', type: 'attack', payload: {} });
  }

  return actions;
}

// Enqueue bot actions into the provided ActionQueue. Caller invokes once per tick.
export function runBotTick(actionQueue, bot, player, opts = {}) {
  const actions = decideBotActions(bot, player, opts);
  for (const a of actions) actionQueue.enqueue(a);
  return actions;
}
