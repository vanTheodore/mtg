# Mesa — UX-DECISION 1.0: simplicidad contextual

**Estado:** PR independiente en Draft · sin fusionar ni desplegar.
**Base:** `dd531f46d20b6136cb2b7a40962a210fad6a4de0` (`main` tras UP-133 y UX-HAND).
**Motor:** Phase `0.133.0`, pin `e53689630206f113ec61f4813b41856d5cd7c8a9`. No se actualiza upstream ni se cambian reglas.

> Phase es la autoridad mecánica; no es la autoridad de diseño. Esta entrega
> reorganiza la *presentación* de las decisiones que Phase ya publica. Ninguna
> acción legal desaparece y ninguna regla de Magic se reimplementa en TypeScript.

---

## 1. Visión y principios aplicados

| Principio | Cómo se materializa |
| --- | --- |
| Una acción principal contextual | `PrimaryAction.svelte`, alimentada por `projectDecision`. Sólo se promueve ceder prioridad, confirmar un borrador de combate, confirmar un pago o conservar la mano inicial. |
| Interacción directa con las cartas | El tablero, `Hand`, `CardActionMenu` y los ~100 componentes especializados siguen intactos. La proyección no los sustituye. |
| Información en el momento adecuado | `DecisionContext.svelte`: turno, fase, **quién tiene prioridad**, intención, datos necesarios, progreso de objetivos y consecuencia de continuar. |
| Opciones avanzadas bajo demanda | `DecisionTiers.svelte` + `AdvancedControls.svelte`; las doce paradas de fase pasan a `<details data-advanced-controls>`. |
| Menor densidad de controles | Las acciones globales dejaron de pintarse en fila en `.confirmations` y se agrupan por niveles. |
| Ninguna pérdida de decisiones legales | `DecisionIntegrity`: toda acción de `legal.actions` termina en un nivel; `legal.by_object` sigue en el tablero. Gate unitario y gate de CI. |
| Ninguna reimplementación de reglas | La proyección clasifica DTO; no calcula objetivos, daño, costes ni legalidad. |

---

## 2. Investigación

### 2.1 Cliente original de Phase en el pin `e5368963`

Extraído del tarball `f758bf5c…14c4` (`client/src/`):

| Fichero | Hallazgo relevante |
| --- | --- |
| `components/board/ActionButton.tsx` | Un único botón con cinco modos (`combat-attackers`, `combat-blockers`, `priority-stack`, `priority-empty`, `hidden`), etiqueta del motor (`usePhaseInfo().advanceLabel`) y armado de confirmación para «no atacar / no bloquear». Inspira `PrimaryAction`, no se copia. |
| `viewmodel/cardActionChoice.ts` | `requiresConfirmation` lee `AbilityDefinition::consumes_source`; `resolveSingleActionDispatch` es la **única** autoridad para decidir si un toque ejecuta o abre un modal. Cycling/channel nunca se auto-despachan. |
| `components/controls/FullControlToggle.tsx` | Un conmutador compacto de control total, separado de la barra de paradas. |
| `components/controls/PhaseStopBar.tsx` | Doce paradas con ámbitos por turno (`AllTurns`, etc.); la fila de chips pertenece a la mesa. |
| `game/castPaymentMode.ts` | `CastPaymentMode` (`Auto`, `Manual`, `AutoExceptSacrificialMana`) se estampa en el `GameAction`; `Manual` domina la preferencia guardada. |
| `game/manaPaymentPreview.ts` | `previewManaPayment` es un **método del adaptador**, con guarda de época del motor. Devuelve `null` cuando no hay preview. |
| `components/targeting/TargetingOverlay.tsx` | Progreso por ranura, frases por categoría, selección directa sobre el tablero y descripción desplegable; cancelación condicionada a `legalActions`. |
| `PriorityPassingMode` (`adapter/types.ts`, `preferencesStore.ts`, `game/dispatch.ts`) | `"Standard" \| "SkipLowUseWindows" \| "FullControl"` y la acción `SetPriorityPassingMode`. |
| `adapter/types.ts` | `GameAction` 142 variantes, `WaitingFor` 149, `consumes_source?: boolean`, `CastPaymentMode`. |

### 2.2 Auditoría de Mesa

