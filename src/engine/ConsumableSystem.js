import items from '../data/items.json';
import potions from '../data/potions.json';

export function eatFood(actorStore, itemId, opts = {}) {
  const { itemsDb = items } = opts;
  const state = actorStore.getState();
  const item = itemsDb[itemId];
  if (!item || item.consumable?.type !== 'food') {
    return { ok: false, reason: 'not_food' };
  }
  const { heal, eat_delay, combo = false, overheal = false } = item.consumable;

  if (combo) {
    if (state.comboCooldown > 0) return { ok: false, reason: 'combo_cooldown' };
  } else {
    if (state.eatCooldown > 0) return { ok: false, reason: 'eat_cooldown' };
  }

  actorStore.getState().heal(heal, overheal);

  if (combo) {
    actorStore.getState().setComboCooldown(eat_delay);
    const cur = actorStore.getState().eatCooldown;
    actorStore.getState().setEatCooldown(Math.max(cur, eat_delay));
  } else {
    actorStore.getState().setEatCooldown(eat_delay);
  }

  return { ok: true, healed: heal };
}

export function drinkPotion(actorStore, potionId, opts = {}) {
  const { potionsDb = potions } = opts;
  const state = actorStore.getState();
  const potion = potionsDb[potionId];
  if (!potion) return { ok: false, reason: 'unknown_potion' };

  const effects = [];

  // Absolute boosts: each dose sets the boost to the formula value (no stacking above).
  if (potion.boosts) {
    for (const b of potion.boosts) {
      const boost = b.flat + Math.floor(b.level_pct * state.levels[b.stat]);
      actorStore.getState().setBoost(b.stat, boost);
      effects.push({ stat: b.stat, boost });
    }
  }

  // Drains (Saradomin Brew lowers attack/strength/magic/ranged by % of base).
  if (potion.drains) {
    for (const d of potion.drains) {
      const drain = Math.floor(d.level_pct * state.levels[d.stat]);
      actorStore.getState().addBoost(d.stat, -drain);
      effects.push({ stat: d.stat, drain });
    }
  }

  // HP heal (Saradomin Brew).
  if (potion.heal_pct_of_max != null) {
    const heal = Math.floor(state.levels.hitpoints * potion.heal_pct_of_max) + (potion.heal_flat ?? 0);
    actorStore.getState().heal(heal, false);
    effects.push({ stat: 'hp', heal });
  }

  // Restores (Super Restore): brings negative boosts back toward base; prayer restores points.
  if (potion.restore) {
    for (const r of potion.restore) {
      const restoreAmt = r.flat + Math.floor(r.max_pct * state.levels[r.stat === 'prayer' ? 'prayer' : r.stat]);
      if (r.stat === 'prayer') {
        const curPrayer = actorStore.getState().current.prayer;
        const maxPrayer = state.levels.prayer;
        const actual = Math.min(restoreAmt, maxPrayer - curPrayer);
        if (actual > 0) actorStore.getState().setPrayer(curPrayer + actual);
        effects.push({ stat: 'prayer', restored: actual });
      } else {
        const curBoost = actorStore.getState().boosts[r.stat] ?? 0;
        if (curBoost < 0) {
          const actual = Math.min(restoreAmt, -curBoost);
          actorStore.getState().addBoost(r.stat, actual);
          effects.push({ stat: r.stat, restored: actual });
        } else {
          effects.push({ stat: r.stat, restored: 0 });
        }
      }
    }
  }

  return { ok: true, effects };
}

// Call every tick per actor. Increments an accumulator; when it reaches 100
// all non-zero boosts drain 1 point toward 0 (base level).
export function tickStatDrain(actorStore) {
  const state = actorStore.getState();
  const acc = (state.statDrainAcc ?? 0) + 1;
  if (acc < 100) {
    actorStore.getState().setStatDrainAcc(acc);
    return { drained: false };
  }
  actorStore.getState().setStatDrainAcc(0);
  actorStore.getState().drainStatBoosts();
  return { drained: true };
}

// ActionQueue handler factory. Register 'eat' at priority 4, 'drink' at priority 4.
export function makeConsumeHandlers(opts = {}) {
  return {
    eat(action, ctx) {
      const store = action.actor === 'player' ? ctx.player : ctx.bot;
      const result = eatFood(store, action.payload?.itemId, opts);
      if (ctx.game?.getState && !result.ok) {
        ctx.game.getState().appendLog(
          `${action.actor} cannot eat ${action.payload?.itemId} (${result.reason})`,
          ctx.tick
        );
      }
      return result;
    },
    drink(action, ctx) {
      const store = action.actor === 'player' ? ctx.player : ctx.bot;
      const result = drinkPotion(store, action.payload?.potionId, opts);
      if (ctx.game?.getState && !result.ok) {
        ctx.game.getState().appendLog(
          `${action.actor} cannot drink ${action.payload?.potionId} (${result.reason})`,
          ctx.tick
        );
      }
      return result;
    }
  };
}
