import { describe, it, expect, beforeEach } from 'vitest';
import { ActionQueue, PRIORITIES } from '../engine/ActionQueue.js';

describe('ActionQueue — priority ordering', () => {
  let q;
  beforeEach(() => {
    q = new ActionQueue();
  });

  it('resolves actions in canonical priority order regardless of enqueue order', () => {
    const order = [];
    for (const type of Object.keys(PRIORITIES)) {
      q.register(type, action => order.push(action.type));
    }

    q.enqueue({ actor: 'player', type: 'move' });
    q.enqueue({ actor: 'player', type: 'attack' });
    q.enqueue({ actor: 'player', type: 'eat' });
    q.enqueue({ actor: 'player', type: 'toggle_spec' });
    q.enqueue({ actor: 'player', type: 'switch_equipment' });
    q.enqueue({ actor: 'player', type: 'activate_prayer' });
    q.flushTick();

    expect(order).toEqual([
      'activate_prayer',
      'switch_equipment',
      'toggle_spec',
      'eat',
      'attack',
      'move'
    ]);
  });

  it('preserves enqueue order within the same priority level', () => {
    const order = [];
    q.register('attack', a => order.push(`${a.actor}:${a.id}`));

    q.enqueue({ actor: 'player', type: 'attack', id: 1 });
    q.enqueue({ actor: 'bot', type: 'attack', id: 2 });
    q.enqueue({ actor: 'player', type: 'attack', id: 3 });
    q.flushTick();

    expect(order).toEqual(['player:1', 'bot:2', 'player:3']);
  });

  it('clears the queue after flushing', () => {
    q.register('attack', () => {});
    q.enqueue({ actor: 'player', type: 'attack' });
    expect(q.size).toBe(1);
    q.flushTick();
    expect(q.size).toBe(0);
  });

  it('flushing an empty queue is a no-op', () => {
    expect(() => q.flushTick()).not.toThrow();
  });

  it('handler-less action types do not crash', () => {
    q.enqueue({ actor: 'player', type: 'attack' });
    expect(() => q.flushTick()).not.toThrow();
  });

  it('handler enqueues during flush land in next tick, not current', () => {
    const order = [];
    q.register('attack', (a, ctx) => {
      order.push(`attack:${a.id}`);
      ctx.q.enqueue({ actor: 'player', type: 'move', id: 99 });
    });
    q.register('move', a => order.push(`move:${a.id}`));

    q.enqueue({ actor: 'player', type: 'attack', id: 1 });
    q.flushTick({ q });

    expect(order).toEqual(['attack:1']);
    expect(q.size).toBe(1);

    q.flushTick({ q });
    expect(order).toEqual(['attack:1', 'move:99']);
  });

  it('rejects unknown action types on enqueue', () => {
    expect(() => q.enqueue({ actor: 'player', type: 'teleport' })).toThrow(/Unknown action.type/);
  });

  it('rejects invalid actors on enqueue', () => {
    expect(() => q.enqueue({ actor: 'mod', type: 'attack' })).toThrow(/'player' or 'bot'/);
  });
});

describe('ActionQueue — acceptance criteria', () => {
  let q;
  let state;

  beforeEach(() => {
    q = new ActionQueue();
    state = {
      player: {
        hp: 25,
        equipment: { weapon: { name: 'whip', meleeStrength: 82, maxHit: 20 } }
      },
      bot: {
        hp: 99,
        equipment: { weapon: { name: 'whip', meleeStrength: 82, maxHit: 20 } }
      },
      log: []
    };

    // P4 — eat
    q.register('eat', (a, ctx) => {
      ctx[a.actor].hp += a.payload.heal;
      ctx.log.push(`${a.actor} ate +${a.payload.heal} -> hp=${ctx[a.actor].hp}`);
    });

    // P2 — switch_equipment
    q.register('switch_equipment', (a, ctx) => {
      ctx[a.actor].equipment.weapon = a.payload.weapon;
      ctx.log.push(`${a.actor} switched weapon -> ${a.payload.weapon.name}`);
    });

    // P5 — attack: reads attacker's *current* weapon then writes defender hp.
    q.register('attack', (a, ctx) => {
      const attacker = ctx[a.actor];
      const defender = ctx[a.actor === 'player' ? 'bot' : 'player'];
      const damage = a.payload?.damageOverride ?? attacker.equipment.weapon.maxHit;
      defender.hp -= damage;
      ctx.log.push(
        `${a.actor} hit ${damage} with ${attacker.equipment.weapon.name} -> ` +
          `defender hp=${defender.hp}`
      );
    });
  });

  // Acceptance #1
  it('TICK EAT — eat (P4) resolves before incoming combat (P5), player survives lethal hit', () => {
    // Bot deals 30 damage on a tick; player at 25 HP would die.
    // Player queues an eat for +20 on the same tick.
    q.enqueue({ actor: 'bot', type: 'attack', payload: { damageOverride: 30 } });
    q.enqueue({ actor: 'player', type: 'eat', payload: { heal: 20 } });
    q.flushTick(state);

    // Expected: 25 + 20 - 30 = 15. Player lives because eat at P4 runs before attack at P5.
    expect(state.player.hp).toBe(15);
    expect(state.log[0]).toMatch(/player ate \+20/);
    expect(state.log[1]).toMatch(/bot hit 30/);
  });

  // Acceptance #2
  it('SWITCH BEFORE ATTACK — equipment swap (P2) resolves before attack (P5) reads the weapon', () => {
    const ags = { name: 'armadyl_godsword', meleeStrength: 132, maxHit: 36 };

    // Enqueue attack FIRST, then weapon switch — proves priority, not order.
    q.enqueue({ actor: 'player', type: 'attack' });
    q.enqueue({ actor: 'player', type: 'switch_equipment', payload: { weapon: ags } });
    q.flushTick(state);

    // Attack must have used AGS (max hit 36), not whip (max hit 20).
    expect(state.bot.hp).toBe(99 - 36);
    expect(state.log[0]).toMatch(/switched weapon -> armadyl_godsword/);
    expect(state.log[1]).toMatch(/hit 36 with armadyl_godsword/);
    expect(state.player.equipment.weapon.name).toBe('armadyl_godsword');
  });
});
