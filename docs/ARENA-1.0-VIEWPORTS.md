# Arena 1.0 — el tablero donde de verdad se juega

**Fecha:** 4 de noviembre de 2026 · **Misión:** issue #42, continuación de M3
**Base:** `main` @ `d23a68c` (M0–M6 mergeados)

M1 cerró el escritorio de 1440×900 y M2 el teléfono vertical. Al medir con el
motor real (`/?autostart`, Chromium, Phase del pin) quedaban dos agujeros que
nadie había mirado:

| Ventana | Deuda vertical antes | Ahora |
| --- | --- | --- |
| 1440×900 | 0 px | **0 px** |
| 1280×800 | 0 px | **0 px** |
| 1180×820 | **200 px** | **0 px** |
| 1024×768 | **486 px** | **0 px** |
| 768×1024 | **61 px** | **0 px** |
| 844×390 (teléfono girado) | **880 px** | 515 px |
| 740×360 (teléfono girado) | **901 px** | 537 px |
| 390×844 | 305 px | **50 px** |
| 320×800 | 450 px | **209 px** |

## Los dos agujeros reales

### 1. Un teléfono en horizontal se trataba como un escritorio

A 844×390 la mano era un abanico de **324 px** en una pantalla de **390** y la
decisión de Phase empezaba en `y = 302`: el prompt que el jugador tiene que
contestar no cabía en la pantalla. El documento medía 1270 px.

Ahora el cajón de la mano se activa por una condición **medida**, no por un
único ancho (`DRAWER_QUERY` en `Hand.svelte`):

```
(max-width: 640px)                                  las cartas de ±147 px no caben
(max-width: 1099px) and (max-height: 899px)         el abanico son 324 px de 768
(max-height: 520px)                                 un teléfono girado es un teléfono
```

y en horizontal la columna del HUD pasa a ir **antes** que los campos, así que
la decisión de Phase se ve entera: `y = 75 … 345` en 390 px de alto.

### 2. La banda intermedia (tablet y portátil chica) no tenía densidad propia

Las reglas de "escritorio corto" empezaban en 1280 px, así que a 1180 el shell
seguía con su `gap` de 12,8 px, la barra superior en dos filas (114 px) y el
abanico de la mano. Y a 1024×768 el HUD era una columna apilada de 441 px
(decisión + pila/registro + pista de turnos) que empujaba el campo propio fuera
de la pantalla.

- Los bloques de escritorio corto ahora empiezan en **1100 px** (1180×820: 0 px).
- En 641–1099 px la decisión comparte fila con la pila y la pista de turnos, y
  la barra superior es una sola fila de 42 px (1024×768 y 768×1024: **0 px**).
- En ≤640 px la barra superior baja de 131 a **67 px** (93 px a 320, donde los
  cinco controles ocupan dos filas) y los dos marcadores de asiento de 115 y 84
a **57 px** cada uno (390×844: 1149 → **1007 px**; 320×800: 1250 → **1122 px**).
- En pantallas con puntero táctil de hasta 1099 px las herramientas de carta son
  glifos de 32×32 sobre el borde superior de la carta en vez de una tira con
  etiqueta en flujo: medido, la tira costaba ~285 px de documento en un tablero
  de dos asientos.

## Segunda pasada: el teléfono, sin cromo de más

Con la tableta y el teléfono girado ya a cero, en 390×844 quedaban 163 px de
deuda que no eran ni cartas ni decisiones: cuatro huecos de 12,8 px del shell,
la pista de turnos con su leyenda y un registro de dos líneas, más 24 px de una
zona de mano cerrada que no mostraba nada.

| Elemento (390×844, motor real) | Antes | Ahora |
| --- | --- | --- |
| Huecos del shell (4 × 12,8 px) | 51 px | **19 px** |
| Registro de la partida | 65 px | **36 px** |
| Pista de turnos | 63 px | **49 px** |
| Zona de mano cerrada | 24 px | **0 px** (flota, fuera del flujo) |
| **Documento** | 1007 px | **894 px** |
| **Deuda vertical** | 163 px | **50 px** |

A 320×800 el mismo recorte deja el documento en 1009 px (deuda 209, antes 322).
La mano cerrada sigue montada con su lista de cartas en el árbol de
accesibilidad —sólo deja de ocupar una fila—, y el registro sigue anunciando la
última resolución con `aria-live` mientras las doce anteriores quedan a un toque.

