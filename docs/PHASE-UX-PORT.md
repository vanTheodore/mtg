# Puerto de la UI/UX de Phase a Svelte — capa de mesa

**Fecha:** 7 de noviembre de 2026 · **Base:** `main` @ `b862aaa`

Esta ronda traspasa a Svelte/SvelteKit tres piezas del cliente de Phase que
todavía eran texto o no existían en Mesa:

1. **Líneas de objetivo, pila y combate** dibujadas sobre la mesa.
2. **Pilas de zona interactivas** (biblioteca, cementerio, exilio) con visor.
3. **Contadores del asiento** que Phase publica y la barra no mostraba (veneno,
   energía).

No se copió React, framer-motion, Zustand, Tailwind ni los portales de Phase.
Lo que se reutiliza es la **geometría** y el **contrato de datos**; la
implementación es Svelte 5 con runas y módulos TypeScript puros.

## Referencia upstream

| Phase (`client/src/…`) | Mesa (Svelte) | Qué se conservó |
| --- | --- | --- |
| `targeting/arcPath.ts` | `src/lib/ui/arc.ts` | Curva cuadrática con punto de control en la mediatriz, offset 30 % de la distancia, tope de 80 px y guarda para extremos coincidentes |
| `targeting/TargetingOverlay.tsx` | `BoardOverlay.svelte` + `ui/board-lines.ts` | Arcos desde el origen del lanzamiento a **cada objetivo legal** que publica el motor |
| `board/AttackTargetLines.tsx` | idem | Atacante → jugador/planeswalker/batalla; el atacante bloqueado va a trazos |
| `board/BlockAssignmentLines.tsx` | idem | Bloqueadora → atacante desde `blocker_to_attacker` (no un campo `blockers` que Phase no envía) |
| `stack/StackTargetArcs.tsx` | idem | Objeto de la pila → objetivos declarados (`derived.stack_entry_details`) |
| `zone/LibraryPile.tsx`, `GraveyardPile.tsx` | `ZonePile.svelte` | Pila abrible con recuento del motor |
| `zone/ZoneViewer.tsx` | `ZoneViewer.svelte` | Visor de zona con las cartas que el motor proyectó y foco devuelto al cerrar |
| `board/CommanderDamage.tsx`, `PTBox.tsx`, `KeywordStrip.tsx` | `PlayerPanel.svelte` (contadores) | Sólo los contadores de veneno/energía; el resto sigue pendiente |

Commit de referencia del port: `f67169218fa9f5dec439b9024906b891a926210e`
(v0.119.0), licencias MIT OR Apache-2.0. La atribución queda también en el
encabezado de cada archivo portado.

El motor ya está en `1038a9d0` (v0.120.0, ver
[`PHASE-UPSTREAM-2026-11-07-1038A9D.md`](PHASE-UPSTREAM-2026-11-07-1038A9D.md)),
pero la geometría que se portó —`stack/StackTargetArcs.tsx`, `targeting/arcPath.ts`,
las líneas de ataque y bloqueo— **no cambió en esos 7 commits**, así que el port
sigue siendo fiel al componente original. Lo nuevo del cliente upstream es la
interfaz de *Horde*, que Mesa no expone y no se ha portado.

## Contrato: la capa no decide nada

- **El motor dibuja las líneas.** Un arco sólo existe si el objetivo está en
  `waiting_for.data.selection.current_legal_targets` o en las acciones
  `ChooseTarget` de esa instantánea; si no, no hay línea. Los borradores locales
  de ataque/bloqueo (`session.attacks`/`session.blocks`) se distinguen con
  `data-kind="attack-draft"`/`"block-draft"` y trazos, para que nadie confunda
  una intención con una declaración.
- **Nada de reglas en TypeScript.** `board-lines.ts` proyecta puntos; no evalúa
  legalidad, no filtra por tipo de carta y no inventa objetivos.
- **Información oculta.** La biblioteca nunca se reconstruye: el visor muestra
  el recuento y, si el motor reveló una carta (`display_visible_to_viewer`), esa
  carta. En el paso de asiento la capa no se dibuja (`needsHandoff`) y el
  tablero está `inert`.
- **Decorativa para lectores de pantalla.** El SVG es `aria-hidden="true"` y
  `pointer-events: none`: los mismos objetivos ya se anuncian en la carta, el
  botón del asiento y el panel de decisión. Una segunda copia incompleta sería
  peor que ninguna.
- **Dueño de la decisión.** Si la instantánea describe el prompt de otro asiento
  (traspaso en curso), no se dibuja: se comprueba
  `waiting_for.data.player === viewer`.

## Decisiones de composición (medidas, no de gusto)

| Decisión | Por qué |
| --- | --- |
| La capa es `position: fixed` y no ocupa flujo | El tablero Arena está medido a **0 px** de deuda vertical a 1440×900 (`docs/ARENA-1.0-BOARD.md`); una capa en flujo habría gastado presupuesto |
| Las pilas de zona son fichas de 22 px con el **mismo texto** que ya había | Medido en `/ux?scene=idle` a 1440×900 con el asiento a 760 px: **50 px de alto con y sin fichas**, y el documento mide lo mismo (919 px). El texto «Biblioteca 33» sigue en el DOM para el E2E |
| Los arcos de pila van curvados al lado contrario (`bend = -0.62`) | Dos capas con los mismos extremos dibujaban el mismo trazo: medido en `/ux?scene=targets`, 4 arcos y sólo se veían 2. Ahora se ven los cuatro |
| El visor de zona es un `<dialog>` nativo | Foco atrapado, `Escape` y restauración del foco los pone la plataforma; no hay una trampa de foco escrita a mano que pueda perder una tecla |
| El laboratorio `/ux` no ejecuta reglas | Es la única forma de ver y probar la capa sin el WASM de 48 MB; `/stress` no tiene asientos ni zonas |

