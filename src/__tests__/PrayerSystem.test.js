import { describe, it, expect, beforeEach } from 'vitest';
import {
  PRAYER_COVERS,
  getConflicts,
  activatePrayer,
  deactivatePrayer,
  togglePrayer,
  tickPrayerDrain,
  makePrayerHandlers
} from '../engine/PrayerSystem.js';
import { createActorStore } from '../store/actorStore.js';
import { useGameStore } from '../store/gameStore.js';
import { ActionQueue } from '../engine/ActionQueue.js';
import { resolveAttack } from '../engine/CombatEngine.js';
import { EQUIPMENT_SLOTS } from '../engine/Bonuses.js';

const emptyEq = () => Object.fromEntries(EQUIPMENT_SLOTS.map(s => [s, null]));

function rngSeq(...vals) {
  let i = 0;
  return () => (i < vals.length ? vals[i++] : 0);
}

describe('getConflicts — covers-based mutex', () => {
  it('Piety and Chivalry conflict on attack/strength/defence', () => {
    expect(getConflicts('piety', ['chivalry'])).toEqual(['chivalry']);
    expect(getConflicts('chivalry', ['piety'])).toEqual(['piety']);
  });

  it('protection prayers and Smite all mutex on overhead', () => {
    expect(getConflicts('protect_from_melee', ['protect_from_magic'])).toEqual([
      'protect_from_magic'
    ]);
    expect(getConflicts('smite', ['protect_from_melee'])).toEqual([
      'protect_from_melee'
    ]);
  });

  it('Piety conflicts with Steel Skin via defence cover', () => {
    expect(getConflicts('piety', ['steel_skin'])).toEqual(['steel_skin']);
  });

  it('Piety conflicts with single-stat Ultimate Strength via strength cover', () => {
    expect(getConflicts('piety', ['ultimate_strength'])).toEqual([
      'ultimate_strength'
    ]);
  });

  it('Eagle Eye and Steel Skin do NOT conflict (ranged vs defence, no overlap)', () => {
    expect(getConflicts('eagle_eye', ['steel_skin'])).toEqual([]);
    expect(getConflicts('steel_skin', ['eagle_eye'])).toEqual([]);
  });

  it('Eagle Eye and Piety do NOT conflict directly (ranged vs atk/str/def)', () => {
    expect(getConflicts('eagle_eye', ['piety'])).toEqual([]);
  });

  it('Rigour conflicts with Piety (both cover defence)', () => {
    expect(getConflicts('rigour', ['piety'])).toEqual(['piety']);
  });
});

describe('activatePrayer — conflict resolution', () => {
  let store;
  beforeEach(() => {
    store = createActorStore();
  });

  // ACCEPTANCE #3
  it('activating Piety automatically deactivates Chivalry', () => {
    activatePrayer(store, 'chivalry');
    expect(store.getState().activePrayers).toEqual(['chivalry']);

    const result = activatePrayer(store, 'piety');
    expect(result.ok).toBe(true);
    expect(result.deactivated).toEqual(['chivalry']);
    expect(store.getState().activePrayers).toEqual(['piety']);
  });

  it('activating a protection prayer replaces the previous one', () => {
    activatePrayer(store, 'protect_from_melee');
    activatePrayer(store, 'protect_from_magic');
    expect(store.getState().activePrayers).toEqual(['protect_from_magic']);
  });

  it('Piety + Eagle Eye coexist (different covers)', () => {
    activatePrayer(store, 'piety');
    activatePrayer(store, 'eagle_eye');
    expect(store.getState().activePrayers).toEqual(['piety', 'eagle_eye']);
  });

  it('Protect from Melee + Piety coexist (overhead vs combo)', () => {
    activatePrayer(store, 'protect_from_melee');
    activatePrayer(store, 'piety');
    expect(store.getState().activePrayers).toContain('protect_from_melee');
    expect(store.getState().activePrayers).toContain('piety');
  });

  it('activating an already-active prayer is a no-op', () => {
    activatePrayer(store, 'piety');
    const r = activatePrayer(store, 'piety');
    expect(r.ok).toBe(true);
    expect(r.alreadyActive).toBe(true);
    expect(store.getState().activePrayers).toEqual(['piety']);
  });
});

