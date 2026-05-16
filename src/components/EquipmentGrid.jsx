import items from '../data/items.json';
import { EQUIPMENT_SLOTS } from '../engine/Bonuses.js';

const SLOT_LABELS = {
  weapon: 'Weapon',
  shield: 'Shield',
  helmet: 'Helm',
  cape: 'Cape',
  amulet: 'Ammy',
  ammo: 'Ammo',
  body: 'Body',
  legs: 'Legs',
  gloves: 'Glove',
  boots: 'Boot',
  ring: 'Ring'
};

function shortName(itemId) {
  if (!itemId) return '—';
  const n = items[itemId]?.name ?? itemId;
  return n.length > 12 ? n.slice(0, 11) + '…' : n;
}

export function EquipmentGrid({ store, onUnequip }) {
  const eq = store(s => s.equipment);
  return (
    <div className="p-2 bg-osrs-border/70 rounded">
      <div className="text-xs mb-1 opacity-80">Equipment</div>
      <div className="grid grid-cols-3 gap-1">
        {EQUIPMENT_SLOTS.map(slot => {
          const id = eq[slot];
          return (
            <button
              key={slot}
              onClick={() => id && onUnequip && onUnequip(slot)}
              disabled={!id}
              title={id ? `unequip ${id}` : 'empty'}
              className={`h-12 text-[10px] rounded border border-osrs-border flex flex-col items-center justify-center px-1 ${
                id ? 'bg-osrs-bg hover:bg-osrs-red/40 cursor-pointer' : 'bg-osrs-bg/30'
              }`}
            >
              <div className="opacity-60 text-[9px]">{SLOT_LABELS[slot]}</div>
              <div className="truncate w-full text-center">{shortName(id)}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
