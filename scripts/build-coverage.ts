#!/usr/bin/env bun
/**
 * Build the per-card coverage artifacts the client consults.
 *
 * The heavy lifting is Phase's: `coveragepack` loads the exact pack bytes with
 * `CardDatabase::from_json_str` and runs `analyze_coverage`, which reports per
 * card whether every keyword, ability, trigger and static it parsed has a
 * handler. This script only wraps it:
 *
 *  - runs the binary (path from `--bin` or `$COVERAGE_BIN`),
 *  - hashes the pack **it** read and refuses to write anything if the digest does
 *    not match the index, so coverage can never describe different bytes,
 *  - writes `static/data/catalog/coverage/<pack>.<sha8>.json`: the file name is
 *    content-addressed, so a rebuilt pack cannot be served a stale artifact from
 *    an HTTP cache.
 *
 * Usage: bun scripts/build-coverage.ts [--bin <coveragepack>] [--exercised docs/packcheck-10e.json]
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CatalogIndex } from '../src/lib/game/catalog.ts';

const arg = (name: string, fallback: string | null = null) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 && process.argv[at + 1] ? process.argv[at + 1]! : fallback;
};

const binary = arg('bin', process.env.COVERAGE_BIN ?? 'target/x86_64-unknown-linux-gnu/debug/coveragepack')!;
const exercisedPath = arg('exercised', 'docs/packcheck-10e.json');
const catalogDir = 'static/data/catalog';
const outDir = join(catalogDir, 'coverage');

const index = JSON.parse(readFileSync(join(catalogDir, 'index.json'), 'utf8')) as CatalogIndex;
const exercised = exercisedPath && readFileSync(exercisedPath, 'utf8')
  ? JSON.parse(readFileSync(exercisedPath, 'utf8')) as { exercised_names?: string[] }
  : null;

mkdirSync(outDir, { recursive: true });
let total = 0;
for (const pack of index.packs) {
  const path = join(catalogDir, 'packs', `${pack.id}.json`);
  const bytes = readFileSync(path);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== pack.sha256) {
    console.error(`El pack ${pack.id} cambió (sha ${sha256.slice(0, 8)} ≠ índice ${pack.sha256.slice(0, 8)}); regenerá el índice antes de la cobertura.`);
    process.exit(1);
  }

  const args = [binary, path];
  // Exercised names only make sense for the game that used that pack.
  if (exercised && pack.id === '10e') args.push(exercisedPath);

  const run = Bun.spawnSync(args, { stdout: 'pipe', stderr: 'pipe', env: process.env });
  if (run.exitCode !== 0) {
    console.error(`coveragepack falló para ${pack.id}:\n${run.stderr.toString()}`);
    process.exit(run.exitCode ?? 1);
  }
  const report = JSON.parse(run.stdout.toString()) as { summary: { cards: number; supported: number; with_known_gaps: number; exercised: number }; cards: unknown[] };
  if (report.summary.cards !== pack.faces) {
    console.error(`cobertura de ${pack.id}: ${report.summary.cards} caras ≠ ${pack.faces} del índice`);
    process.exit(1);
  }
  const out = {
    ...report,
    pack: pack.id,
    pack_sha256: sha256,
    pack_bytes: bytes.length,
    verified: pack.verified,
    generated_at: new Date().toISOString()
  };
  const target = join(outDir, `${pack.id}.${sha256.slice(0, 8)}.json`);
  writeFileSync(target, `${JSON.stringify(out, null, 1)}\n`);
  total += 1;
  console.log(`${pack.id}: ${report.summary.cards} caras · ${report.summary.supported} soportadas · ${report.summary.with_known_gaps} con limitaciones · ${report.summary.exercised} ejercitadas → ${target}`);
}
console.log(`${total} artefacto(s) de cobertura en ${outDir}`);
