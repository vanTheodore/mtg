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

## Los objetivos de una copia: el motor pregunta ranura a ranura (cuadragésima pasada, 7 nov 2026)

`CopyRetarget` es CR 707.10c —«you may choose new targets for the copy»— y, en la
misma variante, CR 722.3c + CR 702.192a: la copia que **se lanza** anuncia sus propios
objetivos (CR 601.2c + CR 707.12). Es la primera vista del port que no es una pregunta
suelta sino un **recorrido**: el motor pregunta una ranura, recibe la respuesta, avanza
a la siguiente y vuelve a preguntar hasta cerrar. Por eso el bloque no es una lista de
objetivos: es el **estado del recorrido**.

**Lo que se ve es el recorrido, no una foto.** El payload trae `current_slot`, el
prefijo ya decidido (`picks`) y las ranuras con su objetivo actual. El bloque rotula
«Objetivo 2 de 2», lista lo ya decidido —incluido «se queda como estaba», porque un
`None` en el prefijo significa *sin cambios*, no *sin objetivo*— y ofrece sólo lo que
la ranura actual admite.

**Ninguna regla se recalcula aquí.** Las tres puertas son del motor y llegan resueltas
en cada paso: `can_keep` (dejar esa ranura como está, CR 707.10c), `can_decline` (una
ranura opcional que se declina, CR 115.6, sólo en el recorrido de anuncio) y
`can_keep_rest` (dejar todo lo que queda, que el motor expone como su propia acción
`KeepAllCopyTargets`). La pantalla las pinta; si una no viene, no aparece.

**Por qué este bloque no guarda estado propio.** Todas las demás ventanas de esta rama
tienen una selección en `session.svelte.ts` porque la respuesta se compone antes de
enviarse. Esta no: el motor avanza el recorrido tras **cada** acción y reemite la
pregunta con el prefijo actualizado, así que una copia local sería un segundo
contable de algo que el motor ya cuenta. La sesión sólo expone las tres respuestas
—`answerCopySlot(t | null)`, `keepRemainingCopyTargets()` y `chooseCopyAnnouncer(p)`—,
y por eso no hay `reset` nuevo en los puntos de siempre.

**Un recorrido puede abrirse sin ranura.** Si el hechizo copiado tiene objetivos «de
elección de un oponente», el recorrido empieza eligiendo **qué oponente** los anuncia
(CR 601.2c + CR 115.1, CR 707.12): entonces `target_slots` viene vacío y la pregunta es
otra. El bloque lo dice con esas palabras y ofrece los asientos que el motor publica,
en vez de quedarse con una lista de objetivos vacía.

Objetos del laboratorio: la copia de `Shock` que hace `Twincast` —la carta con la que
el motor prueba la cláusula sin rider— para la forma de cambiar objetivos, y la copia
de `Frost Breath` que lanza `Mizzix's Mastery` para la de anunciar: «up to two», ya
pasada la primera ranura, con la segunda declinable.

Laboratorio: `/ux?scene=copyRetarget` y `/ux?scene=copyAnnounce`, capturas
`docs/screenshots/ux-objetivos-copia-1440.jpg` y
`docs/screenshots/ux-copia-anuncia-1440.jpg`, más sus pares de tema.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **506** (10 nuevas en
`game/__tests__/copy-retarget.test.ts`: la ranura con sus permisos y el prefijo, el
recorrido de anuncio sin nada que conservar, el prefijo con una ranura conservada, el
modo y la ranura por defecto, la elección de oponente como pregunta aparte, las ranuras
basura podadas, el controlador que sólo aparece cuando responde otro asiento, los
valores por defecto, las tres acciones del motor y el caso ajeno); build OK; y en
Chromium dos pruebas nuevas —la forma de cambiar objetivos con sus alternativas y las
tres puertas; y la de anunciar, con el prefijo visible, la ranura opcional y la
ausencia de «conservar»— más las dos escenas en la prueba de temas.

## Votar es una sesión, no una pregunta (cuadragésima primera pasada, 7 nov 2026)

`VoteChoice` es CR 101.4 + CR 701.38a–d, y el motor lo corre como una **sesión**: cada
jugador emite sus votos en orden de turno, los votos extra se resuelven en el momento
en que el jugador votaría una vez (CR 701.38d) y el recuento no se aplica hasta que la
cola se vacía. Por eso el bloque no es una papeleta: es la **sala**. Dice a quién le
toca, quién votará después, qué se ha votado ya y qué queda.

**Dos papeletas que se contestan distinto.** Un voto **con nombre** («votes for profit
or security») responde con la palabra canónica que el motor compara —`ChooseOption
{ choice }`— mientras la pantalla enseña la etiqueta del texto original. Un voto
**sobre objetos** (Council's Judgment, «votes for a nonland permanent you don't
control») responde con el **índice** del candidato —`SubmitVoteCandidate`—, porque dos
candidatos pueden llamarse igual y el motor no puede desempatarlos por nombre
(CR 701.38b). La misma ventana sirve las dos y lo dice en la cabecera.

**Quién contesta lo decide el motor.** `actor` es `SubjectActs` (vota el propio
jugador) o `Delegated(p)` (vota otro asiento por él, como en friend-or-foe). El bloque
se abre según el asiento **resuelto**, no según `player`, y cuando son distintos lo
explica en la línea del turno. Es el primer sitio del port donde el que responde y el
que vota pueden ser dos jugadores diferentes.

**El voto secreto se anuncia como secreto.** En `visibility: Secret` el motor borra
los recuentos y las papeletas de la vista hasta la revelación simultánea, así que la
vista filtrada trae ceros que **no significan «nadie ha votado»**. El bloque no los
pinta como un recuento: dice que es secreto y que el número no se publica hasta el
final. Es la misma regla de siempre —no inventar un estado— aplicada a una ausencia que
tiene forma de dato.

Como el recorrido de la copia, esta vista **no guarda estado propio**: cada papeleta se
envía y el motor vuelve a preguntar con el recuento actualizado, así que un borrador
local sería un segundo contable.

**Corrección de la propuesta anterior.** La variante propuesta al cerrar la pasada 39
era `AssignBlockerDamage`, que resultó **ya estar representada** (`DamageAssignment`
la sirve junto a `AssignCombatDamage`, y está en `REPRESENTED` desde hace treinta
pasadas). En vez de portar lo que ya estaba, se comparó el censo del pin —148
variantes— con `REPRESENTED` y quedan **96** sin vista propia; de esas se eligió esta,
que tiene pantalla propia y ninguna otra la cubre.

Objetos del laboratorio: `Emissary Green` (trigger de ataque, texto literal de
`emissary_green.rs`) para el voto con nombre en su primera papeleta, y `Council's
Judgment` lanzado por el rival —de modo que su controlador vota primero y el jugador
del asiento 1 contesta después— para el voto sobre objetos, con una papeleta ya
tallada. El texto de esa segunda carta es la cláusula que el propio test del motor
parsea, no más.

Laboratorio: `/ux?scene=vote` y `/ux?scene=voteObject`, capturas
`docs/screenshots/ux-votacion-1440.jpg` y `docs/screenshots/ux-votacion-objetos-1440.jpg`,
más sus pares de tema.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **517** (11 nuevas en
`game/__tests__/vote.test.ts`: el voto con nombre con sus etiquetas y su recuento, la
papeleta por índice con los ids de candidato, la etiqueta ausente que cae a la palabra
canónica, los votos múltiples con su cero que sigue siendo uno, la delegación en los dos
sentidos, el voto secreto, la basura podada, los recuentos de más y los que faltan, los
valores por defecto y las dos acciones); build OK; y en Chromium dos pruebas nuevas —la
sesión con nombre con su turno y su recuento vacío; y la de objetos con la papeleta ya
emitida y su índice— más las dos escenas en la prueba de temas.

## Explorar es elegir un orden (cuadragésima segunda pasada, 7 nov 2026)

`ExploreChoice` es CR 701.44d, y no es la acción de explorar: es la **cola**. Cuando
varios permanentes exploran a la vez —«each Merfolk creature you control explores»—,
quien los controla elige **en qué orden**, uno por paso, y el motor vuelve a preguntar
tras cada elección. La vista, por tanto, no enseña la carta revelada: enseña a quién le
toca.

**Los dos listados no son el mismo y la diferencia importa.** El payload trae
`choosable` (lo que este jugador puede mandar ahora) y `remaining` (la cola entera). Si
exploran permanentes de varios jugadores, cada uno ordena los suyos (CR 101.4), así que
la cola puede ser más larga que lo elegible. El bloque lo dice con esas palabras —«Quedan
4 por explorar; 2 de ellos los elige su controlador»— y lista aparte lo que está en cola
para otros, en vez de ofrecer filas que no se pueden pulsar.

**CR 701.44a se enuncia, no se pregunta.** Lo que ocurre después —revelar la primera
carta de la biblioteca del controlador, tierra a la mano, y si no un contador +1/+1— es
resolución del motor. La vista lo cuenta para que la elección tenga sentido y no finge
un paso que no existe en este prompt.

**El origen no se nombra si no está.** `source_id` nombra la habilidad que provocó la
exploración; en el fixture del laboratorio no hay objeto para ella, y el bloque
simplemente no pinta un nombre que no tiene. Es la misma regla de siempre, aquí aplicada
a un dato opcional por diseño.

Objetos del laboratorio: tres Merfolk del jugador 1 —`Merfolk Looter`, `Rootwater
Commando` y `Rootwater Matriarch`, con los nombres, tipos y fuerza/resistencia reales
de `data/mtgjson/10E.es.json`— para la forma propia, y dos Merfolk más del rival para
la compartida, donde las dos listas se separan. Viven sólo en `objects`: la ventana los
nombra y ninguna fila de la mesa cambia, así que los recuentos que el resto del
laboratorio comprueba siguen quietos.

Laboratorio: `/ux?scene=explore` y `/ux?scene=exploreShared`, capturas
`docs/screenshots/ux-quien-explora-1440.jpg` y
`docs/screenshots/ux-explorar-dos-jugadores-1440.jpg`, más sus pares de tema.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **524** (7 nuevas en
`game/__tests__/explore-choice.test.ts`: los dos listados tal cual llegan, la cola más
larga que lo elegible, la basura podada —incluida la cadena `'391'` que no es un id—,
el listado ausente que es vacío y no se adivina del otro, los valores por defecto y la
acción del motor); build OK; y en Chromium dos pruebas nuevas —la forma propia con su
cola y su CR 701.44a enunciado; y la compartida, con la diferencia entre los listados y
los nombres desempatados por controlador— más las dos escenas en la prueba de temas
(que subió su presupuesto a 480 s al llegar a 44 escenas).

## Separar en dos montones es un flujo de tres etapas (cuadragésima tercera pasada, 7 nov 2026)

`SeparatePilesChooseOpponent`, `SeparatePilesPartition` y `SeparatePilesChoice` son
**una sola sesión** de `WaitingFor`, no tres pantallas sueltas: el motor pregunta quién
separa, luego espera el reparto de esa persona y por último pide a cada afectado que se
quede con un montón. Portarlas por separado habría dejado tres ventanas que nunca se
ven juntas; se portaron como un bloque con tres etapas, que es como llegan.

**La etapa de elegir rival sólo existe con más de un oponente.** `ChooseOpponent`
enumera a los rivales (`remaining_subjects` mientras quedan, `current` el que separa) y
con un único rival el motor **no pregunta**: pasa directo al reparto. Por eso el
laboratorio no inventa esa escena —no hay forma de alcanzarla con dos jugadores— y el
componente la pinta sólo cuando el payload la trae.

**Sólo se envía el montón A (CR 700.3a).** `SubmitPilePartition` lleva `pile_a` y el
motor deriva B con lo que no se nombró; el botón lo dice así —«Separar en dos montones
(n y m)»— y el resumen de la ventana cuenta las dos mitades antes de confirmar. Un
montón vacío es legal (CR 700.3d): dejar todo de un lado no es un error, así que la
acción se etiqueta «Dejar todo en el montón B» en vez de deshabilitarse.

**La elección final es de quien no separó.** `SeparatePilesChoice` reparte `pending`
(los que aún eligen) y `current` (el que elige ahora, con sus dos montones ya fijos); el
actor es ese jugador, no el que separó, y el bloque lo rotula con su nombre. `ChoosePile`
manda `{ pile: { type: 'A' | 'B' } }` —tipo, no índice— porque los montones no están
ordenados en el payload.

**El origen decide el sustantivo.** `PileSource` dice de dónde salen las cartas:
`Battlefield` (por defecto si el campo no viene) ⇒ «permanentes», y
`RevealedFromLibraryTop`/`ExiledThisWay` ⇒ «cartas». La ventana usa esa palabra en su
primera frase en vez de llamar permanentes a lo que no lo es.

Objetos del laboratorio: en el reparto, tres permanentes del propio jugador 1 (`Grizzly
Bears`, `Savannah Lions`, `Elvish Mystic`, con sus datos reales de
`data/mtgjson/10E.es.json`); en la elección, dos permanentes del rival —#200 y #201— para
que los dos montones se lean como del jugador 2 (`CR 700.3`), separados por `· #id` al
ser homónimos.

Laboratorio: `/ux?scene=pilePartition` y `/ux?scene=pileChoice`, capturas
`docs/screenshots/ux-separar-montones-1440.jpg` y `docs/screenshots/ux-elegir-monton-1440.jpg`,
más sus pares de tema.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **533** (9 nuevas en
`game/__tests__/separate-piles.test.ts`: las tres etapas, el reparto sin `pile_a`, el
montón vacío que sigue siendo acción válida, la elección con `type` y no índice, `pending`
sin sujeto podado frente al sujeto con dos montones vacíos, el actor por defecto en el
asiento del espectador y en `current`, y la acción exacta de cada etapa); build OK; y en
Chromium dos pruebas nuevas —el reparto con su resumen y su «Dejar todo en el montón B»,
y la elección con los dos montones del rival— más las dos escenas en la prueba de temas
(que sigue en 480 s de presupuesto al llegar a 46 escenas).

## Revelar no es lanzar: el milagro es una oferta, no un hechizo (cuadragésima cuarta pasada, 7 nov 2026)

`MiracleReveal` (CR 702.94a) parece un «¿quieres lanzar esta carta?» y no lo es. La
primera carta que un jugador roba en un turno puede llevar `Miracle`, y Phase ofrece
**revelarla**: el motor emite el evento de revelado, pone en la pila la habilidad
disparada —«cuando reveles esta carta de esta manera, puedes lanzarla pagando [coste de
milagro]»— y **vuelve a la prioridad**. La mesa entera puede responder antes de que el
hechizo se lance, así que la ventana dice que revelar todavía no lanza nada (CR 608.2g) y
el botón no promete un lanzamiento que aún no ha ocurrido.

**El coste llega fijado y no se relee.** `cost` viene en la propia oferta porque la fuente
que concedió milagro puede haber abandonado el campo de batalla antes de que la oferta se
resuelva, y el motor no vuelve a leerla (CR 608.2b). Por eso el bloque muestra las dos
cifras cuando las tiene —coste de milagro y coste impreso— en vez de deducir una de la
otra. Cuando el motor publica un coste que no son símbolos (`NoCost`, `SelfManaCost`…), el
bloque lo dice con palabras: «Phase no publica el coste de milagro de esta oferta».

**Las dos respuestas no son la misma forma.** Revelar manda
`CastSpellAsMiracle { object_id, card_id, payment_mode }` —el objeto y la carta viajan
separados, y el motor rechaza la acción si el `object_id` no es el de la oferta—; declinar
reutiliza el `DecideOptionalEffect { accept: false }` genérico. Cualquiera de las dos
consume la oferta: milagro sólo mira la primera carta que robas en el turno, así que no
hay nada que recordar entre ofertas.

**El cast sigue siendo otra variante.** Una vez resuelta la habilidad de milagro, el motor
pregunta con `CastOffer { kind: Miracle }`, que es la variante que comparte con locura,
cascada y descubrir y que todavía no tiene vista propia en Mesa. La ventana de esta pasada
llega hasta donde llega el prompt que representa; la siguiente candidata natural es ese
`CastOffer`.

Objetos del laboratorio: `Terminus`, con su texto impreso y su `Miracle {W}`, en la mano
del jugador 1 (objeto propio, fuera de la fila de la mano para no mover los recuentos que
el resto del laboratorio comprueba). La escena se dibuja en la fase de robo, que es donde
la oferta existe.

Laboratorio: `/ux?scene=miracle`, captura `docs/screenshots/ux-milagro-1440.jpg`, más sus
pares de tema.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **540** (7 nuevas en
`game/__tests__/miracle-reveal.test.ts`: el objeto y el coste fijado, la oferta sin carta
que no es oferta, el coste ausente que no se inventa, el asiento del espectador como valor
por defecto, los otros prompts que no son este bloque, la acción de revelar con objeto y
carta separados y `payment_mode` automático, y la negativa genérica); build OK; en
Chromium una prueba nueva —la primera carta del turno, sus dos costes y la frase que
distingue revelar de lanzar— más su escena en la prueba de temas (46 → 47 escenas, 97 jpg,
presupuesto de 500 s).

## Una oferta de lanzamiento, nueve formas de decir que no (cuadragésima quinta pasada, 7 nov 2026)

`CastOffer` (CR 608.2g) es la variante que el motor reutiliza para **cualquier**
lanzamiento que ofrece mientras algo se resuelve, y tiene nueve formas. La pasada la
trata como lo que es —un bloque con una pregunta y nueve respuestas— porque preguntar
lo mismo en nueve ventanas distintas habría dejado nueve pantallas que nunca se ven
juntas. La pregunta es siempre «¿la lanzas?»; lo que cambia es qué pasa si dices que no.

