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
| `bun --bun playwright test` | **68 pasadas, 1 saltada, 0 rojas** (69 pruebas) |

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

## Quinta pasada (M8): un teléfono es una pantalla, no un documento

La cuarta pasada dejó el 320×800 debiendo 84 px **sin permanentes en la mesa**.
Con el motor real y cartas jugadas, el estado de partida que de verdad importa,
la deuda se disparaba otra vez y nadie la había medido:

| Ventana (motor real, permanentes en la mesa) | Documento antes | Deuda antes | Documento ahora | Deuda ahora |
| --- | --- | --- | --- | --- |
| 320×800 | 1241 px | **441 px** | 800 px | **0 px** |
| 390×844 | 740 px | **575 px** | 844 px | **0 px** |
| 844×390 (girado) | 1503 px | **1113 px** | 390 px | **0 px** |
| 740×360 (girado) | 1134 px | **750 px** | 360 px | **0 px** |

La causa no era «falta de densidad»: era que el teléfono seguía siendo un
documento. Los dos campos ocupaban el 46 % de la altura, y con la mesa
desplazada la pregunta de Phase quedaba **por encima del borde** (−63 px a
390×844, −178 px a 844×390): el jugador miraba su campo y la decisión había
quedado fuera de la pantalla. Ajustar tipografías no arregla eso, sólo lo
retrasa una carta más.

Lo que se hizo, sin esconder información:

1. **El documento deja de crecer.** Bajo `max-width: 640px` o
   `max-height: 520px`, `.app` mide `100dvh` con `overflow: hidden` y es
   `main.layout` quien desplaza (`overflow-y: auto`, `overscroll-behavior:
   contain`). Dentro de un alto fijo las filas `auto` de la rejilla se
   aplastaban —los campos medían **12 px**— así que el tablero pasa a
   `align-content: start` + `grid-auto-rows: max-content` y crece para que
   desplace la región. La deuda es 0 **por construcción**, no por recorte.
2. **La decisión de Phase queda siempre a la vista.** El panel pasa a
   `position: fixed` al pie, por encima del botón de la mano. Medido a 390×844:
   el panel ocupa x=9,6–380,4 y el botón de la mano **los mismos bordes**
   (9,6–380,4), con 4,2 px de aire entre los dos; a 320×800, x=9,6–310,4 en
   ambos. Son 370,8 px de panel en una pantalla de 390, más ancho que los
   356 px de la columna que reemplaza.
3. **La mesa reserva el alto del panel.** `DecisionPanel` mide su caja y la
   publica como `--decision-h`; `main.layout` reserva ese alto **más el botón de
   la mano** en `padding-bottom` y `scroll-padding-block-end`. Antes el relleno
   estaba en `.layout > *` y la reserva dejaba «tu campo» detrás del panel; ahora
   está en la región que desplaza, así que ninguna carta queda debajo para
   siempre y el foco por teclado también se trae por encima del panel.
4. **La lección comparte el shell y también gana.** `/aprender` usa el mismo
   `app` + `.layout`, así que en el teléfono el documento también mide la
   pantalla. Medido a 320×800: el panel de la lección termina en y=615 y sus
   cuatro controles («Continuar», «Saltar este paso», «Ver el repaso»,
   «Palabras nuevas») quedan dentro de la vista y responden al puntero, mientras
   la mesa de la lección desplaza 394 px dentro de su región. Antes el documento
   medía 1185 px y había que bajar para llegar al botón que el texto pide pulsar.
5. **El fixture no se recorta.** Todo lo anterior cuelga de
   `:has(> .layout)` porque `/stress` no tiene `main.layout`: sin ese alcance, el
   `overflow: hidden` habría recortado su contenido y la matriz habría medido
   una deuda 0 falsa.

### El teléfono girado: 8 px que dejaban un botón sin puntero

Con la deuda ya en 0, la matriz real seguía encontrando un bloqueo de juego en
horizontal: el panel tenía **8 px de scroll interno a 844×390** y el último botón
de la decisión caía fuera del alcance del puntero (`elementFromPoint` devolvía el
panel, no el botón). A 740×360 el panel no desbordaba, pero el botón tampoco
respondía.

| Punto de medida (motor real) | Antes | Ahora |
| --- | --- | --- |
| Panel a 844×390 | y=46–294, h=248, **scroll interno 8 px** | y=46–294, h=248, **scroll interno 0** |
| Último botón a 844×390 | y=256, **el puntero no lo alcanza** | y=261–286, **responde** |
| Panel a 740×360 | y=46–264, h=218 | y=46–264, h=218 |
| Último botón a 740×360 | y=251, **el puntero no lo alcanza** | y=256, **responde** |
| Región de la mesa a 844×390 | 228 px de alto, 837 de contenido | 228 / 485–1158 |
| Región de la mesa a 740×360 | 204 px de alto, 1169 de contenido | 204 / 1169 |

