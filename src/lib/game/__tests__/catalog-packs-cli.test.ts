/**
 * The pack generator is a CLI other steps depend on, so these tests run it for
 * real (Bun.spawn) against the real MTGJSON files in `data/mtgjson/`.
 *
 * Regression under test: `--set-file` used to only switch the converter while
 * the read still went to `--input` — or to its default `static/data/cards.json`.
 * `bun scripts/catalog-packs.ts --set-file 10E.es.json` therefore wrote a pack
 * built from the *demo fixture* and reported success. That is the worst failure
 * mode for a catalog pipeline: a plausible artifact with the wrong cards.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mtgjsonV3ToAtomic, type MtgjsonSetFile } from '../catalog-source.ts';
import type { CatalogIndex } from '../catalog.ts';

const root = new URL('../../../../', import.meta.url).pathname;
const readJson = (path: string) => JSON.parse(readFileSync(path.startsWith('/') ? path : join(root, path), 'utf8'));

function run(args: string[]) {
  const result = Bun.spawnSync([process.env.BUN ?? 'bun', 'scripts/catalog-packs.ts', ...args], {
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
    env: process.env
  });
  return {
    code: result.exitCode ?? -1,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString()
  };
}

function tempDir(label: string): string {
  return mkdtempSync(join(tmpdir(), `mesa-packs-${label}-`));
}

describe('catalog-packs --set-file reads the file it was given', () => {
  test('a real MTGJSON v3 set file is rejected instead of packaged as the fixture', () => {
    const out = tempDir('v3');
    try {
      const result = run(['--set-file', 'data/mtgjson/10E.es.json', '--out', out, '--set-code', '10E']);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('MTGJSON v3');
      expect(result.stderr).toContain('import-set.ts');
      // Nothing was written: no half-true pack, no index pointing at the fixture.
      expect(existsSync(join(out, 'index.json'))).toBe(false);
      expect(existsSync(join(out, 'packs'))).toBe(false);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  test('--input and --set-file together are refused instead of picking one', () => {
    const out = tempDir('both');
    try {
      const result = run(['--input', 'static/data/cards.json', '--set-file', 'data/mtgjson/10E.es.json', '--out', out]);
      expect(result.code).toBe(2);
      expect(result.stderr).toContain('no ambos');
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  test('a real v5 AtomicCards export becomes a pack with those cards, not the fixture ones', () => {
    const out = tempDir('atomic');
    const atomicPath = join(out, '10e.atomic.json');
    const source = readJson('data/mtgjson/10E.es.json') as MtgjsonSetFile;
    const converted = mtgjsonV3ToAtomic(source);
    // The set must survive the schema translation in enough volume to be useful.
    expect(Object.keys(converted.atomic.data).length).toBeGreaterThan(300);
    expect(converted.skipped).toEqual([]);
    Bun.write(atomicPath, JSON.stringify(converted.atomic));

    try {
      const result = run(['--set-file', atomicPath, '--out', out, '--set-code', '10E', '--pack-id', '10e']);
      expect(result.code).toBe(0);

      const index = readJson(join(out, 'index.json')) as CatalogIndex;
      expect(index.packs).toHaveLength(1);
      const pack = index.packs[0]!;
      expect(pack.id).toBe('10e');
      expect(pack.set).toBe('10E');
      expect(pack.verified).toBe(false); // no --verified: searchable, not play-certified
      expect(pack.source).toContain('10e.atomic.json');

      const payload = readJson(join(out, 'packs', '10e.json')) as Record<string, { name?: string }>;
      // Pack keys follow the engine: lower-cased, one entry per face.
      expect('serra angel' in payload).toBe(true);
      expect(payload['serra angel']!.name).toBe('Serra Angel');
      expect('ancestor\'s chosen' in payload).toBe(true);
      // The demo fixture's cards must not leak in through a stale default path.
      expect('lightning bolt' in payload).toBe(false);
      expect('faerie miscreant' in payload).toBe(false);
      expect(Object.keys(payload)).toHaveLength(pack.faces);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  test('the demo fixture still packages with no flags, into the directory given', () => {
    const out = tempDir('fixture');
    try {
      const result = run(['--out', out, '--pack-id', 'fixture', '--verified']);
      expect(result.code).toBe(0);
      const index = readJson(join(out, 'index.json')) as CatalogIndex;
      const pack = index.packs.find((candidate) => candidate.id === 'fixture')!;
      expect(pack.verified).toBe(true);
      expect(pack.source).toContain('cards.json');
      const payload = readJson(join(out, 'packs', 'fixture.json')) as Record<string, unknown>;
      expect('lightning bolt' in payload).toBe(true);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
