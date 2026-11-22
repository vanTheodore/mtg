import { expect, test } from 'bun:test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

/**
 * Lo que el motor compila dentro tiene que existir **en este árbol**.
 *
 * La importación de v0.130.0 trajo `include_str!("../../data/basic-land-art-v1.json")`
 * en `game/deck_loading.rs` y nadie trajo el fichero. No lo vio ninguna prueba de
 * `src/lib` (`engine:verify` hashea lo que hay, no resuelve rutas), ni el job de
 * `static`, que no compila Rust. Lo vieron los dos jobs que sí compilan, con un
 * `couldn't read ... No such file or directory` y dos minutos de CI por cada
 * intento — y el árbol local no tenía `cargo` para reproducirlo.
 *
 * Una importación puede traer un `include_str!` nuevo en cualquier dirección
 * (`../data`, `../../scripts`), así que lo que se vigila no es una lista de
 * ficheros sino la resolución de cada ruta literal del árbol importado. Las que
 * ya venían rotas de antes se declaran abajo con su razón; las nuevas fallan.
 */
const CRATES = ['crates/phase-engine/src', 'crates/phase-ast/src', 'crates/phase-parser/src'];

/**
 * Rutas que el árbol importado ya tenía rotas antes de esta prueba. Se declaran,
 * no se arreglan, porque el árbol se mantiene byte-idéntico al tarball del pin:
 * lo que diverge de upstream se decide a propósito, no como efecto colateral.
 */
const KNOWN_MISSING = new Map<string, string>([
  [
    'crates/phase-engine/src/types/format.rs -> client/src/adapter/types.ts',
    'sólo `#[test]`; las copias viven en `client-mirror/`. Ningún job de CI compila este módulo.'
  ],
  [
    'crates/phase-engine/src/types/format.rs -> client/src/data/formatRegistry.ts',
    'sólo `#[test]`; las copias viven en `client-mirror/`.'
  ],
  [
    'crates/phase-engine/src/bin/resolution_face_census.rs -> scripts/audit-resolution-face-casting.sh',
    'binario con `required-features = ["test-support"]`; `engine:build` construye `--lib` y el job de regresiones descarga el script antes de compilar.'
  ]
]);

/** Comentarios fuera: `source_census.rs` *cita* `include_str!("x.rs")` en su documentación. */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

function rustFiles(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) out.push(...rustFiles(path));
    else if (entry.endsWith('.rs')) out.push(path);
  }
  return out;
}

test('cada `include_str!`/`include_bytes!` del motor resuelve a un fichero de este repositorio', () => {
  const missing: string[] = [];
  for (const root of CRATES) {
    for (const file of rustFiles(root)) {
      const body = code(readFileSync(file, 'utf8'));
      for (const match of body.matchAll(/include_(?:str|bytes)!\("([^"]+)"\)/g)) {
        const target = normalize(join(dirname(file), match[1]!));
        if (existsSync(target)) continue;
        // La clave es la ruta **resuelta**: `../../client/...` y `client/...`
        // son el mismo fichero y no deben contarse dos veces ni dos formas.
        const key = `${file} -> ${target}`;
        if (KNOWN_MISSING.has(key)) continue;
        missing.push(key);
      }
    }
  }
  // Un `include_str!` que no resuelve no es un aviso: el crate no compila.
  expect([...new Set(missing)]).toEqual([]);
});

test('la lista de excepciones no envejece: lo declarado ausente sigue ausente y nada más', () => {
  const stillMissing = [...KNOWN_MISSING.keys()].filter((key) => {
    const [, target] = key.split(' -> ') as [string, string];
    return !existsSync(target);
  });
  // Si una importación trae el fichero, la excepción sobra y hay que borrarla:
  // una lista de excepciones que crece sin podarse deja de ser una prueba.
  expect(stillMissing.sort()).toEqual([...KNOWN_MISSING.keys()].sort());
});
