# Phase: importación aislada de fuentes Rust — 16 nov 2026 (v0.127.0, 33 commits)

- Pin antiguo: `c07324a50f93c81fdca4fa3ab911bf926d009412` (v0.126.0).
- Pin nuevo: `28b2f9e47d257c1ca73f911f0262a620e0358779` (**33 commits posteriores**, con **un** release: **v0.127.0** en `6ab7430a`).
- Comparación: https://github.com/phase-rs/phase/compare/c07324a50f93c81fdca4fa3ab911bf926d009412...28b2f9e47d257c1ca73f911f0262a620e0358779
- Reimportados `crates/engine/src` (local: `crates/phase-engine/src`), `crates/phase-ast/src`, `crates/phase-parser/src`, `crates/phase-ast/data` y las pruebas conservadas de `crates/engine/tests` desde el tarball del commit nuevo.

## Qué cambia de tamaño

| Árbol | Ficheros antes | Ficheros ahora | Ficheros con cambios | Altas upstream |
| --- | --- | --- | --- | --- |
| `crates/phase-engine/src` | 483 | 497 | 129 | 14 |
| `crates/phase-ast/src` | 34 | 34 | 7 | 0 |
| `crates/phase-parser/src` | 394 | 396 | 45 | 2 |
| `crates/phase-ast/data` | 5 | 5 | 2 | 0 |
| `crates/phase-engine/tests` (conservadas) | 2317 | 2317 | 161 | poda propia |

Las catorce altas del motor son `ai_deck_manifest.rs`, `ai_support/payment_surplus.rs`,
`analysis/deck_signals/` (cinco ficheros: `mod.rs`, `ability_chain.rs`, `control.rs`,
`free_interaction.rs`, `mana_ramp.rs`), `bin/bracket_baseline.rs`, `bin/combo_audit.rs`,
`database/card_data_provenance.rs`, `database/combo_table.rs`, `game/bracket_corpus.rs`,
`game/bracket_explanation.rs` y `game/effects/scoped_discard.rs`; las dos del parser son
instantáneas de `essence_burn`. **No hay bajas upstream en ningún árbol** y **no se podó nada
nuevo en local**.

En las pruebas se mantiene la política de siempre: se copian las 2317 que Mesa ya conservaba
(161 con cambios) y se dejan fuera las **78** upstream que Mesa nunca importó, más las nuevas de
este rango (2549 upstream). `diff -rq` de las cinco rutas contra el tarball no muestra ninguna
diferencia más que esa poda.

## Versión del workspace

Upstream sigue con `version.workspace = true`, así que los `Cargo.toml` importados no pueden
copiarse tal cual: se mantiene la versión literal (`0.126.0` → **`0.127.0`**) y `Cargo.lock` cambia
solo las tres líneas de versión de los crates importados. Ninguna dependencia externa cambia.

## Qué cambia en el contrato de vistas

`WaitingFor` sigue con **148 variantes**: no hay altas ni bajas en el rango. De las **69** que
Mesa representa, **tres** cambian de forma, y las tres lo hacen de forma **aditiva y con valor por
defecto**, así que nada que ya se veía cambia de forma:

- `UntapChoice` gana `progress: UntapStepProgress` (CR 502.1 + CR 502.2), y
- `ChooseUntapSubset` gana el mismo `progress`.
- `NamedChoice` gana `decision_subject_id: Option<ObjectId>` (CR 608.2c + CR 608.2d).

El resto de bloques representados no cambia.

### `UntapStepProgress`: se serializa siempre, y por eso su ausencia es un dato

`UntapStepProgress` no lleva `skip_serializing_if`: **todo** escritor de este motor lo emite. Su
ausencia en la red es, por tanto, un hecho sobre el escritor —una compilación que ofrecía la
determinación **antes** del faseo (CR 502.1) y de la comprobación de día/noche (CR 502.2)— y es
también el valor por defecto de serde en el motor. Los dos valores posibles son
`BeforeTurnBasedActions` (la respuesta reinicia el paso desde su primera acción) y
`AfterTurnBasedActions` (la respuesta reanuda en el enderezar).

### `decision_subject_id`: llega, pero su vista todavía no existe

