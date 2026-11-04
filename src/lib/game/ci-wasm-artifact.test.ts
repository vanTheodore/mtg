import { expect, test } from 'bun:test';
import { parseSha256sum, selectVerifiedRun, type VerifiedRun } from '../../../scripts/install-ci-wasm.ts';

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