El arreglo es estructural, no de `max-height`: el panel es una columna flex con
`overflow: hidden` donde la cabecera, las acciones, las confirmaciones y el
cierre son `flex: 0 0 auto`, y sólo la explicación (`.prompt`) y la guía
(`p.muted`) desplazan. Así los botones no se mueven nunca, por larga que sea la
guía de Phase.

### Lo que cambió en las pruebas

- `tests/e2e/arena-viewport-matrix.spec.ts`: la matriz real pasa a cinco
  ventanas (añade 740×360) y, además de que el panel quepa en la primera
  pantalla, exige tres cosas nuevas: **deuda 0** donde el shell de teléfono está
  activo (`width <= 640` o `height <= 520`), **scroll interno 0** en el panel y
  que el **último botón de la decisión responda al puntero** en su propio centro
  (`elementFromPoint`), no sólo que se pinte. Corrida de hoy, motor real:
  `1440×900`, `1024×768`, `844×390`, `740×360` y `390×844` con `panelScroll: 0`,
  `buttons: 2` y `lastButtonHit: true` en las cinco.
- `tests/e2e/arena-ui.spec.ts`: la aserción móvil de M7 medía alineación con la
  columna (`|decision.x − center.x| < 4`). En M8 el panel ya no es una fila de la
  columna, así que esa medida dejó de describir el diseño y fallaba por 9 px
  (los 8,98 que separan el borde de la hoja del relleno de la página). La
  reemplazan aserciones más fuertes: el panel es `fixed`, cabe entero en el
  viewport, está centrado, **nunca es más angosto que la columna**, no tapa el
  botón de la mano, no desplaza por dentro y su último botón acierta bajo el
  puntero. No se relajó ninguna medida: se cambió la que había dejado de ser
  cierta por otras que sí describen lo que el jugador necesita.
- `tests/e2e/arena-touch-play.spec.ts` sigue midiendo el 320×800 con dedo real
  (`page.touchscreen.tap`) y comprobando que el estado observable del motor
  cambia después del toque.

## Sexta pasada (M9): en la tablet, el HUD no se va de la pantalla

M8 dejó el teléfono con deuda 0. La banda intermedia (641–1099 px) no se había
medido **en partida**: la matriz real sólo miraba el `MulliganDecision`, y ahí
cabe todo. Con el motor real y cartas en la mesa —5 permanentes del rival, 6
propios, medidos a 1024×768— la situación era otra:

| Ventana (motor real, mid-game) | Documento | Deuda | Decisión | Último botón |
| --- | --- | --- | --- | --- |
| 1024×768 | 1354 px | 586 px | y=548–798 (**fuera por 30**) | y=745–785, **tapado** |
| 900×700 | 1352 px | 652 px | y=546–797 (**fuera por 97**) | — |
| 768×1024 | 1555 px | 531 px | y=538–789 | y=736–775 |
| 1024×1366 | 1574 px | 208 px | y=548–798 | y=745–785 |

A 1024×768 la primera pantalla no mostraba la decisión entera y el botón de la
mano (sticky, `z-index: 40`, y=724–768) tapaba el último botón del panel: la
acción de Phase sólo se podía pulsar desplazando la página, porque el `click()`
de las pruebas desplaza solo. El desglose de la altura explica por qué no cabe:

| Parte (1024×768, 5+6 permanentes) | Alto |
| --- | --- |
| Barra superior | 42 px |
| Campo del rival (tierras 171 + criaturas 179) | 390 px |
| HUD (pista 59, pila+registro 131, decisión 251) | 270 px |
| Tu campo (criaturas 179 + tierras 171) | 390 px |
| Barras de asiento | 80 px |
| Botón de la mano + métricas | 60 px |

Los campos miden 390 px porque **por debajo de 1100 px no hay tope de carta por
alto**: el rail de escritorio limita `--card-w` a `7.5dvh`, la banda intermedia
no. Con cartas de 118–124 px (legibles) y diez permanentes en la mesa, el
tablero no cabe en 768 px de alto: o se encogen las cartas o el tablero desplaza.

Lo que se hizo —y lo que se descartó, con su medida—:

