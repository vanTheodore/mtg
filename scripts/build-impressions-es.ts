#!/usr/bin/env bun
/**
 * Build the optional Spanish impressions file from a real MTGJSON set file.
 *
 * Only cards already present in Mesa's catalog get an entry, and only the text
 * the source publishes: nothing is translated by hand and no name is replaced.
 * MTGJSON v3/v4 translated set files keep the English `name` and carry the
 * official localized rules text in `originalText` / `originalType`.
 *
 * Usage:
 *   bun scripts/build-impressions-es.ts --set-file 10E.es.json --out static/data/impressions.es.json
 *   bun scripts/build-impressions-es.ts --set-file 10E.es.json --catalog static/data/cards.json --source "MTGJSON 10E.es.json (2026-10-29)"
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { impressionsFromMtgjsonSet, type MtgjsonSetFile } from '../src/lib/game/catalog-source.ts';
import type { Catalog } from '../src/lib/game/catalog.ts';

function arg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const setFile = arg('set-file');
if (!setFile) {
  console.error('Falta --set-file <ruta al .es.json>');
  process.exit(2);
}
const catalogPath = arg('catalog', 'static/data/cards.json')!;
const out = arg('out', 'static/data/impressions.es.json')!;
const language = arg('language', 'es')!;

const raw = readFileSync(setFile, 'utf8');
const file = JSON.parse(raw) as MtgjsonSetFile;
if (file.language && file.language !== language) {
  console.error(`El archivo es "${file.language}", no "${language}"`);
  process.exit(1);
}
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as Catalog;
const names = Object.keys(catalog);

const impressions = impressionsFromMtgjsonSet(file, names, {
  source: arg('source') ?? `MTGJSON ${basename(setFile)} · sha256 ${createHash('sha256').update(raw).digest('hex').slice(0, 16)}`,
  generatedAt: new Date().toISOString()
});

writeFileSync(out, JSON.stringify(impressions, null, 2));
const count = Object.keys(impressions.cards).length;
console.log(`${count} impresiones en español de ${file.code ?? '?'} (${names.length} cartas en el catálogo)`);
if (count) for (const [name, impression] of Object.entries(impressions.cards).slice(0, 30)) {
  console.log(`  ${name} → ${impression.printed_text ? 'texto' : ''}${impression.printed_type ? ' tipo' : ''}`);
}
if (!count) console.log('Ninguna carta del catálogo aparece en este set; el archivo queda vacío a propósito.');
