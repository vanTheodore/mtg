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

El motor está en `3c8d9bca` (v0.123.0, ver
[`PHASE-UPSTREAM-2026-11-07-3C8D9BC.md`](PHASE-UPSTREAM-2026-11-07-3C8D9BC.md)),
pero la geometría que se portó —`stack/StackTargetArcs.tsx`, `targeting/arcPath.ts`,
las líneas de ataque y bloqueo— **no cambió en esos 44 commits**, así que el port
sigue siendo fiel al componente original. Del cliente upstream sí cambió el fondo
del asiento (`board/ArenaBackground.tsx`, ahora con importación diferida y su
manejo del fallo): no es geometría ni la portamos, porque Mesa pinta sus propias
arenas desde `static/phase/arenas/`. Lo nuevo de interfaz sigue siendo *Horde*,
que Mesa no expone.

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

## «Puedes…» y no volver a preguntar (decimotercera pasada, 7 nov 2026)

CR 608.2d: un efecto opcional pregunta al controlador si quiere resolverlo. Es
probablemente el prompt más repetido de una partida con permanentes: casi
cualquier «you may» de una criatura lo abre.

- **`interaction.ts`**: `optionalEffectPrompt` publica lo que el motor ya manda
  —la fuente, el objeto afectado (`decision_subject_id`), **el texto de la
  instrucción tal cual**— y dos capacidades que no se deducen de la carta:
  `rememberable` (existe `may_trigger_key`, CR 603.5) y `sameCardAvailable` (el
  motor ofrece el alcance «esta misma carta»). Las dos respuestas son acciones
  distintas: `DecideOptionalEffect { accept }` o, si se recuerda,
  `DecideOptionalEffectAndRemember { choice, scope }`.
- **`OptionalEffectPrompt.svelte`**: dos botones (Sí / No) y, sólo cuando el
  motor lo permite, las casillas «No volver a preguntar por este disparo» y
  «Tampoco para esta misma carta». La segunda implica la primera, y desmarcar la
  primera desmarca la segunda: el motor sólo acepta el alcance amplio con la
  memoria activada.
- **Las casillas se limpian con cada prompt**: recordar una respuesta no debe
  arrastrarse al siguiente «puedes» de otra carta, y el estado se reinicia al
  cambiar de revisión igual que el resto de selecciones.
- `OpponentMayChoice` **no** entra en esta pasada: comparte el componente
  upstream y la acción, pero su redacción (decide otro jugador) merece su propia
  frase; queda anotado como pendiente.

Laboratorio: `/ux?scene=optional` (Grizzly Bears, «Puedes robar una carta», con
el alcance mismo-carta disponible) y captura
`docs/screenshots/ux-efecto-opcional-1440.jpg`.

### Verificación de esta pasada

`bun run check` 0 errores, `bun test src/lib` **342** (6 nuevas en
`game/__tests__/optional-effect.test.ts`: capacidades del motor, alcance amplio
sin clave, sujeto y descripción, y las dos formas de la respuesta), `bun run
build` OK, y en Chromium una prueba nueva que comprueba el texto del motor, los
dos botones, y la relación entre las dos casillas —con axe.

## Pagar una cantidad (decimoquinta pasada, 7 nov 2026)

CR 107.1c + CR 118.1: «paga cualquier cantidad de vida», «elige un número»,
«paga X maná» — la misma ventana numérica que X, con un recurso distinto y una
trampa: **no todo lo que pide un número es un coste**. CR 732.2a pide cuántos
ciclos de un bucle se materializan, y ahí no se gasta nada.

- **`interaction.ts`**: `payAmountPrompt` lee la ventana del motor, el recurso y
  la fuente. El recurso no es un enum plano: `ManaGeneric` es una etiqueta de
  cable *congelada* que cubre dos composiciones distintas (`{X}{W}` frente a
  «paga cualquier cantidad de {R}»), así que se lee `composition`; y
  `LoopCollapse` trae el eje que dice qué se materializa (fichas, contadores,
  vida o mezcla).
- **La identidad del prompt incluye al jugador**: el motor emite prompts
  consecutivos con el mismo `source_id` que sólo cambian de asiento (un bucle por
  controlador, en orden APNAP), y `accumulated` mueve la ventana. Sin eso, el
  segundo jugador hereda la cantidad escrita para el primero.
- **`AmountField.svelte`**: el control de cantidad deja de estar dentro del
  prompt de X y pasa a ser compartido — ventana por props (ningún límite propio),
  `parseAmount` como único saneador, *steppers* vivos mientras la entrada se
  rechaza y recuperación desde los dígitos escritos. `parseX` queda como alias
  del mismo saneador para no tocar el prompt de X.
- **`PayAmountPrompt.svelte`**: `Pagar N vida` en los pagos; en un colapso de
  bucle el botón dice `Aplicar 2 · 2 contadores` y el bloque avisa de que no se
  gasta nada. Una entrada fuera de ventana deshabilita la confirmación: no se
  recorta.
- Nombre accesible del botón de máximo: «Cantidad al máximo» (contiene el texto
  visible «Máximo»; axe lo exige).

Laboratorio: `/ux?scene=pay` (ventana de vida 1–4) y captura
`docs/screenshots/ux-pagar-cantidad-1440.jpg`.

### Verificación de esta pasada

`bun run check` 0 errores, `bun test src/lib` **351** (9 nuevas en
`game/__tests__/pay-amount.test.ts`: recursos y composición de maná, el eje del
bucle, la etiqueta que no dice «pagar» cuando no se paga, la identidad por
asiento y la lista de entradas que no son dígitos), `bun run build` OK, y en
Chromium una prueba nueva que escribe fuera de ventana y comprueba que la
confirmación se deshabilita en vez de recortar —con axe.

## La misma pregunta, otro jugador (decimosexta pasada, 7 nov 2026)

`OpponentMayChoice` comparte acción con «puedes» (`DecideOptionalEffect`) y la app
upstream los dibuja con el mismo modal y el mismo texto. Pero no son la misma
pregunta: en un `OpponentMayChoice` el asiento que responde **no controla la
fuente**, y el motor publica además los oponentes que faltan (`remaining`, en
orden APNAP).

Portar el modal tal cual dejaría a un jugador leyendo «puedes» y buscando su
propia permanente mientras la fuente es del rival. Y mostrar el mismo bloque con
el mismo título para dos situaciones distintas es justo lo que hace ilegible un
tablero compartido.

- **`interaction.ts`**: `optionalEffectPrompt` cubre los dos tipos y añade
  `asked: 'controller' | 'opponent'` y `remaining`. Las dos capacidades de
  memoria (CR 603.5) son **falsas por construcción** en `OpponentMayChoice`: el
  payload no trae `may_trigger_key`, y una bandera suelta
  (`same_card_may_trigger_choice_available`) no la resucita — hay prueba de esa
  combinación.
- **`OptionalEffectPrompt.svelte`**: el título pasa a «Otro jugador te pregunta ·
  {fuente}» y una línea dice lo que de verdad importa: «La fuente no es tuya: la
  decisión sí», más a quién le toca después según `remaining` (singular y plural).
- Sin casillas de «no volver a preguntar»: no hay nada que recordar. Los dos
  botones son los mismos.
- `OpponentMayChoice` entra en el recuento de variantes representadas, porque a
  partir de ahora tiene frase propia y no cae en la lista genérica.

Laboratorio: `/ux?scene=opponent` (el visor responde por el Chandra del rival y
queda 1 jugador) y captura `docs/screenshots/ux-decidir-oponente-1440.jpg`.

### Verificación de esta pasada

`bun run check` 0 errores, `bun test src/lib` **353** (2 nuevas en
`game/__tests__/optional-effect.test.ts`: la pregunta del oponente con su
`remaining` y el último de la ronda; más la lista de `remaining` sucia, que se
filtra en vez de pintar `undefined`), `bun run build` OK, y en Chromium una
prueba nueva que comprueba el título, la frase de propiedad, el aviso de quién
falta y la ausencia de casillas —con axe.

## Revelar una carta (decimoséptima pasada, 7 nov 2026)

CR 701.20a: enseñar una carta de una zona oculta. Es el patrón de las tierras
que entran giradas («puedes revelar una tierra; si no, entra girada»: Port Town,
Gilt-Leaf Palace) y también el de «elige una carta de la mano del oponente».

Dos cosas que un modal genérico se salta:

- **La negativa es una respuesta.** En una revelación opcional, la selección
  vacía no es «aún no he elegido»: es «no revelo», y dispara la otra rama de la
  carta. Por eso tiene botón propio (`No revelar`), no es simplemente no pulsar.
- **La misma negativa significa dos cosas.** El motor lo dice con
  `decline_runs_continuation`: en una revelación desde la mano, la vacía ejecuta
  la rama de rechazo de la carta; en una elección opcional posterior, se salta la
  elección siguiente. El bloque avisa de lo segundo («se salta la elección que
  venía después») en vez de callarlo, porque el jugador no puede deducirlo del
  texto de la carta.
- **Una sola carta, siempre.** Marcar otra sustituye a la primera en vez de
  sumarse: el motor pide una, y un multiselección prometería algo que la
  respuesta no puede expresar. Volver a pulsar la elegida la suelta.