## Evidencia visual

`docs/screenshots/ux-objetivos-1440.jpg` (`TargetSelection` + pila),
`docs/screenshots/ux-combate-1440.jpg` (`DeclareBlockers` con un bloqueo
asignado) y `docs/screenshots/ux-visor-1440.jpg` (visor de cementerio abierto).
Son capturas de Chromium 153 sobre `/ux`, no de una partida real: en ellas el
arte falla a propósito (Scryfall bloqueado en la prueba), de modo que la
composición no dependa de una imagen externa.

## Cómo verlo

```sh
bun run dev
# http://localhost:5173/ux?scene=targets   objetivos legales + pila
# http://localhost:5173/ux?scene=combat    atacantes + bloqueo asignado
# http://localhost:5173/ux?scene=idle      sin decisiones: no hay líneas
```

`/ux` instala una instantánea escrita a mano en la misma sesión que usa el
tablero: la capa y los visores se alimentan del contrato real, no de un atajo.
Al seleccionar una ficha de zona se abre su visor; la biblioteca sólo muestra el
recuento (y las cartas reveladas, si el motor las proyectó).

## Verificación de esta ronda

Ejecutada en este checkout (Linux, Bun 1.4.4, Chromium 153 de
`bun run chromium:fetch`):

| Comprobación | Resultado |
| --- | --- |
| `bun test src/lib` | **284 pruebas, 0 fallos** (31 nuevas de geometría, líneas y zonas) |
| `bun run check` | 0 errores; 2 avisos de CSS preexistentes (`Hand.svelte`, `HistoryPanel.svelte`) |
| `bun run build` | correcto (adapter estático) |
| `bun --bun playwright test tests/e2e/ux-lab.spec.ts` | **11/11**: 4 arcos con `d` finito, combate con 2 atacantes y 1 bloqueo (uno a trazos), 0 líneas sin decisión, visor con 2 cartas + `Escape` + foco devuelto, **axe sin violaciones críticas ni serias** (tablero y diálogo modal), y 320/390/768 px sin desbordamiento horizontal con las 4 líneas y las 6 pilas presentes |
| Regresión `/stress` (`visibility`, `arena-zones`, `arena-quality-gate`, `arena-hand-fan`) | **24/24**, incluida la matriz de anchos y 0 px de deuda a 1440×900 |
| Regresión de accesibilidad (`a11y.spec.ts`) | verde: el fixture de visibilidad sigue sin violaciones críticas ni serias |

### Un cambio en una prueba existente

`tests/e2e/ui-game.spec.ts` afirmaba la etiqueta exacta
`aria-label="Elegir Jugador 2 como objetivo"`. Esa etiqueta no incluía el texto
visible del botón («17 vidas»), que axe marca como
`label-content-name-mismatch` (violación seria). El botón ahora se llama
`Elegir Jugador 2 como objetivo 17 vidas` y la prueba pasa a
`toHaveAccessibleName(/^Elegir Jugador 2 como objetivo/)`: comprueba lo mismo
—que el asiento es un objetivo legal y se anuncia como tal— sin congelar una
etiqueta que incumplía la regla. Ese `spec` necesita el WASM, así que **no se
ejecutó en esta ronda**; el mismo componente sí se verificó con axe en `/ux`.

### Lo que **no** está verificado aquí

- **No hay artefacto WASM en este checkout**, así que no se jugó una partida
  real con Phase en esta ronda. La capa se alimenta del mismo `EngineSnapshot`
  y los modelos están probados con instantáneas escritas a mano, pero la
  evidencia de una partida real (`/?autostart`, `DeclareBlockers`) tiene que
  salir del CI de `main`, que sí descarga el motor del pin.
- **Capturas**: las de esta ronda son del laboratorio `/ux`; no sustituyen la
  evidencia de partida real de `docs/VERIFICACIONES`.
- **Accesibilidad**: el SVG es decorativo por diseño; axe no puede evaluar un
  elemento `aria-hidden`, así que la garantía es la ausencia de foco y de
  puntero, no un informe de axe sobre los arcos.

## Lo que queda de la UI/UX de Phase

La lista se ordena por lo que todavía obliga a mirar dos pantallas para jugar una
carta. Lo que ya está hecho se queda aquí tachado con la pasada que lo trajo, no
se borra: es el registro de que se hizo y de cuándo.

1. ~~Menú de acciones de carta~~ (`BoardContextMenu.tsx`, `cardActionChoice.ts`):
   hecho en la cuarta pasada (`CardActionMenu.svelte`).
2. ~~Selector de destino de ataque~~ (`AttackTargetPicker.tsx`): hecho en la
   sexta pasada (`AttackTargetPicker.svelte`), anclado a la carta del atacante.
