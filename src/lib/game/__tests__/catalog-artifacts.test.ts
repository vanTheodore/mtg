/**
 * Checks the *generated* catalog artifacts, not a mock: if `catalog:build` and
 * `catalog:packs` drift apart, the app would start a game with a deck the index
 * cannot serve. These tests read the real files in `static/data`.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { planLoad, type Catalog, type CatalogIndex } from '../catalog.ts';

const root = new URL('../../../../', import.meta.url);
const read = (path: string) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));

const index = read('static/data/catalog/index.json') as CatalogIndex;
const cards = read('static/data/cards.json') as Catalog;
const decks = read('static/data/decks.json') as { player: { main_deck: string[] }; opponent: { main_deck: string[] } };
const meta = read('static/data/card-meta.json') as Record<string, { name?: string; oracle_id?: string }>;

const PRACTICE = [...Array(18).fill('Plains'), ...Array(22).fill('Savannah Lions')];
const SPARKS = [...Array(24).fill('Mountain'), ...Array(16).fill('Lightning Bolt')];

const unique = (names: string[]) => [...new Set(names)];

describe('catalog index matches the engine catalog', () => {
  test('every indexed name exists as an engine entry and vice versa', () => {
    const indexed = new Set(index.packs.flatMap((pack) => pack.names));
    const engine = new Set(Object.keys(cards));
    const onlyIndexed = [...indexed].filter((name) => !engine.has(name));
    const onlyEngine = [...engine].filter((name) => !indexed.has(name));
    expect(onlyIndexed).toEqual([]);
    expect(onlyEngine).toEqual([]);
  });

  test('pack files exist, parse and hash to the recorded digest', async () => {
    const { createHash } = await import('node:crypto');
    for (const pack of index.packs) {
      const text = readFileSync(new URL(`static/data/catalog/packs/${pack.id}.json`, root), 'utf8');
      const digest = createHash('sha256').update(text).digest('hex');
      expect(digest).toBe(pack.sha256);
      const payload = JSON.parse(text) as Catalog;
      expect(Object.keys(payload)).toHaveLength(pack.faces);
      expect(pack.names.every((name) => name in payload)).toBe(true);
    }
  });

  test('the pack byte count in the index matches the file on disk', () => {
    for (const pack of index.packs) {
      const bytes = readFileSync(new URL(`static/data/catalog/packs/${pack.id}.json`, root)).byteLength;
      expect(bytes).toBe(pack.bytes);
    }
  });
});

describe('demo decks are fully served by the catalog', () => {
  for (const [label, deck] of Object.entries({ practice: PRACTICE, sparks: SPARKS, standard: [...decks.player.main_deck, ...decks.opponent.main_deck] })) {
    test(`${label} resolves every card through the index`, () => {
      const plan = planLoad(index, unique(deck));
      expect(plan.missing).toEqual([]);
      expect(plan.required.length).toBeGreaterThan(0);
    });
  }

  test('multi-face deck entries resolve to their face names', () => {
    expect(decks.player.main_deck).toContain('Giant Killer // Chop Down');
    const plan = planLoad(index, ['Giant Killer // Chop Down']);
    expect(plan.missing).toEqual([]);
  });
});

describe('UI metadata covers the catalog', () => {
  test('every engine face has oracle metadata for text and images', () => {
    const missing = Object.entries(cards)
      .filter(([, entry]) => !(entry as { scryfall_oracle_id?: string }).scryfall_oracle_id)
      .map(([name]) => name);
    expect(missing).toEqual([]);
    const withoutMeta = Object.values(cards)
      .map((entry) => (entry as { scryfall_oracle_id: string }).scryfall_oracle_id)
      .filter((id) => !(id in meta));
    expect(withoutMeta).toEqual([]);
  });
});
