import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const components = fileURLToPath(new URL('../../components/', import.meta.url));
const uiFiles = [
  'src/app.html',
  'src/routes/+page.svelte',
  ...readdirSync(components).filter((file) => file.endsWith('.svelte')).map((file) => `src/lib/components/${file}`)
];

/**
 * The interface targets Spanish for Latin America (es-419). Peninsular-only
 * wording is rejected so the vocabulary does not drift back to Spain Spanish.
 * Magic terms shared by every Spanish printing ("coste de maná", "cementerio",
 * "campo de batalla") are deliberately kept.
 */
const PENINSULAR = /\b(pulsa|pulsar|púlsalo|púlsalos|ordenador|móvil|vosotros|coger)\b/i;

describe('Spanish (Latin America) interface', () => {
  test('declares es-419 as the document language', () => {
    const html = readFileSync(`${root}src/app.html`, 'utf8');
    expect(html).toContain('<html lang="es-419">');
  });

  test('keeps peninsular wording out of the visible interface', () => {
    const offenders = uiFiles.flatMap((file) => readFileSync(`${root}${file}`, 'utf8')
      .split('\n')
      .map((line, index) => ({ file, line: index + 1, text: line }))
      .filter(({ text }) => PENINSULAR.test(text))
      .map(({ file, line, text }) => `${file}:${line} ${text.trim()}`));
    expect(offenders).toEqual([]);
  });

  test('every screen ships Spanish copy, not engine identifiers', () => {
    const page = readFileSync(`${root}src/routes/+page.svelte`, 'utf8');
    expect(page).toContain('Mesa · Cliente MTG');
    const decision = readFileSync(`${root}src/lib/components/DecisionPanel.svelte`, 'utf8');
    expect(decision).not.toMatch(/>\s*DeclareAttackers\s*</);
    expect(decision).toContain('Tu siguiente decisión');
  });
});