- La revelación **forzada** (mano del oponente) no ofrece negativa y el título lo
  dice: «Mano del oponente».

Laboratorio: `/ux?scene=reveal` (tres cartas de la mano, negativa disponible) y
captura `docs/screenshots/ux-revelar-carta-1440.jpg`.

### Verificación de esta pasada

`bun run check` 0 errores, `bun test src/lib` **359** (6 nuevas en
`game/__tests__/reveal.test.ts`: opcional con su rama de rechazo, forzada sin
negativa, elección posterior que se salta, tarjetas no numéricas filtradas y las
dos formas de la acción), `bun run build` OK, y en Chromium una prueba nueva que
marca dos cartas y comprueba que la segunda sustituye a la primera —con axe.

## Pagar o aceptar (decimoctava pasada, 7 nov 2026)

CR 118.12: «contrarresta ese hechizo a menos que su controlador pague {3}». Es
Mana Leak, No More Lies, Daze, y también los «a menos que pagues N vidas».

Hasta ahora `UnlessPayment` contaba como representada porque caía en el bloque
de **pago de maná**: el jugador veía «Pago pendiente» y una lista de fuentes que
tocar, sin ver ni el coste ni lo que pasaba si no pagaba. Elegir no pagar era,
literalmente, no encontrar el botón.

- **`interaction.ts`**: `unlessPrompt` publica el coste y la consecuencia. El
  coste es un `AbilityCost`, **no un número**: `Mana` se rotula con el
  `manaText` de siempre; `PayLife` sólo se nombra cuando el motor fija la
  cantidad (`Fixed`), porque un importe dinámico impreso como número sería un
  dato inventado; cualquier otro coste (sacrificar, descartar…) se admite como
  `other` y el bloque dice que la mesa no puede describirlo con palabras —el
  motor sí comprueba si puedes pagarlo—. La consecuencia es
  `effect_description`, el texto del propio motor.
- **`UnlessPrompt.svelte`**: «Paga {3}», «Si no pagas: contrarrestar el
  hechizo», y dos botones: `Pagar {3}` y `No pagar`. En el variante CR 118.12a
  («a menos que cualquier jugador pague») añade a quién se le pregunta después y
  que el primero que pague lo detiene.
- El bloque va **antes** del de maná, que sigue siendo el que permite tocar
  tierras para pagar. `UnlessPayment` sigue en `isManaPrompt`, porque las
  acciones de maná son parte legítima de la respuesta.
- El recuento de variantes representadas **no cambia** (27): la variante ya
  contaba. Lo que cambia es que ahora tiene bloque propio en vez de heredar el
  genérico.

Laboratorio: `/ux?scene=unless` (coste `{3}`, consecuencia «contrarrestar el
hechizo») y captura `docs/screenshots/ux-pagar-o-aceptar-1440.jpg`.

### Verificación de esta pasada

`bun run check` 0 errores, `bun test src/lib` **366** (7 nuevas en
`game/__tests__/unless.test.ts`: maná con genérico y con símbolos, vida fija,
vida en singular, importe dinámico que no se imprime, coste de objeto admitido
como tal y la lista de asientos del variante multijugador), `bun run build` OK, y
en Chromium una prueba nueva que comprueba coste, consecuencia y que «no pagar»
es un botón —con axe.

## Emparejar (decimonovena pasada, 7 nov 2026)

CR 702.95a + CR 608.2d: soulbond pregunta con quién se empareja la criatura que
entra. Los objetos de la lista son **elecciones legales, no objetivos**, y
emparejar es opcional: el motor ofrece `ChoosePair { partner: None }` como
respuesta.

- **`interaction.ts`**: `pairPrompt` publica la criatura que se empareja y los
  candidatos que el motor acepta. `choosePair(partner | null)` es la respuesta,
  con la negativa incluida.
- **`PairPrompt.svelte`**: nombre de la criatura que entra, la lista de parejas
  legales, `Emparejar con {nombre}` y `No emparejar`. Una sola pareja: marcar
  otra sustituye a la primera y volver a pulsar la elegida la suelta.
- Sin candidatos no es un bloque vacío: dice que no hay ninguna criatura legal
  con la que emparejar, y la negativa sigue disponible.
- La escena añade una tercera criatura al campo del visor (`Elvish Mystic`) para
  que «¿con cuál?» tenga dos respuestas de verdad en vez de una lista de un solo
  elemento.

Laboratorio: `/ux?scene=pair` y captura `docs/screenshots/ux-emparejar-1440.jpg`.

### Verificación de esta pasada

`bun run check` 0 errores, `bun test src/lib` **370** (4 nuevas en
`game/__tests__/pair.test.ts`: el contrato, los candidatos sucios filtrados,
la lista vacía como prompt válido y las dos formas de la acción), `bun run build`
OK, y en Chromium una prueba nueva que elige, cambia de pareja y la suelta —con
axe.

## El destinatario de una ficha (vigésima pasada, 7 nov 2026)

`ChooseTokenHost` es Alchemy digital, sin entrada en el CR: una entrada por lotes
(«una o más criaturas entran … anexadas a una de ellas») marca a todas las
candidatas y el controlador elige cuál recibe la ficha.

El propio comentario del motor es explícito y es lo que la vista tiene que
respetar: **es una elección, no un objetivo**, así que hexproof, velo y
protección nunca filtraron `legal_targets`. Un bloque que dijera «elige el
objetivo» estaría prometiendo una interacción que la regla no tiene.

- **`interaction.ts`**: `tokenHostPrompt` publica los destinatarios tal cual los
  dejó el motor, con el `TargetRef` del cable (`{ Object }` / `{ Player }`, sin
  envoltorio de etiqueta). `chooseTokenHost(host)` es el `ChooseTarget` que el
  motor ofrece.
- **`TokenHostPrompt.svelte`**: título con la fuente, la frase que separa
  elección de objetivo, la lista con `targetLabel` (jugadores incluidos, porque
  el motor también puede ofrecer uno) y confirmación con el nombre elegido. Sin
  destinatarios lo dice en vez de quedarse vacío.
- La selección se guarda por **índice**, no por objeto: un `TargetRef` no es una
  clave, y dos referencias distintas pueden apuntar al mismo objeto.

Laboratorio: `/ux?scene=host` y captura
`docs/screenshots/ux-destinatario-ficha-1440.jpg`.

### Verificación de esta pasada

`bun run check` 0 errores, `bun test src/lib` **375** (5 nuevas en
`game/__tests__/token-host.test.ts`: la lista publicada, un jugador como
destinatario, la lista ausente, la acción y el caso de otra decisión), `bun run
build` OK, y en Chromium una prueba nueva que cambia de destinatario —con axe.

## El coste disyuntivo: cuál se paga (vigesimoprimera pasada, 7 nov 2026)

`UnlessPaymentChooseCost` es CR 118.12a: «a menos que sacrifique un permanente que
no sea tierra de su elección **o** descarte una carta». El motor documenta la
clase con Tergrid's Lantern y reenvía el coste elegido al camino de un solo coste,
como si el «o» nunca hubiera existido.

No es `UnlessPayment`. Allí la pregunta es **si** se paga un coste único; aquí es
**cuál** de varios, y la negativa es una tercera respuesta que aplica el efecto.
Por eso el bloque no reutiliza aquella frase: cada rama es una respuesta y el
`effect_description` del motor se cita como lo que pasa si no se paga ninguna.

Nombrar las ramas exigió extender el vocabulario de costes (todas como
`AbilityCost`, con la etiqueta `type`):

| Forma | Cómo se nombra |
|---|---|
| `Mana` | el texto de maná de siempre |
| `PayLife` | «N vidas», sólo con cantidad fija (CR 119.4) |
| `Sacrifice` | «Sacrificar N permanente(s)»; `count` del motor y, si el filtro es `Typed` con un único tipo y `controller: You`, el sustantivo en español |
| `Discard` / `Exile` | «Descartar/Exiliar N carta(s)» |
| `Tap` | «Girar un permanente» |
| cualquier otra | sin nombre: la lista muestra «Opción *n* · la mesa no nombra este coste» |

Lo que no se nombra no se inventa: un filtro con propiedades que la mesa no sabe
resumir pierde el sustantivo y se queda en el tipo, y Phase sigue filtrando la
elección real. El índice es el que publicó el motor, así que la opción sin nombre
se puede elegir igual.

`remaining_choices`/`chosen` cuentan las disyunciones encadenadas (mantenimiento
acumulativo, una por contador de edad): cuando hay cola el bloque dice «Elección
*k* de *n*», con la cuenta del motor y ningún orden propio.

Laboratorio: `/ux?scene=branches` y captura
`docs/screenshots/ux-pagar-uno-de-dos-1440.jpg`.

### Verificación de esta pasada

`bun run check` 0 errores, `bun test src/lib` **381** (6 nuevas en
`game/__tests__/unless-branch.test.ts`; la prueba de `unless.test.ts` sobre un
coste-objeto se reescribió porque ahora ese coste sí se nombra), `bun run build`
OK, y en Chromium una prueba nueva que elige rama y comprueba que «No pagar»
sigue disponible —con axe.

