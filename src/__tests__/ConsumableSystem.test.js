import { describe, it, expect, beforeEach } from 'vitest';
import {
  eatFood,
  drinkPotion,
  tickStatDrain,
  makeConsumeHandlers
} from '../engine/ConsumableSystem.js';
import { createActorStore } from '../store/actorStore.js';
import { useGameStore } from '../store/gameStore.js';
import { ActionQueue } from '../engine/ActionQueue.js';

describe('eatFood — basic food', () => {
  // ACCEPTANCE #1
  it('shark heals 20 hp and sets 3-tick eat cooldown', () => {
    const store = createActorStore();
    store.getState().setHP(79);
    const result = eatFood(store, 'shark');
    expect(result.ok).toBe(true);
    expect(result.healed).toBe(20);
    expect(store.getState().current.hp).toBe(99);
    expect(store.getState().eatCooldown).toBe(3);
  });

  it('manta ray heals 22', () => {
    const store = createActorStore();
    store.getState().setHP(60);
    expect(eatFood(store, 'manta_ray').healed).toBe(22);
    expect(store.getState().current.hp).toBe(82);
  });

  it('heal is capped at max HP for non-overheal food', () => {
    const store = createActorStore(); // hp = 99
    store.getState().setHP(95);
    eatFood(store, 'shark'); // would heal 20 but 99 is cap
    expect(store.getState().current.hp).toBe(99);
  });

  it('anglerfish can overheal above max HP', () => {
    const store = createActorStore(); // hp = 99
    // HP at max — anglerfish still adds
    const result = eatFood(store, 'anglerfish');
    expect(result.ok).toBe(true);
    expect(store.getState().current.hp).toBe(99 + 22); // 121
  });

  it('eating unknown item returns not_food', () => {
    const store = createActorStore();
    const r = eatFood(store, 'rune_platebody');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('not_food');
  });
});

describe('eatFood — eat cooldown gate', () => {
  // ACCEPTANCE #4
  it('cannot eat two non-combo foods in the same tick', () => {
    const store = createActorStore();
    store.getState().setHP(50);
    const r1 = eatFood(store, 'shark');
    const r2 = eatFood(store, 'shark');
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(false);
    expect(r2.reason).toBe('eat_cooldown');
    expect(store.getState().current.hp).toBe(70); // only first shark
  });

  it('eat cooldown persists across items — cannot follow shark with dark crab', () => {
    const store = createActorStore();
    store.getState().setHP(50);
    eatFood(store, 'shark');
    const r = eatFood(store, 'dark_crab');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('eat_cooldown');
  });
});

describe('eatFood — combo eating (Karambwan)', () => {
  // ACCEPTANCE #2
  it('shark + karambwan same tick heals 38 with 3-tick cooldown', () => {
    const store = createActorStore();
    store.getState().setHP(50);
    const r1 = eatFood(store, 'shark');
    const r2 = eatFood(store, 'karambwan');
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(store.getState().current.hp).toBe(88); // 50 + 20 + 18
    expect(store.getState().eatCooldown).toBe(3); // max(3, 2)
    expect(store.getState().comboCooldown).toBe(2);
  });

  it('karambwan alone sets eatCooldown to 2', () => {
    const store = createActorStore();
    store.getState().setHP(50);
    eatFood(store, 'karambwan');
    expect(store.getState().current.hp).toBe(68);
    expect(store.getState().comboCooldown).toBe(2);
    expect(store.getState().eatCooldown).toBe(2); // max(0, 2)
  });

  it('cannot eat two karambwans same tick — comboCooldown blocks', () => {
    const store = createActorStore();
    store.getState().setHP(50);
    eatFood(store, 'karambwan');
    const r = eatFood(store, 'karambwan');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('combo_cooldown');
  });

  it('karambwan does not extend a longer primary eat cooldown', () => {
    const store = createActorStore();
    store.getState().setHP(50);
    eatFood(store, 'shark'); // eatCooldown = 3
    eatFood(store, 'karambwan'); // comboCooldown = 2, eatCooldown stays 3
    expect(store.getState().eatCooldown).toBe(3);
  });
});

