// Property / fuzz tests: drive the full GameLoop with seeded PRNGs and assert
// invariants that must hold for any input. Seeds are explicit so failures are
// reproducible — re-run with the same seed to investigate.

import { describe, it, expect, beforeEach } from 'vitest';
import { setupActionQueue, runTicks } from '../engine/GameLoop.js';
import { createActorStore } from '../store/actorStore.js';
import { useGameStore } from '../store/gameStore.js';
import { applyLoadout, listPresetLoadouts } from '../store/loadoutStore.js';
import { makePRNG } from './_prng.js';

const SEEDS = [1, 7, 42, 99, 1337, 2024, 65535, 314159];

function runFightWithSeed({ playerLoadout, botLoadout, seed, maxTicks = 300, difficulty = 'medium' }) {
  const player = createActorStore();
  const bot = createActorStore();
  if (playerLoadout) applyLoadout(player, playerLoadout);
  if (botLoadout) applyLoadout(bot, botLoadout);
  const queue = setupActionQueue();
  const rng = makePRNG(seed);
  const result = runTicks(maxTicks, {
    player, bot,
    game: useGameStore,
    queue,
    tick: 0,
    difficulty,
    autoPlayer: true,
    autoBot: true,
    rng
  });
  return { result, player, bot };
}

function assertInvariants(player, bot) {
  for (const store of [player, bot]) {
    const s = store.getState();
    expect(s.current.hp).toBeGreaterThanOrEqual(0);
    expect(s.current.hp).toBeLessThanOrEqual(s.levels.hitpoints + 100); // overheal margin
    expect(s.current.prayer).toBeGreaterThanOrEqual(0);
    expect(s.current.prayer).toBeLessThanOrEqual(s.levels.prayer);
    expect(s.current.specEnergy).toBeGreaterThanOrEqual(0);
    expect(s.current.specEnergy).toBeLessThanOrEqual(100);
    expect(s.attackCooldown).toBeGreaterThanOrEqual(0);
    expect(s.eatCooldown).toBeGreaterThanOrEqual(0);
    expect(s.comboCooldown).toBeGreaterThanOrEqual(0);
    // No NaN / non-finite values leaked into state
    expect(Number.isFinite(s.current.hp)).toBe(true);
    expect(Number.isFinite(s.current.prayer)).toBe(true);
    expect(Number.isFinite(s.current.specEnergy)).toBe(true);
  }
}

beforeEach(() => {
  useGameStore.getState().clearLog();
  useGameStore.getState().setWinner(null);
});

// ── Invariants across many seeds ─────────────────────────────────────────────

describe('PROPERTY — invariants hold for any rng seed', () => {
  for (const seed of SEEDS) {
    it(`AGS vs DDS @ seed=${seed} respects all invariants`, () => {
      const { player, bot } = runFightWithSeed({
        playerLoadout: 'ags_main',
        botLoadout: 'dds_pure',
        seed
      });
      assertInvariants(player, bot);
    });

    it(`Ranged vs AGS @ seed=${seed} respects all invariants`, () => {
      const { player, bot } = runFightWithSeed({
        playerLoadout: 'ranged_main',
        botLoadout: 'ags_main',
        seed
      });
      assertInvariants(player, bot);
    });

    it(`Claws vs Gmaul @ seed=${seed} respects all invariants`, () => {
      const { player, bot } = runFightWithSeed({
        playerLoadout: 'claws_main',
        botLoadout: 'gmaul_main',
        seed
      });
      assertInvariants(player, bot);
    });
  }
});

// ── Determinism: same seed → same outcome ────────────────────────────────────

describe('PROPERTY — same seed produces same fight outcome', () => {
  for (const seed of [1, 42, 1337]) {
    it(`seed=${seed} replays produce identical end state`, () => {
      const a = runFightWithSeed({
        playerLoadout: 'ags_main', botLoadout: 'dds_pure', seed
      });
      const b = runFightWithSeed({
        playerLoadout: 'ags_main', botLoadout: 'dds_pure', seed
      });
      expect(a.result.tick).toBe(b.result.tick);
      expect(a.result.ended).toBe(b.result.ended);
      expect(a.result.winner).toBe(b.result.winner);
      expect(a.player.getState().current.hp).toBe(b.player.getState().current.hp);
      expect(a.bot.getState().current.hp).toBe(b.bot.getState().current.hp);
      expect(a.player.getState().current.prayer).toBe(b.player.getState().current.prayer);
      expect(a.bot.getState().current.prayer).toBe(b.bot.getState().current.prayer);
    });
  }
});

// ── Coverage: every loadout pair fights without throwing ─────────────────────

describe('PROPERTY — every preset × preset matchup fights without throwing', () => {
  const presetIds = listPresetLoadouts().map(p => p.id);
  for (const p of presetIds) {
    for (const b of presetIds) {
      it(`${p} vs ${b} runs 100 ticks at seed=1 without throwing`, () => {
        expect(() =>
          runFightWithSeed({
            playerLoadout: p, botLoadout: b,
            seed: 1, maxTicks: 100
          })
        ).not.toThrow();
      });
    }
  }
});

// ── Difficulty progression: harder bots are more dangerous ───────────────────
//
// Caveat: easy/hard fights consume rng differently (hard issues additional
// prayer/spec/eat actions), so per-seed comparisons aren't apples-to-apples.
// We assert the aggregate: across many seeds, the hard bot wins as often or
// more often than the easy bot.

describe('PROPERTY — harder bot wins at least as often across many seeds', () => {
  it('hard wins ≥ easy wins for the same matchup', () => {
    const countBotWins = (difficulty) =>
      SEEDS.filter(seed => {
        const { result } = runFightWithSeed({
          playerLoadout: 'dds_pure', botLoadout: 'ags_main',
          seed, difficulty, maxTicks: 200
        });
        return result.winner === 'bot';
      }).length;

    const easyWins = countBotWins('easy');
    const hardWins = countBotWins('hard');
    expect(hardWins).toBeGreaterThanOrEqual(easyWins);
  });
});

// ── Combat log never overflows its cap ───────────────────────────────────────

describe('PROPERTY — combat log respects its 50-line cap', () => {
  it('log length never exceeds 50 even after a long fight', () => {
    runFightWithSeed({
      playerLoadout: 'ags_main', botLoadout: 'ags_main',
      seed: 42, maxTicks: 500
    });
    expect(useGameStore.getState().combatLog.length).toBeLessThanOrEqual(50);
  });
});
