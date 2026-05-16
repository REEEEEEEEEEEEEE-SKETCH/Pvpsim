import { useEffect, useRef } from 'react';

export function CombatLog({ store }) {
  const lines = store(s => s.combatLog);
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);

  return (
    <div className="p-2 bg-osrs-border/70 rounded">
      <div className="text-xs mb-1 opacity-80">Combat log</div>
      <div
        ref={ref}
        className="h-40 overflow-y-auto bg-black/40 rounded p-2 text-[11px] font-mono space-y-0.5"
      >
        {lines.length === 0 && <div className="opacity-50 italic">(empty — start the fight)</div>}
        {lines.map((line, i) => (
          <div key={i} className="leading-tight">{line}</div>
        ))}
      </div>
    </div>
  );
}
