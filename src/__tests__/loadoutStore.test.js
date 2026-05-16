import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyLoadout,
  captureLoadout,
  listPresetLoadouts,
  loadCustomLoadouts,
  saveCustomLoadout,
  deleteCustomLoadout,
  clearCustomLoadouts
} from '../store/loadoutStore.js';
import { createActorStore } from '../store/actorStore.js';
import { EQUIPMENT_SLOTS } from '../engine/Bonuses.js';

function mockStorage() {
  const data = {};
  return {
    _data: data,
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: k => { delete data[k]; }
  };
}

// ── applyLoadout — preset loadouts ───────────────────────────────────────────

describe('applyLoadout — preset loadouts', () => {
  it('returns ok:false for unknown loadout id', () => {
    const store = createActorStore();
    const r = applyLoadout(store, 'mystery_meta');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('unknown_loadout');
  });

  it('AGS Main equips armadyl_godsword and fills inventory', () => {
    const store = createActorStore();
    const r = applyLoadout(store, 'ags_main');
    expect(r.ok).toBe(true);
    expect(store.getState().equipment.weapon).toBe('armadyl_godsword');
    expect(store.getState().inventory).toContain('shark');
    expect(store.getState().inventory).toContain('karambwan');
    expect(store.getState().inventory).toContain('super_combat');
  });

  it('DDS Pure equips dragon_dagger and sets aggressive style', () => {
    const store = createActorStore();
    applyLoadout(store, 'dds_pure');
    expect(store.getState().equipment.weapon).toBe('dragon_dagger');
    expect(store.getState().attackStyle).toBe('aggressive');
  });

  it('Ranged Main sets accurate style for ranged weapon', () => {
    const store = createActorStore();
    applyLoadout(store, 'ranged_main');
    expect(store.getState().equipment.weapon).toBe('rune_crossbow');
    expect(store.getState().attackStyle).toBe('accurate');
  });

  it('clears unset slots (e.g. shield slot becomes null)', () => {
    const store = createActorStore();
    // Pre-equip a shield, then apply a 2H loadout
    store.getState().equip('shield', 'rune_crossbow'); // arbitrary, just to populate
    applyLoadout(store, 'ags_main'); // AGS is 2H, shield should be null
    expect(store.getState().equipment.shield).toBeNull();
  });

  it('replaces inventory wholesale (not append)', () => {
    const store = createActorStore({ inventory: ['junk1', 'junk2'] });
    applyLoadout(store, 'dds_pure');
    expect(store.getState().inventory).not.toContain('junk1');
    expect(store.getState().inventory).not.toContain('junk2');
    expect(store.getState().inventory).toContain('shark');
  });

  it('resets active prayers from the loadout spec', () => {
    const store = createActorStore({ activePrayers: ['piety'] });
    applyLoadout(store, 'ags_main'); // activePrayers: []
    expect(store.getState().activePrayers).toEqual([]);
  });

  it('applies custom loadouts via customDb param', () => {
    const store = createActorStore();
    const custom = {
      my_kit: {
        name: 'My Kit',
        equipment: { weapon: 'abyssal_whip' },
        inventory: ['shark'],
        attackStyle: 'controlled',
        activePrayers: []
      }
    };
    const r = applyLoadout(store, 'my_kit', { customDb: custom });
    expect(r.ok).toBe(true);
    expect(store.getState().equipment.weapon).toBe('abyssal_whip');
    expect(store.getState().attackStyle).toBe('controlled');
  });
});

// ── captureLoadout ───────────────────────────────────────────────────────────

