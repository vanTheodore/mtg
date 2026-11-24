# Phase: importación aislada de fuentes Rust — 23 nov 2026 (v0.131.0, 26 commits)

- Pin anterior: `d01766e17e4d1d9ef9e2a351671ba1e3c160b283` (v0.130.0).
- Pin nuevo: `31123e2b555b81ff59eda6c502c5a362f53ece4b` (**26 commits posteriores**). Este pin
  **no tiene tag ni release**: la última publicada sigue siendo `v0.130.0`, aunque dentro del rango
  haya un commit `7cf47c6 release: v0.131.0` que sube la versión del workspace. Los tres `Cargo.toml`
  importados dicen `0.131.0` porque así lo dice el commit, **no** porque exista una release.
- Comparación: https://github.com/phase-rs/phase/compare/d01766e17e4d1d9ef9e2a351671ba1e3c160b283...31123e2b555b81ff59eda6c502c5a362f53ece4b
- Tarball: `codeload` del commit, 159 500 135 B, `sha256 2a54951a…0ee247`.
- Reimportados `crates/engine/src` (local: `crates/phase-engine/src`), `crates/phase-ast/src`,
  `crates/phase-parser/src`, `crates/phase-ast/data`, `crates/phase-engine/data` y las pruebas
  conservadas de `crates/engine/tests`.
- Digest de `crates/phase-engine/src` tras la importación:
  `66f5ae9aa1fdd867442b29fa0f2df37640aef43e4bf00d173c6c52ca7c82fc18` (`bun run engine:verify` →
  `ok: true`, 502 ficheros). Idéntico entre el tarball y la copia local.

## Qué cambia de tamaño

| Árbol | Ficheros antes | Ficheros ahora | Modificados | Altas | Bajas |
| --- | --- | --- | --- | --- | --- |
| `crates/phase-engine/src` | 499 | 502 | 83 | 3 | 0 |
| `crates/phase-ast/src` | 34 | 34 | 2 | 0 | 0 |
| `crates/phase-parser/src` | 396 | 400 | 35 | 4 | 0 |
| `crates/phase-ast/data` | 5 | 5 | 1 | 0 | 0 |
| `crates/phase-engine/data` | 2 | 3 | 0 | 1 | 0 |
| `crates/phase-engine/tests` | 2371 | 2398 | 17 | 28 | 1 |
| `crates/phase-engine/client-mirror` | 2 | 2 | 0 | 0 | 0 |

Las tres altas del motor son las que el briefing pedía auditar:

- `game/lethal_damage.rs` (485 líneas) — **módulo nuevo**, y la pieza central del rango. Es la
  autoridad única de «qué cuenta como daño letal» (CR 120.6 + CR 704.5g + CR 702.19b): la lectura
  que usan la acción de estado de daño letal, el mínimo de asignación en combate, el exceso de daño,
  el predictor de combate y la estimación de supervivencia de la IA. Existe para que esas cinco
  respuestas no puedan divergir. `combat_damage.rs` lo importa en seis puntos.
- `game/effects/simultaneous_unless.rs` (1138 líneas) — portador de `pending_simultaneous_unless`
  (CR 101.4: elegir todos, luego actuar; familia de Rottenmouth Viper).
- `database/integration_fixture.rs` — el lector del fixture partido (ver más abajo).

Las cuatro altas del parser son snapshots de `oracle_ir` (`spellpyre_phoenix_turn_history`,
`yidaro_cycle_history`).

## El fixture de integración cambia de forma: de un `.gz` a 28 shards

Esta es la parte del pin que **no es una copia de ficheros**, y por eso va primero.

Hasta `d01766e1` el fixture era un solo `tests/fixtures/integration_cards.json.gz` (5 016 206 B) que
el cargador abría y descomprimía. En este pin desaparece y en su lugar hay
`tests/fixtures/integration_cards/*.jsonl`: 28 shards (27 MB, uno por inicial más `_digits.jsonl` y
`_other.jsonl`), un registro `{key, card}` por línea, ordenados por clave. Upstream lo partió para
que dos PR que toquen cartas distintas no choquen en el mismo fichero.

