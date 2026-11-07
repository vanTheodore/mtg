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

Commit de referencia: `f67169218fa9f5dec439b9024906b891a926210e` (v0.119.0),
licencias MIT OR Apache-2.0. La atribución queda también en el encabezado de
cada archivo portado.

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
| `bun --bun playwright test tests/e2e/ux-lab.spec.ts` | **8/8**: 4 arcos con `d` finito, combate con 2 atacantes y 1 bloqueo (uno a trazos), 0 líneas sin decisión, visor con 2 cartas + `Escape` + foco devuelto, **axe sin violaciones críticas ni serias** (tablero y diálogo modal), y 320/390/768 px sin desbordamiento horizontal con las 4 líneas y las 6 pilas presentes |
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
