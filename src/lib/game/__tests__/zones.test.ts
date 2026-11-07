import { describe, expect, test } from 'bun:test';
import type { EngineSnapshot, GameObject, PlayerView } from '#lib/engine/types.ts';
import { revealedLibraryCards, zoneCards, zoneCount, zoneTop } from '#lib/game/zones.ts';

function object(id: number, overrides: Partial<GameObject> = {}): GameObject {
  return { id, card_id: id, owner: 0, controller: 0, zone: 'Graveyard', name: `Carta ${id}`, ...overrides };
}

function player(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    id: 0,
    life: 20,
    mana_pool: { total: 0, white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
    hand: [],
    library_count: 31,
    graveyard: [10, 11],
    exile: [12],
    is_eliminated: false,
    poison_counters: 0,
    energy: 0,
    lands_played_this_turn: 0,
    ...overrides
  };
}

function snapshot(objects: GameObject[], players: PlayerView[] = [player()]): EngineSnapshot {
  return {
    ok: true,
    viewer: 0,
    seed: 1,
    revision: 1,
    actions_applied: 0,
    state: {
      turn_number: 1,
      active_player: 0,
      priority_player: 0,
      phase: 'BeginCombat',
      waiting_for: { type: 'Priority' },
      players,
      battlefield: [],
      stack: [],
      exile: [],
      objects: Object.fromEntries(objects.map((entry) => [String(entry.id), entry]))
    },
    derived: {},
    legal: { actions: [], spell_costs: {}, by_object: {} },
    metrics: {}
  } as unknown as EngineSnapshot;
}

const objects = [object(10), object(11), object(12), object(13, { zone: 'Library' })];

describe('table zones', () => {
  test('graveyard and exile resolve to the engine objects, in append order', () => {
    const snap = snapshot(objects);
    expect(zoneCards(snap, 0, 'graveyard').map((card) => card.id)).toEqual([10, 11]);
    expect(zoneCards(snap, 0, 'exile').map((card) => card.id)).toEqual([12]);
    expect(zoneTop(snap, 0, 'graveyard')?.id).toBe(11);
  });

  test('counts come from the player view, including the library', () => {
    const snap = snapshot(objects);
    expect(zoneCount(snap, 0, 'library')).toBe(31);
    expect(zoneCount(snap, 0, 'graveyard')).toBe(2);
    expect(zoneCount(snap, 0, 'exile')).toBe(1);
  });

  test('the library order is never reconstructed from object ids', () => {
    const snap = snapshot(objects);
    expect(zoneCards(snap, 0, 'library')).toEqual([]);
    expect(zoneTop(snap, 0, 'library')).toBeUndefined();
  });

  test('a library id list is only shown when the engine revealed each card', () => {
    const hidden = object(20, { zone: 'Library', display_visible_to_viewer: false });
    const revealed = object(21, { zone: 'Library', display_visible_to_viewer: true });
    const snap = snapshot([hidden, revealed], [player({ library: [20, 21] } as unknown as PlayerView)]);
    expect(revealedLibraryCards(snap, 0).map((card) => card.id)).toEqual([21]);
  });

  test('ids missing from the object map are skipped, not rendered as blanks', () => {
    const snap = snapshot([object(10)], [player({ graveyard: [10, 99], exile: [98] })]);
    expect(zoneCards(snap, 0, 'graveyard').map((card) => card.id)).toEqual([10]);
    expect(zoneCards(snap, 0, 'exile')).toEqual([]);
  });

  test('a missing seat reports zero everywhere', () => {
    const snap = snapshot(objects);
    expect(zoneCount(snap, 7, 'graveyard')).toBe(0);
    expect(zoneCards(snap, 7, 'graveyard')).toEqual([]);
    expect(zoneCount(null, 0, 'library')).toBe(0);
  });
});