**El declinar es la forma.** `Miracle` (CR 702.94a) deja la carta en la mano y gasta el
disparo; `Madness` (CR 702.35a) la manda al cementerio, que es exactamente lo que locura
cambia; `Cascade` (CR 702.85a) y `Ripple` (CR 702.60a) mandan la carta y todas las
falladas al fondo de la biblioteca en orden aleatorio; `Discover` (CR 701.57a) se queda
la carta en la mano y manda solo las falladas al fondo; `GraveyardPaidCast` (CR 609.4b)
la deja en el cementerio. Por eso el bloque no usa un «No» genérico: cada forma nombra
su destino con su cifra —«Lightning Bolt y las 2 cartas exiliadas van al fondo … 3 en
total»—.

**Adventure no es una pregunta de sí o no.** CR 715.3a publica una **cara**: el motor
manda `ChooseAdventureFace { creature }`, así que el bloque ofrece las dos caras y no
inventa un declinar que esa forma no tiene.

**Las dos clases de acciones del motor se respetan.** Siete formas responden con su
acción propia (`ChooseAdventureFace`, `CastSpellAsMiracle`, `CastSpellAsMadness`,
`CastParadigmCopy`/`PassParadigmOffer`, `CascadeChoice`/`DiscoverChoice`/`RippleChoice`/
`GraveyardPaidCastChoice`, `FreeCastWindowChoice` con `selection` o `null`). El helper
compartido sólo construye las cuatro que son «lanza o declina» y **lanza** si se le pide
otra: es más honesto fallar en el borde que mandar un `choice` a un prompt que espera
otra cosa.

**La ventana gratuita publica sus dos topes y se leen por separado.** `remaining_casts`
ausente es «cualquier número de hechizos» y `remaining_mv_budget` ausente es «sin tope de
valor de maná»: ninguno de los dos se pinta como cero. Cerrar la ventana es
`selection: null`, que no es lo mismo que una carta.

**Cascada y descubrir se enuncian con su tope.** CR 702.85a exige que el valor de maná
del lanzamiento quede por debajo del hechizo que lo provocó, y CR 701.57a que no supere
el valor descubierto; el bloque muestra ese número (lo publica la oferta) en vez de
prometer un lanzamiento que el motor rechazaría.

Objetos del laboratorio: `Terminus` con su coste de milagro para la forma de milagro
—la que completa la pasada anterior—; `Lightning Bolt` como acierto de cascada con dos
cartas falladas de la biblioteca y `Mizzix's Mastery` (valor de maná 4) como fuente; y
`Shock` y `Giant Growth` en el cementerio como candidatas de la ventana gratuita. Todos
viven en `objects`, como el resto de cartas que sólo nombra una ventana.

Laboratorio: `/ux?scene=castOffer`, `/ux?scene=castOfferCascade` y
`/ux?scene=castOfferWindow`, capturas `ux-lanzar-milagro-1440.jpg`,
`ux-lanzar-cascada-1440.jpg` y `ux-lanzar-ventana-1440.jpg`, más sus pares de tema.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **552** (12 nuevas en
`game/__tests__/cast-offer.test.ts`: las nueve formas, el objeto bajo `object_id` o
`hit_card`, candidatas y falladas de sus dos listas, los topes de la ventana que no se
pintan como cero, el tope de cascada y el valor descubierto, la concesión de maná,
la forma desconocida y el prompt ajeno, el asiento por defecto, las dos caras de
aventura, objeto y carta separados en milagro y locura, la tabla de acciones por forma
—incluido el fallo explícito para las que no son «sí o no»— y las acciones de paradigma y
de la ventana); el duplicado de la pasada anterior desapareció: `revealMiracleAction` es
ahora `castAsMiracleAction`, porque revelar y lanzar por milagro mandan la misma acción;
build OK; en Chromium tres pruebas nuevas —milagro, cascada y ventana gratuita, con axe—
y tres escenas más en la prueba de temas (47 → 50 escenas, 103 jpg, presupuesto de 560 s).

## Fusionar es nombrar dos objetos, no dos nombres (cuadragésima sexta pasada, 7 nov 2026)

`MeldPairChoice` (CR 701.42) parece «elige una carta con la que fusionar» y es otra
cosa: el motor **congela referentes**. Cada pareja candidata llega como
`MeldSelection { source_id, partner_id, expected_source, expected_partner, result }`, y
la respuesta —`ChooseMeldPair { source_id, partner_id }`— nombra **los dos objetos**. El
nombre de la carta no serviría: si hay dos copias de la mitad, la pregunta existe
precisamente porque hay que decir cuál.

**La ventana sólo existe cuando hay más de una mitad posible.** Con un único candidato
el motor no pregunta: funde directamente. Por eso el bloque lo dice con esas palabras —«2
parejas posibles»— y el laboratorio necesita dos copias de la otra mitad para poder
enseñar la vista.

**Elegir la pareja no garantiza la fusión.** La instrucción de CR 701.42 exilia primero
los dos referentes y **después** comprueba que las cartas rastreadas son las mitades
impresas (CR 701.42b); si no lo son, la resolución termina sin fusionar. El bloque lo
dice en vez de prometer el resultado, y por eso muestra el nombre impreso que la carta
espera junto al nombre del objeto, cuando difieren.

**El resultado puede entrar atacando.** `entry` es `Normal` o `TappedAndAttacking`; en
el segundo caso la carta entra girada y atacando y la siguiente pregunta es a quién
(CR 508.4), que ya es `MeldAttackTargetChoice` — otra variante, no esta ventana. La
prueba de unidad cubre las dos formas en que ese dato viaja en JSON (cadena para la
unitaria y objeto con `type` para la de datos), porque el contrato las serializa distinto.

