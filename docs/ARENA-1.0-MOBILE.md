# Arena 1.0 — jugar en el teléfono, medido

**Fecha:** 4 de noviembre de 2026 · **Misión:** issue #42, M2 · **Base:** M1
(`1034227`) sobre `main` @ `90ce36f`

La meta falsable del issue era: *«320/390/768 px jugables, las 30 cartas de la
mano alcanzables, ninguna acción depende de `hover`, sin fugas de identidad de
cartas ocultas»*.

**Resultado:** a 390×844 el documento bajó de **3261 px a 1633 px**, el campo de
batalla de **1336 px a 660 px**, y la mano dejó de ser una columna de 1500 px
para ser un cajón de 323 px con las 30 cartas en una sola tira desplazable.
Cero desbordamiento horizontal a 320, 390 y 768 px.

## Antes / después (medido, no estimado)

`/stress?hand=30&tokens=0&mirror=1` con puntero táctil real (`hasTouch`,
`isMobile`), Chromium, `docs/evidence/mobile-arena10.json`:

| Métrica | Antes | 320×800 | 390×844 | 768×1024 |
| --- | --- | --- | --- | --- |
| Alto del documento | 3261 px (390) | 2038 px | **1633 px** | 1915 px |
| Campo de batalla (peor lado) | 1336 px | 804 px | **660 px** | 700 px |
| Filas de tierras por lado | 6 (una columna) | 3 | 2 | 2 |
| Ancho de carta en el campo | 76 px (recortada) | 100 px | 100 px | 115 px |
| Desbordamiento horizontal | 0 px | 0 px | 0 px | 0 px |
| Mano (alto en reposo) | ~1500 px | 24 px | 24 px | 324 px (fan en línea) |
| Cajón abierto | — | 291 px | 323 px | no aplica |

Partida real (`/?autostart`) a 390×844:

| Métrica | Antes | Ahora |
| --- | --- | --- |
| Barra superior | 205 px | **131 px** |
| Inicio de la decisión de Phase | y = 641 px | **y = 384 px** |
| Mano | ~1500 px de columna | cajón de 24 px + botón `Mano` de 44 px |
| Documento | 3261 px | **1149 px** |

## Qué se cambió (y por qué cada cosa)

1. **La mano es un cajón en el teléfono, no una lista.** `Hand.svelte` gana un
   botón resumen (`Mano` + contador + `Desliza para jugar`) y una hoja fija con
   su propio *scrollport* horizontal. Se abre sólo a pedido, con `Escape` o con
   el botón `✕` se cierra, y los 44 px del resumen son lo único que ocupa
   cuando está cerrada.
   *Se aplica desde 640 px hacia abajo:* a 768 px el fan en línea sí cabe y se
   conserva tal cual (y así lo siguen midiendo `arena-scene-evidence` y
   `visibility`).
2. **El cajón no puede vivir dentro de `main[inert]`.** Chrome se niega a
   enfocar cualquier cosa bajo un contenedor `inert`, así que con la hoja dentro
   del tablero el foco quedaba atrapado fuera. La mano pasó a ser **hermana** de
   `main.layout`; el tablero es `inert` mientras la hoja está abierta y el foco
   entra en `#mesa-hand-sheet .hand-scroll`, y al cerrar vuelve al botón.
   Un cajón abierto que sobrevive a un cambio de ancho se cierra solo: si no, el
   tablero quedaría `inert` detrás de un botón invisible.
3. **El cierre de scrollport cerrado ya no «desborda».** La hoja cerrada se
   colapsa a 1×1 px con `clip-path` (sigue en el árbol de accesibilidad y los
   nodos existen), y `updateOverflow` reporta `overflow = false` en ese estado:
   un recuadro de 1 px no es una mano que desborda. Al abrir, las flechas y el
   aviso aparecen exactamente cuando la tira desborda.