describe('activatePrayer — validation', () => {
  it('rejects unknown prayer ids', () => {
    const store = createActorStore();
    const r = activatePrayer(store, 'protect_from_bots');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('unknown_prayer');
  });

  it('rejects when prayer level requirement not met', () => {
    const store = createActorStore({ levels: { prayer: 50 } });
    const r = activatePrayer(store, 'piety'); // requires 70
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('level_too_low');
  });

  it('rejects when prayer points are 0', () => {
    const store = createActorStore();
    store.getState().setPrayer(0);
    const r = activatePrayer(store, 'piety');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_prayer_points');
  });
});

describe('deactivatePrayer & togglePrayer', () => {
  it('deactivatePrayer removes a single prayer', () => {
    const store = createActorStore();
    activatePrayer(store, 'piety');
    deactivatePrayer(store, 'piety');
    expect(store.getState().activePrayers).toEqual([]);
  });

  it('togglePrayer flips on then off', () => {
    const store = createActorStore();
    expect(togglePrayer(store, 'piety').toggled).toBe('on');
    expect(store.getState().activePrayers).toEqual(['piety']);
    expect(togglePrayer(store, 'piety').toggled).toBe('off');
    expect(store.getState().activePrayers).toEqual([]);
  });
});

describe('tickPrayerDrain — exact integer math', () => {
  // ACCEPTANCE #1
  it('Piety alone, 0 prayer bonus, 100 ticks => exactly 24 points drained', () => {
    const store = createActorStore();
    activatePrayer(store, 'piety');
    for (let t = 0; t < 100; t++) tickPrayerDrain(store);
    expect(store.getState().current.prayer).toBe(99 - 24);
  });

  it('Piety, +30 prayer bonus, 100 ticks => exactly 12 points drained (half rate)', () => {
    // Stack helms/fury/etc up to roughly +30 prayer bonus, but the easiest
    // way is to inject a synthetic prayer-bonus item.
    const itemsDb = {
      fake_prayer_book: {
        slot: 'cape',
        equipment: {
          attack_stab: 0, attack_slash: 0, attack_crush: 0,
          attack_magic: 0, attack_ranged: 0,
          defence_stab: 0, defence_slash: 0, defence_crush: 0,
          defence_magic: 0, defence_ranged: 0,
          melee_strength: 0, ranged_strength: 0, magic_damage: 0,
          prayer: 30
        }
      }
    };
    const store = createActorStore();
    store.getState().equip('cape', 'fake_prayer_book', itemsDb);
    activatePrayer(store, 'piety');
    for (let t = 0; t < 100; t++) tickPrayerDrain(store, { itemsDb });
    expect(store.getState().current.prayer).toBe(99 - 12);
  });

  it('two simultaneous prayers stack drain rates (Piety + Smite = 48/min)', () => {
    const store = createActorStore();
    activatePrayer(store, 'piety');
    activatePrayer(store, 'smite'); // overhead — no conflict with piety
    for (let t = 0; t < 100; t++) tickPrayerDrain(store);
    expect(store.getState().current.prayer).toBe(99 - 48);
  });

  it('protection prayer alone (12/min), 100 ticks => 12 drained', () => {
    const store = createActorStore();
    activatePrayer(store, 'protect_from_melee');
    for (let t = 0; t < 100; t++) tickPrayerDrain(store);
    expect(store.getState().current.prayer).toBe(99 - 12);
  });

  it('drain to zero deactivates all prayers', () => {
    const store = createActorStore();
    store.getState().setPrayer(1);
    activatePrayer(store, 'piety');
    // 24/min => one point drains every ~4 ticks. Run until empty.
    for (let t = 0; t < 50; t++) tickPrayerDrain(store);
    expect(store.getState().current.prayer).toBe(0);
    expect(store.getState().activePrayers).toEqual([]);
  });

  it('no active prayers => no drain', () => {
    const store = createActorStore();
    for (let t = 0; t < 100; t++) tickPrayerDrain(store);
    expect(store.getState().current.prayer).toBe(99);
  });

  it('full Piety bar timing: 99 / (24/100) = 412.5 ticks ~= 4.125 minutes', () => {
    const store = createActorStore();
    activatePrayer(store, 'piety');
    for (let t = 0; t < 412; t++) tickPrayerDrain(store);
    expect(store.getState().current.prayer).toBeGreaterThan(0);
    expect(store.getState().current.prayer).toBeLessThanOrEqual(2);
    // One more drain crossing tips it to 0 + deactivate
    for (let t = 0; t < 5; t++) tickPrayerDrain(store);
    expect(store.getState().current.prayer).toBe(0);
    expect(store.getState().activePrayers).toEqual([]);
  });
});

