import { useEffect, useMemo, useState } from 'react';
import { tickEngine } from './engine/TickEngine.js';
import { useTick } from './hooks/useTick.js';
import { usePlayerStore } from './store/playerStore.js';
import { useBotStore } from './store/botStore.js';
import { useGameStore } from './store/gameStore.js';
import { setupActionQueue, runOneTick } from './engine/GameLoop.js';
import { togglePrayer } from './engine/PrayerSystem.js';
import { applyLoadout } from './store/loadoutStore.js';
import items from './data/items.json';
import potions from './data/potions.json';

import { Controls } from './components/Controls.jsx';
import { ActorPanel } from './components/ActorPanel.jsx';
import { PrayerBook } from './components/PrayerBook.jsx';
import { Inventory } from './components/Inventory.jsx';
import { EquipmentGrid } from './components/EquipmentGrid.jsx';
import { CombatLog } from './components/CombatLog.jsx';
import { LoadoutPicker } from './components/LoadoutPicker.jsx';
import { AttackStyleSelector } from './components/AttackStyleSelector.jsx';
import { SpecButton } from './components/SpecButton.jsx';

function inventoryActionFor(itemId) {
  const it = items[itemId];
  if (it?.consumable?.type === 'food') return { type: 'eat', payload: { itemId } };
  if (potions[itemId]) return { type: 'drink', payload: { potionId: itemId } };
  if (it?.slot === 'weapon') return { type: 'switch_equipment', payload: { slot: 'weapon', itemId } };
  return null;
}

export default function App() {
  const tick = useTick();
  const isRunning = useGameStore(s => s.isRunning);
  const isPaused = useGameStore(s => s.isPaused);
  const difficulty = useGameStore(s => s.difficulty);
  const setRunning = useGameStore(s => s.setRunning);
  const setPaused = useGameStore(s => s.setPaused);
  const setDifficulty = useGameStore(s => s.setDifficulty);
  const resetGame = useGameStore(s => s.reset);

  const [playerLoadout, setPlayerLoadout] = useState(null);
  const [botLoadout, setBotLoadout] = useState(null);

  const queue = useMemo(() => setupActionQueue(), []);

  // Per-tick game loop subscription
  useEffect(() => {
    const unsubscribe = tickEngine.subscribe(currentTick => {
      runOneTick({
        player: usePlayerStore,
        bot: useBotStore,
        game: useGameStore,
        queue,
        tick: currentTick,
        difficulty: useGameStore.getState().difficulty,
        autoPlayer: true,
        autoBot: true
      });
    });
    return unsubscribe;
  }, [queue]);

  // ── Lifecycle handlers ──────────────────────────────────────────────────
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
    queue.clear();
    resetGame();
    if (playerLoadout) applyLoadout(usePlayerStore, playerLoadout);
    if (botLoadout) applyLoadout(useBotStore, botLoadout);
    usePlayerStore.getState().setHP(99);
    usePlayerStore.getState().setPrayer(99);
    usePlayerStore.getState().setSpec(100);
    useBotStore.getState().setHP(99);
    useBotStore.getState().setPrayer(99);
    useBotStore.getState().setSpec(100);
  };

  // ── Player input handlers ───────────────────────────────────────────────
  const onTogglePlayerPrayer = id => togglePrayer(usePlayerStore, id);
  const onPlayerStyle = style => usePlayerStore.getState().setAttackStyle(style);
  const onPlayerSpec = weapon =>
    queue.enqueue({ actor: 'player', type: 'toggle_spec', payload: { specId: weapon } });
  const onPlayerInventory = id => {
    const action = inventoryActionFor(id);
    if (action) queue.enqueue({ actor: 'player', ...action });
  };
  const onPlayerUnequip = slot =>
    queue.enqueue({ actor: 'player', type: 'switch_equipment', payload: { slot, itemId: null } });

  // ── Loadout selection ───────────────────────────────────────────────────
  const onPickPlayerLoadout = id => {
    setPlayerLoadout(id);
    if (id) applyLoadout(usePlayerStore, id);
  };
  const onPickBotLoadout = id => {
    setBotLoadout(id);
    if (id) applyLoadout(useBotStore, id);
  };

  return (
    <div className="min-h-screen p-4 text-osrs-yellow font-osrs">
      <h1 className="text-2xl mb-2 font-bold">OSRS PvP Simulator</h1>
      <p className="mb-4 text-xs opacity-70">
        Tick-perfect 600 ms engine · Prayer protect = 0.6× · Combo eat · Gmaul stacking
      </p>

      <Controls
        tick={tick}
        isRunning={isRunning}
        isPaused={isPaused}
        difficulty={difficulty}
        onStart={onStart}
        onPause={onPause}
        onResume={onResume}
        onReset={onReset}
        onSetDifficulty={setDifficulty}
      />

      <div className="flex flex-wrap gap-4 mt-4">
        <LoadoutPicker label="Player loadout" value={playerLoadout} onChange={onPickPlayerLoadout} />
        <LoadoutPicker label="Bot loadout" value={botLoadout} onChange={onPickBotLoadout} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        {/* ── Player column ──────────────────────────────────────────────── */}
        <div className="space-y-3">
          <ActorPanel store={usePlayerStore} title="Player (you)" accent="border-osrs-green" />
          <div className="grid grid-cols-2 gap-3">
            <EquipmentGrid store={usePlayerStore} onUnequip={onPlayerUnequip} />
            <Inventory store={usePlayerStore} onClick={onPlayerInventory} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <AttackStyleSelector store={usePlayerStore} onChange={onPlayerStyle} />
            <SpecButton store={usePlayerStore} onSpec={onPlayerSpec} />
          </div>
          <PrayerBook store={usePlayerStore} onToggle={onTogglePlayerPrayer} />
        </div>

        {/* ── Bot column ─────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <ActorPanel store={useBotStore} title="Bot (AI)" accent="border-osrs-red" />
          <div className="grid grid-cols-2 gap-3">
            <EquipmentGrid store={useBotStore} />
            <Inventory store={useBotStore} />
          </div>
          <CombatLog store={useGameStore} />
        </div>
      </div>
    </div>
  );
}