describe('drinkPotion — Super Combat', () => {
  // ACCEPTANCE #3 (boost formula)
  it('super combat sets attack/strength/defence boost to 5 + floor(0.15 * level)', () => {
    const store = createActorStore(); // all level 99
    drinkPotion(store, 'super_combat');
    const expected = 5 + Math.floor(0.15 * 99); // 5 + 14 = 19
    expect(store.getState().boosts.attack).toBe(expected);
    expect(store.getState().boosts.strength).toBe(expected);
    expect(store.getState().boosts.defence).toBe(expected);
  });

  it('super combat at level 75 gives correct boost', () => {
    const store = createActorStore({ levels: { attack: 75, strength: 75, defence: 75, hitpoints: 99, prayer: 99, ranged: 99, magic: 99 } });
    drinkPotion(store, 'super_combat');
    const expected = 5 + Math.floor(0.15 * 75); // 5 + 11 = 16
    expect(store.getState().boosts.attack).toBe(expected);
  });

  it('drinking super combat twice does not double-stack boost', () => {
    const store = createActorStore();
    drinkPotion(store, 'super_combat');
    drinkPotion(store, 'super_combat');
    const expected = 5 + Math.floor(0.15 * 99); // still 19
    expect(store.getState().boosts.attack).toBe(expected);
  });
});

describe('drinkPotion — Ranging potion', () => {
  it('ranging potion sets ranged boost to 4 + floor(0.10 * level)', () => {
    const store = createActorStore();
    drinkPotion(store, 'ranging');
    const expected = 4 + Math.floor(0.10 * 99); // 4 + 9 = 13
    expect(store.getState().boosts.ranged).toBe(expected);
  });
});

describe('drinkPotion — Super Restore', () => {
  it('super restore recovers drained boosts toward base', () => {
    const store = createActorStore();
    // Simulate attack drained 10 points below base
    store.getState().setBoost('attack', -10);
    drinkPotion(store, 'super_restore');
    // restoreAmt = 8 + floor(0.25 * 99) = 8 + 24 = 32; actual = min(32, 10) = 10
    expect(store.getState().boosts.attack).toBe(0);
  });

  it('super restore restores prayer points', () => {
    const store = createActorStore();
    store.getState().setPrayer(50);
    drinkPotion(store, 'super_restore');
    // restoreAmt = 8 + floor(0.25 * 99) = 32; actual = min(32, 99-50) = 32
    expect(store.getState().current.prayer).toBe(82);
  });

  it('super restore on full prayer does nothing', () => {
    const store = createActorStore(); // prayer = 99
    drinkPotion(store, 'super_restore');
    expect(store.getState().current.prayer).toBe(99);
  });

  it('super restore does not remove positive boosts', () => {
    const store = createActorStore();
    drinkPotion(store, 'super_combat');
    const boost = store.getState().boosts.attack; // 19
    drinkPotion(store, 'super_restore');
    expect(store.getState().boosts.attack).toBe(boost); // unchanged
  });
});

describe('drinkPotion — Saradomin Brew', () => {
  it('brew heals floor(maxHp * 0.15) + 2', () => {
    const store = createActorStore();
    store.getState().setHP(70);
    drinkPotion(store, 'saradomin_brew');
    const expectedHeal = Math.floor(99 * 0.15) + 2; // 14 + 2 = 16
    expect(store.getState().current.hp).toBe(86);
    expect(expectedHeal).toBe(16);
  });

  it('brew boosts defence by floor(0.20 * base)', () => {
    const store = createActorStore();
    drinkPotion(store, 'saradomin_brew');
    const expected = Math.floor(0.20 * 99); // 19
    expect(store.getState().boosts.defence).toBe(expected);
  });

  it('brew drains attack/strength/magic/ranged by floor(0.10 * base)', () => {
    const store = createActorStore();
    drinkPotion(store, 'saradomin_brew');
    const expectedDrain = Math.floor(0.10 * 99); // 9
    expect(store.getState().boosts.attack).toBe(-expectedDrain);
    expect(store.getState().boosts.strength).toBe(-expectedDrain);
    expect(store.getState().boosts.magic).toBe(-expectedDrain);
    expect(store.getState().boosts.ranged).toBe(-expectedDrain);
  });

  it('heal is capped at max HP — no overheal from brew', () => {
    const store = createActorStore(); // hp = 99
    drinkPotion(store, 'saradomin_brew');
    expect(store.getState().current.hp).toBe(99);
  });
});

