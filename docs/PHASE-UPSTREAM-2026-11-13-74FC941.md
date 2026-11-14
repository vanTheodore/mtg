# Phase: importación aislada de fuentes Rust — 13 nov 2026 (sin release, 4 commits)

- Pin antiguo: `1cd03ab59083665b5cc5ed9f2b161c68808d8a71` (v0.124.0).
- Pin nuevo: `74fc941c2ddddc95f52c24cf8dab315ecb75ef94` (**4 commits posteriores**, **sin** release: el workspace sigue en `0.124.0`, así que no cambia ninguna línea de versión ni `Cargo.lock`).
- Comparación: https://github.com/phase-rs/phase/compare/1cd03ab59083665b5cc5ed9f2b161c68808d8a71...74fc941c2ddddc95f52c24cf8dab315ecb75ef94
- Reimportados `crates/engine/src`, `crates/phase-ast/src` y `crates/phase-parser/src` desde el tarball del commit nuevo. `diff -rq` contra el tarball: **sin diferencias en los tres**.

## Los 4 commits

| Commit | Asunto | Efecto en la mesa |
| --- | --- | --- |
| `746025b4` | fix(scripts): diff gates refuse an unresolvable base ref (#10821) | Scripts del repositorio: no se importa. |
| `a78f18f4` | docs(review): add address-review skill and a closing condition on each PR finding (#10823) | Documentación: no se importa. |
| `df85557e` | fix(parser): unmodeled ward costs fail closed instead of a free ward (#10831) | **Parser**: `parser/oracle_keyword.rs`. |
| `74fc941c` | fix(engine): phased-out attachments don't satisfy attachment predicates (#10836) | **Motor**: `game/filter.rs`, `game/effects/attach.rs`, `game/zones.rs`. |

## Qué cambia de tamaño

| Árbol | Ficheros antes | Ficheros ahora | Ficheros con cambios |
| --- | --- | --- | --- |
| `crates/phase-engine/src` | 480 | 480 | 3 |
| `crates/phase-ast/src` | 34 | 34 | 0 |
| `crates/phase-parser/src` | 392 | 392 | 1 |

No hay altas ni bajas de fichero. En las pruebas conservadas cambian **2** ficheros (`integration/serpent_society_ward_poison_cost.rs`, `integration/shard_4.rs`) y en datos **1** (`phase-ast/data/confirmed-misparses.toml`); la poda de ficheros upstream que Mesa no usa se mantiene (por ejemplo, `tests/fixtures/who_horde_cards.json` y las integraciones nuevas siguen fuera).

## Qué significan los dos arreglos de motor/parser

**Guardia sin modelo ya no es gratis** (parser, CR 702.21a): un coste de guardia que el parser no sabía modelar dejaba la guardia pagable sin coste; ahora falla cerrado. No hay cambio de contrato para la mesa: `WardSacrificeChoice` y `WardDiscardChoice` se ven igual, y la vista de la guardia ya pide el permanente en vez de decidir si se paga.

**Los anexos fuera de fase no cuentan como «anexado»** (motor, CR 702.26b): `EnchantedBy`, `EquippedBy`, la protección al empezar y la foto de anexos de `capture_attachment_snapshot` pasan por el nuevo `phased_in_attachments`. Afecta a reglas, no a la forma de `WaitingFor`, así que ninguna vista cambia; si acaso, la lista de candidatos de `EquipTarget` deja de incluir un permanente cuyo equipo está fuera de fase.

## Impacto en el port de vistas (#60)

`WaitingFor` sigue con **148 variantes**: no hay altas ni bajas, y los bloques de campos de las 40 variantes que Mesa ya representa no cambian (los 4 ficheros tocados no incluyen `types/game_state.rs`). El recuento del port no se mueve por esta importación.

## Verificación

- SHA-256 agregado de `phase-engine/src` con el algoritmo canónico de `bun run engine:verify` (**480 ficheros**): **`f532dea28256844c5f4d43228ee9538bc778ecc7dcd8f55577287a9e80482b2e`**.
- `bun run engine:verify` en verde contra el manifiesto nuevo.
- `diff -rq` de los tres árboles `src` contra el tarball de `74fc941c`: sin diferencias.
- Sin toolchain de Rust en este sandbox; la compilación la validan los trabajos **Native parity**, **WASM build** y **Phase source regressions** de CI sobre este commit.