3. ~~Barra de fases con paradas~~ (`PhaseStopBar.tsx`): tercera pasada, más la
   ficha del teléfono de la quinta.
4. ~~Asignación de daño de combate~~ (`DamageAssignmentModal.tsx`): cuarta
   pasada (`DamageAssignment.svelte`).
5. **Reparto de la columna derecha** (pila + historial + decisión): el E2E de
   `/ux` cubre la capa, no la composición de una partida larga.

Fuera de la mesa, el trabajo que queda vive en los issues: #55 comandante, auras
y contadores de mesa; #56 draft; #57 lobby, multijugador, torneos y replay; #58
constructor de mazos; #59 animación, audio y PWA; #60 vistas de `waiting_for`
sin representar.

Ninguna de esas piezas se anuncia como hecha en el README; este documento es la
lista de trabajo, no una promesa de paridad visual completa.

## Cromo de mesa (segunda pasada, 7 nov 2026)

La captura de Phase en partida (`/tmp` del usuario, no versionada) enseña una
mesa a sangre con cromo flotante: placa del rival con avatar y vida, abanico de
su mano con recuento, dock inferior con prioridad y control, y un aviso de
flujo. Eso es lo que se porteó en esta pasada, sobre el laboratorio `/ux` y la
mesa real.

| En Phase | En Mesa | Comportamiento |
| --- | --- | --- |
| Placa de asiento (avatar, nombre, vida grande) | `PlayerPanel.svelte` + `.avatar` con el monograma del asiento | Mismo texto y mismos objetivos; no hay arte de jugador, así que la placa muestra `J1`/`J2` en vez de inventar un retrato |
| Abanico de la mano rival con contador | `.rival-hand` en `Board.svelte` y `/ux` | Girado por CSS (`--i`, `--fan-mid`); el recuento es decorativo (`aria-hidden`) porque la etiqueta del grupo ya dice que es una mano oculta |
| Dock de estado: prioridad, mano, paso, control | `StatusDock.svelte` | Las etiquetas salen de `waiting_for`, `phase` y `hand.length` del snapshot; `Control` escribe la misma preferencia `mesa:autoPass` que la casilla de la barra superior, con nombre accesible propio para que ninguna de las dos tape a la otra |
| Aviso «los saltos de fase son automáticos» | `CoachTip.svelte` | Aparece solo si el auto-paso está activo y hay partida; `Descartar` persiste `mesa:coach:autoPass`; `Conocer el flujo` enlaza a `/aprender` |
| Cromo casi negro con acento verde-azulado | `.app[data-chrome="arena"]` en `arena.css` | Los tokens del cromo se redefinen solo dentro de la mesa con partida: `/stress`, la portada y el tema claro siguen igual |

Decisiones que se apartan de la captura, con motivo:

- **Pasar no se duplica.** El botón `Pasar` sigue en `DecisionPanel`, donde el
  motor publica todas las acciones legales y donde lo buscan los E2E; el dock
  sólo informa. Dos botones con el mismo nombre accesible romperían además los
  localizadores estrictos.
- **Sin `Control total` inventado.** En esa pasada el único equivalente real era
  desactivar el auto-paso, así que no se dibujó un control que no haría nada. La
  tercera pasada añadió paradas por paso, pero como preferencia de la interfaz
  (`session.stops`), no como regla: el motor sigue publicando cada ventana.
- **Las pilas de esquina no se portan.** En Phase la mesa es un `100dvh` con
  recorte y la biblioteca sangra por el borde; aquí la mesa es un documento que
  desplaza, y las esquinas de `.app` caen sobre la barra superior y la mano
  (medido: la pila del rival aterrizaba sobre `Ajustes`). El control accesible
  sigue siendo la ficha de zona del asiento, que es la que anuncian los lectores
  y la que seleccionan las pruebas. Queda como pendiente si la mesa pasa a alto fijo.

Verificación de esta pasada: `bun run check` 0 errores, `bun test src/lib` 292
pasan (8 nuevas de `ui/phases.ts`), `bun run build` OK, `ux-lab.spec.ts` **11/11**
(3 nuevas: dock y control persistente, aviso descartable, abanico con recuento)
y `a11y.spec.ts` verde sobre `/stress`. Las capturas son
`docs/screenshots/ux-cromo-1440.jpg` y las tres de la ronda anterior.

## Paradas por fase (tercera pasada, 7 nov 2026)

`PhaseStopBar.svelte` sustituye a `TurnTrack` en la mesa de arena. Doce pasos,
los mismos que agrupa el carril anterior, ahora seleccionables: un paso marcado
es una **parada**.

- **Qué hace una parada.** `session.setStop(step, on)` guarda `mesa:stops` y
  `session.stopActive` hace que `autoPassPending` sea `false` en ese paso. Es
  decir: el motor sigue publicando la ventana y su recomendación, y la interfaz
  sólo deja de aceptar esa recomendación donde el jugador lo pidió. Sin paradas
  el comportamiento es exactamente el de antes.

