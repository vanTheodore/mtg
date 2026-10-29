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
 *   bun scripts/catalog-packs.ts --set-file set.atomic.json --out ... --set-code 10E
 *
 * Flags:
 *   --input <path>      AtomicCards v5 JSON (default static/data/cards.json)
 *   --set-file <path>   AtomicCards v5 file; alternative spelling of --input
 *                       that also records the set file in the provenance.
 *                       MTGJSON v3 set files are rejected: convert them first
 *                       with scripts/import-set.ts so Phase parses them.
 *   --out <dir>         output directory (default static/data/catalog)
 *   --pack-id <id>      pack id when writing a single pack (default: source stem)
 *   --pack-label <text> human label for the pack
 *   --set-code <code>   set code recorded in the index
 *   --packs <n>         split into n packs by name hash (default 1)
 *   --core <A,B>        names always loaded (repeated names, e.g. basic lands)
 *   --verified          mark the packs as play-certified
 *   --source <text>     provenance string recorded in the index
 *   --append            add these packs to the index already in --out instead of
 *                       replacing it (a real set next to the curated fixture);
 *                       the index version increments so caches cannot go stale
 *                       and names another pack already owns are removed from
 *                       the new pack (recorded in `overlap`), so the engine can
 *                       never see two faces for one name
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { isAtomicCardsFile, isMtgjsonV3SetFile, type AtomicCardsFile } from '../src/lib/game/catalog-source.ts';
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
const outDir = typeof args.out === 'string' ? args.out : 'static/data/catalog';
const packCount = Math.max(1, Number(args.packs ?? 1));
const setCode = typeof args['set-code'] === 'string' ? args['set-code'] : null;
const verified = args.verified === true;
const coreNames = typeof args.core === 'string' ? args.core.split(',').map((name) => name.trim()).filter(Boolean) : [];
const setFile = typeof args['set-file'] === 'string' ? args['set-file'] : null;
const inputArg = typeof args.input === 'string' ? args.input : null;

// `--set-file` *is* the source. It used to only switch the converter while the
// read still went to `--input` (or its default), so `--set-file 10E.es.json`
// silently packaged `static/data/cards.json`. One flag, one source, no default.
if (setFile && inputArg && setFile !== inputArg) {
  console.error('Usá --input o --set-file, no ambos: son dos fuentes distintas.');
  process.exit(2);
}
const input = setFile ?? inputArg ?? 'static/data/cards.json';
const source = typeof args.source === 'string'
  ? args.source
  : (setFile ? `MTGJSON set file ${basename(setFile)}` : `AtomicCards ${basename(input)}`);

const raw = JSON.parse(readFileSync(input, 'utf8')) as unknown;
if (isMtgjsonV3SetFile(raw)) {
  console.error([
    `El archivo ${input} está en formato MTGJSON v3 (raíz "cards"), no en AtomicCards v5.`,
    'Phase parsea AtomicCards v5: convertí el set primero con',
    `  bun scripts/import-set.ts --set-file ${input} --out <set.atomic.json>`,
    'y volvé a correr catalog-packs con --set-file <set.atomic.json>.',
    'No se escribió ningún pack.'
  ].join('\n'));
  process.exit(1);
}
/** Phase's own export (`cards.json`) is the flat map the engine deserializes. */
function isFlatCatalog(value: unknown): value is Catalog {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.values(value as Record<string, unknown>);
  // Phase's export has one entry per face (name → face object); MTGJSON AtomicCards
  // uses name → array and is handled above.
  return entries.length > 0
    && entries.every((face) => !!face && typeof face === 'object' && !Array.isArray(face));
}

if (!isAtomicCardsFile(raw) && !isFlatCatalog(raw)) {
  console.error(`El archivo ${input} no es AtomicCards v5 ("data") ni una exportación plana de Phase. No se escribió ningún pack.`);
  process.exit(1);
}
/**
 * AtomicCards groups faces under the combined printed name; a pack keyed like
 * Phase's own export has one entry per face, lower-cased (the engine lowercases
 * names when it loads, so the index must index the same string).
 */
function flattenAtomic(file: AtomicCardsFile): Catalog {
  const out: Catalog = {};
  for (const [name, faces] of Object.entries(file.data)) {
    for (const face of faces) {
      const faceName = String((face as { name?: string }).name ?? name.split(' // ')[0] ?? name);
      for (const key of [faceName, name]) {
        const normalized = key.toLocaleLowerCase('en-US');
        if (normalized && !(normalized in out)) out[normalized] = face as Catalog[string];
      }
    }
  }
  return out;
}