- `DecisionPanel.svelte`: 563 líneas, **~100 componentes especializados** importados y una lista `REPRESENTED` de más de cien `WaitingFor`. Una cabecera de tres líneas y un bloque `.confirmations` que mezclaba pasar prioridad, confirmar combate, confirmar pago, cancelar y todas las acciones globales en la misma fila.
- `session.svelte.ts`: 2331 líneas. `busy`, `stale_action` con re-view, rechazo/reintento (`classifyDispatch`), `needsHandoff`, `revealedViewer`, `autoPassPending`, `stops`/`stopActive`, `inspect` frente a `selected`.
- `Board.svelte`: `PhaseStopBar` + `MobilePhaseChip` + `StatusDock` en la variante `arena`; el panel se fija al borde en móvil y publica `--decision-h` con `ResizeObserver`.
- `interaction.ts` (6067 líneas) ya contiene `legal.by_object` → `actionsForObject`, `attackDeclaration`, `blockDeclaration`, `manualCast`, y las ventanas `KeepExact` exacta / «hasta N».

### 2.3 Rust → ABI → brecha

| Capacidad de Phase | ¿La expone nuestro puente? | Decisión |
| --- | --- | --- |
| `legal.actions`, `legal.by_object`, `spell_costs`, `waiting_for.*`, `state.stack` | **Sí** (`project_state`) | Entrada única de la proyección. |
| `DerivedViews::combat_damage_suggestion` (`derived_views.rs:1182`, `combat_damage.rs:1466`) | **Sí**: `lib.rs:212` publica `derive_filtered_views(...)` entero en `snapshot.derived` | `engineSuggestions.combatDamage` lo detecta. **No se implementa un predictor**: la sugerencia, si se muestra, será la del motor. |
| `DerivedViews::mana_ability_payment`, `named_choice_suggestions` | **Sí** | Detectados y contados, no interpretados. |
| `previewManaPayment` (`manaPaymentPreview.ts`) | **NO**. `EngineClient` sólo expone `INIT(1)`, `ACTION(2)`, `VIEW(4)`, `E2E_SCENARIO(5)`; el WASM no tiene una operación de preview. | **Carencia documentada.** No se simulan fuentes, costes ni resultados. |
| `CastPaymentMode::AutoExceptSacrificialMana` | **Sí**, como campo del DTO `GameAction.data.payment_mode` | Se ofrece bajo demanda como preferencia avanzada derivada de un `CastSpell` legal, sin preview. |
| `PriorityPassingMode` + `SetPriorityPassingMode` | **Sí**, cuando el motor publica la acción | `AdvancedControls` la ofrece si aparece en `legal.actions`; nunca la inventa. |
| `consumes_source` | **Sí**, en `GameObject.abilities[]` | `cardConsumesSource()` bloquea el auto-despacho por inspección. |

---

## 3. Baseline medible

El baseline se mide **con la misma prueba, el mismo WASM E2E y los mismos fixtures** que el resultado; sólo cambia la interfaz. El job `ux-evidence` de `ci.yml`:

1. descarga `mtg-engine-wasm`, `mtg-engine-wasm-e2e` y `e2e-scenario-fixtures` de la misma run;
2. crea un `git worktree` del commit base `dd531f46…` y le sirve esos artefactos en `:5174`;
3. ejecuta `tests/e2e/ux-decision-evidence.spec.ts` dos veces (`MESA_UI_VARIANT=after|baseline`) y guarda `evidence/{variant}/metrics.json` + capturas;
4. `scripts/ux-decision-compare.ts` publica `evidence/comparison.json` y `COMPARACION.md`.

Variables medidas por par (viewport × escenario × tema):

`visibleControls`, `primaryControls`, `secondaryControls`, `totalControls`,
`advancedStopsVisible`, `effectiveTouchTargets` (≥44 px), `smallestTouchTarget`,
`panelHeight`, `panelArea`, `boardArea`, `boardSharePercent`,
`interactionsNeeded` y `legalActionsAccessible`. «Visible» se decide con
`Element.checkVisibility()`: un `<details>` plegado conserva cajas de layout en
Chromium (`content-visibility`), así que medir sólo `getBoundingClientRect()`
contaría como expuestos los controles que el jugador no puede ver.

Escenarios: `priority-empty` y `target-cast`. Viewports: 320×844, 375×844,
390×844, 768×900, 1440×900 y 844×390. Temas claro/oscuro en `classic` (donde el
tema manda), matriz en `arena` (donde viven las paradas). Teclado, táctil y axe
en 390×844.

