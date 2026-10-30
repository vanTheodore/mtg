#!/usr/bin/env bun
/**
 * Rebuild `vendor/` from the crates in Cargo.lock, using only GitHub.
 *
 * Why this exists: crates.io, its sparse index and static.crates.io are not
 * reachable from every build environment (they answer 000 here), while
 * codeload.github.com and api.github.com are. Every crate in the lockfile is
 * published from a Git repository, so the exact versions can be taken from the
 * upstream tags instead of the registry.
 *
 * The result is a Cargo *directory source*: one directory per package with the
 * package's own Cargo.toml and a `.cargo-checksum.json`. A config file with a
 * `[source]` replacement makes `cargo build --offline` resolve against it, so
 * the lockfile still wins and no version may drift.
 *
 * Usage:
 *   bun scripts/vendor-crates.ts [--out <dir>] [--only name,...]
 *
 * The tag for each crate is discovered in that repository's tag list, so a
 * wrong guess in the table below fails loudly instead of silently vendoring a
 * different version. Crates whose repository is unknown stay in `MISSING` and
 * are reported at the end; nothing is invented.
 */
import { $ } from 'bun';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dir, '..');
const outDir = resolve(argOf('--out') ?? join(root, 'vendor'));
const workDir = '/tmp/mesa-vendor-work';
const cacheFile = '/tmp/mesa-crate-tags.json';

function argOf(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

/**
 * crate name -> repository. The tag is looked up per repository and matched
 * against `version`, allowing the several conventions in use (`v1.2.3`,
 * `1.2.3`, `crate-v1.2.3`, `crate@v1.2.3`, `upstream/1.2.3`).
 */
const REPOS: Record<string, string> = {
  bitmaps: 'bodil/bitmaps',
  'block-buffer': 'RustCrypto/utils',
  bumpalo: 'fitzgen/bumpalo',
  'cfg-if': 'rust-lang/cfg-if',
  cpufeatures: 'RustCrypto/utils',
  'crypto-common': 'RustCrypto/traits',
  digest: 'RustCrypto/traits',
  equivalent: 'indexmap-rs/equivalent',
  fixedbitset: 'petgraph/fixedbitset',
  'futures-core': 'rust-lang/futures-rs',
  'futures-task': 'rust-lang/futures-rs',
  'futures-util': 'rust-lang/futures-rs',
  'generic-array': 'openkylin/rust-generic-array',
  getrandom: 'rust-random/getrandom',
  hashbrown: 'rust-lang/hashbrown',
  heck: 'withoutboats/heck',
  im: 'bodil/im-rs',
  indexmap: 'indexmap-rs/indexmap',
  itoa: 'dtolnay/itoa',
  'js-sys': 'wasm-bindgen/wasm-bindgen',
  libc: 'rust-lang/libc',
  memchr: 'BurntSushi/memchr',
  nom: 'rust-bakery/nom',
  once_cell: 'matklad/once_cell',
  petgraph: 'petgraph/petgraph',
  'pin-project-lite': 'taiki-e/pin-project-lite',
  'ppv-lite86': 'cryptocorrosion/cryptocorrosion',
  'proc-macro2': 'dtolnay/proc-macro2',
  quote: 'dtolnay/quote',
  rand: 'rust-random/rand',
  rand_chacha: 'rust-random/rand',
  rand_core: 'rust-random/rand_core',
  rand_xoshiro: 'openkylin/rust-rand-xoshiro',
  'rustc-hash': 'rust-lang/rustc-hash',
  rustversion: 'dtolnay/rustversion',
  'same-file': 'BurntSushi/same-file',
  serde: 'serde-rs/serde',
  serde_core: 'serde-rs/serde',
  serde_derive: 'serde-rs/serde',
  serde_ignored: 'dtolnay/serde-ignored',
  serde_json: 'serde-rs/json',
  serde_spanned: 'toml-rs/toml',
  sha2: 'RustCrypto/hashes',
  'sized-chunks': 'bodil/sized-chunks',
  slab: 'tokio-rs/slab',
  smallvec: 'servo/rust-smallvec',
  strum: 'Peternator7/strum',
  strum_macros: 'Peternator7/strum',
  syn: 'dtolnay/syn',
  thiserror: 'dtolnay/thiserror',
  'thiserror-impl': 'dtolnay/thiserror',
  toml: 'toml-rs/toml',
  toml_datetime: 'toml-rs/toml',
  toml_edit: 'toml-rs/toml',
  toml_write: 'toml-rs/toml',
  tracing: 'tokio-rs/tracing',
  'tracing-attributes': 'tokio-rs/tracing',
  'tracing-core': 'tokio-rs/tracing',
  typenum: 'paholg/typenum',
  'unicode-ident': 'dtolnay/unicode-ident',
  version_check: 'SergioBenitez/version_check',
  'wasm-bindgen': 'wasm-bindgen/wasm-bindgen',
  'wasm-bindgen-macro': 'wasm-bindgen/wasm-bindgen',
  'wasm-bindgen-macro-support': 'wasm-bindgen/wasm-bindgen',
  'wasm-bindgen-shared': 'wasm-bindgen/wasm-bindgen',
  'web-time': 'daxpedda/web-time',
  winnow: 'winnow-rs/winnow',
  zerocopy: 'google/zerocopy',
  'zerocopy-derive': 'google/zerocopy',
  zmij: 'dtolnay/zmij'
};

type Package = { name: string; version: string; source?: string };

function lockedPackages(): Package[] {
  const lock = readFileSync(join(root, 'Cargo.lock'), 'utf8');
  const out: Package[] = [];
  for (const block of lock.split('[[package]]').slice(1)) {
    const name = /name = "([^"]+)"/.exec(block)?.[1];
    const version = /version = "([^"]+)"/.exec(block)?.[1];
    const source = /source = "([^"]+)"/.exec(block)?.[1];
    if (name && version && source) out.push({ name, version, source });
  }
  return out;
}

