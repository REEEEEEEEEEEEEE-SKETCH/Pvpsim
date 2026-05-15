import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TickEngine } from '../engine/TickEngine.js';

describe('TickEngine', () => {
  let engine;

  beforeEach(() => {
    vi.useFakeTimers();
    engine = new TickEngine(600);
  });

  afterEach(() => {
    engine.stop();
    vi.useRealTimers();
  });

  it('fires subscribers once per 600ms tick', () => {
    const sub = vi.fn();
    engine.subscribe(sub);
    engine.start();

    vi.advanceTimersByTime(600);
    expect(sub).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(600);
    expect(sub).toHaveBeenCalledTimes(2);
  });

  it('increments tickCount by 1 per tick', () => {
    engine.start();
    expect(engine.tickCount).toBe(0);

    vi.advanceTimersByTime(600);
    expect(engine.tickCount).toBe(1);

    vi.advanceTimersByTime(600 * 4);
    expect(engine.tickCount).toBe(5);
  });

  it('passes current tickCount to subscriber', () => {
    const ticks = [];
    engine.subscribe(t => ticks.push(t));
    engine.start();

    vi.advanceTimersByTime(600 * 3);
    expect(ticks).toEqual([1, 2, 3]);
  });

  it('pause stops firing but keeps count intact', () => {
    const sub = vi.fn();
    engine.subscribe(sub);
    engine.start();

    vi.advanceTimersByTime(600 * 2);
    expect(engine.tickCount).toBe(2);
    expect(sub).toHaveBeenCalledTimes(2);

    engine.pause();
    vi.advanceTimersByTime(600 * 5);
    expect(engine.tickCount).toBe(2);
    expect(sub).toHaveBeenCalledTimes(2);

    engine.resume();
    vi.advanceTimersByTime(600);
    expect(engine.tickCount).toBe(3);
    expect(sub).toHaveBeenCalledTimes(3);
  });

  it('unsubscribe removes a single callback without affecting others', () => {
    const subA = vi.fn();
    const subB = vi.fn();
    const unsubA = engine.subscribe(subA);
    engine.subscribe(subB);
    engine.start();

    vi.advanceTimersByTime(600);
    expect(subA).toHaveBeenCalledTimes(1);
    expect(subB).toHaveBeenCalledTimes(1);

    unsubA();
    vi.advanceTimersByTime(600);
    expect(subA).toHaveBeenCalledTimes(1);
    expect(subB).toHaveBeenCalledTimes(2);
  });

  it('stop halts ticking, restart resumes from current count', () => {
    engine.start();
    vi.advanceTimersByTime(600 * 3);
    expect(engine.tickCount).toBe(3);

    engine.stop();
    vi.advanceTimersByTime(600 * 5);
    expect(engine.tickCount).toBe(3);

    engine.start();
    vi.advanceTimersByTime(600 * 2);
    expect(engine.tickCount).toBe(5);
  });

  it('reset zeros tickCount', () => {
    engine.start();
    vi.advanceTimersByTime(600 * 7);
    expect(engine.tickCount).toBe(7);
    engine.reset();
    expect(engine.tickCount).toBe(0);
  });

  it('calling start twice does not create duplicate intervals', () => {
    const sub = vi.fn();
    engine.subscribe(sub);
    engine.start();
    engine.start();

    vi.advanceTimersByTime(600);
    expect(sub).toHaveBeenCalledTimes(1);
  });
});
