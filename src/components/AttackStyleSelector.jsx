import items from '../data/items.json';

const MELEE_STYLES = ['accurate', 'aggressive', 'controlled', 'defensive'];
const RANGED_STYLES = ['accurate', 'rapid', 'longrange'];
const MAGIC_STYLES = ['accurate', 'longrange'];

function stylesForWeapon(weaponId) {
  if (!weaponId) return MELEE_STYLES;
  const type = items[weaponId]?.default_attack_type;
  if (type === 'ranged') return RANGED_STYLES;
  if (type === 'magic') return MAGIC_STYLES;
  return MELEE_STYLES;
}

export function AttackStyleSelector({ store, onChange }) {
  const style = store(s => s.attackStyle);
  const weapon = store(s => s.equipment.weapon);
  const available = stylesForWeapon(weapon);

  return (
    <div className="p-2 bg-osrs-border/70 rounded">
      <div className="text-xs mb-1 opacity-80">Attack style</div>
      <div className="grid grid-cols-2 gap-1">
        {available.map(s => (
          <button
            key={s}
            onClick={() => onChange(s)}
            className={`text-xs px-2 py-1 rounded border ${
              style === s
                ? 'bg-osrs-yellow text-black border-osrs-yellow font-bold'
                : 'bg-osrs-bg border-osrs-border hover:bg-osrs-border'
            }`}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
