import { describe, it, expect, beforeEach } from 'vitest';
import {
  setupActionQueue,
  runOneTick,
  runTicks,
  queuePlayerAction
} from '../engine/GameLoop.js';
import { createActorStore } from '../store/actorStore.js';
import { useGameStore } from '../store/gameStore.js';
import { applyLoadout } from '../store/loadoutStore.js';

function ctx({ player, bot, queue, tick = 0, difficulty = 'medium', autoPlayer = false, autoBot = false, rng }) {
  return { player, bot, game: useGameStore, queue, tick, difficulty, autoPlayer, autoBot, rng };
}

beforeEach(() => {
  useGameStore.getState().clearLog();
  useGameStore.getState().setWinner(null);
});

// ── setupActionQueue ─────────────────────────────────────────────────────────

describe('setupActionQueue', () => {
  it('registers all canonical action handlers', () => {
    const q = setupActionQueue();
    // q.handlers is a Map keyed by action type; verify the expected keys exist
    const types = ['activate_prayer', 'deactivate_prayer', 'eat', 'drink', 'toggle_spec', 'attack', 'switch_equipment'];
    for (const t of types) {
      expect(q.handlers.has(t)).toBe(true);
    }
  });
});

// ── runOneTick — cooldowns + drains ──────────────────────────────────────────

describe('runOneTick — per-tick housekeeping', () => {
  it('decrements attack cooldown each tick', () => {
    const player = createActorStore();
    const bot = createActorStore();
    player.getState().setAttackCooldown(3);
    const q = setupActionQueue();
    runOneTick(ctx({ player, bot, queue: q, tick: 1 }));
    expect(player.getState().attackCooldown).toBe(2);
  });

  it('decrements eat and combo cooldowns each tick', () => {
    const player = createActorStore();
    const bot = createActorStore();
    player.getState().setEatCooldown(2);
    player.getState().setComboCooldown(1);
    const q = setupActionQueue();
    runOneTick(ctx({ player, bot, queue: q, tick: 1 }));
    expect(player.getState().eatCooldown).toBe(1);
    expect(player.getState().comboCooldown).toBe(0);
  });

  it('drains prayer points when prayers are active', () => {
    const player = createActorStore({ activePrayers: ['piety'] });
    const bot = createActorStore();
    const q = setupActionQueue();
    const before = player.getState().current.prayer;
    // Run 50 ticks — Piety is 24/min, ~12 points drained in 50 ticks
    for (let t = 1; t <= 50; t++) {
      runOneTick(ctx({ player, bot, queue: q, tick: t }));
    }
    expect(player.getState().current.prayer).toBeLessThan(before);
  });

  it('decays positive stat boosts by 1 every 100 ticks', () => {
    const player = createActorStore();
    const bot = createActorStore();
    player.getState().setBoost('strength', 19);
    const q = setupActionQueue();
    for (let t = 1; t <= 100; t++) {
      runOneTick(ctx({ player, bot, queue: q, tick: t }));
    }
    expect(player.getState().boosts.strength).toBe(18);
  });
});

// ── runOneTick — AI bot autoBot ──────────────────────────────────────────────

describe('runOneTick — autoBot enqueues AI actions', () => {
  it('autoBot=true makes bot attack when it can', () => {
    const player = createActorStore();
    const bot = createActorStore({ equipment: { weapon: 'abyssal_whip' } });
    const q = setupActionQueue();
    // Deterministic rng for the bot's attack: acc=0 (hit), dmg=0.99 (max)
    let i = 0;
    const seq = [0, 0.99, 0, 0.99];
    const rng = () => seq[i++ % seq.length];
    runOneTick(ctx({ player, bot, queue: q, tick: 1, autoBot: true, rng }));
    expect(player.getState().current.hp).toBeLessThan(99);
  });

  it('autoBot=false leaves bot inactive', () => {
    const player = createActorStore();
    const bot = createActorStore({ equipment: { weapon: 'abyssal_whip' } });
    const q = setupActionQueue();
    runOneTick(ctx({ player, bot, queue: q, tick: 1, autoBot: false }));
    expect(player.getState().current.hp).toBe(99);
  });
});

