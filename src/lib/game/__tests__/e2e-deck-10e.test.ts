/**
 * The deck in the 10E end-to-end spec must be a real, playable 40-card deck.
 *
 * The spec cannot run here (no Chromium), but its *data* can be checked against
 * the shipped index and coverage artifacts — and that is where the previous
 * version was wrong: it summed 45 cards while the test expected 40, two of its
 * cards were in the core pack rather than 10E-only, and nothing proved the
 * limitation card was really a limitation.
 *
 * Reading the spec is deliberate: a deck copied into two places drifts.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { planLoad, type CatalogIndex } from '../catalog.ts';
import type { Catalog } from '../catalog.ts';
import { parseDeckList } from '../decks.ts';
import type { CoverageDocument } from '../coverage.ts';

const root = new URL('../../../../', import.meta.url).pathname;
const spec = readFileSync(join(root, 'tests/e2e/ui-deck-10e.spec.ts'), 'utf8');
const index = JSON.parse(readFileSync(join(root, 'static/data/catalog/index.json'), 'utf8')) as CatalogIndex;

/** `const DECK = [ '17 Plains', … ].join('\n')` */
const deckBlock = /const DECK = \[([\s\S]*?)\]\.join/.exec(spec)?.[1] ?? '';
const deckText = [...deckBlock.matchAll(/'([^']+)'/g)].map((match) => match[1]!).join('\n');
const parsed = parseDeckList(deckText);

const coverageById = new Map<string, CoverageDocument>();
for (const pack of index.packs) {
  const url = join(root, `static/data/catalog/coverage/${pack.id}.${pack.sha256.slice(0, 8)}.json`);
  try {
    coverageById.set(pack.id, JSON.parse(readFileSync(url, 'utf8')) as CoverageDocument);
  } catch {
    // A pack without an artifact is "no evidence", not a failure of this test.
  }
}

const packOf = (name: string): string | null => {
  const key = name.trim().toLocaleLowerCase('en-US');
  for (const pack of index.packs) {
    if (pack.names.some((candidate) => candidate.toLocaleLowerCase('en-US') === key)) return pack.id;
  }
  return null;
};

const limitationOf = (name: string): string[] => {
  const pack = packOf(name);
  const document = pack ? coverageById.get(pack) : undefined;
  const key = name.trim().toLocaleLowerCase('en-US');
  const card = document?.cards.find((candidate) => candidate.key === key);
  return card && card.supported === false ? card.gaps : [];
};

describe('the 10E end-to-end deck', () => {
  test('the spec declares exactly 40 cards', () => {
    expect(deckText.length).toBeGreaterThan(0);
    expect(parsed.lines.reduce((sum, line) => sum + line.count, 0)).toBe(40);
    expect(parsed.skipped).toEqual([]);
  });

  test('every card is served by the shipped index', () => {
    const plan = planLoad(index, parsed.lines.map((line) => line.name));
    expect(plan.missing).toEqual([]);
    expect(plan.unverified).toEqual([]);
  });

  test('only Plains comes from the core pack; the rest is 10E-exclusive', () => {
    const byPack = new Map<string, string[]>();
    for (const line of parsed.lines) {
      const pack = packOf(line.name);
      expect({ card: line.name, pack: pack !== null }).toEqual({ card: line.name, pack: true });
      byPack.set(pack!, [...(byPack.get(pack!) ?? []), line.name]);
    }
    expect([...byPack.keys()].sort()).toEqual(['10e', 'fixture']);
    expect(byPack.get('fixture')).toEqual(['Plains']);
    // 10E-only means: not a name the core pack also carries.
    const core = index.packs.find((pack) => pack.id === 'fixture')!;
    const coreNames = new Set(core.names.map((name) => name.toLocaleLowerCase('en-US')));
    for (const name of byPack.get('10e')!) {
      expect({ card: name, coreCarriesIt: coreNames.has(name.toLocaleLowerCase('en-US')) })
        .toEqual({ card: name, coreCarriesIt: false });
    }
  });

  test('exactly one card has a known limitation, and it is Arcane Teachings', () => {
    const limited = parsed.lines.filter((line) => limitationOf(line.name).length > 0);
    expect(limited.map((line) => line.name)).toEqual(['Arcane Teachings']);
    expect(limitationOf('Arcane Teachings')).toEqual(['SilentDrop:1_of_2']);
    // The spec has to name the same card, or the consent step proves nothing.
    expect(/const LIMITED = '([^']+)'/.exec(spec)?.[1]).toBe('Arcane Teachings');
  });

  test('the creature names the spec asserts about exist and are playable', () => {
    const creatures = [...(/const CREATURES = \[([\s\S]*?)\];/.exec(spec)?.[1] ?? '').matchAll(/'([^']+)'/g)]
      .map((match) => match[1]!);
    expect(creatures.length).toBeGreaterThan(5);
    for (const name of creatures) {
      expect({ card: name, inDeck: parsed.lines.some((line) => line.name === name) })
        .toEqual({ card: name, inDeck: true });
      expect({ card: name, gaps: limitationOf(name) }).toEqual({ card: name, gaps: [] });
    }
  });

  test('the merged catalog the game would load really contains the deck', () => {
    const catalog: Catalog = {};
    for (const pack of index.packs) {
      if (pack.id !== '10e' && pack.id !== 'fixture') continue;
      const body = JSON.parse(readFileSync(join(root, `static/data/catalog/packs/${pack.id}.json`), 'utf8')) as Catalog;
      Object.assign(catalog, body);
    }
    for (const line of parsed.lines) {
      expect({ card: line.name, present: catalog[line.name.toLocaleLowerCase('en-US')] !== undefined })
        .toEqual({ card: line.name, present: true });
    }
  });
});