## El tributo lo paga un oponente (vigesimosegunda pasada, 7 nov 2026)

`TributeChoice` es CR 702.104a: la criatura con tributo entra y **un oponente**
decide si se le ponen los contadores. El motor publica quién decide (`player`), la
criatura (`source_id`) y cuántos +1/+1 vale el tributo (`count`). La respuesta es
`DecideOptionalEffect`, la misma acción que «puedes», pero la pregunta no es del
controlador.

Por eso el bloque dice tres cosas que la acción no dice:

1. **quién decide**: un oponente del controlador, no el controlador (un jugador
   que lee «puedes» buscaría su propio permanente);
2. **qué significa pagar**: poner *n* contadores +1/+1 sobre la criatura, con el
   número del motor y ningún cálculo propio;
3. **qué significa no pagar**: cuenta como tributo no pagado y se dispara lo que
   la carta diga para ese caso (CR 702.104b). No es «no pasa nada».

Con `count` en cero no se inventa la cifra: el bloque lo dice y el botón de pagar
queda deshabilitado, mientras «No pagar» sigue siendo una respuesta legal.

Laboratorio: `/ux?scene=tribute` (Fanatic of Xenagos, tributo 1) y captura
`docs/screenshots/ux-tributo-1440.jpg`.

### Verificación de esta pasada

`bun run check` 0 errores, `bun test src/lib` **385** (4 nuevas en
`game/__tests__/tribute.test.ts`), `bun run build` OK, y en Chromium una prueba
nueva que comprueba el nombre de la criatura, la cuenta del motor y que las dos
respuestas están separadas —con axe.

## La guardia, con el permanente a la vista (vigesimotercera pasada, 7 nov 2026)

`WardSacrificeChoice` es CR 702.21a/b: pagar una guardia sacrificando permanentes.
Dos cosas que el bloque no puede equivocar:

- **No hay «no pago» aquí.** El prompt se alcanza *después* de que el pagador
  aceptara la guardia, y el motor acepta exactamente un permanente por vuelta (o
  un conjunto cuyo poder total llegue al umbral). Ofrecer un botón de negativa
  sería ofrecer una acción que el motor rechaza, así que el bloque no lo tiene:
  dice que la decisión de pagar ya está tomada.
- **Las opciones son los candidatos `SelectCards` de Phase**, en su orden. La
  mesa no arma conjuntos: no puede saber qué combinaciones aceptará el motor más
  allá de la que publicó. Con umbral hay un único conjunto —el testigo del
  motor— y el bloque lo nombra con su poder total, calculado sólo para mostrar y
  sólo cuando todos los poderes se conocen.

Laboratorio: `/ux?scene=ward` (un permanente por vuelta) y
`/ux?scene=wardPower` (poder total mínimo), capturas
`docs/screenshots/ux-guardia-1440.jpg` y las de tema.

### Verificación de esta pasada

`bun run check` 0 errores, `bun test src/lib` **391** (6 nuevas en
`game/__tests__/ward.test.ts`), `bun run build` OK, y en Chromium una prueba
nueva que comprueba que no hay negativa, que sólo están los permanentes que
publicó Phase y que el conjunto con umbral se muestra con su total —con axe.

## Las capturas en los dos temas (vigesimocuarta pasada, 7 nov 2026)

El laboratorio no podía enseñar el tema: pintaba con `data-chrome="arena"`, y
`arena.css` fija ahí su propia paleta **a propósito** (el cromo va sobre el arte,
para que el tablero se lea igual con el sistema en claro o en oscuro). Con eso,
una captura «clara» y una «oscura» salían idénticas —medido: mismo md5—.

Arreglo en dos partes:

1. **El laboratorio obedece el mismo interruptor que `Board.svelte`**:
   `data-board-style={session.boardStyle}` y `data-chrome="arena"` sólo cuando el
   estilo es arena, con el arte de fondo también condicionado. Así `/ux` puede
   mostrar el cromo clásico, que es el que resuelve los tokens del tema.
2. **`tests/e2e/ux-themes.spec.ts`**: recorre las diez escenas de esta rama en
   claro y oscuro, comprueba que `data-theme` cambió de verdad, audita con axe en
   **los dos** temas y deja las capturas en `docs/screenshots/temas/`, con un
   índice en `docs/screenshots/temas/README.md`. Una prueba extra compara `--ink`
   entre temas para que una captura no pueda repetir la paleta anterior.

El tema se cambia por el camino del producto: `localStorage['mesa:theme']`, que es
lo que escribe el ajuste y lo que lee `session.setTheme`.

Un detalle que salió al añadir la escena de la guardia: el selector de escena es un
`<select>` nativo, que se dimensiona por su opción más larga, y dos etiquetas nuevas
metieron **30 px** de desbordamiento horizontal a 320 px (medido; lo cazó la prueba
de `ux-lab`). No se arregló acortando la etiqueta —que también— sino con
`min-width: 0` en la cadena flex y `max-width: 100%` en el `select`: una etiqueta
larga no puede volver a decidir el ancho del cromo.

### Verificación

`bun test src/lib` **391**, `bun run check` 0 errores, build OK, y en Chromium
`ux-themes` **3/3** (20 capturas, 20 auditorías axe) además de `ux-lab` (36),
`a11y` y `arena-quality-gate`.

## Quién empieza: la tirada elige, no decide (vigesimoquinta pasada, 7 nov 2026)

Motor a **v0.124.0** (`1cd03ab`, 10 commits). La única alta de `WaitingFor` en ese
rango es `ChooseStartingPlayer` (147 → **148** variantes), y los bloques de campo de
las 30 variantes que Mesa ya representaba son idénticos, comprobados bloque a bloque.

CR 103.1: antes del primer turno los jugadores tiran, y el ganador **elige** quién
empieza — la tirada no decide el turno. El motor ya corre el concurso y publica
`player` (el ganador que elige) y `candidates` (los asientos que aceptará, en orden
de asiento). El bloque no re-tira, no reordena y no deduce un ganador: nombra los
asientos tal cual y lo dice con esas palabras, porque «has ganado la tirada» y
«empiezas tú» no son la misma frase.

CR 103.1a: en equipo con turno compartido el asiento nombra al equipo que empieza;
cuando hay más de dos asientos el bloque lo advierte.

**Adaptación local, a la vista:** el puente `mtg-engine-wasm` arranca con
`start_game_with_starting_player(first_player)` y no con `start_game`, así que Mesa
no corre el concurso de dados y el primer turno es el que pide el cliente (por
defecto el asiento 0). Eso mantiene deterministas las pruebas de arranque. La vista
se porta igual: cubre el contrato, y el día que el puente cambie la mesa no se
quedará parada en un prompt desconocido. El evento nuevo `StartingPlayerContest` no
se resume en el registro —el resumen ignora lo que no conoce—, así que tampoco hay
texto inventado.

Laboratorio: `/ux?scene=startingPlayer`, capturas `docs/screenshots/ux-quien-empieza-1440.jpg`
y el par de temas `docs/screenshots/temas/quien-empieza-{claro,oscuro}.jpg`.

### Verificación de esta pasada

`bun run engine:verify` verde con `sourceSha256`
`8c2d51040608405aace27260822df952bc526bf9699a2cd197b67f7048fb4d79`; `bun run check`
0 errores; `bun test src/lib` **396** (5 nuevas en
`game/__tests__/starting-player.test.ts`); build OK; y en Chromium una prueba nueva
(la tirada da la elección, los asientos son los del motor y el que elige está
marcado) más la captura de temas.

## Mirar y ordenar: scry y surveil (vigesimosexta pasada, 7 nov 2026)

`ScryChoice` y `SurveilChoice` son, en la lectura del motor, la misma pregunta con
dos destinos distintos (CR 701.22a y CR 701.25a): mirar las primeras N cartas y
devolver **cualquier número, en cualquier orden**. La respuesta es
`SelectCards` con el conjunto **ordenado que se queda arriba**; lo que no está en
él va al otro sitio:

| | Lo que no se queda |
|---|---|
| Adivinar (*scry*) | al **fondo** de la biblioteca |
| Vigilar (*surveil*) | al **cementerio** |

Por eso comparten bloque y no comparten frase: un bloque único que dijera «al
fondo» estaría enseñando la regla equivocada la mitad de las veces. El destino se
nombra con el `kind` del prompt, que sale del tipo de `WaitingFor`, no de una
suposición.

**El orden es parte de la respuesta.** La primera carta de la lista es la nueva
cima, así que el bloque ordena esa lista y la deja mover (↑/↓ por carta), además
de marcar y desmarcar. Vacío es una respuesta legal y el botón lo dice con todas
las letras: «Confirmar: todo va al fondo / al cementerio».

**Composición explícita:** los candidatos de Phase para estas variantes enumeran
sólo el conjunto vacío, el conjunto completo y cada carta suelta
(`select_cards_variants(..., None)`), que es lo que necesita la IA, no lo que
permite la regla. La mesa compone el `SelectCards` con lo que el jugador marca
—igual que hace el descarte— y Phase sigue siendo quien valida: si rechaza, el
mensaje de rechazo de la sesión se muestra y no se aplica nada.

