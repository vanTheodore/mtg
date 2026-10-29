#!/usr/bin/env bun
/**
 * Split a card database into catalog packs + an index.
 *
 * Input is the `AtomicCards` shape Phase reads (`{ [name]: CardFace[] }`).
 * Output is `static/data/catalog/index.json` plus one file per pack. The client
 * resolves a deck's card names against the index and fetches only the packs it
 * needs, instead of shipping the whole database to every game.
 *
 * Usage:
 *   bun scripts/catalog-packs.ts --input <cards.json> --out static/data/catalog
 *   bun scripts/catalog-packs.ts --input <cards.json> --out static/data/catalog --packs 4
 *   bun scripts/catalog-packs.ts --set-file 10E.es.json --out ... --set-code 10E
 *
 * Flags:
 *   --input <path>      AtomicCards JSON (default static/data/cards.json)
 *   --set-file <path>   MTGJSON v3/v4 set file instead of an AtomicCards file
 *   --out <dir>         output directory (default static/data/catalog)
 *   --pack-id <id>      pack id when writing a single pack (default: source stem)
 *   --pack-label <text> human label for the pack
 *   --set-code <code>   set code recorded in the index
 *   --packs <n>         split into n packs by name hash (default 1)
 *   --core <A,B>        names always loaded (repeated names, e.g. basic lands)
 *   --verified          mark the packs as play-certified
 *   --source <text>     provenance string recorded in the index
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { atomicFromMtgjsonSet, type MtgjsonSetFile } from '../src/lib/game/catalog-source.ts';
import type { Catalog, CatalogIndex, CatalogPackMeta } from '../src/lib/game/catalog.ts';

type Args = Record<string, string | true>;

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) { args[key] = next; i += 1; }
    else args[key] = true;
  }
  return args;
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/** Deterministic hash so the same catalog always produces the same split. */
function bucketOf(name: string, buckets: number): number {
  const digest = createHash('sha256').update(name).digest();
  return digest.readUInt32BE(0) % buckets;
}

const args = parseArgs(process.argv.slice(2));
const input = typeof args.input === 'string' ? args.input : 'static/data/cards.json';
const outDir = typeof args.out === 'string' ? args.out : 'static/data/catalog';
const packCount = Math.max(1, Number(args.packs ?? 1));
const setCode = typeof args['set-code'] === 'string' ? args['set-code'] : null;
const verified = args.verified === true;
const coreNames = typeof args.core === 'string' ? args.core.split(',').map((name) => name.trim()).filter(Boolean) : [];
const source = typeof args.source === 'string'
  ? args.source
  : (typeof args['set-file'] === 'string' ? `MTGJSON set file ${basename(input)}` : `AtomicCards ${basename(input)}`);

const catalog: Catalog = typeof args['set-file'] === 'string'
  ? atomicFromMtgjsonSet(JSON.parse(readFileSync(input, 'utf8')) as MtgjsonSetFile) as unknown as Catalog
  : JSON.parse(readFileSync(input, 'utf8')) as Catalog;

const names = Object.keys(catalog);
if (!names.length) {
  console.error(`El catálogo ${input} no tiene cartas.`);
  process.exit(1);
}

const baseId = typeof args['pack-id'] === 'string'
  ? args['pack-id']
  : (setCode ?? basename(input).replace(/\.json$/i, '')).toLowerCase();
const baseLabel = typeof args['pack-label'] === 'string' ? args['pack-label'] : (setCode ?? baseId);

const buckets: string[][] = Array.from({ length: packCount }, () => []);
for (const name of names) {
  if (packCount === 1) buckets[0]!.push(name);
  else buckets[bucketOf(name, packCount)]!.push(name);
}

mkdirSync(join(outDir, 'packs'), { recursive: true });
const packs: CatalogPackMeta[] = [];
for (const [index, bucket] of buckets.entries()) {
  if (!bucket.length) continue;
  const payload: Catalog = {};
  for (const name of bucket) payload[name] = catalog[name]!;
  const text = JSON.stringify(payload);
  const id = packCount === 1 ? baseId : `${baseId}-${index + 1}`;
  writeFileSync(join(outDir, 'packs', `${id}.json`), text);
  packs.push({
    id,
    label: packCount === 1 ? baseLabel : `${baseLabel} (${index + 1}/${packCount})`,
    names: bucket.sort((a, b) => a.localeCompare(b)),
    set: setCode,
    // Core packs always load: basic lands are searched by name from every deck.
    core: bucket.some((name) => coreNames.some((core) => core.toLowerCase() === name.toLowerCase())),
    verified,
    // One entry per face: multi-face cards are stored as one entry per face name.
    faces: bucket.length,
    bytes: Buffer.byteLength(text),
    sha256: sha256(text),
    source
  });
}

// A name may appear in a core pack and again in a set pack; the index keeps the
// first entry, so core packs are written first in the array order above.
const index: CatalogIndex = {
  version: 1,
  generated_at: new Date().toISOString(),
  format: 'atomic',
  packs
};
writeFileSync(join(outDir, 'index.json'), JSON.stringify(index, null, 2));

const totalFaces = packs.reduce((sum, pack) => sum + pack.faces, 0);
const totalBytes = packs.reduce((sum, pack) => sum + pack.bytes, 0);
console.log(`${packs.length} pack(s) · ${names.length} nombres · ${totalFaces} caras · ${(totalBytes / 1024).toFixed(1)} KiB`);
console.log(`índice: ${join(outDir, 'index.json')}`);
for (const pack of packs) console.log(`  ${pack.id}: ${pack.names.length} nombres, ${(pack.bytes / 1024).toFixed(1)} KiB, verified=${pack.verified}`);
