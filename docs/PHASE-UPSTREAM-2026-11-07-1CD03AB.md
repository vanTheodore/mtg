# Phase: importación aislada de fuentes Rust — 7 nov 2026 (release v0.124.0)

- Pin antiguo: `3c8d9bca3019c92a36b51f96760a102a8c26181d` (v0.123.0).
- Pin nuevo: `1cd03ab59083665b5cc5ed9f2b161c68808d8a71` (**10 commits posteriores**, con **release v0.124.0**: el workspace sube a `0.124.0`, así que las tres líneas de versión de los `Cargo.toml` importados y sus tres entradas de `Cargo.lock` sí cambian esta vez).
- Comparación: https://github.com/phase-rs/phase/compare/3c8d9bca3019c92a36b51f96760a102a8c26181d...1cd03ab59083665b5cc5ed9f2b161c68808d8a71
- Reimportados `crates/engine/src`, `crates/phase-ast/src` y `crates/phase-parser/src` desde el tarball del commit nuevo. `diff -rq` contra el tarball: **sin diferencias en los tres**.

## Los 10 commits

| Commit | Asunto | Efecto en la mesa |
| --- | --- | --- |
| `1cd03ab5` | hide round-only pod setup for drafts that play no rounds (#10822) | Cliente de draft: no se porta. |
| `e4f8fdc7` | the die-roll winner chooses who plays first (CR 103.1) (#10818) | **Motor**: nueva `WaitingFor::ChooseStartingPlayer` y el evento `StartingPlayerContest`. Portado como vista (33 de 148). |
| `017abf46` | refresh MTGJSON token & subtype catalogs (#10820) | `phase-ast/data`: `confirmed-misparses.toml` y el sello `mtgjson-vintage` (2026-11-11 → 2026-11-12). |
| `4164111e` | consolidated reviews, no inactivity closing, CodeRabbit pause (#10813) | Repositorio: no afecta al motor. |
| `f2fde9ea` | Fix paused resolution cleanup after trusted match forfeits (#10811) | Motor: limpieza al abandonar; sin cambio de contrato. |
| `e395f762` | grant quoted abilities on enters-with-counters riders (#10722) | Parser: `oracle_replacement.rs`. |
| `8274c63b` | host-adjustable poison-counter loss threshold (#10809) | Motor + cliente: umbral de veneno configurable; el equipo lo fija el anfitrión, no hay prompt nuevo. |
| `5730c335` | release: v0.124.0 | Versiones del workspace. |
| `f2e556b8` | refresh metagame feeds (#10808) | Datos del análisis: no se importan. |
| `d0a95da4` | break equal suggestion-color scores deterministically (#10804) | Draft: no se porta. |

## Qué cambia de tamaño

| Árbol | Ficheros antes | Ficheros ahora |
| --- | --- | --- |
| `crates/phase-engine/src` | 480 | 480 |
| `crates/phase-ast/src` | 34 | 34 |
| `crates/phase-parser/src` | 392 | 392 |

**37 ficheros** de `src` cambian (36 del motor, 1 del parser); no hay altas ni bajas de fichero. En pruebas y datos conservados cambian **12 ficheros** de `tests` (fixtures de integración y shards 3–5) y **2** de `phase-ast/data`; la poda de ficheros upstream que Mesa no usa se mantiene.

## Impacto en el port de vistas (#60)

`WaitingFor` pasa de **147 a 148 variantes**: la única alta es `ChooseStartingPlayer`, y no hay bajas. Los bloques de campos de las **30** variantes que Mesa ya representaba son **idénticos** entre los dos pines, comparados bloque a bloque.

La vista nueva no es cosmética: CR 103.1 dice que la tirada inicial decide **quién elige** quién empieza, no quién empieza. El motor ya corre el concurso y publica `player` (el ganador de la tirada) y `candidates` (los asientos que aceptará, en orden de asiento; CR 103.1a: en equipo, el asiento nombra al equipo).

**Adaptación local, explícita:** `crates/mtg-engine-wasm` arranca con `start_game_with_starting_player(first_player)`, no con `start_game`, así que Mesa **no corre** el concurso de dados y el primer turno es el que pide el cliente (por defecto el asiento 0). Es lo que mantiene deterministas las pruebas de arranque. La vista está portada igualmente: el contrato se cubre, y el día que el puente use `start_game` la mesa no se queda parada en un prompt desconocido. El evento `StartingPlayerContest` no se resume en el registro; el resumen de eventos de Mesa ignora lo que no conoce, así que tampoco hay texto inventado.

## Verificación

- SHA-256 agregado de `phase-engine/src` con el algoritmo canónico de `bun run engine:verify` (**480 ficheros**): **`8c2d51040608405aace27260822df952bc526bf9699a2cd197b67f7048fb4d79`**.
- `bun run engine:verify` en verde contra el manifiesto nuevo.
- `diff -rq` de los tres árboles `src` contra el tarball de `1cd03ab`: sin diferencias.
- Sin toolchain de Rust en este sandbox; la compilación la validan los trabajos **Native parity**, **WASM build** y **Phase source regressions** de CI sobre este commit.