## Tercera pasada: el teléfono que juega, no sólo se ve

El cajón ya no ocupaba una fila y el documento cabía en 894 px. Pero caber no es
jugar. Medido con puntero táctil real (`hasTouch`, 390×844) sobre `/?autostart`
con el motor de Phase, en la ventana de prioridad:

| Paso | Antes | Ahora |
| --- | --- | --- |
| Tocar una carta jugable del cajón | el panel ofrece «Jugar tierra: Plains» (caja 306×39 px en y=403) | igual |
| `elementFromPoint` en el centro de ese botón | `DIV.app` | `BUTTON` |
| `tap()` en el botón | agota el tiempo; nada ocurre | Phase aplica la acción |
| `data-actions-applied` | 4 → 4 | 4 → **5** |
| Mano / campo | 7 cartas / 0 permanentes | 6 / **1** |
| Foco tras elegir la carta | donde quedó el toque | el botón que la carta desbloquea |

Causa medida, no supuesta: la selección sí abría la acción en el panel, pero el
cajón de 78dvh seguía abierto por encima y el tablero seguía `inert`
(`Board.svelte`: `inert={needsHandoff || session.handDrawerOpen}`). El botón
existía, se veía a medias y no era alcanzable ni con el dedo ni con el foco:
**desde la mano del teléfono no se podía empezar una partida**.

Arreglo en `Hand.svelte` (`select`): si el cajón está abierto y la selección
desbloquea un `CastSpell` o un `PlayLand`, el cajón se cierra, la acción entra en
el viewport (`scrollIntoView({ block: 'nearest' })`) y toma el foco. Las
selecciones que deben mantener la mano abierta —descartar hasta siete, elegir
objetivos— no llevan esas acciones y no se tocan.

Regresión: `tests/e2e/arena-touch-play.spec.ts` (contexto táctil, 390×844, motor
real de Phase) exige que el cajón se cierre solo, que el botón de la acción sea
el objetivo real del puntero, que tocarlo mueva la partida (acción aplicada,
carta fuera de la mano y en el campo), que después se pueda **pasar prioridad**
con el mismo dedo y que el teclado recorra el mismo camino con `Enter`. Con el
código anterior el test falla en la primera aserción: `aria-expanded` sigue en
`true` y la hoja nunca se cierra.

## Lo que no se hizo

- **No se recorta ninguna carta por debajo de lo legible.** El piso sigue siendo
  100 px de ancho en el teléfono y 118 px en la tablet; las cartas de combate
  siguen en 124×173 px a 1440×900.
- **No se esconde ninguna acción legal de Phase.** En horizontal la pila, el
  registro y la pista de turnos siguen en la misma columna, debajo de la
  decisión, en el mismo orden de tabulación.
- **No se promete 0 px en un teléfono girado.** Diez permanentes legibles por
  asiento no caben en 390 px de alto: la deuda que queda (515 px) está medida y
  documentada, y la decisión se ve sin desplazar. Lo mismo vale para el fixture
  de peor caso (seis tierras + cuatro criaturas por asiento) a 320 px.

## Pruebas nuevas

- `tests/e2e/arena-viewport-matrix.spec.ts`
  - *matriz de tamaños*: nueve tamaños con el fixture espejo, sin desbordamiento
    horizontal, con techo de deuda por tamaño (guardia de regresión, no meta),
    mano alcanzable en todos (cajón ≥40 px o cartas montadas) y carta ≥70 px.
  - *partida real*: la decisión de Phase se ve **entera** sin desplazar a
    1440×900, 1024×768, 844×390 y 390×844; y el cajón, abierto a 390×844, se
    cierra solo al crecer a 1280×800 sin dejar el tablero `inert`.
- `arena-quality-gate.spec.ts` pasa de cinco a **siete perfiles**: se suman
  844×390 y 1024×768, con axe-core limpio en ambos modos nuevos.
- `arena-touch-play.spec.ts` (M6, ampliado en la cuarta pasada): la partida real
  jugada con el dedo a 390×844 **y 320×800** — elegir carta, jugarla, pasar
  prioridad — sin que el cajón tape la decisión y **sin desplazar la página**.
  El toque va por coordenadas (`touchscreen.tap`) sobre la caja medida, no por
  `locator.tap()`, que desplaza solo. Falla con el código anterior de las dos
  maneras: el cajón no se cierra (M6) y la mano cae fuera de la pantalla a 320.