/**
 * Repositories that publish releases without tagging the commit (heck keeps
 * its versions on `master`). The vendored version must still match Cargo.lock
 * exactly, so an untagged branch is only used when its manifest says so.
 */
const BRANCH_FALLBACK: Record<string, string> = { heck: 'master' };

/** Filled before vendoring starts: sibling tags need the whole list. */
let packages: Package[] = [];

const tagCache: Record<string, string[]> = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};

async function tagsOf(repo: string): Promise<string[]> {
  if (tagCache[repo]) return tagCache[repo];
  const tags: string[] = [];
  for (let page = 1; page <= 4; page += 1) {
    const result = await $`gh api "repos/${repo}/tags?per_page=100&page=${page}"`.quiet().nothrow();
    if (result.exitCode !== 0) break;
    const batch = JSON.parse(result.stdout.toString()) as { name: string }[];
    tags.push(...batch.map((entry) => entry.name));
    if (batch.length < 100) break;
  }
  if (tags.length === 0) throw new Error(`no tags for ${repo}`);
  tagCache[repo] = tags;
  writeFileSync(cacheFile, JSON.stringify(tagCache));
  return tags;
}

/** Picks the tag that means "version" in whatever convention the repo uses. */
function pickTag(tags: string[], name: string, version: string): string | undefined {
  const escaped = version.replace(/\./g, '\\.');
  const patterns = [
    new RegExp(`^v?${escaped}$`),
    new RegExp(`^${name}[-@/]v?${escaped}$`),
    new RegExp(`(^|[/-])${escaped}$`)
  ];
  for (const pattern of patterns) {
    const hit = tags.find((tag) => pattern.test(tag));
    if (hit) return hit;
  }
  return undefined;
}

/**
 * A published crate's manifest is the *expanded* one: crates.io replaces
 * `version.workspace = true` with the value before shipping. A Git tag keeps
 * the unexpanded original, so vendoring from tags has to expand it here —
 * otherwise cargo refuses the package as an orphan of a workspace it cannot
 * see. Parsing is structural (Bun.TOML) because the same file mixes
 * `license.workspace = true` with inline `proc-macro2 = { workspace = true }`.
 */
type Table = Record<string, unknown>;

function readToml(path: string): Table | null {
  if (!existsSync(path)) return null;
  try {
    return Bun.TOML.parse(readFileSync(path, 'utf8')) as Table;
  } catch {
    return null;
  }
}

