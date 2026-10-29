/**
 * `verified` must mean something.
 *
 * The index flag alone is a promise; this test makes it checkable: a pack the
 * index marks play-certified needs a `docs/engine-coverage.json` record that
 * pins the same digest and states the card was parsed by Phase. Without it, the
 * flag would be an opinion — and the loader would happily start a game with
 * cards nobody ever parsed.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CatalogIndex } from '../catalog.ts';

const root = new URL('../../../../', import.meta.url).pathname;
const readJson = (path: string) => JSON.parse(readFileSync(path.startsWith('/') ? path : join(root, path), 'utf8'));

interface CoverageRecord {
  id: string;
  sha256: string;
  faces: number;
  levels: { found: boolean; parsed: boolean; coverage_known: boolean; exercised: boolean | 'parcial' };
  evidence: { kind: string; detail: string }[];
}

const index = readJson('static/data/catalog/index.json') as CatalogIndex;
const coveragePath = join(root, 'docs/engine-coverage.json');
const coverage = readJson(coveragePath) as { engine_source: string; packs: CoverageRecord[] };
const byId = new Map(coverage.packs.map((record) => [record.id, record]));

describe('play certification is evidence-backed', () => {
  test('every certified pack has a coverage record with the same digest', () => {
    const certified = index.packs.filter((pack) => pack.verified);
    expect(certified.length).toBeGreaterThan(0);
    for (const pack of certified) {
      const record = byId.get(pack.id);
      expect({ pack: pack.id, record: Boolean(record) }).toEqual({ pack: pack.id, record: true });
      expect(record!.sha256).toBe(pack.sha256);
      expect(record!.faces).toBe(pack.faces);
      expect(record!.levels.found).toBe(true);
      expect(record!.levels.parsed).toBe(true);
      expect(record!.evidence.some((entry) => entry.kind === 'parse')).toBe(true);
    }
  });

  test('every certified pack declares the engine build it was proven against', () => {
    expect(coverage.engine_source).toMatch(/^phase [0-9a-f]{40}$/);
  });

  test('a coverage record without a pack in the index is a stale claim', () => {
    const indexed = new Set(index.packs.map((pack) => pack.id));
    expect(coverage.packs.filter((record) => !indexed.has(record.id)).map((record) => record.id)).toEqual([]);
  });

  test('an uncertified pack may exist, but it must be flagged for the loader', () => {
    for (const pack of index.packs.filter((candidate) => !candidate.verified)) {
      const record = byId.get(pack.id);
      if (record) expect(record.levels.parsed === true ? record.levels.exercised : false).not.toBe(true);
    }
  });

  test('the certifying game evidence files are present', () => {
    for (const name of ['docs/parity-report.json', 'docs/scenarios-report.json']) {
      expect({ file: name, present: existsSync(join(root, name)) }).toEqual({ file: name, present: true });
    }
  });
});