- **El carril anterior ya no existe.** `TurnTrack.svelte` dibujaba cinco
  segmentos y se quedó sin uso al entrar la barra con paradas; el componente y
  sus reglas en `arena.css` se retiraron en el mismo cambio para que ninguna
  prueba buscara un elemento que la mesa ya no pinta. Lo que sí se conservó es
  la geometría que esas reglas imponían: la barra abarca la fila entera del
  centro (doce pasos no caben en el carril de 362 px) y sigue yendo la última
  en las bandas apiladas.
- **Dónde se ve.** El paso actual lleva `aria-current="step"`, la parada
  `aria-pressed` con relleno (visible sin pasar el ratón), el rótulo dice
  «Parada en \<paso\>» o «N paradas», y `StatusDock` añade la ficha `Parada`
  cuando la parada cae en el paso en curso.
- **Accesible.** Nombre `corto · parada en <paso>` para cumplir
  `label-content-name-mismatch` (el texto visible tiene que estar dentro del
  nombre accesible), activación con `Space`/`Enter`, 12 controles en una fila que
  desplaza en horizontal a 320 px en vez de envolver y comerse el alto medido del
  tablero.
- **Lo que no hace.** No crea ventanas de prioridad ni paradas «por turno» del
  rival: el motor no las modela y no se inventan.

Corrección de la lista anterior: **el selector de destino de ataque y las
acciones de carta ya existían** en `DecisionPanel` (`Atacar a …` con
`session.chooseAttackDestination`, y la lista de acciones legales de la carta
seleccionada). Esta pasada no los reescribe: el hueco real que quedaba era el de
las paradas. La asignación de daño sigue delegada en las acciones que publica
Phase cuando el paso lo pide; si el motor abre un `waiting_for` sin vista
propia, el panel cae en su lista de opciones legales en vez de inventar una
interfaz.

Verificación: `bun run check` 0 errores, `bun test src/lib` **294** (2 nuevas de
pasos), `bun run build` OK, `ux-lab.spec.ts` **13/13** con axe verde (2 nuevas:
parada persistente y ficha `Parada` en el dock). Captura:
`docs/screenshots/ux-paradas-1440.jpg`.

## Menú de acciones y asignación de daño (cuarta pasada, 7 nov 2026)

Cierra los dos huecos que quedaban en la mesa: el menú por carta y la vista del
reparto de daño.

**`CardActionMenu.svelte`** — port de `board/BoardContextMenu.tsx`.

- Se abre con **clic derecho** o **`Mayús+F10`/tecla Menú** sobre una carta con
  foco (`CardView` ya es `role="button" tabindex="0"`), que es el gesto estándar
  de menú contextual y funciona con teclado. No hay ningún disparador que
  dependa de `hover`.
- Es un `role="menu"` con `menuitem`s: flechas, `Home`/`End`, `Escape` y `Tab`
  para salir; al cerrar **devuelve el foco a la carta**.
- Solo lista `legal.by_object` de esa carta: si el motor no ofrece una acción,
  no aparece. Los ítems son `menuitem`, no `button`, para no duplicar el nombre
  accesible de los botones del panel de decisión.
- El fondo usa `--chrome-solid`: `--surface` es translúcida sobre el arte y un
  menú que deja ver el aviso de detrás no se lee.

**`DamageAssignment.svelte`** — vista para `WaitingFor::AssignCombatDamage` y
`WaitingFor::AssignBlockerDamage` (CR 510.1c/d), hasta ahora delegados en la
lista genérica de acciones legales.

- Enseña el atacante o bloqueadora, el total a repartir y cada receptor con su
  **mínimo letal** (`DamageSlot.lethal_minimum`).
- Las opciones son **los candidatos que publica Phase** en `legal.actions`
  (letal primero y «como si no estuviera bloqueada» cuando aplica). La interfaz
  solo los nombra: `2 a Grizzly Bears, 1 de exceso a Jugador 2`. No calcula
  repartos, así que no puede ofrecer uno que el motor rechace.
- Si esa ventana llegara sin candidatos, cae en la lista legal y lo dice.

Verificación: `bun run check` 0 errores, `bun test src/lib` **294**,
`bun run build` OK, `ux-lab.spec.ts` **16/16** con axe verde (3 nuevas: menú con
teclado y foco devuelto, clic derecho y diálogo abierto, y vista de daño con sus
dos repartos). Capturas: `docs/screenshots/ux-menu-1440.jpg` y
`ux-dano-1440.jpg`. Escena nueva del laboratorio: `/ux?scene=damage`.

**En partida real**: las dos piezas las ejerció el CI del PR #54 con el WASM
del pin (job *Chromium integration and visual interaction*, 5m15s, verde). El
primer intento de ese job falló por otra razón, ya corregida en el mismo PR: la
prueba de la banda de fases seguía midiendo `.turn-track`, el carril de cinco
segmentos que `PhaseStopBar` había sustituido.

## La ficha de fase del teléfono (quinta pasada, 7 nov 2026)

Port de `controls/MobilePhaseChip.tsx`. En Phase los carriles de puntos del
escritorio se ocultan en el teléfono porque un objetivo de 24 px no se puede
tocar con un dedo, y sus dos trabajos se reparten en un desplegable: la ficha
nombra el paso que el motor publica y, al abrirla, ofrece todos los pasos en
tamaño táctil.

Ese era exactamente el problema de Mesa. Medido a 320×800 y a 390×844, la barra
de doce fichas gastaba **84 px** de alto y cada ficha medía **30 px**.

