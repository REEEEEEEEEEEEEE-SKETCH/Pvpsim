# OSRS PvP Simulator

A browser-based, single-player Old School RuneScape PvP simulator with a tick-perfect engine (600ms ticks), authentic OSRS combat math, and an AI bot capable of prayer switching, combo eating, and KO combos.

Private project — no auth, no networking, no public deployment.

## Running

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # vitest — 356 tests
npm run build    # production bundle to dist/
```

## Stack

- React 18 + Zustand for state
- Vite bundler
- Tailwind CSS for layout, custom OSRS theme
- Static JSON data; localStorage for custom loadout presets

## Build phases

| Phase | Module                  | Status | Module location                                       |
|-------|-------------------------|--------|-------------------------------------------------------|
| 1     | Scaffold + data layer   | done   | `src/data/{items,prayers,potions,specials}.json`      |
| 2     | TickEngine              | done   | `src/engine/TickEngine.js` + `src/hooks/useTick.js`   |
| 3     | ActionQueue (priority)  | done   | `src/engine/ActionQueue.js`                           |
| 4     | Stats & Equipment       | done   | `src/engine/Bonuses.js` + `src/store/actorStore.js`   |
| 5     | Accuracy Roll           | done   | `src/engine/AccuracyRoll.js`                          |
| 6     | Damage Roll             | done   | `src/engine/DamageRoll.js`                            |
| 7     | Combat Engine           | done   | `src/engine/CombatEngine.js`                          |
| 8     | Prayer System           | done   | `src/engine/PrayerSystem.js`                          |
| 9     | Consumables             | done   | `src/engine/ConsumableSystem.js`                      |
| 10    | Special Attacks         | done   | `src/engine/SpecialAttackSystem.js`                   |
| 11    | AI Bot                  | done   | `src/engine/AIBot.js`                                 |
| 12    | UI Components           | done   | `src/components/*.jsx`                                |
| 13    | Loadout Presets         | done   | `src/data/loadouts.json` + `src/store/loadoutStore.js`|
| 14    | Integration & Polish    | done   | `src/engine/GameLoop.js` + `src/App.jsx`              |
| 15    | Test Suite              | done   | `src/__tests__/{acceptance,properties}.test.js`       |

## Mechanics quick-reference

- **Tick** = 600 ms. Single `setInterval` in `TickEngine`. Everything else subscribes.
- **Action priority within a tick:** Prayer → Equip → Spec → Consume → Combat → Move.
- **Protection prayers in PvP** = **0.6× damage** (40% reduction), not a full block.
- **Combo eat:** primary food + Karambwan same tick. Larger eat-delay wins (shark+karambwan → 3 ticks, +38 HP).
- **Tick eat:** food (priority 4) resolves before damage (priority 5) on the same tick.
- **Gmaul stacking:** Granite Maul spec adds 0 attack delay, enabling AGS → switch → Gmaul same tick via the priority pipeline.

Every item above has an explicit end-to-end test in `src/__tests__/acceptance.test.js` exercising it through the full `GameLoop`.

## Test suite

- **Unit tests** per engine module (Bonuses, AccuracyRoll, DamageRoll, CombatEngine, PrayerSystem, ConsumableSystem, SpecialAttackSystem, AIBot, TickEngine, ActionQueue, actorStore, loadoutStore, GameLoop).
- **Acceptance tests** (`acceptance.test.js`): each "Mechanics quick-reference" rule, end-to-end via `GameLoop` + `ActionQueue`.
- **Property tests** (`properties.test.js`): seeded PRNG (Mulberry32) drives many simulated fights across explicit seeds, asserting invariants (HP / prayer / spec energy / cooldowns never go negative, log respects 50-line cap), replay determinism (same seed → identical outcome), and a 6×6 preset-pair smoke test that every loadout matchup runs without throwing.

```bash
npm test                    # all 356 tests
npx vitest run path/to/file # one suite
```

## Layout

```
src/
├── App.jsx                # composes the UI, subscribes to TickEngine
├── main.jsx
├── components/            # Phase 12 — Bars, ActorPanel, PrayerBook, Inventory, …
├── data/                  # Phase 1 + 13 — static JSON
├── engine/                # Phase 2–11, 14 — pure combat math + GameLoop
├── hooks/                 # useTick
├── store/                 # zustand: actor / player / bot / game / loadout
└── __tests__/             # 15 suites, 356 tests
```