Objetos del laboratorio: la pareja real de Eldritch Moon —`Bruna, the Fading Light` como
mitad fija y **dos** `Gisela, the Broken Blade` (objetos #406 y #407) como candidatas, con
el resultado que imprime la carta, `Brisela, Voice of Nightmares`. Los tres viven en
`objects`, como el resto de cartas que sólo nombra una ventana.

Laboratorio: `/ux?scene=meld`, captura `docs/screenshots/ux-fusionar-1440.jpg`, más sus
pares de tema.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **560** (8 nuevas en
`game/__tests__/meld-pair.test.ts`: la mitad fija con sus nombres y el resultado, la
entrada incompleta que se descarta, la oferta sin pareja utilizable que no es ventana, los
nombres opcionales, las dos serializaciones de `TappedAndAttacking` frente a `Normal`, el
asiento por defecto, el prompt vecino —`MeldAttackTargetChoice`— que no es este bloque y la
acción con sus dos identificadores); build OK; en Chromium una prueba nueva —dos copias
desempatadas por `· #id`, la mitad fija y el aviso de CR 701.42b— y una escena más en la
prueba de temas (50 → 51 escenas, 105 jpg, presupuesto de 580 s).

## La fusión entra atacando: el destino es la pregunta, no un extra (cuadragésima séptima pasada, 7 nov 2026)

`MeldAttackTargetChoice` (CR 508.4) parece parte de la fusión y es otra ventana: la
carta fusionada **entra girada y atacando** y el jugador elige a qué ataca. El motor
publica `player`, el `context` de la fusión —`source_id`, los dos referentes congelados y
el resultado— y `valid_targets: Vec<AttackTarget>`; la respuesta es
`ChooseEntryAttackTarget { target }`.

**La ventana sólo existe con más de un destino.** Con uno solo el motor no pregunta y
ataca a ese; el bloque lo dice con la cifra —«Hay 2 destinos posibles.»— en vez de
ofrecer una elección que no existe.

**El nombre que se lee es el resultado, no la mitad.** El objeto del laboratorio sigue
llamándose como la mitad que ya estaba en el campo, porque la fusión la ejecuta el motor;
la cabecera usa el `result` del contexto —«Entra atacando · Brisela, Voice of
Nightmares»— y no el nombre del objeto.

**Un destino puede quedarse obsoleto.** CR 508.4a: la elección se revalida contra el
controlador vivo, así que el bloque avisa de que un destino que desaparezca deja la
carta girada y atacando pero sin destino, en vez de prometer el ataque.

Objetos del laboratorio: la misma pareja de Eldritch Moon de la pasada anterior
(`Bruna, the Fading Light` y `Gisela, the Broken Blade`) con `Brisela` como resultado y
`Chandra, Torch of Defiance` como planeswalker al que atacar (objeto #205), en fase
`DeclareAttackers`.

Laboratorio: `/ux?scene=meldAttack`, captura
`docs/screenshots/ux-fusion-ataca-1440.jpg`, más sus pares de tema.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **568** (8 nuevas en
`game/__tests__/meld-attack.test.ts`: el contexto con su resultado y los destinos, la
falta de `source_id` que cierra la ventana, los destinos sin `type` o `data` numéricos
que se descartan, la lista vacía que no es ventana, el nombre del resultado frente al
del objeto, la marca de destino obsoleto, el asiento por defecto y la acción con su
`target`); build OK; en Chromium una prueba nueva —dos destinos, los nombres de los
botones y el aviso de CR 508.4a— y una escena más en la prueba de temas (52 → 53
escenas, 106 jpg, presupuesto de 600 s).

## Motor v0.126.0: dos campos aditivos que había que rescatar (importación, 15 nov 2026)

La importación sube el pin de `74fc941c` a `c07324a5` (61 commits, releases v0.125.0 y
v0.126.0; informe completo en
[`PHASE-UPSTREAM-2026-11-15-C07324A.md`](PHASE-UPSTREAM-2026-11-15-C07324A.md)).
`WaitingFor` sigue con **148** variantes y ningún bloque representado cambia de forma,
pero **dos sí ganan campo**, y los dos son de los que la vista tiene que leer:

- **`RevealChoice.cardinality`** (CR 608.2d + CR 107.1c): ausente es la elección de una
  sola carta de siempre; `AnyNumber` admite cualquier subconjunto —incluido el vacío—,
  que es el caso Metalworker de upstream. La vista de revelar elegía una carta porque
  hasta ahora era lo único que el motor pedía; ahora publica la cardinalidad, mantiene
  un conjunto marcado (con el mismo tacto de antes cuando es una sola carta) y con
  `AnyNumber` el botón principal nace habilitado como «Revelar ninguna», que es una
  respuesta legal y no un «todavía no».
- **`UnlessPayment.repeat`** (CR 702.24a): el mantenimiento acumulativo compacto cobra
  **la misma** instrucción impresa N veces, una por contador de edad. Se pinta como
  sufijo del coste —«Paga {1} × 3»— y una línea dice de dónde sale la cifra; un `repeat`
  de 0 o 1 es el valor por defecto y no se pinta.

Las dos son rescates, no funcionalidad nueva: sin ellas la mesa habría seguido pintando
la forma histórica de un contrato que ya admite más.

### Verificación de esta importación

`bun run engine:verify` en verde con 483 ficheros y SHA-256
`c963ea30…8cc0e1f`; `bun test src/lib` **571** (3 nuevas: la cardinalidad en sus tres
serializaciones y el valor por defecto, el conjunto completo en `SelectCards` con la
lista copiada, y el `repeat` que sólo aparece cuando es más de uno); `bun run check` 0
errores; en Chromium dos pruebas nuevas —revelar cualquier número con su conjunto y su
«Revelar ninguna», y el mantenimiento acumulativo con su «× 3»— y dos escenas más en el
laboratorio (53 → 55 escenas en la prueba de temas, 110 jpg, presupuesto de 600 s). Poda de pruebas upstream sin cambios (78 de siempre) y ninguna adaptación
más en los tres árboles `src` ni en `phase-ast/data`.

## Entrar atacando no es la fusión: la ventana genérica (cuadragésima octava pasada, 7 nov 2026)

`EntryAttackTargetChoice` (CR 508.4) es la variante que comparte acción con la fusión
—las dos se responden con `ChooseEntryAttackTarget { target }`— y no es la misma
ventana. La fusión tiene contexto congelado; esta publica `object_id` y nada más: es el
motor diciendo «este permanente entra en el campo **ya atacando**, elige a quién». Ahí
caen ninjutsu (CR 702.49c), sneak (CR 702.190b) y cualquier efecto que ponga una criatura
en el campo girada y atacando.

**Se parsea por variante, no por acción.** Como la acción es la misma, el bloque sólo
puede decidir leyendo `waiting_for.type`; leer la acción habría devuelto dos ventanas
distintas al mismo componente. Por eso `meldAttackPrompt` y `entryAttackPrompt` se
niegan mutuamente, y eso está probado en los dos sentidos.

**El nombre sale del campo, no de un resultado.** El objeto que entra es el permanente
real (`object_id`), así que la cabecera lee su nombre en `state.objects` —«Entra
atacando · Ninja of the Deep Hours»— con el id como respaldo, en vez de prometer un
nombre que el motor no publicó.

**Los tres tipos de destino son tipos, no adornos.** `AttackTarget` tiene `Player`,
`Planeswalker` y `Battle`, y la escena enseña los tres: un asiento se nombra por número
(«Atacar a Jugador 2»), y un planeswalker o una batalla por el nombre del objeto. CR
310.5 dice que una batalla también se ataca, así que el bloque no la esconde.

**La ventana existe sólo con más de un destino.** Con uno, el motor sienta al atacante
ahí y no pregunta; con ninguno —fuera de combate, o sin defensores legales— el
permanente entra girado y atacando pero sin destino, y tampoco hay nada que preguntar.
El bloque cuenta los destinos que publica Phase y no inventa una elección vacía.

Objetos del laboratorio: `Ninja of the Deep Hours` como criatura que entra por ninjutsu
(#408), `Chandra, Torch of Defiance` como planeswalker (#205) e `Invasion of Kamigawa`
como batalla (#409); los dos primeros ya estaban en el laboratorio. El ninja y la batalla
viven en `objects` para no mover los recuentos de zona que otras escenas comprueban.

Laboratorio: `/ux?scene=entryAttack`, captura
`docs/screenshots/ux-entra-atacando-1440.jpg`, más sus pares de tema.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **579** (8 nuevas en
`game/__tests__/entry-attack.test.ts`: el permanente y la topología completa, la falta de
`object_id`, los destinos malformados que se descartan, la topología vacía que no es
ventana, el asiento por defecto, las dos ventanas que se niegan mutuamente, las etiquetas
de los tres tipos de destino —con respaldo cuando no hay objeto que leer— y la acción
compartida); el filtro de destinos pasó a un ayudante único que también usa la fusión, en
vez de duplicar el predicado; build OK; en Chromium una prueba nueva —tres destinos, los
nombres de los botones, CR 310.5 y el aviso de CR 508.4a— y una escena más en la prueba de
temas (55 → 56 escenas, 112 jpg, presupuesto de 600 s).

## Un reemplazo no es un orden que se arrastre (cuadragésima novena pasada, 7 nov 2026)

`ReplacementChoice` (CR 616.1) es la variante que más se parece a lo que no es. Su
nombre sugiere «ordena los reemplazos», y en realidad son **tres** preguntas distintas
con la misma forma de datos: ordenar varios reemplazos que escriben el mismo dato
(CR 616.1e), aceptar o rechazar uno solo que dice «puedes», y elegir el destino de una
carta encontrada. El motor las separa él mismo con `kind`, precisamente para que la
mesa no las adivine leyendo el texto de las etiquetas.

**Ordenar es elegir de uno en uno.** Con `kind: Order` el jugador no entrega una
permutación: elige **uno** y el motor lo aplica, y luego vuelve a preguntar por lo que
siga siendo aplicable (CR 616.1f). Por eso la vista es una lista de botones con su
efecto escrito y no una lista arrastrable; la nota final lo dice con esas palabras.

**Quién decide el resultado lo dice el motor, no la mesa.** `last_applied_decides` es
la respuesta de Phase a si el último reemplazo aplicado gana solo —dos efectos que
escriben el mismo campo, como exiliar una criatura moribunda— o si los efectos se
componen —un doble contra un añadido de daño, contadores, maná—. El bloque repite esa
respuesta y no asume «gana el último».

**Una rama opcional no se ordena.** Con `kind: OptionalBranch` los dos candidatos son
la misma fuente mostrada dos veces (índice 0 acepta, índice 1 declina); pintarlos como
lista ordenable habría inventado una decisión que la carta no pide. Y con
`kind: SearchFoundDestination` los destinos son alternativas excluyentes, no pasos.

**Un índice sin botón sería un callejón.** La respuesta es una **posición**
(`ChooseReplacement { index }`), y `candidates` no está garantizado a llenar
`candidate_count` (el caso `EmptyManaPool` filtra). El prompt conserva todas las
posiciones que el motor aceptará y, cuando no hay descripción, el botón dice «Opción N ·
Phase no describió esta opción» en vez de dejar una respuesta legal sin dónde pulsar.

Objetos del laboratorio: `Kalitas, Traitor of Ghet` (#410) y `Rest in Peace` (#411) como
los dos reemplazos que escriben el mismo destino; `Furnace of Rath` (#412) y
`Gratuitous Violence` (#413) como los que se componen; y `Life from the Loam` (#414)
para la rama opcional del dredge. Todos viven en `objects`, como el resto de cartas que
sólo nombra una ventana.

Laboratorio: `/ux?scene=replacement`, `/ux?scene=replacementCompose` y
`/ux?scene=replacementOptional`, capturas `ux-reemplazos-1440.jpg`,
`ux-reemplazos-componen-1440.jpg` y `ux-reemplazo-opcional-1440.jpg`, más sus pares de
tema. La forma de destinos no tiene escena propia: se pinta igual que la de orden y está
cubierta en la prueba de unidad.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **587** (8 nuevas en
`game/__tests__/replacement-choice.test.ts`: el orden con sus fuentes y descripciones y
`last_applied_decides`, las tres formas del campo `kind` con su valor por defecto, la
posición sin resumen que igualmente tiene botón, la ventana vacía y la vecina que no son
este prompt, los nombres y descripciones ausentes que no se inventan, el asiento por
defecto y el «se componen» que es la ausencia del indicador, la marca de recordable que
sólo da la clave del motor, y la acción con el índice); build OK; en Chromium dos pruebas
nuevas —el orden con las dos respuestas del motor y la rama opcional que no se anuncia
como orden— y tres escenas más en la prueba de temas (56 → 59 escenas, 118 jpg,
presupuesto de 600 s).

## Copiar no es apuntar: una ventana, tres copias distintas (quincuagésima pasada, 7 nov 2026)

`CopyTargetChoice` (CR 707.2 + CR 707.9) pregunta «¿qué permanente?» y la respuesta
significa tres cosas según el campo `purpose`, que es del motor:

- **`copy`**: el objeto que entra se convierte en copia del elegido y recibe sus valores
  copiables —Clone, Phantasmal Image, Vesuva—;
- **`latch`** (CR 707.2c): los valores del elegido se fijan sobre el huésped del Aura y
  **el Aura no se convierte en copia** —Metamorphic Alteration—;
- **`tokenSource`** (CR 707.1): el elegido es la fuente que copian las fichas de una
  sustitución de creación de fichas —Esix, Fractal Bloom— y no se transforma nada.

Pintar las tres como «elige una carta» habría sido describir mal dos de las tres.

**Copiar no es apuntar.** CR 707.9: la guardia y el velo no reducen la lista, así que el
bloque no filtra nada por su cuenta; publica exactamente `valid_targets`. Lo único que
dice de más es lo que Phase ya dejó fuera —el propio permanente que copia y lo que la
instrucción excluya— y lo dice como tal, sin volver a decidirlo.

**El techo de maná es una frase, no un filtro.** Cuando la instrucción imprime «de valor
de maná 4 o menos», el motor publica `max_mana_value` **y ya filtró la lista**: la mesa
lo escribe como parte de la carta y no vuelve a descartar candidatos con un número que
no es suyo. Ausente es «sin techo», y entonces no se pinta ninguna línea.

**La respuesta es un `TargetRef`, no un id suelto.** Se manda con `ChooseTarget`, la
misma acción que los selectores de objetivos —que ya existía para recomponer copias,
CR 707.10c—, y por eso esta ventana se lee por su variante de `WaitingFor` y no por la
acción.

Objetos del laboratorio: `Mockingbird` (#415) como la copia que entra, con
`Grizzly Bears` (#100), `Savannah Lions` (#101) y `Elvish Mystic` (#105) como candidatos
y el techo de valor de maná 4 de su texto impreso; `Esix, Fractal Bloom` (#416) como la
sustitución de fichas, sin techo. Las dos escenas usan criaturas del campo del
espectador, así que el rival de la cinta no cambia.

Laboratorio: `/ux?scene=copyTarget` y `/ux?scene=copyTargetToken`, capturas
`ux-copia-que-permanente-1440.jpg` y `ux-copias-de-fichas-1440.jpg`, más sus pares de
tema. La forma `latch` se pinta con el mismo bloque y está cubierta en la prueba de
unidad: su diferencia es una frase, no una pantalla.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **593** (6 nuevas en
`game/__tests__/copy-target-choice.test.ts`: el objeto que entra con su lista y su
techo, las tres formas del campo `purpose` con su valor por defecto, la ventana sin nada
que copiar o sin fuente, los candidatos no numéricos que se descartan y el techo que no
se inventa cuando falta, el asiento por defecto y la lista que no se filtra en local); además, el
componente reutiliza `typeLine` de la mesa para que un candidato se lea como una carta
—«Criatura», no el DTO inglés— y `chooseCopyTargetAction`, que ya existía para recomponer
copias, en vez de duplicar la acción (el primer intento repetía el nombre y lo cazó
`svelte-check`); build OK; en
Chromium dos pruebas nuevas —la copia con techo y las fichas sin él— y dos escenas más
en la prueba de temas (59 → 61 escenas, 122 jpg, presupuesto de 600 s).

## Corrección de contabilidad: tres vistas que no estaban en `REPRESENTED` (7 nov 2026)

Las pasadas 48, 49 y 50 dijeron «`REPRESENTED` 61 → 62 → 63 → 64» y ninguna de las
tres añadió su nombre al conjunto: el `replace()` que debía insertar la entrada
apuntaba a una línea con sangría, y el conjunto vive en **una sola línea**, así que
devolvió el fichero sin tocar. Las tres vistas se veían —el laboratorio monta los
componentes él mismo— y por eso no lo cazó ninguna prueba. El recuento real se quedó en
**61** con tres ventanas representadas fuera de la lista.

Consecuencia visible: para esas tres variantes el panel no suprimía el aviso genérico
de «esta decisión todavía no tiene una representación visual completa» cuando la
ventana era de otro asiento. Nada más —los bloques se pintaban antes del aviso—, pero el
número que publica la documentación no era el del código.

Ahora el conjunto tiene **64** entradas de verdad, y hay una prueba que lo vigila:
`game/__tests__/represented-variants.test.ts` lee el enum `WaitingFor` del pin y el
conjunto del panel, y falla si un nombre no existe en el motor, si hay duplicados o si
el total deja de ser 64 —que es el número que publican el README del port y el PR—.
También comprueba los tres nombres que se quedaron fuera, para que el modo de fallo no
vuelva a pasar inadvertido.

## «Resolver todo» pide permiso, y la mesa sólo puede decir a quién (quincuagésima primera pasada, 7 nov 2026)

`ResolveAllConsent` (CR 117.3d + CR 117.4) es el atajo de mesa para que Phase
resuelva de golpe lo que queda de la pila, y no es una decisión de juego: es un
**consentimiento** que se pide a cada representante de prioridad. La tentación era pintar
el cuadro entero —quién ha concedido ya, a cuántos asientos vincula la propuesta, cuántas
resoluciones permite—, y el motor no lo publica: `resolve_all_consent_run` se vacía en
toda proyección de espectador (`visibility.rs`), así que el cliente sólo recibe `epoch` y
`representative`.

**El bloque dice lo que no puede decir.** Enseña a quién se pregunta —«te pregunta a ti
como representante del asiento 1»— y una línea explica que los participantes, el alcance
(`Own`/`Shared`) y el presupuesto de resoluciones son autoridad del motor. Inventar «2 de
3 han concedido» habría sido eso: inventar.

**La respuesta es el sobre del motor, no la época de la pantalla.** El prompt puede
sobrevivir a la propuesta que lo emitió; por eso los dos botones salen de
`legal.actions` (`RespondResolveAllConsent` con su `epoch`), igual que los objetivos de
un `TargetSelection` salen de ahí. Una respuesta reconstruida con la época visible la
aceptaría el componente y la rechazaría el reductor (CR 117.4: una respuesta tardía falla
cerrada).

**Sin respuestas no se deshabilita una suposición: se dice.** Si el motor ya no ofrece
ningún sobre para esa época, el bloque se queda sin botones y explica que la propuesta ya
no admite respuestas desde aquí. Es el estado que enseña la segunda escena.

**`ResolveAllReady` queda fuera a propósito.** Es el estado siguiente —todos concedieron,
la sesión está resolviendo— y no tiene actor que responder: sólo permite revocar
consentimientos ya dados. Representarlo como si fuera esta ventana habría contado dos
veces la misma decisión; queda en la lista, con `RevokeResolveAllConsent` ya modelado en
el cliente para cuando se aborde.

Laboratorio: `/ux?scene=resolveAll` y `/ux?scene=resolveAllStale`, con la época 3 y el
asiento 0; la segunda quita los sobres de `legal.actions` para enseñar el caso sin
respuestas. Capturas `ux-resolver-todo-1440.jpg` y
`ux-resolver-todo-sin-respuesta-1440.jpg`, más sus pares de tema.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **602** (5 nuevas en
`game/__tests__/resolve-all-consent.test.ts`: el asiento y la época con sus dos ofertas,
las ofertas que salen de `legal.actions` —incluido el sobre de otra época que no vale—,
la ausencia de representante y las ventanas vecinas, la época ausente que no esconde las
ofertas, y los tres sobres —conceder, rechazar y revocar— devueltos intactos); el
recuento vigilado pasa a **65** entradas en `REPRESENTED` y la prueba de contabilidad
incluye este nombre; build OK; en Chromium dos pruebas nuevas —el consentimiento con sus
dos botones y la propuesta que ya no admite respuestas, que no ofrece ninguno— y dos
escenas más en la prueba de temas (61 → 63 escenas, 126 jpg, presupuesto de 600 s).

## Enderezar también se pregunta, y no de la misma forma (quincuagésima segunda pasada, 7 nov 2026)

El paso de enderezar ocurre **antes** de que el jugador activo reciba prioridad (CR 502.3), y
Phase lo parte en dos ventanas que se parecen sólo en el nombre. Tratarlas como una sola
habría sido el error de esta pasada:

- **`UntapChoice`** pregunta por **un** permanente: «puedes elegir no enderezar este
  permanente durante tu paso de enderezar» (la clase de *Vedalken Shackles*). La pregunta se
  repite con el resto, `candidates` trae lo que queda y `chosen_not_to_untap` lo que este
  mismo paso ya dejó girado. La respuesta es `ChooseUntap { object_id, untap }`, un sobre por
  permanente: no hay lista que enviar ni borrador que acumular.
- **`ChooseUntapSubset`** es un **tope** (`MaxUntapPerType`: *Smoke*, *Stoic Angel*, *Winter
  Orb*). `group` ya viene filtrado por el motor —los permanentes girados que compiten por el
  tope—, `max` es el techo, y el jugador **debe** decir cuáles se enderezan; el complemento se
  queda girado. La respuesta es el `SelectCards` compartido, y un subconjunto vacío es legal:
  «no enderezar ninguno» es una jugada, no un error del cliente.

**Por qué dos bloques y no uno.** Un solo cuadro con una casilla por permanente habría
inventado la semántica del primero: en `UntapChoice` no hay tope ni conjunto, hay una pregunta
por objeto y el motor vuelve a preguntar; en `ChooseUntapSubset` no hay «no enderezar este»
individual, hay un cupo que se reparte. El primero enseña cuántos quedan y qué se ha dejado
girado; el segundo enseña el cupo (`1 de 3 elegidos`), cierra las opciones al llegar al techo
y nombra la elección en el botón de confirmar.

**El techo es del motor, no del cliente.** El componente no calcula cuántos permanentes
pueden enderezarse ni deduce el grupo de los tipos de carta: pinta `group` y `max` tal como
llegan, y el único límite que aplica es el que ya publicó Phase. Si `max` fuera 0 o `group`
estuviera vacío no hay pregunta que un jugador pueda responder, así que el prompt no se
abre —igual que `UntapChoice` con `candidates` vacío, donde el motor ya ha pasado al
siguiente paso—.

Laboratorio: `/ux?scene=untapChoice` (fase `Untap`, *Vedalken Shackles* como candidato y
*Smoke* + *Chandra, Torch of Defiance* como ya dejados girados) y `/ux?scene=untapSubset`
(tres *Forest* girados bajo un tope de 1 —la escena los marca girados copiando los objetos,
para que el campo de batalla no contradiga a la pregunta—). Capturas
`ux-no-enderezar-1440.jpg` y `ux-tope-enderezar-1440.jpg`, más sus pares de tema.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **608** (6 nuevas en
`game/__tests__/untap-choice.test.ts`: el candidato único con su asiento y lo ya dejado
girado, la lista vacía y las ventanas vecinas que no son esta, los dos sobres
`ChooseUntap`, el grupo con su tope, el tope cero o el grupo vacío que no son pregunta, y el
subconjunto que sale como `SelectCards` —copiado y también vacío—); el recuento vigilado
pasa a **67** entradas en `REPRESENTED` y la prueba de contabilidad incluye los dos nombres;
build OK; en Chromium dos pruebas nuevas —la pregunta permanente a permanente con su recuento
y su memoria, y el tope que cierra las demás opciones y nombra la elegida— y dos escenas más
en la prueba de temas (63 → 65 escenas, 130 jpg, presupuesto de 600 s).

## Los dos costes opcionales de atacar: exertar y alistar (quincuagésima tercera pasada, 7 nov 2026)

CR 508.1g: mientras se declaran atacantes hay costes opcionales que el motor cobra **de uno en
uno**, y cada uno tiene su propia ventana. Se parecen en la forma —una criatura, un sí o un no,
una cola con el resto— y no en lo que se decide:

- **`ExertChoice`** (CR 701.43d): pagar «exertar esta criatura al atacar» significa que **no se
  endereza en tu próximo paso de enderezar** (CR 701.43b). El bloque dice el precio junto al
  nombre del atacante, porque el precio *es* la decisión; `remaining` es el resto de la cola de
  esta misma declaración.
- **`EnlistChoice`** (CR 702.154a): girar **otra** criatura desgirada que controles, que no ataque
  y con fuerza menor o igual a la del atacante; a cambio el atacante recibe +X/+0 hasta el final
  del turno. `eligible` es el conjunto que el motor ya filtró —fuerza, girada, atacante— y el
  bloque no vuelve a filtrar ni calcula la bonificación: enseña la fuerza publicada y deja la
  aritmética al motor.

**La respuesta de exertar no lleva la habilidad, y por eso es segura.** `permission` es una
identidad opaca —objeto, encarnación y ocurrencia— que enlaza *una* instancia de la habilidad con
*un* objeto; el sobre que envía el cliente es `ChooseExert { exert }`, un booleano desnudo, y el
motor vuelve a validar el permiso que él mismo guardó. Es el caso contrario al de
`ResolveAllConsent`: allí la época viajaba en el sobre y por eso había que tomar el sobre de
`legal.actions`; aquí la pantalla no nombra la habilidad, así que no puede nombrar la equivocada.
El bloque lo dice en vez de imprimir ids, que es lo que un lector no podría comprobar.

**Rechazar es una jugada, no un botón muerto.** Alistar gira «hasta una» criatura, así que
`ChooseEnlist { target: null }` es una respuesta real y se ofrece como tal, también cuando
`eligible` llega vacío: ahí el bloque sigue en pie con el rechazo y lo explica, en vez de
desaparecer y dejar la declaración sin salida.

Laboratorio: `/ux?scene=exert` (fase `DeclareAttackers`, *Grizzly Bears* como atacante con
*Savannah Lions* en la cola y un `permission` con su encarnación y su ocurrencia) y
`/ux?scene=enlist` (*Grizzly Bears* 2/2 con *Savannah Lions* 2/1 y *Elvish Mystic* 1/1 en el
conjunto elegible). Capturas `ux-exertar-al-atacar-1440.jpg` y `ux-alistar-al-atacar-1440.jpg`,
más sus pares de tema.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **615** (7 nuevas en
`game/__tests__/exert-enlist.test.ts`: la ventana de exertar con su cola, la cola que sólo lee
`attacker` de cada entrada pendiente —y admite ids sueltos—, el atacante ausente y las ventanas
vecinas, los dos sobres `ChooseExert`, el conjunto de alistar con su cola, el conjunto vacío que
sólo deja rechazar, y el rechazo como `target: null` con su clave intacta); el recuento vigilado
pasa a **69** entradas en `REPRESENTED` y la prueba de contabilidad incluye los dos nombres;
build OK; en Chromium dos pruebas nuevas —el exertar con su precio y su nota de permiso, y el
alistar con las fuerzas publicadas y el rechazo vivo— y dos escenas más en la prueba de temas
(65 → 67 escenas, 134 jpg, presupuesto de 600 s).

## Motor v0.127.0: un campo que se serializa siempre y dos que esperan su vista (importación, 16 nov 2026)

La importación sube el pin de `c07324a5` a `28b2f9e4` (33 commits, release **v0.127.0**; informe
completo en [`PHASE-UPSTREAM-2026-11-16-28B2F9E.md`](PHASE-UPSTREAM-2026-11-16-28B2F9E.md)).
`WaitingFor` sigue con **148 variantes** —no hay ventanas nuevas—, y de las **69** que Mesa
representa cambian tres bloques, los tres de forma aditiva y con valor por defecto.

**`UntapStepProgress` se serializa siempre, así que su ausencia es un dato.** `UntapChoice` y
`ChooseUntapSubset` ganan `progress` sin `skip_serializing_if`: todo escritor de este motor lo
emite, de modo que un prompt que llega sin el campo viene de una compilación que ofrecía la
determinación **antes** del faseo (CR 502.1) y de la comprobación de día/noche (CR 502.2) —que es
también el valor por defecto de serde en el motor—. La diferencia no es cosmética: con `before` la
respuesta **reinicia** el paso desde su primera acción; con `after` reanuda en el enderezar.

Por eso la pasada 52 necesitaba un rescate y no una funcionalidad nueva: el prompt normaliza el
campo a `after-turn-based-actions` / `before-turn-based-actions` (la ausencia leída como el valor
por defecto del motor) y el bloque sólo dice algo en el caso que el jugador no puede deducir de la
pantalla —una partida guardada por una versión anterior—, con una línea que explica desde dónde se
reanuda. La decisión que se pide es la misma: enderezar o no, y qué subconjunto.

**`decision_subject_id` llega, pero su vista todavía no existe.** `NamedChoice` gana
`Option<ObjectId>` (CR 608.2c + CR 608.2d): cuando la instrucción se repite una vez por miembro de
una población («por cada uno de esos permanentes, elige un oponente distinto»), el prompt publica
el permanente al que corresponde la respuesta. Es de sólo lectura —la autoridad de grabación sigue
siendo del titular y `source` no cambia— y `NamedChoice` todavía no tiene bloque propio, así que
queda anotado para esa pasada en vez de portado a medias.

**Dos `include_str!` que la caché tapaba.** El build en frío destapó que `phase-engine` compila
dentro `data/bracket_lists.json` y `crates/phase-engine/data/ai_commander_decks.json`, y que ninguno
de los dos se había importado nunca: la caché de Rust del trabajo de WASM no había recompilado la
crate desde cero desde la importación anterior. Los dos se importan ahora tal cual. En el borde del
puente, `resolve_deck_list` gana la tabla de combos del estimador de bracket y Mesa pasa
`&ComboTable::default()`: no estima brackets, así que no inventa una tabla.

Laboratorio: `/ux?scene=untapResume` (mismo `UntapChoice` que la escena 52, con `progress` anterior
y sin nada todavía dejado girado), captura `ux-no-enderezar-partida-antigua-1440.jpg` y su par de
tema.

### Verificación de esta pasada

`bun run engine:verify` en verde con **497 ficheros** y SHA-256
`f8daa35ecbcdcf35d911f1bb74709c4a85b179d96b2e5ad1abc2bd814edbb58b`; `diff -rq` de los tres
árboles `src`, de `phase-ast/data` y de las 2317 pruebas conservadas contra el tarball de
`28b2f9e4` sin diferencias más allá de la poda declarada (14 altas en el motor, 2 en el parser, 0
bajas); `bun run check` 0 errores (2 avisos previos); `bun test src/lib` **616** (una nueva en
`game/__tests__/untap-choice.test.ts`: `after`, `before` y la ausencia leída como el valor por
defecto del motor, en las dos ventanas); build OK; en Chromium una prueba nueva —el paso guardado
por una versión anterior con su línea de reanudación y sin «ya dejados girados»— más el atributo
nuevo comprobado en la escena moderna, y una escena más en la prueba de temas (67 → 68 escenas,
136 jpg, presupuesto de 600 s). `REPRESENTED` no se mueve: **69**.

## Pagar un coste: una respuesta, catorce significados; y el maná frigio, uno por símbolo (quincuagésima cuarta pasada, 7 nov 2026)

Phase cobra los costes por la misma puerta. `PayCost` se responde con **un** sobre,
`SelectCards { cards }`, y detrás de esa respuesta hay trece clases de coste distintas: descartar,
revelar, sacrificar, devolver a la mano, exiliar de una zona, exiliar materiales, exiliar un
permanente, exiliar de la zona de maná, desanexar, quitar contadores, girar criaturas, *behold* y
exiliar un agregado. La ventana no las separa con sobres distintos —el motor vuelve a validar
contra el `kind` que él mismo publicó— sino con el significado, y por eso el bloque no puede ser
uno solo con trece textos: tiene que decir **qué se paga**, **cuántos** y **de qué conjunto**, y
callarse lo que no sabe.

**El contrato de cardinalidad es del motor, no del cliente.** `count` es el techo y `min_count`
el suelo. Cuando coinciden el coste es «exactamente N» y el botón de confirmar está muerto hasta
reunir N; cuando el suelo es más bajo —hasta `0`— la respuesta corta es legal y el botón lo
nombra («Confirmar sin elegir ninguno»), en vez de fingir que falta algo. Un `min_count` ausente
se lee como el sobre antiguo, que significaba «exactamente `count`»: no se inventa un suelo de
cero. Un suelo mayor que el techo se recorta al techo, porque la respuesta no puede excederlo
(`ExileAggregate` y `RemoveCounter::AmongObjects` publican `min_count: 1` con
`count: eligible.len()`).

**Lo que llega vacío no siempre es «no hay nada», y eso se dice (CR 400.2).** La redacción de
Phase se hace por `kind`: `Reveal` y `Discard` pierden la lista entera para un espectador
(`Some(vec![])`), mientras que exiliar de la mano, de la biblioteca o de la zona de maná conserva
la longitud y pone `ObjectId(0)` en cada hueco; *behold* deja sólo los permanentes del campo. Un
`0` no es una carta: esas filas se leen «carta oculta», no se pueden pulsar, y el bloque cuenta
los huecos en lugar de descartarlos. Si la lista entera desapareció, el bloque dice que los
candidatos no se publican a este asiento —y mantiene el número del contrato—, nunca «no hay
candidatos». Cuando el coste es de otro jugador el bloque sigue en pie, dice de quién es la
decisión y no ofrece ni un botón: la ventana se puede ver sin poder tocarla, que es exactamente lo
que la mesa necesita para no parecer rota.

**Los costes agregados traen su propia comparación.** Girar criaturas para pagar puede ser fijo
(`Fixed`), por X (`VariableX`) o por un agregado («gira cualquier número de criaturas con fuerza
total 4 o más», CR 208.1): en ese caso el prompt del motor trae `stat`, `comparator` y `value`, y
el bloque imprime el comparador que el motor eligió (`≥`, `>`, `≤`, `<`, `=`, `≠`) en vez de
suponer «al menos». Además, cuando las fuerzas están publicadas, el botón de confirmar obedece al
umbral: con 0, 1 o 3 de fuerza el botón está apagado y la línea dice cuánto falta; con 5 se
enciende. Si alguna fuerza no se publica, el cliente **no adivina**: deja la cuenta al motor y lo
dice. `ExileAggregate` recibe el mismo trato con su `function`/`property`/`comparator`/`value`, y
`RemoveCounter` añade lo suyo —cuántos contadores y si se quitan de un solo objeto o repartidos
entre los elegidos— sin que el bloque prometa una distribución que no conoce.

**El maná frigio es lo contrario: una respuesta por símbolo.** `PhyrexianPayment` (CR 107.4f) no
elige objetos, elige **pagos**. El prompt publica una lista de *shards* con su color, su índice y
las opciones que el motor consideró legales para ese símbolo —`ManaOrLife`, `ManaOnly`,
`LifeOnly`—, y la respuesta es un vector **ordenado** de la misma longitud, un
`PayMana`/`PayLife` por *shard*. De ahí las tres reglas que el bloque implementa y no estiliza:

- el botón de pagar no se enciende hasta que **todos** los símbolos tienen respuesta: un vector
  parcial no es una respuesta, y el motor lo rechazaría;
- una opción que el motor no publicó está apagada, no escondida: se ve que ese símbolo **no** se
  puede pagar con vidas y por qué (CR 107.4f exige que el símbolo sea frigio; si no hay maná del
  color, `ManaOnly` no existe y la única salida son las vidas);
- cancelar es una jugada real (CR 601.2i: el lanzamiento se deshace si no se puede pagar), así que
  está al lado del pago, activa, con su nombre. El bloque no cuenta la vida que queda —la suma de
  vidas del jugador es un dato de la mesa, no de la ventana— y se limita a resumir el reparto
  («Pagas 2 vidas y el resto con maná»).

Cuando `shards` llega vacío no hay ventana: el motor cobró sin preguntar y el bloque devuelve
`null` en vez de pintar un panel sin decisiones.

Laboratorio: `/ux?scene=payCost` (sacrificar exactamente 2 de 3, con el lanzamiento como
reanudación), `/ux?scene=payCostHidden` (un descarte de mano del Jugador 2 que llega a este
espectador como dos marcadores), `/ux?scene=payCostAggregate` (girar por fuerza total ≥ 4 con las
tres criaturas publicadas) y `/ux?scene=phyrexian` (*Dismember* con tres símbolos: uno de cada
forma de opción). Capturas `ux-coste-sacrificar-1440.jpg`, `ux-coste-sin-candidatos-1440.jpg`,
`ux-coste-por-fuerza-1440.jpg` y `ux-mana-frigio-1440.jpg`, más sus pares de tema.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **627** (11 nuevas en
`game/__tests__/pay-cost.test.ts`: las trece etiquetas de `kind` y la desconocida, el techo y el
suelo —incluido el `min_count` ausente y el suelo recortado—, la redacción con marcadores frente a
la lista perdida, la reanudación sin repetir el lanzamiento pendiente, los contadores con su
selección, los dos agregados con su comparador y `comparatorHolds` en sus seis formas, la cualidad
compartida de `reveal` y la acción de *behold*, el sobre compartido `SelectCards`, y el vector
frigio: opciones por símbolo, índice por posición, sin *shards* no hay ventana, y el vector
completo de `SubmitPhyrexianChoices`); el recuento vigilado pasa a **71** entradas en
`REPRESENTED` (69 → 71) y la prueba de contabilidad incluye los dos nombres; build OK; en Chromium
cuatro pruebas nuevas —el sacrificio con su contrato y el techo que cierra la tercera fila, el
coste ajeno con marcadores y sin botones, el agregado que sólo enciende el botón al llegar a 4, y
el frigio símbolo a símbolo con las opciones imposibles apagadas y el vector incompleto sin
confirmar— y cuatro escenas más en la prueba de temas (68 → 72 escenas, 144 jpg).

## El impuesto de combate ya está fijado: se paga entero o se descarta entero (quincuagésima sexta pasada, 7 nov 2026)

`CombatTaxPayment` no es un coste que el jugador componga. Ghostly Prison, Propaganda, Sphere of
Safety, Norn's Annex: la declaración ya está validada y el precio ya está congelado, y la ventana
existe porque el motor se detuvo **antes** de girar nada y **antes** de comprometer la declaración
(CR 508.1d + CR 508.1h en el ataque, CR 509.1c + CR 509.1d en el bloqueo). El bloque imprime ese
precio y no lo vuelve a calcular: un segundo número sería una segunda opinión sobre una cifra que
el motor ya fijó (CR 508.1i–j, CR 509.1e–f).

**La respuesta es un booleano, y por eso no hay lista que enviar.** `PayCombatTax { accept }` no
nombra criaturas. Aceptar paga el total bloqueado por la autoridad de maná y confirma la
declaración en pausa; rechazar **descarta la propuesta entera** y reconstruye el prompt de ataque
o de bloqueo, para que el jugador declare otra vez con un precio nuevo. No hay un «quito sólo
esta». El botón de rechazar lo dice, y está vivo: rechazar es una jugada, no un callejón.

**Lo que se va a comprometer se nombra, y no se reenvía.** `pending` es la declaración en pausa,
fotografiada como referencias de encarnación (CR 508.1k + CR 400.7): una criatura que salió y
volvió durante la pausa es otro objeto y el motor la descarta al aceptar. El bloque enseña
atacantes y destinos, o cada par bloqueadora/atacante, y las bandas (CR 702.22c). Si dos
permanentes se llaman igual, el controlador publicado los separa —dos *Grizzly Bears*, uno por
lado, no son la misma criatura—. Nada de eso vuelve en el sobre.

**El contexto llega etiquetado, no como palabra suelta.** `CombatTaxContext` es una unidad con
`#[serde(tag = "type")]`, así que el cable es `{ type: "Attacking" }` o `{ type: "Blocking" }`.
Leer la cadena `"Attacking"` y nada más dejaba la ventana en «impuesto de combate» aunque el
motor hubiera dicho de qué lado era. Una cadena pelada se acepta por si un escritor aplana el
discriminante; cualquier otra forma queda `unknown` y el bloque lo dice, en vez de adivinar.

**`{W/P}` no puede desaparecer.** Norn's Annex cobra `PhyrexianWhite`, y `mana_value()` cuenta 1
por símbolo. `manaText` y `manaPips` sólo conocían W/U/B/R/G/C, así que el híbrido, el híbrido
genérico, el frigio y el frigio híbrido se caían del pip: el motor había cobrado un coste que la
mesa pintaba vacío. Ahora el símbolo es el de `ManaCostShard::symbol()` —`{W/P}`, `{W/U}`,
`{2/W}`, `{W/U/P}`, `{C/W}`, `{S}`, `{X}`, `{Z}`— y un *shard* que la tabla no conoce se imprime
igual, no se esconde. El texto de la pip sigue siendo el símbolo; el lector de pantalla oye
«blanco o 2 vidas».

**El impuesto ajeno se ve y no se toca.** El precio y la declaración en pausa son públicos
(CR 400.2). Si le toca a otro asiento, el bloque sigue en pie, dice de quién es la decisión y no
ofrece ni un botón. La consecuencia de rechazar y el botón de rechazar no comparten selector: el
párrafo es `data-combat-tax-consequence` y el botón, el único `data-combat-tax-decline`.

Laboratorio: `/ux?scene=combatTax` (dos atacantes, `{W/P}` cada uno, total `{W/P}{W/P}`, una banda,
un jugador y un planeswalker) y `/ux?scene=combatTaxBlock` (el Jugador 2 bloquea, coste genérico
`{2}`, sin botones). Capturas `ux-impuesto-ataque-1440.jpg` y `ux-impuesto-bloqueo-1440.jpg`, más
sus pares de tema.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **633** (6 nuevas en
`game/__tests__/combat-tax.test.ts`: el ataque con su cita, su instantánea y su banda, el bloqueo
con el par roto descartado, el contexto etiquetado frente a la cadena y a lo desconocido, la cita
sin desglose que sigue preguntando, el booleano desnudo, y los símbolos híbridos y frigios que ya
no se caen); el recuento vigilado pasa a **72** entradas en `REPRESENTED` (71 → 72) y la prueba de
contabilidad incluye el nombre; `bun run engine:verify` en verde con **497** ficheros y SHA-256
`f8daa35ecbcdcf35d911f1bb74709c4a85b179d96b2e5ad1abc2bd814edbb58b`; build OK; en Chromium dos
pruebas nuevas —el ataque con sus dos `{W/P}`, la banda y las dos respuestas, y el bloqueo ajeno
con los dos osos separados por controlador y sin botones— (92 → 94 en `ux-lab`) y dos escenas más
en la prueba de temas (72 → 74 escenas, 148 jpg, presupuesto de 600 s).

## El coste adicional y el descuento de Defiler comparten el sobre, no el índice (quincuagésima séptima pasada, 7 nov 2026)

`OptionalCostChoice` y `DefilerPayment` se responden con el mismo sobre,
`DecideOptionalCost { index }`, y el índice no significa lo mismo. El bloque no
reenvía `pending_cast`, no reordena opciones y no inventa un «no pagar» donde el
cable no lo publica. `CancelCast` es legal en las dos (CR 601.2i): todavía no se
ha pagado nada. Un asiento que no decide ve el precio y no recibe ni un botón
(CR 400.2).

**`OptionalCostChoice` (CR 601.2b + CR 601.2h).** `AdditionalCost` llega como
`{ type, data }`, y `optional_cost_options` fija qué índice es cada botón:

- `Optional` y `Kicker`: el 0 paga el único coste vivo y el 1 lo declina. Un
  kicker publica ese coste como `costs[0]` (`next_kicker_option`); un hermano es
  otra ventana, no un segundo botón aquí. Declinar no cierra el lanzamiento. Una
  lista vacía no pregunta: no hay botones, y cancelar sigue siendo legal.
- `Choice`: un `Pay` por alternativa, en el orden publicado, y **sin** declinar.
  Hay que pagar exactamente una (Dusk Mangler: sacrificar una criatura, descartar
  una carta, o 4 vidas). Un coste que esta mesa no sabe nombrar sigue siendo
  botón: quitarlo renumeraría el resto.
- `Choice` también es el coste alternativo frente al impreso (CR 118.9).
  `pending_cast.alternative_cost_election === Offered` —cadena o `{ type }`—
  sólo cambia el título y la regla, no los índices. Rooftop Storm: el 0 es `{0}`
  y el 1 es el `{6}` impreso. Rechazar la alternativa es pagar el otro índice,
  no un botón de «no pagar».
- `Required` no se pregunta. Si llega, el único pago es el índice 0. Una forma
  desconocida no inventa botones.

`origin` es un enumerado de unidad (una cadena en el cable), así que el bloque
dice «regalo» sin leer la carta. Ausente es `Other`; una cadena que no está en
la tabla queda `unknown` y se dice, no se adivina. `gift_kind` llega etiquetado
o como cadena (`Card`, `Treasure`, `Food`, `TappedFish`, `ExtraTurn`); ausente
es `null`, desconocido es `unknown`. `repeatable === true` es estricto —la
cadena `"true"` no cuenta— y `times_kicked` no numérico se lee 0. Un asiento
ausente cae al visor. El copy sale del origen, no de olfatear el texto: kicker
CR 702.33a, casualty CR 702.153a, offspring CR 702.175a, squad CR 702.157a,
replicate CR 702.56a, bargain CR 702.166a, teamwork CR 702.194a, gift CR 702.174a.
Un `{W/P}` se muestra; pagarlo símbolo a símbolo es `PhyrexianPayment`, no esta
ventana.

El regalo publica un centinela de maná cero. El botón dice «Prometer el regalo»,
no un pago de `{0}`. Prometerlo puede abrir `ChooseGiftRecipient` si hay dos o
más oponentes elegibles; ese picker no se anida aquí. El namer (`namedAbilityCost`)
no reutiliza el de `Unless`: un `Mana` con `type: 'Cost'` incluso a cero es `{0}`
—`manaText` lo imprime vacío y no es un coste que falte—; `NoCost` u otra forma
queda innombrado. `PayLife` sólo si es `Fixed`. `Sacrifice` con `requirement` no
se pinta como «1»: el agregado y el «todos» no tienen cuenta. `Exile` sin cuenta
fija queda innombrado; `Discard` y `Reveal` ausentes valen 1, y presentes no
fijas quedan innombrados. `TapCreatures` nombra una cuenta o el agregado
`TotalPower`/`GE`, y nada más. En `Composite` y `OneOf`, una parte innombrada
innombra el todo. `Waterbend` y un tipo desconocido no se inventan, pero en un
`Choice` el botón se queda.

**`DefilerPayment` (CR 601.2b).** El descuento ya está cotizado: `life_cost` y
`mana_reduction` son del motor, y el bloque no reprecio el hechizo ni apaga el
botón porque las vidas no alcancen (CR 119.4: eso lo resuelve el motor, y el
lanzamiento sigue con el coste original). El índice **no** es
`optional_cost_options`. El dispatch de lanzamiento paga sólo con `index == 0`;
el 1 declina y el coste original sigue. No se envía un booleano. `reach` se
omite en el cable cuando es el defecto `SpillsToGeneric` (CR 118.7b): un campo
ausente es ese derrame, no el límite del ciclo Defiler. `ColoredManaOnly` es el
límite de color; cualquier otra forma queda `unknown` y se dice. El texto del
parser es Defiler of Dreams; el fixture verde del motor (Defiler of Vigor) fija
2 vidas y un `{G}`.

La sesión no despacha un índice que el prompt no publicó: en el coste adicional,
sólo uno de `options`; en Defiler, sólo `0 | 1`. `DecideOptionalCost` está en
`handled` para que el panel no la ofrezca otra vez al lado de estos botones.

Laboratorio: `/ux?scene=optionalCost` (Goblin Bushwhacker, kicker `{R}`),
`optionalCostMulti` (Everflowing Chalice, multikicker `{2}` ya pagado dos veces),
`optionalCostChoice` (Dusk Mangler, tres pagos y ningún rechazo),
`optionalCostAlt` (el zombi de Rooftop Storm, `{0}` frente a `{6}`),
`optionalCostGift` (Coiling Rebirth, prometer una carta), `optionalCostAway` (el
kicker lo decide el Jugador 2), `defiler` (Grizzly Bears, 2 vidas, `{G}`, sólo
color) y `defilerAway` (alcance omitido, `{1}{G}`, sin botones). Capturas
`ux-potenciar-1440.jpg`, `ux-multipotenciar-1440.jpg`, `ux-elegir-coste-1440.jpg`,
`ux-coste-alternativo-1440.jpg`, `ux-regalo-1440.jpg`, `ux-coste-ajeno-1440.jpg`,
`ux-defiler-1440.jpg` y `ux-defiler-ajeno-1440.jpg`, más sus pares de tema.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **646** (13 nuevas:
9 en `game/__tests__/optional-cost.test.ts` —el kicker y su cita, el multikicker
con la cuenta, el Choice sin declinar, la alternativa ofrecida, el regalo
etiquetado, el origen ausente frente al desconocido, la lista vacía y el coste
obligatorio, el índice desnudo, y el namer que no inventa— y 4 en
`defiler-payment.test.ts` —la cita de sólo color, el alcance omitido frente al
discriminante envuelto, el precio ausente, y el mismo sobre con un vecino que no
es esta ventana—); el recuento vigilado pasa a **74** entradas en `REPRESENTED`
(72 → 74) y la prueba de contabilidad incluye los dos nombres. El motor no se
tocó: `bun run engine:verify` sigue en verde con **497** ficheros y SHA-256
`f8daa35ecbcdcf35d911f1bb74709c4a85b179d96b2e5ad1abc2bd814edbb58b`; build OK; en
Chromium ocho pruebas nuevas —el kicker con sus dos respuestas, el multikicker
ya pagado, el Choice sin rechazo, la alternativa `{0}`/`{6}`, el regalo que se
promete, el coste ajeno sin botones, el Defiler de sólo color y el alcance
omitido del rival— (94 → 102 en `ux-lab`) y ocho escenas más en la prueba de
temas (74 → 82 escenas, 164 jpg, presupuesto de 720 s).

## Elegir de una zona y elegir una cara no se reconstruyen (quincuagésima octava pasada, 7 nov 2026)

`ChooseFromZoneChoice` y `ModalFaceChoice` ya tienen modal en el cliente React
de Phase (`CardChoiceModal` / `ModalFaceModal`). Mesa no copia ese cromo. Copia
la decisión: qué botón existe, qué sobre se envía y qué no se comprueba aquí.

**`ChooseFromZoneChoice` (CR 608.2d).** El conjunto ya viene filtrado. La
respuesta es `SelectCards { cards }`, el mismo sobre que una búsqueda. La puerta
de confirmar es la del modal de Phase, no una segunda lectura de la carta:

- sin `up_to`, exactamente `count`; con `up_to`, de cero a `count`. Cero es una
  jugada, y el botón lo dice.
- `DistinctCardTypes` exige una asignación inyectiva a las categorías publicadas
  (`canAssignDistinctCardTypes`). Un instantáneo no cabe en «artefacto o
  criatura» aunque quepan dos cartas. Quitar una carta del botón renumeraría
  nada: aquí se eligen ids, no índices, pero un id que el cable no publicó no se
  puede pulsar.
- `TotalManaValue` se nombra (`≤ 6`) y **no** se comprueba aquí. Lo rechaza el
  motor al confirmar, igual que el modal de Phase.
- una restricción desconocida no se convierte en un filtro. Un `count` ausente
  no se lee como 1: no hay confirmación.
- un `0` es la redacción de una zona oculta (CR 400.2), no una carta. El asiento
  que no elige ve cuántas se ocultaron y no recibe botón. `reciprocal_role` se
  nombra (`Produce` / `Consume`) y no cambia el sobre.

**`ModalFaceChoice` (CR 712.12 / CR 712.11b).** Phase no reconstruye la acción
desde la carta. Un botón de cara existe sólo si `legal.actions` ya trae ese
`ChooseModalFace { back_face }`. Cancelar existe sólo si `CancelCast` está
publicado: un lanzamiento ordinario no se cancela desde aquí; una elección de
resolución sí, y puede ofrecer una sola cara. Una tierra se juega; un hechizo
se lanza. El coste añadido de resolución se imprime, no se suma. El otro asiento
ve las caras y no recibe botón.

Laboratorio: `/ux?scene=zoneChoice` (exactamente una de Shock, Giant Growth y
Grizzly Bears), `zoneChoiceTypes` (hasta dos, artefacto o criatura, la mitad que
publica el conjunto), `zoneChoiceAway` (tres ceros, sin botones), `modalFace`
(Valki // Tibalt, las dos caras, sin cancelar), `modalFaceOne` (sólo Tibalt,
`{2}` añadido, pago `Manual`, cancelar) y `modalFaceAway` (las dos pathways, se
juegan, sin botones). Capturas `ux-elegir-zona-1440.jpg`,
`ux-elegir-tipos-1440.jpg`, `ux-zona-ajena-1440.jpg`, `ux-elegir-cara-1440.jpg`,
`ux-una-cara-1440.jpg` y `ux-cara-ajena-1440.jpg`, más sus pares de tema.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **653** (7 nuevas:
4 en `zone-choice.test.ts` —la cuenta exacta y el cero que no es carta, la
asignación de tipos, el tope de maná que no se cierra aquí, el count ausente—
y 3 en `modal-face.test.ts` —las dos caras publicadas, la cara única con cancelar
y coste añadido, y un `back_face` que no es booleano—); el recuento vigilado pasa
a **76** entradas en `REPRESENTED` (74 → 76). El motor no se tocó: `bun run
engine:verify` sigue en verde con **497** ficheros y SHA-256
`f8daa35ecbcdcf35d911f1bb74709c4a85b179d96b2e5ad1abc2bd814edbb58b`.

## El coste alternativo y la variante no se reconstruyen (quincuagésima novena pasada, 7 nov 2026)

`AlternativeCastChoice` y `CastingVariantChoice` son las dos ventanas que
siguen a la cara modal en la cadena de lanzamiento. Phase ya las tiene
(`AlternativeCostModal`, `CastingVariantModal`). Mesa no copia el cromo. Copia
qué botón existe y qué sobre se envía.

**`AlternativeCastChoice` (CR 118.9).** La palabra clave vive en el prompt y
sólo elige las palabras. La acción es siempre `ChooseAlternativeCast` con
`Normal` o `Alternative`. Un botón existe sólo si `legal.actions` ya trae esa
vía: reconstruir la que falta ofrecería un coste que el motor no publicó.
`CancelCast` no forma parte de este conjunto de candidatos; aparece sólo si un
escritor lo publica. Un coste alternativo sin porción de maná se queda ausente;
un `{0}` publicado sigue siendo un coste. El sacrificio de emerger (CR 702.119a)
sale de la descripción del motor, no de releer el filtro del coste. El otro
asiento ve los dos precios y no recibe botón.

**`CastingVariantChoice` (CR 601.2b).** Más de un permiso vale para el mismo
hechizo desde la misma zona. Las opciones conservan el índice del motor, y un
botón existe sólo si `legal.actions` ya trae ese `ChooseCastingVariant`. Quitar
una opción de la lista renumeraría el resto; reconstruir un índice ausente
ofrecería un permiso que el motor ya rechazó. Una variante unitaria llega como
cadena; una de estructura, etiquetada por fuera (`{ GraveyardPermission: {…} }`).
Una desconocida se nombra con la palabra del motor, no con un jinete inventado.
La autoridad del cementerio —fuente, coste extra, frecuencia, contador— se
imprime tal como llegó. `Right` es el nombre de la cara trasera; el resto, el
de la cara que este asiento ya ve.

Laboratorio: `/ux?scene=altCast` (Cyclonic Rift, `{1}{U}` o sobrecarga `{6}{U}`),
`altCastEmerge` (Elder Deep-Fiend, el sacrificio es «una criatura»),
`altCastOne` (sólo la vía normal, pago `Manual`), `altCastAway`,
`castVariant` (Wear // Tear: el índice 1 no es botón), `castVariantAuth`
(Lurrus, 2 vidas además, una vez este turno) y `castVariantAway`. Capturas
`ux-sobrecarga-1440.jpg`, `ux-emerger-1440.jpg`, `ux-una-via-1440.jpg`,
`ux-coste-alternativo-ajeno-1440.jpg`, `ux-variante-lanzamiento-1440.jpg`,
`ux-permiso-cementerio-1440.jpg` y `ux-variante-ajena-1440.jpg`, más sus pares
de tema.

`main` de Phase va 23 commits por delante del pin. No se importan: estas dos
ventanas se leen del pin `28b2f9e4`.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **659** (6 nuevas:
3 en `alternative-cast.test.ts` —las dos vías publicadas y la cadena que no es
una elección, el maná ausente frente al sacrificio nombrado, el `{0}` y el
cancelar que sólo existe si se publicó— y 3 en `casting-variant.test.ts` —el
índice que no se reconstruye, la autoridad del cementerio, la variante
desconocida que se nombra—); el recuento vigilado pasa a **78** entradas en
`REPRESENTED` (76 → 78). El motor no se tocó: `bun run engine:verify` sigue en
verde con **497** ficheros y SHA-256
`f8daa35ecbcdcf35d911f1bb74709c4a85b179d96b2e5ad1abc2bd814edbb58b`.
En Chromium, siete pruebas nuevas (108 → 115 en `ux-lab`) y siete escenas más
en la prueba de temas (88 → 95 escenas, 190 jpg, presupuesto de 960 s).

## La ranura de tipo y el empalme no se reconstruyen (sexagésima pasada, 7 nov 2026)

`ChoosePermanentTypeSlot` y `SpliceOffer` son las dos ventanas que siguen a la
variante de lanzamiento. Phase ya las tiene (`PermanentTypeSlotModal`,
`SpliceOfferModal`). Mesa no copia el cromo. Copia qué botón existe y qué sobre
se envía.

**`ChoosePermanentTypeSlot` (CR 110.4).** Una carta de varios tipos, lanzada o
jugada desde el cementerio por un permiso de una vez por turno y por tipo,
consume uno de los espacios que el motor todavía tiene abiertos. La acción es
`ChoosePermanentTypeSlot { slot }`. Un botón existe sólo si `legal.actions` ya
trae ese espacio: reconstruirlo a partir de los tipos de la carta ofrecería uno
que el motor ya rechazó. El permiso no se reenvía. Su ausencia no es un campo
que esta mesa rellene: es una jugada de tierra (CR 305.1). El otro asiento ve
los espacios y no recibe botón.

**`SpliceOffer` (CR 702.47a–e).** Mientras se lanza un hechizo de Arcano, su
controlador puede revelar una carta con empalmar, copiar su texto y pagar el
coste de empalmar de esa carta. El motor vuelve a preguntar tras cada
aceptación, hasta que el jugador declina o `eligible` se vacía. La acción es
`RespondToSpliceOffer { card }`: `Some` empalma esa carta, `None` termina. Un
botón existe sólo si esa acción ya es legal. El coste de empalmar no viaja en
este prompt; esta mesa no lo lee de la carta. Un `0` es una carta oculta, no
un empalme (CR 400.2). El otro asiento ve las cartas y no recibe botón.

Laboratorio: `/ux?scene=typeSlot` (Dryad Arbor, Tierra y Criatura, mediante
Lurrus), `typeSlotLand` (sólo Tierra, sin permiso de cementerio),
`typeSlotAway`, `splice` (Glacial Ray, Peer Through Depths y Reach Through
Mists, más «No empalmar»), `spliceHidden` (la carta oculta no es botón y el
declinar ausente tampoco) y `spliceAway`. Capturas `ux-ranura-tipo-1440.jpg`,
`ux-ranura-tierra-1440.jpg`, `ux-ranura-ajena-1440.jpg`,
`ux-empalmar-1440.jpg`, `ux-empalmar-oculto-1440.jpg` y
`ux-empalme-ajeno-1440.jpg`, más sus pares de tema.

`main` de Phase va 23 commits por delante del pin. No se importan: estas dos
ventanas se leen del pin `28b2f9e4`.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **669** (10 nuevas:
5 en `type-slot.test.ts` —el espacio publicado y el permiso ausente que es una
tierra, el espacio etiquetado, el espacio en blanco que se descarta, el botón
que sólo existe si se publicó— y 5 en `splice.test.ts` —la carta publicada y el
cero redactado, el campo ausente que no se inventa, el `null` que declina y el
declinar que falta—); el recuento vigilado pasa a **80** entradas en
`REPRESENTED` (78 → 80). El motor no se tocó: `bun run engine:verify` sigue en
verde con **497** ficheros y SHA-256
`f8daa35ecbcdcf35d911f1bb74709c4a85b179d96b2e5ad1abc2bd814edbb58b`.
En Chromium, seis pruebas nuevas (115 → 121 en `ux-lab`) y seis escenas más
en la prueba de temas (95 → 101 escenas, 202 jpg, presupuesto de 1080 s).

## El lado de la mutación y el cifrado no se reconstruyen (sexagésima primera pasada, 7 nov 2026)

`MutateMergeChoice` y `CipherEncodeChoice` son las dos ventanas que siguen al
empalme. Phase ya las tiene (`MutateMergeChoiceModal`, `CipherEncodeChoiceModal`).
Mesa no copia el cromo. Copia qué botón existe y qué sobre se envía.

**`MutateMergeChoice` (CR 702.140c + CR 730.2a).** Un hechizo de criatura con
mutar ya tiene un objetivo legal. Su controlador elige si la carta va encima
de esa criatura o debajo. El lado sólo decide qué componente da el nombre, los
tipos y la fuerza (CR 730.2a). El permanente conserva la identidad del objetivo
(CR 730.2c), se queda con las habilidades de ambos (CR 702.140e) y no vuelve a
entrar. La acción es `ChooseMutateMergeSide { side }`, la cadena `"Top"` o
`"Bottom"`. Un botón existe sólo si `legal.actions` ya trae ese lado:
reconstruir el que falta ofrecería una fusión que el motor no publicó.

**`CipherEncodeChoice` (CR 702.99a).** Un hechizo con cifrar, al resolverse,
puede exiliarse cifrado en una criatura que controle su controlador, o
declinar. Declinar manda la carta al cementerio de su propietario. La acción es
`CipherEncode { creature }`: `Some` cifra en ese anfitrión, `None` declina. Un
botón existe sólo si esa acción ya es legal. El coste de la habilidad cifrada
no se reconstruye: mientras la carta siga cifrada, la criatura puede lanzar una
copia al hacer daño de combate a un jugador (CR 702.99c), y eso lo aplica el
motor. Un `0` es una criatura oculta, no un anfitrión (CR 400.2). El otro
asiento ve las criaturas y no recibe botón.

Laboratorio: `/ux?scene=mutate` (Gemrazer sobre Llanowar Elves, los dos lados),
`mutateOne` (sólo encima), `mutateAway`, `cipher` (Hidden Strings, Invisible
Stalker y Tormented Soul, más «No cifrar»), `cipherHidden` (la criatura oculta
no es botón y el declinar ausente tampoco) y `cipherAway`. Capturas
`ux-mutar-1440.jpg`, `ux-un-lado-1440.jpg`, `ux-mutacion-ajena-1440.jpg`,
`ux-cifrar-1440.jpg`, `ux-cifrar-oculto-1440.jpg` y
`ux-cifrado-ajeno-1440.jpg`, más sus pares de tema.

`main` de Phase va 23 commits por delante del pin. No se importan: estas dos
ventanas se leen del pin `28b2f9e4`.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **679** (10 nuevas:
5 en `mutate-merge.test.ts` —el hechizo y el objetivo, el campo ausente, las
cadenas `Top` y `Bottom` y el lado etiquetado que no es un lado, el lado que no
se publicó— y 5 en `cipher.test.ts` —el anfitrión publicado y el cero redactado,
el campo ausente, el `null` que declina y el declinar que falta—); el recuento
vigilado pasa a **82** entradas en `REPRESENTED` (80 → 82). El motor no se tocó:
`bun run engine:verify` sigue en verde con **497** ficheros y SHA-256
`f8daa35ecbcdcf35d911f1bb74709c4a85b179d96b2e5ad1abc2bd814edbb58b`.
En Chromium, seis pruebas nuevas (121 → 127 en `ux-lab`) y seis escenas más
en la prueba de temas (101 → 107 escenas, 214 jpg, presupuesto de 1200 s).

## El total fijado y el pago al resolver no se reconstruyen (sexagésima segunda pasada, 7 nov 2026)

`OrderCostReductions` y `ResolutionOptionalPaymentChoice` son las dos ventanas
que siguen al cifrado en lo que el cable ya sabe responder. Phase ya las tiene
(`CostReductionOrderModal`, `ResolutionOptionalPaymentModal`). Mesa no copia el
cromo. Copia qué botón existe y qué sobre se envía.

**`OrderCostReductions` (CR 601.2b + CR 601.2f).** Varias reducciones fijan
totales distintos, así que el lanzador elige. El motor ya eligió un
representante por cada total distinto. La acción es ese
`OrderCostReductions { order, hybrid_announcement }`, copiado de
`legal.actions`. Un botón existe sólo si esa elección exacta ya es legal.
Reordenar la lista, o anunciar un híbrido que el resultado no traía, enviaría
un total que esta mesa no ha visto. El coste fijado se imprime, no se
recalcula. `CancelCast` aparece sólo si está publicado. El alcance omitido es
el que derrama a genérico: no es un jinete que esta mesa invente.

**`ResolutionOptionalPaymentChoice` (CR 118.12).** Mientras un efecto se
resuelve, el pagador puede declinar o pagar una rama de un `PayCost(OneOf)`.
El `index` es el lugar de esa rama en el coste original: un hermano omitido no
se renumera. La acción es `ChooseResolutionOptionalPaymentBranch`. Un botón
existe sólo si esa elección ya es legal. Declinar es la etiqueta `Decline`, no
un campo ausente que esta mesa rellene. Un coste que esta mesa no sabe nombrar
sigue siendo botón, rotulado por ese índice. El otro asiento ve las ramas y no
recibe botón.

Laboratorio: `/ux?scene=costOrder` (Altar's Reap, `{R}` anunciando `{W}`, o
`{1}{R}{U}` sin anuncio), `costOrderOne` (sólo el primer total),
`costOrderAway`, `resPay` (Fire Covenant, 2 vidas en el índice 0, sacrificar
una criatura en el índice 2, más «No pagar»), `resPayOne` (sólo el índice 0) y
`resPayAway`. Capturas `ux-orden-reduccion-1440.jpg`,
`ux-un-total-1440.jpg`, `ux-orden-ajena-1440.jpg`,
`ux-pago-opcional-1440.jpg`, `ux-un-pago-1440.jpg` y
`ux-pago-ajeno-1440.jpg`, más sus pares de tema.

`main` de Phase va 23 commits por delante del pin. No se importan: estas dos
ventanas se leen del pin `28b2f9e4`.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **689** (10 nuevas:
5 en `cost-order.test.ts` —el orden del motor y el alcance omitido, el orden
ilegible que se descarta, la elección exacta y el cancelar que sólo existe si
se publicó— y 5 en `resolution-payment.test.ts` —el índice con hueco, el índice
en blanco, el `Decline` etiquetado y el declinar que falta—); el recuento
vigilado pasa a **84** entradas en `REPRESENTED` (82 → 84). El motor no se tocó:
`bun run engine:verify` sigue en verde con **497** ficheros y SHA-256
`f8daa35ecbcdcf35d911f1bb74709c4a85b179d96b2e5ad1abc2bd814edbb58b`.
En Chromium, seis pruebas nuevas (127 → 133 en `ux-lab`) y seis escenas más
en la prueba de temas (107 → 113 escenas, 226 jpg, presupuesto de 1320 s).

## El destinatario y la posición en la biblioteca no se reconstruyen (sexagésima tercera pasada, 18 nov 2026)

`ChooseGiftRecipient` y `TopOrBottomChoice` son las dos ventanas que siguen al
pago al resolver en lo que el cable ya sabe responder. Phase ya las tiene
(`GiftRecipientModal`, `TopOrBottomChoiceModal`). Mesa no copia el cromo. Copia
qué botón existe y qué sobre se envía.

**`ChooseGiftRecipient` (CR 601.2 + CR 115.10a).** Mientras se lanza, el
lanzador elige un oponente. `purpose` dice para qué: el destinatario del
regalo prometido (CR 702.174a; un `purpose` ausente es regalo) o el oponente
sobre el que actúa un coste de efecto (CR 601.2h, «haz que un oponente gane N
vidas»). La acción es `ChooseGiftRecipient { opponent }`, copiada de
`legal.actions`. Un botón existe sólo si ese oponente ya es legal. El orden de
los candidatos es el del motor: esta mesa no lo reordena. `CancelCast` aparece
sólo si está publicado. El tipo de regalo que esta mesa no sabe nombrar se
dice sin nombre, no se reescribe. Las vidas se imprimen sólo cuando la
cantidad es un número fijo; una cantidad que esta mesa no resuelve no se
inventa. El otro asiento ve los candidatos y no recibe botón.

**`TopOrBottomChoice` (CR 608.2d).** El jugador que designa el efecto elige la
posición en la biblioteca. `top: true` coloca el objeto en la `top_position`
publicada: omitida es la cima, `NthFromTop` es la n-ésima desde arriba.
`top: false` es siempre el fondo. La acción es `ChooseTopOrBottom { top }`,
copiada de `legal.actions`. Un botón existe sólo si ese booleano ya es legal.
Una posición que esta mesa no sabe colocar no se relabela como la cima. El
otro asiento ve las caras publicadas y no recibe botón.

Laboratorio: `/ux?scene=gift` (Generous Gift, Jugador 3 y luego Jugador 2, más
cancelar), `giftOne` (sólo el Jugador 2), `giftCost` (3 vidas, sin regalo),
`giftAway`, `topBottom` (Banishing Light, arriba o abajo), `topBottomNth` (la
segunda desde arriba), `topBottomOne` (sólo arriba) y `topBottomAway`.
Capturas `ux-destinatario-1440.jpg`, `ux-un-destinatario-1440.jpg`,
`ux-coste-oponente-1440.jpg`, `ux-regalo-ajeno-1440.jpg`,
`ux-arriba-o-abajo-1440.jpg`, `ux-la-segunda-1440.jpg`,
`ux-solo-arriba-1440.jpg` y `ux-posicion-ajena-1440.jpg`, más sus pares de
tema.

`main` de Phase va 23 commits por delante del pin. No se importan: estas dos
ventanas se leen del pin `28b2f9e4`.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **699** (10 nuevas:
5 en `gift-recipient.test.ts` —el propósito ausente es regalo, las vidas fijas,
el oponente en blanco y el cancelar que sólo existe si se publicó— y 5 en
`top-or-bottom.test.ts` —la posición omitida es la cima, la n publicada, la
posición que no se relabela y el booleano que falta—); el recuento vigilado
pasa a **86** entradas en `REPRESENTED` (84 → 86). El motor no se tocó:
`bun run engine:verify` sigue en verde con **497** ficheros y SHA-256
`f8daa35ecbcdcf35d911f1bb74709c4a85b179d96b2e5ad1abc2bd814edbb58b`.
En Chromium, ocho pruebas nuevas (133 → 141 en `ux-lab`) y ocho escenas más
en la prueba de temas (113 → 121 escenas, 242 jpg, presupuesto de 1410 s).

Los pares de tema de esas ocho escenas no se habían escrito cuando se publicó la
ventana: esta pasada los ejecuta. `ux-themes` recorre las **121** escenas en los
dos temas y deja **242** jpg en `docs/screenshots/temas/` (14,4 min con el
presupuesto de 1410 s); las dieciséis capturas nuevas son los pares de
`destinatario`, `un-destinatario`, `coste-oponente`, `regalo-ajeno`,
`arriba-o-abajo`, `la-segunda`, `solo-arriba` y `posicion-ajena`. La prueba de
temas reescribe jpg de escenas ajenas; las dos que tocó esta vez se revirtieron
antes del commit.

## El choque pregunta dos veces, y la segunda no estrena vocabulario (sexagésima cuarta pasada, 18 nov 2026)

`ClashChooseOpponent` y `ClashCardPlacement` son las dos ventanas del choque
(CR 701.30). Phase tiene la primera en React (`ClashOpponentModal`); la segunda
la resuelve el mismo modal de arriba o abajo, sin cromo propio. Mesa no copia el
cromo. Copia qué botón existe y qué sobre se envía.

**`ClashChooseOpponent` (CR 701.30b).** «Choca con un oponente» elige con quién.
El motor sólo pausa con **dos o más** oponentes: con uno no hay decisión y el
choque sigue solo, así que un candidato único es un conjunto publicado, no una
síntesis. La acción es `ChooseClashOpponent { opponent }`, copiada de
`legal.actions`. Un botón existe sólo si ese oponente ya es legal. El orden de
los candidatos es el del motor: el cliente de arriba lo reordena por
`seat_order`, y Mesa no, porque el cable ya entrega el orden y esta mesa no lo
retoca. **Esta ventana no publica `CancelCast`**: el motor no ofrece cancelar el
choque, y la mesa no lo inventa. El otro asiento ve los candidatos y no recibe
botón.

**`ClashCardPlacement` (CR 701.30c).** Tras el choque, cada participante pone su
carta revelada arriba o abajo, en orden APNAP, y las colocaciones se aplican
**juntas** cuando elige el último. La ventana no estrena vocabulario: la
respuesta es el mismo `ChooseTopOrBottom { top }` de la ventana de posición en
la biblioteca, y el brazo `ClashCardPlacement` del motor la acepta. Por eso los
botones se leen con el mismo parser de ofertas y no hay un segundo vocabulario
de booleanos. `card` es la carta revelada que se está colocando; un `0` es una
carta oculta y la mesa no la nombra. `remaining` es la cola que el motor ya
publicó (pares jugador/carta en APNAP): se lee, no se reconstruye. `bottom_cards`
es el recuento interno del motor y **no** es una elección: no se pinta. El otro
asiento ve la carta revelada y no recibe botón.

Laboratorio: `/ux?scene=clash` (el Jugador 1 elige entre el Jugador 3 y el
Jugador 2), `clashOne` (sólo el Jugador 3), `clashAway` (lo decide el Jugador
2), `clashPlace` (Grizzly Bears, arriba o abajo, con el Jugador 2 en la cola),
`clashPlaceHidden` (carta `0`, y sólo el fondo publicado) y `clashPlaceAway`.
Capturas `ux-oponente-choque-1440.jpg`, `ux-un-oponente-choque-1440.jpg`,
`ux-choque-ajeno-1440.jpg`, `ux-colocar-choque-1440.jpg`,
`ux-colocar-oculta-1440.jpg` y `ux-colocacion-ajena-1440.jpg`.

`PhysicalContest` queda fuera de esta ventana, igual que `ClashCardPlacement`
quedó fuera de la 63: no la responde un `GameAction`, la conduce el anfitrión
con su propio reloj.

`main` de Phase va 23 commits por delante del pin. No se importan: estas dos
ventanas se leen del pin `28b2f9e4`.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **706** (7
nuevas en `clash.test.ts`: los candidatos son el orden del cable, el candidato en
blanco no es botón, la ventana sin lista no ofrece nada, la carta y la cola son
las publicadas, la carta oculta no se nombra y la respuesta de la colocación es
el booleano de la biblioteca); el recuento vigilado pasa a **88** entradas en
`REPRESENTED` (86 → 88). El motor no se tocó: `bun run engine:verify` sigue en
verde con **497** ficheros y SHA-256
`f8daa35ecbcdcf35d911f1bb74709c4a85b179d96b2e5ad1abc2bd814edbb58b`.
En Chromium, seis pruebas nuevas en `ux-lab` (141 → 147) y seis escenas más en
la prueba de temas.

## Entre partidas se entrega una lista y se elige un lado, y ninguno de los dos se deriva (sexagésima quinta pasada, 18 nov 2026)

`BetweenGamesSideboard` y `BetweenGamesChoosePlayDraw` son las dos pausas de
entre partidas (CR 100.2b + CR 100.4a, CR 103.1). Phase no tiene modal para
ninguna de las dos: las lista en `DialogHost` y en `waitingForRegistry` como
ventanas de diálogo, sin cromo propio. Mesa las trata como el resto.

**`BetweenGamesSideboard` (CR 100.2b + CR 100.4a).** Entre partidas el jugador
entrega su mazo principal y su banquillo. La acción es `SubmitSideboard { main,
sideboard }`: la entrega, no un intercambio carta a carta. El suelo
(`min_main_deck_size`) y el tope del banquillo (`max_sideboard_size`) los
publica el motor desde `sideboard_submission_bounds`, que es la misma función
contra la que `handle_submit_sideboard` valida: esta mesa los **imprime** y no
deriva un tamaño de mazo. Bajo una regla `Minimum` el mazo puede crecer
legalmente, así que el bloque no pide que los recuentos coincidan. Un tope `0`
es un formato que **prohíbe** el banquillo (la familia Commander), no un valor
ausente; la ausencia del campo es «sin tope». Los recuentos que se enseñan son
las listas de la propia acción publicada. El otro asiento ve la pausa y no
recibe botón.

**`BetweenGamesChoosePlayDraw` (CR 103.1).** El jugador designado decide si
toma el primer turno de la próxima partida. La acción es `ChoosePlayDraw {
play_first }`, copiada de `legal.actions`; un booleano que el cable no publicó no
es botón. `play_first: true` es que **el que elige** empieza, no «el primer
jugador del registro». El otro asiento ve la elección y no recibe botón.

Laboratorio: `/ux?scene=sideboard` (suelo 60, tope 15, 28 y 3 cartas
publicadas), `sideboardNoSide` (tope 0: un formato sin banquillo),
`sideboardAway`, `playDraw` (jugar o robar), `playDrawDraw` (sólo robar
publicado) y `playDrawAway`. Capturas `ux-ajustar-mazo-1440.jpg`,
`ux-sin-banquillo-1440.jpg`, `ux-ajuste-ajeno-1440.jpg`,
`ux-jugar-o-robar-1440.jpg`, `ux-solo-robar-1440.jpg` y
`ux-jugar-robar-ajeno-1440.jpg`, más sus pares de tema.

`main` de Phase va 23 commits por delante del pin. No se importan: estas dos
ventanas se leen del pin `28b2f9e4`.

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **714** (8
nuevas en `between-games.test.ts`: el suelo, el tope y el marcador son los
publicados, el banquillo prohibido es `0` y el tope ausente no es `0`, la
entrega es la acción publicada con sus propias listas, un marcador malformado no
se imprime, y jugar o robar es el booleano publicado sin reconstruir el que
falta); el recuento vigilado pasa a **90** entradas en `REPRESENTED` (88 → 90).
El motor no se tocó: `bun run engine:verify` sigue en verde con **497** ficheros
y SHA-256 `f8daa35ecbcdcf35d911f1bb74709c4a85b179d96b2e5ad1abc2bd814edbb58b`.

## El orden del fondo es la respuesta, y las tres ventanas comparten vocabulario (sexagésima sexta pasada, 18 nov 2026)

`RippleBottomOrder`, `RevealUntilBottomOrder` y `DigBottomOrder` son tres pausas
distintas que piden lo mismo: el controlador anuncia el orden en que una pila
revelada va al fondo de la biblioteca. La respuesta es **una sola** —
`SelectCards { cards }` — y el motor la acepta sólo como permutación exacta de la
pila publicada. Por eso el orden *es* el dato: esta mesa no reordena, no ordena
alfabéticamente y no añade una carta que el cable no publicó.

**`RippleBottomOrder` (CR 702.60a).** Las cartas reveladas que no se lanzaron van
al fondo. El prompt publica la pila (`cards`), la fuente y, para el texto, la `N`
del estruendo (`count`); `final_cast` es el hilado interno del motor y no es una
elección. La pila arranca en el orden del motor y sólo se mueve entre esas cartas.

**`RevealUntilBottomOrder` (CR 701.20a).** Lo que no se quedó va al fondo, en el
orden que elija el controlador. `clear_markers` y los campos de la instantánea
del revelado son del motor: no se pintan.

**`DigBottomOrder` (CR 701.20e).** El resto de lo mirado, en el orden que elija
el controlador.

Las tres están en el mismo brazo del motor, con la misma validación: longitud
igual, sin repetidas y todas dentro de la pila. Los botones de la ventana son
«Antes» y «Después» por carta; el primero no puede subir más y el último no puede
bajar más, así que el orden nunca sale de la pila. El botón de enviar se apaga
mientras el orden no sea una permutación de lo publicado. El otro asiento ve la
pila y no recibe botón.

Laboratorio: `/ux?scene=bottomRipple` (Glacial Ray, Reach Through Mists y Peer
Through Depths, estruendo de 4), `bottomReveal`, `bottomDig`, `bottomEmpty` (pila
vacía: no inventa cartas) y `bottomAway`. Capturas `ux-fondo-estruendo-1440.jpg`,
`ux-fondo-revelado-1440.jpg`, `ux-fondo-mirado-1440.jpg`,
`ux-fondo-vacio-1440.jpg` y `ux-fondo-ajeno-1440.jpg`, más sus pares de tema.

### Una trampa de Svelte 5, anotada

Sembrar la pila de trabajo dentro de un `$derived` rompe la escena entera: Svelte
5 prohíbe mutar estado al derivar (`state_unsafe_mutation`) y la ruta responde
500. El sembrado vive en un `$effect`, y la lectura —`bottomOrderFor`— no escribe
nada: devuelve la pila de trabajo sólo si sigue siendo una permutación de la
publicada, y si no, la publicada.

### El pin sigue en `28b2f9e4`, y upstream ya está en v0.128.0

`main` de Phase pasó de 23 a **38** commits por delante del pin, con release
**v0.128.0**. El enum sigue en **148** variantes. Ninguna de las 90 ventanas que
Mesa ya representaba cambia de forma, y la única que cambia entre las 148 es una
que Mesa no había portado: `LoopShortcut` pierde `road: OfferRoad`, la etiqueta
del productor que acuñó la oferta. El pin no se mueve en esta pasada; se movió en
la siguiente, junto con la corrección de la frase que había aquí antes (decía que
`SpellCopyOrderChoice` había desaparecido a favor de `MemberOrderChoice`, y es al
revés: `SpellCopyOrderChoice` sigue en el enum con su forma de siempre y
`MemberOrderChoice` no existe).

### Verificación de esta pasada

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **720** (6
nuevas en `bottom-order.test.ts`: las tres ventanas conservan su motivo, una
carta no publicada no entra en la pila, la acción es la permutación exacta, la
`N` sólo la lleva el estruendo y una pila vacía no inventa cartas); el recuento
vigilado pasa a **93** entradas en `REPRESENTED` (90 → 93). El motor no se tocó:
`bun run engine:verify` sigue en verde con el mismo SHA.

## Tres preguntas con la misma forma, y dos listas que no son ids (sexagésima séptima pasada, 18 nov 2026)

Las cinco variantes de esta pasada están entre las **30** que el propio motor
clasifica como `HumanResponseModel::ExactCandidates` en
`game/interaction.rs`: el motor publica una lista cerrada y la respuesta elige uno
de sus elementos. Eso no es una intuición sobre los nombres —es el `match` que
decide cómo se materializa una respuesta humana—, y por eso tres de ellas
comparten un solo panel.

### `ChooseRingBearer`, `ChooseLegend` y `BattleProtectorChoice`

Las tres preguntan lo mismo con otro sujeto y publican lo mismo: `candidates`.

- `ChooseRingBearer` (CR 701.54a): el Anillo te tienta y eliges qué criatura lo
  porta. La respuesta es `ChooseRingBearer { target }`.
- `ChooseLegend` (CR 704.5j): dos legendarios homónimos bajo el mismo control y
  eliges cuál se queda. `legend_name` es el nombre que colisiona y se pinta tal
  cual; no se deduce de los candidatos ni se busca en ninguna tabla. La respuesta
  es `ChooseLegend { keep }`.
- `BattleProtectorChoice` (CR 310.11): al quedar una batalla sin protector, su
  controlador elige qué jugador la protege. Aquí los candidatos son **asientos**,
  no objetos, y la batalla en disputa se nombra si el cable publica su objeto.

`ExactCandidatePrompt.svelte` pinta los candidatos en el orden del cable, sin
filtrar, sin ordenar y sin completar. Un candidato sin acción publicada queda como
fila sin botón (`data-exact-candidate-inert`), no como candidato descartado: lo
que se lee es lo que el cable dijo. El botón que sí existe se busca en la
intersección de candidatos y `legal.actions` (`exactCandidateOffers`), y despacha
**el objeto publicado**, comprobado por identidad en las pruebas.

Los dos legendarios del mismo lado se distinguen con el mismo criterio que ya usa
el retarget: nombre, y si se repite, controlador, y si aún se repite, `#id`.

### `ChooseDungeon` y `ChooseDungeonRoom`

Van en otro bloque (`DungeonPrompt.svelte`) porque su lista **no son ids**: el
motor manda `DungeonPreview` y `RoomPreview` con el nombre y el texto impresos, y
la respuesta lleva un `DungeonId` o un `room_index`, no un objeto del campo. La
regla de la capa de presentación prohíbe que el cliente tenga sus propias tablas
de dungeons, así que el nombre que se lee es exactamente el que vino en la
preview: CR 701.49a para elegir dungeon (con la habitación de entrada, CR 309.4a)
y CR 309.5a para elegir a qué habitación avanza el marcador, con el nombre de la
dungeon (`dungeon_name`) como contexto.

### Una trampa de Svelte 5, anotada

`DungeonId` viaja como objeto, así que `String(id)` es `[object Object]` para todas
las dungeons y un `{#each ... (String(option.id))}` lanza `each_key_duplicate`: la
ruta responde 500 y no se pinta nada. La clave tiene que ser la forma canónica del
id (`JSON.stringify`), que es además la que usa `dungeonOffers` para indexar la
acción. Sólo se veía con dos dungeons: con una, la clave repetida no se repite.

### Escenas y verificación

Escenas `ringBearer`, `ringBearerOne`, `ringBearerAway`, `legend`, `legendAway`,
`protoProtector`, `protoOne`, `protoAway`, `dungeon`, `dungeonOne`, `dungeonAway`,
`dungeonRoom`, `dungeonRoomOne` y `dungeonRoomAway`. Capturas
`ux-portador-anillo-1440.jpg`, `ux-un-portador-anillo-1440.jpg`,
`ux-portador-ajeno-1440.jpg`, `ux-regla-leyendas-1440.jpg`,
`ux-leyendas-ajenas-1440.jpg`, `ux-protector-batalla-1440.jpg`,
`ux-un-protector-batalla-1440.jpg`, `ux-protector-ajeno-1440.jpg`,
`ux-elegir-dungeon-1440.jpg`, `ux-una-dungeon-1440.jpg`,
`ux-dungeon-ajena-1440.jpg`, `ux-habitacion-dungeon-1440.jpg`,
`ux-una-habitacion-1440.jpg` y `ux-habitacion-ajena-1440.jpg`, más sus pares de
tema (152 escenas, 304 jpg).

`bun run check` 0 errores; `bun test src/lib` **732** (12 nuevas en
`exact-candidate.test.ts`); `ux-lab` **168** (11 nuevas); `ux-themes` **3/3** con
152 escenas. `REPRESENTED` pasa de **93** a **98** (quedan **50** de las 148).

**El contraste muerde.** `.type` con `opacity: .85` sobre el relleno de acento
falla AA en tema claro; el texto secundario de un botón se separa por tamaño y
peso, no por opacidad. Y la norma de es-419 veta «pulsa» incluso en un comentario
de código: la prueba de locale recorre los `.svelte` línea a línea.

## Cuatro ventanas que son ExactCandidates y no se parecen (sexagésima octava pasada, 18 nov 2026)

El grupo de `ExactCandidates` sigue siendo el más rentable, pero no es homogéneo.
Estas cuatro ofrecen una lista cerrada y eligen uno de sus elementos, y aun así
**ninguna responde igual a las otras tres**:

| Ventana | Respuesta del cable |
| --- | --- |
| `BeholdChoice` (CR 701.4a) | `SelectCards { cards: [una] }` |
| `PopulateChoice` (CR 701.47a) | `ChooseTarget { Object(id) }` |
| `SpecializeColor` (CR 253.2) | `ChooseSpecializeColor { color }` |
| `ChooseRoomDoor` (CR 709.5f-g) | `ChooseRoomDoor { object_id, op, door }` |

Dos de ellas comparten dibujo (`PickOnePrompt.svelte`) porque las dos eligen un
objeto del campo, pero **no comparten parser de oferta ni despacho**: behold sólo
acepta un `SelectCards` de una carta y populate sólo un `ChooseTarget` con
`Object(id)`. Una prueba fija justo eso —la misma id en las dos ventanas, con la
acción de la otra, no enciende ningún botón— porque es la tentación obvia al
unificarlas.

Las otras dos van por su cuenta, y cada una tiene su trampa:

- **`SpecializeColor`** elige un color. El nombre sale de una tabla de cinco
  entradas que es el propio enum del motor (`ManaColor`: White, Blue, Black, Red,
  Green). Un valor fuera de esas cinco se dice **sin nombre**, no se traduce a la
  brava: el panel muestra el valor del cable.
- **`ChooseRoomDoor`** publica **pares** `(op, door)` y el motor exige que la
  respuesta sea uno de esos pares. Por eso la lista de botones es la de pares
  publicados y no el producto cartesiano de operaciones × mitades, que ofrecería
  combinaciones que el motor rechaza. Una prueba lo fija: con `(Unlock, Left)` y
  `(Lock, Right)` publicados, `(Lock, Left)` no es botón.

`op` llega etiquetado por tipo (`DoorLockOp` es internamente etiquetado:
`{ type: "Unlock" }`) y `door` como cadena simple (`Left` / `Right`); el parser
acepta las dos formas de `op` para no atarse a la etiqueta de serde.

### Una regla que casi se rompe

El primer `PickOnePrompt` dibujaba el bloque sólo para el asiento que decide. La
regla del proyecto es la contraria: **el asiento que no decide ve lo publicado y
no recibe botón** (CR 400.2). Se vio al escribir la prueba del asiento ajeno, que
esperaba el bloque y encontró el vacío. Corregido: la lista se lee y los botones
no existen.

### Escenas y verificación

Escenas `behold`, `beholdOne`, `beholdAway`, `populate`, `populateOne`,
`populateAway`, `specialize`, `specializeOne`, `specializeAway`, `roomDoor`,
`roomDoorOne` y `roomDoorAway`; capturas `ux-behold-1440.jpg` … con sus pares de
tema (162 escenas, 324 jpg de escena).

`bun run check` 0 errores; `bun test src/lib` **747** (15 nuevas en
`pick-one.test.ts`); `ux-lab` **176** (8 nuevas); `ux-themes` **3/3** con 162
escenas. `REPRESENTED` pasa de **98** a **102**; quedan **46** de las 148.
El motor no se toca: `engine:verify` sigue en verde con el pin `576e2bf5`.

## Tres ventanas, un dibujo y dos acciones (sexagésima novena pasada, 18 nov 2026)

El motor clasifica las tres igual —`HumanResponseModel::Select`, la familia de
«elige un subconjunto de lo publicado»—, pero **no contestan igual**:

| Ventana | Respuesta del cable | Quién la valida |
| --- | --- | --- |
| `BlightChoice` (CR 701.68a) | `SelectCards { cards: [una] }` | `ai_support/mod.rs` — `selection_mismatch(..., Some(1))` |
| `HarmonizeTapChoice` (CR 702.180b) | `HarmonizeTap { creature_id }` | `game/engine.rs`, brazo `HarmonizeTap` |
| `UnlessBounceChoice` (CR 118.12) | `SelectCards { cards: [uno] }` | `engine_payment_choices.rs::handle_unless_bounce_choice`, exige `chosen.len() == 1` |

Las tres se dibujan con el mismo panel (`PickExactlyOnePrompt.svelte`) porque
piden lo mismo —exactamente uno de una lista cerrada—, pero **cada botón despacha
la acción que el parser emparejó para su ventana**, y eso no es cosmético:
`SelectCards` de una carta enciende blight y «a menos que», nunca armonizar, y un
`HarmonizeTap` no enciende las otras dos. Hay una prueba que fija justo esa
tentación: la misma criatura, con la acción de la ventana hermana, no produce
ningún botón.

### El número que no se cuenta

`BlightChoice` publica `counters` **y** `creatures` por separado, y no son lo
mismo: dos contadores caen sobre **una** criatura (CR 701.68a), así que el panel
lee `counters` del cable y lo escribe en la regla, en lugar de deducirlo del
tamaño de la lista. La escena `blight` tiene `counters: 2` y dos criaturas
elegibles precisamente para que una implementación que cuente candidatos falle.

`UnlessBounceChoice` trae `remaining`, cuántos jugadores quedan por decidir. Se
pinta sólo si es mayor que uno: anunciar «quedan 1» sobraba. Cuando el dato no
viene, el parser asume uno y **no** inventa un recuento.

### La opción que sí se puede inventar, y no se inventa

`HarmonizeTapChoice` tiene una salida que no es un candidato: no reducir el
coste, que el cable manda como `HarmonizeTap { creature_id: null }`. Ese `null`
llega como acción publicada, así que el botón «No reducir el coste» sólo existe
si el motor lo publicó. La escena `harmonizeDecline` es la misma ventana **sin**
la acción nula: dos criaturas, dos botones y ninguna vía de escape. Es la regla
de siempre —no inventar una opción— aplicada al único sitio de esta pasada donde
inventarla habría sido razonable.

### El asiento que no decide

Las tres escenas `*Away` montan el bloque con `player: 1`: se lee la lista y no
hay ni un botón (CR 400.2). Es la misma regla que ya se rompió una vez en la
pasada 68 y que ahora tiene prueba propia en las tres ventanas.

### Escenas y verificación

Escenas `blight`, `blightOne`, `blightAway`, `harmonize`, `harmonizeDecline`,
`harmonizeAway`, `bounce`, `bounceOne` y `bounceAway`; capturas
`ux-malea-1440.jpg`, `ux-una-criatura-malea-1440.jpg`, `ux-malea-ajena-1440.jpg`,
`ux-armonizar-1440.jpg`, `ux-armonizar-obligado-1440.jpg`,
`ux-armonizar-ajena-1440.jpg`, `ux-devolver-a-la-mano-1440.jpg`,
`ux-un-permanente-devolver-1440.jpg` y `ux-devolver-ajena-1440.jpg`, más sus
pares de tema (173 escenas, 346 jpg).

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **759** (12
nuevas en `pick-exactly-one.test.ts`); `ux-lab` **183** (7 nuevas); `ux-themes`
**3/3** con 173 escenas; `scripts/clash-shots.ts` pasa a 52 capturas. `REPRESENTED`
pasa de **102** a **105**; quedan **43** de las 148.

### El censo se recalcula, no se recuerda

Antes de elegir el bloque se volvió a sacar el reparto del propio `match` de
`human_response_model` (no de los nombres) cruzado con `REPRESENTED`, porque la
pasada 68 dejó el número en 46 y una cuenta a mano se desvía. El resultado, con
el pin `576e2bf5`: `ExactCandidates` **22**, `Select` **8**, `DirectChoices` **3**,
`CoinFlipSequence` **2**, `ManaGroups` **2**, `TextChoice` **2**, `NumberRange`
**1**, `OutsideSelection` **1**, `LoopShortcut` **1**, `ShortcutReply` **1**.

### Upstream: un commit, y no toca contratos

Revisado a petición: el pin va **29** commits por detrás de `main`, y el único
nuevo desde la última revisión es `81d3830d` (`chore(card-data): refresh MTGJSON
token & subtype catalogs`), que sólo toca `crates/phase-ast/data/mtgjson-vintage`
y `oracle-subtypes.json`. `WaitingFor` sigue con **148** variantes y ninguna
cambia de forma, así que subir el pin sigue siendo trabajo de su propio PR y no
de una pasada de interfaz.

### Lo que queda fuera, y por qué

`CollectEvidenceChoice` es la siguiente de `Select` y **no** entra aquí: el motor
sí publica las combinaciones completas (`ai_support/candidates.rs`), pero
`effect_kind` y la suma mínima exigen mostrar el valor de maná de cada carta, y
`ManaCost` se serializa sin `mana_value` (`phase-ast/src/types/mana.rs`) mientras
que `mana_value` es método de `GameObject`, no campo. Reimplementar esa aritmética
en TypeScript es justo lo que la casa prohíbe; se decidirá si el panel enseña las
combinaciones tal cual o si espera a que el cable publique la suma.

## Cuatro `Select` que contestan lo mismo y no preguntan lo mismo (septuagésima pasada, 18 nov 2026)

El grupo `Select` del motor no es «elige uno»: es «elige un subconjunto de lo
que yo publiqué». Estas cuatro lo contestan **igual** —`SelectCards { cards }`
sobre el conjunto del cable— y aun así la pregunta que hacen es distinta, porque
la **ventana** de tamaños la fija cada una:

| Ventana | Ventana de tamaños | De dónde sale |
| --- | --- | --- |
| `EffectZoneChoice` (CR 701.21a / CR 608.2d) | `count` exactas, o `min_count..=count` si `up_to` | `ai_support/mod.rs`, `selection_mismatch` |
| `HeroEventChoice` (sin CR: producto casual) | `count` exactas, o `min..=count` si `up_to` | `engine_resolution_choices.rs:7136` |
| `DrawnThisTurnTopdeckChoice` (CR 614.1) | `min_count..=count` **siempre** | `effects/drawn_this_turn_choice.rs` |
| `SearchPartitionChoice` (CR 608.2d) | exactamente `primary_count` | `engine_resolution_choices.rs:6000` |

Comparten dibujo (`SelectFromListPrompt.svelte`) y **no comparten aritmética**:
ninguna rama del panel resta, cuenta ni acota por su cuenta. `min`, `max` y
`window` se leen del cable; lo único que hace TypeScript es comparar la
selección con esa ventana (`selectFromListReady`) y acotar el máximo al tamaño
del conjunto publicado para no ofrecer de más.

### Los tres números que se copian y no se calculan

- **`DrawnThisTurnTopdeckChoice` no calcula la vida.** Cada carta que no va
  arriba cuesta `life_payment` vidas, y el mínimo (cuántas **tienen** que ir
  arriba) es `minimum_topdeck_count` en el motor: depende de la vida del
  jugador, de `count` y de `life_payment`. El bloque pinta la ventana y el coste
  por carta; no hace la resta. La escena `topdeck` publica `min_count: 1` con
  `life_payment: 2`, y `topdeckOne` publica `min_count: 3` con `life_payment: 0`
  —la misma ventana cerrada sin haber calculado nada—.
- **`SearchPartitionChoice` no reparte.** `primary_count` y las dos zonas
  (`primary_destination`, `rest_destination`) vienen del cable; el panel nombra
  las zonas con una tabla de siete entradas que es el `Zone` del motor, y una
  zona desconocida se dice con su propio nombre (`Somewhere`) en vez de
  traducirse a la brava. La escena `partitionOne` tiene **una** carta encontrada:
  el motor sigue pidiendo exactamente una, así que el botón no se habilita solo
  porque no haya nada que repartir.
- **`EffectZoneChoice` tiene dos familias y sólo una entra aquí.** Cuando publica
  `mass_library_order` es un orden de biblioteca propiedad del dueño
  (`change_zone.rs::mass_library_order_effect_zone_choice`), y ese ya tiene su
  bloque desde la pasada 66 (`BottomOrderPrompt`). El parser devuelve `null` en
  ese caso para no pintar la misma ventana dos veces con dos contratos.

### El mínimo que no es cero

`min_count`/`min` valen `0` en la mayoría de los «hasta N», y por eso la lista
vacía es una respuesta legal **ahí**. Pero no en todas: Turtle Team-Up tiene
mínimos de contribución (el «Krang's Stratagem» que ya usa el motor en su propio
comentario), y `drawn-topdeck` sube el mínimo cuando no hay vida que pagar. El
botón de cero existe sólo cuando el mínimo publicado es cero, y su etiqueta lo
dice («No elegir ninguna»); con `min: 1` el mismo botón nace deshabilitado.

### Escenas y verificación

Escenas `sacrifice`, `sacrificeOne`, `sacrificeUpTo`, `sacrificeAway`,
`heroEvent`, `heroEventOpen`, `heroEventAway`, `topdeck`, `topdeckOne`,
`topdeckAway`, `partition`, `partitionOne` y `partitionAway`; capturas
`ux-sacrificar-1440.jpg`, `ux-un-sacrificio-1440.jpg`,
`ux-sacrificar-hasta-dos-1440.jpg`, `ux-sacrificio-ajeno-1440.jpg`,
`ux-evento-heroe-1440.jpg`, `ux-evento-abierto-1440.jpg`,
`ux-evento-ajeno-1440.jpg`, `ux-robado-este-turno-1440.jpg`,
`ux-robado-obligatorio-1440.jpg`, `ux-robado-ajeno-1440.jpg`,
`ux-reparto-busqueda-1440.jpg`, `ux-reparto-unico-1440.jpg` y
`ux-reparto-ajeno-1440.jpg`, más sus pares de tema (199 escenas, 398 jpg).

`bun run check` 0 errores (2 avisos previos); `bun test src/lib` **772** (13
nuevas en `select-from-list.test.ts`); `ux-lab` **193** (10 nuevas); `ux-themes`
**3/3** con 199 escenas; `scripts/clash-shots.ts` pasa a 65 capturas.
`REPRESENTED` pasa de **105** a **109**; quedan **39** de las 148.

### Lo que queda de `Select`, y por qué no entra aquí

`ArrangePlanarDeckTopChoice` es un subconjunto *y* un orden a la vez
(`keep_on_top` arriba en el orden enviado, el resto al fondo en cualquiera), y
merece su propio bloque de dos pasos, no una rejilla de marcas.
`CollectEvidenceChoice` sigue fuera por la razón de la pasada 69: la suma contra
`minimum_mana_value` no se puede enseñar sin el valor de maná por carta, y el
cable no lo manda. `DigRestSplitChoice` y `OpeningHandBottomCards` publican
cosas distintas: el primero es una **permutación** completa del montón —el mismo
contrato que `RippleBottomOrder`, con la restricción añadida de que el conjunto
de arriba no se mueve cuando `scope` es `OrderOnly`—, y el segundo no publica
cartas: publica `(jugador, cuántas)` y las cartas salen de la mano de ese
jugador. Ninguno de los dos es una selección de subconjunto y meterlos aquí
habría sido reutilizar un dibujo con otro contrato.

## Comparación de tableros, medida y no recordada (7 nov 2026)

Hasta aquí el port se verificaba **por pieza**: cada ventana de decisión tiene su
escena en `/ux` y su captura en `docs/screenshots/ux-*.jpg`. Faltaba la pregunta
anterior a todas: con la misma partida delante, ¿en qué se diferencian los dos
tableros? Este bloque la responde con dos fotografías tomadas por el **mismo
Chromium**: el tablero de Mesa y el del cliente **phase-rs 0.130.0** (`main` en
el momento de la captura), a 1440×900, 1280×800 y 390×844.

Los seis archivos son
`docs/screenshots/comparar-{mesa,phase}-{1440,1280,390}.jpg`.
Las cifras de abajo salen de medir el DOM de esas mismas páginas, no de mirar la
imagen.

### Cómo se hicieron

Un escenario, dos puestas en escena, ninguna inventada por la interfaz:

- **Escenario:** turno 1, fase `PreCombatMain`, prioridad al asiento 0, 20 vidas
  por asiento, 33 cartas en biblioteca, 7 en mano, una carta en el cementerio,
  cinco permanentes por lado (tres tierras y dos criaturas), una tierra girada
  por lado. La ventana de decisión es `Priority`; el auto-paso queda **activo**,
  como viene de fábrica, para que el consejo de primera vez también salga.
- **Mesa:** `scripts/compare-boards-mesa-fixture.js` importa el *singleton*
  `session` que sirve el propio Vite y le instala una instantánea
  `EngineSnapshot`. `Board.svelte` la lee exactamente como lee al motor: no hay
  ninguna rama «modo captura» dentro de la interfaz.
- **phase-rs:** `scripts/seed-phase-board.ts` escribe dos módulos de desarrollo
  en una copia del cliente upstream y los aliasea en su `vite.config.ts`: un
  sustituto del `GameProvider` (el dueño de la sesión de motor) y un `GameState`
  tipado en su store de zustand, con la forma que dan sus propias factorías
  (`src/test/factories/gameStateFactory.ts`). `GamePageContent` y todos los
  componentes de tablero son los que se envían, sin tocar.
- **Captura:** `bun scripts/compare-boards-shots.ts --mesa … --phase …`, con
  Playwright y el Chromium de `scripts/fetch-chromium.ts`. Se abortan
  `api.scryfall.com` y `cards.scryfall.io`: el sandbox no tiene red hacia ese
  CDN, y las dos interfaces deben fallar el arte **igual**, no una con imágenes
  y la otra sin ellas.

### Diferencias

**1. Reparto del ancho.** El tablero de phase-rs ocupa 1120 px y el registro de
partida se queda con una columna fija de 320 px (`x: 1120`) siempre abierta,
desde la primera ventana de prioridad. Mesa da 1395 px a la mesa y pone el
registro debajo de la pila, dentro del rail de decisión, plegado (`Pila 0`,
`Resoluciones 0`): `Decisión pendiente` mide 362×236 en `x: 1026`.

**2. Alto por campo.** A 1440×900 Mesa da 204 px de alto a cada campo de
batalla (`y: 104…308` el rival, `315…519` el propio) y deja la mano a 98 px por
carta. phase-rs reparte el campo por prácticamente los 900 px —el permanente más
alto llega a `y: 520` y las tierras propias bajan a `y: 660…740`— y dibuja la
mano a 106×90 en el borde inferior. Mesa reserva altura fija para mano y barra;
phase-rs se la da al campo.

**3. La barra de fases no cabe en su rail (el hallazgo accionable).** El
`<ol>` de `Fases y paradas` sí desplaza (`scrollWidth` 868 contra `clientWidth`
362, `overflow-x: auto`), pero **los pasos desaparecen sin ninguna señal**:

| Ancho | Pasos visibles | Pasos ocultos |
| --- | --- | --- |
| 1440 | Enderezar, Mantener, Robar, Principal | Combate, Atacar, Bloquear, Daño, Fin combate, Principal 2, Final, Limpieza |
| 1280 | Enderezar, Mantener, Robar | Combate, Atacar, Bloquear, Daño, Fin combate, Principal 2, Final, Limpieza |
| 1024 | los doce | — |

A 1024 caben los doce; **a 1280 y 1440 —las dos medidas que más se usan— se
pierden dos tercios de la barra**. En phase-rs la misma información es una fila
de chips que se ajusta al contenido y no recorta nada. Medido con la rueda: el
`<ol>` desplaza hasta `scrollLeft: 506`, así que los pasos son alcanzables, pero
nada en pantalla dice que haya más. Es el arreglo que sale de esta comparación:
barra que quepa, o un indicador de que hay más. **No se arregla en este
bloque**: cambia la chrome del tablero y merece sus propias capturas de antes y
después, que es exactamente lo que este guion ya sabe producir.

**4. El consejo de flujo.** Los dos tableros lo tienen y las dos frases son la
misma —`CoachTip.svelte` lo portó de `coach.autoPass`—: «Los saltos de fase son
automáticos. Usa Control cuando quieras ventanas de prioridad al estilo del
papel», con `Descartar` / `Conocer el flujo` frente a `Dismiss` / `Learn Flow`.
La diferencia es dónde y a qué precio:

- phase-rs: tarjeta flotante de 384×126 anclada abajo a la derecha del campo
  (`x: 720`, `y: 618` a 1440). Ahí no tapa ningún permanente: el hueco que ocupa
  está vacío. A 390 se estrecha a 152×202 y **sí** tapa un permanente.
- Mesa a 1440: 544×97 **en línea** por debajo del campo propio, sin tapar nada.
- Mesa a 390: 356×115 en `y: 1089`, es decir **fuera de la primera pantalla**.
  El `main.layout` mide 691 px de alto y 1729 de contenido con `overflow-y:
  auto`, así que el consejo (`y: 1089…1203`), `Tu prioridad / Mano / Control`
  (`y: 1207`) y el `Rendimiento del motor` viven por debajo del pliegue:
  alcanzables deslizando, invisibles de entrada. En el teléfono el jugador ve
  campo rival (`y: 187…519`), `Tu siguiente decisión` (`y: 529…770`) y la barra
  `Mano 7` (`y: 775…819`); no ve ni el consejo ni la barra de estado.

**5. La mano en el teléfono.** A 390, phase-rs mantiene las cartas de la mano en
abanico a lo largo del borde inferior (`x: 21…368`, `y: 640…820`) y encima pone
`Hand 7`, `Control`, `To Begin Combat` y `Pass →`, todo dentro de la única
pantalla. Mesa enseña una barra `Mano 7 · Desliza para jugar` de 371×44 en
`y: 775` y deja la mano en un cajón, de modo que el campo rival cabe entero
(`y: 187…519`) a costa de esconder las siete cartas hasta que se pide el cajón.

**6. Qué cuenta cada barra de asiento.** Los dos muestran vida, biblioteca y
cementerio. Mesa los reúne en **una** franja por asiento de 760 px
(`x: 140`, `Jugador 2 · 20 vidas · Mano 0 · Biblioteca 33 · Cementerio 0 ·
Exilio 0 · Maná 0`) y repite la franja del jugador debajo del campo propio.
phase-rs reparte lo mismo en widgets: la vida es un contador de 84×68 centrado
sobre el campo (`x: 518`), la biblioteca y el exilio son pilas arriba a la
derecha y el cementerio y el maná cuelgan de la esquina inferior izquierda. La
primera se lee de un vistazo y ocupa altura; la segunda deja la altura al campo
y obliga a barrer la pantalla con la vista. Ninguno enseña veneno ni energía
porque valen cero en este escenario.

**7. El marcador cuando no hay arte.** Las dos caen a un marcador de posición,
pero no al mismo dibujo: phase-rs pinta un rectángulo oscuro con el nombre y el
coste y anuncia el nombre en `aria-label` (sin `Loading` cuando el CDN está
bloqueado: la consulta falla y cae al marcador), mientras Mesa pinta nombre,
tipo y el texto «Sin conexión con el servicio de imágenes», con `Reintentar
imagen`. La de Mesa dice más; la de phase-rs se lee como una carta vista desde
lejos.

**8. Idioma.** El cliente upstream está en inglés y Mesa en español. No es una
diferencia de diseño y no se cuenta como tal, pero explica por qué estas
capturas no se pueden comparar por texto sin traducir.

### Qué deja abierto

De las ocho diferencias, sólo una es un defecto y no una decisión de producto:
**el rail de fases recorta ocho de los doce pasos a 1280 y 1440** (punto 3). Las
otras siete son dos maneras defendibles de repartir la misma mesa, y quedan
anotadas aquí para que la próxima pasada decida con las capturas delante en vez
de volver a descubrirlas.

**Resuelto en la pasada siguiente** (véase «Primera pasada del paso React →
Svelte» más abajo): el punto 3 quedó arreglado con el guion de captura que este
bloque dejó listo —doce pasos visibles de doce a 1440 y a 1280—, y con él se
aplicaron los puntos 1, 2, 4 y 6. Siguen abiertos el 5 (la mano del teléfono es
un cajón, no el abanico completo) y, por decisión de producto, el 7 y el 8.

### Lo que la comparación **no** puede decir

El motor no está: `bun run engine:download` sigue fallando con `EOF` contra el
blob de artefactos de GitHub y no hay Rust en el sandbox. Las dos instantáneas
son datos, no reglas. La comparación cubre **geometría, jerarquía, reparto de
espacio, rótulos y estados vacíos**, y no cubre nada que dependa de que el motor
acepte o rechace una acción. Las capturas con motor real siguen siendo las del
recorrido `docs/screenshots/tutorial-*.png`, que sí salen del WASM.

### Reproducirlo

```bash
bun scripts/fetch-chromium.ts
bun run dev --port 5173 &                        # Mesa
bun scripts/seed-phase-board.ts --client /ruta/al/cliente/phase
(cd /ruta/al/cliente/phase && npx vite --host 0.0.0.0 --port 5280) &
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=~/.cache/mesa-chromium/chromium \
LD_LIBRARY_PATH=~/.cache/mesa-chromium/al2023/lib:~/.cache/mesa-chromium \
  bun scripts/compare-boards-shots.ts --mesa http://127.0.0.1:5173 \
    --phase http://127.0.0.1:5280 --out docs/screenshots
bun scripts/seed-phase-board.ts --client /ruta/al/cliente/phase --remove
```

## Primera pasada del paso React → Svelte (7 nov 2026)

La comparación de arriba dice qué reparte cada tablero. Este bloque aplica al
tablero **Arena** de Mesa la parte de ese reparto que no es cuestión de gusto, y
mide el resultado con el mismo procedimiento: un Chromium, la misma instantánea
`EngineSnapshot`, las mismas tres medidas.

Evidencia: `docs/screenshots/tablero-{antes,despues}-{1440,1280,390}.jpg` y
`docs/evidence/tablero-{antes,despues}-{1440,1280,390}.json`. Las cifras de esta
sección salen de esos JSON, no de mirar las imágenes.

Se reproduce con `bun scripts/board-shots.ts --tag antes|despues`, que instala la
misma fixture y escribe foto + medidas en el mismo pase.

### Qué cambió, con la diferencia de arriba al lado

| Diferencia | Antes (medido) | Después (medido) |
| --- | --- | --- |
| **1. Reparto del ancho** | mesa 1395 px; rail de decisión de 392 px con el registro plegado dentro | mesa 1052 px + **columna de registro de 320 px** (`x: 1090`, ancho 320, alto 569); el rail vive en esa columna |
| **2. Alto por campo** | 204 px por campo, 204 px de hueco entre los dos, y el contenedor del tablero desplazaba 225 px por dentro | 238 px por campo, los dos pegados al centro de su mitad, y `.layout` **sin desplazamiento interno** (`clientHeight` 628 = `scrollHeight` 628) |
| **3. Barra de fases** | rail de 362 px, 868 px de chips, **4 de 12** pasos visibles con 8 sin señal | fila de 290 px, `scrollWidth` 290, **12 de 12** visibles; dos líneas con los cuatro rótulos largos abreviados |
| **4. Consejo de flujo** | 544×97 en una fila propia entre el campo y la mano | 667×40 en la fila de chips de estado, **sin fila propia**: comparte fila con `Tu prioridad · Principal 1 · MANO 7 · CONTROL`, que es donde Phase pone `Your priority` / `HAND 7` / `CONTROL` |
| **6. Barra de asiento** | franja única de 760 px centrada en la mesa | contador de 671 px (asiento rival) y 620 px (propio) pegados al ancho de su columna: la vida a la izquierda, las pilas a la derecha |

A 1280 el mismo reparto da 892 px de campo, 320 px de registro, el registro
visible entero (`y: 528`) y 12 de 12 pasos en una fila de 290 px.

### Lo que **no** se copió, y por qué

- **El contador de vida suelto de Phase** (84×68 centrado sobre el campo, con
  las pilas repartidas por las esquinas). Se probó y se descartó: en Mesa el
  asiento lleva además el botón de objetivo (`Elegir Jugador N como objetivo`),
  los contadores de veneno/energía, el aviso de cambio de vida y `data-life`, que
  tres pruebas E2E leen. Partirlo en widgets dejaría esos datos sin sitio o
  obligaría a duplicarlos. Lo que sí se copió es lo que se ve: dejó de ser una
  franja de 760 px centrada y pasó a ser una fila al pie de su campo.
- **El consejo flotando sobre el campo.** Phase lo ancla abajo a la derecha y no
  tapa nada porque su campo acaba en `y: 606`. Aquí se probó igual
  (`position: absolute` contra la fila de chips) y la tarjeta de 416 px caía
  sobre las dos criaturas propias, tapando su P/T. Se quedó en el flujo, pero en
  una fila de 40 px en vez de 97.
- **La tira de cementerio.** Medía 198 px de los 630 del tablero con una sola
  carta, que es justo el alto que este reparto da a los campos. En Arena el
  cementerio sigue a un clic en la pila del asiento (`ZonePile` →
  `ZoneViewer`) y el contador sigue en la fila del asiento. El cambio alcanza a
  todo Arena, también al teléfono (donde esa tira quedaba fuera de la primera
  pantalla y sólo alargaba el desplazamiento: 1729 → 1507 px de contenido a
  390×844); el estilo Clásico la conserva tal cual.

### Un defecto que sí se arregló de paso

La mano de escritorio estaba **pegada a la izquierda**: la regla que centra el
abanico sólo cubría `.layout .hand-zone` y `.board .hand-zone`, y desde M10 la
mano es hija directa de `.app`. Medido a 1440: primera carta en `x: 19` y última
en `x: 1152` de una franja de 1395 px. Añadido el selector que faltaba, el
abanico queda centrado (`x: 425…1015`).

### Lo que sigue sin ser el de Phase

- La **mano del teléfono** sigue siendo un cajón, no el abanico completo de
  Phase a 390 px (diferencia 5). Es el cambio más grande que queda y toca la
  navegación del tablero, no sólo su reparto.
- El **marcador sin arte** de la diferencia 7 y el registro en español de la 8
  no se tocan: son decisiones de producto ya documentadas.
- `arena-ui.spec.ts` sigue midiendo `position: sticky` en el rail: la columna
  nueva es `sticky` dentro de su propia celda, así que el contrato no cambia.
