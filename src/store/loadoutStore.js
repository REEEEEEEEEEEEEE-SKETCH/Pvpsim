import loadouts from '../data/loadouts.json';
import { EQUIPMENT_SLOTS } from '../engine/Bonuses.js';

const LS_KEY = 'pvpsim_custom_loadouts';

function safeStorage() {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

// Apply a preset (or custom) loadout to an actor store. Resets every equipment
// slot, sets the inventory, attack style, and activates initial prayers.
export function applyLoadout(actorStore, loadoutId, opts = {}) {
  const { loadoutsDb = loadouts, customDb = null } = opts;
  const lo = loadoutsDb[loadoutId] ?? customDb?.[loadoutId];
  if (!lo) return { ok: false, reason: 'unknown_loadout' };

  for (const slot of EQUIPMENT_SLOTS) {
    const itemId = lo.equipment?.[slot] ?? null;
    if (itemId) actorStore.getState().equip(slot, itemId);
    else actorStore.getState().unequip(slot);
  }
  actorStore.getState().setInventory(lo.inventory ?? []);
  if (lo.attackStyle) actorStore.getState().setAttackStyle(lo.attackStyle);
  actorStore.getState().setActivePrayers(lo.activePrayers ?? []);
  return { ok: true, loadout: lo };
}

// Build a loadout object from the current actor state — used by "Save current".
export function captureLoadout(actorStore, name, description = '') {
  const s = actorStore.getState();
  return {
    name,
    description,
    equipment: { ...s.equipment },
    inventory: [...s.inventory],
    attackStyle: s.attackStyle,
    activePrayers: [...s.activePrayers]
  };
}

export function listPresetLoadouts(loadoutsDb = loadouts) {
  return Object.entries(loadoutsDb).map(([id, lo]) => ({
    id,
    name: lo.name,
    description: lo.description ?? ''
  }));
}

// ── localStorage-backed custom loadouts ─────────────────────────────────────

export function loadCustomLoadouts(storage = safeStorage()) {
  if (!storage) return {};
  try {
    return JSON.parse(storage.getItem(LS_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveCustomLoadout(id, loadout, storage = safeStorage()) {
  if (!storage) return { ok: false, reason: 'no_storage' };
  const all = loadCustomLoadouts(storage);
  all[id] = loadout;
  storage.setItem(LS_KEY, JSON.stringify(all));
  return { ok: true };
}

export function deleteCustomLoadout(id, storage = safeStorage()) {
  if (!storage) return { ok: false, reason: 'no_storage' };
  const all = loadCustomLoadouts(storage);
  delete all[id];
  storage.setItem(LS_KEY, JSON.stringify(all));
  return { ok: true };
}

export function clearCustomLoadouts(storage = safeStorage()) {
  if (!storage) return;
  storage.removeItem(LS_KEY);
}
