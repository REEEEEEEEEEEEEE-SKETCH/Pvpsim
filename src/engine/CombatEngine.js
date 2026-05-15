import items from '../data/items.json';
import prayers from '../data/prayers.json';
import { rollAccuracy } from './AccuracyRoll.js';
import { maxHit, rollDamage } from './DamageRoll.js';
import { getAttackSpeed, getAttackType } from './Bonuses.js';

// Per-attack flow (priority 5, after prayer/equip/spec/eat have resolved):
//   1. derive attackType + attackSpeed + maxHit from attacker's current weapon
//   2. roll accuracy
//   3. miss => damage 0 (blue splat)
//   4. hit  => roll damage in [0, maxHit]
//   5. defender's matching protection prayer => floor(damage * 0.6)  [PvP]
//   6. attacker Smite + damage>0 => defender loses floor(damage/4) prayer pts
//   7. apply damage to defender HP (clamped at 0)
//   8. attacker cooldown = weaponAttackSpeed
//
// resolveAttack is PURE — returns a result object. executeAttack is the
// store-mutating wrapper. The ActionQueue handler calls executeAttack.

const MELEE_TYPES = new Set(['slash', 'stab', 'crush']);

function attackCategory(attackType) {
  if (MELEE_TYPES.has(attackType)) return 'melee';
  if (attackType === 'ranged') return 'ranged';
  if (attackType === 'magic') return 'magic';
  return null;
}

function findProtectionPrayer(attackType, activePrayers, prayersDb) {
  const cat = attackCategory(attackType);
  if (!cat) return null;
  for (const id of activePrayers ?? []) {
    if (prayersDb[id]?.bonuses?.pvp_protect === cat) return id;
  }
  return null;
}

function hasSmite(activePrayers, prayersDb) {
  return (activePrayers ?? []).some(id => prayersDb[id]?.bonuses?.smite === true);
}

export function resolveAttack(attacker, defender, opts = {}) {
  const {
    itemsDb = items,
    prayersDb = prayers,
    attackType: typeOverride = null,
    spell = null,
    voidMelee = false,
    voidRanged = false,
    slayer = false,
    rng = Math.random,
    guaranteedHit = false
  } = opts;

  const attackType = typeOverride || getAttackType(attacker.equipment, itemsDb);
  const attackCooldown = getAttackSpeed(attacker.equipment, itemsDb);

  const acc = rollAccuracy(attacker, defender, attackType, {
    rng,
    itemsDb,
    prayersDb
  });
  const hit = guaranteedHit || acc.hit;

  const mh = maxHit(attacker, attackType, {
    itemsDb,
    prayersDb,
    spell,
    voidMelee,
    voidRanged,
    slayer
  });

  const rawDamage = hit ? rollDamage(mh, rng) : 0;

  // PvP protection — 0.6x, NOT 1.0 block. Floor after multiply.
  const protectingPrayer = findProtectionPrayer(
    attackType,
    defender.activePrayers,
    prayersDb
  );
  const damage = protectingPrayer ? Math.floor(rawDamage * 0.6) : rawDamage;

  const smitePrayerLoss =
    hasSmite(attacker.activePrayers, prayersDb) && damage > 0
      ? Math.floor(damage / 4)
      : 0;

  return {
    hit,
    damage,
    rawDamage,
    protectingPrayer,
    smitePrayerLoss,
    attackType,
    attackCooldown,
    hitChance: acc.hitChance,
    maxHit: mh,
    maxAtkRoll: acc.maxAtk,
    maxDefRoll: acc.maxDef
  };
}

// Reads attacker cooldown from the store and refuses to attack while >0.
// On success, applies damage / smite drain / sets new cooldown.
export function executeAttack(attackerStore, defenderStore, opts = {}) {
  const attacker = attackerStore.getState();
  if (attacker.attackCooldown > 0) {
    return {
      skipped: true,
      reason: 'cooldown',
      attackCooldown: attacker.attackCooldown
    };
  }
  const defender = defenderStore.getState();
  const result = resolveAttack(attacker, defender, opts);

  if (result.damage > 0) defenderStore.getState().damage(result.damage);
  if (result.smitePrayerLoss > 0) {
    defenderStore.getState().drainPrayer(result.smitePrayerLoss);
  }
  attackerStore.getState().setAttackCooldown(result.attackCooldown);

  return result;
}

// Called once per tick (Phase 14 wiring), before ActionQueue.flushTick, so
// a weapon whose cooldown hits 0 this tick can fire its next attack at P5.
export function decrementCombatCooldowns(...stores) {
  for (const s of stores) {
    s.getState().decrementAttackCooldown();
    s.getState().decrementEatCooldown();
  }
}

// ActionQueue handler for 'attack' actions. ctx must contain { player, bot }
// (Zustand stores). Optional ctx.game for combat logging, ctx.tick for prefix.
export function makeAttackHandler() {
  return function attackHandler(action, ctx) {
    const attackerStore = action.actor === 'player' ? ctx.player : ctx.bot;
    const defenderStore = action.actor === 'player' ? ctx.bot : ctx.player;
    const result = executeAttack(
      attackerStore,
      defenderStore,
      action.payload ?? {}
    );

    if (ctx.game?.getState && result && !result.skipped) {
      const append = ctx.game.getState().appendLog;
      if (!result.hit) {
        append(`${action.actor} missed (${result.attackType})`, ctx.tick);
      } else {
        const prot = result.protectingPrayer ? ' [prot]' : '';
        const smite = result.smitePrayerLoss > 0
          ? ` smite -${result.smitePrayerLoss}`
          : '';
        append(
          `${action.actor} hit ${result.damage} (${result.attackType})${prot}${smite}`,
          ctx.tick
        );
      }
    }
    return result;
  };
}