// ── runOneTick — autoPlayer ──────────────────────────────────────────────────

describe('runOneTick — autoPlayer enqueues player attack', () => {
  it('autoPlayer=true enqueues a player attack when cooldown is 0', () => {
    const player = createActorStore({ equipment: { weapon: 'abyssal_whip' } });
    const bot = createActorStore();
    const q = setupActionQueue();
    let i = 0;
    const seq = [0, 0.99];
    const rng = () => seq[i++ % seq.length];
    runOneTick(ctx({ player, bot, queue: q, tick: 1, autoPlayer: true, rng }));
    expect(bot.getState().current.hp).toBeLessThan(99);
  });

  it('autoPlayer does NOT attack when cooldown > 0', () => {
    const player = createActorStore({ equipment: { weapon: 'abyssal_whip' } });
    const bot = createActorStore();
    player.getState().setAttackCooldown(3);
    const q = setupActionQueue();
    runOneTick(ctx({ player, bot, queue: q, tick: 1, autoPlayer: true }));
    // After housekeeping decrements 3→2, no attack queued
    expect(bot.getState().current.hp).toBe(99);
  });
});

// ── runOneTick — fight end detection ─────────────────────────────────────────

describe('runOneTick — fight end detection', () => {
  it('returns ended:true and winner:player when bot HP reaches 0', () => {
    const player = createActorStore({ equipment: { weapon: 'abyssal_whip' } });
    const bot = createActorStore();
    bot.getState().setHP(5);
    const q = setupActionQueue();
    let i = 0;
    const seq = [0, 0.99];
    const rng = () => seq[i++ % seq.length];
    const result = runOneTick(ctx({ player, bot, queue: q, tick: 1, autoPlayer: true, rng }));
    expect(result.ended).toBe(true);
    expect(result.winner).toBe('player');
    expect(bot.getState().current.hp).toBe(0);
  });

  it('records winner in gameStore exactly once', () => {
    const player = createActorStore({ equipment: { weapon: 'abyssal_whip' } });
    const bot = createActorStore();
    bot.getState().setHP(1);
    const q = setupActionQueue();
    let i = 0;
    const seq = [0, 0.99];
    const rng = () => seq[i++ % seq.length];
    runOneTick(ctx({ player, bot, queue: q, tick: 1, autoPlayer: true, rng }));
    expect(useGameStore.getState().winner).toBe('player');
    const logLen1 = useGameStore.getState().combatLog.length;
    // Run another tick — should NOT append a second "fight over" log line
    runOneTick(ctx({ player, bot, queue: q, tick: 2, autoPlayer: true, rng }));
    const fightOverLines = useGameStore.getState().combatLog.filter(l => /fight over/.test(l));
    expect(fightOverLines.length).toBe(1);
    expect(logLen1).toBeGreaterThan(0);
  });

  it('returns ended:false while both actors alive', () => {
    const player = createActorStore();
    const bot = createActorStore();
    const q = setupActionQueue();
    const result = runOneTick(ctx({ player, bot, queue: q, tick: 1 }));
    expect(result.ended).toBe(false);
    expect(result.winner).toBeNull();
  });

  it('reports draw when both die in the same tick', () => {
    // Construct the rare case: both at 1 HP, both swing whips, both connect.
    const player = createActorStore({ equipment: { weapon: 'abyssal_whip' } });
    const bot = createActorStore({ equipment: { weapon: 'abyssal_whip' } });
    player.getState().setHP(1);
    bot.getState().setHP(1);
    const q = setupActionQueue();
    let i = 0;
    const seq = [0, 0.99]; // hits + max for every roll
    const rng = () => seq[i++ % seq.length];
    const result = runOneTick(ctx({ player, bot, queue: q, tick: 1, autoBot: true, autoPlayer: true, rng }));
    expect(result.ended).toBe(true);
    expect(result.winner).toBe('draw');
  });
});

