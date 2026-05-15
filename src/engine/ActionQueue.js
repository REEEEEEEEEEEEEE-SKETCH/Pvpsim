export const PRIORITIES = Object.freeze({
  activate_prayer: 1,
  deactivate_prayer: 1,
  switch_equipment: 2,
  toggle_spec: 3,
  eat: 4,
  drink: 4,
  attack: 5,
  move: 6
});

const ACTOR_TYPES = new Set(['player', 'bot']);

export class ActionQueue {
  constructor() {
    this.queue = [];
    this.handlers = new Map();
  }

  enqueue(action) {
    if (!action || typeof action !== 'object') {
      throw new Error('Action must be an object');
    }
    if (!ACTOR_TYPES.has(action.actor)) {
      throw new Error(`Action.actor must be 'player' or 'bot', got: ${action.actor}`);
    }
    if (!(action.type in PRIORITIES)) {
      throw new Error(`Unknown action.type: ${action.type}`);
    }
    this.queue.push(action);
  }

  register(type, handler) {
    if (!(type in PRIORITIES)) {
      throw new Error(`Cannot register handler for unknown action type: ${type}`);
    }
    this.handlers.set(type, handler);
  }

  flushTick(context = {}) {
    if (this.queue.length === 0) return;
    // Snapshot + clear *before* invoking handlers, so a handler that enqueues
    // a follow-up lands in the next tick, not this one. Array.prototype.sort
    // is stable in modern V8, so same-priority actions resolve in enqueue
    // order — the closest thing the spec offers to "simultaneity within
    // a priority level" without full snapshot-write semantics (those land
    // inside the combat handler in Phase 7).
    const sorted = this.queue
      .slice()
      .sort((a, b) => PRIORITIES[a.type] - PRIORITIES[b.type]);
    this.queue = [];
    for (const action of sorted) {
      const handler = this.handlers.get(action.type);
      if (handler) handler(action, context);
    }
  }

  clear() {
    this.queue = [];
  }

  get size() {
    return this.queue.length;
  }
}

export const actionQueue = new ActionQueue();
