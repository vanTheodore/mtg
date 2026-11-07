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
Al pulsar una ficha de zona se abre su visor; la biblioteca sólo muestra el
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

Ordenado por lo que todavía obliga a mirar dos pantallas para jugar una carta:

1. **Menú de acciones de carta** (`cardActionChoice.ts`, `BoardContextMenu.tsx`):
   hoy las opciones viven en el panel de decisión, no junto a la carta.
2. **Selector de destino de ataque** (`AttackTargetPicker.tsx`): hoy se elige en
   el panel; Phase lo ancla al atacante.
3. **Barra de fases con paradas** (`PhaseStopBar.tsx`): `TurnTrack` muestra la
   fase, pero no permite fijar paradas por paso.
4. **Asignación de daño de combate** (`DamageAssignmentModal.tsx`).
5. **Reparto de la columna derecha** (pila + historial + decisión): el E2E de
   `/ux` cubre la capa, no la composición de una partida larga.

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
- **Sin `Control total` inventado.** Nuestro equivalente real es desactivar el
  auto-paso; no hay paradas por paso en el motor, así que no se dibuja un
  control que no haría nada.
- **Las pilas de esquina no se portan.** En Phase la mesa es un `100dvh` con
  recorte y la biblioteca sangra por el borde; aquí la mesa es un documento que
  desplaza, y las esquinas de `.app` caen sobre la barra superior y la mano
  (medido: la pila del rival aterrizaba sobre `Ajustes`). El control accesible
  sigue siendo la ficha de zona del asiento, que es la que anuncian los lectores
  y la que pulsan las pruebas. Queda como pendiente si la mesa pasa a alto fijo.

Verificación de esta pasada: `bun run check` 0 errores, `bun test src/lib` 292
pasan (8 nuevas de `ui/phases.ts`), `bun run build` OK, `ux-lab.spec.ts` **11/11**
(3 nuevas: dock y control persistente, aviso descartable, abanico con recuento)
y `a11y.spec.ts` verde sobre `/stress`. Las capturas son
`docs/screenshots/ux-cromo-1440.jpg` y las tres de la ronda anterior.

## Paradas por fase (tercera pasada, 7 nov 2026)

`PhaseStopBar.svelte` sustituye a `TurnTrack` en la mesa de arena. Doce pasos,
los mismos que agrupa el carril anterior, ahora pulsables: un paso marcado es
una **parada**.

- **Qué hace una parada.** `session.setStop(step, on)` guarda `mesa:stops` y
  `session.stopActive` hace que `autoPassPending` sea `false` en ese paso. Es
  decir: el motor sigue publicando la ventana y su recomendación, y la interfaz
  sólo deja de aceptar esa recomendación donde el jugador lo pidió. Sin paradas
  el comportamiento es exactamente el de antes.
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

**Sin verificar aquí**: ninguna de las dos se ha visto con el WASM del pin. El
menú y la vista están montados en `Board.svelte`/`DecisionPanel`, y su prueba en
partida real la tiene que dar el CI.
