# UP-134 — Phase: importación aislada de fuentes Rust (v0.134.0, 22 commits)

**Fecha:** 27 de noviembre de 2026 · **Misión:** UP-134, sesión independiente de
UX-DECISION · **Base:** `main` @ `185b9e1f73740a98161f25ca380e65aba81aee3c`
(merge de #76) · **PR:** independiente, sin fusión ni despliegue automáticos.
Esta sesión trabaja sobre la rama fijada por Arena (`arena/5626f240-mtg`, cuyo
HEAD es el de #76 ya integrado); la PR es nueva y distinta de la #76.

## 1. El HEAD que se fija

- Objetivo fijado por la misión y confirmado con `gh api`: HEAD upstream
  **`c551672cd7f262579a6cdcd25db128376b1fd9c7`** — en el momento de fijarlo
  sigue siendo el HEAD de `main` (2026-11-27T03:23:02Z). No se persiguen
  commits posteriores.
- Pin anterior de Mesa: `e53689630206f113ec61f4813b41856d5cd7c8a9` (v0.133.0).
- [Comparación exacta](https://github.com/phase-rs/phase/compare/e53689630206f113ec61f4813b41856d5cd7c8a9...c551672cd7f262579a6cdcd25db128376b1fd9c7):
  **22 commits adelante, 0 detrás, 300 rutas**. Incluye el release v0.134.0
  (`5d226a5624`) y dos commits posteriores (Ajani, Asmoran…, Mardu, Tomik).
- Tarball nuevo (`codeload`): `sha256 bc51cbd205675430fc0c5dbc72b3815a652fb8edaa556bedab44df1c3fb7abe9`.
  El del pin anterior vuelve a dar `f758bf5c…14c4`, el registrado en UP-133.
- Los 22 commits: catálogo MTGJSON, sacrificio de fichas sin conteo, Xanathar,
  Forge Anew, **Archenemy (#11165)**, Evercoat Ursine, **Equip (#11260)**,
  disparadores retrasados «este turno» (#11367), fichas que entran bloqueando
  (#11365), gates de coste por valor de maná, **Suspend (#11379)**, Genku,
  Ajani Unrelenting, Asmoranomardicadaistinaculdacar, Mardu Siegebreaker y
  Tomik/Mangara (#11374), entre otros.

## 2. Pre-vuelo (Fase 0)

Los cinco árboles del manifiesto se compararon contra el tarball de
`e536896…` **antes** de reemplazar nada: **0 diferencias** (503 + 34 + 5 +
404 + 3 ficheros). La importación parte de una copia fiel.

## 3. Qué cambia de tamaño

| Árbol | Antes | Ahora | Notas |
| --- | ---: | ---: | --- |
| `crates/phase-engine/src` | 503 | **504** | Alta: `game/effects/set_scheme_in_motion.rs` (Archenemy). 108 ficheros modificados. |
| `crates/phase-ast/src` | 34 | 34 | 5 modificados. |
| `crates/phase-ast/data` | 5 | 5 | 2 modificados (catálogo MTGJSON, misparses). |
| `crates/phase-parser/src` | 404 | 404 | 44 modificados. |
| `crates/phase-engine/data` | 3 | 3 | Sin cambios. |
| `tests/integration` (Mesa) | 2 315 | **2 350** | 66 retenidos actualizados + **35 altas** del pin registradas en `main.rs`. |
| `tests/fixtures` (Mesa) | 131 | 131 | 19 modificados (18 shards `integration_cards/*.jsonl` + `issue_3316_cards.json`). |

Los módulos upstream que Mesa poda deliberadamente **siguen podados**: las 35
altas son exactamente los ficheros nuevos del pin en `tests/integration`, ni
uno más. `shorten_efficacy.rs` sigue siendo el único fichero propio sin
declarar.

## 4. Procedencia nueva

`docs/PHASE-UPSTREAM-PIN.json` pasa a `commit = c551672…`, `version = 0.134.0`:

| Árbol | Ficheros | `sha256` |
| --- | ---: | --- |
| `crates/phase-engine/src` | 504 | `8cecff1ed3c50164ea5b255c39e48cf3f2ff73baaab46837775fd5f11910db7f` |
| `crates/phase-ast/src` | 34 | `df1e792753f289d95b497866ee0b3566db73e5b20d9d5ee50132ca42b9a225aa` |
| `crates/phase-ast/data` | 5 | `52272998542e9ccedbdf1d87ed413ec0e2267c9cf3063bd02e23d1ccce987814` |
| `crates/phase-parser/src` | 404 | `d2bd1d360c9a96d792f152dc6e0bc9807fd79fb20be0ffd3a82e64609b840769` |
| `crates/phase-engine/data` | 3 | `86b8a76846990d24538ebbfd51cac4a9cb65953feb882b9307415d4812703bd8` |

`bun run engine:verify` da `ok: true` en los cinco árboles. Los tres
`Cargo.toml` importados y el `Cargo.lock` suben sólo la versión propia a
`0.134.0` (misma desviación declarada de siempre: versión literal en vez de
`version.workspace = true`).

## 5. Auditoría de contratos (Fase 2)

Comparación estructural entre los dos tarballs, no recuentos a ciegas:

- **`GameAction`: 142 = 142 variantes, sin altas ni bajas.** `types/actions.rs`
  es **byte-idéntico** entre pins. La identidad y legalidad de las acciones
  que consume UX-DECISION no cambia.
- **`WaitingFor`: 149 = 149**, sin altas ni bajas. Los cambios son internos:
  instantáneas de combate al salir (`departure_combat`, `pub(crate)`, con
  `#[serde(default)]`), `blocking_attacker` en la entrada de fichas (CR 509.4)
  y el latch de lanzamiento desde lo alto de la biblioteca ajena (Xanathar).
  Ningún payload de decisión que Mesa renderice pierde campos.
- **`GameEvent`: 150 = 150.** Cambios de campos internos (`FilterProp::Attacking`
  gana `scope` con `Default`; `TypeFilter::Scheme` entra en un match).
- **`DerivedViews`:** sin cambios en campos públicos publicados.
- **`FormatConfig`:** Archenemy y Archenemy Commander pasan de
  `min_players: 2` a **`min_players: 3`** (CR 904.2 + CR 800.1), en el motor y
  en el espejo `formatRegistry.ts`. **No afecta al producto:** Mesa sigue
  ofreciendo partidas de dos jugadores y **no habilita Archenemy**; un formato
  de 1v1 nunca fue una mesa legal de Archenemy. Soporte interno del motor ≠
  funcionalidad del producto, y así queda declarado.
- **Espejo del cliente** (`adapter/types.ts`, 14 líneas): la unión de acciones
  pendientes del journal pasa `Equip`/`Crew`/`Saddle`/`Station` a la forma
  etiquetada `{type, data}` con `EquipPin = ObjectIncarnationRef | ObjectId`
  («restoring a pending Equip requires both pins»). Es la restauración de un
  journal heredado, **no** `GameAction::Equip` (que en Mesa sigue siendo
  `equipment_id`/`target_id` y cuyo enum no cambió). Ningún código de Mesa
  consume esa unión; las dos copias del espejo se actualizan por hash.
- **`formatRegistry.ts`:** además del `min_players`, upstream añade
  `isArchenemyFamilyFormat`. Se importa en el espejo; Mesa no lo usa porque no
  ofrece esos formatos.
- El puente WASM serializa el estado entero y no se modifica: los campos
  nuevos llevan `#[serde(default)]`, así los saves anteriores deserializan.

## 6. Regresiones prioritarias (Fase 3)

El workflow `phase-source-regressions` gana el target `mesa_phase_up134` con
**15 módulos originales** del tarball (≥250 tests registrados; el job falla si
el filtro queda vacío), uno por mecánica del rango:

`equip_keyword_target_legality` + `forge_anew_equip_timing` (Equip),
`suspend_begin_to_cast` (Suspend), `blocking_token_entry` (fichas que entran
bloqueando), `tomik_mangara_player_led_attack` (Tomik/Mangara),
`top_of_library_foreign_permission` + `top_of_library_mixed_permission`
(Xanathar), `additional_cost_declaration_tail` (Asmoran…),
`token_attack_destination` (copias atacantes de Mardu Siegebreaker),
`loyalty_ability_activated_trigger` (Ajani Unrelenting),
`issue_3246_windbrisk_heights_hideaway_exiled_by_source` (objetos vinculados
en exilio), `delayed_trigger_occurrence_fanout` (retrasados «este turno»), y
`all_in_good_time` + `archenemy_hero_teammate_priority` +
`commander_team_formats` (Archenemy: asientos y Schemes **dentro del motor**;
el producto no los expone). Los targets UP-131/UP-133 se conservan intactos.

## 7. Cobertura y catálogo (Fase 4)

`docs/engine-coverage.json` sigue acreditando `phase c2fbb7a6…` (v0.119.0):
los informes de los packs `fixture` y `10e` **no** se regeneran en esta PR.
Regenerarlos exige compilar `coveragepack` con el nuevo pin y este entorno no
tiene toolchain Rust; hacerlo en CI ampliaría el alcance de la misión. Queda
como limitación declarada, igual que en UP-133: **ninguna carta se marca
certificada por el mero hecho de que el parser la reconozca**, y no se importa
el catálogo completo. La comparación ganado/perdido de soporte queda
pendiente de esa regeneración.

## 8. UX-DECISION 1.1 (Fase 5)

Sin cambios de contrato que la afecten: `GameAction` es byte-idéntico, ningún
payload de decisión pierde campos y el espejo que cambia (journal pendiente)
no lo consume Mesa. No se toca `decisionProjection.ts`: `boundObjectId`,
`boundCastKey`, `startsCast`, la no-ejecución al inspeccionar, los 44 px y el
gate de 22 pruebas siguen vigentes y los ejerce la CI de esta PR (Chromium con
WASM real + job `ux-evidence`).

## 9. Qué se ejecutó aquí y qué queda a GitHub CI

Ejecutado en este entorno (Bun 1.4.4, sin `cargo` ni navegador):

| Comprobación | Resultado |
| --- | --- |
| HEAD upstream fijado | `c551672…`, coincide con la misión y con `main` al fijarlo |
| Pre-vuelo de los cinco árboles contra `e536896…` | 0 diferencias |
| Comparación de contratos entre tarballs | §5 |
| `bun run engine:verify` | `ok: true`, cinco árboles |
| Contratos locales (`phase-pin-contract`, `engine-embedded-files`, `decisionProjection`, transporte UX-DECISION, `phase-upstream-watch`) | 32 pass / 0 fail |

**No ejecutado aquí:** compilación Rust/WASM, paridad, escenarios, las
regresiones Rust de los cuatro targets y Chromium. Lo emite la CI de esta PR
sobre el HEAD final; los resultados reales se citan en el cuerpo de la PR, no
aquí.

**Estado de la entrega:** PR independiente, sin fusionar y sin desplegar.