- **El HUD se queda pegado al borde inferior.** `main.layout > .middle` pasa a
  `position: sticky; bottom: 3.4rem` (los 44 px del botón de la mano más 10 de
  aire) y a `order: 1`, para que al llegar al final del recorrido no se haya ido
  por arriba. Medido con `bottom` pegado pero sin el `order` (revertido en
  caliente con una hoja de estilo inyectada, sin tocar el código), a 1024×768 el
  HUD acababa en y=−38..212: la decisión se iba por arriba, justo al mirar tu
  propio campo.
- **Deuda intacta.** La deuda no se toca: 586/531/652/208 px, los mismos
  números que antes de M9. La compensación obvia —estrechar el HUD con
  `padding-inline` para que la guía vuelva a caber en menos líneas— se midió y
  **no mueve un píxel**: con 0,5, 0,8, 1, 1,5 y 2 rem la guía sigue en 122 px y
  la deuda idéntica (635 en una corrida con la guía más larga, 586 en el estado
  de referencia), a cambio de 10–50 px menos de ancho para la decisión. Se
  descartó. No se gana altura aquí; se gana que la decisión no se vaya de la
  pantalla.
- **No se tocó el shell del teléfono.** Un `100dvh` con `overflow: hidden` en
  esta banda rompería el `sticky` (el `.layout` pasaría a ser el scrollport y el
  HUD no podría viajar), y un panel `fixed` aterrizaría encima del abanico de la
  mano: medido a 768×1024, el abanico ocupa y=1253–1512 y el documento sigue
  desplazando. El HUD en flujo es lo único que no puede solaparse con él.
- **No se encogieron las cartas.** Bajar el tope del rail a esta banda
  (`7.5dvh`) daría cartas de 54–62 px, por debajo del mínimo legible que ya
  fijan las pruebas del fixture.

Resultado medido, en las dos puntas del recorrido (y también a 25, 50 y 75 %):

| Ventana | Decisión al inicio | Decisión al final | Último botón | ¿Choca con la mano? |
| --- | --- | --- | --- | --- |
| 1024×768 | y=453–704 | y=398–649 | **acierta en las dos** | no |
| 900×700 | y=385–636 | y=331–582 | **acierta** | no |
| 768×1024 | y=709–960 | y=440–690 | **acierta** | no |
| 1024×1366 | y=984–1235 | y=776–1027 | **acierta** | no |

`tests/e2e/arena-viewport-matrix.spec.ts` fija ahora esa propiedad: en la partida
real, a 1024×768 y 768×1024, desplaza hasta el final y exige que la decisión
siga entera (`top >= 0`, `bottom <= alto`), que el último botón acierte bajo el
puntero y que el HUD sea `sticky`. La prueba sólo miraba el principio del
documento, que es donde el problema no estaba.

`tests/e2e/ui-deck-10e.spec.ts` comprobaba a 768×900 que el HUD volvía a ser
`position: static` (el contrato de "en la tablet vuelve la línea central"). Con
M9 esa aserción sólo podía pasar si el arreglo no existía, así que se sustituye
por las propiedades que de verdad importan, todas medidas en la misma corrida:
**una sola columna** (no el rail de escritorio), el HUD **tan ancho como el
campo** (≥95 %), `position: sticky` y `top: auto` con `bottom` positivo. Es decir:
no es el rail, sigue en el flujo de la línea central y además se queda al pie.

## Séptima pasada (M10): la tablet tampoco es un documento

M9 dejó la decisión siempre a la vista en la banda 641–1099 px, pero el
documento seguía creciendo: el alto lo decidían los dos campos, no la pantalla.
Medido con el motor real y la mano viva (5 cartas, 4+4 permanentes), en un
**mismo estado** y con el CSS de M9 restaurado en caliente para tener el «antes»
exacto:

| Ventana (mismo estado de partida) | Documento antes | Deuda antes | Documento ahora | Deuda ahora |
| --- | --- | --- | --- | --- |
| 641×768 | 1281 px | **513 px** | 768 px | **0 px** |
| 768×1024 | 1593 px | **569 px** | 1024 px | **0 px** |
| 900×700 | 1343 px | **643 px** | 700 px | **0 px** |
| 1024×768 | 1346 px | **578 px** | 768 px | **0 px** |
| 1099×768 | 1308 px | **540 px** | 768 px | **0 px** |

Y el detalle que M9 documentó como pendiente: **el abanico de la mano nacía bajo
el borde**. A 768×1024 empieza en y=1244 en un documento de 1593 (244 px por
debajo de una pantalla de 1024).

Lo que se hizo, con el criterio de M8 aplicado **por ancho**:

1. **El documento mide la pantalla.** `.app:has(> .layout)` pasa a `100dvh` con
   `overflow: hidden` y es `main.layout` quien desplaza (`align-content: start` +
   `grid-auto-rows: max-content`, porque dentro de un alto fijo las filas `auto`
   aplastan los campos; y `scroll-padding-block-end` para que el foco por teclado
   no quede detrás del HUD pegado de M9). Medido: la región mide 601 px de alto
   con 1178 de contenido a 1024×768, y 596/1165 a 768×1024.
2. **La mano tiene su propia fila al pie**, y por eso ya no hay que desplazar
   para encontrarla: a 768×1024 el abanico va de 675 a 982 y a 1024×768 el botón
   del cajón ocupa 683–727 con las métricas del motor debajo (739–755). Antes el
   botón era `sticky` y flotaba sobre las métricas en 724–768; ahora es una fila
   del pie como el resto.
3. **El HUD de M9 sigue pegado al pie de la región** (`bottom: .5rem`, ya no
   `3.4rem`: la mano está fuera de la región que desplaza y no hay que
   esquivarla), así que la decisión sigue entera en todo el recorrido.
4. **`/stress` queda fuera** con `:has(> .layout)`: no tiene `main.layout`, así
   que ahí la página sigue desplazando como siempre. Sin ese alcance el
   `overflow: hidden` recortaría su contenido y la matriz habría medido una deuda
   0 falsa.

Resultado medido con la mesa llena (`MESA_VIEWPORT_TABLET`), en las cuatro
ventanas de la banda:

| Ventana | Región (alto/contenido) | Mano | Carta de campo | Decisión al final | Último botón | Última carta propia |
| --- | --- | --- | --- | --- | --- | --- |
| 1024×768 | 601 / 1158 | 765–768 (cajón) | 118 px | y=419–641 | **acierta** | **se toca** |
| 900×700 | 533 / 1176 | 697–700 (cajón) | 118 px | y=332–574 | **acierta** | **se toca** |
| 768×1024 | 596 / 1165 | 675–982 (abanico) | 115 px | y=394–635 | **acierta** | **se toca** |
| 641×768 | 607 / 1120 | 765–768 (cajón) | 100 px | y=406–648 | **acierta** | **se toca** |

No se encogió ninguna carta para llegar a cero: son las mismas de la banda
(118/115/100 px). La lección (`/aprender`) comparte `app` + `.layout`, así que a
768×900 su documento pasa de 1189 px a los 900 de la pantalla; la captura
`docs/screenshots/tutorial-768.png` se regenera por eso y la prueba que exige
que la lección se vea entera en 320, 375, 390, 768 y 1440 sigue pasando. Fuera de la banda no cambia nada, y no sólo por medición: la
`@media` no puede aplicarse a ≥1100 px ni a ≤640 px. Comprobado con el cambio
desactivado en caliente en el mismo estado: `1440×900`, `1280×800`, `1180×820`,
`1100×700`, `640×768`, `844×390`, `390×844` y `320×800` dan exactamente los
mismos números con y sin M10.

`tests/e2e/arena-viewport-matrix.spec.ts` gana una prueba propia («tablet con la
mesa llena») porque la matriz existente corre en el `MulliganDecision`, donde el
tablero está casi vacío: medir la deuda de una tablet ahí es medir una pantalla
vacía. La prueba nueva juega hasta tener mano viva y permanentes en los dos
campos y entonces exige deuda 0, que la región tenga algo que desplazar, que la
mano quepa, que las cartas sigan ≥70 px y que al final del recorrido respondan
el último botón de la decisión y la última carta del campo propio. La prueba de
la matriz se queda con lo que vale en cualquier estado (deuda 0, región propia,
mano dentro de la pantalla).

## Octava pasada (M11): el escritorio también es una pantalla

M8 hizo pantalla al teléfono y M10 a la tablet. El escritorio (1100 px o más)
seguía siendo un documento, y con la mesa llena la deuda volvía: medido con el
motor real y la mano viva (4 cartas, 5 y 6 permanentes), el documento medía
841 px a 1366×768, 859 a 1280×800, 876 a 1180×820 y 837 a 1100×700. A 1100×700
el abanico de la mano (194 px) acababa en y=810 sobre una pantalla de 700: la
mano se iba 110 px por debajo.