function identityOf(dir: string): { name: string; version: string } | null {
  const manifest = readToml(join(dir, 'Cargo.toml'));
  const pkg = manifest?.package as Table | undefined;
  const name = pkg?.name;
  const version = pkg?.version;
  return typeof name === 'string' && typeof version === 'string' ? { name, version } : null;
}

/** Finds the package inside an extracted workspace. */
function findPackage(dir: string, name: string, version: string, depth = 0): string | null {
  const identity = identityOf(dir);
  if (identity && identity.name === name && identity.version === version) return dir;
  if (depth >= 4) return null;
  let entries: string[];
  try {
    entries = readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return null;
  }
  const preferred = entries.filter((entry) => ['crates', 'src', name, 'rust'].includes(entry));
  for (const entry of [...preferred, ...entries.filter((item) => !preferred.includes(item))]) {
    const hit = findPackage(join(dir, entry), name, version, depth + 1);
    if (hit) return hit;
  }
  return null;
}

/** Nearest ancestor manifest that declares `[workspace]`. */
function workspaceRootOf(dir: string): Table | null {
  let current = dir;
  for (let level = 0; level < 4; level += 1) {
    const manifest = readToml(join(current, 'Cargo.toml'));
    if (manifest?.workspace) return manifest;
    const parent = resolve(current, '..');
    if (parent === current) break;
    current = parent;
  }
  return null;
}

/** Bare keys only where TOML allows them: `[target."cfg(all(...))"]` is legal, `[target.cfg(all(...))]` is not. */
function tomlKey(key: string): string {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key);
}

function tomlValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map((item) => tomlValue(item)).join(', ')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Table).filter(([, item]) => item !== undefined);
    return `{ ${entries.map(([key, item]) => `${tomlKey(key)} = ${tomlValue(item)}`).join(', ')} }`;
  }
  return JSON.stringify(String(value));
}

/** Emits a table; scalars first, then nested tables, then arrays of tables. */
function emitTable(table: Table, path: string[], out: string[]): void {
  const scalar = (value: unknown) => value !== null && typeof value === 'object' && !Array.isArray(value) ? false : !(Array.isArray(value) && value.some((item) => item && typeof item === 'object'));
  for (const [key, value] of Object.entries(table)) {
    if (value === undefined || !scalar(value)) continue;
    out.push(`${tomlKey(key)} = ${tomlValue(value)}`);
  }
  for (const [key, value] of Object.entries(table)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const next = [...path, key];
    out.push('', `[${next.map((part) => tomlKey(part)).join('.')}]`);
    emitTable(value as Table, next, out);
  }
  for (const [key, value] of Object.entries(table)) {
    if (!Array.isArray(value) || !value.some((item) => item && typeof item === 'object')) continue;
    for (const item of value) {
      if (!item || typeof item !== 'object') continue;
      out.push('', `[[${[...path, key].map((part) => tomlKey(part)).join('.')}]]`);
      emitTable(item as Table, [...path, key], out);
    }
  }
}

const DEPENDENCY_TABLES = ['dependencies', 'dev-dependencies', 'build-dependencies'];

/**
 * Expands workspace inheritance and writes the manifest the crate would have
 * had if it came from the registry. `path` entries go away: a directory source
 * resolves by version and `Cargo.lock` still pins it.
 */
