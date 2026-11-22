# Phase: importación aislada de fuentes Rust — 22 nov 2026 (v0.130.0, 72 commits)

- Pin antiguo: `2581c56ec383631426bc5734175638b5ebb7dd25` (v0.129.0, tag `84539e46`).
- Pin nuevo: `d01766e17e4d1d9ef9e2a351671ba1e3c160b283` (**72 commits posteriores**, con **un**
  release: **v0.130.0** en `9b4fc3df`, tag anotado `ce9bf37e`). El release es anterior al commit
  fijado: entre `9b4fc3df` y `d01766e1` hay 10 commits más de `main`, y se fijan esos porque el pin
  sigue a `main`, no al tag (misma política que las importaciones anteriores).
- Comparación: https://github.com/phase-rs/phase/compare/2581c56ec383631426bc5734175638b5ebb7dd25...d01766e17e4d1d9ef9e2a351671ba1e3c160b283
- Reimportados `crates/engine/src` (local: `crates/phase-engine/src`), `crates/phase-ast/src`,
  `crates/phase-parser/src`, `crates/phase-ast/data` y las pruebas conservadas de
  `crates/engine/tests` desde el tarball del commit nuevo.
- Digest de `crates/phase-engine/src` tras la importación:
  `2d89a8fdc2e7a8ebee90bf1423f6ebf5415ae32ad35e85e6231d6d0d0aefe732` (`bun run engine:verify` →
  `ok: true`, 499 ficheros).

## Qué cambia de tamaño

| Árbol | Ficheros antes | Ficheros ahora | Ficheros con cambios | Altas upstream | Bajas upstream |
| --- | --- | --- | --- | --- | --- |
| `crates/phase-engine/src` | 498 | 499 | 143 | 1 | 0 |
| `crates/phase-ast/src` | 34 | 34 | 10 | 0 | 0 |
| `crates/phase-parser/src` | 396 | 396 | 48 | 0 | 0 |
| `crates/phase-ast/data` | 5 | 5 | 3 | 0 | 0 |
| `crates/phase-engine/tests` (conservadas) | 2228 | 2228 | 105 | poda propia | poda propia |

La única alta del motor es `game/scoped_unless_poll.rs` (143 líneas): el estado de consulta de las
sustituciones con alcance de jugador («a menos que» sobre varios jugadores). `game/mod.rs` ya lo
declara, así que sin el fichero el `mod` no compila. Cero bajas.

En las pruebas se mantiene la política de siempre: se copian las 2228 que Mesa ya conservaba (105 con
cambios) y se dejan fuera las upstream que Mesa nunca importó. `tests/fixtures` gana 28 ficheros
nuevos (tres `.json.gz` existentes se reescriben). Los cinco ficheros raíz de la suite
(`integration/main.rs` y `shard_2` a `shard_5`) se sincronizan, pero no sus `mod` nuevos: se quitan
**333** entradas cuyos ficheros no existen en local (90 + 57 + 68 + 53 + 65). `diff` filtrado de los
cinco contra el tarball: cero líneas de diferencia que no sean un `mod`, y ninguno de los `mod`
podados tiene fichero en local. `tests/integration/shorten_efficacy.rs` sigue siendo el único fichero
local sin contrapartida upstream y se conserva por la razón del pin anterior.

## Contrato: una ventana nueva y dos que cambian de forma sin cambiar el cable

`WaitingFor` pasa de **148** a **149** variantes. Sólo una es alta:

```rust
// ReplacementDecisionOrder, v0.130.0
/// CR 101.4c + CR 616.1: `player` holds two or more simultaneous
/// replacement decisions of one staged population and chooses which to
/// make first. `objects` are the objects those decisions are about, in
/// announcement order. Answered by `GameAction::SelectCards` with exactly
/// one of them; that decision is then asked.
ReplacementDecisionOrder { player: PlayerId, objects: Vec<ObjectId> },
```

Es una elección **exactamente uno** sobre una lista de objetos ya publicada, y se contesta con
`SelectCards { cards: [ese] }` — el mismo sobre que `BeholdChoice` y el mismo que
`ai_support/candidates.rs` ofrece al bot. Mesa no la tiene representada todavía; cae al bloque
genérico del panel, que sí lista las acciones legales (`SelectCards` con cada objeto) porque
`actionObjectId` es `undefined` para ellas. Queda anotada como la siguiente ventana a portar: no es
una ventana rota, es una sin vista propia.

Las otras dos que cambian de forma:

| Variante | Qué cambia | ¿Rompe el cable? |
| --- | --- | --- |
| `DigRestSplitChoice` | `completion` pasa de `Box<BatchCompletion>` a `Option<LibraryPlacementContinuation>`; el enum nuevo es `#[serde(untagged)]` con un brazo `Requests(Box<BatchCompletion>)` | **No**: los bytes del brazo `Requests` son los del campo anterior, y `Option` ausente se omite |
| `WardSacrificeChoice` | gana `trigger_event: Option<GameEvent>` con `#[serde(default, skip_serializing_if = "Option::is_none")]` | **No**: campo opcional que el prompt no lee |
| `ReplacementChoice` | sólo se reescribe el comentario; la forma es la misma | No |

`REPRESENTED` sigue en **109**; el censo vigilado por
`src/lib/game/__tests__/represented-variants.test.ts` pasa de 148 a **149** y el comentario del pin
se mueve con él. Nada de esto cambia ninguna vista ya portada.

## Versión del workspace y dependencias