`NamedChoice` **no** está en `REPRESENTED` (es una de las que quedan), así que el campo no se pinta
todavía. Queda anotado aquí: cuando se aborde esa ventana, la instrucción repetida una vez por
miembro de una población («por cada uno de esos permanentes, elige un oponente distinto») publica
el permanente al que corresponde la respuesta, y eso es exactamente lo que el bloque tendrá que
enseñar —la autoridad de grabación sigue siendo del titular, y `source` no cambia—.

### Adaptación en `UntapPrompt` / `UntapSubsetPrompt` (rescate, no funcionalidad nueva)

La pasada 52 representó las dos ventanas de enderezar sin `progress`, y desde este pin el campo
llega en **todas** las respuestas. El prompt lo normaliza a
`after-turn-based-actions` / `before-turn-based-actions`, con la ausencia leída como el valor por
defecto del motor (`before`), y el bloque sólo dice algo cuando el paso viene de una partida
guardada por una versión anterior: ahí una línea explica que el motor reanuda desde su primera
acción (faseo y día/noche) antes de enderezar. No hay tercer estado que el jugador pueda elegir:
la decisión (enderezar o no, y qué subconjunto) es la misma de la pasada 52.

## Lo que trae el rango (selección)

33 commits, con un release. Los que más pesan:

- **Estimador de bracket de Commander** (`d9a90d82`): `bracket_corpus`, `bracket_explanation`,
  `bin/bracket_baseline`, `combo_table` y `analysis/deck_signals/`. Es la mayor parte de las altas
  de este rango y no toca ninguna ventana de `WaitingFor`.
- **Costes alternativos de los Defiler** (`0285d337`): ofrecer los costes pagables con la
  reducción del Defiler (Spectacle, Emerge, Prowl, Oracle…). Toca `casting_costs` y llegará al
  port por `DefilerPayment`, que sigue en la lista de pendientes.
- **Prioridad entre los pasos de daño de primer golpe y normal** (`def519d7`, CR 510.3 + CR 510.4).
- **Maná sobrante certificado** en la IA (`8567a29b`, `ai_support/payment_surplus.rs`): no
  activar habilidades de maná cuyo coste el pago ya no necesita.
- **Reemplazos del ciclo Words** (`51b7fe41`), disparos de «se convierte en bloqueada por N o más
  criaturas» (`31bbb8ba`, CR 509.3e), criaturas que pelearon este turno (`a87272f2`, Boxing Ring),
  daño reemplazado por contadores (`ed6fd9ae`), `GameEvent::Attached` y prohibición estática de
  objetivo sobre encantadas (`d95d3712`), Triton Tactics (`bde5972d`) y Essence Burn
  (`139041f5` + su parser en `28b2f9e4`).
- **Parser**: «asigna ningún daño de combate» separado de una conjunción con «and» (`b3a08254`),
  Mass Manipulation y el conteo exacto de objetivos para X (`89c60c08`), y el pronombre «it» atado
  a un sujeto explícito en objetivos de daño (`28b2f9e4`, Steadfast Armasaur).

No hay cambios en el puente propio `crates/mtg-engine-wasm`: las funciones que usa
(`start_game_with_starting_player`, `apply_with_rejection`, `filter_state_for_viewer`,
`derive_filtered_views`) siguen existiendo.

## Verificación

- SHA-256 agregado de `phase-engine/src` con el algoritmo canónico de `bun run engine:verify`
  (**497 ficheros**): **`f8daa35ecbcdcf35d911f1bb74709c4a85b179d96b2e5ad1abc2bd814edbb58b`**.
- `bun run engine:verify` en verde contra el manifiesto nuevo (`docs/PHASE-UPSTREAM-PIN.json`:
  `commit`, `version` y `sourceSha256`).
- `diff -rq` de los tres árboles `src`, de `phase-ast/data` y de las pruebas conservadas contra el
  tarball de `28b2f9e4`: sin diferencias más allá de la poda declarada.
- Sin toolchain de Rust en este sandbox; la compilación la validan los trabajos **Native parity**,
  **WASM build** y **Phase source regressions** de CI sobre este commit.