Lo importado **no son fixtures incompatibles**: comprobé que la unión de los shards es un
superconjunto estricto del `.gz`.

| | Claves | |
| --- | --- | --- |
| `.gz` anterior | 8 417 | |
| Shards del pin | 8 468 | 51 claves nuevas, 0 perdidas |
| Cartas byte-idénticas | 8 401 | las 16 restantes cambian por texto Oracle |

Las 16 que cambian lo hacen por texto oficial de Alchemy (`Agent of Raffine` pasa de «It perpetually
gains prismatic» a la frase completa que ese recordatorio significa), no por estructura. No se
conservó el `.gz`: dejarlo habría dejado dos formas del mismo fixture y el lector nuevo habría
ignorado una en silencio.

### El `.gz` no podía borrarse sin más: tres consumidores rompían

Borrar el fichero deja sin base a todo lo que lo abría. Estos son los consumidores que **de verdad**
lo usaban, todos corregidos con el contenido del pin (los 17 ficheros tocados quedan byte-idénticos
al tarball):

| Fichero | Qué hacía | Por qué rompía |
| --- | --- | --- |
| `tests/integration/support.rs` | `fixture_path()` → `File::open(.gz)` + `from_compressed_export_cached` | En ejecución: `expect("fixture should open")` en todas las pruebas de integración |
| `tests/integration/exert_cost_bookkeeping.rs` | `include_bytes!("../fixtures/integration_cards.json.gz")` | En **compilación**: el fichero ya no existe |
| `tests/integration/dandan_custom_pile.rs` | `Path::join("tests/fixtures/integration_cards.json.gz")` | En ejecución |
| `tests/integration/the_fourteenth_doctor_graveyard_copy.rs` | idem | En ejecución |
| `tests/integration/committed_dump_walk.rs` | entrada de tabla `("…/integration_cards.json.gz", "RESTOREERR …")` | El pin elimina la entrada: era un dump con su error esperado |
| 12 ficheros más | comentarios y mensajes de `skip` que nombraban el `.gz` | Documentación apuntando a un fichero borrado |

El más grave era el `include_bytes!`: con los shards importados y el `.gz` fuera, ese módulo de
pruebas **no compilaba**, y el fallo aparecía antes de ejecutar nada.

Las dos APIs que el pin usa (`CardDatabase::from_integration_fixture_cached()` e
`integration_fixture::exists()`) ya estaban en el árbol, porque viven en la librería, que sí se
importa entera. `tests/integration/shorten_efficacy.rs` es el único fichero de pruebas propio de Mesa
que no está en el pin; no usa el fixture, así que no necesitó cambios.

### Prueba RED de esta parte

Añadí `src/lib/game/__tests__/engine-integration-fixture.test.ts`, que vigila la propiedad que haría
fallar el job «Phase source regressions»: que el directorio esté, que el `.gz` no vuelva, que cada
línea sea `{key, card}` en minúsculas, ordenada y sin claves repetidas, y que haya al menos las
8 417 cartas del fixture anterior.

```console
$ bun test src/lib/game/__tests__/engine-integration-fixture.test.ts
(pass) el fixture es un directorio de shards y el .gz monolítico ya no está
(pass) cada shard es JSON Lines válido, ordenado por clave y sin claves repetidas
 2 pass · 0 fail · 8 expect() calls
```

RED, rompiendo `b.jsonl` a propósito:

```console
$ echo '{"key":"aaa roto","card":{}}' >> crates/phase-engine/tests/fixtures/integration_cards/b.jsonl
+   "b.jsonl:505: orden roto (butcher ghoul > aaa roto)",
(fail) cada shard es JSON Lines válido, ordenado por clave y sin claves repetidas
```

Primer intento del RED, fallido y por eso anotado: con la clave `zzz roto` la prueba **pasaba**,
porque `b` < `zzz` mantiene el orden. La prueba no estaba floja; mi caso de prueba sí. Restaurado el
shard byte-idéntico y vuelto a verde.

## Contrato: mismos enums, campos y atributos serde

`GameAction` y `WaitingFor` **no cambian de número** en este rango: 142 = 142 y 149 = 149, altas y
bajas vacías en los dos.

