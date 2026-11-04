import { expect, test } from 'bun:test';
import { requiresHeavyCi } from '../../../scripts/ci-change-scope.ts';

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