function prepareManifest(sourceDir: string, targetDir: string): string[] {
  const manifest = readToml(join(sourceDir, 'Cargo.toml'));
  if (!manifest) throw new Error(`no Cargo.toml in ${sourceDir}`);
  const root = workspaceRootOf(sourceDir);
  const workspace = (root?.workspace ?? {}) as Table;
  const inheritedPackage = (workspace.package ?? {}) as Table;
  const inheritedDeps = (workspace.dependencies ?? {}) as Table;
  const notes: string[] = [];

  const pkg = manifest.package as Table;
  for (const [key, value] of Object.entries(pkg)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && (value as Table).workspace === true) {
      if (key in inheritedPackage) {
        pkg[key] = inheritedPackage[key];
        notes.push(`package.${key}`);
      } else {
        delete pkg[key];
      }
    }
  }

  // Dev-dependencies never affect a library build and sometimes point at
  // sibling directories by path only (futures-core -> ../futures), which a
  // directory source cannot resolve. Features that only exist to switch them
  // on (`bench_allocator_api = ["blink-alloc/nightly"]`) go with them, or
  // cargo rejects the manifest for naming a dependency that is not there.
  const removedDevDeps = new Set(Object.keys((manifest['dev-dependencies'] as Table) ?? {}));
  delete manifest['dev-dependencies'];
  /** Dependencies that no longer exist in this manifest; features naming them go too. */
  const unavailable = new Set(removedDevDeps);

  // Target-scoped tables get the same treatment: zerocopy declares
  // zerocopy-derive twice, and a leftover `path` in the target copy makes
  // cargo reject the two declarations as different sources.
  const dependencyTables: [string, Table][] = [];
  for (const name of DEPENDENCY_TABLES) {
    const table = manifest[name] as Table | undefined;
    if (table) dependencyTables.push([name, table]);
  }
  for (const [predicate, table] of Object.entries((manifest.target as Table) ?? {})) {
    for (const name of ['dependencies', 'build-dependencies']) {
      const scoped = (table as Table)[name] as Table | undefined;
      if (scoped) dependencyTables.push([`target.${predicate}.${name}`, scoped]);
    }
  }

  for (const [tableName, table] of dependencyTables) {
    for (const [name, spec] of Object.entries(table)) {
      if (!spec || typeof spec !== 'object' || Array.isArray(spec)) continue;
      const entry = spec as Table;
      delete entry.path;
      if (!entry.workspace && !entry.version && !entry.git && !entry.registry) {
        throw new Error(`${tableName}.${name} has no registry version after removing its path`);
      }
      if (entry.workspace === true) {
        const base = (inheritedDeps[name] ?? {}) as Table;
        delete entry.workspace;
        const merged: Table = { ...base };
        delete merged.path;
        if (entry.features && Array.isArray(entry.features)) {
          const union = new Set([...((base.features as string[]) ?? []), ...(entry.features as string[])]);
          merged.features = [...union];
        }
        for (const [key, value] of Object.entries(entry)) if (key !== 'features') merged[key] = value;
        table[name] = merged;
        notes.push(`dep.${name}`);
      }
    }
  }

  /**
   * The last word on target tables: a dependency that is not in Cargo.lock
   * belongs to a platform this build never resolves (getrandom's `r-efi` for
   * UEFI). Keeping it would ask the directory source for a package that no
   * lockfile pins. This is checked against the lock, not against a list of
   * platform names, so it keeps working as crates add targets.
   */
  const locked = new Set(packages.map((entry) => entry.name));
  for (const table of Object.values((manifest.target as Table) ?? {})) {
    for (const key of ['dependencies', 'build-dependencies']) {
      const scoped = (table as Table)[key] as Table | undefined;
      if (!scoped) continue;
      for (const name of Object.keys(scoped)) {
        if (!locked.has(name)) {
          delete scoped[name];
          unavailable.add(name);
        }
      }
      if (Object.keys(scoped).length === 0) delete (table as Table)[key];
    }
  }

  // A crate can list the same package as both a real and a dev dependency
  // (bumpalo: optional `serde`), so only names that vanished entirely count.
  const stillDeclared = new Set(
    DEPENDENCY_TABLES.flatMap((name) => Object.keys((manifest[name] as Table) ?? {}))
      .concat(Object.values((manifest.target as Table) ?? {}).flatMap((table) => Object.keys(((table as Table).dependencies as Table) ?? {})))
  );
  for (const name of stillDeclared) unavailable.delete(name);

  const features = manifest.features as Table | undefined;
  if (features && unavailable.size) {
    for (const [name, value] of Object.entries(features)) {
      if (!Array.isArray(value)) continue;
      features[name] = value.filter((entry) => {
        const text = String(entry);
        const target = text.startsWith('dep:') ? text.slice(4) : text.split('/')[0]!.replace(/\?$/, '');
        return !unavailable.has(target);
      });
    }
  }

  /**
   * indexmap carries `serde` as an optional dependency of a target table whose
   * predicate is `cfg(any())` — a documentation trick that never applies. The
   * registry ships it and cargo accepts it there, but a rewritten manifest that
   * keeps an optional dependency nobody can enable is rejected. Only
   * target-scoped entries are removed; a normal optional dependency that no
   * feature mentions stays, so the build fails loudly instead of silently
   * losing a feature.
   */
  const referenced = new Set<string>();
  for (const value of Object.values((manifest.features as Table) ?? {})) {
    if (!Array.isArray(value)) continue;
    for (const entry of value) {
      const text = String(entry);
      if (text.startsWith('dep:')) referenced.add(text.slice(4));
      // `valuable?/std` is a weak dependency feature: the `?` is not part of the name.
      else if (text.includes('/')) referenced.add(text.split('/')[0]!.replace(/\?$/, ''));
      // A bare name enables an optional dependency of that name (sha2's `asm`).
      else referenced.add(text);
    }
  }
  for (const [name, entry] of Object.entries((manifest.dependencies as Table) ?? {})) {
    if (entry && typeof entry === 'object' && !Array.isArray(entry) && (entry as Table).optional !== true) referenced.add(name);
  }
  const targets = manifest.target as Table | undefined;
  /**
   * Windows-only dependencies are not in Cargo.lock (nothing here resolves
   * them) and can never be compiled: Mesa builds wasm32 for the browser and
   * the host tools for Linux. Dropping the table keeps the package's real
   * dependencies honest instead of vendoring winapi for a target never built.
   */
  for (const [predicate, table] of Object.entries(targets ?? {})) {
    // Everything here is either wasm32-unknown-unknown or Linux.
    if (/windows|wasi|ios|macos|android|fuchsia|hermit|redox|solaris|illumos|dragonfly|emscripten|haiku/i.test(predicate)) {
      delete targets![predicate];
      notes.push(`other-platform:${predicate.slice(0, 40)}`);
      continue;
    }
    const deps = (table as Table)?.dependencies as Table | undefined;
    if (!deps) continue;
    for (const [name, entry] of Object.entries(deps)) {
      if (entry && typeof entry === 'object' && (entry as Table).optional === true && !referenced.has(name)) delete deps[name];
    }
    if (Object.keys(deps).length === 0) delete (table as Table).dependencies;
    if (Object.keys(table as Table).length === 0) delete targets![predicate];
  }

  // `[lints] workspace = true` would inherit from a workspace that is not there.
  delete manifest.lints;
  manifest.workspace = {};
  const lines: string[] = ['# vendored by scripts/vendor-crates.ts — manifest expanded from its Git tag'];
  emitTable(manifest, [], lines);
  writeFileSync(join(targetDir, 'Cargo.toml'), lines.join('\n') + '\n');
  return notes;
}

