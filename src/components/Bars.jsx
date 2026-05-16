export function HpBar({ hp, max }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (hp / max) * 100)) : 0;
  const color = pct > 50 ? 'bg-osrs-green' : pct > 25 ? 'bg-osrs-yellow' : 'bg-osrs-red';
  return (
    <div className="relative h-4 w-full bg-black/40 rounded overflow-hidden border border-osrs-border">
      <div className={`absolute inset-y-0 left-0 ${color} transition-all`}
           style={{ width: `${pct}%` }} />
      <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white drop-shadow">
        HP {hp}/{max}
      </div>
    </div>
  );
}

export function PrayerBar({ prayer, max }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (prayer / max) * 100)) : 0;
  return (
    <div className="relative h-3 w-full bg-black/40 rounded overflow-hidden border border-osrs-border">
      <div className="absolute inset-y-0 left-0 bg-cyan-300 transition-all"
           style={{ width: `${pct}%` }} />
      <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-black">
        Prayer {prayer}/{max}
      </div>
    </div>
  );
}

export function SpecBar({ spec }) {
  const pct = Math.min(100, Math.max(0, spec));
  return (
    <div className="relative h-3 w-full bg-black/40 rounded overflow-hidden border border-osrs-border">
      <div className="absolute inset-y-0 left-0 bg-osrs-yellow transition-all"
           style={{ width: `${pct}%` }} />
      <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-black">
        Spec {Math.floor(spec)}%
      </div>
    </div>
  );
}