const catalog: Catalog = isAtomicCardsFile(raw) ? flattenAtomic(raw) : raw;

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

// `--append` must not ship a second face for a name the index already serves:
// the engine keys cards by name and would silently play one of the two, and the
// builder and the loader historically disagreed about which one. The new pack
// keeps only names nobody owns yet; the rest are recorded in `overlap`.
const previousIndex: CatalogIndex | null = args.append === true && existsSync(join(outDir, 'index.json'))
  ? JSON.parse(readFileSync(join(outDir, 'index.json'), 'utf8')) as CatalogIndex
  : null;
// The packs this run rewrites are not "other packs": their names are exactly the
// ones being replaced, so they must not count as owned.
const rewritten = new Set<string>([...Array(packCount).keys()].map((position) => (packCount === 1 ? baseId : `${baseId}-${position + 1}`)));
const ownedBy = new Map<string, string>();
for (const pack of previousIndex?.packs ?? []) {
  if (rewritten.has(pack.id)) continue;
  for (const name of pack.names) {
    const key = name.normalize('NFKC').trim().toLocaleLowerCase('en-US');
    if (!ownedBy.has(key)) ownedBy.set(key, pack.id);
  }
}

mkdirSync(join(outDir, 'packs'), { recursive: true });
const packs: CatalogPackMeta[] = [];
for (const [index, bucket] of buckets.entries()) {
  const overlap: Record<string, string[]> = {};
  const kept: string[] = [];
  for (const name of bucket) {
    const owner = ownedBy.get(name.normalize('NFKC').trim().toLocaleLowerCase('en-US'));
    if (owner) (overlap[owner] ??= []).push(name);
    else kept.push(name);
  }
  if (bucket.length && !kept.length) {
    console.error(`Todas las cartas de este pack ya pertenecen a otros packs (${Object.keys(overlap).join(', ')}); no se escribió nada.`);
    process.exit(1);
  }
  bucket.length = 0;
  bucket.push(...kept);
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
    source,
    // Names this pack would have carried but another pack owns. Recorded so the
    // overlap is auditable instead of invisible.
    ...(Object.keys(overlap).length ? { overlap } : {})
  });
}

// A name may appear in a core pack and again in a set pack; the index keeps the
// first entry, so core packs are listed first.
const indexPath = join(outDir, 'index.json');
const previous: CatalogIndex | null = previousIndex;
const replaced = new Set(packs.map((pack) => pack.id));
// `--append` replaces a pack with the same id but keeps every other pack: the
// fixture (basic lands + demo deck) has to survive adding a real set.
const kept = (previous?.packs ?? []).filter((pack) => !replaced.has(pack.id));
const combined = [...kept, ...packs].sort((a, b) => Number(b.core) - Number(a.core));
const index: CatalogIndex = {
  // The version is part of the client's pack-cache key: rebuilding any pack must
  // change it or a tab would keep serving the previous bytes.
  version: previous ? previous.version + 1 : 1,
  generated_at: new Date().toISOString(),
  format: 'atomic',
  packs: combined
};
writeFileSync(indexPath, JSON.stringify(index, null, 2));

const totalFaces = packs.reduce((sum, pack) => sum + pack.faces, 0);
const totalBytes = packs.reduce((sum, pack) => sum + pack.bytes, 0);
console.log(`${packs.length} pack(s) · ${names.length} nombres · ${totalFaces} caras · ${(totalBytes / 1024).toFixed(1)} KiB`);
for (const pack of packs) {
  const overlap = pack.overlap ? Object.entries(pack.overlap).map(([owner, list]) => `${list.length} de ${owner}`).join(', ') : null;
  if (overlap) console.log(`  ${pack.id}: ${overlap} ya pertenecían a otro pack; quedan fuera del pack`);
}
if (previous) console.log(`índice v${previous.version} → v${index.version} (${index.packs.length} packs)`);
console.log(`índice: ${join(outDir, 'index.json')}`);
for (const pack of packs) console.log(`  ${pack.id}: ${pack.names.length} nombres, ${(pack.bytes / 1024).toFixed(1)} KiB, verified=${pack.verified}`);
