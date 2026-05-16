import prayers from '../data/prayers.json';

const GROUPS = ['defence', 'strength', 'attack', 'overhead', 'ranged', 'magic', 'combo'];

export function PrayerBook({ store, onToggle }) {
  const active = store(s => s.activePrayers);
  const prayerLvl = store(s => s.levels.prayer);
  const prayerPts = store(s => s.current.prayer);

  const byGroup = GROUPS.map(group => ({
    group,
    entries: Object.entries(prayers).filter(([, p]) => p.group === group)
  })).filter(g => g.entries.length > 0);

  return (
    <div className="p-2 bg-osrs-border/70 rounded">
      <div className="text-xs mb-1 opacity-80">
        Prayer book ({prayerPts} pts available)
      </div>
      <div className="space-y-2">
        {byGroup.map(({ group, entries }) => (
          <div key={group}>
            <div className="text-[10px] uppercase opacity-60">{group}</div>
            <div className="grid grid-cols-3 gap-1">
              {entries.map(([id, p]) => {
                const isActive = active.includes(id);
                const tooLow = prayerLvl < p.level;
                const noPts = prayerPts <= 0;
                const disabled = tooLow || noPts;
                return (
                  <button
                    key={id}
                    onClick={() => !disabled && onToggle(id)}
                    title={`${p.name} · lv ${p.level} · ${p.drain_per_min}/min`}
                    disabled={disabled}
                    className={`text-[10px] px-1 py-1 rounded border truncate ${
                      isActive
                        ? 'bg-osrs-yellow text-black border-osrs-yellow font-bold'
                        : disabled
                          ? 'bg-osrs-bg/50 border-osrs-border opacity-40 cursor-not-allowed'
                          : 'bg-osrs-bg border-osrs-border hover:bg-osrs-border'
                    }`}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