Un recuento de variantes no demuestra que los payloads sean iguales, así que la comparación se hizo
**estructural**: se parsearon los dos enums en el tarball del pin y en el árbol local y se comparó,
variante a variante, el conjunto de campos, el tipo de cada campo y los atributos `#[serde(...)]` de
variante y de campo (incluidos `rename` y `skip`).

| Enum | Variantes pin/mesa | Altas | Bajas | Diferencias de campos, tipos o serde |
| --- | --- | --- | --- | --- |
| `GameAction` | 142 / 142 | 0 | 0 | **0** |
| `WaitingFor` | 149 / 149 | 0 | 0 | **0** |

Los dos ficheros que definen los enums (`types/actions.rs`, `types/game_state.rs`) son además
byte-idénticos al tarball, pero eso es la comprobación débil; la fuerte es la de arriba, y es la que
se hizo primero.

**El puente de Mesa tampoco cambia.** `crates/mtg-engine-wasm/src/lib.rs` serializa el valor entero
(`"waiting_for": state.waiting_for`) y sólo **desestructura una variante**:
`WaitingFor::GameOver { winner }`, que en el pin conserva el único campo `winner: Option<PlayerId>`,
sin `serde` de variante ni de campo. Es la única variante que Mesa lee campo a campo, y no cambió.
`GameAction` entra al motor por `serde_json` completo (`action: GameAction`), así que cualquier
cambio de payload habría importado; no lo hubo.

Por tanto, para este pin, la afirmación correcta es: **cero diferencias estructurales en los dos
enums y en el único campo que el puente consume**. No «no añade variantes, luego es inocuo».

`REPRESENTED` sigue en **110** de 149, y el censo vigilado por
`src/lib/game/__tests__/represented-variants.test.ts` no se mueve.

Que los enums no cambien no significa que el cable no cambie. `protocol/changes/` no se importa a
Mesa (ver desviaciones), pero sí leí los **seis** documentos nuevos del rango: los seis declaran
`surfaces: full + wire`, y los seis son **aditivos** — campos nuevos, ninguna variante nueva ni
cambiada:

| Documento | Qué añade |
| --- | --- |
| `4b4f8c14` | El mínimo letal de arrollar cuenta el daño que otros atacantes ya comprometieron al mismo bloqueador (CR 702.19b) |
| `8cf7e796` | `StaticMode::LethalDamageDeterminedByPower` (Zilortha, Strength Incarnate) |
| `bee8e913` | `GameState::pending_simultaneous_unless` y su fase (CR 101.4) |
| `ccf3b7fa` | `ParsedCondition::SourceMatchesFilter` y filtros de origen para activaciones impresas de exilio (Greater Gargadon) |
| `d6baea47` | `BattlefieldEntryRecord::token_status` (conteo de no-fichas entradas este turno, Gyome) |
| `de804c61` | Historial de ciclos completado y su edición de libro mayor |

Consecuencia para Mesa: el `decode` de un estado guardado por el pin nuevo puede traer campos que
Mesa no conoce, y un estado guardado por Mesa no los trae. Ninguna de las dos direcciones cambia el
número de variantes, así que no hay ventana nueva que portar. Queda anotado como el contrato a
vigilar en el siguiente salto, no como deuda de éste.

## Corrección de esta importación: la suite conservada no se había sincronizado

La primera versión de este pin sincronizó `src` y **17** ficheros de prueba, y dio la suite por
completa. No lo estaba. El cruce exhaustivo de `crates/phase-engine/tests` contra el tarball del pin
—hash por fichero, no por intuición— encontró **23 ficheros distintos**, y el revisor independiente
señaló cuatro de ellos. Los veintitrés, clasificados:

| Clase | Ficheros | Diagnóstico |
| --- | --- | --- |
| Idénticos al pin **anterior** (`d01766e1`), sin tocar en este rango localmente | 17 | Gap puro de sincronización: la copia de Mesa era la de v0.130.0 |
| Ediciones locales de Mesa (`main.rs`, `shard_2`…`shard_5`) | 5 | Poda deliberada de `mod` hacia ficheros que Mesa no importa |
| Cambio de contenido binario | 1 | `fixtures/cr733/authority_matrix.json.gz`: 355 entradas de `fields` frente a 353 |

