import { useState } from 'react';
import items from './data/items.json';
import prayers from './data/prayers.json';
import potions from './data/potions.json';
import specials from './data/specials.json';
import { tickEngine } from './engine/TickEngine.js';
import { useTick } from './hooks/useTick.js';

export default function App() {
  const tick = useTick();
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);

  const onStart = () => {
    tickEngine.start();
    setRunning(true);
    setPaused(false);
  };
  const onPause = () => {
    tickEngine.pause();
    setPaused(true);
  };
  const onResume = () => {
    tickEngine.resume();
    setPaused(false);
  };
  const onReset = () => {
    tickEngine.stop();
    tickEngine.reset();
    setRunning(false);
    setPaused(false);
  };

  return (
    <div className="p-6 text-osrs-yellow font-osrs">
      <h1 className="text-2xl mb-2">OSRS PvP Simulator</h1>
      <p className="mb-4 text-sm opacity-80">
        Phase 2 — tick engine live. Combat lands Phase 7+.
      </p>

      <div className="mb-6 p-4 bg-osrs-border rounded inline-block">
        <div className="text-xl mb-3">Tick: {tick}</div>
        <div className="flex gap-2">
          {!running && (
            <button className="px-3 py-1 bg-osrs-green text-black rounded" onClick={onStart}>
              Start
            </button>
          )}
          {running && !paused && (
            <button className="px-3 py-1 bg-osrs-yellow text-black rounded" onClick={onPause}>
              Pause
            </button>
          )}
          {running && paused && (
            <button className="px-3 py-1 bg-osrs-green text-black rounded" onClick={onResume}>
              Resume
            </button>
          )}
          <button className="px-3 py-1 bg-osrs-red text-white rounded" onClick={onReset}>
            Reset
          </button>
        </div>
      </div>

      <ul className="text-sm">
        <li>items.json: {Object.keys(items).length} entries</li>
        <li>prayers.json: {Object.keys(prayers).length} entries</li>
        <li>potions.json: {Object.keys(potions).length} entries</li>
        <li>specials.json: {Object.keys(specials).length} entries</li>
      </ul>
    </div>
  );
}
