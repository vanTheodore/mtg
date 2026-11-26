import { expect, test } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * UP-133: the two places that can silently drift when a Phase pin is imported.
 *
 * 1. The provenance manifest, the three vendored crate manifests and the local
 *    reduced Cargo.lock must agree on the workspace version.
 * 2. The adapter's generated TypeScript contract is mirrored in two places; a
 *    pin that changes `WaitingFor` must update both, or the client and the
 *    engine's own source censuses disagree about the same wire shape.
 *
 * The third test is the reason this file exists: v0.133.0 changed
 * `WaitingFor::KeepExactPermanentsChoice` from "exactly N" to a
 * [minimum_count, required_count] window. `KeepExactPrompt.svelte` now reads
 * `minimum_count`; if a future import removes it without revisiting that view,
 * this test fails instead of leaving the UI to refuse legal answers.
 */
const pin = JSON.parse(readFileSync('docs/PHASE-UPSTREAM-PIN.json', 'utf8')) as {
  origin: string;
  commit: string;
  version: string;
  trees: { local: string; files: number; sha256: string }[];
};

function fileCount(root: string): number {
  let total = 0;
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) total += fileCount(path);
    else total += 1;
  }
  return total;
}

test('el manifiesto de procedencia y los Cargo.toml importados dicen la misma versión', () => {
  expect(pin.origin).toBe('https://github.com/phase-rs/phase');
  expect(pin.commit).toMatch(/^[a-f0-9]{40}$/);
  expect(pin.version).toMatch(/^\d+\.\d+\.\d+$/);
  for (const crate of ['phase-engine', 'phase-ast', 'phase-parser']) {
    const manifest = readFileSync(`crates/${crate}/Cargo.toml`, 'utf8');
    expect(manifest).toContain(`version = "${pin.version}"`);
  }
  const lock = readFileSync('Cargo.lock', 'utf8');
  for (const crate of ['phase-engine', 'phase-ast', 'phase-parser']) {
    expect(lock).toContain(`name = "${crate}"\nversion = "${pin.version}"`);
  }
});

test('cada árbol del manifiesto tiene el número de ficheros declarado', () => {
  expect(pin.trees.length).toBeGreaterThanOrEqual(5);
  for (const tree of pin.trees) expect(fileCount(tree.local)).toBe(tree.files);
});

test('el contrato TypeScript del adaptador está en sus dos copias, byte a byte', () => {
  const client = readFileSync('client/src/adapter/types.ts');
  const mirror = readFileSync('crates/phase-engine/client-mirror/types.ts');
  expect(Buffer.compare(client, mirror)).toBe(0);
});

test('v0.133.0: el guardián publica un suelo y la vista lo lee', () => {
  const types = readFileSync('client/src/adapter/types.ts', 'utf8');
  const start = types.indexOf('type: "KeepExactPermanentsChoice"');
  expect(start).toBeGreaterThan(0);
  expect(types.slice(start, start + 600)).toContain('minimum_count?: number | null');
  const view = readFileSync('src/lib/components/KeepExactPrompt.svelte', 'utf8');
  expect(view).toContain('prompt.minimumCount');
  const parser = readFileSync('src/lib/game/interaction.ts', 'utf8');
  expect(parser).toContain('data.minimum_count');
});