Los 17 del primer grupo se copiaron del tarball y quedan byte-idénticos. Entre ellos los cuatro que
el revisor destacó (`bbfu10_entered_this_turn_snapshot`, `deterministic_game_state_serde`,
`compound_ward_cost_pays_every_part`, `issue_2916_torment_repeat_unless`), y además
`condition_gates_fail_closed`, `cr733_resolved_stack_entry_finalize`, `doran_attack_block_pump`,
`ironscale_hydra_combat_prevention`, `issue_3665_smugglers_share`,
`issue_9775_non_controller_activation_offered`, `jeskai_ascendancy_pump_untap_anaphora_6857`,
`kashi_tribe_damage_tap_freeze`, `lasting_play_from_exile_permission`,
`mold_folk_sacrifice_type_union`, `park_heights_pegasus_draw_condition_runtime`,
`scoped_unless_payer_per_iteration`, `the_chain_veil_loyalty_grants`.

El caso que citó el revisor es exactamente el esperado: `bbfu10_entered_this_turn_snapshot` crece
**+658 líneas** porque upstream reescribió sus expectativas sobre `NonToken` junto con la
implementación nueva. La copia anterior afirmaba «`battlefield_entry_matches_filter` responde sólo a
4 de las 98 variantes de `FilterProp` y falla cerrado en el resto»; el pin ya no. Conservarla habría
dejado una prueba que documenta el comportamiento viejo como si fuera el vigente.

### Las cinco raíces: se sincronizan, sólo se podan los `mod` sin fichero

`main.rs` y `shard_2`…`shard_5` sí cambian en el rango, pero su diferencia con el pin no es
semántica: son líneas `mod`. Se regeneraron desde el tarball conservando **sólo** las declaraciones
cuyo fichero existe en local, con resolución real de módulos (`x.rs`, `x/mod.rs` y `#[path = ...]`,
que es como resuelve Rust). Resultado, medido:

| Raíz | `mod` conservados | `mod` podados |
| --- | --- | --- |
| `main.rs` | 284 | 91 |
| `shard_2.rs` | 352 | 67 |
| `shard_3.rs` | 615 | 71 |
| `shard_4.rs` | 546 | 56 |
| `shard_5.rs` | 418 | 71 |

Poda total: **356**. Líneas de diferencia con el tarball que **no** son un `mod`: **0** en las cinco.
Cada `mod` conservado resuelve a un fichero; ningún fichero de prueba queda declarado en dos raíces
(salvo `support`, que por diseño se declara en las cinco); el único fichero sin declarar es
`shorten_efficacy.rs`, propio de Mesa. Los cuatro `mod` que apuntan a directorios o a `#[path]`
(`census_release_batch_1`, `census_release_batch_2`, `p3_referent_predicates`, `source_census`) se
resolvieron antes de podar nada: una primera pasada los contó como huérfanos porque sólo miraba
`x.rs`.

### Pruebas upstream nuevas incorporadas para las mecánicas del pin

La política es no importar en bloque pruebas de subsistemas que Mesa no usa, pero sí las que cubren
lo que este pin cambia. Cuatro módulos upstream entraron por eso, verbatim del tarball y declarados en
el shard que upstream indica:

| Módulo | Mecánica | Pruebas | Shard |
| --- | --- | --- | --- |
| `trample_lethal_assigned_this_step` | Mínimo letal al arrollar contando daño ya asignado (CR 702.19b) | 6 | `shard_5` |
| `zilortha_lethal_damage_by_power` | Daño letal determinado por la fuerza (CR 120.6, 704.5g) | 24 | `shard_5` |
| `scoped_unless_choose_all_then_act` | «A menos que» con alcance de jugador: elegir todos, luego actuar (CR 101.4) | 14 | `shard_5` |
| `issue_8079_past_in_flames_flashback` | Flashback de Past in Flames (CR 611.2c) | 17 | `shard_4` |