4. **El campo de batalla deja de ser columnas.** Las dos «calles» del diseño de
   escritorio se vuelven una fila que envuelve (`.middle-permanents` →
   `display: block`), y el ancho de carta tiene un **piso de legibilidad de
   100 px**: medido, a 76 px la cara desborda 47 px, a 96 px desborda 8 px y
   desde 100 px no desborda. No se recorta texto para ganar densidad.
5. **Las herramientas de carta no desaparecen en el teléfono.** En una fila con
   etiquetas sumaban ~40 px por cada fila de cartas (804 px de campo a 390 px),
   así que a ≤640 px con puntero grueso pasan a ser dos glifos de 32×32 sobre el
   borde superior de la carta —siempre visibles, sin `hover`, con el nombre
   accesible intacto— y la fila vuelve a medir lo que mide la carta. **La mano
   conserva la variante ancha con etiqueta**, porque ahí el alto es gratis.
6. **Jerarquía del HUD en el teléfono.** La decisión de Phase va primero en la
   columna (`.middle > .decision { order: 1 }`), luego la pila, el registro y la
   pista de turnos; nada se elimina ni cambia de orden de tabulación.
7. **La barra superior es una barra, no un encabezado.** 131 px en dos filas,
   con todo el texto del motor intacto (`Motor: 40 / 40`, `cartas cargadas por
   asiento`, `El mazo se cargó completo`).

## Regresión que este trabajo arregló de paso

Al sacar la mano de `main.layout`, las reglas `.app[data-board-style="arena"]
.layout .hand-zone …` dejaron de aplicarse y las de `Board.svelte` (`.app`,
0-2-0, inyectadas después) volvían a ganar el `gap`/`padding` del shell: la
escena real de `DeclareBlockers` a 1440×900 volvió a debir **21 px**. Se
corrigió subiendo la especificidad de los bloques de escritorio corto
(`.app.app[data-board-style="arena"]`) en vez de recortar cartas: medido de
nuevo, **900 / 900 px, 0 px de deuda**, con las cartas de combate todavía en
124×173 px.

## Pruebas

- Nuevo `tests/e2e/arena-mobile-drawer.spec.ts` (3 pruebas, táctil real):
  abrir/cerrar con foco, `inert` en el tablero, las 30 cartas enfocables y
  alcanzables por deslizamiento, alto de carta > 100 px, campo de batalla < 700 px
  y ≤3 filas de tierras.
- `hand-overflow-evidence` y `arena-card-tools-reachability` se actualizaron
  para **medir la presentación real**: en el teléfono abren el cajón con el
  botón real antes de medir, y comprueban que cerrado no anuncia flechas que no
  puede respaldar (antes esa prueba sólo tenía sentido con la mano en línea).
- `arena-ui.spec.ts`, decisión del teléfono: la comprobación pasó de «la
  decisión está debajo del centro» a «la decisión **encabeza** la columna y se
  ve sin desplazar» — la afirmación nueva es más fuerte, no más débil.
- Suite completa: **57 pasadas, 1 saltada, 0 rojas**; `bun run check` 0 errores;
  `bun test src/lib` 251 pasadas.

## Lo que no se hizo (y por qué)

- **No se apilan las tierras en un «montón»** como en Arena: cambiaría la
  lectura del campo (¿qué tierra está girada?) por píxeles, y Phase no expone
  esa agrupación.
- **No se recorta texto ni se reduce el objetivo táctil de 32 px** para que el
  campo quepa en una sola pantalla a 320 px: a ese ancho, diez permanentes
  legibles ocupan ~800 px y el jugador desplaza. La deuda se documenta en vez
  de comprarse escondiendo información.
- **No hay zoom de tablero tipo Arena móvil** (miniatura + panel de detalle).
  Queda como trabajo posterior; hoy el detalle se obtiene con la herramienta
  `Ampliar` de cada carta, que en el teléfono es un objetivo de 32 px siempre
  visible.
