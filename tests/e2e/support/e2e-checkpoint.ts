import { test } from '@playwright/test';

const MAX_CHECKPOINTS = 24;
const MAX_DESCRIPTION_LENGTH = 120;

/** Keep only a bounded tail of privacy-safe, static E2E transition labels. */
export function checkpoint(description: string): void {
  const label = description.replace(/[\r\n\u0000-\u001f]/g, ' ').slice(0, MAX_DESCRIPTION_LENGTH);
  const annotations = test.info().annotations;
  const last = annotations.at(-1);
  if (last?.type === 'e2e-checkpoint' && last.description === label) return;

  annotations.push({ type: 'e2e-checkpoint', description: label });
  const checkpoints = annotations.filter((entry) => entry.type === 'e2e-checkpoint');
  while (checkpoints.length > MAX_CHECKPOINTS) {
    const oldest = checkpoints.shift();
    const index = oldest ? annotations.indexOf(oldest) : -1;
    if (index >= 0) annotations.splice(index, 1);
  }
}
