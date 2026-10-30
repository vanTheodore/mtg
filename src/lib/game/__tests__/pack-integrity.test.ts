/**
 * Pack integrity, against the real shipped files.
 *
 * The index already declared `bytes` and `sha256`; the loader now proves them
 * before a pack is adopted, so an altered, truncated, swapped or stale file
 * cannot reach the engine. Every case here tampers with a real byte stream and
 * asserts the *specific* refusal, not just "some error".
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clearCatalogCache, loadCatalog, loadPack, sha256Hex, type CatalogIndex, type CatalogPackMeta } from '../catalog.ts';

const root = new URL('../../../../', import.meta.url).pathname;
const index = JSON.parse(readFileSync(join(root, 'static/data/catalog/index.json'), 'utf8')) as CatalogIndex;
const packFile = (id: string) => readFileSync(join(root, `static/data/catalog/packs/${id}.json`), 'utf8');
const fixture = index.packs.find((pack) => pack.id === 'fixture')!;
const tenE = index.packs.find((pack) => pack.id === '10e')!;

interface Served {
  bodies: Map<string, string>;
  urls: string[];
}

let served: Served;
let server: ReturnType<typeof Bun.serve>;

beforeEach(() => {
  served = {
    bodies: new Map([
      ['fixture', packFile('fixture')],
      ['10e', packFile('10e')]
    ]),
    urls: []
  };
  server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      served.urls.push(url.pathname + url.search);
      if (url.pathname === '/data/catalog/index.json') return Response.json(index);
      const match = /^\/data\/catalog\/packs\/(.+)\.json$/.exec(url.pathname);
      const body = match ? served.bodies.get(match[1]!) : undefined;
      return body === undefined ? new Response('not found', { status: 404 }) : new Response(body);
    }
  });
  clearCatalogCache();
});

afterEach(() => server.stop(true));

const fetcher = (url: string) => fetch(`http://127.0.0.1:${server.port}${url}`);

describe('the index describes the files it ships', () => {
  test('every pack matches its declared byte length and digest', async () => {
    for (const [id, body] of served.bodies) {
      const meta = index.packs.find((pack) => pack.id === id)!;
      expect(Buffer.byteLength(body)).toBe(meta.bytes!);
      expect(new Bun.CryptoHasher('sha256').update(body).digest('hex')).toBe(meta.sha256);
    }
  });

  test('a verified pack loads, from a content-addressed URL', async () => {
    const catalog = await loadPack(fetcher, index, '10e');
    expect(Object.keys(catalog).length).toBe(tenE.faces);
    const urls = served.urls.filter((url) => url.startsWith('/data/catalog/packs/'));
    expect(urls).toEqual([`/data/catalog/packs/10e.json?v=${tenE.sha256}`]);
  });
});

describe('a pack that does not match the index is refused', () => {
  const expectRefusal = async (pattern: RegExp) => {
    await expect(loadPack(fetcher, index, '10e')).rejects.toThrow(pattern);
  };

  test('altered: same length, one character different', async () => {
    const body = packFile('10e');
    const at = body.lastIndexOf('"mana_cost"');
    expect(at).toBeGreaterThan(0);
    served.bodies.set('10e', `${body.slice(0, at)}"mana_cosu"${body.slice(at + 11)}`);
    await expectRefusal(/no coincide con el índice/);
  });

  test('truncated: fewer bytes than declared', async () => {
    served.bodies.set('10e', packFile('10e').slice(0, -1024));
    await expectRefusal(/llegó incompleto/);
  });

  test('swapped: another real pack under this name', async () => {
    served.bodies.set('10e', packFile('fixture'));
    await expectRefusal(/llegó incompleto/);
  });

  test('stale: the index already knows a newer digest', async () => {
    // A rebuild bumped the index but the host still serves the previous file.
    const stale = { ...tenE, sha256: 'a'.repeat(64) } as CatalogPackMeta;
    await expect(
      loadPack(fetcher, { ...index, packs: index.packs.map((pack) => (pack.id === '10e' ? stale : pack)) }, '10e')
    ).rejects.toThrow(/no coincide con el índice/);
  });

  test('the refusal is not cached: a corrected file loads afterwards', async () => {
    served.bodies.set('10e', packFile('10e').slice(0, -8));
    await expect(loadPack(fetcher, index, '10e')).rejects.toThrow(/llegó incompleto/);
    served.bodies.set('10e', packFile('10e'));
    const catalog = await loadPack(fetcher, index, '10e');
    expect(Object.keys(catalog).length).toBe(tenE.faces);
  });
});

describe('the verifier never pretends to have checked', () => {
  test('without crypto.subtle the loader says so instead of trusting the file', async () => {
    await expect(sha256Hex('{}', null)).rejects.toThrow(/contexto seguro/);
  });

  test('the digest is the file digest, lowercase hex', async () => {
    const body = packFile('10e');
    expect(await sha256Hex(body)).toBe(tenE.sha256);
    expect(await sha256Hex(body)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('a whole session refuses a bad pack instead of starting short', () => {
  test('loadCatalog fails when one required pack is truncated', async () => {
    served.bodies.set('10e', packFile('10e').slice(0, -64));
    await expect(loadCatalog(fetcher, ['Shock', 'Air Elemental'])).rejects.toThrow(/llegó incompleto/);
  });
});
