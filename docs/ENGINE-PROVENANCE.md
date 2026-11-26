# Procedencia del motor Phase (actualizado 2026-11-26)

El pin **autoritativo** está en [`docs/PHASE-UPSTREAM-PIN.json`](PHASE-UPSTREAM-PIN.json).
No se debe mantener un SHA histórico duplicado en el verificador ni en otros documentos.

- Upstream: https://github.com/phase-rs/phase
- Commit incorporado: el valor `commit` de [`PHASE-UPSTREAM-PIN.json`](PHASE-UPSTREAM-PIN.json), sin duplicar el SHA aquí.
- Workspace: `0.133.0`
- Actualizaciones importadas: [#6](https://github.com/vanTheodore/mtg/pull/6), [#16](https://github.com/vanTheodore/mtg/pull/16), la revisión de 11 commits hasta `d963d0a` (3 de noviembre de 2026), la de 56 commits hasta `f671692` (7 de noviembre de 2026, [`PHASE-UPSTREAM-2026-11-07-F671692.md`](PHASE-UPSTREAM-2026-11-07-F671692.md)) la de 7 commits hasta `1038a9d` —release v0.120.0— (7 de noviembre de 2026, [`PHASE-UPSTREAM-2026-11-07-1038A9D.md`](PHASE-UPSTREAM-2026-11-07-1038A9D.md)) la de 32 commits hasta `917542c` —releases v0.121.0 a v0.123.0— (7 de noviembre de 2026, [`PHASE-UPSTREAM-2026-11-07-917542C.md`](PHASE-UPSTREAM-2026-11-07-917542C.md)) la de 12 commits hasta `3c8d9bc` (7 de noviembre de 2026, [`PHASE-UPSTREAM-2026-11-07-3C8D9BC.md`](PHASE-UPSTREAM-2026-11-07-3C8D9BC.md)) y la de 10 commits hasta `1cd03ab` —release v0.124.0— (7 de noviembre de 2026, [`PHASE-UPSTREAM-2026-11-07-1CD03AB.md`](PHASE-UPSTREAM-2026-11-07-1CD03AB.md)) la de 4 commits hasta `74fc941c` (13 de noviembre de 2026, [`PHASE-UPSTREAM-2026-11-13-74FC941.md`](PHASE-UPSTREAM-2026-11-13-74FC941.md)) la de 61 commits hasta `c07324a5` —releases v0.125.0 y v0.126.0— (15 de noviembre de 2026, [`PHASE-UPSTREAM-2026-11-15-C07324A.md`](PHASE-UPSTREAM-2026-11-15-C07324A.md)) la de 33 commits hasta `28b2f9e4` —release v0.127.0— (16 de noviembre de 2026, [`PHASE-UPSTREAM-2026-11-16-28B2F9E.md`](PHASE-UPSTREAM-2026-11-16-28B2F9E.md)) la de 38 commits hasta `576e2bf5` —release v0.128.0— (18 de noviembre de 2026, [`PHASE-UPSTREAM-2026-11-18-576E2BF.md`](PHASE-UPSTREAM-2026-11-18-576E2BF.md)) la de 45 commits hasta `2581c56e` —release v0.129.0— (19 de noviembre de 2026, [`PHASE-UPSTREAM-2026-11-19-2581C56.md`](PHASE-UPSTREAM-2026-11-19-2581C56.md)) y la de 72 commits hasta `d01766e1` —release v0.130.0— (22 de noviembre de 2026, [`PHASE-UPSTREAM-2026-11-22-D01766E1.md`](PHASE-UPSTREAM-2026-11-22-D01766E1.md)), la de 26 commits hasta `31123e2b` —v0.131.0— (23 de noviembre de 2026, [`PHASE-UPSTREAM-2026-11-23-31123E2B.md`](PHASE-UPSTREAM-2026-11-23-31123E2B.md)) y la de **60 commits** hasta `e5368963` —releases v0.132.0 y v0.133.0— (26 de noviembre de 2026, [`PHASE-UPSTREAM-2026-11-26-E5368963.md`](PHASE-UPSTREAM-2026-11-26-E5368963.md)). Véanse los informes de importación.
- Crates de reglas importados: `crates/phase-engine`, `crates/phase-ast` y `crates/phase-parser`.
- Licencias: MIT OR Apache-2.0; `licenses/PHASE-MIT` y `licenses/PHASE-APACHE`.

## Qué verifica el proyecto

`bun run engine:verify` recorre **los cinco árboles declarados en
[`PHASE-UPSTREAM-PIN.json`](PHASE-UPSTREAM-PIN.json)** (`crates/phase-engine/src`,
`crates/phase-ast/src`, `crates/phase-ast/data`, `crates/phase-parser/src` y
`crates/phase-engine/data`): para cada uno calcula el SHA-256 de cada
ruta/contenido, ordenadas por nombre, y compara el digest agregado con el
`sha256` de ese árbol. `sourceSha256` sigue siendo el digest de
`crates/phase-engine/src`, declarado una sola vez; el verificador lee el
manifiesto y devuelve el valor calculado de cada árbol en su informe.

**Alcance explícito:** la huella acredita que esos cinco árboles son
byte-idénticos al tarball del pin. **No** acredita los `Cargo.toml`, el
`Cargo.lock`, las pruebas de integración, los fixtures ni los espejos del
cliente, que tienen desviaciones declaradas más abajo. El build/lock de Cargo,
la compilación WASM y la paridad se verifican por separado en CI.

`cargo metadata --locked`, `engine:parity`, `engine:scenarios` y
la suite Chromium acompañan la comprobación. La autoridad de
legalidad, estados de juego y visibilidad pertenece a Rust/WASM, no
a los componentes Svelte.

## Lo que el motor compila dentro y no está en `src/`

`engine:verify` hashea `crates/phase-engine/src`; **no** acredita que un `include_str!` que apunta
fuera del árbol resuelva. Desde v0.130.0 la librería compila `crates/phase-engine/data/basic-land-art-v1.json`
(`game/deck_loading.rs::assign_basic_land_art`) además de `data/ai_commander_decks.json`
(`ai_deck_manifest.rs`); sin el primero no compila ni el WASM ni la paridad. Esa comprobación la hace
`src/lib/game/__tests__/engine-embedded-files.test.ts`, que recorre los tres árboles importados y
resuelve cada ruta literal, con la excepción heredada declarada y su razón.
`src/lib/game/__tests__/phase-pin-contract.test.ts` vigila además que el
manifiesto, los tres `Cargo.toml`, el `Cargo.lock` y las dos copias del contrato
TypeScript del adaptador no diverjan entre sí.

## Adaptaciones locales deliberadas

- `crates/mtg-engine-wasm` es un puente ABI C/JSON de Mesa, no el cliente
  React upstream.
- La toolchain compilada por CI está fijada a `nightly-2025-03-02`.
- `Cargo.lock` es específico del workspace importado; no se actualiza
  de manera independiente de un cambio de Phase validado. En la importación
  de `0.123.0` cambiaron solo las tres líneas de versión de los crates
  importados, en el mismo commit que su `Cargo.toml`; la de `0.124.0` repite ese
  cambio porque upstream subió la versión del workspace, la de `0.126.0`, la de `0.127.0` y la de `0.128.0` también
  (upstream ya usa `version.workspace = true`, así que el `Cargo.toml` importado sigue
  llevando la versión literal).
- `phase-engine` compila dentro dos ficheros TypeScript del cliente upstream
  (`client/src/adapter/types.ts` y `client/src/data/formatRegistry.ts`) desde las aserciones
  `client_builtin_game_format_union_matches_the_engine` y
  `client_format_registry_matches_the_engine`. Mesa no importa el cliente React, así que esas
  copias viven en `crates/phase-engine/client-mirror/`. **Ojo:** las llamadas `include_str!` del árbol
  importado siguen nombrando las rutas upstream, no `client-mirror/` (el árbol es byte-idéntico al
  tarball); el árbol importado se mantiene fiel y lo único que diverge se declara. Ningún job de CI
  compila esos módulos, pero `cargo test -p phase-engine` sí, y entonces hay que apuntarlas. Son
  bytes del commit fijado, no del tag; los hashes están en el informe de importación. Sólo las
  usa `#[test]`: el build del motor no las necesita, pero `cargo test` sí, o no compila.
- Los `Cargo.toml` de `phase-engine`, `phase-ast` y `phase-parser` llevan la
  versión literal (upstream usa `version.workspace = true`); el valor debe
  seguir al `version` de `docs/PHASE-UPSTREAM-PIN.json`.
- De `crates/engine/tests/integration` se conservan los módulos que ya estaban
  en Mesa más las altas de cada pin; **357 módulos** que Mesa nunca importó
  siguen podados. Por eso `main.rs` y los cuatro `shard_*.rs` no son copias del
  tarball: son raíces de Mesa que declaran una sola vez cada módulo conservado.
  `shorten_efficacy.rs` es el único fichero propio y queda sin declarar a
  propósito. Los fixtures `legacy_saves/v0_128_0/` tampoco se importan: su único
  lector es un `#[cfg(test)]` del `crate/engine-wasm` upstream, que Mesa no tiene.
- Las pinturas WebP del cliente de Phase tienen procedencia y hashes en
  `static/phase/arenas/SOURCE.md`, separados del motor de reglas.
- El origen y las decisiones del import anterior están en
  [`PHASE-UPSTREAM-2026-11-02.md`](PHASE-UPSTREAM-2026-11-02.md);
  la revisión posterior está en
  [`PHASE-UPSTREAM-2026-11-03.md`](PHASE-UPSTREAM-2026-11-03.md) y la nueva auditoría
  [`PHASE-UPSTREAM-2026-11-03-D963D0.md`](PHASE-UPSTREAM-2026-11-03-D963D0.md); la última
  importación, en
  [`PHASE-UPSTREAM-2026-11-07-F671692.md`](PHASE-UPSTREAM-2026-11-07-F671692.md);
  la importación de UP-133 está en
  [`PHASE-UPSTREAM-2026-11-26-E5368963.md`](PHASE-UPSTREAM-2026-11-26-E5368963.md).

No se inventan reglas en TypeScript ni se incorpora React a Mesa.
