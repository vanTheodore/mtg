# Phase: importación aislada de fuentes Rust — 18 nov 2026 (v0.128.0, 38 commits)

- Pin antiguo: `28b2f9e47d257c1ca73f911f0262a620e0358779` (v0.127.0).
- Pin nuevo: `576e2bf5031e7e23fd3024df86368671b6266f63` (**38 commits posteriores**, con **un** release: **v0.128.0** en `df82eb95`).
- Comparación: https://github.com/phase-rs/phase/compare/28b2f9e47d257c1ca73f911f0262a620e0358779...576e2bf5031e7e23fd3024df86368671b6266f63
- Reimportados `crates/engine/src` (local: `crates/phase-engine/src`), `crates/phase-ast/src`, `crates/phase-parser/src`, `crates/phase-ast/data` y las pruebas conservadas de `crates/engine/tests` desde el tarball del commit nuevo.
- Digest de `crates/phase-engine/src` tras la importación: `c3c1548110f8bb794ebb1baf8e613f68fad1f01e482aa44cfb1adc31393e1f42` (`bun run engine:verify` → `ok: true`).

## Qué cambia de tamaño

| Árbol | Ficheros antes | Ficheros ahora | Ficheros con cambios | Altas upstream | Bajas upstream |
| --- | --- | --- | --- | --- | --- |
| `crates/phase-engine/src` | 497 | 497 | 130 (+1 adaptación) | 1 | 1 |
| `crates/phase-ast/src` | 34 | 34 | 5 | 0 | 0 |
| `crates/phase-parser/src` | 396 | 396 | 31 | 0 | 0 |
| `crates/phase-ast/data` | 5 | 5 | 3 | 0 | 0 |
| `crates/phase-engine/tests` (conservadas) | 2317 | 2317 | 94 | poda propia | poda propia |

La única alta del motor es `game/pre_entry_view.rs`. La única baja es
`ai_support/shortcut_efficacy.rs` (−4047 líneas), el primer fichero que upstream borra en un rango
que Mesa importa y el único que hasta ahora existía en local sin existir upstream por una razón
distinta de la poda histórica. En las pruebas se mantiene la política de siempre: se copian las 2317
que Mesa ya conservaba (94 con cambios) y se dejan fuera las upstream que Mesa nunca importó.

**El árbol queda byte-idéntico al tarball** salvo `types/format.rs`, cuya adaptación se declara más
abajo. `diff -rq` de los cuatro pares no muestra ninguna otra diferencia.

## Contrato: `LoopShortcut` pierde `road`

Un solo cambio de forma en las 148 `WaitingFor`:

```rust
// antes (v0.127.0)
        /// The producer that minted this offer; `game::engine`'s route authority reads it.
        road: crate::analysis::loop_check::OfferRoad,
// ahora (v0.128.0)
        // el campo ya no existe
```

