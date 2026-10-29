import { describe, expect, test } from 'bun:test';
import { mergePacks, planLoad, searchableNames, packFor, type CatalogIndex } from '../catalog.ts';

const index: CatalogIndex = {
  version: 1,
  generated_at: '2026-10-29T00:00:00.000Z',
  format: 'atomic',
  packs: [
    { id: 'lands', label: 'Tierras', names: ['Plains', 'Mountain'], set: 'BLC', core: true, verified: true, faces: 2, bytes: 10, sha256: 'a', source: 'test' },
    { id: 'core10', label: 'Core 10E', names: ['Serra Angel', 'Shock'], set: '10E', core: false, verified: true, faces: 2, bytes: 10, sha256: 'b', source: 'test' },
    { id: 'extra', label: 'Extra', names: ['Grizzly Bears'], set: '9E', core: false, verified: false, faces: 1, bytes: 10, sha256: 'c', source: 'test' }
  ]
};

describe('catalog pack planning', () => {
  test('loads only the packs that hold the deck cards, plus core packs', () => {
    const plan = planLoad(index, ['Shock', 'Plains']);
    expect(plan.required).toEqual(['lands', 'core10']);
    expect(plan.missing).toEqual([]);
  });

  test('a deck with one card from one set does not pull the other packs', () => {
    const plan = planLoad(index, ['Grizzly Bears']);
    expect(plan.required).toEqual(['lands', 'extra']);
  });

  test('matches names case- and whitespace-insensitively', () => {
    expect(planLoad(index, ['  serra angel ']).required).toEqual(['lands', 'core10']);
  });

  test('a combined multi-face name resolves through its faces', () => {
    const multi: CatalogIndex = { ...index, packs: [
      { ...index.packs[0]!, id: 'a', names: ['Giant Killer'] },
      { ...index.packs[1]!, id: 'b', names: ['Chop Down'] }
    ] };
    expect(planLoad(multi, ['Giant Killer // Chop Down']).required).toEqual(['a', 'b']);
    expect(planLoad(multi, ['Giant Killer // Chop Down']).missing).toEqual([]);
  });

  test('reports unknown names instead of dropping them', () => {
    const plan = planLoad(index, ['Shock', 'Black Lotus']);
    expect(plan.missing).toEqual(['Black Lotus']);
  });

  test('keeps index order and de-duplicates pack ids', () => {
    expect(planLoad(index, ['Shock', 'Serra Angel', 'Mountain']).required).toEqual(['lands', 'core10']);
  });

  test('searchableNames and packFor expose the index without loading packs', () => {
    expect(searchableNames(index).sort()).toEqual(['Grizzly Bears', 'Mountain', 'Plains', 'Serra Angel', 'Shock']);
    expect(packFor(index, 'shock')?.id).toBe('core10');
    expect(packFor(index, 'Black Lotus')).toBeUndefined();
  });
});

describe('mergePacks', () => {
  test('merges entry maps and keeps the first definition', () => {
    const { catalog, conflicts } = mergePacks([
      { shock: { name: 'Shock', oracle_text: 'a' } },
      { shock: { name: 'Shock', oracle_text: 'b' }, forest: { name: 'Forest' } }
    ]);
    expect(Object.keys(catalog).sort()).toEqual(['forest', 'shock']);
    expect(catalog.shock).toEqual({ name: 'Shock', oracle_text: 'a' });
    // The overwrite is reported, never silent: the wording differs.
    expect(conflicts).toEqual([
      { name: 'shock', kept: 'pack-0', dropped: 'pack-1', conflict: 'rules_text', oracleIds: [null, null] }
    ]);
  });

  test('handles the flattened CardExportEntry shape without touching it', () => {
    const entry = { name: 'Shock', legalities: { modern: 'legal' }, face_index: 0 };
    expect(mergePacks([{ shock: entry }]).catalog.shock).toBe(entry);
  });
});
