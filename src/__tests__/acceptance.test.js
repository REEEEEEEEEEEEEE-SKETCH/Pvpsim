// End-to-end acceptance tests: each "Mechanics quick-reference" item in the
// README, wired through the full ActionQueue + GameLoop (not just engine
// unit pieces). These are the highest-level guarantees of the simulator.

import { describe, it, expect, beforeEach } from 'vitest';
import { setupActionQueue, runOneTick } from '../engine/GameLoop.js';
import { createActorStore } from '../store/actorStore.js';
import { useGameStore } from '../store/gameStore.js';
import { applyLoadout } from '../store/loadoutStore.js';
import { activatePrayer } from '../engine/PrayerSystem.js';

function rngSeq(...vals) {
  let i = 0;
  return () => (i < vals.length ? vals[i++] : 0);
}

function baseCtx(extra) {
  return {
    game: useGameStore,
    tick: 1,
    difficulty: 'medium',
    autoPlayer: false,
    autoBot: false,
    ...extra
  };
}

beforeEach(() => {
  useGameStore.getState().clearLog();
  useGameStore.getState().setWinner(null);
});

// ── ACCEPTANCE: Tick eat ─────────────────────────────────────────────────────
//
//   "Tick eat: food (priority 4) resolves before damage (priority 5) on the
//    same tick."
//
describe('ACCEPTANCE — tick eat: P4 food saves player from P5 attack', () => {
  it('player at 20 HP eats a shark same tick bot whip would land, survives', () => {
    const player = createActorStore();
    player.getState().setHP(20);
    const bot = createActorStore({ equipment: { weapon: 'abyssal_whip' } });
    const queue = setupActionQueue();

    queue.enqueue({ actor: 'player', type: 'eat', payload: { itemId: 'shark' } });
    queue.enqueue({ actor: 'bot', type: 'attack', payload: { rng: rngSeq(0, 0.99) } });

    runOneTick(baseCtx({ player, bot, queue }));

    // 20 + 20 (eat) - 25 (whip max no prayer) = 15
    expect(player.getState().current.hp).toBe(15);
    expect(player.getState().eatCooldown).toBe(3);
  });

  it('without the eat, same incoming damage would kill the player', () => {
    const player = createActorStore();
    player.getState().setHP(20);
    const bot = createActorStore({ equipment: { weapon: 'abyssal_whip' } });
    const queue = setupActionQueue();
    queue.enqueue({ actor: 'bot', type: 'attack', payload: { rng: rngSeq(0, 0.99) } });
    runOneTick(baseCtx({ player, bot, queue }));
    expect(player.getState().current.hp).toBe(0); // 20 - 25 floored at 0
  });
});

// ── ACCEPTANCE: Combo eat ────────────────────────────────────────────────────
//
//   "Combo eat: primary food + Karambwan same tick. Larger eat-delay wins
//    (shark+karambwan → 3 ticks, +38 HP)."
//
describe('ACCEPTANCE — combo eat: shark + karambwan same tick', () => {
  it('+38 HP and 3-tick cooldown after one combo via GameLoop', () => {
    const player = createActorStore();
    player.getState().setHP(40);
    const bot = createActorStore();
    const queue = setupActionQueue();

    queue.enqueue({ actor: 'player', type: 'eat', payload: { itemId: 'shark' } });
    queue.enqueue({ actor: 'player', type: 'eat', payload: { itemId: 'karambwan' } });

    runOneTick(baseCtx({ player, bot, queue }));

    expect(player.getState().current.hp).toBe(40 + 20 + 18);
    expect(player.getState().eatCooldown).toBe(3); // max(shark=3, karambwan=2)
    expect(player.getState().comboCooldown).toBe(2);
  });
});

// ── ACCEPTANCE: Protection prayer = 0.6× ─────────────────────────────────────
//
//   "Protection prayers in PvP = 0.6× damage (40% reduction), not a full block."
//
describe('ACCEPTANCE — protection prayer reduces incoming damage by exactly 40%', () => {
  it('protect_from_melee active → whip max damage 25 reduced to 15', () => {
    const player = createActorStore();
    activatePrayer(player, 'protect_from_melee');
    const bot = createActorStore({ equipment: { weapon: 'abyssal_whip' } });
    const queue = setupActionQueue();
    queue.enqueue({ actor: 'bot', type: 'attack', payload: { rng: rngSeq(0, 0.99) } });
    runOneTick(baseCtx({ player, bot, queue }));
    // Whip max no prayer = 25; floor(25 * 0.6) = 15; 99 - 15 = 84
    expect(player.getState().current.hp).toBe(84);
  });

  it('mismatched protection (protect_from_magic vs melee) does NOT reduce damage', () => {
    const player = createActorStore();
    activatePrayer(player, 'protect_from_magic');
    const bot = createActorStore({ equipment: { weapon: 'abyssal_whip' } });
    const queue = setupActionQueue();
    queue.enqueue({ actor: 'bot', type: 'attack', payload: { rng: rngSeq(0, 0.99) } });
    runOneTick(baseCtx({ player, bot, queue }));
    expect(player.getState().current.hp).toBe(99 - 25);
  });
});

