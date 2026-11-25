# UX-HAND 1.0 — la mano del teléfono como superficie de primera clase

Referencia de diseño: la hoja **HAND** de Phase en el pin `31123e2` (`client/src/components/hand/MobileHandDrawer.tsx`), no su `DecisionPanel`. Mesa la adopta como idea —panel a pantalla completa, rejilla de cartas grandes, tocar para actuar— y se aparta de ella en dos puntos decididos con evidencia (§3).

Sin dependencias nuevas de interfaz. Svelte 5 + TS. Textos en es-419.

---

## 1. Baseline medido (Chromium real, fixture `/stress`, antes del cambio)

Fixture determinista de interfaz, 15 cartas, sin motor (el fixture no publica acciones legales). `@sparticuz/chromium` 131 desde npm con sus libs `al2023`, porque el CDN de Playwright y los artefactos de Azure están bloqueados en el entorno.

| Viewport | Cartas visibles | Ancho de carta | Desbordamiento horizontal | Desplazamiento lateral |
|---|---|---|---|---|
| 390×844 | 2 | 147 px | 0 (del documento) | **1 988 px** dentro del cajón |
| 375×844 | 2 | 140 px | 0 | 1 890 px |
| 320×844 | 2 | 112 px | 0 | 1 533 px |
| 844×390 | 5 | 148 px | 282 px | 760 px |

Con 7 cartas a 390×844 el cajón medía 78dvh y **tapaba el panel de decisión**; jugar exigía tres interacciones (abrir → tocar la carta, que cerraba el cajón y enfocaba un botón → pulsar «Lanzar»), y el cajón se cerraba justo para que se pudiera pulsar. Inspeccionar una carta de la mano no era posible desde el cajón: sólo con «Ampliar carta» en el panel.

## 2. La hoja nueva

`HandSheet.svelte` (superficie) + `HandSheetCard.svelte` (una carta). Se monta junto al disparador, fuera del `main` que el tablero marca `inert`.

- **Pantalla completa** (`inset: 0`, `100dvh`), con `env(safe-area-inset-*)` en los cuatro lados.
- **Rejilla** `repeat(auto-fill, minmax(min(132px, 100%), 1fr))`: dos columnas a 320/375/390 px, tres a 640, seis en horizontal a 844×390. Scroll **vertical** con `overscroll-behavior: contain`.
- **Inspeccionar y ejecutar dejan de compartir gesto**: tocar la cara de la carta abre un panel de detalle (texto Oracle + acciones legales); **lanzar es un botón propio de 44 px** con etiqueta (`Lanzar`, `Jugar tierra`, `Activar`, `Producir maná`). Sin lanzamientos accidentales.
- **Autoridad única**: cada acción sale de `snapshot.legal.by_object` y cada despacho pasa por `session.dispatch` (cola propia, `busy`, `stale_action` → re-view). No hay estado de juego en TS ni una segunda lista de legalidad.
- **Foco**: al abrir entra en la superficie; Escape cierra el detalle y luego la hoja; al cerrar, el foco vuelve al disparador (también si la hoja se cierra sola al agrandar la ventana).

## 3. Donde Mesa se aparta de Phase, con la razón

Phase abre un modal de elección aparte para las cartas con varias acciones y esconde las no jugables tras una pulsación larga. Aquí:

1. **Las acciones viven en el detalle, no en un modal.** El detalle también lleva el texto Oracle, así que inspeccionar y ejecutar ocurren en la misma superficie sin competir por el gesto — es el requisito de «distinguir inspeccionar de ejecutar» sin añadir un segundo diálogo.
2. **La carta inactiva no se esconde.** Un `role="status"` visualmente oculto dice «Sin acción ahora» y la carta queda sin anillo. Medido: una fila de 44 px «Sin acción ahora» bajo cada carta inactiva costaba una fila entera por pantalla (15 cartas a 390×844: 2 148 px de scroll, 4 visibles). Al ocultarla visualmente: **1 758 px y 4-6 visibles** según ancho.

## 4. Después

