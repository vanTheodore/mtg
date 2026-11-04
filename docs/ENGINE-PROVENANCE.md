# Procedencia del motor Phase (actualizado 2026-11-03)

El pin **autoritativo** está en [`docs/PHASE-UPSTREAM-PIN.json`](PHASE-UPSTREAM-PIN.json).
No se debe mantener un SHA histórico duplicado en el verificador ni en otros documentos.

- Upstream: https://github.com/phase-rs/phase
- Commit incorporado: el valor `commit` de [`PHASE-UPSTREAM-PIN.json`](PHASE-UPSTREAM-PIN.json), sin duplicar el SHA aquí.
- Workspace: `0.119.0`
- Actualizaciones importadas: [#6](https://github.com/vanTheodore/mtg/pull/6), [#16](https://github.com/vanTheodore/mtg/pull/16) y la revisión de 11 commits hasta `d963d0a` (3 de noviembre de 2026). Véanse los informes de importación.
- Crates de reglas importados: `crates/phase-engine`, `crates/phase-ast` y `crates/phase-parser`.
- Licencias: MIT OR Apache-2.0; `licenses/PHASE-MIT` y `licenses/PHASE-APACHE`.

## Qué verifica el proyecto

`bun run engine:verify` recorre `crates/phase-engine/src` y calcula
SHA-256 de cada ruta/contenido, ordenadas por nombre; compara el digest
agregado con `sourceSha256` del JSON de procedencia. El digest solo se declara una vez en [`PHASE-UPSTREAM-PIN.json`](PHASE-UPSTREAM-PIN.json); el verificador lo lee directamente y devuelve el valor calculado en su informe.

**Alcance explícito:** esta huella corresponde al código fuente de
`phase-engine/src`; **no** acredita por sí sola que `phase-ast` o
`phase-parser` sean byte-idénticos. El build/lock de Cargo, la compilación
WASM y la paridad se verifican por separado en CI. No afirmar que se
verificaron los tres árboles con un único digest.

`cargo metadata --locked`, `engine:parity`, `engine:scenarios` y
la suite Chromium acompañan la comprobación. La autoridad de
legalidad, estados de juego y visibilidad pertenece a Rust/WASM, no
a los componentes Svelte.

## Adaptaciones locales deliberadas

- `crates/mtg-engine-wasm` es un puente ABI C/JSON de Mesa, no el cliente
  React upstream.
- La toolchain compilada por CI está fijada a `nightly-2025-03-02`.
- `Cargo.lock` es específico del workspace importado; no se actualiza
  de manera independiente de un cambio de Phase validado.
- Las pinturas WebP del cliente de Phase tienen procedencia y hashes en
  `static/phase/arenas/SOURCE.md`, separados del motor de reglas.
- El origen y las decisiones del import anterior están en
  [`PHASE-UPSTREAM-2026-11-02.md`](PHASE-UPSTREAM-2026-11-02.md);
  la revisión posterior está en
  [`PHASE-UPSTREAM-2026-11-03.md`](PHASE-UPSTREAM-2026-11-03.md) y la nueva auditoría
  [`PHASE-UPSTREAM-2026-11-03-D963D0.md`](PHASE-UPSTREAM-2026-11-03-D963D0.md).

No se inventan reglas en TypeScript ni se incorpora React a Mesa.