Laboratorio: `/ux?scene=scry` (tres cartas, dos arriba) y `/ux?scene=surveil` (dos
cartas), capturas `docs/screenshots/ux-adivinar-1440.jpg`,
`ux-vigilar-1440.jpg` y sus pares de tema.

### Verificación de esta pasada

`bun run check` 0 errores; `bun test src/lib` **401** (5 nuevas en
`game/__tests__/scry.test.ts`: la forma de scry, la de surveil con su destino, la
poda de basura, la acción ordenada y el caso ajeno); build OK; y en Chromium una
prueba nueva que marca dos cartas, comprueba el orden en el texto del botón, lo
mueve con ↑, quita una, y verifica que surveil dice «al cementerio» y cita CR
701.25a —con axe.

## Girar criaturas: tripular, montar y equipar (vigesimoséptima pasada, 7 nov 2026)

`CrewVehicle` y `SaddleMount` son la misma pregunta —girar criaturas tuyas cuya
aportación sume N— con dos palabras clave distintas, y `EquipTarget` es la
pregunta vecina que **no** suma nada: elegir a qué permanente se anexa el
equipo. Van juntas porque las tres giran alrededor del mismo objeto del
tablero, pero no comparten bloque: la primera necesita una suma y un umbral, la
tercera es una lista.

| `WaitingFor` | Pregunta | Respuesta | Regla |
|---|---|---|---|
| `CrewVehicle` | girar criaturas hasta `crew_power` | `CrewVehicle { vehicle_id, creature_ids }` | CR 702.122a |
| `SaddleMount` | girar criaturas hasta `saddle_power` | `SaddleMount { mount_id, creature_ids }` | CR 702.171a |
| `EquipTarget` | elegir `valid_targets` | `Equip { equipment_id, target_id }` por objetivo | CR 301.5, CR 702.6a |

**La suma es la del motor, no la del poder impreso.** `contributions` viene
alineado índice a índice con `eligible_creatures` y lo calcula
`object_crew_power_contribution`: un Piloto aporta más («como si su fuerza fuera
N mayor») y una Montura puede contar resistencia. Por eso el bloque suma esa
lista y no `power`, y por eso la fila de cada criatura enseña **su aportación**,
que puede no coincidir con la fuerza de la carta. Si el motor no publica la
lista, no hay suma que afirmar: el bloque dice exactamente eso («aquí no hay
suma que enseñar: valida la elección el motor») y deja confirmar sin inventar un
total.

**Montar no es tripular.** Son keywords distintas, con acciones distintas, y la
única que tiene restricción de momento es `SaddleMount` («Saddle may only be
activated as a sorcery», `engine.rs`). El bloque lo dice con la palabra del
keyword y cita CR 702.171a cuando el `kind` es `saddle`, en vez de reutilizar la
frase de crew.

**Cualquier subconjunto que sume es legal.** Los candidatos de la IA para estas
variantes son coberturas minimales (`minimal_power_subset_candidates`), pero el
manejador sólo compara el total de lo que llega con el umbral
(`PreparedContributionSnapshot::meets_threshold`), así que la mesa compone la
selección con lo que el jugador marca y Phase valida. Si rechaza, se muestra su
mensaje y no se aplica nada.

**Equipar no compone nada.** `valid_targets` ya es la lista de permanentes
legales y hay una acción `Equip` por cada uno: el bloque es esa lista, y no
ofrece un tercer candidato que Phase no haya publicado.

Los objetos del laboratorio son cartas que el propio motor cita en sus pruebas y
llevan **sólo lo que esos literales dicen**: `Smogbelcher Chariot` con Crew 3
(`tests/integration/balthier_and_fran_crew_history.rs`), `Ornery Tumblewagg` con
Saddle 2 (`tests/integration/attacks_while_saddled_trigger.rs`) y `Bonesplitter`
como Equipment (`game/layers.rs`). Coste de maná y fuerza/resistencia impresas
se dejan fuera antes que adivinarlas: el bloque no las necesita y sus números
salen de `contributions`.

Laboratorio: `/ux?scene=crew` (Crew 3 con aportaciones 2, 2 y 1: una criatura no
llega, dos sí), `/ux?scene=saddle` (Saddle 2) y `/ux?scene=equip` (dos
candidatos de tres criaturas). Capturas `docs/screenshots/ux-tripular-1440.jpg`,
`ux-montar-1440.jpg`, `ux-equipar-1440.jpg` y sus pares de tema.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **409** (8
nuevas en `game/__tests__/tap-power.test.ts`: la forma de crew, la de saddle con
su keyword, la ausencia de aportaciones, la poda de basura, la suma —incluido
que un id ajeno no infla el total—, la acción de cada keyword, el equip y el
caso ajeno); build OK; y en Chromium dos pruebas nuevas: tripular no deja
confirmar hasta llegar al umbral y montar dice que es otra acción, y equipar
ofrece exactamente los permanentes de Phase —las dos con axe—, más las tres
filas nuevas en la prueba de temas.

## La estación: una criatura, un número (vigesimoctava pasada, 7 nov 2026)

`StationTarget` es CR 702.184a y se parece a `CrewVehicle` lo justo para
confundirlos. La diferencia no es de forma, es de regla:

| | Qué se gira | Qué se gana |
|---|---|---|
| Tripular / Montar | **varias** criaturas cuya aportación **sume** N | el Vehículo o la Montura se convierte / se ensilla |
| Estación | **exactamente una** criatura | contadores de carga iguales a **su fuerza** |

Por eso el bloque no reutiliza la suma: una cifra por criatura elegida sería una
mentira. Lo que la elección decide es **cuánto carga la nave**, y eso tiene
consecuencia visible en la propia carta: `Entropic Battlecruiser` tiene umbrales
(«1+», «8+»), así que girar una 2/2 o una 5/5 no es lo mismo.

**Ningún contador se anuncia por adelantado.** El prompt publica sólo
`eligible_creatures` —criaturas desenderezadas que controlas, nunca la propia
nave—, y CR 702.184c permite que una estática module la aportación («como si su
fuerza fuera N mayor»). El bloque lo dice así: los contadores son la fuerza *tal
como la calcula el motor*, y puede no ser la impresa. Ni siquiera repite la
fuerza de la ficha: no sería el número que llega.

**Cancelar es una respuesta legal aquí.** CR 602.2b: el coste de girar no se paga
hasta el anuncio, así que el motor acepta `CancelCast` mientras el prompt está
abierto y no hay nada que deshacer. Eso lo distingue de la guardia, donde la
negativa no existe porque pagar ya estaba decidido; el bloque ofrece el botón y
explica que todavía no se ha pagado nada.

Objeto del laboratorio: `Entropic Battlecruiser`, con el texto de Station que el
motor cita literalmente en
`tests/integration/stack_entry_node_reach.rs` y sin coste ni P/T que ese literal
no traiga.

Laboratorio: `/ux?scene=station` (tres criaturas candidatas) y captura
`docs/screenshots/ux-estacion-1440.jpg`, más el par de temas.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **414** (5
nuevas en `game/__tests__/station.test.ts`: el Spacecraft con sus candidatas, que
el prompt no invente aportación, la poda de basura, la acción y el caso ajeno);
build OK; y en Chromium una prueba nueva que comprueba que es una criatura y no
una suma, que no hay contador prometido, que los candidatos son los de Phase y
que se puede cancelar —con axe—, más la escena en la prueba de temas.

## Objetivos múltiples: la ventana es la regla (vigesimonovena pasada, 7 nov 2026)

CR 601.2c: un hechizo o habilidad con más de una instancia de «objetivo» —«any
number of targets», «up to two target creatures», «dos criaturas objetivo»— pide
un **conjunto**, y el motor publica la ventana en la que ese conjunto es legal:
`min_targets..=max_targets`. No hay suma ni objetivo único: hay un rango, y el
rango *es* la regla.

| Texto de la carta | Ventana que llega |
|---|---|
| «any number of targets» | `min = 0`, `max` = los objetivos legales |
| «up to two target creatures» | `min = 0`, `max = 2` |
| «two target creature cards» | `min = max = 2` |

**Cero es una respuesta cuando el texto dice «up to».** Por eso el bloque no
deshabilita el botón con la lista vacía si `min` es 0: la etiqueta es «Confirmar
sin objetivos» y el motor la acepta. Cuando el mínimo no se alcanza, el botón no
ofrece nada: dice «Falta 1 objetivo» / «Faltan 2 objetivos» en vez de nombrar un
conjunto que Phase rechazaría.

**Por encima del máximo la fila deja de aceptar.** El motor rechaza el objetivo de
más (`"Must select between N and M targets"`), así que en vez de componer una
selección inválida la mesa la corta: con dos elegidos de dos, el tercero queda
deshabilitado y los elegidos se pueden soltar. CR 115.3 prohíbe nombrar dos veces
el mismo objetivo para una misma instancia de «objetivo»: cada permanente se
ofrece una vez y se alterna, así que duplicar es imposible por construcción.

