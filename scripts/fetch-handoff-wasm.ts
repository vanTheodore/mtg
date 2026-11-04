#!/usr/bin/env bun
/**
 * Trae un motor WASM ya compilado por el workflow `wasm-handoff` y lo instala
 * en `static/wasm/` para poder jugar y correr Chromium sin Rust local.
 *
 * No sustituye a `bun run engine:download`: ese sigue exigiendo un Mesa CI
 * verde de `main` en el mismo commit, que es la ruta de procedencia oficial.
 * Este script es un puente para entornos restringidos (por ejemplo, un sandbox
 * sin acceso al almacenamiento de artefactos de GitHub ni a crates.io) que sí
 * pueden leer Git. Se niega a instalar un motor de otro commit.
 *
 * Uso:
 *   bun scripts/fetch-handoff-wasm.ts            # última publicación
 *   bun scripts/fetch-handoff-wasm.ts --commit <sha>
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY = 'vanTheodore/mtg';
const BRANCH = 'ci/wasm-artifacts';
const root = fileURLToPath(new URL('..', import.meta.url));

function git(args: string[]): string {
  const result = Bun.spawnSync(['git', ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) throw new Error('git ' + args.join(' ') + ': ' + result.stderr.toString().trim());
  return result.stdout.toString().trim();
}

function arg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const head = git(['rev-parse', 'HEAD']);
  const dirty = git(['status', '--porcelain', '--', 'Cargo.lock', 'docs/PHASE-UPSTREAM-PIN.json',
    'crates/phase-engine', 'crates/phase-ast', 'crates/phase-parser', 'crates/mtg-engine-wasm']);
  if (dirty) throw new Error('Hay cambios locales en el motor o Cargo.lock; usa un checkout limpio.');

  git(['fetch', '--depth', '1', 'origin', `refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH}`]);
  const manifest = JSON.parse(git(['show', `origin/${BRANCH}:manifest.json`])) as {
    commit: string; run: number; engine_sha256: string;
  };
  const wanted = arg('--commit') ?? head;
  if (manifest.commit !== wanted) {
    throw new Error(
      `La publicación del puente es de ${manifest.commit.slice(0, 12)} y necesitas ${wanted.slice(0, 12)}. ` +
      'Empuja un commit a una rama ci/wasm-bridge* y espera el workflow Mesa WASM handoff.'
    );
  }

  const encoded = await readFile(join(root, '.git', 'handoff.b64'), 'utf8').catch(async () => {
    const value = git(['show', `origin/${BRANCH}:mtg_engine_wasm.wasm.gz.b64`]);
    writeFileSync(join(root, '.git', 'handoff.b64'), value);
    return value;
  });
  const wasm = Bun.gunzipSync(Buffer.from(encoded.trim(), 'base64'));
  const digest = createHash('sha256').update(wasm).digest('hex');
  if (digest !== manifest.engine_sha256) {
    throw new Error(`SHA-256 del motor no coincide (publicado ${manifest.engine_sha256}, recibido ${digest}).`);
  }

  const output = join(root, 'static', 'wasm');
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, 'mtg_engine_wasm.wasm'), wasm);
  for (const name of ['mtg_engine_wasm.wasm.sha256', 'Cargo.lock.sha256', 'rustc-version.txt', 'manifest.json']) {
    writeFileSync(join(output, name), git(['show', `origin/${BRANCH}:${name}`]) + '\n');
  }
  console.log(`Motor Phase instalado desde el puente de CI (run ${manifest.run}, ${head.slice(0, 12)}): ` +
    `${(wasm.length / (1024 * 1024)).toFixed(1)} MiB en static/wasm/.`);
}

if (import.meta.main) {
  if (existsSync(join(root, '.git')) === false) throw new Error('Esto debe correr dentro del repositorio.');
  main().catch((error: unknown) => {
    console.error('Mesa: ' + String((error as Error).message ?? error));
    process.exitCode = 1;
  });
}
