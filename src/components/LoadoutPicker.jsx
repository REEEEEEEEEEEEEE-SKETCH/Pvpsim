import { listPresetLoadouts } from '../store/loadoutStore.js';

export function LoadoutPicker({ label, value, onChange }) {
  const presets = listPresetLoadouts();
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="opacity-80">{label}</span>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        className="bg-osrs-bg border border-osrs-border rounded px-2 py-1 text-osrs-yellow"
      >
        <option value="">— select preset —</option>
        {presets.map(p => (
          <option key={p.id} value={p.id} title={p.description}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
