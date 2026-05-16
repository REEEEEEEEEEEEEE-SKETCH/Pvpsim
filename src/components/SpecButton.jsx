import specials from '../data/specials.json';

export function SpecButton({ store, onSpec }) {
  const weapon = store(s => s.equipment.weapon);
  const specEnergy = store(s => s.current.specEnergy);
  const spec = weapon ? specials[weapon] : null;

  const canSpec = spec && specEnergy >= spec.energy_cost;

  return (
    <div className="p-2 bg-osrs-border/70 rounded">
      <div className="text-xs mb-1 opacity-80">Special attack</div>
      {!spec && <div className="text-xs opacity-60 italic">No spec for this weapon</div>}
      {spec && (
        <button
          onClick={() => canSpec && onSpec(weapon)}
          disabled={!canSpec}
          className={`w-full px-2 py-2 rounded border ${
            canSpec
              ? 'bg-osrs-yellow text-black border-osrs-yellow font-bold hover:opacity-90'
              : 'bg-osrs-bg/50 border-osrs-border opacity-50 cursor-not-allowed'
          }`}
          title={`${spec.name} — ${spec.energy_cost}%`}
        >
          {spec.name} ({spec.energy_cost}%)
        </button>
      )}
    </div>
  );
}
