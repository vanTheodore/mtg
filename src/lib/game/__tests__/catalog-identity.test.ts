/**
 * Name → card must have exactly one answer, shared by loader, builder and engine.
 *
 * The fixture and 10E both print `Serra Angel`, `Shock`, `Wrath of God` and six
 * more. Before 0.4.2 the loader kept the *first* pack's face while the deck
 * builder's map kept the *last*, and a spread merge could silently overwrite
 * either. These tests use the real packs, not invented ones.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { planLoad, type Catalog, type CatalogIndex } from '../catalog.ts';
import {
  canonicalIndex,
  faceIdentity,
  identityConflict,
  mergeCatalogs,
  oracleIdOf
} from '../canonical.ts';

const root = new URL('../../../../', import.meta.url).pathname;
const readJson = (path: string) => JSON.parse(readFileSync(join(root, path), 'utf8'));

const index = readJson('static/data/catalog/index.json') as CatalogIndex;
const packs = new Map(index.packs.map((pack) => [pack.id, readJson(`static/data/catalog/packs/${pack.id}.json`) as Catalog]));
const sharedNames = ['Serra Angel', 'Shock', 'Wrath of God', 'Giant Growth', 'Grizzly Bears', 'Cancel', 'Rampant Growth', 'Unsummon', 'Naturalize'];

describe('the shipped index is disjoint', () => {
  test('no name is served by two packs', () => {
    const canonical = canonicalIndex(index);
    expect(canonical.duplicates).toEqual([]);
    const seen = new Set<string>();
    for (const pack of index.packs) {
      for (const name of pack.names) {
        expect({ name, twice: seen.has(name) }).toEqual({ name, twice: false });
        seen.add(name);
      }
    }
    expect(seen.size).toBe(444);
  });

  test('the real-set pack records the 9 names the fixture already owned', () => {
    const tenE = index.packs.find((pack) => pack.id === '10e')!;
    const overlap = tenE.overlap ?? {};
    expect(Object.keys(overlap)).toEqual(['fixture']);
    expect([...overlap.fixture!].sort()).toEqual(sharedNames.map((name) => name.toLowerCase()).sort());
    expect(tenE.faces).toBe(354);
    // The payload really dropped them: they are not in the file.
    const payload = packs.get('10e')!;
    expect(sharedNames.filter((name) => name.toLowerCase() in payload)).toEqual([]);
  });

  test('the engine sees one rules text per shared name, and it is the owner\'s', () => {
    // The 10E printing of Shock says "target creature or player" (2007 wording);
    // the fixture carries the modern Oracle text. Only the owner ships, so the
    // engine can only ever parse one of them.
    const fixtureShock = packs.get('fixture')!['shock']!;
    const tenEShock = readJson('data/mtgjson/10E.es.json') as { cards: { name: string; text: string }[] };
    const printed = tenEShock.cards.find((card) => card.name === 'Shock')!;
    expect(String(fixtureShock.oracle_text)).toContain('any target');
    expect(printed.text).toContain('target creature or player');
    expect(String(fixtureShock.oracle_text)).not.toBe(printed.text);
  });
});

describe('a duplicated index is detected, never merged silently', () => {
  // Rebuild the pre-fix state on purpose: the 10E pack as it was generated
  // before `--append` learned to drop overlap. The nine duplicated faces are a
  // committed fixture (they no longer exist in the shipped pack), exported by
  // the Phase `catalog` binary from MTGJSON 10E.
  const overlapFaces = readJson('src/lib/game/__tests__/fixtures/10e-overlap-faces.json') as Catalog;
  const legacyTenE: Catalog = { ...packs.get('10e')!, ...overlapFaces };
  const legacyIndex: CatalogIndex = {
    ...index,
    packs: index.packs.map((pack) => (pack.id === '10e'
      ? { ...pack, names: [...pack.names, ...sharedNames.map((name) => name.toLowerCase())], faces: 363 }
      : pack))
  };

  test('canonicalIndex reports who owns each duplicated name', () => {
    const canonical = canonicalIndex(legacyIndex);
    expect(canonical.duplicates).toHaveLength(9);
    for (const duplicate of canonical.duplicates) {
      expect(duplicate.kept).toBe('fixture');
      expect(duplicate.dropped).toEqual(['10e']);
    }
    expect(canonical.byName.get('serra angel')!.pack).toBe('fixture');
  });

  test('the builder and the loader resolve the same pack for every shared name', () => {
    const canonical = canonicalIndex(legacyIndex);
    const plan = planLoad(legacyIndex, sharedNames);
    // Every shared name is owned by the core pack, so a deck made only of them
    // never needs the second pack — the loader and the builder agree on that.
    expect(plan.required).toEqual(['fixture']);
    for (const name of sharedNames) {
      expect(canonical.byName.get(name.toLowerCase())!.pack).toBe('fixture');
    }
  });

  test('merging the legacy packs reports all nine overwrites and their cause', () => {
    const { catalog, conflicts } = mergeCatalogs([
      { id: 'fixture', catalog: packs.get('fixture')! },
      { id: '10e', catalog: legacyTenE }
    ]);
    expect(conflicts).toHaveLength(9);
    // Three printings carry older rules text; `Grizzly Bears` differs only in
    // how "no rules text" is spelled (`""` vs `null`), which is the same card.
    const differing = conflicts.filter((entry) => entry.conflict !== null);
    expect(differing.map((entry) => entry.name).sort()).toEqual(['rampant growth', 'serra angel', 'shock']);
    expect(conflicts.every((entry) => entry.conflict === 'rules_text' || entry.conflict === null)).toBe(true);
    // First definition still wins, and the winner is the recorded owner.
    expect(catalog['shock']).toEqual(packs.get('fixture')!['shock']!);
  });

  test('an Oracle id mismatch is a conflict, a missing one is not', () => {
    const fixture = faceIdentity(packs.get('fixture')!['serra angel']!);
    const tenE = faceIdentity(legacyTenE['serra angel']!);
    expect(fixture.oracleId).not.toBeNull();
    // MTGJSON v3 has no Scryfall ids: unknown is not "different".
    expect(oracleIdOf(legacyTenE['serra angel']!)).toBeNull();
    expect(identityConflict({ ...fixture, rulesText: '' }, { ...tenE, rulesText: '' })).toBeNull();
    expect(identityConflict(fixture, { ...fixture, oracleId: 'other-card' })).toBe('oracle_id');
    expect(identityConflict(fixture, { ...fixture, manaCost: '{"generic":2}' })).toBe('mana_cost');
  });
});