| Viewport | Cartas visibles | Ancho de carta | Desbordamiento horizontal | Scroll vertical | Toque efectivo |
|---|---|---|---|---|---|
| 320×844 | 6 de 15 | 146 px | 0 | 1 366 px | 6/6 |
| 375×844 | 4 de 15 | 174 px | 0 | 1 674 px | 6/6 |
| 390×844 | 4 de 15 | 181 px | 0 | 1 758 px | 6/6 |
| 844×390 | 6 de 15 | 132 px+ | 0 | 567 px | 6/6 |

«Toque efectivo» = `elementFromPoint` en el centro de cada carta devuelve la carta, no una caja delimitadora. Antes de corregir el `z-index` (la hoja y el `.hand-zone` compartían 60 y el segundo pintaba encima) daba 2 de 4.

Escritorio intacto: a 768/1440 px sigue mandando el abanico (`wideFan`), y las suites de abanico, escena y desbordes pasan con el mismo número de cartas.

## 5. Defectos encontrados midiendo

- **Hoja por debajo del cajón viejo.** Mismo `z-index: 60`, el `.hand-zone` posterior en el DOM ganaba: `elementFromPoint` devolvía el cajón. Ahora 70.
- **La rejilla desbordaba 23 px a 320 px.** `CardView compact` dimensiona con `calc(var(--card-w) * .78)` y la fila de herramientas («Ampliar» 53 px + «Reintentar imagen» 109 px) medía 169 px en una columna de 146. Se fija el ancho de la tarjeta y la hoja conserva «Ampliar» sin la fila de reintento.
- **El cajón viejo reaparecía al abrir la hoja**, con sus flechas, su pista y una segunda copia tabulable de la misma mano. Se retira en la vista angosta: la zona queda montada y colapsada, sin `sheet-open`, y el `overflow` que alimenta flechas y pista ya no se calcula en móvil.
- **La pista «Hay más cartas fuera de la vista» desapareció del escritorio** al atarla al abanico: `useFan` es falso con 30 cartas. Se ata a la presentación en línea, no al abanico.
- **El foco quedaba en `<body>`** al cerrar la hoja con Escape. Ahora vuelve al disparador por efecto, no dentro de la función de cierre.
- **`Board.svelte` robaba el foco a la hoja** (encontrado por Mesa CI, no aquí): un efecto antiguo enfocaba `#mesa-hand-sheet .hand-scroll` —el scrollport en línea, colapsado a 1 px en el teléfono— y, al ejecutarse después del `tick` de la hoja, sacaba el foco de los diálogos a un elemento invisible. Se retira: el foco de la hoja es de la hoja.
- **El contrato de foco al jugar no era evidente.** `arena-touch-play` exige que, al lanzar, el foco quede en la acción que la carta desbloqueó, no en el disparador. Ahora `play()` enfoca ese botón antes de cerrar y `Hand.svelte` no recoloca el foco si hay un destino deliberado.

## 6. Integridad

- Carta que sale de la mano → el detalle se cierra solo: se resuelve contra el snapshot actual, no contra una copia.
- Doble pulsación → `session.busy` deshabilita el botón y `quickPlay`/`play` salen antes; el motor sigue siendo quien rechaza una revisión obsoleta.
- Mano vacía → «Tu mano está vacía», sin rejilla ni desbordes.
- Rotación → a 844×390 la hoja sigue a pantalla completa y gana columnas.
- Cambio de asiento → `session` ya resetea `selected`/`inspect`; la hoja sólo lee el snapshot vigente.
- Privacidad: la hoja nunca muestra cartas ocultas ni la mano contraria (aserción con motor real en CI).

## 7. Evidencia

Ejecutado aquí (sin motor): `arena-hand-sheet` 12 pasan / 3 omitidos con motivo (las mismas tres corren en CI con el motor); `arena-quality-gate` 7/7 (axe en 320/375/390/768/844/1024/1440); `hand-overflow-evidence` 6/6; `arena-card-tools-reachability` 2/2; `arena-hand-fan`, `arena-zones`, `visibility`, `ux-themes`, `arena-phone-footer` 29/29; `bun test src/lib` 790/790; `bun run check` 0 errores; `bun run build` correcto; axe-core 0 violaciones en claro/oscuro a 320 y 390.

