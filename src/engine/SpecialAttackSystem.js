import items from '../data/items.json';
import prayers from '../data/prayers.json';
import specials from '../data/specials.json';
import { maxAttackRoll, maxDefenceRoll, hitChance } from './AccuracyRoll.js';
import { maxHit, rollDamage } from './DamageRoll.js';
import { computeBonuses, getAttackType, getAttackSpeed } from './Bonuses.js';

// Per-attack flow for special attacks (priority 3 — resolves before P5 combat):
//   1. Check spec energy >= cost; reject if insufficient
//   2. Dispatch to per-spec resolver (standard / cascade / voidwaker / volatile)
//   3. Apply damage, on-hit effects (DWH defence drain), cooldown
//
// resolveSpecAttack is PURE. executeSpecAttack is the store-mutating wrapper.

const MELEE_TYPES = new Set(['slash', 'stab', 'crush']);

function attackCategory(t) {
  if (MELEE_TYPES.has(t)) return 'melee';
  if (t === 'ranged') return 'ranged';
  if (t === 'magic') return 'magic';
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

function rollSpecAccuracy(spec, attacker, defender, attackType, { rng, itemsDb, prayersDb }) {
  const rawMaxAtk = maxAttackRoll(attacker, attackType, { itemsDb, prayersDb });
  const specMaxAtk = Math.floor(rawMaxAtk * spec.accuracy_mult);
  const maxDef = maxDefenceRoll(defender, attackType, { itemsDb, prayersDb });
  const chance = hitChance(specMaxAtk, maxDef);
  return { hit: rng() <= chance, hitChance: chance, maxAtk: specMaxAtk, maxDef };
}

// Dragon Claws 4-hit cascade. Each subsequent roll's max is half the previous
// roll's actual value; falls back to a fraction of baseMax when a roll is 0.
function resolveCascade(baseMax, rng) {
  const H1 = rollDamage(Math.floor(baseMax / 2), rng);
  const H2 = rollDamage(H1 > 0 ? Math.floor(H1 / 2) : Math.floor(baseMax * 3 / 8), rng);
  const H3 = rollDamage(H2 > 0 ? Math.floor(H2 / 2) : Math.floor(baseMax / 4), rng);
  const H4 = rollDamage(H3 > 0 ? Math.floor(H3 / 2) : Math.floor(baseMax / 8), rng);
  return [H1, H2, H3, H4];
}

export function resolveSpecAttack(attacker, defender, specId, opts = {}) {
  const {
    itemsDb = items,
    prayersDb = prayers,
    specialsDb = specials,
    rng = Math.random
  } = opts;

  const spec = specialsDb[specId];
  if (!spec) return { ok: false, reason: 'unknown_spec' };

  const attackType = getAttackType(attacker.equipment, itemsDb);
  const attackSpeed = getAttackSpeed(attacker.equipment, itemsDb);
  // instant specs (Gmaul) set cooldown to 0, allowing a same-tick P5 attack
  const attackCooldown = spec.instant ? 0 : attackSpeed;
  const innerOpts = { itemsDb, prayersDb, rng };

  // ── Voidwaker: guaranteed hit, damage uniformly in [floor(max×0.5), floor(max×1.5)] ──
  if (spec.guaranteed_hit && spec.damage_floor_pct != null) {
    const base = maxHit(attacker, attackType, innerOpts);
    const floorDmg = Math.floor(base * spec.damage_floor_pct);
    const ceilDmg = Math.floor(base * spec.damage_ceiling_pct);
    const rawDamage = floorDmg + Math.floor(rng() * (ceilDmg - floorDmg + 1));
    const protectingPrayer = findProtectionPrayer(attackType, defender.activePrayers, prayersDb);
    const damage = protectingPrayer ? Math.floor(rawDamage * 0.6) : rawDamage;
    return {
      ok: true, hit: true, specId, attackType, attackCooldown,
      hits: [{ rawDamage, damage }],
      totalRawDamage: rawDamage, totalDamage: damage,
      protectingPrayer, onHitEffect: spec.on_hit_effect ?? null
    };
  }

  // ── Volatile Nightmare Staff: magic spec with fixed base max hit ──
  if (spec.magic_spec_max_base != null) {
    const magicType = 'magic';
    const accResult = rollSpecAccuracy(spec, attacker, defender, magicType, innerOpts);
    if (!accResult.hit) {
      return {
        ok: true, hit: false, specId, attackType: magicType, attackCooldown,
        hits: [{ rawDamage: 0, damage: 0 }], totalRawDamage: 0, totalDamage: 0,
        protectingPrayer: null, onHitEffect: null, hitChance: accResult.hitChance
      };
    }
    const bonuses = computeBonuses(attacker.equipment, itemsDb);
    const magicDmg = bonuses.magic_damage ?? 0;
    const specMax = Math.floor(spec.magic_spec_max_base * (1 + magicDmg));
    const rawDamage = rollDamage(specMax, rng);
    const protectingPrayer = findProtectionPrayer(magicType, defender.activePrayers, prayersDb);
    const damage = protectingPrayer ? Math.floor(rawDamage * 0.6) : rawDamage;
    return {
      ok: true, hit: true, specId, attackType: magicType, attackCooldown,
      hits: [{ rawDamage, damage }], totalRawDamage: rawDamage, totalDamage: damage,
      protectingPrayer, onHitEffect: null, hitChance: accResult.hitChance
    };
  }

  // ── Dragon Claws cascade: single accuracy check, 4 cascading damage rolls ──
  if (spec.cascade) {
    const accResult = rollSpecAccuracy(spec, attacker, defender, attackType, innerOpts);
    if (!accResult.hit) {
      return {
        ok: true, hit: false, specId, attackType, attackCooldown,
        hits: [0, 0, 0, 0].map(() => ({ rawDamage: 0, damage: 0 })),
        totalRawDamage: 0, totalDamage: 0,
        protectingPrayer: null, onHitEffect: null
      };
    }
    const baseMax = maxHit(attacker, attackType, innerOpts);
    const rawHits = resolveCascade(baseMax, rng);
    const protectingPrayer = findProtectionPrayer(attackType, defender.activePrayers, prayersDb);
    const hits = rawHits.map(rh => {
      const damage = protectingPrayer ? Math.floor(rh * 0.6) : rh;
      return { rawDamage: rh, damage };
    });
    const totalRawDamage = rawHits.reduce((a, b) => a + b, 0);
    const totalDamage = hits.reduce((a, h) => a + h.damage, 0);
    return {
      ok: true, hit: true, specId, attackType, attackCooldown,
      hits, totalRawDamage, totalDamage, protectingPrayer, onHitEffect: null
    };
  }

  // ── Standard specs: N independent (accuracy + damage) rolls each with multipliers ──
  const specMH = Math.floor(maxHit(attacker, attackType, innerOpts) * spec.max_hit_mult);
  const hitCount = spec.hits ?? 1;
  const protectingPrayer = findProtectionPrayer(attackType, defender.activePrayers, prayersDb);
  let anyHit = false;
  let lastHitChance = 0;
  const hits = [];

  for (let i = 0; i < hitCount; i++) {
    const accResult = rollSpecAccuracy(spec, attacker, defender, attackType, innerOpts);
    lastHitChance = accResult.hitChance;
    const rawDamage = accResult.hit ? rollDamage(specMH, rng) : 0;
    const damage = (accResult.hit && protectingPrayer) ? Math.floor(rawDamage * 0.6) : rawDamage;
    if (accResult.hit) anyHit = true;
    hits.push({ rawDamage, damage, hit: accResult.hit });
  }

  const totalRawDamage = hits.reduce((a, h) => a + h.rawDamage, 0);
  const totalDamage = hits.reduce((a, h) => a + h.damage, 0);

  return {
    ok: true, hit: anyHit, specId, attackType, attackCooldown,
    hits, totalRawDamage, totalDamage,
    protectingPrayer, onHitEffect: spec.on_hit_effect ?? null,
    hitChance: lastHitChance
  };
}

// Reads attacker spec energy from store. Rejects if insufficient. On success:
// deducts energy, applies damage, applies on-hit effects, sets attackCooldown.
export function executeSpecAttack(attackerStore, defenderStore, specId, opts = {}) {
  const { specialsDb = specials } = opts;
  const spec = specialsDb[specId];
  if (!spec) return { skipped: true, reason: 'unknown_spec' };

  const attacker = attackerStore.getState();
  if (attacker.current.specEnergy < spec.energy_cost) {
    return { skipped: true, reason: 'insufficient_spec_energy' };
  }

  const defender = defenderStore.getState();
  const result = resolveSpecAttack(attacker, defender, specId, opts);
  if (!result.ok) return { skipped: true, reason: result.reason };

  attackerStore.getState().spendSpec(spec.energy_cost);

  if (result.totalDamage > 0) defenderStore.getState().damage(result.totalDamage);

  // DWH: on hit, reduce defender's current defence by 30% (floor).
  if (result.hit && result.onHitEffect === 'reduce_defence_30pct') {
    const defState = defenderStore.getState();
    const currentDef = defState.levels.defence + (defState.boosts.defence ?? 0);
    const newDef = Math.floor(currentDef * 0.70);
    defenderStore.getState().setBoost('defence', newDef - defState.levels.defence);
  }

  attackerStore.getState().setAttackCooldown(result.attackCooldown);

  return result;
}

// ActionQueue handler factory. Register at 'toggle_spec' (priority 3).
export function makeSpecHandler(opts = {}) {
  return function specHandler(action, ctx) {
    const attackerStore = action.actor === 'player' ? ctx.player : ctx.bot;
    const defenderStore = action.actor === 'player' ? ctx.bot : ctx.player;
    const specId = action.payload?.specId;
    const rng = action.payload?.rng ?? Math.random;

    const result = executeSpecAttack(attackerStore, defenderStore, specId, { ...opts, rng });

    if (ctx.game?.getState) {
      const append = ctx.game.getState().appendLog;
      if (result.skipped) {
        append(`${action.actor} spec skipped (${result.reason})`, ctx.tick);
      } else if (!result.hit) {
        append(`${action.actor} spec ${specId} missed`, ctx.tick);
      } else {
        const prot = result.protectingPrayer ? ' [prot]' : '';
        const eff = result.onHitEffect ? ` [${result.onHitEffect}]` : '';
        append(
          `${action.actor} spec ${specId} hit ${result.totalDamage}${prot}${eff}`,
          ctx.tick
        );
      }
    }

    return result;
  };
}
