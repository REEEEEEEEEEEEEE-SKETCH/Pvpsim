export function Controls({
  tick,
  isRunning,
  isPaused,
  difficulty,
  onStart,
  onPause,
  onResume,
  onReset,
  onSetDifficulty
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 p-3 bg-osrs-border/70 rounded">
      <div className="text-xl font-bold">Tick: {tick}</div>

      <div className="flex gap-2">
        {!isRunning && (
          <button className="px-3 py-1 bg-osrs-green text-black rounded font-bold" onClick={onStart}>
            Start
          </button>
        )}
        {isRunning && !isPaused && (
          <button className="px-3 py-1 bg-osrs-yellow text-black rounded font-bold" onClick={onPause}>
            Pause
          </button>
        )}
        {isRunning && isPaused && (
          <button className="px-3 py-1 bg-osrs-green text-black rounded font-bold" onClick={onResume}>
            Resume
          </button>
        )}
        <button className="px-3 py-1 bg-osrs-red text-white rounded font-bold" onClick={onReset}>
          Reset
        </button>
      </div>

      <label className="flex items-center gap-2 text-sm">
        Difficulty:
        <select
          value={difficulty}
          onChange={e => onSetDifficulty(e.target.value)}
          className="bg-osrs-bg border border-osrs-border rounded px-2 py-1 text-osrs-yellow"
        >
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </label>
    </div>
  );
}