describe('tickStatDrain — boost decay', () => {
  // ACCEPTANCE #3 (drains over time)
  it('boosts do NOT drain before 100 ticks', () => {
    const store = createActorStore();
    drinkPotion(store, 'super_combat');
    for (let t = 0; t < 99; t++) tickStatDrain(store);
    const expected = 5 + Math.floor(0.15 * 99); // 19
    expect(store.getState().boosts.attack).toBe(expected);
  });

  it('on the 100th tick, positive boosts drain by 1', () => {
    const store = createActorStore();
    drinkPotion(store, 'super_combat'); // boost = 19
    for (let t = 0; t < 100; t++) tickStatDrain(store);
    expect(store.getState().boosts.attack).toBe(18);
    expect(store.getState().boosts.strength).toBe(18);
    expect(store.getState().boosts.defence).toBe(18);
  });

  it('negative boosts (brew drains) decay toward 0', () => {
    const store = createActorStore();
    drinkPotion(store, 'saradomin_brew'); // attack boost = -9
    for (let t = 0; t < 100; t++) tickStatDrain(store);
    expect(store.getState().boosts.attack).toBe(-8);
  });

  it('zero boost is unchanged at 100-tick boundary', () => {
    const store = createActorStore(); // no potion, boosts all 0
    for (let t = 0; t < 100; t++) tickStatDrain(store);
    expect(store.getState().boosts.attack).toBe(0);
    expect(store.getState().boosts.ranged).toBe(0);
  });

  it('after 200 ticks, boost drains by 2', () => {
    const store = createActorStore();
    drinkPotion(store, 'super_combat'); // boost = 19
    for (let t = 0; t < 200; t++) tickStatDrain(store);
    expect(store.getState().boosts.attack).toBe(17);
  });

  it('tickStatDrain returns drained:true only on the 100th tick', () => {
    const store = createActorStore();
    for (let t = 0; t < 99; t++) {
      const r = tickStatDrain(store);
      expect(r.drained).toBe(false);
    }
    expect(tickStatDrain(store).drained).toBe(true);
    expect(tickStatDrain(store).drained).toBe(false); // resets
  });
});

describe('makeConsumeHandlers — ActionQueue integration', () => {
  beforeEach(() => {
    useGameStore.getState().clearLog();
  });

  it('eat handler heals player via ActionQueue', () => {
    const player = createActorStore();
    player.getState().setHP(70);
    const bot = createActorStore();
    const q = new ActionQueue();
    const { eat } = makeConsumeHandlers();
    q.register('eat', eat);
    q.enqueue({ actor: 'player', type: 'eat', payload: { itemId: 'shark' } });
    q.flushTick({ player, bot, game: useGameStore, tick: 1 });
    expect(player.getState().current.hp).toBe(90);
    expect(player.getState().eatCooldown).toBe(3);
  });

  it('drink handler boosts player via ActionQueue', () => {
    const player = createActorStore();
    const bot = createActorStore();
    const q = new ActionQueue();
    const { drink } = makeConsumeHandlers();
    q.register('drink', drink);
    q.enqueue({ actor: 'player', type: 'drink', payload: { potionId: 'super_combat' } });
    q.flushTick({ player, bot, game: useGameStore, tick: 1 });
    const expected = 5 + Math.floor(0.15 * 99);
    expect(player.getState().boosts.attack).toBe(expected);
  });

  it('failed eat logs reason to game log without throwing', () => {
    const player = createActorStore();
    player.getState().setEatCooldown(3); // already on cooldown
    const bot = createActorStore();
    const q = new ActionQueue();
    const { eat } = makeConsumeHandlers();
    q.register('eat', eat);
    q.enqueue({ actor: 'player', type: 'eat', payload: { itemId: 'shark' } });
    expect(() =>
      q.flushTick({ player, bot, game: useGameStore, tick: 1 })
    ).not.toThrow();
    expect(
      useGameStore.getState().combatLog.some(l => /eat_cooldown/.test(l))
    ).toBe(true);
  });

  it('eat (P4) resolves before attack (P5) — tick-eat integration', () => {
    const player = createActorStore();
    player.getState().setHP(20);
    const bot = createActorStore({
      equipment: { weapon: 'abyssal_whip' },
      activePrayers: ['piety']
    });
    const q = new ActionQueue();
    const { eat } = makeConsumeHandlers();
    q.register('eat', eat);
    q.register('attack', (action, ctx) => {
      const aStore = action.actor === 'bot' ? ctx.bot : ctx.player;
      const dStore = action.actor === 'bot' ? ctx.player : ctx.bot;
      // scripted: bot hits 30 vs player
      dStore.getState().damage(30);
      aStore.getState().setAttackCooldown(4);
    });
    q.enqueue({ actor: 'player', type: 'eat', payload: { itemId: 'shark' } });
    q.enqueue({ actor: 'bot',    type: 'attack', payload: {} });
    q.flushTick({ player, bot, game: useGameStore, tick: 1 });
    // player: 20 + 20 (heal) = 40, then -30 = 10. Survives.
    expect(player.getState().current.hp).toBe(10);
  });
});