- **`MobilePhaseChip.svelte`** dibuja una sola línea —`Turno 4 · Principal ·
  Sin paradas`— de **36 px** con `aria-haspopup="dialog"` y `aria-expanded`.
  Desde 641 px no se ve: ahí manda la barra de doce fichas. La barra tampoco se
  dibuja en el teléfono (`display: none`, no `visibility`), para que sus doce
  botones salgan también del orden de tabulación.
- **La hoja** es un `<dialog>` nativo con los doce pasos en orden de turno,
  filas de **44 px**, `aria-pressed` por paso y la insignia «Con parada» / «Sin
  parada» escrita, no sólo por color. Al abrir, el foco va al paso actual que
  publica Phase (`aria-current="step"`); al cerrar con `Escape` o con la ✕,
  vuelve a la ficha, no al documento.
- **Una diferencia deliberada.** Phase cicla la parada por tres ámbitos (todos
  los turnos, mi turno, los turnos rivales). `session.stops` de Mesa sigue
  siendo booleano por paso, así que la fila sólo responde «hay parada» o «no hay
  parada». Añadir ámbitos es cambiar el modelo de preferencias, no el motor, y
  queda fuera de esta pasada.
- **Ninguna regla vive aquí.** La ficha y la hoja sólo leen el paso de la
  instantánea y escriben `mesa:stops`; el auto-paso sigue siendo quien decide
  si contesta por el jugador.

### Contraste medido, sin cambios

El pendiente «contraste de `Pila 0` / `Resoluciones 0`» no se reproduce cuando se
mide de verdad. `--ink-muted` en el cromo de arena es `#aab4c4` sobre
`--surface` = `rgb(10 13 19 / 90 %)`: incluso con el arte más claro posible
detrás (blanco puro), el fondo compuesto es `#23252b` y el cociente es **7,5:1**;
sobre negro, **9,9:1**. AA pide 4,5:1 en texto normal. La impresión de texto
apagado venía de que en el laboratorio la bandeja de la mano se pinta encima de
los últimos paneles: es la maqueta del laboratorio, no el cromo.

### Verificación de esta pasada

`bun run check` 0 errores, `bun test src/lib` 294, `bun run build` OK y
`ux-lab.spec.ts` **17/17** más `a11y.spec.ts`, con axe verde también sobre la
hoja abierta. Capturas: `docs/screenshots/ux-ficha-390.jpg` y
`docs/screenshots/ux-paradas-390.jpg`.

## Selector de ataque anclado a la carta (sexta pasada, 7 nov 2026)

Port de `controls/AttackTargetPicker.tsx`. Hasta aquí el destino de un ataque se
elegía en el panel de decisión, a tres paneles de la criatura; Phase lo ancla al
atacante.

- **`AttackTargetPicker.svelte`**: un `role="menu"` con un `menuitemradio` por
  destino. La lista es `waiting_for.data.valid_attack_targets_by_attacker[id]`,
  el mapa que el motor ya acota con CR 508.1a–d; el componente no filtra, no
  ordena por legalidad y no añade destinos. Al elegir, `session.chooseAttackDestination`
  vuelve a comprobar la misma lista antes de escribir el borrador, y con un solo
  destino legal no se abre nada: la mesa lo asigna directamente, como antes.
- **Cuándo se abre.** Un `$effect` en `Board.svelte`: cuando la criatura
  seleccionada tiene **dos o más** destinos. Al cerrar con `Escape`, con la ✕ o
  eligiendo, el foco vuelve a la carta. Cerrar sin elegir también suelta la
  selección, que es lo que evita que el selector se reabra solo.
- **Lo que no se porta.** El tablero de cubos de upstream (pilas de atacantes
  idénticos, contadores +/−, reparto equitativo). Existe para repartir varios
  atacantes entre varios defensores a la vez en multijugador; Mesa declara un
  ataque por vez desde la misma lista del motor y el panel conserva la acción
  completa.

### Un fallo de colocación que ya existía

Al probarlo apareció que ambos popovers —el selector nuevo y el menú de carta de
la cuarta pasada— se colocaban con una regla fija (`top: anchor.bottom`). Con la
criatura en la mitad inferior de la pantalla el selector abría en **y = 890 de
900 px** y sólo se veía el título; el menú de carta tenía el mismo problema con
las cartas de la mano, que viven al pie.

`src/lib/ui/anchored.ts` (`placePopover`) resuelve la colocación con la caja ya
medida: debajo si cabe entera, encima si no, y solapando la carta cuando ninguna
de las dos bandas tiene sitio (teléfono en horizontal), nunca a menos de 8 px del
borde. Es aritmética pura y tiene **5 pruebas** de mesa en
`src/lib/ui/__tests__/anchored.test.ts`, incluido el caso medido.

### Verificación de esta pasada

`bun run check` 0 errores, `bun test src/lib` **299** (5 nuevas de `anchored.ts`),
`bun run build` OK, `ux-lab.spec.ts` y `a11y.spec.ts` **19/19**
y axe verde sobre el selector abierto. Captura: `docs/screenshots/ux-ataque-1440.jpg`
y la escena nueva `/ux?scene=attackers`.