// ── ACCEPTANCE: Gmaul stacking ───────────────────────────────────────────────
//
//   "Gmaul stacking: Granite Maul spec adds 0 attack delay, enabling
//    AGS → switch → Gmaul same tick via the priority pipeline."
//
describe('ACCEPTANCE — Gmaul instant spec stacks with a same-tick normal attack', () => {
  it('Gmaul spec (P3) then normal attack (P5) both connect in one tick', () => {
    const player = createActorStore({ equipment: { weapon: 'granite_maul' } });
    const bot = createActorStore();
    const queue = setupActionQueue();

    queue.enqueue({
      actor: 'player',
      type: 'toggle_spec',
      payload: { specId: 'granite_maul', rng: rngSeq(0, 0.99) }
    });
    queue.enqueue({
      actor: 'player',
      type: 'attack',
      payload: { rng: rngSeq(0, 0.99) }
    });

    runOneTick(baseCtx({ player, bot, queue }));

    // Gmaul base max @ 99 str aggressive no prayer = 25
    // Spec (1.0× mult) lands max 25; normal attack also lands max 25 → 50 total
    expect(bot.getState().current.hp).toBe(99 - 50);
    expect(player.getState().current.specEnergy).toBe(50);
  });

  it('AGS spec (non-instant) blocks the same-tick normal attack', () => {
    const player = createActorStore({ equipment: { weapon: 'armadyl_godsword' } });
    const bot = createActorStore();
    const queue = setupActionQueue();
    queue.enqueue({
      actor: 'player',
      type: 'toggle_spec',
      payload: { specId: 'armadyl_godsword', rng: rngSeq(0, 0.99) }
    });
    queue.enqueue({
      actor: 'player',
      type: 'attack',
      payload: { rng: rngSeq(0, 0.99) }
    });
    runOneTick(baseCtx({ player, bot, queue }));

    // AGS spec lands max 46; normal attack blocked by cooldown=6 set by spec
    expect(bot.getState().current.hp).toBe(99 - 46);
  });
});

// ── ACCEPTANCE: Equip switch resolves before attack ──────────────────────────
//
//   "Action priority within a tick: Prayer → Equip → Spec → Consume → Combat
//    → Move." — verify Equip (P2) resolves before Combat (P5) reads weapon.
//
describe('ACCEPTANCE — equipment switch (P2) resolves before attack (P5) reads it', () => {
  it('switch to whip mid-tick → P5 attack uses whip damage, not unarmed', () => {
    const player = createActorStore(); // starts unarmed
    const bot = createActorStore();
    const queue = setupActionQueue();

    queue.enqueue({
      actor: 'player',
      type: 'switch_equipment',
      payload: { slot: 'weapon', itemId: 'abyssal_whip' }
    });
    queue.enqueue({
      actor: 'player',
      type: 'attack',
      payload: { rng: rngSeq(0, 0.99) }
    });

    runOneTick(baseCtx({ player, bot, queue }));

    expect(player.getState().equipment.weapon).toBe('abyssal_whip');
    expect(bot.getState().current.hp).toBe(99 - 25); // whip max 25, not unarmed
  });
});

// ── ACCEPTANCE: AI bot prayer switching ──────────────────────────────────────
describe('ACCEPTANCE — AI bot prayer-switches when player swaps weapon type', () => {
  it('player switches melee → magic; medium bot activates protect_from_magic', () => {
    const player = createActorStore({ equipment: { weapon: 'volatile_nightmare_staff' } });
    const bot = createActorStore();
    const queue = setupActionQueue();
    runOneTick(baseCtx({ player, bot, queue, autoBot: true }));
    expect(bot.getState().activePrayers).toContain('protect_from_magic');
  });
});

// ── ACCEPTANCE: Preset loadouts apply cleanly ────────────────────────────────
describe('ACCEPTANCE — every preset loadout produces a fightable actor', () => {
  const presets = ['ags_main', 'dds_pure', 'claws_main', 'ranged_main', 'tribrid', 'gmaul_main'];
  for (const preset of presets) {
    it(`'${preset}' applies and the actor can attack a target on tick 1`, () => {
      const player = createActorStore();
      applyLoadout(player, preset);
      const bot = createActorStore();
      const queue = setupActionQueue();
      queue.enqueue({
        actor: 'player',
        type: 'attack',
        payload: { rng: rngSeq(0, 0.99), spell: 'ice_barrage' } // spell for magic loadouts
      });
      expect(() =>
        runOneTick(baseCtx({ player, bot, queue }))
      ).not.toThrow();
      // Bot took some damage OR player has a non-zero attack cooldown (proves attack fired)
      const cd = player.getState().attackCooldown;
      const botHurt = bot.getState().current.hp < 99;
      expect(cd > 0 || botHurt).toBe(true);
    });
  }
});
