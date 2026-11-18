# Phase: importación aislada de fuentes Rust — 15 nov 2026 (v0.126.0, 61 commits)

- Pin antiguo: `74fc941c2ddddc95f52c24cf8dab315ecb75ef94` (v0.124.0).
- Pin nuevo: `c07324a50f93c81fdca4fa3ab911bf926d009412` (**61 commits posteriores**, con **dos** releases: **v0.125.0** en `43b98c1c` y **v0.126.0** en `05e12c5b`).
- Comparación: https://github.com/phase-rs/phase/compare/74fc941c2ddddc95f52c24cf8dab315ecb75ef94...c07324a50f93c81fdca4fa3ab911bf926d009412
- Reimportados `crates/engine/src`, `crates/phase-ast/src`, `crates/phase-parser/src`, `crates/phase-ast/data` y las pruebas conservadas de `crates/engine/tests` desde el tarball del commit nuevo.

## Qué cambia de tamaño

| Árbol | Ficheros antes | Ficheros ahora | Ficheros con cambios | Altas upstream |
| --- | --- | --- | --- | --- |
| `crates/phase-engine/src` | 480 | 483 | 206 | 3 |
| `crates/phase-ast/src` | 34 | 34 | 11 | 0 |
| `crates/phase-parser/src` | 392 | 394 | 57 | 2 |
| `crates/phase-ast/data` | 5 | 5 | 4 | 0 |
| `crates/phase-engine/tests` (conservadas) | 2317 | 2317 | 204 | poda propia |

Las tres altas del motor son `database/name_copy_gate.rs`,
`game/effects/attach_protection_rider_tests.rs` y
`game/effects/create_card_copy_by_name.rs`; las dos del parser,
`parser/oracle_effect/subject_actor_tests.rs` y
`parser/oracle_ir/history_provenance.rs`. **No hay bajas upstream en ningún árbol** y
**no se podó nada nuevo en local**.

En las pruebas se mantiene la política de siempre: se copian las 2317 que Mesa ya
conservaba (204 con cambios) y se dejan fuera las **78** upstream que Mesa nunca
importó, más las **82** nuevas de este rango (2395 → 2477 upstream). `diff -rq` de las
cinco rutas contra el tarball no muestra ninguna diferencia más que esa poda.

## Versión del workspace

Upstream pasó a `version.workspace = true` en las tres crates, así que sus
`Cargo.toml` importados **no** pueden copiarse tal cual: el `Cargo.toml` de la raíz de
este repositorio es el de Mesa, no el del workspace de Phase. Se mantiene la versión
literal (`0.124.0` → **`0.126.0`**) y `Cargo.lock` cambia solo las tres líneas de
versión de los crates importados, igual que en las importaciones anteriores al pasar
de release. Ninguna dependencia externa cambia: `flate2` ya estaba en el lock local.

## Qué cambia en el contrato de vistas

`WaitingFor` sigue con **148 variantes**: dentro del rango no hay altas ni bajas (las
releases traen arreglos de reglas y de parser, no ventanas nuevas). Los bloques de
campo de las **61** variantes que Mesa representa se compararon bloque a bloque, y dos
cambian —los dos de forma **aditiva y con valor por defecto**, así que nada que ya se
veía cambia de forma:

- `RevealChoice` gana `cardinality` (CR 608.2d / CR 107.1c) y `pending_mana_ability`
  (CR 605.3b, el caso Metalworker: `94a50bd`). `cardinality` ausente es
  `Exactly { count: 1 }` —la elección de una sola carta de siempre— y `AnyNumber`
  admite cualquier subconjunto de las cartas ofrecidas, **incluido el vacío**.
- `UnlessPayment` gana `repeat` (CR 702.24a): cuántas veces se cobra **la misma**
  instrucción impresa en un mantenimiento acumulativo compacto (el número de contadores
  de edad). Ausente es «una vez».

El resto de bloques representados no cambia, y `types/game_state.rs` sigue sirviendo
los mismos nombres de campo que el parser de vistas ya lee.

### Adaptación en `RevealPrompt` (rescate, no funcionalidad nueva)

La elección de una carta no podía expresar `AnyNumber`: habría dejado la ventana
mintiendo sobre un motor que acepta un subconjunto. Ahora el prompt publica
`cardinality` normalizada (`{ kind: 'exactly', count }` o `{ kind: 'any' }`), la sesión
mantiene el conjunto marcado —con el mismo tacto que antes cuando es una sola carta:
marcar otra reemplaza, no suma— y `revealCardsAction(cards)` manda el conjunto entero.
Con `AnyNumber` el botón principal nace habilitado como «Revelar ninguna», que es una
respuesta legal (CR 107.1c), no una ausencia de respuesta.

### Adaptación en `UnlessPrompt` (rescate, no funcionalidad nueva)

`repeat` se muestra como sufijo del coste —«Paga {1} × 3»— porque el coste no es 3
veces «{1}» sino la instrucción impresa repetida, y una línea explica que la cifra es
el número de contadores de edad. Un `repeat` de 1 o 0 no se pinta: es el valor por
defecto.

## Lo que trae el rango (selección)

61 commits, con dos releases. Los que tocan contrato de vistas son los dos de arriba.
Entre los arreglos de reglas destacan: Metalworker y «reveal any number» de una
habilidad de maná (`94a50bd`), la guardia que solo se aplica a hechizos y habilidades
de un oponente (`e05900b`), Brawl sin pérdida por daño de comandante (CR 903.12h,
`1015cfd`), copias de token que conservan su reemplazo de entrada solo si lo mantienen
(`ee32125`), disparos de entrada de token que se aparcan cuando una respuesta de
reemplazo vuelve a suspender (`5aca42a`), y el rival elegido como coste de una ganancia
de vida en multijugador (`d940fe3`). En parser: conteos de la condición «controlador del
objetivo» (`371b1ee`), elección de criatura al resolver cuando no hay objetivo impreso
(`f31e0d6`), revelar-hasta en pasiva con contador > 1 (`75a9df6`) y emblem estáticos
desde la zona de mando (`834d4c0`). No hay cambios en el cliente React que se importe:
`crates/mtg-engine-wasm` sigue siendo el puente propio de Mesa y las funciones que usa
(`start_game_with_starting_player`, `apply_with_rejection`, `filter_state_for_viewer`,
`derive_filtered_views`) siguen existiendo.

## Verificación

- SHA-256 agregado de `phase-engine/src` con el algoritmo canónico de `bun run engine:verify` (**483 ficheros**): **`c963ea30bce87a9798a519fe99fc4ca06a66eafce4a2b8360a3b3a0348cc0e1f`**.
- `bun run engine:verify` en verde contra el manifiesto nuevo (`docs/PHASE-UPSTREAM-PIN.json`: `commit`, `version` y `sourceSha256`).
- `diff -rq` de los tres árboles `src`, de `phase-ast/data` y de las pruebas conservadas contra el tarball de `c07324a5`: sin diferencias más allá de la poda declarada.
- Sin toolchain de Rust en este sandbox; la compilación la validan los trabajos **Native parity**, **WASM build** y **Phase source regressions** de CI sobre este commit.
