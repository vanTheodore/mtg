import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { committedCargoLockSha256, parseSha256sum, selectVerifiedRun, type VerifiedRun } from '../../../scripts/install-ci-wasm.ts';

const head = 'a'.repeat(40);
const good: VerifiedRun = {
  databaseId: 42, headSha: head, headBranch: 'main', status: 'completed',
  conclusion: 'success', event: 'push', workflowName: 'Mesa CI'
};

test('solo admite un CI verde del commit exacto de main', () => {
  expect(selectVerifiedRun([good], head)?.databaseId).toBe(42);
  for (const wrong of [
    { ...good, headSha: 'b'.repeat(40) },
    { ...good, headBranch: 'feature' },
    { ...good, event: 'pull_request' },
    { ...good, status: 'in_progress' },
    { ...good, conclusion: 'failure' },
    { ...good, workflowName: 'Other workflow' },
    { ...good, databaseId: 0 }
  ]) {
    expect(selectVerifiedRun([wrong], head)).toBeUndefined();
  }
  expect(selectVerifiedRun([{ ...good, event: 'workflow_dispatch' }], head)?.databaseId).toBe(42);
});

test('SHA-256 exige un solo digest de la ruta esperada', () => {
  const digest = 'F'.repeat(64);
  expect(parseSha256sum(digest + '  Cargo.lock\n', 'Cargo.lock')).toBe('f'.repeat(64));
  expect(parseSha256sum(digest + ' *static/wasm/mtg_engine_wasm.wasm\n',
    'static/wasm/mtg_engine_wasm.wasm')).toBe('f'.repeat(64));
  expect(() => parseSha256sum(digest + '  wrong.wasm', 'Cargo.lock')).toThrow();
  expect(() => parseSha256sum(digest + '  Cargo.lock\n' + digest + '  Cargo.lock', 'Cargo.lock')).toThrow();
  expect(() => parseSha256sum('corrupt  Cargo.lock', 'Cargo.lock')).toThrow();
});

test('Cargo.lock: hash de Git HEAD, igual en LF y checkout Windows CRLF', () => {
  const root = mkdtempSync(join(tmpdir(), 'mesa-lock-sha-'));
  const runGit = (...args: string[]) => {
    const result = Bun.spawnSync(['git', ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());
    return result.stdout.toString().trim();
  };
  try {
    runGit('init', '-q');
    runGit('config', 'core.autocrlf', 'true');
    const lock = join(root, 'Cargo.lock');
    const contentLF = 'version = 4\n\n[[package]]\nname = "fixture"\n';
    writeFileSync(lock, contentLF);
    runGit('add', 'Cargo.lock');
    runGit('-c', 'user.name=Mesa Test', '-c', 'user.email=ci@example.invalid',
      'commit', '-qm', 'pin lockfile');
    const expected = createHash('sha256').update(contentLF).digest('hex');
    expect(committedCargoLockSha256(root)).toBe(expected);
    writeFileSync(lock, contentLF.replace(/\n/g, '\r\n'));
    expect(createHash('sha256').update(readFileSync(lock)).digest('hex')).not.toBe(expected);
    expect(runGit('status', '--porcelain', '--', 'Cargo.lock')).toBe('');
    expect(committedCargoLockSha256(root)).toBe(expected);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Cargo.lock: rechaza cuando falta en Git HEAD', () => {
  const root = mkdtempSync(join(tmpdir(), 'mesa-lock-missing-'));
  try {
    expect(() => committedCargoLockSha256(root)).toThrow('No se pudo leer Cargo.lock');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