describe('captureLoadout', () => {
  it('snapshots the actor state into a loadout object', () => {
    const store = createActorStore();
    store.getState().equip('weapon', 'abyssal_whip');
    store.getState().setInventory(['shark']);
    store.getState().setAttackStyle('controlled');
    const lo = captureLoadout(store, 'My PK Kit', 'A test loadout');
    expect(lo.name).toBe('My PK Kit');
    expect(lo.description).toBe('A test loadout');
    expect(lo.equipment.weapon).toBe('abyssal_whip');
    expect(lo.inventory).toEqual(['shark']);
    expect(lo.attackStyle).toBe('controlled');
  });

  it('captures every equipment slot key', () => {
    const store = createActorStore();
    const lo = captureLoadout(store, 'Empty');
    for (const slot of EQUIPMENT_SLOTS) {
      expect(slot in lo.equipment).toBe(true);
    }
  });

  it('produces a loadout that round-trips through applyLoadout', () => {
    const a = createActorStore();
    a.getState().equip('weapon', 'armadyl_godsword');
    a.getState().setInventory(['shark', 'karambwan']);
    a.getState().setAttackStyle('aggressive');
    const lo = captureLoadout(a, 'Roundtrip');

    const b = createActorStore();
    applyLoadout(b, 'rt', { customDb: { rt: lo } });
    expect(b.getState().equipment.weapon).toBe('armadyl_godsword');
    expect(b.getState().inventory).toEqual(['shark', 'karambwan']);
    expect(b.getState().attackStyle).toBe('aggressive');
  });
});

// ── listPresetLoadouts ───────────────────────────────────────────────────────

describe('listPresetLoadouts', () => {
  it('returns an entry per preset with id, name, description', () => {
    const list = listPresetLoadouts();
    expect(list.length).toBeGreaterThan(0);
    for (const entry of list) {
      expect(typeof entry.id).toBe('string');
      expect(typeof entry.name).toBe('string');
      expect(typeof entry.description).toBe('string');
    }
  });

  it('includes the AGS Main preset', () => {
    const list = listPresetLoadouts();
    expect(list.find(p => p.id === 'ags_main')).toBeDefined();
  });
});

// ── custom loadouts (localStorage-backed) ────────────────────────────────────

describe('custom loadouts via localStorage', () => {
  let storage;
  beforeEach(() => { storage = mockStorage(); });

  it('loadCustomLoadouts returns {} when storage is empty', () => {
    expect(loadCustomLoadouts(storage)).toEqual({});
  });

  it('saveCustomLoadout writes to storage and survives load round-trip', () => {
    const lo = { name: 'Test', equipment: { weapon: 'abyssal_whip' }, inventory: [], attackStyle: 'controlled', activePrayers: [] };
    const r = saveCustomLoadout('test1', lo, storage);
    expect(r.ok).toBe(true);
    expect(loadCustomLoadouts(storage)).toEqual({ test1: lo });
  });

  it('multiple saves accumulate', () => {
    saveCustomLoadout('a', { name: 'A' }, storage);
    saveCustomLoadout('b', { name: 'B' }, storage);
    const all = loadCustomLoadouts(storage);
    expect(Object.keys(all).sort()).toEqual(['a', 'b']);
  });

  it('saveCustomLoadout overwrites existing id', () => {
    saveCustomLoadout('a', { name: 'first' }, storage);
    saveCustomLoadout('a', { name: 'second' }, storage);
    expect(loadCustomLoadouts(storage).a.name).toBe('second');
  });

  it('deleteCustomLoadout removes a single entry', () => {
    saveCustomLoadout('a', { name: 'A' }, storage);
    saveCustomLoadout('b', { name: 'B' }, storage);
    deleteCustomLoadout('a', storage);
    expect(loadCustomLoadouts(storage)).toEqual({ b: { name: 'B' } });
  });

  it('clearCustomLoadouts wipes the storage key', () => {
    saveCustomLoadout('a', { name: 'A' }, storage);
    clearCustomLoadouts(storage);
    expect(loadCustomLoadouts(storage)).toEqual({});
  });

  it('returns {} (no throw) when storage holds malformed JSON', () => {
    storage.setItem('pvpsim_custom_loadouts', '{not_valid_json');
    expect(loadCustomLoadouts(storage)).toEqual({});
  });

  it('save/load/delete report no_storage when storage is null', () => {
    expect(saveCustomLoadout('x', {}, null).reason).toBe('no_storage');
    expect(deleteCustomLoadout('x', null).reason).toBe('no_storage');
    expect(loadCustomLoadouts(null)).toEqual({});
  });
});
