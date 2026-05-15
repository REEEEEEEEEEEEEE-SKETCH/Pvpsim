import { useEffect, useState } from 'react';
import { tickEngine } from '../engine/TickEngine.js';

export function useTick(engine = tickEngine) {
  const [tick, setTick] = useState(engine.tickCount);

  useEffect(() => {
    const unsubscribe = engine.subscribe(setTick);
    return unsubscribe;
  }, [engine]);

  return tick;
}