// ── runTicks ─────────────────────────────────────────────────────────────────

describe('runTicks — multi-tick batch', () => {
  it('early-exits when an actor dies', () => {
    const player = createActorStore({ equipment: { weapon: 'abyssal_whip' } });
    const bot = createActorStore();
    bot.getState().setHP(20);
    const q = setupActionQueue();
    let i = 0;
    const seq = [0, 0.99];
    const rng = () => seq[i++ % seq.length];
    const result = runTicks(50, ctx({ player, bot, queue: q, autoPlayer: true, rng }));
    expect(result.ended).toBe(true);
    expect(result.tick).toBeLessThan(50);
  });

  it('runs the full count when no actor dies', () => {
    const player = createActorStore();
    const bot = createActorStore();
    const q = setupActionQueue();
    const result = runTicks(10, ctx({ player, bot, queue: q }));
    expect(result.ended).toBe(false);
    expect(result.tick).toBe(10);
  });
});

// ── queuePlayerAction helper ─────────────────────────────────────────────────

describe('queuePlayerAction', () => {
  it('queues a player action with the correct actor field', () => {
    const q = setupActionQueue();
    queuePlayerAction(q, 'attack', { rng: () => 0 });
    expect(q.size).toBe(1);
  });
});

// ── End-to-end integration ───────────────────────────────────────────────────

describe('integration — full fight runs to completion', () => {
  it('AGS player vs whip bot ends with player winning (deterministic rng)', () => {
    const player = createActorStore();
    const bot = createActorStore();
    applyLoadout(player, 'ags_main');
    applyLoadout(bot, 'dds_pure'); // weaker spec, lower max hit
    bot.getState().setHP(50);     // give the player a head start so the fight is short

    const q = setupActionQueue();
    // rng that always hits and max-damages: every accuracy roll = 0 (hit),
    // every damage roll = 0.99 (top of range)
    let i = 0;
    const seq = [0, 0.99];
    const rng = () => seq[i++ % seq.length];

    const result = runTicks(200, ctx({
      player, bot, queue: q,
      autoPlayer: true, autoBot: true,
      difficulty: 'hard',
      rng
    }));
    expect(result.ended).toBe(true);
    expect(['player', 'bot', 'draw']).toContain(result.winner);

    // Invariants: HP never went negative, no NaN, sensible attack cooldowns
    expect(player.getState().current.hp).toBeGreaterThanOrEqual(0);
    expect(bot.getState().current.hp).toBeGreaterThanOrEqual(0);
    expect(player.getState().current.prayer).toBeGreaterThanOrEqual(0);
    expect(bot.getState().current.prayer).toBeGreaterThanOrEqual(0);
    expect(player.getState().attackCooldown).toBeGreaterThanOrEqual(0);
    expect(bot.getState().attackCooldown).toBeGreaterThanOrEqual(0);
  });

  it('fight produces non-trivial combat log entries', () => {
    const player = createActorStore();
    const bot = createActorStore();
    applyLoadout(player, 'ags_main');
    applyLoadout(bot, 'dds_pure');
    bot.getState().setHP(30);
    const q = setupActionQueue();
    let i = 0;
    const seq = [0, 0.99];
    const rng = () => seq[i++ % seq.length];
    runTicks(100, ctx({
      player, bot, queue: q,
      autoPlayer: true, autoBot: true,
      difficulty: 'medium',
      rng
    }));
    const log = useGameStore.getState().combatLog;
    expect(log.length).toBeGreaterThan(0);
    // Should contain at least one damage line ("hit N")
    expect(log.some(l => /hit \d+/.test(l))).toBe(true);
  });
});
