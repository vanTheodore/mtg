/**
 * Coverage is evidence, and evidence has to be checkable.
 *
 * These tests use the artifacts produced by `scripts/build-coverage.ts` from
 * Phase's own `analyze_coverage`, so they fail if the pack, the artifact or the
 * policy drift apart. Synthetic documents cover the policy branches that the
 * real packs do not exercise (unknown pack, missing name, opt-in).
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CatalogIndex } from '../catalog.ts';
import { assessDeck, coverageUrl, describeAssessment, loadCoverage, type CoverageDocument, type Fetcher } from '../coverage.ts';

const root = new URL('../../../../', import.meta.url).pathname;
const readJson = (path: string) => JSON.parse(readFileSync(join(root, path), 'utf8'));

const index = readJson('static/data/catalog/index.json') as CatalogIndex;
const artifact = (pack: { id: string; sha256: string }) =>
  readJson(`static/data/catalog/coverage/${pack.id}.${pack.sha256.slice(0, 8)}.json`) as CoverageDocument;

describe('the shipped coverage describes the shipped packs', () => {
  test('every pack has an artifact pinned to its digest', () => {
    for (const pack of index.packs) {
      const document = artifact(pack);
      expect({ pack: pack.id, sha: document.pack_sha256 }).toEqual({ pack: pack.id, sha: pack.sha256 });
      expect(document.faces).toBe(pack.faces);
      expect(document.cards).toHaveLength(pack.faces);
    }
  });

  test('the summary adds up and exercised cards are real cards', () => {
    const tenE = artifact(index.packs.find((pack) => pack.id === '10e')!);
    expect(tenE.summary.cards).toBe(354);
    expect(tenE.summary.supported + tenE.summary.with_known_gaps).toBe(354);
    const byKey = new Set(tenE.cards.map((card) => card.key));
    const exercised = tenE.cards.filter((card) => card.exercised);
    expect(exercised.length).toBe(tenE.summary.exercised);
    expect(exercised.length).toBeGreaterThan(0);
    expect(exercised.length).toBeLessThan(354); // one game does not certify a set
    for (const card of exercised) expect(byKey.has(card.key)).toBe(true);
  });

  test('a known limitation is recorded with the phrase that caused it', () => {
    const tenE = artifact(index.packs.find((pack) => pack.id === '10e')!);
    const limited = tenE.cards.filter((card) => !card.supported);
    expect(limited.length).toBe(tenE.summary.with_known_gaps);
    for (const card of limited.slice(0, 20)) {
      expect(card.gap_count).toBeGreaterThan(0);
      expect(card.gaps.length).toBeGreaterThan(0);
    }
  });

  test('keywords survive the import: a printed "Flying" is not a parser gap', () => {
    const tenE = artifact(index.packs.find((pack) => pack.id === '10e')!);
    const flying = tenE.cards.find((card) => card.name === 'Air Elemental')!;
    // Before keywords were derived from the card text, this was
    // `Effect:unknown: Flying` — a rules difference disguised as a parse gap.
    expect(flying.supported).toBe(true);
    expect(flying.gaps).toEqual([]);
  });
});

describe('the start policy', () => {
  const packs = index.packs;
  const tenE = packs.find((pack) => pack.id === '10e')!;
  const fixture = packs.find((pack) => pack.id === 'fixture')!;

  const fetcherWith = (documents: Map<string, CoverageDocument>): Fetcher => async (url) => {
    for (const pack of packs) {
      if (url === coverageUrl(pack)) {
        const document = documents.get(pack.id);
        return document ? { ok: true, json: async () => document } : { ok: false, status: 404 };
      }
    }
    return { ok: false, status: 404 };
  };

  test('an admitted card is admitted; a limited one is listed with gaps', () => {
    const coverage = new Map([
      ['fixture', artifact(fixture)],
      ['10e', artifact(tenE)]
    ]);
    const supported = artifact(tenE).cards.find((card) => card.supported)!.name;
    const limited = artifact(tenE).cards.find((card) => !card.supported)!;
    const assessment = assessDeck([supported, limited.name], index, coverage);
    // The index keys are lower-cased; without a loaded face that is what we have.
    expect(assessment.admitted.map((card) => card.name)).toEqual([supported.toLowerCase()]);
    expect(assessment.limited.map((card) => card.name)).toEqual([limited.name.toLowerCase()]);
    // With the face in memory the printed casing comes back.
    const faces = { [supported.toLowerCase()]: { name: supported } };
    const spelled = assessDeck([supported], index, coverage, faces);
    expect(spelled.admitted.map((card) => card.name)).toEqual([supported]);
    expect(assessment.limited[0]!.gaps.length).toBeGreaterThan(0);
    expect(describeAssessment(assessment)).toContain('limitaciones conocidas');
  });

  test('a pack without an artifact is unknown, not incompatible', () => {
    const coverage = new Map([['fixture', artifact(fixture)], ['10e', null]]);
    const assessment = assessDeck(["Ancestor's Chosen"], index, coverage, { "ancestor's chosen": { name: "Ancestor's Chosen" } });
    expect(assessment.limited).toEqual([]);
    expect(assessment.unknown.map((card) => card.name)).toEqual(["Ancestor's Chosen"]);
    expect(describeAssessment(assessment)).toContain('sin evidencia');
  });

  test('a name the catalog cannot serve is missing, not silently dropped', () => {
    const assessment = assessDeck(['Totally Not A Card'], index, new Map());
    expect(assessment.missing).toEqual(['Totally Not A Card']);
    expect(describeAssessment(assessment)).toContain('no contiene');
  });

  test('the loader ignores an artifact whose digest does not match', async () => {
    const tampered = { ...artifact(tenE), pack_sha256: 'deadbeef' };
    const documents = new Map([['fixture', artifact(fixture)], ['10e', tampered]]);
    const loaded = await loadCoverage(fetcherWith(documents), [fixture, tenE]);
    expect(loaded.get('fixture')).not.toBeNull();
    expect(loaded.get('10e')).toBeNull();
  });

  test('a missing artifact is a 404, not an exception', async () => {
    const loaded = await loadCoverage(fetcherWith(new Map()), [fixture, tenE]);
    expect([...loaded.values()]).toEqual([null, null]);
  });

  test('the URL is content-addressed', () => {
    expect(coverageUrl(tenE)).toBe(`/data/catalog/coverage/10e.${tenE.sha256.slice(0, 8)}.json`);
  });
});
