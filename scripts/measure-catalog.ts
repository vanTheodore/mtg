#!/usr/bin/env bun
/**
 * Catalog scaling measurement.
 *
 * Compares the single-file baseline (`/data/cards.json`, what the app shipped in
 * phase 0.3) with the pack pipeline at 1×, 5× and 20× the current catalog size.
 * The larger tiers are *synthetic*: the same 90 real entries replicated with a
 * suffix so the parser, the merge and the index see realistic name counts. It
 * measures the client data layer (bytes, parse, merge, heap), not game rules and
 * not paint — those need a browser and are reported elsewhere.
 *
 * Usage: bun scripts/measure-catalog.ts [--out docs/performance-catalog.json]
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planLoad, type Catalog, type CatalogIndex } from '../src/lib/game/catalog.ts';

const arg = (name: string, fallback: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
};

const source = 'static/data/cards.json';
const base = JSON.parse(readFileSync(source, 'utf8')) as Catalog;
const baseNames = Object.keys(base);
const workDir = mkdtempSync(join(tmpdir(), 'mesa-catalog-'));

interface Tier { label: string; multiplier: number; catalog: Catalog; names: string[] }

function expand(multiplier: number): Catalog {
  if (multiplier === 1) return base;
  const out: Catalog = {};
  for (let copy = 0; copy < multiplier; copy += 1) {
    for (const name of baseNames) {
      const entry = base[name]!;
      const key = copy === 0 ? name : `${name} variant ${copy}`;
      out[key] = copy === 0 ? entry : { ...entry, name: `${(entry.name as string) ?? name} (variante ${copy})` };
    }
  }
  return out;
}

const tiers: Tier[] = [1, 5, 20].map((multiplier) => {
  const catalog = expand(multiplier);
  return { label: multiplier === 1 ? '1× (real)' : `${multiplier}× (sintético)`, multiplier, catalog, names: Object.keys(catalog) };
});

function heapUsedMb(): number {
  return Math.round((process.memoryUsage().heapUsed / (1024 * 1024)) * 10) / 10;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

interface Result {
  label: string;
  names: number;
  singleFileBytes: number;
  singleFileParseMs: number;
  packFiles: number;
  packBytes: number;
  indexBytes: number;
  indexParseMs: number;
  planMs: number;
  packsFetchedForDeck: number;
  bytesFetchedForDeck: number;
  mergeMs: number;
  heapAfterMb: number;
  /** Second policy: set-sized packs (~300 faces), deck drawn from one set. */
  setPolicy: { packCount: number; bytesFetchedForDeck: number; packsTouched: number; coreBytes: number };
}

const results: Result[] = [];