Las otras cuatro mecánicas del encargo ya tenían cobertura upstream **conservada** y ahora
sincronizada: identidad de referentes y Greater Gargantón suspendido en
`mold_folk_sacrifice_type_union` (15 pruebas, con `GARGADON` y su texto de suspend literal),
no-fichas entradas este turno en `bbfu10_entered_this_turn_snapshot` (29), ward y ventanas de maná en
`compound_ward_cost_pays_every_part` (11), y unless secuencial en `scoped_unless_payer_per_iteration`
(64). Historial de cycling: el gancho nuevo (`de804c61`) no trae prueba propia en el pin; lo que hay
es `yidaro_cycle_publication` y los snapshots de `oracle_ir` importados, y se declara así en vez de
afirmar una cobertura que no existe.

## Procedencia ampliada: cinco árboles, no uno

`engine:verify` hasheaba **sólo** `crates/phase-engine/src`. Los árboles de AST, parser y datos se
importan igual de literales, así que un parser corrupto pasaba la verificación de procedencia sin que
nadie lo notara. El manifiesto declara ahora los cinco árboles y el script los verifica todos con la
misma función de hash (`sha256` sobre la secuencia ordenada `ruta \0 sha256(fichero)`; el algoritmo
no cambió, por eso `sourceSha256` sigue siendo válido).

| Árbol local | Upstream | Ficheros | SHA-256 |
| --- | --- | --- | --- |
| `crates/phase-engine/src` | `crates/engine/src` | 502 | `66f5ae9a…82fc18` |
| `crates/phase-ast/src` | `crates/phase-ast/src` | 34 | `abff252ae284c91e6d891089280cec58789e50633a46263c6f6571777396f3b6` |
| `crates/phase-ast/data` | `crates/phase-ast/data` | 5 | `101baa5e9f2f1127385cf4aec0e3eecfef75673b5898978d5a1ac2f3ad0dcfad` |
| `crates/phase-parser/src` | `crates/phase-parser/src` | 400 | `31c975e8a7782f827226e85ed24e12c13bf01407837866933488c3e9c74446bd` |
| `crates/phase-engine/data` | `crates/engine/data` | 3 | `86b8a76846990d24538ebbfd51cac4a9cb65953feb882b9307415d4812703bd8` |

Los cinco son idénticos al tarball. `bun run engine:verify` sin argumentos verifica los cinco;
`bun run engine:verify -- <dir>` conserva el modo de un solo árbol. RED comprobado árbol a árbol:
añadir una línea a un fichero de cada uno de los cuatro nuevos pone la verificación en rojo, y
restaurarlo la devuelve a verde.

## Las 17 rutas `include_*!` sin fichero: de 17 a 3

Barrido sobre los cuatro árboles: **204** llamadas `include_*!`. Al cerrar la primera versión de este
pin, 17 rutas no resolvían. Clasificadas por naturaleza, que es lo que el encargo pedía distinguir:

| Naturaleza | Rutas | Decisión |
| --- | --- | --- |
| **Texto, no ruta** | 1 (`src/source_census.rs` cita `include_str!("x.rs")` como ejemplo en su doc) | No es una ruta; se excluye del recuento |
| **Código de librería** (`#[cfg(test)]` de `src/types/format.rs`) | 3 | Resueltas materializando `client/src/...` |
| **Pruebas de contrato** (`format_axis_census`, `interaction_contract`) | 3 | Resueltas igual |
| **Fixtures de contrato** (`fixtures/adapter-contract/*.json`) | 7 | Materializadas desde el pin |
| **Dependencia no importada a propósito** (`engine-wasm/src/lib.rs`) | 2 | Se quedan: Mesa no tiene ese crate |
| **Binario opcional** (`resolution_face_census.rs` → script de auditoría) | 1 | Se queda: `required-features = ["test-support"]`, CI descarga el script |

Resueltas: **14 de 17** (de 17 a 3). Las tres que quedan son las dos de `engine-wasm` y la del
binario opcional, todas deliberadas.

