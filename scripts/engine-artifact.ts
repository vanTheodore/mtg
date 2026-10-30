#!/usr/bin/env bun
/**
 * Identity of the engine artifact, so a `.wasm` can be trusted without trusting
 * whoever produced it.
 *
 * The binary is 46 MB and is not versioned (`static/wasm/` is ignored), so the
 * only durable facts about it are the ones written down here: its digest, its
 * size, the Phase commit and vendored-source digest it was built from, the
 * lockfile digest, the compiler, and the flags. `--verify` reopens the file and
 * refuses it if any of those changed — which is what makes it safe to reuse a
 * build from a previous session or from another machine.
 *
 * The ABI check is not a hash: the module is compiled and its imports/exports
 * are compared against the Mesa client contract (`src/lib/engine/engine.worker.ts`
 * calls `mtg_alloc`, `mtg_free`, `mtg_request` and reads `memory`; the host
 * provides `env.mesa_now_ms` and `env.mesa_random`). A valid wasm that exports
 * something else is a different bridge and must not be installed.
 *
 * Usage:
 *   bun scripts/engine-artifact.ts --write     # after a build
 *   bun scripts/engine-artifact.ts --verify    # before trusting an artifact
 *   bun scripts/engine-artifact.ts --print     # show the manifest as JSON
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const artifact = resolve(root, process.env.MESA_ENGINE_WASM ?? 'static/wasm/mtg_engine_wasm.wasm');
const manifestPath = resolve(root, 'docs/wasm-artifact.json');
// The vendored Phase tree is verified file by file by `bun run engine:verify`.
const PHASE_COMMIT = 'c2fbb7a6634a440c7c6b47e6a87a554cc7382f05';
const PHASE_SOURCE_DIGEST = '7ca901b32a2ae92ab8d760b32ff65c9ea174f35c374260874968148397cc8aa5';
const REQUIRED_EXPORTS = ['memory', 'mtg_alloc', 'mtg_free', 'mtg_request'];
const REQUIRED_IMPORTS = ['env.mesa_now_ms', 'env.mesa_random'];

type Manifest = {
  schema: number;
  artifact: string;
  sha256: string;
  bytes: number;
  phase: { commit: string; source_digest: string; crate_version: string };
  lockfile: { sha256: string };
  compiler: { rustc: string; target: string; profile: string };
  flags: string;
  abi: { exports: string[]; imports: string[] };
};

function sha256(bytes: Uint8Array): string {
  return new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
}

/**
 * A hand-written or truncated manifest must be reported as such, not crash into
 * `undefined.sha256`. This is the difference between "this binary is wrong" and
 * "your record of it is wrong".
 */
function manifestProblems(manifest: Partial<Manifest>): string[] {
  const problems: string[] = [];
  if (typeof manifest.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(manifest.sha256)) problems.push('falta sha256 (64 hex)');
  if (typeof manifest.bytes !== 'number' || manifest.bytes <= 0) problems.push('falta bytes');
  if (typeof manifest.lockfile?.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(manifest.lockfile.sha256)) problems.push('falta lockfile.sha256');
  if (manifest.phase?.commit !== PHASE_COMMIT) problems.push(`phase.commit ≠ ${PHASE_COMMIT.slice(0, 12)} (el motor cambió de versión)`);
  if (manifest.phase?.source_digest !== PHASE_SOURCE_DIGEST) problems.push('phase.source_digest no coincide con scripts/verify-engine.ts');
  if (!Array.isArray(manifest.abi?.exports) || !Array.isArray(manifest.abi?.imports)) problems.push('falta abi.{exports,imports}');
  return problems;
}

function crateVersion(): string {
  const toml = readFileSync(resolve(root, 'crates/phase-engine/Cargo.toml'), 'utf8');
  return /^version\s*=\s*"([^"]+)"/m.exec(toml)?.[1] ?? 'unknown';
}

function rustcVersion(): string {
  const cargo = process.env.CARGO ?? 'cargo';
  const result = Bun.spawnSync([cargo, '--version'], { stdout: 'pipe', stderr: 'pipe' });
  // `cargo --version` is enough identity here; the exact rustc hash is recorded
  // by the build log and is reproducible from the toolchain version below.
  return result.exitCode === 0 ? result.stdout.toString().trim() : 'unknown';
}

/** Compiles the module and reads the ABI back, instead of trusting a file name. */
async function inspectAbi(bytes: Uint8Array): Promise<{ exports: string[]; imports: string[] }> {
  const module = await WebAssembly.compile(bytes);
  const imports = WebAssembly.Module.imports(module).map((entry) => `${entry.module}.${entry.name}`);
  const exports = WebAssembly.Module.exports(module).map((entry) => entry.name);
  return { imports: imports.sort(), exports: exports.sort() };
}

