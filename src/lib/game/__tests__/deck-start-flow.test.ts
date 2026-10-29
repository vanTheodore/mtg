/**
 * The flow the UI drives, executed for real — minus the pixels.
 *
 * A browser is not available in this environment, so the end-to-end spec stays
 * pending. What *can* be executed is everything between the pasted list and the
 * engine boundary: the same modules `Board.svelte` and `DeckBuilder.svelte` call,
 * over a real HTTP server serving the real `static/` tree, with the real index,
 * packs and coverage artifacts.
 *
 * If this test passes and the UI wiring is what the components show, the only
 * unproven part left is Chromium itself — which is exactly what the E2E covers
 * on a machine that has it.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clearCatalogCache, loadCatalog } from '../catalog.ts';
import { assessDeck, loadCoverage } from '../coverage.ts';
import { deckStatus, parseDeckList, toEngineDeck } from '../decks.ts';

const root = new URL('../../../../', import.meta.url).pathname;
const spec = readFileSync(join(root, 'tests/e2e/ui-deck-10e.spec.ts'), 'utf8');
const deckText = [...(/const DECK = \[([\s\S]*?)\]\.join/.exec(spec)?.[1] ?? '').matchAll(/'([^']+)'/g)]
  .map((match) => match[1]!)
  .join('\n');
const lines = parseDeckList(deckText).lines;

let server: ReturnType<typeof Bun.serve>;
let base: string;
const requested: string[] = [];

beforeAll(() => {
  clearCatalogCache();
  server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      requested.push(url.pathname + url.search);
      const file = Bun.file(join(root, 'static', url.pathname));
      if (!file.size) return new Response('not found', { status: 404 });
      return new Response(file);
    }
  });
  base = `http://127.0.0.1:${server.port}`;
});

afterAll(() => server.stop(true));

/** `fetch` in the app takes absolute paths; point them at the test server. */
const fetcher = (url: string) => fetch(`${base}${url}`);

describe('pasted 10E deck → engine boundary', () => {
  test('the builder sees pending cards, not missing ones, before any download', async () => {
    const core = await loadCatalog(fetcher, [], { corePacksOnly: true });
    const withoutEvidence = deckStatus(lines, { index: core.index, catalog: core.catalog });
    // Without coverage nothing can be called a known limitation: 23 pending.
    expect(withoutEvidence.copies).toEqual({ absent: 0, limited: 0, pending: 23, ready: 17, total: 40 });
    expect(withoutEvidence.canStart).toBe(true);

    // The builder asks for the coverage of the packs it touches: a few KB that
    // turn one pending card into a known limitation without downloading a pack.
    const coverage = await loadCoverage(fetcher, core.index.packs.filter((pack) => withoutEvidence.neededPacks.includes(pack.id)));
    const status = deckStatus(lines, { index: core.index, catalog: core.catalog, coverage });
    expect(status.copies).toEqual({ absent: 0, limited: 1, pending: 22, ready: 17, total: 40 });
    expect(status.limited.map((entry) => entry.line.name)).toEqual(['Arcane Teachings']);
    expect(status.pendingPacks).toEqual(['10e']);
    expect(status.unknown).toEqual([]);
    expect(status.canStart).toBe(true);
    // No card pack was fetched: only the core pack at mount.
    expect(requested.filter((path) => path.startsWith('/data/catalog/packs/')).map((path) => path.split('?')[0]))
      .toEqual(['/data/catalog/packs/fixture.json']);
  });

  test('starting downloads exactly the pack the deck needs, verified by digest', async () => {
    requested.length = 0;
    const loaded = await loadCatalog(fetcher, lines.map((line) => line.name));
    expect(loaded.missing).toEqual([]);
    expect(loaded.unverified).toEqual([]);
    expect([...loaded.packs].sort()).toEqual(['10e', 'fixture']);
    const packRequests = requested.filter((path) => path.startsWith('/data/catalog/packs/'));
    for (const path of packRequests) expect(path).toMatch(/\?v=[0-9a-f]{64}$/);
    expect(packRequests.map((path) => path.split('?')[0])).toEqual(['/data/catalog/packs/10e.json']);

    // Every deck name really is in the merged catalog the engine would receive.
    for (const line of lines) {
      expect({ card: line.name, present: loaded.catalog[line.name.toLocaleLowerCase('en-US')] !== undefined })
        .toEqual({ card: line.name, present: true });
    }
  });

  test('the coverage artifact names the one card that needs consent', async () => {
    const loaded = await loadCatalog(fetcher, lines.map((line) => line.name));
    const coverage = await loadCoverage(fetcher, loaded.index.packs.filter((pack) => loaded.packs.includes(pack.id)));
    expect(coverage.get('10e')).not.toBeNull();

    const assessment = assessDeck(lines.map((line) => line.name), loaded.index, coverage, loaded.catalog);
    // 13 distinct names: 12 admitted + the one limitation. Copies are 40.
    expect(assessment.admitted.length).toBe(12);
    expect(assessment.limited.map((card) => card.name)).toEqual(['Arcane Teachings']);
    expect(assessment.limited[0]!.gaps).toEqual(['SilentDrop:1_of_2']);
    expect(assessment.missing).toEqual([]);
  });

  test('the deck reaches the engine with 40 cards per seat', async () => {
    const payload = toEngineDeck(lines);
    expect(payload.player.main_deck).toHaveLength(40);
    expect(payload.opponent.main_deck).toHaveLength(40);
    expect(new Set(payload.player.main_deck).size).toBe(13);
  });
});