Las referencias a `client/src` se resolvieron **sin tocar una sola línea de Rust**: se materializaron
las rutas que el propio upstream escribe, con copias exactas del pin. Las cinco de `format.rs` y
`format_axis_census.rs` y la sexta de `interaction_contract.rs` —que los informes anteriores no
contaban— resuelven ahora a ficheros reales:

| Fichero materializado | Origen en el pin | Bytes | SHA-256 |
| --- | --- | --- | --- |
| `client/src/adapter/types.ts` | `client/src/adapter/types.ts` | 292 454 | `3617a857…` |
| `client/src/data/formatRegistry.ts` | `client/src/data/formatRegistry.ts` | 27 768 | `9f4547ed…` |
| `client/src/adapter/generated/interaction/index.ts` | `client/src/adapter/generated/interaction/index.ts` | 23 848 | `ff80f190…` |
| `fixtures/adapter-contract/*.json` (9) | `fixtures/adapter-contract/` | — | idénticos |

No se introduce modificación innecesaria en el código de reglas: no se reescribe ningún `include_*!`,
no se toca ningún `mod` del motor y el único cambio de Rust en esta ronda es el script de
verificación, que no es código de reglas. Los dos primeros ficheros son además **byte-idénticos** al
espejo histórico `crates/phase-engine/client-mirror/`, así que no hay dos fuentes de verdad: el
espejo y la ruta upstream son ahora el mismo contenido.

Efecto secundario buscado: el guardián `engine-embedded-files.test.ts` tenía dos excepciones
declarando ausentes precisamente las rutas de `format.rs`. Al existir los ficheros, la prueba falló
—su comprobación de que «una excepción que sobra se poda»— y se quitaron las dos. Sigue habiendo una
tercera excepción viva, la del binario opcional. RED y GREEN quedan así registrados por la propia
suite.

## Versión del workspace y dependencias

El `Cargo.toml` del workspace de upstream pasa a `version = "0.131.0"`. Como upstream usa
`version.workspace = true`, los tres `Cargo.toml` importados llevan la versión **literal**
(`version = "0.131.0"`), que es la desviación declarada de siempre. `diff` contra el tarball de los
tres ficheros: **sólo esa línea**.

`crates/phase-engine/Cargo.toml` gana `flate2` como dependencia **opcional**, colgada de la feature
`test-support`. Es consecuencia del cambio de fixture: el lector nuevo descomprime los dumps de
prueba. `Cargo.lock` sube `phase-engine`, `phase-ast` y `phase-parser` a `0.131.0`; `flate2 1.1.10` ya
figuraba en el grafo.

### La desviación `test = false` desaparece (a mejor)

El pin anterior mantenía `test = false` en el binario `coverage-report` porque su prueba inline
dependía de datos que Mesa no importaba, y esa era la única línea no idéntica del fichero. **En este
pin upstream también la desactiva** (deja el comentario `# Test-enabled: …` pero sin `test = false`),
y el dato que antes faltaba — `tests/fixtures/runtime_card_export_fixture.json`, que el binario
incluye con `include_str!` — **sí está** en el árbol importado. Con el fichero copiado del tarball, la
desviación ya no tiene motivo: los tres `Cargo.toml` quedan idénticos al upstream salvo la línea de
versión.

No lo doy por verificado: **ningún job de CI compila los tests de ese binario** (`phase-source-regressions`
compila `mesa_phase_regressions`, `wasm` no compila `cfg(test)`), y aquí no hay `cargo`. Que el
`include_str!` resuelva lo comprobé a mano; que las tres pruebas pasen, no. Si en algún momento se
añade un job que ejecute `cargo test -p phase-engine --bins`, esto es lo primero que hay que mirar.

## Datos que el motor compila dentro (`include_str!`)

Barrido completo de los cuatro árboles: **204** llamadas `include_*!`, de las que **17 rutas no
tienen fichero** en este checkout. Las 13 que ya fallaban en `HEAD` siguen fallando igual; la
importación **no añadió ninguna ruta rota**. Las cuatro nuevas sin fichero son las tres de
`format.rs`/`format_axis_census.rs` que ya existían y una sexta que los informes anteriores no
contaban:

