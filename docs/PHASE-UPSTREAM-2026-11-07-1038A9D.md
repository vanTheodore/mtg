# Phase: importación aislada de fuentes Rust — 7 nov 2026 (cierre de v0.120.0)

- Pin antiguo: `f67169218fa9f5dec439b9024906b891a926210e`.
- Pin nuevo: `1038a9d0b83be789ed7a9d0ba434f41e4a1912a5` (**7 commits posteriores**, release **v0.120.0**).
- Comparación: https://github.com/phase-rs/phase/compare/f67169218fa9f5dec439b9024906b891a926210e...1038a9d0b83be789ed7a9d0ba434f41e4a1912a5
- Importados únicamente `crates/engine/src` → `crates/phase-engine/src`, `crates/phase-ast/src` → `crates/phase-ast/src` y `crates/phase-parser/src` → `crates/phase-parser/src`, copiados con `cp -a` desde el tarball de `codeload.github.com` del commit nuevo. `diff -rq` contra el tarball da **idénticos** en los tres árboles; no se incorpora el cliente React, servidor, bots de draft, `engine-wasm` upstream ni assets propietarios.

## Qué cambia de tamaño

| Árbol | Ficheros antes | Ficheros ahora | Reescribidos | Nuevos | Borrados |
| --- | --- | --- | --- | --- | --- |
| `crates/phase-engine/src` | 468 | 480 | 52 | 12 | 0 |
| `crates/phase-ast/src` | 33 | 33 | 4 | 0 | 0 |
| `crates/phase-parser/src` | 392 | 392 | 9 | 0 | 0 |

Los 12 ficheros nuevos del motor son el modo cooperativo *Horde*: `game/horde.rs`, `game/boss.rs`, `game/effects/horde_play_card.rs` y los nueve mazos de desafío de `game/decks/` (zombies, slivers, sauron, saruman, godzilla, cyberman, dnd, turtle, …). Ninguno lee ficheros de datos externos al árbol `src`.

Comparado con el pin anterior, el motor suma **6 872 líneas y resta 567** (incluye pruebas internas del propio upstream). Los bloques más grandes están en `types/format.rs` (+1 797), `game/deck_validation.rs` (+647), `types/game_state.rs` (+610), `game/topology.rs` (+586, con 80 borradas) y `game/deck_loading.rs` (+540).

## Los 7 commits