**El conjunto no tiene orden.** `SelectCards` lleva el conjunto y la regla no lo
secuencia, así que la etiqueta de confirmación lista los nombres en el orden del
motor y no en el de los clics: dos jugadores que marquen lo mismo en distinto
orden leen lo mismo.

El nombre del hechizo que pregunta sale de `pending_ability.source_id`, que el
motor documenta como atribución; si no viene, el bloque no se inventa un nombre y
se queda en «Objetivos».

Objetos del laboratorio: `Frost Breath` («Tap up to two target creatures…», que el
motor cita en `tests/integration/added_untap_step_is_not_a_turn_start.rs`) con
tres candidatas y ventana 0..2, y `Grusilda, Monster Masher` («Put two target
creature cards from graveyards…», citada en
`tests/integration/combined_creature_coverage_honesty.rs`) con dos cartas de
criatura en el cementerio y cuenta fija 2.

Laboratorio: `/ux?scene=multiTarget` y `/ux?scene=multiTargetExact`; capturas
`docs/screenshots/ux-objetivos-multiples-1440.jpg` y
`ux-objetivos-fijos-1440.jpg`, más sus pares de tema.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **420** (6
nuevas en `game/__tests__/multi-target.test.ts`: la ventana publicada, la cuenta
fija y el mínimo, el máximo ausente que se lee del conjunto, la poda de basura, la
respuesta vacía y el caso ajeno); build OK; y en Chromium una prueba nueva que
recorre las dos ventanas —confirmar sin objetivos, llegar al máximo y ver el
tercero deshabilitado, y que con un objetivo de dos el botón diga «Falta 1
objetivo»— con axe, más las dos escenas en la prueba de temas.

## El reparto: ni sobra ni falta (trigésima pasada, 13 nov 2026)

`DistributeAmong` divide una cantidad —daño, contadores o vidas— entre
destinatarios, y el motor publica tres cosas: el total, los receptores legales
(`TargetRef`, así que también cuenta un jugador) y **cuándo** se elige el reparto.

| `scope` | Regla | Qué puede hacer el jugador |
|---|---|---|
| `announced` (CR 601.2d) | se elige al lanzar y **cada objetivo recibe al menos 1** | repartir entre todos, sin dejar ninguno a cero |
| `resolution` (CR 608.2d) | se elige al aplicarse el efecto | repartir entre los candidatos que quiera; el resto se queda fuera |

Un único validador (`validate_distribution`) comprueba que la suma sea **exactamente**
el total, que ninguna porción sea cero, que ningún receptor se repita y —sólo en
`announced`— que estén todos. El bloque dice esas reglas y no las adelanta: deja
componer y Phase decide; cuando la suma no cuadra, el botón lo nombra («Reparto
incompleto», «1 objetivo sin nada») en vez de ofrecer algo que el motor rechazaría.

**Lo que se puede quitar.** Los botones + se deshabilitan al llegar al total, así
que pasarse no es posible por construcción; el − sólo está activo con algo puesto.
El contador dice en todo momento cuánto queda, de modo que el jugador sabe si le
falta o le sobra antes de intentarlo.

**`EvenSplitDamage` no es una elección.** Cuando el motor reparte por igual
(`total / n`, resto al último), no hay nada que decidir: el bloque lo dice y no
pinta flechas que no cambiarían nada. Si el total no llega para uno por
destinatario, el reparto automático sería ilegal y el bloque no ofrece confirmar.

**Dos permanentes con el mismo nombre.** La escena tiene dos «Grizzly Bears», uno
por lado, y ambos son receptores legales: una fila con sólo el nombre sería
indistinguible de la otra, así que el bloque añade el controlador cuando el nombre
se repite —dato del motor, no una suposición—. Lo cazó la prueba de Chromium
(strict mode: dos botones con el mismo nombre accesible).

Laboratorio: `/ux?scene=distribute` (5 de daño entre tres candidatos, CR 608.2d) y
`/ux?scene=distributeAnnounced` (4 entre dos objetivos anunciados, CR 601.2d).
Capturas `docs/screenshots/ux-reparto-1440.jpg` y
`ux-reparto-anunciado-1440.jpg`, más sus pares de tema.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **428** (8 nuevas
en `game/__tests__/distribute.test.ts`: el reparto al resolver con candidatos
fuera, el `scope` ausente como anunciado, las unidades —contadores, vidas, reparto
por igual—, la poda de basura, la clave por tipo de receptor, la forma de la
acción, la regla del reparto por igual y el caso ajeno); `bun run engine:verify`
verde con el pin nuevo; build OK; y en Chromium una prueba nueva que compone 3+2,
comprueba que sobra/falta, que no se puede pasar del total, que quitar una porción
vuelve a bloquear, y que en anunciado un objetivo sin nada se nombra y bloquea
—con axe—, más las dos escenas en la prueba de temas.

## Mover contadores: el techo es el origen (trigésima primera pasada, 13 nov 2026)

`MoveCountersDistribution` es CR 122.5 + CR 608.2d: «mueve cualquier cantidad de
contadores». Se parece al reparto y no lo es: allí el total es fijo y se reparte;
aquí **el total no existe** y lo que manda es lo que hay en el origen.

| | Qué está fijado | Qué elige el jugador |
|---|---|---|
| Reparto (`DistributeAmong`) | cuánto se reparte | cómo se reparte |
| Mover contadores | cuántos hay de cada tipo | cuántos salen y a dónde |

El validador del motor rechaza una cantidad cero, un destino fuera de su lista, un
par (destino, tipo) repetido y cualquier petición que supere lo disponible **de ese
tipo**. Mover nada es legal —el texto dice «may»—, así que el botón arranca en
«Confirmar sin mover nada» y nunca se bloquea: no hay nada que completar.

**El techo es por tipo, no global.** Con 3 de +1/+1 y 1 de lealtad, vaciar el
primero no toca al segundo; el bloque lo enseña con un «quedan N de M» por tipo y
deshabilita los + de ese tipo cuando llega a cero, mientras los demás siguen
vivos. Los − sólo están activos con algo puesto, así que no hay forma de componer
una selección que Phase rechace.

**El vocabulario de contadores es uno solo.** El cable trae cadenas planas
(`P1P1`, `M1M1`, `loyalty`, `flying`) y la mesa ya tenía un traductor con
PascalCase para otras cargas; se extendió ese mismo mapa en vez de crear un
segundo. Lo que no está en el mapa conserva la palabra del motor: no se inventa un
nombre. Efecto secundario bienvenido: la ficha de Chandra, que enseñaba «4
loyalty», ahora dice «4 lealtad».

**Dos permanentes con el mismo nombre.** La escena tiene dos «Grizzly Bears», uno
por lado, y los dos son destinos legales; la etiqueta con controlador que estrenó
el reparto se extrajo a un ayudante compartido (`distinctTargetLabels`) y ahora la
usan los dos bloques, en vez de repetir la regla en cada componente.

Objeto del laboratorio: `Forgotten Ancient`, con el texto que el motor cita en
`tests/integration/issue_680_shalai_upkeep_move.rs` («move any number of +1/+1
counters from this creature onto other creatures»), 3 contadores +1/+1 en el
origen y tres destinos.

Laboratorio: `/ux?scene=moveCounters` y captura
`docs/screenshots/ux-mover-contadores-1440.jpg`, más el par de temas.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **434** (6 nuevas
en `game/__tests__/move-counters.test.ts`: el origen con su pozo por tipo, el tipo
acotado cuando el motor lo nombra, varios tipos con la basura podada, la forma de
la respuesta —incluido mover nada—, el vocabulario de contadores con su respaldo
en crudo y el caso ajeno); build OK; y en Chromium una prueba nueva que vacía el
pozo, comprueba que el + se apaga en todas las filas del tipo, que mover nada es
una respuesta y que soltar uno lo reabre —con axe—, más la escena en la prueba de
temas.

## Cambiar objetivos: un pozo por posición (trigésima segunda pasada, 13 nov 2026)

`RetargetChoice` es CR 115.7: cambiar los objetivos de un hechizo o habilidad que
**ya está en la pila**. La regla que decide la pantalla es CR 115.7a —«each target
can be changed only to another legal target»—, y es una regla **por posición**, no
por hechizo: el motor publica `slot_pools`, una lista alineada con `slots` donde
cada entrada es lo que *esa* posición admite, y `legal_new_targets` sólo como el
conjunto plano de respaldo. El bloque ofrece, en cada fila, exactamente su pozo.

| | Qué elige el jugador | ¿Se puede «dejar como está»? |
|---|---|---|
| `single` («change the target») | un objetivo nuevo, y sólo uno | **No**: no hay nada que conservar (el motor rechaza un `null`) |
| `all` («choose new targets») | cuántas posiciones cambiar y a qué | Sí, y no cambiar ninguna es una respuesta legal |

**La respuesta es un `Option` por posición**, en el espacio de índices del propio
prompt: `null` conserva, un `TargetRef` cambia. Por eso la cuenta de posiciones se
preserva y el botón de `all` nunca se bloquea: «dejar los objetivos como están» es
la respuesta por defecto, y el rótulo dice cuántas posiciones se mueven («Confirmar
2 de 2 cambios»). En `single` el botón arranca apagado y pide la elección.

