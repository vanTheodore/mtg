/**
 * End-to-end data path without a browser: a real Bun HTTP server serves the
 * generated `static/` tree, and `loadCatalog` fetches the index and the packs the
 * way the app does. It proves the shipped files, URLs and merge logic agree with
 * the engine payload — the part a unit test with mocks cannot catch.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clearCatalogCache, loadCatalog } from '../catalog.ts';

const root = new URL('../../../../', import.meta.url).pathname;
const cards = JSON.parse(readFileSync(join(root, 'static/data/cards.json'), 'utf8')) as Record<string, unknown>;

let server: ReturnType<typeof Bun.serve>;
let base: string;
const requested: string[] = [];

beforeAll(() => {
  clearCatalogCache();
  server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      requested.push(url.pathname);
      const file = Bun.file(join(root, 'static', url.pathname));
      // Mirrors a static host: missing files are a 404, not a server crash.
      if (!file.size) return new Response('not found', { status: 404 });
      return new Response(file);
    }
  });
  base = `http://127.0.0.1:${server.port}`;
});

afterAll(() => { server.stop(true); });

/** The app calls `fetch` with absolute paths; map them onto the test server. */
const fetcher = (url: string) => fetch(`${base}${url}`);

describe('catalog over HTTP', () => {
  test('loads exactly the packs a practice deck needs and merges them', async () => {
    requested.length = 0;
    const loaded = await loadCatalog(fetcher, ['Plains', 'Savannah Lions']);
    expect(loaded.missing).toEqual([]);
    expect(loaded.packs).toEqual(['fixture']);
    expect(Object.keys(loaded.catalog).length).toBeGreaterThan(0);
    // Every merged entry must be byte-identical to the engine catalog entry.
    for (const [name, entry] of Object.entries(loaded.catalog)) {
      expect(JSON.stringify(entry)).toBe(JSON.stringify(cards[name]));
    }
    expect(requested).toContain('/data/catalog/index.json');
    expect(requested).toContain('/data/catalog/packs/fixture.json');
  });

  test('reports a card the index cannot serve instead of loading everything', async () => {
    const loaded = await loadCatalog(fetcher, ['Black Lotus']);
    expect(loaded.missing).toEqual(['Black Lotus']);
    // Core packs are still loaded so the board can render lands.
    expect(loaded.packs).toEqual(['fixture']);
  });

  test('a second call reuses the cached pack instead of refetching', async () => {
    requested.length = 0;
    await loadCatalog(fetcher, ['Shock']);
    expect(requested.filter((path) => path === '/data/catalog/packs/fixture.json')).toEqual([]);
  });

  test('a missing index surfaces a readable error, not an empty catalog', async () => {
    clearCatalogCache();
    await expect(loadCatalog(fetcher, ['Plains'], { indexUrl: '/data/catalog/missing.json' }))
      .rejects.toThrow(/No se pudo cargar .*missing\.json \(HTTP 404\)/);
  });
});
