import { HpBar, PrayerBar, SpecBar } from './Bars.jsx';

export function ActorPanel({ store, title, accent = 'border-osrs-border' }) {
  const state = store();
  const { current, levels, activePrayers, attackStyle, attackCooldown, eatCooldown, equipment, boosts } = state;

  return (
    <div className={`border-2 ${accent} p-3 rounded bg-osrs-bg/80`}>
      <h2 className="text-lg mb-2 font-bold">{title}</h2>
      <div className="space-y-2">
        <HpBar hp={current.hp} max={levels.hitpoints} />
        <PrayerBar prayer={current.prayer} max={levels.prayer} />
        <SpecBar spec={current.specEnergy} />
      </div>
      <div className="mt-3 text-xs space-y-0.5">
        <div>Weapon: <span className="text-white">{equipment.weapon ?? '—'}</span></div>
        <div>Style: <span className="text-white">{attackStyle}</span></div>
        <div>Atk cd: {attackCooldown} · Eat cd: {eatCooldown}</div>
        <div>Prayers: <span className="text-white">{activePrayers.length ? activePrayers.join(', ') : 'none'}</span></div>
        <div className="opacity-70">
          Boosts: a{boosts.attack >= 0 ? '+' : ''}{boosts.attack} s{boosts.strength >= 0 ? '+' : ''}{boosts.strength} d{boosts.defence >= 0 ? '+' : ''}{boosts.defence} r{boosts.ranged >= 0 ? '+' : ''}{boosts.ranged} m{boosts.magic >= 0 ? '+' : ''}{boosts.magic}
        </div>
      </div>
    </div>
  );
}