**Gate de integridad, no de estética:** `totalControls` y
`legalActionsAccessible` nunca bajan, `interactionsNeeded` nunca sube y
`advancedStopsVisible` nunca sube. La reducción de `visibleControls` se informa,
no se impone: el briefing prohíbe exigir una reducción arbitraria donde hay
decisiones estratégicas distintas. En una ventana de una sola acción es legítimo
ganar el disclosure que abre las demás opciones.

Las capturas se nombran `variant/viewport-escenario.png`, `variant/tema-*.png` y
quedan fijadas a los SHA que `metrics.json` publica (`baselineSha`, `afterSha`).
Se publican como artefacto `ux-decision-evidence` de la run de CI, no se
copian al árbol: un commit nuevo con las imágenes reiniciaría la propia
validación que las produce.

---

## 4. Arquitectura de interacción

```
EngineSnapshot (Phase, WASM)
        │  legal.actions · legal.by_object · waiting_for · state · derived
        ▼
decisionProjection.ts        ← función PURA, sin DOM ni session
        │  DecisionProjection
        ├── context        → DecisionContext.svelte   (información)
        ├── primary        → PrimaryAction.svelte     (acción dominante)
        ├── tiers.strategic/secondary/advanced/cancel
        │                  → DecisionTiers.svelte     (divulgación progresiva)
        │                  → AdvancedControls.svelte  (paradas, modo, auto-pass)
        └── integrity      → auditoría y gate
        ▼
DecisionPanel.svelte        ← orquestador delgado: conserva la cadena de
                              ~100 componentes especializados y el despacho
        ▼
session.dispatch(action)    ← busy, stale_action, rechazo, reintento, hotseat
```

Seis superficies exigidas: **información contextual** (`DecisionContext`),
**acción principal** (`PrimaryAction`), **elecciones estratégicas**, **acciones
secundarias**, **controles avanzados** y **cancelación** (las cuatro últimas en
`DecisionTiers`). La cancelación se pinta **fuera** del `<details>` para que una
acción de seguridad nunca dependa de abrir un panel.

Invariantes:

- `projectDecision` no crea acciones que el motor no publicó, salvo dos
  derivaciones declaradas: el borrador local de combate (`attackDeclaration` /
  `blockDeclaration`, ya existentes) y las preferencias de pago (`manualCast` y
  `AutoExceptSacrificialMana`) derivadas de un `CastSpell` legal.
- `specialistActive` impide que una ventana compleja reciba un botón principal
  engañoso. Con una carta seleccionada y la pila vacía, `suppressPrimary` deja
  que la superficie de la carta siga siendo dominante; con hechizos pendientes
  conserva «Pasar · permitir respuestas» como acción principal.
- `integrity.unclassified` debe ser `[]`. Un test recorre los más de cien tipos
  de `SPECIALIST_DECISIONS` y otro comprueba que `DecisionPanel.svelte` sigue
  declarando la lista `REPRESENTED` completa: **no se reduce cobertura de
  `WaitingFor`**.

---

## 5. Implementación por flujo

**A. Prioridad y fases.** `DecisionContext` responde de quién es el turno, quién
tiene prioridad, qué fase hay y qué información necesita el jugador. El botón
principal distingue `Pasar` (pila vacía), `Pasar · permitir respuestas` (pila
con hechizos) y `Confirmar pago`. La consecuencia dice explícitamente que
**una sola cesión no garantiza un cambio de fase** y que un hechizo sólo se
resuelve cuando todos pasan. No se promete «avanzar de fase» ni «terminar
turno»: ésas son consecuencias que decide Phase.

**B. Combate.** La selección directa sobre el tablero no se toca. El borrador
local produce `Confirmar ataque (N)` / `No atacar` y `Confirmar bloqueos (N)` /
`No bloquear`, con las obligaciones y requisitos que publica el motor
(`attacker_constraints`, `block_requirements`). Las declaraciones completas que
Phase ofrece siguen en el nivel estratégico. `combat_damage_suggestion` está
disponible en `derived` pero **no se consume**: no hay predictor propio.

**C. Objetivos.** Se conserva la lista accesible (`details[data-target-list]`),
se elimina la instrucción redundante y el progreso `Objetivo i de n` se lee de
`selection.current_slot` + `target_slots` + `mode_labels`, publicado también en
`[data-decision-progress]`. Los objetivos legales siguen resaltados en el
tablero (◎).