for (const tier of tiers) {
  // ── baseline: one big file, parsed whole ───────────────────────────────────
  const singlePath = join(workDir, `single-${tier.multiplier}.json`);
  const singleText = JSON.stringify(tier.catalog);
  writeFileSync(singlePath, singleText);
  const parseSamples: number[] = [];
  for (let i = 0; i < 5; i += 1) {
    const started = performance.now();
    JSON.parse(readFileSync(singlePath, 'utf8')) as Catalog;
    parseSamples.push(performance.now() - started);
  }

  // ── packs: 4 shards, deterministic split by name hash ──────────────────────
  const shards = 4;
  const buckets: string[][] = Array.from({ length: shards }, () => []);
  for (const name of tier.names) {
    const bucket = createHash('sha256').update(name).digest().readUInt32BE(0) % shards;
    buckets[bucket]!.push(name);
  }
  const index: CatalogIndex = { version: 1, generated_at: new Date().toISOString(), format: 'atomic', packs: [] };
  let packBytes = 0;
  for (const [position, bucket] of buckets.entries()) {
    const payload: Catalog = {};
    for (const name of bucket) payload[name] = tier.catalog[name]!;
    const text = JSON.stringify(payload);
    packBytes += Buffer.byteLength(text);
    writeFileSync(join(workDir, `pack-${tier.multiplier}-${position}.json`), text);
    index.packs.push({
      id: `p${position}`, label: `p${position}`, names: bucket, set: null, core: position === 0,
      verified: false, faces: bucket.length, bytes: Buffer.byteLength(text),
      sha256: createHash('sha256').update(text).digest('hex'), source: 'measure'
    });
  }
  const indexText = JSON.stringify(index);
  writeFileSync(join(workDir, `index-${tier.multiplier}.json`), indexText);

  const indexParseSamples: number[] = [];
  for (let i = 0; i < 5; i += 1) {
    const started = performance.now();
    JSON.parse(readFileSync(join(workDir, `index-${tier.multiplier}.json`), 'utf8')) as CatalogIndex;
    indexParseSamples.push(performance.now() - started);
  }

  // ── a realistic 40-card deck: 18 lands + 22 copies of one creature ─────────
  const deckNames = [...new Set([
    ...Array(18).fill('Plains'),
    ...Array(22).fill(tier.names.find((name) => name.includes('savannah')) ?? tier.names[0]!)
  ])];
  const planSamples: number[] = [];
  let plan = { required: [] as string[], missing: [] as string[] };
  for (let i = 0; i < 5; i += 1) {
    const started = performance.now();
    plan = planLoad(index, deckNames);
    planSamples.push(performance.now() - started);
  }

  const mergeSamples: number[] = [];
  let merged: Catalog = {};
  for (let i = 0; i < 5; i += 1) {
    const started = performance.now();
    merged = {};
    for (const id of plan.required) {
      const payload = JSON.parse(readFileSync(join(workDir, `pack-${tier.multiplier}-${id.slice(1)}.json`), 'utf8')) as Catalog;
      for (const [name, entry] of Object.entries(payload)) if (!(name in merged)) merged[name] = entry;
    }
    mergeSamples.push(performance.now() - started);
  }

  const bytesFetched = plan.required.reduce((sum, id) => sum + (index.packs.find((pack) => pack.id === id)?.bytes ?? 0), 0);

  // Set-sized packs: the shape real data would have (one pack per set, ~300
  // faces). A deck built from one set plus basic lands touches two packs.
  const SET_SIZE = 300;
  const setPacks: string[][] = [];
  for (let start = 0; start < tier.names.length; start += SET_SIZE) setPacks.push(tier.names.slice(start, start + SET_SIZE));
  const setBytes = setPacks.map((packNames) => {
    const payload: Catalog = {};
    for (const name of packNames) payload[name] = tier.catalog[name]!;
    return Buffer.byteLength(JSON.stringify(payload));
  });
  const coreIndex = setPacks.findIndex((packNames) => packNames.includes('Plains'));
  const deckCard = deckNames.find((name) => name !== 'Plains')!;
  const deckSetIndex = setPacks.findIndex((packNames) => packNames.includes(deckCard));
  const touched = [...new Set([coreIndex, deckSetIndex])].filter((position) => position >= 0);
  const setPolicy = {
    packCount: setPacks.length,
    packsTouched: touched.length,
    bytesFetchedForDeck: touched.reduce((sum, position) => sum + (setBytes[position] ?? 0), 0),
    coreBytes: coreIndex >= 0 ? setBytes[coreIndex]! : 0
  };
  results.push({
    label: tier.label,
    names: tier.names.length,
    singleFileBytes: Buffer.byteLength(singleText),
    singleFileParseMs: Math.round(median(parseSamples) * 100) / 100,
    packFiles: index.packs.length,
    packBytes,
    indexBytes: Buffer.byteLength(indexText),
    indexParseMs: Math.round(median(indexParseSamples) * 100) / 100,
    planMs: Math.round(median(planSamples) * 1000) / 1000,
    packsFetchedForDeck: plan.required.length,
    bytesFetchedForDeck: bytesFetched,
    mergeMs: Math.round(median(mergeSamples) * 100) / 100,
    heapAfterMb: heapUsedMb(),
    setPolicy
  });
}

rmSync(workDir, { recursive: true, force: true });

const report = {
  generated_at: new Date().toISOString(),
  runtime: `Bun ${Bun.version}`,
  catalog_source: source,
  method: {
    tiers: '1× is the real 90-face catalog; 5× and 20× replicate it with a name suffix (synthetic scale, not game-verified cards).',
    packs: '4 shards split by sha256 of the card name; one shard marked core.',
    deck: '18 basic lands + 22 copies of one creature (the practice duel shape).',
    samples: 5,
    measured: 'JSON parse, index plan and pack merge in Bun; heap is process-wide and includes the samples.',
    not_measured: 'Browser fetch, WASM catalog load inside the engine, paint. Phase 0.3 numbers for those stand on their own commit.'
  },
  results
};

const out = arg('out', 'docs/performance-catalog.json');
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(`escrito ${out}`);
for (const row of results) {
  console.log(`${row.label}: ${row.names} nombres · archivo único ${(row.singleFileBytes / 1024).toFixed(0)} KiB (parse ${row.singleFileParseMs} ms) · índice ${(row.indexBytes / 1024).toFixed(1)} KiB · plan ${row.planMs} ms · merge ${row.mergeMs} ms`);
  console.log(`   packs de 4 shards: ${(row.bytesFetchedForDeck / 1024).toFixed(0)} KiB en ${row.packsFetchedForDeck} pack(s) · packs por set (~300): ${row.setPolicy.packCount} packs, ${(row.setPolicy.bytesFetchedForDeck / 1024).toFixed(0)} KiB en ${row.setPolicy.packsTouched} pack(s)`);
}
