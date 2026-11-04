#!/usr/bin/env bun
/**
 * CI policy: main and engine/UI changes always run Rust, WASM and Chromium.
 * Documentation and the local WASM installer only need static checks. Unknown
 * paths and failed diff classification are always full, never silently light.
 */
import { appendFileSync } from 'node:fs';

const SAFE = new Set([
  'scripts/install-ci-wasm.ts',
  'scripts/preflight.ts',
  'src/lib/game/ci-wasm-artifact.test.ts',
  '.github/workflows/windows-install-smoke.yml'
]);

/**
 * Names from `git diff --no-renames --name-only -z`; both sides of a rename count.
 * Cargo.lock, package.json, TS game code, CI config, and new unknown paths are
 * never in the safe list.
 */
export function requiresHeavyCi(paths: readonly string[]): boolean {
  if (paths.length === 0) return true;
  return paths.some(path => !(path.startsWith('docs/') || path.endsWith('.md') || SAFE.has(path)));
}

function emit(heavy: boolean, note: string): void {
  const value = heavy ? 'true' : 'false';
  console.log('Mesa CI scope: heavy=' + value + ' (' + note + ')');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'heavy=' + value + '\n');
}

/**
 * Without --no-renames, Git reports only the DESTINATION of a rename:
 * moving src/lib/components/Board.svelte to docs/Board.md would appear to
 * change docs alone and incorrectly suppress engine/UI regressions.
 * Deliberately list both the deleted source and added destination.
 */
export function gitChangedPaths(base: string, head: string, cwd = process.cwd()): string[] | null {
  const diff = Bun.spawnSync(
    ['git', 'diff', '--no-renames', '--name-only', '-z', '--diff-filter=ACDMRT', base, head],
    { cwd, stdout: 'pipe', stderr: 'pipe' }
  );
  return diff.exitCode === 0 ? diff.stdout.toString().split('\0').filter(Boolean) : null;
}

function main(): void {
  if (process.env.GITHUB_EVENT_NAME !== 'pull_request') {
    emit(true, 'push main / manual: never skip rules');
    return;
  }
  const base = process.env.PR_BASE_SHA ?? '';
  const head = process.env.GITHUB_SHA ?? '';
  if (!/^[a-f0-9]{40}$/.test(base) || !/^[a-f0-9]{40}$/.test(head)) {
    emit(true, 'invalid PR SHA, fail closed');
    return;
  }
  // GITHUB_SHA is the synthetic PR merge commit, which also contains the head
  // of a forked PR. Comparing to the base sha covers all proposed changes.
  const changed = gitChangedPaths(base, head);
  if (!changed) {
    emit(true, 'git diff failed, fail closed');
    return;
  }
  emit(requiresHeavyCi(changed), changed.length ? changed.join(', ') : 'empty diff, fail closed');
}

if (import.meta.main) main();