| Ventana (mesa llena) | Deuda antes | Deuda ahora | Tierras antes | Tierras ahora |
| --- | --- | --- | --- | --- |
| 1440×900 | 0 px | 0 px | 68 px | **70 px** |
| 1366×768 | **73 px** | **0 px** | 58 px | **70 px** |
| 1280×800 | **59 px** | **0 px** | 60 px | **70 px** |
| 1180×820 | **56 px** | **0 px** | 62 px | **70 px** |
| 1100×700 | **137 px** | **0 px** | 53 px | **70 px** |

Las criaturas no se tocan (124/115/120/123/105 px en esas mismas corridas): lo
que cambia es que la mesa se queda con la pantalla y desplaza dentro.

### Lo que costó encontrarlo

Tres cosas salieron de medir, no de leer el CSS:

1. **La mano tapaba la decisión a 1100×700.** Con la región en alto definido el
   rail (`sticky`, 529 px) es más alto que la región (419 px). Con el orden de
   siempre, el último botón de la decisión caía en y=536 —por debajo del corte de
   la región en 474— y `elementFromPoint` devolvía el abanico de la mano. La
   prueba vieja medía el rail entero en pantalla y daba verde: el rail estaba en
   pantalla, lo que no estaba era el botón. Se arregla con la regla que M7 ya
   había aplicado a la línea central del teléfono: **la decisión va antes que el
   registro** (`> .middle > .center { order: 1 }`). Medido después: el panel ocupa
   133–447 por arriba y 13–327 al final del recorrido, y su último botón responde
   en las dos puntas.
2. **Los dos campos se solapaban.** Con la región en alto definido el motor
   encogía las filas `auto` para que cupieran (medido a 1280×720: filas de 57 px
   con campos de 182 px dentro), así que el campo del jugador se pintaba encima
   del rival. No era cosmético: la partida se atascaba al declarar bloqueadoras
   porque Playwright no podía pulsar la criatura atacante — el texto de tipo del
   campo propio interceptaba el puntero. Se arregla con `grid-auto-rows:
   max-content`, la misma regla que M10 ya usaba en la tablet.
3. **La prueba de M9 medía el documento, que ya no desplaza.** Desde M10 el
   `scrollTo(0, scrollHeight)` del bloque de tablet era un no-op: las dos puntas
   del recorrido medían lo mismo y el bloque daba verde por construcción. Ahora
   desplaza el contenedor que de verdad desplaza (la región si desborda, si no el
   documento).

### Lo que quedó anotado, no arreglado

- Al final del recorrido, el rail `sticky` se suelta y el **titular** del panel
  puede recortarse 11 px por arriba (a 1100×700). Sus acciones no: la prueba mide
  el primer y el último botón, no la caja del panel.
- A 1440×1100 el abanico de la mano crece hasta 348 px (32 % de la pantalla)
  porque el tope por alto del rail sólo existe en `max-height: 1000px`. Es
  anterior a M11 y no entra en esta pasada.

`tests/e2e/arena-viewport-matrix.spec.ts` gana la prueba «escritorio con la mesa
llena»: juega hasta tener mano viva y cinco permanentes por campo y, en 1440×900,
1366×768, 1280×800, 1180×820 y 1100×700, exige deuda 0, que la aplicación mida la
pantalla, la región con `overflow-y: auto`, la mano dentro de la pantalla, tierras
y cartas ≥70 px, los dos campos separados (la prueba que habría atrapado el
solapamiento), la decisión entera y su último botón respondiendo, y al final del
recorrido las acciones de la decisión y la última carta del campo propio. La mano
sólo se monta si no hay traspaso de asiento pendiente, así que la prueba liquida
el traspaso antes de medir en vez de esperar a un elemento que no va a aparecer.

## Pendiente

- **El abanico de la mano a 1440×1100**: mide 348 px de alto (32 % de la
  pantalla) porque el tope por alto sólo existe hasta 1000 px. Un tope por
  `dvh` en toda la banda es la vía, pero cambia el tamaño de la mano en la
  pantalla más alta y merece su propia medición.
- El registro de la partida sigue siempre visible en el teléfono; un plegado por
  defecto con contador sería la siguiente ganancia, pero toca un texto que hoy
  leen las pruebas de partida real.
- Una corrida de la suite completa falló una vez en
  `arena-card-tools-reachability` (fixture `/stress`, 1440×900, sin relación con
  esta banda): no se reprodujo ni con `--repeat-each=2` ni en dos corridas
  completas posteriores. Queda anotado como intermitente, no como arreglado.
- Las cifras de este documento son de una corrida concreta con el estado de
  partida descrito; la matriz real imprime `MESA_VIEWPORT_MATRIX_REAL` y la de
  tablet `MESA_VIEWPORT_TABLET` en cada ejecución para volver a medirlas.
