#!/usr/bin/env bun
/**
 * Bring the engine artifact back into a fresh session, over git.
 *
 * The `.wasm` is 46 MB and `static/wasm/` is ignored, so a workspace that is
 * reset — or a machine that never built it — has no engine. Release assets are
 * not an option here: GitHub serves them from `objects.githubusercontent.com`,
 * which this sandbox cannot reach (000). Git itself is reachable, so the
 * artifact travels as a single file on its own branch, `artifacts/wasm`, and is
 * installed only if it matches the digest in `docs/wasm-artifact.json`.
 *
 * Nothing is trusted on arrival: the branch is fetched, the ABI is compiled and
 * read, the sha256 and size are compared, and only then is the file moved into
 * `static/wasm/`. A mismatch leaves the workspace exactly as it was.
 *
 * Usage:
 *   bun scripts/engine-fetch.ts                     # origin, branch artifacts/wasm
 *   bun scripts/engine-fetch.ts --remote <path> --branch <name> --force
 *
 * Publishing is the other half (`docs/BROWSER-RUNBOOK.md` §3d):
 *   git fetch <machine> artifacts/wasm   # or the build machine pushes directly
 */
import { $ } from 'bun';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

function argOf(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

const root = resolve(import.meta.dir, '..');
const remote = argOf('--remote') ?? 'origin';
const branch = argOf('--branch') ?? 'artifacts/wasm';
const install = resolve(root, process.env.MESA_ENGINE_WASM ?? 'static/wasm/mtg_engine_wasm.wasm');
const manifestPath = resolve(root, 'docs/wasm-artifact.json');
const file = 'mtg_engine_wasm.wasm';

if (existsSync(install) && !process.argv.includes('--force')) {
  const check = Bun.spawnSync(['bun', 'scripts/engine-artifact.ts', '--verify'], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
  if (check.exitCode === 0) {
    console.log('Ya hay un artefacto verificado; no se toca (--force para reemplazarlo).');
    process.exit(0);
  }
  console.log('El artefacto local no verifica; se reemplazará.');
}

if (!existsSync(manifestPath)) {
  console.error('Falta docs/wasm-artifact.json: sin digest registrado no se instala nada.');
  process.exit(1);
}

console.log(`Buscando ${file} en ${remote} ${branch}…`);
const fetched = await $`git fetch --depth=1 ${remote} ${branch}`.cwd(root).quiet().nothrow();
if (fetched.exitCode !== 0) {
  console.error(`No se pudo traer ${branch} de ${remote}:\n${fetched.stderr.toString().slice(0, 300)}`);
  console.error('Esa rama solo existe si alguien compiló el motor y la publicó (docs/BROWSER-RUNBOOK.md §3d).');
  process.exit(1);
}

mkdirSync(resolve(install, '..'), { recursive: true });
const staging = `${install}.incoming`;
rmSync(staging, { force: true });
const shown = await $`git show FETCH_HEAD:${file}`.cwd(root).quiet().nothrow();
if (shown.exitCode !== 0) {
  console.error(`${branch} no contiene ${file}.`);
  process.exit(1);
}
await Bun.write(staging, shown.stdout);

const size = statSync(staging).size;
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { sha256: string; bytes: number };
const digest = new Bun.CryptoHasher('sha256').update(readFileSync(staging)).digest('hex');
if (digest !== manifest.sha256 || size !== manifest.bytes) {
  rmSync(staging, { force: true });
  console.error('El binario traído no coincide con docs/wasm-artifact.json:');
  console.error(`  sha256 ${digest}`);
  console.error(`  esperado ${manifest.sha256}`);
  console.error(`  tamaño ${size} / ${manifest.bytes}`);
  console.error('No se instala. Un binario de procedencia dudosa no entra.');
  process.exit(1);
}

renameSync(staging, install);
const verified = Bun.spawnSync(['bun', 'scripts/engine-artifact.ts', '--verify'], { cwd: root, stdout: 'inherit', stderr: 'inherit' });
if (verified.exitCode !== 0) {
  rmSync(install, { force: true });
  console.error('La verificación final falló; se descartó el archivo.');
  process.exit(1);
}
console.log(`Instalado ${install}.`);