## Descartes de efecto y de guardia (séptima pasada, 7 nov 2026)

`WaitingFor` del pin tiene **147 variantes**; Mesa da una vista propia a 17 y el
resto cae en la lista de acciones legales. Esta pasada cubre la familia que más
aparece en una partida normal sin ser todavía la limpieza de fin de turno: el
descarte que pide un **efecto** (Mind Rot, Ravenous Rats) y el que cobra la
**guardia** (ward).

Hasta ahora `discardPrompt` sólo reconocía `DiscardToHandSize` y `ConniveDiscard`;
los otros dos acababan en «Esta decisión todavía no tiene una representación
visual completa».

- **`interaction.ts`** reconoce las cuatro variantes y publica lo que el motor ya
  manda: `count`, `cards`, `up_to` (CR 701.9b), el nombre del objeto que pide el
  descarte y de qué tipo es (`handSize`, `discard`, `ward`). Un coste de guardia
  no lleva `count`: son una carta por vuelta, así que se fija en 1.
- **`DiscardPrompt.svelte`** (extraído de `DecisionPanel`, como
  `DamageAssignment`) dibuja las tres frases con la misma maquinaria: el título y
  la ayuda cambian, las cartas elegidas se marcan en la mano
  (`session.choosing`) y el botón sólo se activa cuando el motor aceptaría la
  respuesta (`session.discardReady`). Con `up_to`, cero cartas es legal, así que
  el botón dice **«No descartar»** hasta que se marca alguna.
- **Nada cuenta cartas por su cuenta.** La mano no se recorre: se ofrecen las
  cartas de `cards` y el recuento es el del motor.

El nombre accesible del bloque **no cambia con el recuento**: la limpieza se
anuncia siempre como «Descartar hasta siete cartas» (es la regla la que se
anuncia, no el número de ese turno) y cada variante tiene el suyo
(`data-discard` lo expone para las pruebas). Eso importó: la prueba de partida
completa localiza el descarte de limpieza por ese nombre, y un rótulo dinámico
la dejó sin nada que pulsar durante 400 pasos.

Laboratorio: escenas `/ux?scene=cleanup` (limpieza), `/ux?scene=discard`
(exactamente dos) y `/ux?scene=discardUpTo` (hasta dos), con el objeto
`Mind Rot` en la instantánea para que el panel pueda nombrarlo.

### Verificación de esta pasada

`bun run check` 0 errores, `bun test src/lib` **302** (3 nuevas de descarte en
`game/__tests__/discard.test.ts`), `bun run build` OK, `ux-lab.spec.ts` y
`a11y.spec.ts` **22/22** (21 del laboratorio) con axe verde sobre el bloque de
descarte. Captura: `docs/screenshots/ux-descarte-1440.jpg`.

Una lección de CI que costó dos ejecuciones: la anotación anterior listaba los
directorios de `test-results`, y ahí también deja carpeta **cada prueba que
pasa** si escribe evidencia (`captureViewportEvidence`). Nueve pruebas verdes se
leían como nueve fallos y tapaban el único rojo real. Ahora `playwright test`
emite además un informe JSON y `scripts/e2e-annotations.ts` anota cada fallo con
su mensaje.

Lo que queda de #60 sigue abierto: valores de X (`ChooseXValue`), orden de
disparos (`OrderTriggers`), elección de modo (`ModeChoice`), búsquedas
(`SearchChoice`, `DigChoice`), `RevealChoice` y las variantes de multijugador.

## La X del hechizo (octava pasada, 7 nov 2026)

CR 107.3a: X la anuncia el controlador al lanzar, y CR 601.2f fija después el
coste total que esa X alimenta. Phase publica la ventana (`min..max`, con `max`
calculado de lo que ese jugador puede pagar de verdad), el hechizo en curso y el
coste de cada valor; hasta ahora todo eso caía en la lista genérica de acciones
legales.

- **`interaction.ts`** publica el prompt (`player`, `min`, `max`, `objectId`,
  `cost`, `previews`) y dos funciones puras que sostienen la corrección:
  `parseX` (sólo dígitos, dentro de la ventana, `null` fuera) y `defaultX` (el
  mínimo del motor, nunca por debajo de 0). La respuesta es el `ChooseX { value }`
  desnudo que el motor ofrece para cada valor de `min..=max`.
- **`ChooseXPrompt.svelte`**: un campo numérico con pasos − y +, atajo
  **Máximo**, la ventana anunciada en texto («Máximo 5», «Entre 2 y 5») y el
  coste del valor elegido, tomado de `x_cost_previews` y con el coste del
  lanzamiento como respaldo. Una entrada fuera de rango **se rechaza, no se
  recorta**: escribir 99 con `max = 5` antes lanzaba por 5, un valor que nadie
  eligió. Los pasos siguen vivos con la entrada inválida porque son la única
  salida que no exige teclear, y recuperan hacia la ventana sin perder lo escrito.
- **Nada se hereda entre conjuros.** La entrada se guarda con la identidad del
  prompt (revisión, objeto, ventana): un `ChooseXValue` nuevo — otro hechizo, o
  la misma ventana con un `max` más estrecho — empieza otra vez en el mínimo del
  motor.
- El coste desaparece mientras no hay valor: mostrar el coste de una X que el
  jugador no ha anunciado sería inventarse el número.

