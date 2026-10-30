#!/usr/bin/env bun
/**
 * Convert an MTGJSON v3 set file (for example the Spanish `10E.es.json`) into the
 * v5 AtomicCards shape Phase parses, so the *engine* — not a TypeScript
 * converter — produces the catalog Mesa ships.
 *
 * The output of this step is an intermediate file: feed it to
 *   cargo run -p mtg-engine-wasm --bin catalog -- <set.atomic.json> <out-dir>
 * and use the `cards.json` Phase writes as the pack source. That keeps card
 * identity, faces and rules text owned by Phase.
 *
 * Usage:
 *   bun scripts/import-set.ts --set-file data/mtgjson/10E.es.json --out /tmp/10E.atomic.json
 *
 * Flags:
 *   --set-file <path>  MTGJSON v3 set file (required)
 *   --out <path>       destination AtomicCards JSON (default: <set>.atomic.json)
 *   --allow-multiface  keep going when multi-face cards had to be skipped
 *                      (they are reported either way; the default is to fail so
 *                      a partial set is never silently certified)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { isMtgjsonV3SetFile, mtgjsonV3ToAtomic, type MtgjsonSetFile } from '../src/lib/game/catalog-source.ts';

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

const args = parseArgs(process.argv.slice(2));
const setFile = typeof args['set-file'] === 'string' ? args['set-file'] : null;
if (!setFile) {
  console.error('Falta --set-file <archivo MTGJSON v3>.');
  process.exit(2);
}

const raw = JSON.parse(readFileSync(setFile, 'utf8')) as unknown;
if (!isMtgjsonV3SetFile(raw)) {
  console.error(`${setFile} no es un archivo de set MTGJSON v3 (falta el arreglo "cards").`);
  console.error('Si ya está en AtomicCards v5, usá catalog-packs --set-file directamente.');
  process.exit(1);
}

const source = raw as MtgjsonSetFile;
const converted = mtgjsonV3ToAtomic(source);
const total = source.cards?.length ?? 0;
const faces = Object.keys(converted.atomic.data).length;

if (!faces) {
  console.error(`No se pudo convertir ninguna de las ${total} cartas de ${setFile}.`);
  process.exit(1);
}

if (converted.skipped.length && args['allow-multiface'] !== true) {
  console.error(
    `${converted.skipped.length} cartas no se pueden representar en AtomicCards sin inventar datos: `
    + `${converted.skipped.slice(0, 6).map((card) => card.name).join(', ')}${converted.skipped.length > 6 ? '…' : ''}`
  );
  console.error('Volvé a correr con --allow-multiface si un set parcial te sirve (quedará marcado como parcial).');
  process.exit(1);
}

const out = typeof args.out === 'string'
  ? args.out
  : join(dirname(setFile), basename(setFile).replace(/\.json$/i, '') + '.atomic.json');

const atomic = {
  ...converted.atomic,
  meta: {
    ...converted.atomic.meta,
    converted_from: basename(setFile),
    converted_at: new Date().toISOString(),
    cards: faces,
    partial: converted.skipped.length > 0
  }
};

writeFileSync(out, JSON.stringify(atomic));
console.log(`${faces}/${total} caras convertidas (set ${converted.set ?? '?'}, idioma ${converted.language ?? '?'})`);
if (converted.skipped.length) {
  console.log(`omitidas: ${converted.skipped.length} (${[...new Set(converted.skipped.map((card) => card.reason))].join(', ')}) — set PARCIAL`);
}
console.log(`AtomicCards: ${out}`);
console.log(`siguiente paso: cargo run -p mtg-engine-wasm --bin catalog -- ${out} <dir-de-salida>`);