**Dos sutilezas del contrato que la vista respeta en vez de adivinar:**

- un `slot_pools` **vacío por fuera** significa «sin refinamiento» y cada posición
  cae al conjunto plano; uno **vacío por dentro** significa «esta posición no
  admite nada» y no cae a nada. Se distinguen, y la fila lo dice.
- `keep_is_distinct` marca las posiciones donde el objeto anunciado ya no está: ahí
  nombrar el mismo id elige el objeto que volvió (CR 115.7d + CR 400.7), así que el
  objetivo declarado **sí** es una alternativa propia y se rotula como tal. En las
  demás posiciones se filtra: conservarlo es el valor por defecto, no una opción.
- `forced` no es interactivo (el motor lo aplica y rechaza una sumisión), así que
  el bloque no lo renderiza.

**Dos copias en el mismo lado.** La escena de `all` declara dos «Grizzly Bears» del
mismo jugador, y el sufijo de controlador que estrenó el reparto no los separa. El
ayudante compartido `distinctTargetLabels` ganó un tercer escalón: cuando el
nombre **y** el controlador siguen coincidiendo, añade el id que publica el motor
(`Grizzly Bears (Jugador 2) · #200`). Una etiqueta que se repite no es etiqueta.

Objetos del laboratorio: `Frost Breath` («tap up to two target creatures», dos
objetivos declarados) para `all`, y `Lightning Bolt` («deals 3 damage to any
target», un objetivo declarado con las dos sillas entre las alternativas) para
`single`. Ambos textos son los que el motor cita.

Laboratorio: `/ux?scene=retarget` y `/ux?scene=retargetSingle`, capturas
`docs/screenshots/ux-cambiar-objetivos-1440.jpg` y
`docs/screenshots/ux-cambiar-objetivo-1440.jpg`, más sus pares de tema.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **443** (9 nuevas
en `game/__tests__/retarget.test.ts`: el pozo por posición, el respaldo al
conjunto plano, el pozo interior vacío que no cae a nada, `single` con su
posición única, `keep_is_distinct`, `forced` que no renderiza, la basura podada, la
forma de la respuesta y el caso ajeno); build OK; y en Chromium dos pruebas nuevas
—`all` con sus dos filas, el objetivo declarado ausente de sus alternativas y el
contador de cambios que sube y baja; `single` con el botón apagado hasta elegir y
la segunda elección reemplazando a la primera— más las dos escenas en la prueba de
temas.

## Elegir objetos: la elección es «esos», y no es un objetivo (trigésima tercera pasada, 13 nov 2026)

`ChooseObjectsSelection` cubre dos efectos que comparten prompt y no son el mismo
caso: `ChooseObjectsIntoTrackedSet` (CR 608.2c), donde el jugador elige un
conjunto de permanentes que el resto del efecto llamará «esos», y el **receptor
descrito** de una instrucción de daño (CR 115.10a), donde la elección puede ser
además un asiento.

Lo que el motor publica decide la pantalla:

| Campo | Qué manda en la vista |
|---|---|
| `eligible` | la lista completa de lo elegible; nada fuera de ella se ofrece |
| `min` | el botón no se habilita por debajo |
| `max` ausente | «cualquier número», y el tope es lo elegible |
| `max` presente | las filas se apagan en cuanto se alcanza |
| un `Player` en `eligible` | es un receptor descrito, y el bloque lo dice |

**La elección no es un objetivo.** Ni el conjunto de CR 608.2c ni el receptor de
CR 115.10a se anuncian al ir a la pila, así que velo, antimaleficio, shroud y
protección no la restringen — y ésa es exactamente la razón por la que un jugador
puede aparecer aquí y en ningún otro bloque. El texto lo dice con esas palabras en
vez de dejar que el jugador lo adivine.

**No elegir es una respuesta**, no un estado incompleto: CR 608.2c publica un
conjunto nuevo y vacío, legal sólo cuando `min` es cero. Por eso el botón de la
escena «cualquiera» arranca habilitado con «Confirmar sin elegir ninguno», y el de
la escena «un receptor» arranca apagado con «Elige uno» — el rótulo dice qué falta
en vez de sólo estar gris.

**El conjunto es el que dice «esos».** La línea de recuento («Elegidos 2 · mínimo
0 · sin tope») usa los campos del contrato tal cual: `sin tope` es `max` ausente, y
`hasta N` es `max` presente. Cuando el tope está en lo elegible, no hay ninguna
fila que apagar.

Objetos del laboratorio: `Magnetic Mountain` («choose any number of tapped blue
creatures … pay {4} for each creature chosen this way», de
`tests/integration/magnetic_mountain_choose_and_pay.rs`) es la forma «cualquier
número», con `max` ausente; `Comet, Stellar Pup` («Comet deals damage equal to the
number of loyalty counters on him to a creature or player») es la forma del
receptor descrito, con un objeto y las dos sillas elegibles.

Laboratorio: `/ux?scene=chooseObjects` y `/ux?scene=chooseObjectsRecipient`,
capturas `docs/screenshots/ux-elegir-permanentes-1440.jpg` y
`docs/screenshots/ux-elegir-receptor-1440.jpg`, más sus pares de tema.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **450** (7 nuevas
en `game/__tests__/choose-objects.test.ts`: el conjunto con su ventana y su
disparo, el `max` ausente con su recorte a lo elegible, el asiento que marca
receptor, los valores por defecto del motor, la basura podada, la forma de la
respuesta —incluida la vacía— y el caso ajeno); build OK; y en Chromium dos
pruebas nuevas —el recuento que sigue a los toggles y la respuesta vacía; el
receptor con las filas apagadas al alcanzar `max` y reabiertas al soltar— más las
dos escenas en la prueba de temas.

## Proliferar y viajar en el tiempo: el mismo gesto, dos reglas (trigésima cuarta pasada, 13 nov 2026)

Dos variantes que comparten la forma —«elige cualquier número de estos», respondida
con un `SelectTargets`— y no comparten la regla:

| | Qué publica el motor | Qué hace el motor con lo elegido |
|---|---|---|
| `ProliferateChoice` (CR 701.34a) | lo que ya lleva contadores, permanentes **y** jugadores | a cada uno, otro contador de cada clase que ya tenga |
| `TimeTravelChoice` (CR 701.56a) | permanentes con contador de tiempo y cartas suspendidas en el exilio | a cada uno, **o** un contador de tiempo, **o** quitárselo |

**Proliferar no tiene ventana.** No hay mínimo ni máximo que respetar: el motor
publica exactamente lo que cualifica y el bloque lo ofrece tal cual. Que un jugador
aparezca en la lista es la parte que sorprende, y el texto lo explica en vez de
dejarlo a la deducción: elegir un jugador es elegir su veneno o su energía, porque
son contadores. Sin picks el botón sigue habilitado («Confirmar sin proliferar
nada»).

**El viaje en el tiempo son dos pantallas, no una.** El motor modela el «o» del
texto como dos fases sobre la misma respuesta: primero la de quitar (la habitual,
acercar cartas suspendidas a lanzarse) y después la de poner, sobre los objetos que
siguen elegibles **sin** los que acabas de restar — así cada objeto recibe o pierde,
no las dos cosas. La fase es el dato que cambia la pantalla: las mismas filas, el
verbo contrario, y el bloque lo rotula («quitar contadores» / «poner contadores»)
en la cabecera, en la regla y en el botón, con `−` o `+` en la fila elegida. Pedir
al jugador que recuerde en qué mitad está sería la forma más barata de equivocarse.

**Una respuesta, tres prompts.** `SelectTargets` ya era la respuesta de
`ChooseObjectsSelection`; se extrajo a `selectTargetsAction` y los tres la usan, en
vez de tres constructores idénticos. Lo que cambia entre ellos no es la forma de
responder, es lo que el motor hará después.

Objetos del laboratorio: `Steady Progress` («Proliferate.») para el conjunto que ya
lleva contadores —Chandra con 4 de lealtad, Forgotten Ancient con 3 de +1/+1 y los
dos asientos, que llevan veneno y energía—; `Ancestral Vision` y `Lotus Bloom`, las
cartas suspendidas canónicas, para las dos mitades del viaje. Las suspendidas viven
solo en `objects` (su zona es Exilio pero no están en `state.exile`), así que no
mueven ningún recuento de pila que el resto del laboratorio afirme.

Laboratorio: `/ux?scene=proliferate`, `/ux?scene=timeTravelRemove` y
`/ux?scene=timeTravelAdd`; capturas `docs/screenshots/ux-proliferar-1440.jpg`,
`ux-viaje-quitar-1440.jpg` y `ux-viaje-poner-1440.jpg`, más sus pares de tema.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **456** (6 nuevas en
`game/__tests__/proliferate-time-travel.test.ts`: el conjunto de proliferar con sus
asientos, la basura podada con el asiento del visor por defecto, la fase del viaje
en las dos mitades, la fase ausente o desconocida que cae en quitar, la respuesta
compartida y el caso ajeno); build OK; y en Chromium dos pruebas nuevas —proliferar
con el recuento que sigue a los toggles y la respuesta vacía; el viaje en el tiempo
con el verbo de cada mitad, el `−`/`+` de la fila y la ausencia del objeto ya
restado— más las tres escenas en la prueba de temas.

