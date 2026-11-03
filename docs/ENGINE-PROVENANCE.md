# Procedencia del motor Phase (actualizado 2026-11-03)

El pin **autoritativo** está en [`docs/PHASE-UPSTREAM-PIN.json`](PHASE-UPSTREAM-PIN.json).
No se debe mantener un SHA histórico duplicado en el verificador ni en otros documentos.

- Upstream: https://github.com/phase-rs/phase
- Commit incorporado: `0dd35e4a9dfe1dfba697224775d2205d56f7f20d`
- Workspace: `0.119.0`
- Actualizado mediante PR [#6](https://github.com/vanTheodore/mtg/pull/6) (2 de noviembre de 2026), desde el pin anterior `c2fbb7a`.
- Crates de reglas importados: `crates/phase-engine`, `crates/phase-ast` y `crates/phase-parser`.
- Licencias: MIT OR Apache-2.0; `licenses/PHASE-MIT` y `licenses/PHASE-APACHE`.

## Qué verifica el proyecto

`bun run engine:verify` recorre `crates/phase-engine/src` y calcula
SHA-256 de cada ruta/contenido, ordenadas por nombre; compara el digest
agregado con `sourceSha256` del JSON de procedencia:

```text
5c4facfdf23732c91dd07cee3555c4c1de144f1ea7e2c613bbab3d142d905f38
```

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
  [`PHASE-UPSTREAM-2026-11-03.md`](PHASE-UPSTREAM-2026-11-03.md).

No se inventan reglas en TypeScript ni se incorpora React a Mesa.