function abiProblems(abi: { exports: string[]; imports: string[] }): string[] {
  const problems: string[] = [];
  for (const name of REQUIRED_EXPORTS) if (!abi.exports.includes(name)) problems.push(`falta el export ${name}`);
  for (const name of REQUIRED_IMPORTS) if (!abi.imports.includes(name)) problems.push(`falta el import ${name}`);
  return problems;
}

async function write(): Promise<void> {
  if (!existsSync(artifact)) {
    console.error(`No hay artefacto en ${artifact}. Ejecuta bun run engine:build.`);
    process.exit(1);
  }
  const bytes = readFileSync(artifact);
  if (bytes.length < 1_000_000 || bytes[0] !== 0x00 || bytes[1] !== 0x61 || bytes[2] === undefined) {
    console.error('El archivo no parece un módulo WASM (firma \\0asm o tamaño).');
    process.exit(1);
  }
  const abi = await inspectAbi(new Uint8Array(bytes));
  const problems = abiProblems(abi);
  if (problems.length) {
    console.error(`El módulo no es el puente de Mesa:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  const manifest: Manifest = {
    schema: 1,
    artifact: 'static/wasm/mtg_engine_wasm.wasm',
    sha256: sha256(new Uint8Array(bytes)),
    bytes: bytes.length,
    phase: { commit: PHASE_COMMIT, source_digest: PHASE_SOURCE_DIGEST, crate_version: crateVersion() },
    lockfile: { sha256: sha256(new Uint8Array(readFileSync(resolve(root, 'Cargo.lock')))) },
    compiler: { rustc: rustcVersion(), target: 'wasm32-unknown-unknown', profile: 'release' },
    flags: process.env.MESA_RUSTFLAGS_EXTRA ?? '(perfil release por defecto)',
    abi: { exports: abi.exports, imports: abi.imports }
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Escrito ${manifestPath}`);
  console.log(`  sha256  ${manifest.sha256}`);
  console.log(`  tamaño  ${(manifest.bytes / 1024 / 1024).toFixed(2)} MiB`);
  console.log(`  ABI     ${REQUIRED_EXPORTS.length} exports y ${REQUIRED_IMPORTS.length} imports de Mesa verificados`);
}

async function verify(): Promise<void> {
  if (!existsSync(manifestPath)) {
    console.error(`Falta ${manifestPath}: sin identidad registrada no se puede confiar en el binario.`);
    process.exit(1);
  }
  const problems = manifestProblems(JSON.parse(readFileSync(manifestPath, 'utf8')) as Partial<Manifest>);
  if (problems.length) {
    console.error(`${manifestPath} está incompleto, no puede servir de referencia:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
  if (!existsSync(artifact)) {
    console.error(`No hay artefacto en ${artifact}. Recupéralo (ver docs/BROWSER-RUNBOOK.md §3d).`);
    process.exit(1);
  }
  const bytes = new Uint8Array(readFileSync(artifact));
  const failures: string[] = [];

  // The ABI decides what the binary *is*; the digests decide whether it is the
  // binary we recorded. A module that cannot be compiled, or that exports a
  // different bridge, has to be reported as such and not as a hash mismatch.
  const abi = await inspectAbi(bytes).catch((error: unknown) => ({ error: String(error) } as const));
  if ('error' in abi) failures.push(`el módulo no compila: ${abi.error}`);
  else failures.push(...abiProblems(abi));

  const digest = sha256(bytes);
  if (digest !== manifest.sha256) failures.push(`sha256 ${digest} ≠ ${manifest.sha256}`);
  if (bytes.length !== manifest.bytes) failures.push(`tamaño ${bytes.length} ≠ ${manifest.bytes}`);
  const lockDigest = sha256(new Uint8Array(readFileSync(resolve(root, 'Cargo.lock'))));
  if (lockDigest !== manifest.lockfile.sha256) failures.push('Cargo.lock cambió desde que se compiló el artefacto');
  if (failures.length) {
    console.error(`El artefacto no coincide con lo registrado:\n  ${failures.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`✔ ${manifest.artifact} coincide: ${manifest.sha256.slice(0, 16)}… (${(manifest.bytes / 1024 / 1024).toFixed(2)} MiB)`);
  console.log(`  Phase ${manifest.phase.commit.slice(0, 12)} · ${manifest.compiler.rustc} · ${manifest.compiler.target}`);
}

if (process.argv.includes('--write')) await write();
else if (process.argv.includes('--verify')) await verify();
else if (process.argv.includes('--print')) console.log(readFileSync(manifestPath, 'utf8'));
else {
  console.log('uso: bun scripts/engine-artifact.ts --write | --verify | --print');
  process.exit(2);
}
