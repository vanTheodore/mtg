import { expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gitChangedPaths, requiresHeavyCi } from '../../../scripts/ci-change-scope.ts';

test('documentation and vetted local installer tools use quick static CI', () => {
  expect(requiresHeavyCi(['docs/LOCAL-ASSETS-WINDOWS.md'])).toBe(false);
  expect(requiresHeavyCi(['README.md', 'docs/PHASE-UPSTREAM-PIN.md'])).toBe(false);
  expect(requiresHeavyCi([
    'scripts/install-ci-wasm.ts', 'scripts/preflight.ts',
    'src/lib/game/ci-wasm-artifact.test.ts',
    '.github/workflows/windows-install-smoke.yml'
  ])).toBe(false);
});

test('engine, UI, dependencies and CI policy always require full verification', () => {
  for (const path of [
    'Cargo.lock',
    'package.json',
    'bun.lock',
    'crates/phase-engine/src/lib.rs',
    'crates/mtg-engine-wasm/src/lib.rs',
    'src/lib/components/Board.svelte',
    'src/lib/styles/arena.css',
    'src/lib/game/catalog.ts',
    'tests/e2e/ui-deck-10e.spec.ts',
    '.github/workflows/ci.yml',
    'scripts/ci-change-scope.ts',
    'src/lib/game/ci-change-scope.test.ts',
    '.github/workflows/unknown.yml',
    'scripts/unrecognized.ts'
  ]) expect(requiresHeavyCi([path]), path).toBe(true);
});

test('mixed and empty diffs fail closed', () => {
  expect(requiresHeavyCi([])).toBe(true);
  expect(requiresHeavyCi(['docs/README.md', 'Cargo.lock'])).toBe(true);
  expect(requiresHeavyCi(['scripts/preflight.ts', 'src/lib/engine/client.ts'])).toBe(true);
});

test('renaming gameplay code into docs never bypasses the full matrix', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'mesa-ci-renames-'));
  const git = (...args: string[]) => {
    const result = Bun.spawnSync(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  };
  try {
    git('init', '-q');
    mkdirSync(join(cwd, 'src/lib/components'), { recursive: true });
    const source = join(cwd, 'src/lib/components/Board.svelte');
    writeFileSync(source, '<script lang="ts">let player = 1;</script>\n<h1>Phase battlefield</h1>\n');
    git('add', '-A');
    git('-c', 'user.name=Mesa CI', '-c', 'user.email=ci@example.invalid', 'commit', '-qm', 'original');
    mkdirSync(join(cwd, 'docs'), { recursive: true });
    renameSync(source, join(cwd, 'docs/Board.md'));
    git('add', '-A');
    git('-c', 'user.name=Mesa CI', '-c', 'user.email=ci@example.invalid', 'commit', '-qm', 'moved');
    const paths = gitChangedPaths('HEAD~1', 'HEAD', cwd);
    expect(paths).toContain('docs/Board.md');
    expect(paths).toContain('src/lib/components/Board.svelte');
    expect(requiresHeavyCi(paths ?? [])).toBe(true);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