`arena-touch-play` se reescribió para el contrato nuevo: antes codificaba el flujo de tres pasos (tocar la cara → enfocar un botón del panel → pulsarlo), que es justo lo que la hoja sustituye. Ahora comprueba que **una** pulsación en la acción de la carta cambia el estado del motor (revisión, mano −1, campo +1), que el tablero deja de estar `inert`, y que con teclado la hoja se cierra y el foco queda en un control real, nunca en `<body>`.

Ejecutado en Mesa CI con motor real: **run 45367492765, los cuatro jobs verdes** — typecheck + unitarios + build estático (41 s), paridad nativa y mecánicas (7 m 55 s), WASM con Rust y lockfile fijados (16 m 8 s) y **Chromium con la partida real (26 m 17 s)**.

Ese job no salió verde a la primera, y lo que encontró vale más que el resultado: cuatro runs seguidos midieron `arena-viewport-matrix`, `arena-mobile-drawer` y `arena-touch-play` en rojo. Las causas, todas corregidas: `Board.svelte` robaba el foco a la hoja (dos manejadores de Escape y un efecto que enfocaba el scrollport colapsado); la hoja interceptaba Escape de un `<dialog>` nativo; y `arena-touch-play` seguía codificando el flujo de tres pasos que esta misión sustituye. Nada de eso era observable en este entorno sin WASM.

No ejecutado aquí: `arena-touch-play`, `arena-mobile-drawer`, `arena-viewport-matrix`, `arena-ui` y las dos pruebas de motor de la hoja. Todas navegan a `/?autostart` y necesitan `static/wasm/mtg_engine_wasm.wasm`; compilar Rust está fuera de esta misión y el artefacto de CI está en Azure, bloqueado. Corren en Mesa CI. No se presenta su resultado como evidencia local.

Capturas en `docs/screenshots/ux-hand/`: hoja 390×844 claro/oscuro, 320×844, 844×390 y detalle de inspección.

## 8. Límites conocidos

- Con 15 cartas y 4-6 visibles por pantalla, siguen haciendo falta dos o tres gestos de scroll; es el precio de cartas de 146-181 px en vez de 112-147.
- Dos columnas a 320 px es lo máximo que cabe sin bajar de 132 px de carta.
- El detalle reutiliza el texto del motor (inglés) cuando existe; el texto publicado en español se sigue mostrando en la cara de la carta vía `impressions`.
- Las pruebas con motor real no se pudieron ejecutar en este entorno: quedan como contrato para CI, no como resultado.

---

# UX-HAND 1.1 — integridad de interacción

Tres defectos del código de 1.0, cada uno con su RED ejecutado antes del arreglo.

## A. Acciones ambiguas (P0)

`quickPlay` elegía con tres `find` independientes —PlayLand, un único CastSpell, una única ActivateAbility— lo que no demuestra que exista **una** acción, sino que existe una de cada categoría. Con un lanzamiento *y* una activación despachaba una de las dos sin preguntar.

- **RED**: `src/lib/game/__tests__/hand-sheet-actions.test.ts` → `Cannot find module '../handSheetActions.ts'`, 0 pasan.
- **Arreglo**: `src/lib/game/handSheetActions.ts` proyecta `legal.by_object` en `{ quick?, choices, manualPayment }`. `quick` existe **solo** si hay exactamente una acción publicada. La hoja muestra `Elegir (n)` cuando hay varias y cada control del detalle lleva su etiqueta real (`Lanzar`, `Jugar tierra`, `Activar`, `Producir maná`), con `· alternativa` para la segunda cara del mismo lanzamiento.
- No se duplica ninguna regla: la lista es literalmente la de Phase, y el juicio de maná sigue siendo `isManaPrompt`/`manaActions`.
- **GREEN**: 9/9 en la prueba unitaria; E2E `una carta con lanzamiento y activación no se ejecuta de un toque` verifica que pulsar abre el detalle con las dos acciones y **no** despacha nada.