describe('PrayerSystem ↔ CombatEngine — protection prayer reduces damage 40%', () => {
  // ACCEPTANCE #2
  it('Protect from Melee activated via PrayerSystem reduces whip damage 40%', () => {
    const defenderStore = createActorStore();
    activatePrayer(defenderStore, 'protect_from_melee');

    const attacker = {
      levels: { attack: 99, strength: 99, defence: 99, hitpoints: 99, prayer: 99, ranged: 99, magic: 99 },
      boosts: { attack: 0, strength: 0, defence: 0, ranged: 0, magic: 0 },
      activePrayers: ['piety'],
      attackStyle: 'aggressive',
      equipment: { ...emptyEq(), weapon: 'abyssal_whip' },
      attackCooldown: 0,
      eatCooldown: 0
    };
    const r = resolveAttack(attacker, defenderStore.getState(), {
      rng: rngSeq(0, 0.99)
    });
    expect(r.protectingPrayer).toBe('protect_from_melee');
    expect(r.rawDamage).toBe(30);
    expect(r.damage).toBe(18);
  });
});

describe('makePrayerHandlers — ActionQueue integration', () => {
  beforeEach(() => {
    useGameStore.getState().clearLog();
  });

  it('activate_prayer at priority 1 resolves before combat at priority 5', () => {
    const player = createActorStore();
    const bot = createActorStore();
    const q = new ActionQueue();
    const { activate, deactivate } = makePrayerHandlers();
    q.register('activate_prayer', activate);
    q.register('deactivate_prayer', deactivate);

    q.enqueue({
      actor: 'player',
      type: 'activate_prayer',
      payload: { prayerId: 'piety' }
    });
    q.flushTick({ player, bot, game: useGameStore, tick: 1 });
    expect(player.getState().activePrayers).toEqual(['piety']);
  });

  it('queued conflicting prayers resolve to the last enqueued one (FIFO within P1)', () => {
    const player = createActorStore();
    const bot = createActorStore();
    const q = new ActionQueue();
    const { activate } = makePrayerHandlers();
    q.register('activate_prayer', activate);

    q.enqueue({
      actor: 'player',
      type: 'activate_prayer',
      payload: { prayerId: 'chivalry' }
    });
    q.enqueue({
      actor: 'player',
      type: 'activate_prayer',
      payload: { prayerId: 'piety' }
    });
    q.flushTick({ player, bot });
    expect(player.getState().activePrayers).toEqual(['piety']);
  });

  it('failed activation logs the reason without throwing', () => {
    const player = createActorStore({ levels: { prayer: 50 } });
    const bot = createActorStore();
    const q = new ActionQueue();
    const { activate } = makePrayerHandlers();
    q.register('activate_prayer', activate);

    q.enqueue({
      actor: 'player',
      type: 'activate_prayer',
      payload: { prayerId: 'piety' }
    });
    expect(() =>
      q.flushTick({ player, bot, game: useGameStore, tick: 1 })
    ).not.toThrow();
    expect(player.getState().activePrayers).toEqual([]);
    expect(
      useGameStore.getState().combatLog.some(l => /level_too_low/.test(l))
    ).toBe(true);
  });
});