| Ruta sin fichero | Dónde | ¿Nueva? |
| --- | --- | --- |
| `../../../../client/src/adapter/types.ts` | `src/types/format.rs` (×1), `tests/…/format_axis_census.rs` (×1) | No |
| `../../../../client/src/data/formatRegistry.ts` | `src/types/format.rs` (×2), `tests/…/format_axis_census.rs` (×1) | No |
| `../../../../client/src/adapter/generated/interaction/index.ts` | `tests/…/interaction_contract.rs` | No, **omitida por los informes anteriores** |
| `../../../../scripts/audit-resolution-face-casting.sh` | `src/bin/resolution_face_census.rs` | No |
| `../../../../fixtures/adapter-contract/*.json` (7) | `tests/…/adapter_contract_fixtures.rs` | No |
| `../../../engine-wasm/src/lib.rs` (2) | `dandan_shared_pile_storage.rs`, `freeform_commander_deck_rules.rs` | No |
| `x.rs` | `src/source_census.rs` | No (patrón de texto, no una ruta real) |

Corrección a los informes del 18, 19 y 22 de noviembre: no son **cinco** referencias a
`client/src`, son **seis**. La sexta (`interaction_contract.rs:7498`, el `index.ts` generado de la
interacción) queda fuera del recuento anterior y tampoco está en el espejo
`crates/phase-engine/client-mirror/`, que sólo tiene `types.ts` y `formatRegistry.ts`.

Ninguna rompe CI hoy: `wasm` construye sin `cfg(test)` y `phase-source-regressions` compila una lista
explícita de nueve módulos (`support` + ocho regresiones) que no incluye ninguno de los ficheros que
nombran estas rutas. Sigue sin tocarse a propósito (decisión
tomada y revertida una vez: no se reescriben los `include_*` al espejo).

`client-mirror/` no cambia en este rango: mismos MD5 que el pin anterior.

| Copia local | Origen upstream | Bytes | MD5 |
| --- | --- | --- | --- |
| `crates/phase-engine/client-mirror/types.ts` | `client/src/adapter/types.ts` | 292 454 | `b47f96645aae191909df7e014de20727` |
| `crates/phase-engine/client-mirror/formatRegistry.ts` | `client/src/data/formatRegistry.ts` | 27 768 | `ac92420aa085629bbde1d5862e87e800` |

## Desviaciones del upstream (todas)

1. **Versión literal** en los tres `Cargo.toml` en vez de `version.workspace = true`. Única línea
   distinta al tarball.
2. **`Cargo.lock` reducido** a los cuatro miembros del workspace local (144 paquetes). El del pin
   tiene 434 porque incluye `server`, `tauri`, `lobby-broker` y `brotli`, crates que Mesa no tiene.
   Copiarlo no es posible ni tendría sentido. Sólo se subieron las tres versiones propias.
3. **`scripts/audit-resolution-face-casting.sh` ausente.** El único que lo nombra es un
   `include_bytes!` de `src/bin/resolution_face_census.rs`, un binario con
   `required-features = ["test-support"]`. El job de CI lo descarga y comprueba su `git hash-object`
   antes de compilar. No se vendoriza.
4. **`client-mirror/`** en lugar de `client/src`. Política de siempre: el árbol se mantiene fiel al
   tarball y las cinco/seis rutas `include_str!` se quedan como upstream las escribe.
5. **`protocol/changes/` no se importa** (206 documentos en el pin, 0 en Mesa). Lo leen
   `client/protocol-generation.ts`, `crates/lobby-broker/build.rs` y `scripts/protocol-versions.mjs`
   de upstream: ninguno existe en Mesa, que no publica protocolo versionado ni tiene broker. El
   contenido de los seis documentos nuevos está resumido arriba, que es lo que Mesa necesita de ellos.
6. **`tests/fixtures/legacy_saves/v0_128_0/` no se importa** (2 saves congelados de v0.128.0,
   216 KB con su `.provenance`). Su único lector en el pin es
   `crates/engine-wasm/src/lib.rs:7639`, dentro de `#[cfg(test)]`, vía `include_bytes!`; Mesa no
   tiene ese crate —tiene `crates/mtg-engine-wasm`, 353 líneas, sin ninguna referencia a
   `legacy_saves`—. Son irreproducibles por diseño (saves escritos por la release v0.128.0) y no
   hay nada en Mesa que los lea. Es el fichero que el inventario dejaba «a revisar»: la revisión
   concluye que no se importa, y queda escrito aquí para que no se pierda.
