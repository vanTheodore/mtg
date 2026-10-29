/**
 * Certification and cache identity over a real HTTP server.
 *
 * Two defects this locks down:
 * 1. The index carried `verified` but nothing read it, so a pack whose cards were
 *    never parsed by Phase and never exercised in a game started anyway, and the
 *    engine quietly skipped what it could not resolve.
 * 2. The pack cache was keyed by pack id alone. Rebuilding a pack (new hash, new
 *    bytes) still served the old body from memory.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { clearCatalogCache, loadCatalog, planLoad, type CatalogIndex, type CatalogPackMeta } from '../catalog.ts';

interface Served {
  index: CatalogIndex;
  packs: Record<string, Record<string, unknown>>;
}

let served: Served;
let requests: string[];
let server: ReturnType<typeof Bun.serve>;

const pack = (overrides: Partial<CatalogPackMeta> & { id: string; names: string[] }): CatalogPackMeta => ({
  label: overrides.id,
  set: null,
  core: false,
  verified: true,
  faces: overrides.names.length,
  bytes: 10,
  sha256: 'sha-' + overrides.id,
  source: 'test',
  ...overrides
});

beforeEach(() => {
  requests = [];
  served = {
    index: {
      version: 1,
      generated_at: '2026-10-29T00:00:00.000Z',
      format: 'atomic',
      packs: [
        pack({ id: 'lands', names: ['Plains', 'Mountain'], core: true }),
        pack({ id: 'certified', names: ['Shock'] }),
        pack({ id: 'raw', names: ['Ancestor\'s Chosen'], verified: false })
      ]
    },
    packs: {
      lands: { plains: { name: 'Plains' }, mountain: { name: 'Mountain' } },
      certified: { shock: { name: 'Shock' } },
      raw: { 'ancestor\'s chosen': { name: 'Ancestor\'s Chosen' } }
    }
  };
  server = Bun.serve({
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      requests.push(path);
      if (path === '/data/catalog/index.json') return Response.json(served.index);
      const match = /^\/data\/catalog\/packs\/(.+)\.json$/.exec(path);
      if (match && served.packs[match[1]!]) return Response.json(served.packs[match[1]!]);
      return new Response('not found', { status: 404 });
    }
  });
  clearCatalogCache();
});

afterEach(() => { server.stop(true); });

const fetcher = (url: string) => fetch(`http://127.0.0.1:${server.port}${url}`);
const options = {} as const;

describe('certification gate', () => {
  test('planLoad separates missing, verified and unverified cards', () => {
    const plan = planLoad(served.index, ['Shock', 'Ancestor\'s Chosen', 'Black Lotus']);
    expect(plan.missing).toEqual(['Black Lotus']);
    expect(plan.required).toEqual(['lands', 'certified', 'raw']);
    expect(plan.unverifiedPacks).toEqual(['raw']);
    expect(plan.unverified).toEqual(['Ancestor\'s Chosen']);
  });

  test('a deck of certified cards reports no unverified names', () => {
    const plan = planLoad(served.index, ['Plains', 'Shock']);
    expect(plan.unverified).toEqual([]);
    expect(plan.unverifiedPacks).toEqual([]);
  });

  test('loadCatalog surfaces the unverified names instead of hiding them', async () => {
    const loaded = await loadCatalog(fetcher, ['Ancestor\'s Chosen'], options);
    expect(loaded.missing).toEqual([]);
    expect(loaded.unverified).toEqual(['Ancestor\'s Chosen']);
    expect(loaded.unverifiedPacks).toEqual(['raw']);
    // The bytes are still fetched: the UI needs to name the card it refuses.
    expect(loaded.packs).toContain('raw');
  });

  test('core packs are always planned, and an unverified core pack would be flagged', () => {
    served.index.packs[0] = { ...served.index.packs[0]!, verified: false };
    const plan = planLoad(served.index, ['Shock']);
    expect(plan.required).toContain('lands');
    expect(plan.unverifiedPacks).toEqual(['lands']);
  });
});

describe('pack cache identity', () => {
  test('a rebuilt pack with a new digest is fetched again, not served stale', async () => {
    const first = await loadCatalog(fetcher, ['Shock'], options);
    expect(first.catalog.shock).toEqual({ name: 'Shock' });

    // Same id, new bytes, new hash, new index version: a rebuild.
    served.index = {
      ...served.index,
      version: 2,
      packs: served.index.packs.map((entry) => (entry.id === 'certified' ? { ...entry, sha256: 'sha-certified-v2' } : entry))
    };
    served.packs.certified = { shock: { name: 'Shock', oracle_text: 'rebuilt' } };

    const second = await loadCatalog(fetcher, ['Shock'], options);
    expect(second.catalog.shock).toEqual({ name: 'Shock', oracle_text: 'rebuilt' });
    expect(requests.filter((path) => path === '/data/catalog/packs/certified.json')).toHaveLength(2);
  });

  test('an unchanged digest keeps the cached body', async () => {
    await loadCatalog(fetcher, ['Shock'], options);
    requests.length = 0;
    await loadCatalog(fetcher, ['Shock'], options);
    expect(requests.filter((path) => path === '/data/catalog/packs/certified.json')).toEqual([]);
  });

  test('clearCatalogCache forces a refetch even with the same digest', async () => {
    await loadCatalog(fetcher, ['Shock'], options);
    clearCatalogCache();
    requests.length = 0;
    await loadCatalog(fetcher, ['Shock'], options);
    expect(requests.filter((path) => path === '/data/catalog/packs/certified.json')).toHaveLength(1);
  });
});
