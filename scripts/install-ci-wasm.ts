#!/usr/bin/env bun
/**
 * Instala el motor WASM de un Mesa CI exitoso para exactamente este checkout.
 *
 * Bun + Git + GitHub CLI son suficientes: NO compila Rust en el PC.
 * El run debe pertenecer a main, tener el HEAD exacto y haber terminado verde.
 * Los SHA-256 de Cargo.lock y el motor se comprueban antes de copiar nada.
 *
 * Uso: bun run engine:download
 *      bun run engine:download -- --run 123456789
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, mkdtemp, open, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY = 'vanTheodore/mtg';
const WORKFLOW = 'Mesa CI';
const root = fileURLToPath(new URL('..', import.meta.url));

export interface VerifiedRun {
  databaseId: number;
  headSha: string;
  headBranch: string;
  status: string;
  conclusion: string | null;
  event: string;
  workflowName: string;
}

/** Never choose a PR run, another branch or a merely in-progress build. */
export function selectVerifiedRun(runs: readonly VerifiedRun[], head: string): VerifiedRun | undefined {
  return runs.find((run) =>
    run.headSha === head
    && run.headBranch === 'main'
    && (run.event === 'push' || run.event === 'workflow_dispatch')
    && run.workflowName === WORKFLOW
    && run.status === 'completed'
    && run.conclusion === 'success'
    && Number.isSafeInteger(run.databaseId)
    && run.databaseId > 0
  );
}

/** Parse the standard sha256sum output; reject a checksum for a different file. */
export function parseSha256sum(value: string, relativePath: string): string {
  const lines = value.trim().split(/\r?\n/);
  if (lines.length !== 1) throw new Error('El manifiesto SHA-256 debe contener exactamente una línea.');
  const match = /^([a-fA-F0-9]{64}) [ *](.+)$/.exec(lines[0]);
  if (!match || match[2] !== relativePath) {
    throw new Error('SHA-256 inválido: se esperaba ' + relativePath);
  }
  return match[1].toLowerCase();
}

function command(args: string[]): string {
  const child = Bun.spawnSync(args, { cwd: root, stdout: 'pipe', stderr: 'pipe' });
  if (child.exitCode !== 0) {
    throw new Error(args.slice(0, 3).join(' ') + ' falló: ' + child.stderr.toString().trim().slice(0, 2000));
  }
  return child.stdout.toString().trim();
}

function jsonCommand<T>(args: string[]): T {
  return JSON.parse(command(args)) as T;
}

async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest('hex');
}

async function checkWasm(path: string): Promise<void> {
  const size = (await stat(path)).size;
  if (size <= 1_000_000) throw new Error('El motor descargado es demasiado pequeño.');
  const fh = await open(path, 'r');
  try {
    const bytes = Buffer.alloc(4);
    await fh.read(bytes, 0, 4, 0);
    if (!bytes.equals(Buffer.from([0, 0x61, 0x73, 0x6d]))) {
      throw new Error('El motor descargado no empieza con la firma WASM.');
    }
  } finally { await fh.close(); }
}

async function install(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Uso: bun run engine:download [-- --run RUN_ID]');
    return;
  }
  const head = command(['git', 'rev-parse', 'HEAD']);
  if (!/^[0-9a-f]{40}$/.test(head)) throw new Error('No se pudo determinar el HEAD del checkout.');
  // A locally changed engine or lockfile is not guaranteed to match CI even
  // if the git HEAD matches. Keep the source provenance tied to the artifact.
  const localChanges = command(['git', 'status', '--porcelain', '--', 'Cargo.lock', 'docs/PHASE-UPSTREAM-PIN.json',
    'crates/phase-engine', 'crates/phase-ast', 'crates/phase-parser', 'crates/mtg-engine-wasm']);
  if (localChanges) throw new Error('Hay cambios locales en el motor o Cargo.lock. Usa un checkout limpio antes de descargar WASM.');

  const runOption = process.argv.indexOf('--run');
  const chosen = runOption >= 0 ? Number(process.argv[runOption + 1]) : null;
  if (runOption >= 0 && (!Number.isSafeInteger(chosen) || chosen! <= 0)) {
    throw new Error('El argumento --run necesita un número de ejecución de GitHub Actions.');
  }

  const fields = 'databaseId,headSha,headBranch,status,conclusion,event,workflowName';
  const runs = jsonCommand<VerifiedRun[]>(['gh', 'run', 'list', '-R', REPOSITORY,
    '--workflow', 'ci.yml', '--commit', head, '--limit', '100', '--json', fields]);
  const matching = runs.filter((r) => chosen === null || r.databaseId === chosen);
  const selected = selectVerifiedRun(matching, head);
  if (!selected) {
    throw new Error('No hay Mesa CI verde de main para este commit (' + head.slice(0, 12) +
      '). Abre https://github.com/' + REPOSITORY +
      '/actions/workflows/ci.yml; si caducaron los artefactos, ejecuta gh workflow run ci.yml -R ' +
      REPOSITORY + ' --ref main, espera a que termine verde y repite el comando. No reutilices un WASM de otro commit.');
  }

  // Double-check the run identity after selection, then download one known
  // artifact to a temporary directory, not directly into the app.
  const viewed = jsonCommand<VerifiedRun>(['gh', 'run', 'view', String(selected.databaseId),
    '-R', REPOSITORY, '--json', fields]);
  if (!selectVerifiedRun([viewed], head) || viewed.databaseId !== selected.databaseId) {
    throw new Error('El run seleccionado dejó de corresponder al commit local.');
  }
  const dir = await mkdtemp(join(tmpdir(), 'mesa-ci-wasm-'));
  try {
    console.log('Descargando mtg-engine-wasm del run #' + selected.databaseId + ' para ' + head.slice(0, 12));
    command(['gh', 'run', 'download', String(selected.databaseId), '-R', REPOSITORY,
      '--name', 'mtg-engine-wasm', '--dir', dir]);

    const wasm = join(dir, 'mtg_engine_wasm.wasm');
    const cargo = join(dir, 'Cargo.lock.sha256');
    const wasmSum = join(dir, 'mtg_engine_wasm.wasm.sha256');
    await checkWasm(wasm);
    const expectedEngine = parseSha256sum(await readFile(wasmSum, 'utf8'), 'static/wasm/mtg_engine_wasm.wasm');
    const expectedCargo = parseSha256sum(await readFile(cargo, 'utf8'), 'Cargo.lock');
    const [actualEngine, actualCargo] = await Promise.all([
      sha256(wasm),
      sha256(join(root, 'Cargo.lock'))
    ]);
    if (actualEngine !== expectedEngine || actualCargo !== expectedCargo) {
      throw new Error('La identidad SHA-256 del motor o Cargo.lock no coincide. No se instaló nada.');
    }

    const output = join(root, 'static', 'wasm');
    await mkdir(output, { recursive: true });
    for (const name of ['mtg_engine_wasm.wasm', 'mtg_engine_wasm.wasm.sha256',
      'Cargo.lock.sha256', 'rustc-version.txt']) {
      await copyFile(join(dir, name), join(output, name));
    }
    console.log('Motor verificado e instalado: static/wasm/mtg_engine_wasm.wasm (' +
      ((await stat(wasm)).size / (1024 * 1024)).toFixed(1) + ' MiB).');
    console.log('Puedes ejecutar: bun run dev');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  install().catch((error: unknown) => {
    console.error('Mesa: ' + String((error as Error).message ?? error));
    process.exitCode = 1;
  });
}
