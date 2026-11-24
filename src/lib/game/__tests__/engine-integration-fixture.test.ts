import { expect, test } from 'bun:test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * El fixture de cartas de integración, en su forma nueva.
 *
 * Hasta este pin (`31123e2b`) el fixture era un solo `integration_cards.json.gz`.
 * Upstream lo partió en `integration_cards/*.jsonl` —una línea por carta, ordenada
 * por clave, un fichero por inicial— para que dos PR que toquen cartas distintas
 * no choquen. El lector pasó a ser `database/integration_fixture.rs`, un módulo de
 * **librería** que hace `fs::read_dir` (no `include_str!`), así que el build WASM
 * no lo necesita, pero cualquier prueba que cargue cartas sí: `tests/integration/support.rs`
 * lo usa, y es lo que compila el job «Phase source regressions».
 *
 * Esto no se comprueba desde Rust aquí porque este entorno no tiene `cargo`. Se
 * comprueba la propiedad que haría fallar ese job: que el directorio esté, que
 * cada línea sea un registro `{key, card}`, que esté ordenado por clave y que no
 * haya claves repetidas. Un `.jsonl` corrupto es un `expect("fixture should load")`
 * en CI, a dos minutos por intento y con los logs detrás de un blob inalcanzable.
 */
const FIXTURE = 'crates/phase-engine/tests/fixtures/integration_cards';
const legacyGz = 'crates/phase-engine/tests/fixtures/integration_cards.json.gz';

type Record_ = { key: string; card: unknown };

function shards(): string[] {
  return readdirSync(FIXTURE).filter((name) => name.endsWith('.jsonl')).sort();
}

test('el fixture es un directorio de shards y el .gz monolítico ya no está', () => {
  expect(existsSync(FIXTURE)).toBe(true);
  // Si el .gz volviera, dos formas del mismo fixture convivirían y el lector
  // (`integration_fixture`) ignoraría una de ellas en silencio.
  expect(existsSync(legacyGz)).toBe(false);
  const files = shards();
  expect(files.length).toBeGreaterThan(20);
  // Un fichero por inicial más los dos comodines del lector.
  expect(files).toContain('a.jsonl');
  expect(files).toContain('_digits.jsonl');
  expect(files).toContain('_other.jsonl');
});

test('cada shard es JSON Lines válido, ordenado por clave y sin claves repetidas', () => {
  const problems: string[] = [];
  const seen = new Map<string, string>();
  let records = 0;

  for (const file of shards()) {
    const text = readFileSync(join(FIXTURE, file), 'utf8');
    const lines = text.split('\n');
    // El fichero termina en salto de línea: la última entrada vacía no es un registro.
    if (lines.at(-1) === '') lines.pop();
    let previous: string | null = null;

    lines.forEach((line, index) => {
      const where = `${file}:${index + 1}`;
      if (!line.trim()) {
        problems.push(`${where}: línea vacía`);
        return;
      }
      let parsed: Record_;
      try {
        parsed = JSON.parse(line) as Record_;
      } catch (error) {
        problems.push(`${where}: no es JSON (${String(error).slice(0, 60)})`);
        return;
      }
      if (typeof parsed.key !== 'string' || !('card' in parsed)) {
        problems.push(`${where}: se esperaba {key, card}`);
        return;
      }
      if (parsed.key !== parsed.key.toLowerCase()) {
        problems.push(`${where}: la clave no está en minúsculas (${parsed.key})`);
      }
      if (previous !== null && parsed.key < previous) {
        problems.push(`${where}: orden roto (${previous} > ${parsed.key})`);
      }
      previous = parsed.key;
      if (seen.has(parsed.key)) {
        problems.push(`${where}: clave repetida ${parsed.key} (ya en ${seen.get(parsed.key)})`);
      }
      seen.set(parsed.key, where);
      records += 1;
    });
  }

  expect(problems).toEqual([]);
  // El fixture anterior tenía 8 417 claves; el nuevo es un superconjunto. Un
  // número muy por debajo significaría shards truncados en la importación.
  expect(records).toBeGreaterThanOrEqual(8417);
});