## B. Habilidades invisibles (P0)

`isManaAction` cuenta `ActivateAbility` como maná; `manaActions` la excluye fuera de ventana de maná; el detalle filtraba con `!isManaAction(a)`. Una habilidad activada desde la mano no aparecía en **ninguna** de las dos listas.

- **RED**: `una habilidad activada fuera de ventana de maná sigue siendo una acción` y `en una ventana de maná… no se duplica`.
- **Arreglo**: una sola lista (`choices`), sin segundo filtro. El maná se marca con el mismo criterio que ya usa `manaActions` (taps siempre; `ActivateAbility` sólo dentro de ventana). Deduplicación por forma JSON, igual que `manaActions`.
- **GREEN**: E2E `una habilidad activada sigue visible y accionable` (fixture con `ActivateAbility` explícita) y `la proyección no duplica ni pierde acciones publicadas`.

## C. Resultado explícito del despacho

La hoja deducía éxito de que la revisión subiera. Tras `stale_action` el re-view mueve la revisión, así que un rechazo podía parecer aceptado.

- **RED**: `src/lib/game/__tests__/dispatch-outcome.test.ts` (5 casos, incluido "el resultado nunca depende de que la revisión suba").
- **Arreglo**: `classifyDispatch` → `accepted | stale | rejected | failed | unavailable`. `session.dispatch` devuelve `Promise<DispatchOutcome>` (antes `void`; ningún consumidor leía el valor, y el tutorial sólo lo usa para esperar). La hoja **sólo cierra** con `accepted`; en los demás casos queda abierta, muestra el mensaje del motor en `role="alert"` dentro de la hoja y la acción sigue ahí para reintentar.
- El bucle de 20×25 ms para el foco se sustituyó por una transición determinista: cerrar, `tick()`, y dos `requestAnimationFrame` para enfocar la acción que desbloqueó la jugada, ya sin `inert`.
- **GREEN**: los 6 casos unitarios; E2E `cancelar o rechazar deja el error visible y permite reintentar` (motor real) y la prueba de doble pulsación, que ahora exige **exactamente +1** en `data-actions-applied`.

## D. Pruebas que no pueden pasar vacías

- **Fixture con legalidad explícita**: `/stress?actions=1` publica un `legal.by_object` escrito a mano (tierra, lanzamiento, lanzamiento+activación, dos caras, activación sola, nada) y responde despachos con un cliente guionizado. No evalúa reglas: existe para probar los contratos de la hoja. `HandSheet` sólo lee `legal.by_object` y `session`.
- **Guarda dura de motor**: las pruebas de WASM ahora **fallan** si el motor no está (`MESA_ENGINE_REQUIRED=0` permite omitirlas a propósito). El skip silencioso desapareció.
- Se retiraron las que podían pasar vacías: el `return` temprano de la prueba de lanzamiento, el `void revision`, y el `skip` cuando no había acciones.
- La revisión que se mide es `data-actions-applied` de `Board.svelte` (contador del motor), y la prueba comprueba que **se mueve** al aplicar una acción.
- Doble pulsación: `dblclick` sobre una acción legal + `+1` exacto de `data-actions-applied`.
- Cambio de asiento con hoja y detalle abiertos: se cierra, se usa la compuerta de handoff (o `Pasar`), y se exige que el detalle anterior no sobreviva y que la mano sea la del asiento nuevo.
- Objetivos, pago manual y cancelación/rechazo: con motor real.
- **Orden de Tab y Shift+Tab**: se recorre y se comprueba que cada paso queda dentro de la hoja. Medido: la mano colapsada mantenía 36 controles enfocables (scrollport, cartas, "Ampliar", "Reintentar"), es decir una segunda copia invisible de la mano en el orden de teclado. Ahora la zona es `inert` en vista angosta.

### Dos defectos que sólo aparecieron escribiendo esta prueba