/** One directory per package name: vendored manifests refer to siblings by path. */
const nameCounts = new Map<string, number>();
function directoryFor(pkg: Package): string {
  const occurrences = nameCounts.get(pkg.name) ?? 0;
  nameCounts.set(pkg.name, occurrences + 1);
  return occurrences === 0 ? pkg.name : `${pkg.name}-${pkg.version}`;
}

/**
 * A Git tag is a whole repository: zerocopy's checkout carries 600 MB of
 * `tools/` and a nested `vendor/`. Those heavy, non-source directories go;
 * everything else stays, because crates do read their own repository files at
 * compile time (`include_str!` of an example or a manifest). Deleting a little
 * too much turns into a confusing compile error; deleting the build system and
 * the vendored copies of dependencies does not.
 */
const DROP_DIRS = new Set(['tools', 'vendor', 'target', '.git', '.github', 'ci', 'githooks', 'agent_docs']);
function prune(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!DROP_DIRS.has(entry.name)) prune(path);
      else rmSync(path, { recursive: true, force: true });
    }
  }
}

/** cargo's directory source wants a checksum manifest; an empty file map is accepted. */
function writeChecksum(dir: string): void {
  writeFileSync(join(dir, '.cargo-checksum.json'), JSON.stringify({ files: {} }));
}