## Conservar un permanente de cada tipo (trigésima quinta pasada, 13 nov 2026)

`CategoryChoice` es CR 101.4 + CR 701.21a: «each player chooses one permanent of
each of those types from among the permanents they control, then sacrifices the
rest». Es la primera vista del port con **una ranura por categoría** en vez de una
lista de la que elegir libremente, y ahí está toda su dificultad.

El motor publica una lista de candidatos **por categoría** (`eligible_per_category`,
alineada con `categories`) y espera una respuesta con **una entrada por categoría**:
una elección donde hay candidatos y `null` donde no los hay. Rechaza las dos
formas de equivocarse —elegir en una categoría vacía y dejar hueco en una llena—,
así que la ranura vacía no es un descuido de la pantalla: es lo que dice la carga.
El bloque la rotula («sin candidatos» / «Nada que conservar de este tipo») en vez de
esconderla, y el botón no se habilita hasta que cada categoría con candidatos tiene
la suya.

**Una carta puede cubrir dos ranuras.** Un artefacto que también es criatura
satisface Artifact y Creature a la vez; el motor dedupe el conjunto protegido, no la
pantalla. El bloque lo dice y cuenta los distintos: el botón anuncia «Conservar N y
sacrificar el resto» con N = permanentes distintos, no con N = ranuras rellenas.

**Quién elige.** `chooser_scope` cambia el sujeto de la frase y por eso la cabecera
lo dice con nombre propio: `EachPlayerSelf` («eliges de entre los permanentes del
Jugador n») o `ControllerForAll` («eliges tú por todos los jugadores del efecto, y
ahora te toca el Jugador n»). `remaining_players` es el orden APNAP: cuando queda
alguien, el botón lo anuncia («después elige el Jugador 2») para que la respuesta no
parezca definitiva.

Objetos del laboratorio: `Cataclysm` (una ranura por tipo, con Encantamiento vacío y
el Jugador 2 por venir) y `Tragic Arrogance` (elige por el rival: sus dos Grizzly
Bears y su Chandra). Los tipos se leen en castellano con el traductor que ya tenía
la mesa (`coreTypeLabel`), y lo que no está en el mapa conserva la palabra del
motor.

Laboratorio: `/ux?scene=category` y `/ux?scene=categoryForAll`, capturas
`docs/screenshots/ux-conservar-tipos-1440.jpg` y
`docs/screenshots/ux-conservar-por-todos-1440.jpg`, más sus pares de tema.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **463** (7 nuevas en
`game/__tests__/category-choice.test.ts`: las listas por categoría, la categoría que
falta en la carga sin corrimiento, la basura podada por categoría, los dos
`chooser_scope` con su jugador y su orden APNAP, la forma de la respuesta con sus
`null`, el traductor de tipos y el caso ajeno); build OK; y en Chromium dos pruebas
nuevas —las cuatro ranuras con la vacía, el reemplazo dentro de una categoría y el
«después elige el Jugador 2»; y la variante que elige de la mesa del rival, con dos
homónimos separados por id— más las dos escenas en la prueba de temas.

## Copiar la elegida: el orden es la regla (trigésima sexta pasada, 13 nov 2026)

`EachPlayerCopyChosenSelection` es CR 707.2 + CR 101.4, con la fenomenal
`Human—Time Lord Meta-Crisis` como caso real: «each player chooses one or two
creatures they control. Each player creates a token that's a copy of the **first**
creature they chose… Then each player who chose a second creature puts a number of
+1/+1 counters on the token they created equal to the power of the second creature
they chose».

**Es la primera vista del port donde el orden de la elección cambia el resultado**,
y eso decidió el diseño: la respuesta es una lista **ordenada** en la que el índice
0 se copia y el 1 sólo se lee para los contadores. Un conjunto de botones con
`aria-pressed` habría sido más corto y habría mentido —los dos elegidos no son
intercambiables—, así que el bloque numera la elección tal como se hace («1º · se
copia», «2º · escala la copia»), pone el ordinal también en el chip y deja que
quitar el primero **renumere** los demás. Rehacer el orden sin rehacer los clics es
la única forma honesta de corregirlo.

Lo demás lo dice el contrato, no la pantalla:

- `min`/`max` son la ventana (1..2 aquí), y al llegar a `max` se apagan los chips;
- `choose_scope` cambia de quién es el pozo —el tuyo o el de tu vecino de izquierda
  o derecha (CR 102.1)—, y la cabecera lo nombra;
- `scale` trae el tipo de contador y la propiedad que se lee, así que la línea de
  escalado se compone de los datos (`+1/+1` y `fuerza`) en vez de suponer «+1/+1
  por la fuerza de la carta que copias»;
- `all_choices` son las elecciones de los jugadores anteriores en orden APNAP y
  **nada se aplica hasta que elija el último**, así que el bloque las enseña y lo
  recuerda en la misma línea.

**Un arreglo de infraestructura que pidió el catálogo:** la prueba de temas recorre
las escenas dentro de un `test` por tema, y con 31 escenas pasó el límite de 120 s
del proyecto. No se recortó la prueba: se le dio a ese fichero su propio
presupuesto (300 s) con el motivo escrito al lado, porque su coste crece con el
catálogo y el límite global es para un test corto.

Objetos del laboratorio: `Human—Time Lord Meta-Crisis` como fuente, con las tres
criaturas del jugador 1 para la forma propia y las dos del rival —homónimas, con el
id separándolas— para la del vecino, que además trae la elección previa del
Jugador 2.

Laboratorio: `/ux?scene=copyChosen` y `/ux?scene=copyChosenNeighbor`, capturas
`docs/screenshots/ux-copiar-elegida-1440.jpg` y
`docs/screenshots/ux-copiar-vecino-1440.jpg`, más sus pares de tema.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **471** (8 nuevas en
`game/__tests__/copy-chosen.test.ts`: la ventana con la cláusula de escalado y la
fuente, los objetos como único pozo, los tres `choose_scope`, la cláusula opcional
con sus dos mitades juntas, las elecciones previas en APNAP sin rondas vacías, la
respuesta que conserva el orden —y que se distingue si se invierte—, la propiedad
traducida y el caso ajeno); build OK; y en Chromium dos pruebas nuevas —los dos
puestos numerados, el `max` que cierra la lista y el renumerado al quitar el
primero; y la variante del vecino con su pozo ajeno y la elección previa— más las
dos escenas en la prueba de temas.

## Conservar por fuerza total: la ventana es una suma (trigésima séptima pasada, 13 nov 2026)

`KeepWithinTotalPowerChoice` es CR 107.1c + CR 701.21a, con `Slaughter the Strong`
como caso real: «each player chooses any number of creatures they control with
total power 4 or less, then sacrifices all other creatures they control».

**Es la primera ventana del port que no cuenta, sino que suma.** Todo lo anterior
—el reparto, los contadores, los tipos, la copia— se medía en unidades; aquí el
número que decide es la **suma de la fuerza** del subconjunto elegido frente a un
tope que el motor ya resolvió (CR 608.2h) y que la pantalla no recalcula. De ahí que
el bloque sea, en el fondo, un total corriente: «Fuerza elegida 3 de 4 · quedan 1»,
con las criaturas que desbordarían el tope **apagadas** en vez de aceptadas y
rechazadas después, y con la suma reabriendo esas filas en cuanto se suelta una.

**La fuerza es un dato publicado, no una suposición.** Se lee del objeto
(`power`). Cuando falta —un objeto que el motor no completó— el bloque no inventa un
cero: marca el total como desconocido, avisa de que sólo cuenta lo publicado y deja
que el motor haga la cuenta final, que es suya.

**Cero es una respuesta legal**, y aquí es la más cara: «any number» admite cero, y
confirmar sin conservar ninguna sacrifica todo. El botón lo dice con esas palabras
(«Confirmar sin conservar ninguna»), porque un botón gris habría escondido la
consecuencia en vez de anunciarla.

`chooser_scope` vuelve a cambiar el sujeto —«eliges de entre las criaturas del
Jugador n» o «eliges tú por todos los jugadores del efecto»— y `remaining_players`
se anuncia al final del botón, como en las dos pasadas anteriores.

Objetos del laboratorio: las tres criaturas del jugador 1 (2, 2 y 1 de fuerza, suma
5 frente al tope 4, así que la tercera sólo cabe si se suelta una) para la forma
propia, y las dos del rival (2 y 2, tope 3) para la que elige por todos.

Laboratorio: `/ux?scene=keepPower` y `/ux?scene=keepPowerForAll`, capturas
`docs/screenshots/ux-conservar-fuerza-1440.jpg` y
`docs/screenshots/ux-conservar-fuerza-todos-1440.jpg`, más sus pares de tema.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **477** (6 nuevas en
`game/__tests__/keep-power.test.ts`: el pozo con su tope resuelto, la forma que
elige por todos con sus elecciones previas, la basura podada con el tope ausente en
cero —no adivinado—, los valores por defecto del asiento, la respuesta con el
subconjunto y el caso ajeno); build OK; y en Chromium dos pruebas nuevas —el total
que sube y baja, la criatura que desborda apagada y reabierta, y el rótulo del cero;
y la variante que elige por el rival con su tope de 3— más las dos escenas en la
prueba de temas.