Laboratorio: `/ux?scene=chooseX` (Fireball, ventana 0..5, con previsualizaciones
en 0, 3 y 5) y captura en `docs/screenshots/ux-elegir-x-1440.jpg`.

### Verificación de esta pasada

`bun run check` 0 errores, `bun test src/lib` **308** (6 nuevas en
`game/__tests__/x.test.ts`), `bun run build` OK, y en Chromium una prueba nueva
que recorre los pasos, el atajo de máximo, el rechazo de 99, la escritura de dos
dígitos sin recorte y la recuperación con las flechas del teclado, y que pasa
axe **con la entrada rechazada a la vista** (el estado que un borde rojo no
anuncia).

## Orden de los disparos (novena pasada, 7 nov 2026)

CR 603.3b: si varias habilidades de un mismo jugador se disparan a la vez, ese
jugador elige el orden en que van a la pila, y la pila resuelve al revés de como
se apila (CR 405.3). `OrderTriggers` es de los prompts que más aparecen en una
partida normal con dos o tres permanentes en mesa, y no tenía vista.

- **`interaction.ts`** publica los resúmenes que el motor ya derivó
  (`source_id`, `source_name`, `description`) y tres funciones puras: el orden
  inicial (`defaultOrder`, el que publicó Phase), el movimiento de una fila
  (`moveInOrder`, que rechaza índices fuera de la lista en vez de recortarlos y
  devuelve **el mismo array** cuando no hay nada que mover) y la respuesta
  (`OrderTriggers { order }` con la permutación copiada).
- **`TriggerOrderPrompt.svelte`**: una lista con el mismo orden que la pila —la
  fila de arriba se resuelve **la última**—, un botón de subir y otro de bajar
  por fila (44 px, deshabilitados en los extremos) y un único
  «Confirmar orden». La UI nunca deduce un disparo de `state.objects`: repite
  los resúmenes del motor.
- **El número de cada fila es el que asignó Phase**, no la posición: con dos
  disparos de la misma carta los nombres coinciden y el número es lo único que
  los distingue mientras se mueven.
- **Nada se hereda entre grupos.** La permutación se guarda con la identidad del
  prompt (revisión y fuentes): dos grupos CR 603.3b del mismo tamaño seguidos
  empiezan cada uno en el orden del motor, en vez de arrastrar el del anterior.

Laboratorio: `/ux?scene=triggerOrder` (tres disparos: Soul Warden, Ajani's
Pridemate y Dina) y captura `docs/screenshots/ux-orden-disparos-1440.jpg`.

### Verificación de esta pasada

`bun run check` 0 errores, `bun test src/lib` **313** (5 nuevas en
`game/__tests__/trigger-order.test.ts`), `bun run build` OK, y en Chromium una
prueba nueva que comprueba los dos rótulos de la pila, que los extremos no se
mueven, el intercambio de una fila con su vecina conservando su número, el mismo
movimiento con teclado y axe sin violaciones críticas ni serias.

## Hechizos y habilidades modales (décima pasada, 7 nov 2026)

CR 700.2: una carta modal pide a su controlador que elija modos antes de
objetivos y costes. Llega como dos variantes de `WaitingFor` —`ModeChoice` para
el hechizo, `AbilityModeChoice` para la habilidad de una permanente— y las dos
caían en la lista genérica de acciones legales.

- **`interaction.ts`** publica la ventana (`min_choices..max_choices`), los
  textos de cada modo, los modos que Phase ya descarta (CR 700.2a `NoRepeat`,
  objetivos insatisfechos) y el peso en huellas cuando la carta es de presupuesto
  (CR 700.2i, donde `max_choices` es **un presupuesto de puntos y no un número
  de modos**). La respuesta es `SelectModes { indices }`.
- **`ModeChoicePrompt.svelte`**: una fila por modo con `aria-pressed`, el
  recuento de veces elegido y «Ya no disponible» en las descartadas; confirmación
  con `(n/max)` —o `(puntos/max)` en las de presupuesto—, «Limpiar» y
  «Cancelar».
- **Dos reglas que un port ingenuo se salta**, ambas heredadas de la app
  upstream: un modal de uno entre uno **responde con el propio clic** (no hay
  nada que confirmar), y **sólo una habilidad activada** se puede cancelar en
  este paso (CR 602.2b); una habilidad disparada debe elegir modo y resolver
  (CR 603.3c), así que ahí no hay botón de cancelar.
- **Nada se hereda entre conjuros**: la selección se guarda con la identidad del
  prompt (revisión, variante, objeto y número de modos), no por posición.

Laboratorio: `/ux?scene=modeChoice` (Selesnya Charm, dos modos de tres, con el
tercero descartado por el motor) y captura
`docs/screenshots/ux-elegir-modos-1440.jpg`.

### Verificación de esta pasada

`bun run check` 0 errores, `bun test src/lib` **322** (9 nuevas en
`game/__tests__/mode-choice.test.ts`: ventana, descartados, un-entre-uno,
repeticiones, presupuesto de huellas y las dos reglas de cancelación), `bun run
build` OK, y en Chromium una prueba nueva que recorre la ventana completa
—deshabilitado del modo descartado, `(0/2)`, `(1/2)`, `(2/2)`, desmarcar,
«Limpiar», «Cancelar»— y pasa axe.

