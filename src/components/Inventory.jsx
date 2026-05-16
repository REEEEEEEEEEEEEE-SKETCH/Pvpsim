import items from '../data/items.json';
import potions from '../data/potions.json';

function shortLabel(itemId) {
  if (!itemId) return '';
  const it = items[itemId];
  const name = it?.name ?? potions[itemId]?.name ?? itemId;
  return name.length > 10 ? name.slice(0, 9) + '…' : name;
}

function itemKind(itemId) {
  const it = items[itemId];
  if (it?.consumable?.type === 'food') return 'food';
  if (potions[itemId]) return 'potion';
  if (it?.slot === 'weapon') return 'weapon';
  return 'other';
}

export function Inventory({ store, onClick }) {
  const inv = store(s => s.inventory);
  const slots = Array.from({ length: 28 }, (_, i) => inv[i] ?? null);

  return (
    <div className="p-2 bg-osrs-border/70 rounded">
      <div className="text-xs mb-1 opacity-80">Inventory ({inv.length}/28)</div>
      <div className="grid grid-cols-4 gap-1">
        {slots.map((id, i) => {
          const kind = id ? itemKind(id) : null;
          const tint =
            kind === 'food' ? 'bg-osrs-green/30 hover:bg-osrs-green/50' :
            kind === 'potion' ? 'bg-cyan-700/30 hover:bg-cyan-700/50' :
            kind === 'weapon' ? 'bg-osrs-yellow/30 hover:bg-osrs-yellow/50' :
            id ? 'bg-osrs-bg hover:bg-osrs-border' : 'bg-osrs-bg/30';
          return (
            <button
              key={i}
              onClick={() => id && onClick && onClick(id, i, kind)}
              className={`h-10 text-[10px] rounded border border-osrs-border ${tint} ${id ? 'cursor-pointer' : 'cursor-default'}`}
              title={id || 'empty'}
              disabled={!id}
            >
              {shortLabel(id)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