**D. Maná.** El pago automático no obliga a abrir nada: la acción principal de
la ventana de pago es `Confirmar pago`. «Elegir maná manualmente» pasa a la capa
secundaria (`data-tier="secondary"` en la carta seleccionada; preferencia en
`DecisionTiers` cuando no hay selección). Se añade «Evitar fuentes
sacrificiales» como `AutoExceptSacrificialMana`. **No se previsualiza nada**:
el ABI no expone `previewManaPayment` (§2.3).

**E. Controles avanzados.** `AdvancedControls` muestra auto-pass, paradas
activas, la recomendación de Phase y los `SetPriorityPassingMode` que el motor
ofrezca (Estándar / Saltar ventanas de poco uso / Control total). Las doce
paradas siguen en `PhaseStopBar` con sus `aria-pressed` y `aria-current`, ahora
bajo `<details data-advanced-controls>`; `MobilePhaseChip` conserva su hoja.
**No se define una política nueva de automatización**: eso es UX-PRIORITY.

---

## 6. Integridad

- **Cobertura `WaitingFor`:** la cadena de especialistas de `DecisionPanel` no
  se modifica. Test de cobertura sobre `SPECIALIST_DECISIONS`.
- **KeepExactPermanentsChoice:** la semántica UP-133 (`minimum_count` suelo,
  `required_count` techo sin recortar) sigue en `KeepExactPrompt`; la proyección
  la marca como obligatoria y `specialistActive`, sin auto-selección. Test con
  `minimum_count` `null`, `0` y `2`.
- **UX-HAND:** `inspect` sigue separado de `selected`; `CardActionMenu`,
  `HandSheet` y el gate de Playwright no se tocan. El driver compartido se
  amplió para reconocer `[data-decision-primary]` además de `.confirmations`.
- **Cycling / channel:** `cardConsumesSource` lee `consumes_source` del motor
  (espejo de `requiresConfirmation`) y marca la acción como
  `confirmation: 'card-consuming'`; nunca llega a `primary`.
- **Transporte:** `busy`, `stale_action`, rechazo, reintento y cancelación siguen
  en `session.dispatch` / `classifyDispatch`. La cancelación es visible sin
  desplegar nada. La privacidad hotseat sigue en `needsHandoff` y se ejerce con
  el fixture `privacy-handoff`. El aislamiento WASM y el rechazo de la operación
  5 en producción siguen en `engine:verify-no-e2e-op`.
- **Capa de los fixtures de error:** `ux-decision-transport.test.ts` contiene
  seis fixtures guionizados (`worker-muerto`, `sin-respuesta`,
  `stale-revisitado`, `invalid-action`, `rechazo-explicito`, `sin-motor`) que
  **declaran su capa: transporte/despacho**, no motor. No restauran
  `GameState` ni usan el WASM; comprueban `classifyDispatch` y que un error
  nunca se convierte en «aceptado» ni altera la proyección. El aislamiento del
  WASM y el rechazo de la operación 5 se verifican por separado en CI.

---

## 7. Escenarios `GameScenario` (harness de #72)

`crates/mtg-engine-wasm/src/bin/e2e_scenarios.rs` amplía los cuatro fixtures de
UX-HAND hasta **once estados exactos**. Los estados se fijan con `GameScenario`
y, para las ventanas exactas, se parchea el `GameState` serializado y se valida
la variante `WaitingFor` con un round-trip a través del `Deserialize` del motor
(`GameState` sólo deriva `Serialize`): una ventana que Phase no aceptaría falla
en el job Rust, no en el navegador. No se recorren turnos ni se depende de
barajadas.

| Fixture | Estado exacto | Capa |
| --- | --- | --- |
| `priority-empty` | `PreCombatMain`, `Priority`, pila vacía, Rayo en mano | motor real |
| `priority-stack` | Rayo + maná rojo; el navegador lanza y ejecuta las prioridades reales hasta resolver | motor real |
| `opponent-turn-response` | `active_player=1`, prioridad de P0, ventana `Priority` | motor real |
| `declare-attackers` | Dos criaturas reales, `DeclareAttackers` con `valid_attacker_ids` | motor real |
| `declare-blockers` | Declaración de atacantes aplicada por `GameRunner`, ventana `DeclareBlockers` | motor real |
| `target-cast` | Rayo en mano + maná (selección de objetivos al lanzar) | motor real |
| `manual-payment` | Rayo + Mountain sin maná en reserva | motor real |
| `obligatory-decision` | `KeepExactPermanentsChoice` exacta (obligatoria) | ventana exacta |
| `optional-decision` | `OptionalEffectChoice` con descripción del motor | ventana exacta |
| `cancel-cast` | Lanzamiento pendiente con cancelación legal | motor real |
| `privacy-handoff` | Manos privadas distintas (UX-HAND) | motor real |