## Conservar exactos: el número ya lo resolvió el motor (trigésima octava pasada, 7 nov 2026)

`KeepExactPermanentsChoice` es CR 101.4 + CR 701.21a, y es la **otra mitad** de la
pasada anterior: la misma familia de «conserva y sacrifica el resto», pero medida en
**unidades** y con una cardinalidad **exacta**. `Razia's Purification` la fija en tres
(«each player chooses three permanents they control, then sacrifices the rest»); el
`KeeperConstraint::ExactCount` genérico la usa para cualquier carta que diga un número.
Viene justo detrás de la ventana de fuerza total, y compararlas es el mejor resumen
del port: allí la pantalla **sumaba** y decidía si un candidato cabía; aquí no hay
nada que sumar, sólo un número que llega resuelto.

**El número no se recalcula.** El propio contrato del payload lo dice: `required_count`
llega **ya recortado** al pozo elegible bajo la regla «haz todo lo posible» de CR 609.3,
y los clientes lo **muestran**; no derivan una segunda regla de legalidad a partir de
`eligible.len()`. Así que el bloque no tiene una copia de la regla: rotula el número,
cuenta hacia él («Elegidos 2 de 3») y no lo baja en silencio si el pozo viene corto.
Ese detalle se ve en el código: la primera versión de esta pasada tenía una rama que
avisaba de un pozo insuficiente, y se quitó —no porque no pudiera pasar, sino porque
pintarla habría sido **inventar un estado** que el motor no publica. Lo que sí se dice
es de dónde viene la cifra: «Hay 5 candidatos y el número ya viene recortado a lo que
se puede hacer (CR 609.3)».

**Cero no es una respuesta aquí**, y por eso el bloque es el reverso del de la pasada
37: allí «any number» incluía cero y el botón lo anunciaba; aquí el botón está apagado
y dice cuántos faltan («Elige 2 más»), porque el número es exacto y confirmar antes de
tiempo no es una jugada legal. La contrapartida tampoco es un tope de suma: al llegar
a tres se apagan **todos** los candidatos de más, y soltar uno los **reabre todos**,
porque el techo es una cuenta, no una suma.

**El contador del guardián se anuncia antes del sacrificio.** Cuando la instrucción
debe una marca a lo conservado —`Promise of Loyalty` pone un contador de voto «and
sacrifices the rest»—, el payload la trae con su número ya resuelto (CR 608.2c +
CR 122.1, CR 608.2h), porque la habilidad ya no existe cuando se reanuda
`ChooseKeptPermanents`. El bloque la dice en la misma frase que la elección, que es
donde ocurre: cada permanente conservado recibe el contador **antes** de que se
sacrifique el resto. El nombre del contador no se traduce cuando no está en el
vocabulario de la mesa (`vow`), igual que en las demás vistas de contadores: se queda
con la palabra del motor en vez de inventarle una.

`chooser_scope` y `remaining_players` se comportan como en las dos pasadas anteriores
—la forma que elige por todos y el «después elige el Jugador n» al final del botón—, y
el sujeto se nombra con «los candidatos del Jugador n»: los filtros (`choose_filter`,
`sacrifice_filter`) pueden pedir criaturas y no permanentes, y esta vista no los lee.

Objetos del laboratorio, los dos con el texto literal que el motor prueba en
`tests/integration/promise_of_loyalty.rs`: el jugador 1 con cinco permanentes
(criaturas y tierras, que es lo que `Razia's Purification` deja elegir) para la forma
de tres, y sus tres criaturas para la del voto, que pide una.

Laboratorio: `/ux?scene=keepExact` y `/ux?scene=keepExactVow`, capturas
`docs/screenshots/ux-conservar-exactos-1440.jpg` y
`docs/screenshots/ux-conservar-exactos-voto-1440.jpg`, más sus pares de tema.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **487** (10 nuevas en
`game/__tests__/keep-exact.test.ts`: el pozo con su número exacto, el alias `count`,
la cifra ausente en cero y no adivinada del pozo, la marca con su cuenta y su palabra
del motor en las dos formas, la marca que no nombra contador, la forma que elige por
todos, la basura podada con la cifra negativa a cero, los valores por defecto del
asiento, la respuesta con el conjunto elegido y el caso ajeno); build OK; y en
Chromium dos pruebas nuevas —el número del motor con el candidato de más apagado, la
cuenta que cierra y reabre, y el botón que no admite cero; y la variante con voto, con
el contador anunciado antes del sacrificio— más las dos escenas en la prueba de temas.

## Quitar contadores: dos techos que no son el mismo (trigésima novena pasada, 7 nov 2026)

`RemoveCountersChoice` es CR 107.1c + CR 608.2d, y llega con dos formas que la misma
ventana tiene que servir sin confundirlas: **«quita cualquier número de contadores»**
(`Rhys, the Evermore`; `Tetravus`) y **«quita hasta N contadores»** (`Hex Parasite`,
donde N es la X anunciada, CR 107.3a).

**Los dos techos son del motor, y son distintos.** El primero es por tipo: lo que el
origen lleva de verdad, que el payload publica como `available`. El segundo es global:
`max_total`, que el motor ya acotó a lo que hay (CR 608.2d) y que `None` deja
**abierto** cuando el texto no limita nada. El bloque no convierte ese `None` en un
número: dice «Sin tope: el texto no limita cuántos, sólo los que hay (CR 107.1c)», y
cuando sí hay tope lo cuenta hacia atrás —«Tope 2 en total · quedan 1»—. Es la
diferencia práctica con la vista de **mover** contadores, que sólo tiene el techo por
tipo porque mover no gasta presupuesto: aquí los tipos **comparten** el presupuesto, y
por eso agotarlo apaga los `+` de todos los tipos a la vez, incluido el que todavía
tiene contadores. Bajar uno reabre todos.

**Se elige con pasos, no escribiendo.** Cada fila es `− N de M +`: no hay campo de
texto que pueda quedar por encima del techo, y el motor —que rechaza un cero, un tipo
repetido, más de lo que hay y un total por encima del tope— no tiene que rechazar
nada de lo que la pantalla deja construir.

**Cero es legal** (CR 107.1c: «any number» incluye cero), así que el botón no queda
gris a la espera: dice «No quitar ninguno» y confirma. En la forma con tope el cero
también vale —`Hex Parasite` puede anunciar X y no quitar nada—, y el bloque lo trata
igual.

Dos detalles del contrato que se respetan sin adornarlos:

- `counter_type` llega puesto cuando el texto nombra el tipo (`Tetravus`: «+1/+1») y el
  motor ya filtró `available` a ese tipo. El bloque **no vuelve a filtrar**: muestra lo
  que llega.
- Los nombres de contador son cadenas planas en el cable (`P1P1`, `charge`, `vow`),
  porque el propio `HashMap<CounterType, u32>` del objeto se serializa así. La tabla de
  vocabulario ganó `charge → carga`, que era la única grafía que faltaba de un contador
  que ya estaba en ella; lo que no está en la tabla sigue mostrándose con la palabra del
  motor.

Objetos del laboratorio, con el texto literal de
`tests/integration/rhys_evermore_remove_counters.rs` y los contadores que ese test da a
cada portador: `Rhys, the Evermore` sobre un portador propio con tres +1/+1 y dos carga
(sin tope) y `Hex Parasite` sobre uno rival con dos +1/+1 y una carga (tope 2). El
fixture **omite `pending_effect`** a propósito: es contabilidad del motor, esta vista no
lo lee y escribir uno sería inventarlo.

Laboratorio: `/ux?scene=removeCounters` y `/ux?scene=removeCountersCapped`, capturas
`docs/screenshots/ux-quitar-contadores-1440.jpg` y
`docs/screenshots/ux-quitar-contadores-tope-1440.jpg`, más sus pares de tema.

### Corrección de la pasada 38

Al leer el contrato de esta vista salió una errata en la escena anterior: el
`keeper_counter` se escribió como `[{ "Generic": "vow" }, 1]`, pero `CounterType`
serializa como **cadena plana** —`["vow", 1]`—, que es lo que el motor escribe. La
escena ya usa la forma del motor; el bloque renderizaba lo mismo por las dos, así que
las capturas de la pasada 38 siguen siendo válidas y la prueba que las acompaña no
cambia.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **496** (9 nuevas en
`game/__tests__/remove-counters.test.ts`: el pozo con el tope resuelto, el «hasta N»
con su cero —que no es «sin tope»—, el tipo que el efecto nombra, los nombres planos y
envueltos, la basura podada —incluida la cadena vacía—, el tipo que no es contador, los
valores por defecto, la respuesta con los nombres de campo del motor y el caso ajeno);
build OK; y en Chromium dos pruebas nuevas —la forma sin tope con su único límite por
tipo y el cero legal; y la del tope, con el presupuesto compartido que apaga todos los
tipos y se reabre al bajar uno— más las dos escenas en la prueba de temas.