1. **La mano colapsada era navegable.** `inert` lo arregla. Un `aria-hidden` añadido por mi parte además vaciaba `role=region` y hacía desaparecer siete cartas del árbol accesible a 320 px: se retiró, porque el contenedor es accesible y la parte operativa está inerte.
2. **El foco de apertura dependía de un `tick` que aún no tenía el elemento**: se capturaba `sheetEl` en el cuerpo del efecto, cuando sigue siendo `undefined`, y el foco se quedaba en `<body>`. Ahora se lee dentro del callback diferido.

## E. Estado y RED/GREEN por prueba

| Suite | Local (sin motor) | CI (motor real) |
|---|---|---|
| `hand-sheet-actions.test.ts` (nueva) | 9/9 | — |
| `dispatch-outcome.test.ts` (nueva) | 6/6 | — |
| `arena-hand-sheet` (fixture + teclado) | 16 pasan | — |
| `arena-hand-sheet` (motor) | 7 fallan a propósito sin WASM | **verdes** (corrida `45519898929`) |
| `arena-quality-gate` | 7/7 | — |
| `hand-overflow-evidence` | 6/6 | — |
| `arena-card-tools-reachability` | 2/2 | — |
| `arena-hand-fan` | 3/3 | — |
| `visibility` | 10/10 | — |
| `ux-themes`, `a11y`, `arena-zones` | verdes | — |
| `arena-phone-footer` | 9 fallan **también en `main`**: exigen motor | — |
| `arena-mobile-drawer`, `arena-touch-play`, `arena-viewport-matrix`, `arena-ui` | exigen motor | verdes en CI |

**CI final: `45519898929`, 4/4 verdes** (Chromium 24m12s, Native 7m04s, WASM 16m04s,
Typecheck 45s). Un job verde aquí *no* puede significar "nada corrió": `realGame`
lanza cuando falta el motor y CI no define `MESA_ENGINE_REQUIRED`, que es la única
palabra que permite omitir. Verde = las siete pruebas de motor se ejecutaron.

`bun test src/lib` 805/805, `bun run check` 0 errores, `bun run build` correcto.

RED conservados: módulo ausente (A, B) y clasificador ausente (C), más tres RED ejecutados (foco de apertura, orden de Tab, `role=region` vacío a 320 px) que sólo se manifiestan en navegador.

## F. Por qué las pruebas de motor tardaron tres corridas en llegar a la acción

La primera versión de los helpers pulsaba controles que el producto no ofrece
en ese instante y, peor, usaba **"Pasar" para buscar justamente la ventana que
ese pase descarta**. Tres corridas de CI lo dejaron claro:

| Corrida | Resultado Chromium | Anotaciones |
|---|---|---|
| `45492219560` | rojo | 8 — regresión `inert` en `arena-ui` y helper sin conservar manos |
| `45502566531` | rojo (37m55s) | 7 — ninguna acción legal alcanzada |
| `45511464839` | rojo (28m44s) | **2** — sólo supuestos frágiles míos |

La corrección no fue un parche al helper sino copiar el camino que
`arena-touch-play` ya tenía verde: conservar la mano en los dos asientos pasando
el dispositivo, **dejar la hoja abierta** y esperar a que la ventana de
prioridad llegue sola, y cambiar de asiento pasando prioridad desde el panel en
lugar de buscar un botón de handoff que sólo existe cuando el motor ya cambió.

Los dos fallos restantes eran ambos supuestos de la prueba, no del producto:

1. **Objetivos** exigía `[aria-label="Lanzar"]`, que en una carta con dos caras
   no existe: esa carta abre la elección. Ahora la prueba pide un lanzamiento de
   una sola forma y, si la mano real no tiene ninguno, lo anota y se omite en vez
   de afirmar lo contrario.
2. **Rechazo** esperaba a que apareciera un error. Ahora provoca el despacho
   duplicado a propósito y comprueba el contrato: o la hoja se cerró porque el
   motor aceptó, o hay `.sheet-error` con reintento y descarte.

El contrato de ambigüedad que había metido en la prueba de geometría (a 320 px
el fixture no publica legalidad, así que no hay cartas ambiguas) se retiró de
ahí: ya lo cubre `legalidad explícita`, donde la fixture sí publica acciones.
