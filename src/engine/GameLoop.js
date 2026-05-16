import { ActionQueue } from './ActionQueue.js';
import { decrementCombatCooldowns, makeAttackHandler } from './CombatEngine.js';
import { makePrayerHandlers, tickPrayerDrain } from './PrayerSystem.js';
import { makeConsumeHandlers, tickStatDrain } from './ConsumableSystem.js';
import { makeSpecHandler } from './SpecialAttackSystem.js';
import { decideBotActions } from './AIBot.js';
import { getAttackType } from './Bonuses.js';

// Wires every Phase 7–11 handler into a single ActionQueue.
export function setupActionQueue() {
  const q = new ActionQueue();
  const { activate, deactivate } = makePrayerHandlers();
  q.register('activate_prayer', activate);
  q.register('deactivate_prayer', deactivate);
  const { eat, drink } = makeConsumeHandlers();
  q.register('eat', eat);
  q.register('drink', drink);
  q.register('toggle_spec', makeSpecHandler());
  q.register('attack', makeAttackHandler());
  q.register('switch_equipment', (action, ctx) => {
    const store = action.actor === 'player' ? ctx.player : ctx.bot;
    if (action.payload?.slot && action.payload?.itemId !== undefined) {
      if (action.payload.itemId == null) store.getState().unequip(action.payload.slot);
      else store.getState().equip(action.payload.slot, action.payload.itemId);
    }
  });
  return q;
}

// Canonical per-tick order (deterministic):
//   1. Decrement attack/eat/combo cooldowns (so handlers see the new value)
//   2. Prayer drain accumulator advances; deactivates on empty
//   3. Stat-boost drain accumulator advances (1pt per 100 ticks)
//   4. AI bot enqueues actions
//   5. Optional player auto-attack (queued if `autoAttack: true`)
//   6. ActionQueue.flushTick runs P1..P5 in order
export function runOneTick(ctx) {
  const {
    player,
    bot,
    game,
    queue,
    tick,
    difficulty = 'medium',
    autoPlayer = false,
    autoBot = true,
    rng
  } = ctx;

  decrementCombatCooldowns(player, bot);
  tickPrayerDrain(player);
  tickPrayerDrain(bot);
  tickStatDrain(player);
  tickStatDrain(bot);

  if (autoBot) {
    const botActions = decideBotActions(bot.getState(), player.getState(), { difficulty });
    for (const a of botActions) {
      if (a.type === 'attack' && rng) a.payload = { ...(a.payload ?? {}), rng };
      if (a.type === 'toggle_spec' && rng) a.payload = { ...(a.payload ?? {}), rng };
      queue.enqueue(a);
    }
  }

  if (autoPlayer && player.getState().attackCooldown === 0) {
    const action = { actor: 'player', type: 'attack', payload: {} };
    if (rng) action.payload.rng = rng;
    queue.enqueue(action);
  }

  queue.flushTick({ player, bot, game, tick });
}

// Helper for tests / replay: run N ticks with the same setup.
export function runTicks(n, ctx) {
  let { tick = 0 } = ctx;
  for (let i = 0; i < n; i++) {
    tick += 1;
    runOneTick({ ...ctx, tick });
    if (ctx.player.getState().current.hp <= 0 || ctx.bot.getState().current.hp <= 0) {
      return { tick, ended: true };
    }
  }
  return { tick, ended: false };
}

// Convenience for UI: queue a player action that the GameLoop won't generate.
export function queuePlayerAction(queue, type, payload = {}) {
  queue.enqueue({ actor: 'player', type, payload });
}
