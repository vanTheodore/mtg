# Diagnóstico de overflow en la mano Arena (0.8.4)

Estado: **instrumentación preparada, no confirmación de bug**. Baseline de interfaz: `main` después del PR #37. Mantener este trabajo separado de #39 (barra contextual de cartas) y de las importaciones de Phase.

## Hipótesis

En `Hand.svelte`, `updateOverflow()` calcula:

```ts
overflow = scroller.scrollWidth > scroller.clientWidth + 2;
```

La vista Arena utiliza cartas con rotación/traslación y solapamiento; el área física visible de las **caras** de carta no tiene necesariamente el mismo ancho que el `scrollWidth` del contenedor. Se observaron flechas y aviso de desbordamiento en una captura de una mano de cuatro cartas; **una captura no basta para decidir** que sean superfluos. Además el `$effect` existente solo rastrea el número de objetos, mientras `onscroll` también recalcula. Una redimensión sin remonte merece una prueba independiente.

## Pruebas

Archivo: `tests/e2e/hand-overflow-evidence.spec.ts`.

- `1440×900`, `390×844` con 4 y 30 cartas, en `/stress?hand=N&tokens=0&mirror=1`. Registrar `scrollWidth`, `clientWidth`, `scrollLeft`, controles, aviso y rectángulos reales de las caras.
- Capturar posiciones iniciales, extremo derecho y extremo izquierdo restaurado. Con 30 cartas, además de ver las flechas, **enfocar el botón y pulsar Enter**; comprobar que la mano se desplaza.
- Cambiar **la misma instancia** 1440×900 → 390×844 → 1440×900 sin recargar, registrar la discrepancia de UI y métricas tras dos `requestAnimationFrame`.
- En 1440×900, enfocar una carta y registrar si la barra `Ampliar` está realmente dentro del **scrollport** y si `document.elementFromPoint()` puede acertar sobre su botón. Esto distingue visibilidad geométrica de mera opacidad/foco.
- Los logs `MESA_HAND_OVERFLOW_EVIDENCE`, `MESA_HAND_RESIZE_EVIDENCE` y `MESA_HAND_TOOLBAR_EVIDENCE` y sus JSON adjuntos son la fuente de observación.

Comando para ejecución focalizada en entorno con Bun, navegador y dependencias:

```sh
bun --bun playwright test tests/e2e/hand-overflow-evidence.spec.ts
```

Esta ruta de `/stress` es un **fixture de presentación**: no demuestra paridad de reglas de Phase.

## Interpretación

| Evidencia | Interpretación provisional | Siguiente paso |
| --- | --- | --- |
| `layoutSaysOverflow=true`, `clippedFaceCount=0` | Posible falso positivo de métrica CSS/transform (pero revisar estados de foco y último extremo) | Revisar qué cajas desbordan y la accesibilidad de la última carta antes de retirar flechas |
| `layoutSaysOverflow=false`, `clippedFaceCount>0` | Caras recortadas sin aviso; riesgo de cartas inaccesibles | Añadir regresión RED y corregir límites/foco/scroll |
| `controls !== layoutSaysOverflow` después de resize | Señal observable de estado `overflow` obsoleto | Investigar `ResizeObserver`/evento de resize y dependencias reactivas |
| 30 cartas, flecha derecha no desplaza por Enter | Regresión de navegación de teclado | Bloquear integración hasta corregir |
| `layoutSaysOverflow=true`, `clippedFaceCount>0` | Overflow y clipping coherentes | Conservar scroll/indicadores; comprobar navegación al extremo |

`clippedFaceCount` usa el rectángulo de la cara frente a la zona visible, no evalúa superposiciones entre cartas ni garantiza que el contenido sea clicable. Completar con foco y capturas cuando las cifras diverjan.

**No arreglar ocultando flechas sin demostración**: una mano grande (hasta 30 cartas o más) debe seguir siendo operable con mouse, táctil y teclado. Si se confirma un problema, convertir el caso a una prueba de regresión que falle en `main` y pase con la corrección; ejecutar Chromium antes de merge.


## Corrección acotada de recalculado responsivo (rama `fix/arena-hand-resize-overflow-20261104`)

Una revisión del código encontró una dependencia omitida: el `$effect` que actualiza `overflow` únicamente lee `objects.length`, y el evento `onscroll` no necesariamente se dispara al cambiar el ancho disponible. Se preparó una corrección **aún sin ejecutar en Chromium** que conserva intacto el criterio de `scrollWidth > clientWidth + 2` y añade:

- `ResizeObserver` sobre el área desplazable para rediseños de contenedor;
- `resize` de ventana para cambios de viewport, aun sin remonte;
- recálculo reactivo cuando cambian modo abanico o escala;
- coalescencia de mediciones mediante `requestAnimationFrame` y limpieza al desmontar.

El test de redimensión ahora exige que cuatro cartas **no** desborden a 1440×900, que **sí** desborden a 390×844 y que las flechas/aviso sigan en concordancia antes y después de volver a escritorio. No sustituye el diagnóstico independiente de false positives por transformaciones ni la prueba de click real en la barra contextual.

**Integración:** primero validar y fusionar PR #39 (si pasa los gates); luego rebasar/actualizar esta rama contra `main`, ejecutar Bun + Chromium y abrir PR con las evidencias obtenidas. No reportar bug reparado ni merge hasta cumplir ese orden.
