const TICK_RATE_MS = 600;

export class TickEngine {
  constructor(tickRate = TICK_RATE_MS) {
    this.tickCount = 0;
    this.tickRate = tickRate;
    this.intervalId = null;
    this.subscribers = [];
    this.paused = false;
  }

  start() {
    if (this.intervalId !== null) return;
    this.intervalId = setInterval(() => this._fire(), this.tickRate);
  }

  stop() {
    if (this.intervalId === null) return;
    clearInterval(this.intervalId);
    this.intervalId = null;
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
  }

  reset() {
    this.tickCount = 0;
  }

  subscribe(callback) {
    this.subscribers.push(callback);
    return () => {
      const i = this.subscribers.indexOf(callback);
      if (i >= 0) this.subscribers.splice(i, 1);
    };
  }

  _fire() {
    if (this.paused) return;
    this.tickCount += 1;
    for (const cb of this.subscribers) cb(this.tickCount);
  }
}

export const tickEngine = new TickEngine();