`OfferRoad` (`Ring` | `RecordedPeriod`) era la etiqueta del productor que acuñó la oferta:
`period_confirm` la escribía y `game::engine` la leía para elegir la ruta de replay. El commit
`6b6d5006` («offer loop shortcuts with the exact count their recorded period measures», #10810)
elimina la política de eficacia que separaba ambas rutas y, con ella, el campo y el tipo. No queda
ninguna decisión de jugador que lo consulte.

`RespondToShortcut`, `PrecastCopyShortcutOffer` y `RespondToPrecastCopyShortcut` **no cambian**.
Tampoco cambia el recuento de variantes: la suite confirma que siguen siendo **148**.

**Ninguna ventana publicada se rompe.** `LoopShortcut`, `RespondToShortcut` y
`PrecastCopyShortcut*` no están portadas en `DecisionPanel.svelte` ni en `interaction.ts` (cero
coincidencias), así que el borrado del campo no toca ningún panel, ningún botón ni ninguna de las 93
variantes representadas. Al leer, quitar un campo es compatible: `serde` ignora los desconocidos al
no haber `deny_unknown_fields`.

## Datos que el motor compila dentro (`include_str!`)

Segundo hallazgo de build en frío, de la misma familia que el del pin anterior y **también previo a
este rango**: `crates/phase-engine/src/types/format.rs` compila dentro dos ficheros TypeScript del
cliente React upstream, en las aserciones `client_builtin_game_format_union_matches_the_engine` y
`client_format_registry_matches_the_engine`:

- `../../../../client/src/adapter/types.ts`
- `../../../../client/src/data/formatRegistry.ts`

Mesa no importa `client/`, así que esas rutas no resuelven y `cargo test` no compilaría. Las dos
copias viven ahora en `crates/phase-engine/client-mirror/` y las tres llamadas de `format.rs` apuntan
allí:

| Copia local | Origen upstream | Bytes | MD5 |
| --- | --- | --- | --- |
| `crates/phase-engine/client-mirror/types.ts` | `client/src/adapter/types.ts` | 290 356 | `67bf19d44e46c9d8c1f6806f55237fdb` |
| `crates/phase-engine/client-mirror/formatRegistry.ts` | `client/src/data/formatRegistry.ts` | 27 768 | `ac92420aa085629bbde1d5862e87e800` |

Son los bytes del **commit fijado**, no del tag: `client/src/adapter/types.ts` del tag `v0.128.0` es
`f794d1b865880fea3ab0a2d968ca0e5d`, distinto del de `576e2bf`, porque `main` siguió moviéndose
después del release. Se copian del tarball del pin y se anotan aquí para que la próxima importación
pueda comprobar que no derivan.

Sólo las usa `#[test]`: el build del motor (WASM y binarios) no necesita el directorio, pero
`cargo test` sí o no compila. Nada de esto se sirve al cliente ni entra en el bundle de Mesa.

No se importan los demás datos de upstream que sólo leen sus binarios en tiempo de ejecución
(`data/baselines/`, `data/bundled_cedh_decks.json`, `data/learned-weights.json`, `data/overrides/`).

## Versión del workspace

Upstream sigue con `version.workspace = true`, así que los `Cargo.toml` importados no pueden
copiarse tal cual: se mantiene la versión literal (`0.127.0` → **`0.128.0`**) y `Cargo.lock` cambia
solo las tres líneas de versión de los crates importados. Ninguna dependencia externa ni feature
cambia: `diff` de las secciones `[dependencies]` y `[features]` de `phase-engine` contra el tarball
no da diferencias.

## Registro de módulos de prueba

Los cinco ficheros raíz de la suite (`integration/main.rs` y `shard_2` a `shard_5`) se sincronizan
con upstream, pero **no** sus 218 `mod` nuevos: son las pruebas que Mesa nunca importó, y un
`mod x;` sin `x.rs` no compila. Se quitan las 221 entradas cuyos ficheros no existen en local (las
218 de este rango más tres históricas: `source_census`, `census_release_batch_1` y
`census_release_batch_2`) y se dejan las 2210 que sí. El resultado difiere de upstream exactamente en
esas líneas `mod`, nada más — verificado con `diff` filtrado: cero líneas de diferencia que no sean
un `mod`.

`tests/integration/shorten_efficacy.rs` se conserva aunque su módulo se haya ido: no importa
`shortcut_efficacy` en ninguna parte (sólo lo cita en comentarios) y compila contra el contrato
nuevo. Se mantiene como prueba de la ruta de acortado, que sigue existiendo.

## Qué NO se verificó aquí

**Este entorno no tiene toolchain de Rust** (`cargo` y `rustup` ausentes; `sh.rustup.rs` y
`static.rust-lang.org` responden con `SSL_ERROR_SYSCALL`). Por tanto **no se compiló** el motor, no
se ejecutó `cargo test`, ni `cargo metadata --locked`, ni `engine:parity`, ni `engine:scenarios`. Lo
que sí se hizo, estáticamente:

- Cero referencias vivas a `shortcut_efficacy` y a `OfferRoad` fuera de los comentarios de
  `shorten_efficacy.rs`; `ai_support/mod.rs` ya no declara el módulo borrado.
- Los 315 usos de `WaitingFor::LoopShortcut {` en las pruebas conservadas son patrones con `..`, no
  literales: ninguno construye el bloque, así que el campo ausente no rompe ninguno. Los dos
  literales completos que quedan en el árbol llevan `road` y vienen ya sincronizados de upstream
  (`committed_dump_walk.rs` e `interaction_contract.rs` los usan como patrón, no como construcción).
- Todos los símbolos que importa el puente `crates/mtg-engine-wasm` (`apply_with_rejection`,
  `start_game_with_starting_player`, `filter_state_for_viewer`, `load_and_hydrate_decks`,
  `resolve_deck_list`, `analyze_coverage`, `derive_filtered_views`, `ComboTable`, `MulliganChoice`,
  `FormatConfig`, `turn_control`) siguen existiendo, y `resolve_deck_list` conserva su firma.
- Todas las rutas `include_str!` de los tres árboles resuelven a un fichero existente.

La compilación la valida CI (`wasm` compila el motor y el puente; `native-integration` ejecuta
paridad y escenarios). Este informe **no** afirma que se verificara en local.

## Cómo se comprobó la procedencia

`bun run engine:verify` recorre `crates/phase-engine/src`, ordena las rutas y hashea
`ruta \0 sha256(fichero)`; el esperado vive sólo en `docs/PHASE-UPSTREAM-PIN.json`. El digest del
tarball crudo es `ef0d615488249d60acdd2944dee6f41fa13b1a511403041979ad9f499b0d3aa8` y el local
`c3c1548110f8bb794ebb1baf8e613f68fad1f01e482aa44cfb1adc31393e1f42`: la diferencia es exactamente
`types/format.rs`, la adaptación declarada arriba. Si esa huella cambia en el futuro sin un pin nuevo,
`engine:verify` falla.