`obligatory-decision` y `optional-decision` son **ventanas exactas**: validan la
superficie, la cobertura y la ausencia de auto-selección; no fabrican un frame de
resolución que el estado no tiene. Las consecuencias de motor se verifican en los
flujos con pipeline completo (prioridad, lanzamiento, objetivos, pago, combate).

---

## 8. Validación UX y CI

- **Local (este entorno):** `bun run check` 0 errores / 2 avisos preexistentes,
  `bun test src/lib` **846 pass / 0 fail / 4580 expects**, `bun run build`, `playwright --list`
  317 pruebas en 27 ficheros, YAML de workflows parseado. No hay `cargo`,
  `rustc` ni Chromium aquí: la compilación Rust/WASM, la paridad, los escenarios
  y el navegador los emite GitHub CI.
- **GitHub CI:** `Mesa CI` (static, paridad nativa, WASM, Chromium con gate de
  Playwright y 60 min de techo tras añadir once pruebas de transición real),
  `Phase source regressions` y el job nuevo **`ux-evidence`**. El marcador de
  las pruebas de evidencia es `MESA_EVIDENCE_UX_DECISION`: un `EVIDENCIA` simple
  también habría excluido los siete tests de `arena-quality-gate` cuyo título
  termina en «y evidencia».
- **Gate de pruebas huecas:** `scripts/e2e-summary.ts` exige que las once
  pruebas funcionales de UX-HAND y las once de `ux-decision.spec.ts` ejecuten y
  pasen en Chromium; una omisión, un reintento que acaba en verde o un informe
  sin esas filas hace fallar el job. El contrato se prueba sin navegador en
  `ci-e2e-summary.test.ts`. `ux-decision-evidence.spec.ts` queda fuera de esta
  lista porque su gate es la comparación de métricas del job `ux-evidence`.
- **Chromium real:** seis viewports, claro/oscuro, teclado (Tab + Enter con
  transición real), táctil (`hasTouch`, un toque con transición real) y axe
  (sin violaciones `critical`/`serious`).
- **Capturas antes/después:** fijadas a `baselineSha` y `afterSha` en cada
  `metrics.json`, publicadas como artefacto `ux-decision-evidence` de la run de
  CI (no se copian al árbol: hacerlo exigiría descargar el artefacto y crear un
  commit nuevo que reiniciaría la propia CI). `COMPARACION.md` y
  `comparison.json` viajan en ese mismo artefacto; sus cifras se publican
  también como anotaciones del check-run.
- **Sin pruebas huecas:** cada flujo de `ux-decision.spec.ts` comprueba
  `data-actions-applied`, `data-waiting`, `data-empty` de la pila o la vida del
  rival, nunca sólo la presencia de un botón.

---

## 9. Riesgos y limitaciones

1. **Sin `previewManaPayment`.** El ABI no expone la operación. Mesa no muestra
   fuentes previstas ni «maná sacrificial evitado» como resultado; sólo ofrece el
   modo del DTO. Cerrar la brecha requiere una operación nueva en el puente WASM
   (fuera de esta entrega, que prohíbe cambios de reglas/ABI de producción).
2. **`combat_damage_suggestion` disponible pero no consumida.** Se detecta su
   presencia para no construir un predictor paralelo; mostrarla con garantías es
   trabajo futuro.
3. **Ventanas exactas obligatoria/opcional.** Se fijan por round-trip validado,
   pero no incluyen el frame de resolución; sus consecuencias no se ejecutan en
   esos dos fixtures.
4. **Automatización.** Standard / SkipLowUseWindows / FullControl y los ámbitos
   de parada se conservan y se reorganizan; la política completa pertenece a
   UX-PRIORITY.
5. **Evidencia generada en CI.** Las capturas y la comparación cuantitativa no
   existen en el árbol hasta que `ux-evidence` termina; el baseline usa la UI
   del commit base con el WASM y los fixtures de esta PR, lo cual se declara en
   cada `metrics.json`.
6. **Sin navegador local.** Cualquier fallo de Chromium se corrige en la propia
   PR usando GitHub CI, sin fusionar ni desplegar.

---

## 10. Roadmap

Ver [`docs/ROADMAP.md`](ROADMAP.md). UX-PRIORITY queda como la continuación
natural: política de automatización, preview de pagos en el ABI y consumo de la
sugerencia de daño de Phase.
