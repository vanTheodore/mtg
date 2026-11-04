# Arena 0.9 — herramientas de carta alcanzables de verdad

**Fecha:** 4 de noviembre de 2026 · **Base:** `main` @ `90ce36f` · **Misión:** issue #42, M0

Este documento reúne la evidencia medida que sostiene el PR #43. Todo número
salió de Chromium 153 sobre este repositorio con el motor Phase real, no de
inspeccionar el CSS.

## 1. Los dos fallos rojos de #39 / #41

### #41 — «la opacidad nunca llega a 1» era un síntoma, no la causa

Reproducir el test en su propio HEAD (`1dbe126`) dio exactamente lo que
describía el issue:

```
toolbarOpacity: 0.468176      → transición CSS de 120 ms a medio camino
pointerHitsToolbar: false
hitTag: null
buttonRect: { y: 888, height: 28 }     scrollRect: { top: 722, bottom: 973 }
```

La opacidad era efectivamente inestable porque el test leía durante el fundido.
Pero el mismo volcado muestra el problema de fondo: **el botón estaba por debajo
del borde inferior del viewport** (`y ≈ 888` en una ventana de 900 px), dentro de
un scrollport que empieza en 722. Ni el ratón ni el ojo llegaban al botón: la
métrica de opacidad lo estaba tapando.

**Causa:** `.card-tools` vivía en el flujo normal *debajo* de la cara de la
carta. Dentro de la mano (un scrollport horizontal) eso añadía una fila de altura
al final de cada carta; en un escritorio de 900 px esa fila caía fuera.

**Corrección:** la barra de herramientas se ancla al recuadro de la carta
(esquina superior derecha), fuera del flujo, y solo toma el puntero cuando la
carta tiene hover o foco. La etiqueta escrita sigue disponible para tecnología
asistiva; en táctil el control vuelve a fluir con 32 px de alto mínimo.

**En el test:** se espera `opacity: 1` *antes* de medir geometría, y además se
afirman las dos condiciones que de verdad importan — el centro del botón está
dentro del scrollport **y** `elementFromPoint` devuelve el botón — más un clic
real de ratón que abre el diálogo de ampliación.

### #39 — «No se pudo pulsar la carta» en una partida larga

Con el motor Phase real instalado, `tests/e2e/ui-deck-10e.spec.ts` (4 pruebas,
incluida la partida completa hasta el resultado) pasa con la corrección de
arriba: **4 passed**. La interacción que antes fallaba ya no encuentra un
toolbar interceptando el centro de la carta, porque el toolbar ya no ocupa el
centro: ocupa una franja de 1.55 rem en el borde superior.

## 2. El defecto que ningún test cubría

Al revisar la corrección a mano apareció un problema que **sí** era real y que la
prueba de una sola carta no podía ver: el abanico de la mano levanta la carta
24 px al pasar el ratón (`translateY(-24px) scale(1.04)`), con
`transform-origin: center 82%` — es decir, el borde inferior apenas se mueve y el
superior sube. Con el toolbar anclado al borde superior, la carta que estabas
señalando sacaba su propia herramienta **fuera** del scrollport:

| Estado medido (1440×900, mano de 7) | Botón «Ampliar» | Scrollport | Alcanzable |
| --- | --- | --- | --- |
| Antes del ajuste (lift −24 px, escala 1.04) | y = 599 | top = 624 | 2 de 7 cartas |
| Después (lift −14 px, escala 1.05) | y = 621–637 | top = 624 | **7 de 7** |

La elevación se redujo a −14 px con escala 1.05: la carta resaltada sigue
leyéndose como «esta es la que señalas», pero la herramienta queda dentro del
área desplazable y recibe el clic.

`tests/e2e/arena-card-tools-reachability.spec.ts` recorre **las siete cartas** de
la mano hover por hover y exige, para cada una:

- el centro del botón dentro del scrollport,
- `elementFromPoint` devolviendo el botón,
- el centro de la carta sin tapar (para no volver a romper la jugabilidad),
- y el camino de teclado (Tab desde la cara → Enter abre el diálogo).

En móvil emulado con `hasTouch`/`isMobile` exige `(hover: none)`, botón en flujo,
≥ 32 × 32 px y `tap()` real.

**Prueba discriminante:** contra los componentes anteriores el mismo test falla
con `carta 0: el puntero no llega a la herramienta (null)` y `Received: 24`
(24.8 px de objetivo táctil). No es una prueba que solo sepa decir «sí».

## 3. Estado medido del tablero (sin regresiones)

`/stress` con la escena espejo 6 tierras + 4 criaturas por asiento y mano de 7,
a 1440×900:

| Métrica | Antes (0.8.2) | Después (este PR) |
| --- | --- | --- |
| Desbordamiento horizontal del documento | 0 px | **0 px** |
| Deuda vertical del documento | 105 px | **0 px** |
| Cartas en el campo | 10 + 10 | 10 + 10 (sin cambios de tamaño) |
| Alto de la zona de mano | 285 px | **214 px** |

Recuperar 105 px de deuda vertical no cuesta una sola carta: sale de sacar del
flujo un toolbar que no debía ocupar altura.

## 4. Cómo se verificó

```sh
bun run check                 # 0 errores
bun test src/lib              # 251 pass
bun run engine:verify         # procedencia del pin
bun --bun playwright test     # Chromium, motor Phase real
```

La suite completa quedó en **52 passed / 1 skipped / 0 failed** con el motor
Pinned (`sha256 77c9df4a…`), ejecutada localmente en este entorno.