## Verificación

| Comprobación | Resultado |
| --- | --- |
| `bun run check` | 0 errores (2 avisos preexistentes) |
| `bun test src/lib` | 251 pasadas |
| `bun run build` | correcto |
| `bun --bun playwright test` | **68 pasadas, 1 saltada, 0 rojas** |

Evidencia cruda de las mediciones: `MESA_VIEWPORT_MATRIX` y
`MESA_VIEWPORT_MATRIX_REAL` en la salida del test, con JSON adjunto por corrida.

## Cuarta pasada: el 320 que no se envolvía (y la mano siempre al alcance)

A 390×844 la partida ya cabía en una pantalla (deuda 2 px en el estado medido).
A 320×800 el mismo estado debía 161 px, y **76 de esos píxeles no eran ni
cartas ni decisiones: eran cuatro textos que se partían en dos líneas** porque a
320 no caben. Comparado con 390×844, en el mismo turno:

| Elemento (320×800, motor real) | 390×844 | Antes | Ahora |
| --- | --- | --- | --- |
| Barra superior (5 controles) | 67 px | 93 px (2 filas: faltaban **3,6 px** para una) | **65 px** |
| Recuento del rival («Mano 7 · Biblioteca 33 · … · Maná 0») | 15 px | 34 px (2 líneas) | **14 px** |
| Barra del rival | 57 px | 77 px | **56 px** |
| Título «Tu campo de batalla · Jugador 1» | 18 px | 36 px (2 líneas) | **17 px** |
| Métricas del motor | 16 px | 29 px (2 líneas) | **16 px** |
| **Documento** | 846 px | 961 px | **884 px** |
| **Deuda vertical** | 2 px | 161 px | **84 px** |

La barra superior no se pliega en un menú: la cabecera de `Board.svelte` ya
documenta que una versión anterior escondió un control de juego tras un
`details` y el driver dejó de verlo. Aquí se aprieta el espacio entre los cinco
controles (0,1 rem), el botón de ajustes y los dos chips; los cinco siguen a la
vista y con su nombre accesible completo.

El cuarto arreglo no es de documento, es de **jugabilidad**. Medido a 320×800:
el botón que abre la mano caía en y=879, fuera de un viewport de 800 — para
jugar una carta había que desplazar la página primero, y el `tap()` de las
pruebas funcionaba de casualidad porque Playwright desplaza solo. Ahora el botón
va pegado al borde inferior (`position: sticky`, por debajo de la hoja abierta y
por encima de `env(safe-area-inset-bottom)`): la mano está siempre a un toque, y
la fila sigue siendo la misma en el flujo, así que el documento no crece.

| Punto de medida | Antes | Ahora |
| --- | --- | --- |
| Botón de la mano a 320×800, sin desplazar | y=879 (fuera) | **y=756** (borde inferior) |
| Botón de la mano a 844×390 (teléfono girado) | y=346 en un documento de 801 | **y=346, visible** |
| Botón de la mano a 390×844 | y=776 | y=776 (ya estaba dentro) |
| Documento a 320×800 | 961 px | 884 px |

`tests/e2e/arena-touch-play.spec.ts` ahora **toca con dedo real**: mide la caja
del control, exige que esté dentro del viewport sin desplazar y pulsa en esas
coordenadas (`page.touchscreen.tap`), no con `locator.tap()` —que desplaza
solo y por eso no podía demostrar nada—. Con el código anterior la prueba de
320 falla en la primera aserción: *«la mano cae fuera de la pantalla al
empezar: 923 px > 801 px»*.

## Pendiente

- 320×800 sigue debiendo 84 px en el estado medido (161 antes de la cuarta
  pasada), y más con permanentes en la mesa. Lo que queda ya no es cromo
  envuelto: es el panel de decisión (281 px, con la guía de Phase en tres
  líneas), el registro (36) y la pista de turnos (49) — información que no se
  recorta sin cambiar el juego. Un "modo miniatura" (tablero a escala con panel
  de detalle) sigue siendo la vía honesta para llegar a cero.
- El registro de la partida (101 px) sigue siempre visible en el teléfono; un
  plegado por defecto con contador sería la siguiente ganancia, pero toca un
  texto que hoy leen las pruebas de partida real y merece su propio PR.
