import items from '../data/items.json';
import prayers from '../data/prayers.json';
import { computeBonuses } from './Bonuses.js';

// Each prayer covers one or more "stat slots". Two prayers conflict if their
// covers intersect — activating one then deactivates the other(s). This
// captures all OSRS mutex rules in one rule:
//   * Piety (atk+str+def) and Chivalry (atk+str+def) -> mutex on all three
//   * Piety (def) and Steel Skin (def) -> mutex on defence
//   * Two protection prayers / Smite (overhead) -> mutex on overhead
//   * Eagle Eye (ranged) and Steel Skin (def) -> NO overlap, both allowed
export const PRAYER_COVERS = Object.freeze({
  thick_skin:           ['defence'],
  burst_of_strength:    ['strength'],
  clarity_of_thought:   ['attack'],
  rock_skin:            ['defence'],
  superhuman_strength:  ['strength'],
  improved_reflexes:    ['attack'],
  steel_skin:           ['defence'],
  ultimate_strength:    ['strength'],
  incredible_reflexes:  ['attack'],
  protect_from_magic:   ['overhead'],
  protect_from_missiles:['overhead'],
  protect_from_melee:   ['overhead'],
  eagle_eye:            ['ranged'],
  mystic_might:         ['magic'],
  chivalry:             ['attack', 'strength', 'defence'],
  piety:                ['attack', 'strength', 'defence'],
  rigour:               ['ranged', 'defence'],
  augury:               ['magic', 'defence'],
  smite:                ['overhead']
});

export function getConflicts(prayerId, activePrayers, covers = PRAYER_COVERS) {
  const target = covers[prayerId];
  if (!target) return [];
  const targetSet = new Set(target);
  return activePrayers.filter(id => {
    if (id === prayerId) return false;
    const cov = covers[id] ?? [];
    return cov.some(c => targetSet.has(c));
  });
}

export function activatePrayer(actorStore, prayerId, opts = {}) {
  const { prayersDb = prayers, covers = PRAYER_COVERS } = opts;
  const state = actorStore.getState();
  const prayer = prayersDb[prayerId];
  if (!prayer) return { ok: false, reason: 'unknown_prayer' };
  if (state.levels.prayer < prayer.level) {
    return { ok: false, reason: 'level_too_low' };
  }
  if (state.current.prayer <= 0) {
    return { ok: false, reason: 'no_prayer_points' };
  }
  if (state.activePrayers.includes(prayerId)) {
    return { ok: true, alreadyActive: true, deactivated: [] };
  }
  const conflicts = getConflicts(prayerId, state.activePrayers, covers);
  const nextActive = state.activePrayers.filter(id => !conflicts.includes(id));
  nextActive.push(prayerId);
  actorStore.getState().setActivePrayers(nextActive);
  return { ok: true, deactivated: conflicts };
}

export function deactivatePrayer(actorStore, prayerId) {
  actorStore.getState().deactivatePrayer(prayerId);
  return { ok: true };
}

export function togglePrayer(actorStore, prayerId, opts = {}) {
  const state = actorStore.getState();
  if (state.activePrayers.includes(prayerId)) {
    return { ...deactivatePrayer(actorStore, prayerId), toggled: 'off' };
  }
  return { ...activatePrayer(actorStore, prayerId, opts), toggled: 'on' };
}

// Per-tick drain. Caller (Phase 14 wiring) invokes once per tick per actor.
// Uses scaled-integer math (numerator = drain_rate * 30 added per tick,
// denominator = 100 * (30 + prayer_bonus)) for exactness; no FP drift over
// thousands of ticks. Out-of-points => all prayers deactivate.
export function tickPrayerDrain(actorStore, opts = {}) {
  const { prayersDb = prayers, itemsDb = items } = opts;
  const state = actorStore.getState();
  if (state.activePrayers.length === 0) return { drained: 0 };
  if (state.current.prayer <= 0) {
    actorStore.getState().setActivePrayers([]);
    return { drained: 0, deactivatedAll: true };
  }
  let totalDrainRate = 0;
  for (const id of state.activePrayers) {
    totalDrainRate += prayersDb[id]?.drain_per_min ?? 0;
  }
  if (totalDrainRate === 0) return { drained: 0 };

  const bonus = computeBonuses(state.equipment, itemsDb).prayer ?? 0;
  const numerator = totalDrainRate * 30;
  const denominator = 100 * (30 + bonus);

  const before = state.current.prayer;
  actorStore.getState().accumulatePrayerDrain(numerator, denominator);
  const after = actorStore.getState().current.prayer;
  return { drained: before - after };
}

// ActionQueue handler factory. Register at priority 1 (activate_prayer +
// deactivate_prayer share P1 per the canonical priority map).
export function makePrayerHandlers(opts = {}) {
  return {
    activate(action, ctx) {
      const store = action.actor === 'player' ? ctx.player : ctx.bot;
      const result = activatePrayer(store, action.payload?.prayerId, opts);
      if (ctx.game?.getState) {
        const append = ctx.game.getState().appendLog;
        if (!result.ok) {
          append(
            `${action.actor} cannot activate ${action.payload?.prayerId} (${result.reason})`,
            ctx.tick
          );
        } else if (!result.alreadyActive) {
          const off =
            result.deactivated.length > 0
              ? ` (off: ${result.deactivated.join(', ')})`
              : '';
          append(`${action.actor} activated ${action.payload.prayerId}${off}`, ctx.tick);
        }
      }
      return result;
    },
    deactivate(action, ctx) {
      const store = action.actor === 'player' ? ctx.player : ctx.bot;
      return deactivatePrayer(store, action.payload?.prayerId);
    }
  };
}
