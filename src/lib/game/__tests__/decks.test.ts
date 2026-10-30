import { describe, expect, test } from 'bun:test';
import {
  checkAgainstCatalog, deckSize, formatDeckList, makeDeck, parseDeckList, readDecks, removeDeck,
  toEngineDeck, uniqueCards, upsertDeck, writeDecks, STORAGE_KEY, MAX_COPIES, type StorageLike
} from '../decks.ts';

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => { data[key] = value; },
    removeItem: (key) => { delete data[key]; }
  };
}

describe('parseDeckList', () => {
  test('reads Arena and MTGO styles, with and without the x suffix', () => {
    const { lines } = parseDeckList('4 Lightning Bolt\n2x Shock\n1 Grizzly Bears');
    expect(lines).toEqual([
      { name: 'Lightning Bolt', count: 4 },
      { name: 'Shock', count: 2 },
      { name: 'Grizzly Bears', count: 1 }
    ]);
  });

  test('merges duplicates and strips set codes but keeps card names', () => {
    const { lines } = parseDeckList('2 Lightning Bolt (2XM) 129\n2 Lightning Bolt\n1 Lightning Bolt');
    expect(lines).toEqual([{ name: 'Lightning Bolt', count: 5 }]);
  });

  test('separates a sideboard and never mixes it into the main deck', () => {
    const result = parseDeckList('20 Mountain\n\nSideboard\n3 Shock\nSB: 1 Shock');
    expect(result.lines).toEqual([{ name: 'Mountain', count: 20 }]);
    expect(result.sideboard).toEqual([{ name: 'Shock', count: 4 }]);
  });

  test('ignores comments and headers, reports garbage', () => {
    const result = parseDeckList('// mi mazo\n# nota\nDeck\n4 Shock\n\n???\n0 Shock');
    expect(result.lines).toEqual([{ name: 'Shock', count: 4 }]);
    expect(result.skipped).toEqual(['???', '0 Shock']);
  });

  test('round-trips through the exporter', () => {
    const text = '4 Lightning Bolt\n2 Shock';
    expect(formatDeckList(parseDeckList(text).lines)).toBe(text);
  });
});

describe('deck math', () => {
  test('counts total and unique cards', () => {
    const lines = [{ name: 'Plains', count: 18 }, { name: 'Savannah Lions', count: 22 }];
    expect(deckSize(lines)).toBe(40);
    expect(uniqueCards(lines)).toBe(2);
  });

  test('expands copies for the engine and mirrors both seats', () => {
    const deck = toEngineDeck([{ name: 'Plains', count: 2 }, { name: 'Shock', count: 1 }]);
    expect(deck.player.main_deck).toEqual(['Plains', 'Plains', 'Shock']);
    expect(deck.opponent.main_deck).toEqual(deck.player.main_deck);
  });

  test('caps absurd copy counts instead of sending them to the engine', () => {
    const deck = toEngineDeck([{ name: 'Plains', count: 500 }]);
    expect(deck.player.main_deck).toHaveLength(MAX_COPIES);
  });
});

describe('catalog cross-check (data, not rules)', () => {
  const catalog = { plains: { name: 'Plains' }, 'savannah lions': { name: 'Savannah Lions' } };
  test('finds cards case-insensitively and lists the rest', () => {
    const result = checkAgainstCatalog([
      { name: 'Plains', count: 18 }, { name: 'savannah lions', count: 22 }, { name: 'Black Lotus', count: 1 }
    ], catalog);
    expect(result.found.map((line) => line.name)).toEqual(['Plains', 'savannah lions']);
    expect(result.missing).toEqual([{ name: 'Black Lotus', count: 1 }]);
    expect(result.canonical['savannah lions']).toBe('savannah lions');
  });
});

describe('storage', () => {
  test('writes, reads and removes decks', () => {
    const storage = memoryStorage();
    const deck = makeDeck({ name: 'Mi mazo', lines: [{ name: 'Plains', count: 40 }], now: '2026-10-29T00:00:00.000Z' });
    expect(writeDecks(storage, [deck])).toBe(true);
    expect(storage.data[STORAGE_KEY]).toContain('Mi mazo');
    expect(readDecks(storage)).toEqual([deck]);
    expect(removeDeck(readDecks(storage), deck.id)).toEqual([]);
  });

  test('upsert replaces in place and sorts newest first', () => {
    const older = makeDeck({ id: 'a', name: 'A', lines: [], now: '2026-01-01T00:00:00.000Z' });
    const newer = makeDeck({ id: 'b', name: 'B', lines: [], now: '2026-02-01T00:00:00.000Z' });
    const list = upsertDeck(upsertDeck([], older), newer);
    expect(list.map((deck) => deck.id)).toEqual(['b', 'a']);
    const renamed = makeDeck({ id: 'a', name: 'A2', lines: [], now: '2026-03-01T00:00:00.000Z' });
    expect(upsertDeck(list, renamed).map((deck) => deck.name)).toEqual(['A2', 'B']);
  });

  test('a corrupt payload degrades to an empty list instead of throwing', () => {
    expect(readDecks(memoryStorage({ [STORAGE_KEY]: '{not json' }))).toEqual([]);
    expect(readDecks(memoryStorage({ [STORAGE_KEY]: '{"a":1}' }))).toEqual([]);
    expect(readDecks(undefined)).toEqual([]);
  });

  test('filters invalid lines out of a saved deck', () => {
    const payload = JSON.stringify([{ id: 'x', name: 'X', format: 'limited', origin: 'manual', updatedAt: 'now', lines: [{ name: 'Plains', count: 4 }, { name: 'Bad', count: 0 }, { count: 3 }] }]);
    expect(readDecks(memoryStorage({ [STORAGE_KEY]: payload }))[0]!.lines).toEqual([{ name: 'Plains', count: 4 }]);
  });

  test('reports a failed write (quota or private mode) instead of pretending', () => {
    const failing: StorageLike = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
    expect(writeDecks(failing, [])).toBe(false);
  });
});
