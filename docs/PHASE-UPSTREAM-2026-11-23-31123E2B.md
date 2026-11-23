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

## Contrato: mismas ventanas, mismas acciones

`GameAction` y `WaitingFor` **no cambian de número** en este rango: 142 = 142 y 149 = 149, altas y
bajas vacías en los dos. Por este pin la interfaz de Mesa no necesita trabajo; sólo registro.

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
| `bun run engine:verify` | `ok: true`, digest `66f5ae9a…82fc18`, 502 ficheros |
| `bun run check` | 0 errores, 2 avisos (preestablecidos) |
| `bun test src/lib` | **790 pass**, 0 fail, 108 ficheros |
| `bun run build` | `Wrote site to "build"` |
| `bun test src/lib/game/__tests__/engine-integration-fixture.test.ts` | 2 pass + RED demostrado |
| Barrido `include_*!` (204 llamadas) | 17 sin fichero, todas preexistentes |
| Coherencia de shards (28 ficheros, 8 468 registros) | 0 errores, 0 duplicados |
| `censo` `GameAction`/`WaitingFor` | 142/142 y 149/149 |

Lo que **no** se pudo ejecutar aquí y queda pendiente de CI:

- **`bun run engine:parity` y `bun run engine:scenarios`**: abortan con
  `Executable not found in $PATH: "cargo"`. No es una regresión del árbol; es que los dos scripts
  invocan `cargo run` y en este entorno no hay cadena Rust. No se declaran verdes.
- **Compilación Rust y WASM** de cualquier tipo: no hay `rustc`/`cargo` ni red a
  `static.rust-lang.org`.
- **Las pruebas de integración de Rust** (`cargo test -p phase-engine`): los 17 ficheros corregidos
  quedan byte-idénticos al tarball, pero eso prueba que el texto es el del pin, **no** que compile.
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