7. **`integration_cards.json.gz` eliminado** y sustituido por los 28 shards, con las correcciones de
   consumidores de la sección anterior. No se conserva el `.gz`.

`reference/phase.json` **no se toca**. Es el registro histórico del pin `c2fbb7a6` (v0.119.0), sin
lectores en el código y fuera del digest; `docs/PHASE-STUDY.md` lo llama «referencia congelada».
Reescribirlo crearía una segunda fuente de verdad sobre qué pin se importó.

## Qué se ejecutó, dónde, y qué no se ejecutó

Lo que **sí** se ejecutó en local (este entorno, sin `cargo`):

| Comprobación | Resultado |
| --- | --- |
| `bun run engine:verify` | `ok: true` en los **cinco** árboles (502 + 34 + 5 + 400 + 3 ficheros) |
| RED de procedencia por árbol | 4/4 árboles nuevos en rojo al corromper un fichero, verde al restaurar |
| Cruce `tests` vs tarball (hash por fichero) | 23 diferencias → 5 (sólo raíces, sólo `mod`) |
| Coherencia de raíces | 0 `mod` sin fichero, 0 ficheros sin declarar (salvo `shorten_efficacy`, propio) |
| Barrido `include_*!` | 204 llamadas, 3 sin fichero (todas deliberadas), desde 17 |
| Comparación estructural de enums | 0 diferencias en 142 + 149 variantes (campos, tipos, serde) |
| `bun run check` | 0 errores, 2 avisos (preestablecidos) |
| `bun test src/lib` | **790 pass**, 0 fail, 108 ficheros |
| `bun run build` | `Wrote site to "build"` |
| `bun test src/lib/game/__tests__/engine-integration-fixture.test.ts` | 2 pass + RED demostrado |
| `engine-embedded-files.test.ts` | RED al materializar `client/src` (2 excepciones caducadas) → podadas → verde |
| Coherencia de shards (28 ficheros, 8 468 registros) | 0 errores, 0 duplicados |
| `censo` `GameAction`/`WaitingFor` | 142/142 y 149/149 |

Lo que **no** se pudo ejecutar aquí y queda pendiente de CI:

- **`bun run engine:parity` y `bun run engine:scenarios`**: abortan con
  `Executable not found in $PATH: "cargo"`. No es una regresión del árbol; es que los dos scripts
  invocan `cargo run` y en este entorno no hay cadena Rust. No se declaran verdes.
- **Compilación Rust y WASM** de cualquier tipo: no hay `rustc`/`cargo` ni red a
  `static.rust-lang.org`.
- **Las pruebas de integración de Rust** (`cargo test -p phase-engine`): los 22 ficheros
  sincronizados quedan byte-idénticos al tarball, pero eso prueba que el texto es el del pin, **no**
  que compile. La suite COMPLETA no está verde ni se declara: sigue siendo una suite seleccionada.
  Es exactamente lo que el job `phase-source-regressions` tiene que confirmar: compila
  `tests/integration/support.rs`, que es uno de los que cambió, y `support.rs` es el que ahora llama
  a `integration_fixture::exists()`.
- **`cargo test --bins`** del binario `coverage-report` (ver arriba).

## Lo que este rango trae y Mesa no usa todavía

Nada de esto bloquea la importación; se anota para no re-descubrirlo.

- `StaticMode::LethalDamageDeterminedByPower` (Zilortha) y el mínimo letal de arrollar con daño ya
  comprometido: llegan al motor, y el cliente no tiene vista que los distinga.
- `pending_simultaneous_unless`: el «elige todos y luego actúa» de CR 101.4. Es estado de motor, no
  una ventana nueva, así que el panel de acciones no cambia.
- El fixture partido en 28 shards cambia **cómo se regenera** el fixture de pruebas
  (`python3 scripts/gen-test-fixture.py`), no cómo lo lee el cliente.