async function vendor(pkg: Package): Promise<'ok' | 'skipped' | 'missing-repo' | 'missing-tag' | 'missing-dir'> {
  const repo = REPOS[pkg.name];
  const target = join(outDir, directoryFor(pkg));
  if (existsSync(target)) return 'skipped';
  if (!repo) return 'missing-repo';
  const tags = await tagsOf(repo).catch(() => []);
  // Sibling packages share a repository and carry a tag for only one of them
  // (js-sys ships with wasm-bindgen under the same tag), so a sibling's tag is
  // a legitimate entry point for the same tree.
  const siblings = packages.filter((other) => other !== pkg && REPOS[other.name] === repo);
  const tag =
    (tags.length ? pickTag(tags, pkg.name, pkg.version) : undefined) ??
    siblings.map((other) => (tags.length ? pickTag(tags, other.name, other.version) : undefined)).find(Boolean) ??
    BRANCH_FALLBACK[pkg.name];
  if (!tag) return 'missing-tag';

  const ball = join(workDir, `${pkg.name}-${pkg.version}.tar.gz`);
  const unpack = join(workDir, `${pkg.name}-${pkg.version}`);
  if (!existsSync(ball)) {
    // curl, not fetch: the sandbox terminates TLS with a certificate Bun's
    // fetch rejects ("unable to verify the first certificate"), while curl
    // uses the system trust store.
    const url = `https://codeload.github.com/${repo}/tar.gz/${encodeURIComponent(tag)}`;
    const download = await $`curl -sSL --fail --max-time 180 -o ${ball} ${url}`.quiet().nothrow();
    if (download.exitCode !== 0) throw new Error(`codeload ${repo}@${tag}: ${download.stderr.toString().slice(0, 100)}`);
  }
  if (!existsSync(unpack)) {
    mkdirSync(unpack, { recursive: true });
    await $`tar xzf ${ball} -C ${unpack}`.quiet();
  }
  const roots = readdirSync(unpack).map((entry) => join(unpack, entry));
  const found = roots.map((entry) => findPackage(entry, pkg.name, pkg.version)).find((entry) => entry !== null);
  if (!found) return 'missing-dir';

  mkdirSync(outDir, { recursive: true });
  await $`cp -a ${found} ${target}`.quiet();
  rmSync(join(target, '.git'), { recursive: true, force: true });
  prune(target);
  const notes = prepareManifest(found, target);
  writeChecksum(target);
  if (notes.length) inherited.push(`${pkg.name}@${pkg.version} (${notes.length})`);
  created.push(`${pkg.name}@${pkg.version} <- ${repo}@${tag} sha256:${createHash('sha256').update(readFileSync(ball)).digest('hex')}`);
  return `ok` as const;
}

const only = argOf('--only')?.split(',').map((entry) => entry.trim());
mkdirSync(workDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

packages = lockedPackages().filter((pkg) => !only || only.includes(pkg.name));
const failures: string[] = [];
const inherited: string[] = [];
const created: string[] = [];

let done = 0;
for (const pkg of packages) {
  try {
    const result = await vendor(pkg);
    if (result === 'ok') done += 1;
    if (result !== 'ok' && result !== 'skipped') failures.push(`${pkg.name}@${pkg.version} [${result}] ${REPOS[pkg.name] ?? '-'}`);
    process.stdout.write(result === 'ok' ? `+ ${pkg.name}@${pkg.version}\n` : result === 'skipped' ? '' : `! ${pkg.name}@${pkg.version} ${result}\n`);
  } catch (error) {
    failures.push(`${pkg.name}@${pkg.version} [error] ${String(error).slice(0, 120)}`);
    process.stdout.write(`! ${pkg.name}@${pkg.version} ${String(error).slice(0, 120)}\n`);
  }
}

const total = readdirSync(outDir).filter((entry) => statSync(join(outDir, entry)).isDirectory()).length;
process.stdout.write(`\nvendidas ${total} / ${packages.length} (nuevas: ${done}) en ${outDir}\n`);
writeFileSync(join(outDir, 'PROVENANCE.txt'), created.sort().join('\n') + '\n');

if (inherited.length) {
  process.stdout.write(`\nHEREDAN DEL WORKSPACE (manifiesto necesita expansión): ${inherited.join(', ')}\n`);
}
if (failures.length) {
  process.stdout.write(`\nSIN VENDORIZAR:\n${failures.map((line) => `  ${line}`).join('\n')}\n`);
  process.exit(1);
}
