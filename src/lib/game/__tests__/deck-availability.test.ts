/**
 * A deck can name cards the browser has not downloaded yet.
 *
 * The builder cross-checks a deck against the *loaded* catalog, which is right
 * for 「do we have the face?」 and wrong for 「does this card exist?」: a deck
 * pasted from 10E resolved against an index that knows it, with no pack in
 * memory, was reported as missing and 「Jugar con este mazo」 stayed disabled —
 * before the loader ever got the chance to download what the deck needs.
 *
 * These tests pin the five states apart: unknown to the index, known but its
 * pack is pending, loaded, known limitation, playable.
 */
import { describe, expect, test } from 'bun:test';
import { checkAgainstCatalog, deckStatus } from '../decks.ts';
import type { Catalog, CatalogIndex } from '../catalog.ts';
import type { CoverageDocument } from '../coverage.ts';

const pack = (id: string, names: string[], overrides: Partial<CatalogIndex['packs'][number]> = {}) => ({
  id,
  label: id,
  names,
  set: null,
  core: false,
  verified: true,
  faces: names.length,
  bytes: 10,
  sha256: 'sha-' + id,
  source: 'test',
  ...overrides
});

const index: CatalogIndex = {
  version: 1,
  generated_at: '2026-10-29T00:00:00.000Z',
  format: 'atomic',
  packs: [
    pack('core', ['Plains', 'Savannah Lions'], { core: true }),
    pack('10e', ['Serra Angel', 'Air Elemental', 'Arcane Teachings'], { set: '10E' })
  ]
};

/** Only the core pack is in memory: the 10E cards are known but not downloaded. */
const loaded: Catalog = {
  plains: { name: 'Plains' },
  'savannah lions': { name: 'Savannah Lions' }
};

describe('a card the index knows is not a missing card', () => {
  test('the loaded-catalog check reports it as pending, not missing', () => {
    const availability = checkAgainstCatalog(
      [{ name: 'Serra Angel', count: 2 }, { name: 'Plains', count: 18 }],
      loaded,
      index
    );
    expect(availability.missing).toEqual([]);
    expect(availability.pending).toEqual([{ name: 'Serra Angel', count: 2 }]);
    expect(availability.found).toEqual([{ name: 'Plains', count: 18 }]);
  });

  test('without an index the loaded catalog is still the whole truth', () => {
    const availability = checkAgainstCatalog([{ name: 'Serra Angel', count: 2 }], loaded);
    expect(availability.missing).toEqual([{ name: 'Serra Angel', count: 2 }]);
    expect(availability.pending).toEqual([]);
  });
});

const coverage = new Map<string, CoverageDocument | null>([
  ['10e', {
    pack: '10e',
    pack_sha256: 'sha-10e',
    generated_by: 'test',
    engine_source: 'phase test',
    version: 1,
    faces: 3,
    verified: true,
    levels: {},
    summary: {},
    cards: [
      { key: 'serra angel', name: 'Serra Angel', supported: true, gaps: [] },
      { key: 'air elemental', name: 'Air Elemental', supported: true, gaps: [] },
      { key: 'arcane teachings', name: 'Arcane Teachings', supported: false, gaps: ['SilentDrop:1_of_2'] }
    ]
  } as unknown as CoverageDocument],
  ['core', null]
]);

describe('the five states a deck line can be in', () => {
  test('unknown to the index, pending, loaded, limited', () => {
    const status = deckStatus(
      [
        { name: 'Black Lotus', count: 1 },
        { name: 'Serra Angel', count: 2 },
        { name: 'Plains', count: 18 },
        { name: 'Arcane Teachings', count: 1 }
      ],
      { index, catalog: loaded, coverage }
    );
    const byName = Object.fromEntries(status.lines.map((line) => [line.key, line]));
    expect(byName['black lotus']!.state).toBe('absent');
    expect(byName['serra angel']!.state).toBe('pending');
    expect(byName['serra angel']!.pack).toBe('10e');
    expect(byName['plains']!.state).toBe('ready');
    expect(byName['plains']!.loaded).toBe(true);
    expect(byName['arcane teachings']!.state).toBe('limited');
    expect(byName['arcane teachings']!.gaps).toEqual(['SilentDrop:1_of_2']);
  });

  test('a pending card does not block starting; an unknown one does', () => {
    const pending = deckStatus([{ name: 'Serra Angel', count: 1 }], { index, catalog: loaded, coverage });
    expect(pending.pendingPacks).toEqual(['10e']);
    expect(pending.canStart).toBe(true);

    const unknown = deckStatus([{ name: 'Black Lotus', count: 1 }], { index, catalog: loaded, coverage });
    expect(unknown.canStart).toBe(false);
    expect(unknown.unknown.map((entry) => entry.line.name)).toEqual(['Black Lotus']);
  });

  test('only the packs the deck needs are listed, never the whole index', () => {
    const status = deckStatus([{ name: 'Plains', count: 40 }], { index, catalog: loaded, coverage });
    expect(status.pendingPacks).toEqual([]);
    expect(status.neededPacks).toEqual(['core']);

    const other = deckStatus([{ name: 'Air Elemental', count: 1 }], { index, catalog: loaded, coverage });
    expect(other.neededPacks).toEqual(['10e']);
    expect(other.pendingPacks).toEqual(['10e']);
  });

  test('copies are counted per state, so the summary adds up to the deck', () => {
    const status = deckStatus(
      [
        { name: 'Black Lotus', count: 1 },
        { name: 'Serra Angel', count: 2 },
        { name: 'Plains', count: 18 },
        { name: 'Arcane Teachings', count: 1 }
      ],
      { index, catalog: loaded, coverage }
    );
    expect(status.copies).toEqual({ absent: 1, pending: 2, ready: 18, limited: 1, total: 22 });
  });

  test('a card whose pack is not certified is blocked, not silently played', () => {
    const uncertified: CatalogIndex = {
      ...index,
      packs: index.packs.map((entry) => (entry.id === '10e' ? { ...entry, verified: false } : entry))
    };
    const status = deckStatus([{ name: 'Serra Angel', count: 1 }], { index: uncertified, catalog: loaded });
    expect(status.unverified.map((entry) => entry.line.name)).toEqual(['Serra Angel']);
    expect(status.canStart).toBe(false);
  });
});
