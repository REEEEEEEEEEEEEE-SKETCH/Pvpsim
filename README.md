# OSRS PvP Simulator

A browser-based, single-player Old School RuneScape PvP simulator with a tick-perfect engine (600ms ticks), authentic OSRS combat math, and an AI bot capable of prayer switching, combo eating, and KO combos.

Private project — no auth, no networking, no public deployment.

## Running

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # vitest (added in later phases)
```

## Stack

- React 18 + Zustand for state
- Vite bundler
- Tailwind CSS for layout, custom OSRS theme
- HTML5 Canvas for hit splats / HP bars
- Static JSON data; localStorage for loadout presets

## Build phases

| Phase | Module                  | Status |
|-------|-------------------------|--------|
| 1     | Scaffold + data layer   | done   |
| 2     | TickEngine              | todo   |
| 3     | ActionQueue (priority)  | todo   |
| 4     | Stats & Equipment       | todo   |
| 5     | Accuracy Roll           | todo   |
| 6     | Damage Roll             | todo   |
| 7     | Combat Engine           | todo   |
| 8     | Prayer System           | todo   |
| 9     | Consumables             | todo   |
| 10    | Special Attacks         | todo   |
| 11    | AI Bot                  | todo   |
| 12    | UI Components           | todo   |
| 13    | Loadout Presets         | todo   |
| 14    | Integration & Polish    | todo   |
| 15    | Test Suite              | todo   |

## Mechanics quick-reference

- **Tick** = 600 ms. Single `setInterval` in `TickEngine`. Everything else subscribes.
- **Action priority within a tick:** Prayer → Equip → Spec → Consume → Combat → Move.
- **Protection prayers in PvP** = **0.6× damage** (40% reduction), not a full block.
- **Combo eat:** primary food + Karambwan same tick. Larger eat-delay wins (shark+karambwan → 3 ticks, +38 HP).
- **Tick eat:** food (priority 4) resolves before damage (priority 5) on the same tick.
- **Gmaul stacking:** Granite Maul spec adds 0 attack delay, enabling AGS → switch → Gmaul same tick via the priority pipeline.

## Layout

See `src/` for engine modules, stores, components, and the four seed data files in `src/data/`.
