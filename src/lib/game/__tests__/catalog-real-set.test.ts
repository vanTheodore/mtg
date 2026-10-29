/**
 * A second real set, end to end, at the level a unit test can check.
 *
 * The pipeline is: MTGJSON v3 set file → `scripts/import-set.ts` → Phase's
 * `catalog` binary (`CardDatabase::from_mtgjson` + `export_subset_json`) → pack →
 * index. The pack itself was certified separately by `packcheck`
 * (`docs/packcheck-10e.json`): Phase deserialized it and played a full game with
 * these cards. What is checked here is that the *shipped* artifacts still match
 * that evidence and that the client still plans the right loads — no simulation
 * of the engine is involved.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { planLoad, searchableNames, type Catalog, type CatalogIndex } from '../catalog.ts';

const root = new URL('../../../../', import.meta.url).pathname;
const readJson = (path: string) => JSON.parse(readFileSync(join(root, path), 'utf8'));

const index = readJson('static/data/catalog/index.json') as CatalogIndex;
const pack = (id: string) => readJson(`static/data/catalog/packs/${id}.json`) as Catalog;

describe('the shipped catalog carries a second real set', () => {
  test('the index has a core pack and a real 10E pack', () => {
    expect(index.version).toBeGreaterThanOrEqual(2);
    expect(index.packs.map((entry) => entry.id).sort()).toEqual(['10e', 'fixture']);
    const core = index.packs.filter((entry) => entry.core);
    // Exactly one always-loaded pack: basics never depend on which deck plays.
    expect(core.map((entry) => entry.id)).toEqual(['fixture']);
    expect(index.packs.find((entry) => entry.id === '10e')!.set).toBe('10E');
  });

  test('every name the index advertises is really in its pack', () => {
    for (const meta of index.packs) {
      const payload = pack(meta.id);
      const keys = new Set(Object.keys(payload));
      const missing = meta.names.filter((name) => !keys.has(name));
      expect({ pack: meta.id, missing }).toEqual({ pack: meta.id, missing: [] });
      expect(Object.keys(payload)).toHaveLength(meta.faces);
    }
  });

  test('the 10E pack has the cards the certified game played, and only its own', () => {
    const tenE = pack('10e');
    for (const name of ['soul warden', 'youthful knight', "ancestor's chosen"]) {
      expect({ name, present: name in tenE }).toEqual({ name, present: true });
    }
    // `Serra Angel` is printed in both. The fixture owns the name (modern Oracle
    // text), so the set pack must not carry a second face for it.
    expect('serra angel' in tenE).toBe(false);
    expect('serra angel' in pack('fixture')).toBe(true);
    // Décima Edición does not ship basic lands in MTGJSON v3; the core pack does.
    expect('plains' in tenE).toBe(false);
    expect('plains' in pack('fixture')).toBe(true);
  });

  test('a 10E deck plans the core pack plus exactly one set pack', () => {
    const deck = readJson('docs/packcheck-10e-decks.json') as { player: { main_deck: string[] } };
    const plan = planLoad(index, deck.player.main_deck);
    expect(plan.missing).toEqual([]);
    expect(plan.unverified).toEqual([]);
    expect(plan.required).toEqual(['fixture', '10e']);
  });

  test('the builder can search 10E without downloading the pack', () => {
    const names = searchableNames(index);
    expect(names).toContain('serra angel');
    expect(names).toContain('lightning bolt'); // fixture
    // Searching is index-only: the test never fetches a pack to assert this.
    // 9 names exist in both packs (the core pack has demo staples from 10E), so
    // the union is smaller than the sum and the index must not double-count them.
    expect(names.length).toBe(444);
    expect(new Set(names).size).toBe(names.length);
  });

  test('an unknown card is reported as missing, never dropped', () => {
    // `ancestor's chosen` lives only in 10E; `Serra Angel` is in both packs.
    const plan = planLoad(index, ["Ancestor's Chosen", 'Totally Not A Card']);
    expect(plan.required).toEqual(['fixture', '10e']);
    expect(plan.missing).toEqual(['Totally Not A Card']);
  });

  test('the certification evidence names the same bytes as the index', () => {
    const coverage = readJson('docs/engine-coverage.json') as {
      packs: { id: string; sha256: string; faces: number; levels: { parsed: boolean } }[];
    };
    const record = coverage.packs.find((entry) => entry.id === '10e')!;
    const meta = index.packs.find((entry) => entry.id === '10e')!;
    expect(record.sha256).toBe(meta.sha256);
    expect(record.faces).toBe(meta.faces);
    expect(record.levels.parsed).toBe(true);
    const game = readJson('docs/packcheck-10e.json') as {
      loaded: boolean;
      unresolved_names: string[];
      resolved: { player: number; opponent: number };
      steps: number;
      game_over: unknown;
    };
    expect({ loaded: game.loaded, unresolved: game.unresolved_names }).toEqual({ loaded: true, unresolved: [] });
    expect(game.resolved).toEqual({ player: 40, opponent: 40 });
    expect(game.steps).toBeGreaterThan(100);
    expect(game.game_over).not.toBeNull();
  });
});