## Búsquedas en la biblioteca (undécima pasada, 7 nov 2026)

CR 701.23: la biblioteca es una zona oculta, así que el buscador no puede pulsar
esas cartas en la mesa. Phase publica las que aceptará y este bloque las lista;
es el prompt de los tutores y de media docena de rampas, de los más frecuentes
de cualquier partida.

La parte que un port ingenuo aplana es **CR 701.23b/701.23d**: una búsqueda de
*cualidad declarada* («una carta de criatura», «con nombres distintos») puede
encontrar menos cartas de las pedidas —incluso ninguna—, mientras que una
búsqueda de *cantidad pura* debe encontrar todas las que pueda. El motor publica
esa distinción en tres campos (`up_to`, `allows_partial_find` y la restricción de
selección, donde `permits_partial_find` es literalmente «no es `None`»), y la
mesa no la vuelve a deducir.

- **`interaction.ts`**: `searchPrompt` publica las cartas legales, el recuento,
  la ventana parcial y si las encontradas se revelan; `searchReady` comprueba
  que la respuesta está dentro de la ventana y que **sólo** contiene cartas que
  el motor ofreció. La respuesta es `SelectCards`, la misma acción que usan los
  descartes (`selectCardsAction` es ahora la definición única).
- **`SearchPrompt.svelte`**: una fila por carta con nombre, línea de tipo y
  coste; `aria-pressed` marca lo elegido y el nombre accesible de la fila es su
  propio texto, para que un lector de pantalla oiga también el tipo y el coste
  (axe marca `label-content-name-mismatch` si se le pone un `aria-label` que no
  contenga el texto visible). El botón dice `Confirmar búsqueda (n/count)` y,
  cuando la búsqueda admite menos, **«No encontrar nada»**.
- **No se porta todavía** el buscador de filtro local sobre la biblioteca
  completa, las pistas de orden (`ordering_hint`) ni el reparto en dos destinos
  (`split`): esos dos últimos llegan como prompts propios después de responder,
  así que la mesa no se los salta, simplemente aún no los dibuja.

Laboratorio: `/ux?scene=search` (tutor de una criatura con cuatro cartas
elegibles) y captura `docs/screenshots/ux-buscar-biblioteca-1440.jpg`.

### Verificación de esta pasada

`bun run check` 0 errores, `bun test src/lib` **328** (6 nuevas en
`game/__tests__/search.test.ts`: ventana exacta, las tres formas de la búsqueda
parcial, rechazo de cartas que el motor no ofreció y la respuesta vacía), `bun
run build` OK, y en Chromium una prueba nueva que recorre la lista, el recuento,
la imposibilidad de elegir una segunda carta, el desmarcado y axe.

## Mirar y guardar cartas (duodécima pasada, 7 nov 2026)

CR 701.20e: un efecto «mira las N primeras» enseña cartas de una zona oculta a un
jugador, que se queda con algunas y manda el resto a alguna parte. Es el prompt
de Anticipar, Considerar y de casi todas las filtraciones de biblioteca, y caía
en la lista genérica.

Lo que hace útil la vista es que **el destino forma parte de la decisión**:
quedarse una carta «en la parte superior de tu biblioteca» y «en tu mano» son
decisiones distintas sobre las mismas cartas, y la app upstream lo rotula por eso
mismo. Un port que lo omite obliga a adivinar.

- **`interaction.ts`**: `digPrompt` publica las cartas vistas, el subconjunto que
  pasa el filtro, cuántas se pueden guardar (ya recortado por el filtro) y las
  dos frases de destino. El resto tiene tres formas, y las tres se distinguen:
  mover a `rest_destination` (con «fondo de la biblioteca» cuando es la
  biblioteca), **no mover nada** (`rest_remainder: StayInLibrary`, que solo se
  serializa cuando no es el valor por defecto) y el reparto de Telling Time
  (`rest_split_top_count`, que llega como prompt propio después).
- **`SearchPrompt` y `DigPrompt` comparten `togglePick`**: marcar una carta de un
  conjunto publicado, sin pasarse de la ventana y devolviendo **el mismo array**
  cuando el clic no puede cambiar nada, para no repintar por nada.
- **`DigPrompt.svelte`**: las cartas vistas, con las que no encajan mostradas
  pero deshabilitadas («No encaja»), el destino de cada pila en texto y el botón
  `Guardar (n/count)` —o «No guardar nada» cuando el efecto admite menos—. Si
  las guardadas entran giradas o atacando, también se dice.
- Los nombres accesibles de las filas son su propio texto, igual que en la
  búsqueda: nada de `aria-label` que tape el coste o el tipo a un lector.

Laboratorio: `/ux?scene=dig` (mirar tres, guardar una, con la tercera fuera del
filtro y destino mano/cementerio) y captura
`docs/screenshots/ux-mirar-guardar-1440.jpg`.

### Verificación de esta pasada

`bun run check` 0 errores, `bun test src/lib` **336** (8 nuevas en
`game/__tests__/dig.test.ts`: destinos, filtro vacío, tope por filtro, ventana
exacta frente a «hasta N» y el `togglePick` compartido), `bun run build` OK, y en
Chromium una prueba nueva con axe.