El `Cargo.toml` del workspace de upstream pasa a `version = "0.130.0"`; como upstream usa
`version.workspace = true`, los tres `Cargo.toml` importados siguen llevando la versión **literal**
(`version = "0.130.0"`), que es la desviación declarada de siempre. `Cargo.lock` cambia en **tres
líneas** — las versiones de `phase-engine`, `phase-ast` y `phase-parser` — y en nada más: el rango no
añade ni retira dependencias.

En `crates/phase-engine/Cargo.toml` se mantiene la única desviación de contenido, `test = false` en
el binario `coverage-report` (upstream volvió a dejar el comentario de «test-enabled»; su prueba
inline depende de datos que Mesa no importa). `diff` contra el tarball: sólo `version` y esa línea.

## Datos que el motor compila dentro (`include_str!`)

Las dos copias de `crates/phase-engine/client-mirror/` se resincronizaron con el tarball del pin,
porque `client/src/adapter/types.ts` cambia en el rango (+19/−2, el DTO de
`ReplacementDecisionOrder` y los tipos nuevos de la vista de sustituciones):

| Copia local | Origen upstream | Bytes | MD5 |
| --- | --- | --- | --- |
| `crates/phase-engine/client-mirror/types.ts` | `client/src/adapter/types.ts` | 292 454 | `b47f96645aae191909df7e014de20727` |
| `crates/phase-engine/client-mirror/formatRegistry.ts` | `client/src/data/formatRegistry.ts` | 27 768 | `ac92420aa085629bbde1d5862e87e800` |

`formatRegistry.ts` no cambia en el rango (mismo MD5 que el pin anterior). Las dos copias son bytes
del **commit fijado**, no del tag.

Corrección de una afirmación de los informes anteriores (18 y 19 de noviembre): decían que las
llamadas `include_str!` de `src/types/format.rs` y `tests/integration/format_axis_census.rs` «apuntan
a `client-mirror/`». **No es así en el árbol commiteado.** El árbol local es byte-idéntico al tarball
del pin (`diff -rq` del rango completo: sin diferencias) y las cinco llamadas siguen nombrando las
rutas upstream `../../../../client/src/...`, rutas que no existen en Mesa. Consecuencias, medidas en
este rango y no supuestas:

- `engine:verify` no lo nota: hashea ficheros, no resuelve rutas de compilación.
- Ninguna tarea de CI compila esos dos módulos, así que hoy no rompen nada: `wasm` construye el
  motor **sin** `cfg(test)` (los `include_str!` viven dentro de `#[test]` y de tests de integración) y
  `phase-source-regressions` compila una lista explícita de módulos que no incluye
  `format_axis_census` ni el módulo `format` de la suite.
- Quien compile la suite completa (`cargo test -p phase-engine`) se topa con «file not found».
  El arreglo es apuntar esas cinco rutas a `crates/phase-engine/client-mirror/`, cuyas copias ya
  están en el árbol desde el pin v0.128.0 y no las referencia ningún `.rs`. **No se hizo en esta
  importación** porque el árbol se mantiene fiel al tarball a propósito: la política es que lo único
  que diverge se declare línea a línea, y tocar cinco rutas de `include_str!` merece su propia
  decisión y su propia prueba, no un efecto colateral de un salto de pin.

## Qué NO se verificó aquí

**Este entorno no tiene toolchain de Rust** (`cargo` y `rustc` ausentes). Por tanto **no se compiló**
el motor, no se ejecutó `cargo test`, ni `cargo metadata --locked`, ni `engine:parity`, ni
`engine:scenarios`. Lo que sí se hizo, estáticamente:

- `diff -rq` de los cuatro árboles (`engine/src`, `phase-ast/src`, `phase-parser/src`,
  `phase-ast/data`) contra el tarball: **sin diferencias**.
- `Cargo.lock`: `diff` contra el anterior da exactamente tres hunks de versión.
- Los 17 símbolos que importa el puente `crates/mtg-engine-wasm` siguen resolviendo; el rango no
  toca `game/engine.rs` en las firmas que el puente usa.
- `bun run engine:verify` → `ok: true` con el digest nuevo.
- `bun run check` 0 errores (2 avisos previos), `bun test src/lib` **778**, `bun run build` OK.

La compilación la valida CI (`wasm` compila el motor y el puente; `native-integration` ejecuta paridad
y escenarios). Este informe **no** afirma que se verificara en local.

## Lo que este rango trae para el cliente, no para el motor

95 ficheros de `client/src` cambian. Los que miran al port de la interfaz:

| Cambio upstream | Qué implica para Mesa |
| --- | --- |
| `modal/ReplacementDecisionOrderModal.tsx` (nuevo, 119 líneas) | La ventana de orden de sustituciones: una tira de cartas, una por objeto, con subtítulo cuando el objeto es un Aura o tiene adjuntos |
| `modal/ChoiceOverlay.tsx` (+174/−42) y `hooks/useChoiceCardLayout.ts` (nuevo) | El marco común de las ventanas de decisión pasa a medir el reparto de la tira de cartas en vez de fijarlo por CSS |
| `modal/SeparatePilesModal.tsx` (+197/−70) y su prueba de teléfono (`issue_11120`, 289 líneas) | Los montones separados cambian de reparto en pantalla estrecha |
| `components/stack/StackDisplay.tsx` (+249/−61) y `StackTargetArcs.tsx` | La pila larga se pliega y los arcos de objetivo se recolocan |
| `pages/GamePage.tsx` (+41), `waitingForRegistry.ts` (+3) | Registro de la ventana nueva y montaje del modal |

Eso es lo que hay que mirar con las capturas delante en la pasada siguiente: el tablero de Mesa se
parece al de Phase de 0.129, no al de 0.130.