| Commit | Asunto | Efecto en la mesa |
| --- | --- | --- |
| `1732f6a8` | Fix Reviving Vapors – selected card not put in hand / no life gain (#10686) | Carta concreta: la carta seleccionada vuelve a la mano y se gana la vida. |
| `0aaa2d61` | perf(engine): read a drain loop's life crossing one stretch at a time (#10707) | Rendimiento del *drain loop*: lee el cruce de vida de un tramo cada vez. Cambia el coste, no la legalidad. |
| `973845c5` | Horde: full Horde Magic co-op mode (#10409) | Modo casual nuevo (jefe sin total de vida, oleadas, asientos de horda, mazo de jefe, eventos de héroe). Aditivo para el 1v1 limitado. |
| `bf7577f3` | chore: refresh metagame feeds | Datos de metajuego upstream; no entra en Mesa. |
| `988bc341` | release: v0.120.0 | Bump de versión del workspace. |
| `bcf52076` | fix(engine,parser): read revealed library members live; keep reveal sets out of bare pronouns (#10556) | Los miembros revelados de una biblioteca se leen en vivo y los conjuntos de revelación ya no se enganchan a pronombres sueltos. |
| `1038a9d0` | chore(card-data): refresh MTGJSON token & subtype catalogs (#10698) | Catálogos de tokens y subtipos; afecta al parser, no al cliente. |

Lo que puede notarse en una partida estándar, en orden de impacto: **`bcf52076`** (revelaciones de biblioteca que antes se quedaban congeladas y pronombres mal atados) y **`1732f6a8`** (Reviving Vapors). El resto es Horde, rendimiento y datos.

## Verificación

- SHA-256 agregado de `phase-engine/src` con el algoritmo canónico de `bun run engine:verify` (**480 ficheros**, rutas ordenadas, por fichero `ruta\0sha256(contenido)` concatenado): **`5e349ca3f95dd2cad6e4ae57adb38de6abeab0cc141ef93bcc40c3ef8f44658e`**.
- Antes de copiar se calculó ese mismo digest sobre el árbol descargado del tarball de `1038a9d0` y dio el mismo valor; después de copiar, sobre `crates/phase-engine/src`, también. El pin anterior (`f07d2524…`) se reprodujo igual con el mismo script, así que el algoritmo no cambió.
- `bun run engine:verify` en verde contra el manifiesto nuevo.
- **El digest cubre solo `phase-engine/src`.** Que `phase-ast` y `phase-parser` sean byte-idénticos se comprobó con `diff -rq` contra el tarball, no con un segundo hash.

## Adaptaciones locales deliberadas

- **Versión de los tres crates.** Upstream usa `version.workspace = true`; el fork de Mesa lleva la versión literal en cada `Cargo.toml`. Se suben las tres de `0.119.0` a `0.120.0` para que el manifiesto no mienta respecto al pin, y con ellas las tres entradas correspondientes de `Cargo.lock` (`phase-engine`, `phase-ast`, `phase-parser`). Es el único cambio del lock y lo haría `cargo` solo: sin él, `cargo metadata --locked` fallaría por incoherencia entre manifiesto y lock. No hay dependencias nuevas ni cambios en `[workspace.dependencies]`.
- **ABI del puente.** `crates/mtg-engine-wasm` mantiene `PROTOCOL_VERSION = 2`. El protocolo de Phase es otro contador (su `full` va por 159 y esta release registra un cambio para las superficies `full`, `lobby` y `wire` por las formas nuevas de Horde); el ABI JSON de Mesa es propio y esta importación no elimina ni renombra ningún campo que el cliente lea (`apply_with_rejection`, `filter_state_for_viewer`, `derive_filtered_views`, `start_game_with_starting_player` y los tipos de `GameAction` conservan firma). Lo nuevo es aditivo: variantes de `WaitingFor`, `boss_deck` y banderas de Horde.
- **Redacción de cartas ocultas.** `visibility.rs` ahora también borra `is_token`, `is_horde_deck_token` y `horde_library_rarity` de una carta oculta (CR 400.2). Afecta a cualquier formato: una carta boca abajo ya no revela si es ficha a través del snapshot. El cliente Svelte no mostraba esas banderas en cartas ocultas, así que no hay cambio de UI.

## Lo que NO se toca y quién lo verifica

- `crates/mtg-engine-wasm` (puente ABI C/JSON propio) y la toolchain `nightly-2025-03-02` de CI.
- Los `tests/` vendorizados de `phase-engine`: siguen siendo los del pin anterior. El workflow *Phase source regressions* compila una selección de ellos contra las fuentes nuevas y es quien tiene que decir si siguen siendo válidos; si alguno deja de compilar por un cambio de API interna, se actualizará ese archivo desde este mismo pin en otro commit del PR, no se parchea la prueba para que pase.
- El binario `static/wasm/mtg_engine_wasm.wasm`: lo produce CI desde estas fuentes (`WASM build (pinned Rust and lockfile)`) y no se commitea.

**Pendiente de CI, no verificado aquí** (este entorno no tiene `cargo`, `rustc` ni `rustup`): `cargo metadata --locked`, compilación nativa y WASM, `engine:parity`, `engine:scenarios`, la selección de regresiones Rust y la suite Chromium. Tampoco se jugó una partida real con el WASM nuevo. La importación no implica equivalencia ni compatibilidad plena con todas las cartas.

## Cliente upstream

De los 43 ficheros de `client/src` que cambian, casi todos son Horde: `HordeRulesPopover.tsx`, `challengeDeckRegistry.ts`, `useHordeDeckMeta.ts`, ajustes en `OpponentSeatHeader`, `LifeTotal`, `HudBadges`, `CardChoiceModal` (evento de héroe), `waitingForRegistry.ts` y las traducciones. **No se porta nada de eso**: Horde es un modo casual que Mesa no expone, y añadirlo sería una función nueva, no una actualización de motor. `components/stack/StackTargetArcs.tsx` —la geometría de arcos usada en `src/lib/ui/arc.ts`— **no cambió**, así que la atribución de [`PHASE-UX-PORT.md`](PHASE-UX-PORT.md) sigue siendo válida.
