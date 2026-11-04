# Arena 1.0 — el tablero de verdad, medido

**Fecha:** 4 de noviembre de 2026 · **Misión:** issue #42, M1 · **Base:** `main` @ `90ce36f` + M0

La meta falsable del issue era: *«en una decisión real `DeclareBlockers` del
motor Phase a 1440×900, objetivo 0 px de deuda vertical del documento;
referencia actual 137 px»*.

**Resultado: 0 px, sin encoger una sola carta ni esconder una acción legal.**

| Métrica (Phase real, `DeclareBlockers`, 1440×900) | Antes | Ahora |
| --- | --- | --- |
| Deuda vertical del documento | **137 px** | **0 px** |
| Desbordamiento horizontal | 0 px | 0 px |
| Cartas de combate | 124 × 173 px | 124 × 173 px |
| Barra superior | 63 px + 2 avisos de 31 px | 50 px, sin avisos |
| Pie de métricas | 56 px | 17 px (una línea) |
| Mano | 190 px, cartas recortadas | 182 px, `scrollHeight = clientHeight` |

Evidencia: `docs/evidence/blockers-before.json` (137 px) y
`docs/evidence/blockers-arena10.json` (0 px), con las capturas del mismo estado
(`blockers-before.png` / `blockers-after-0px.png`).

## De dónde salieron los 137 px (no de las cartas)

El desglose medido por selector, antes del cambio:

```
barra superior      63      ← identidad + dos casillas + Ajustes, en 2 líneas
avisos              31+31   ← cobertura del mazo y "Motor 40/40" a todo el ancho
main.layout        778
   campo rival     207
   mano rival       32
   campo propio    207
   mano            190
pie de métricas     56      ← 15 números de diagnóstico
```

Ninguna de esas filas es una carta. La corrección fue de **jerarquía**, no de
tamaño:

1. **La barra es una mesa, no una página.** Identidad, estado del motor
   (`Motor: 40 / 40 cartas cargadas por asiento`, el mismo texto de siempre,
   ahora en una píldora `role="status"`), asiento, y controles compactos.
2. **Los avisos dejan de ser banners.** «Motor 40/40» y la cobertura del mazo
   pasan a una línea plegable; el aviso de error sigue siendo `role="alert"` a
   ancho completo, porque un error no se esconde.
3. **El pie de métricas es una línea** (`Rendimiento del motor · reglas 2,1 ms ·
   80 objetos`) y los quince números viven detrás de su `details`.
4. **Se arregló un recorte real de la mano**: el scrollport medía 180 px con
   `scrollHeight` 206, porque el abanico rotado es ~10 px más alto que su
   envoltorio y arrastraba 13,6 px de padding superior. Las cartas de la mano se
   veían cortadas por la mitad en la captura «antes». Ahora
   `scrollHeight = clientHeight`.

## Lo que NO se hizo para llegar a 0

- No se redujo el tamaño de las cartas de combate.
- No se ocultó ninguna acción legal ni se redujo su zona de clic.
- No se quitó la pista de fases, la pila, el registro ni el control de
  auto-paso (ver «decisiones» abajo).
- No se usó `position: fixed` para tapar contenido.

## Decisiones de diseño que salieron de pruebas rojas

| Intento | Qué rompió | Decisión |
| --- | --- | --- |
| Menú `Opciones` con auto-paso y Ajustes dentro | El driver de partidas y los E2E no encuentran el auto-paso (`getByRole('checkbox', { name: 'Auto-pasar ventanas sin acciones' })`); el botón `Ajustes` desaparecía al cambiar a Clásico porque su panel se remontaba | Los controles siguen presentes; en Arena solo se **abrevia la etiqueta visible** (`Auto-paso`, `Asiento`) con el nombre completo en `.sr-only`. Ningún E2E cambia y el jugador no pierde controles |
| Reordenar el riel HUD entero (decisión primero) | `arena-ui.spec.ts` mide la geometría real: la decisión debe ir debajo de pila/registro y a ≥ −2 px | Se reordena **dentro** de la tarjeta de decisión: la guía de Phase antes de las resoluciones |
| Etiquetas cortas en el estado del motor | La documentación y los E2E citan `Motor: 40 / 40` y `El mazo se cargó completo` | Se conserva el texto exacto; solo cambia dónde vive |

## Accesibilidad y reversibilidad

- `bun test src/lib`: **251 pass** (sin cambios).
- `a11y.spec.ts` con axe-core: sin violaciones serias/críticas.
- Los `details/summary` nuevos son nativos: teclado, lector de pantalla y
  `aria-expanded` del navegador.
- **Clásico** conserva cada control en el orden original (`arena-ui.spec.ts`
  verifica que el estilo vuelve y que el ancho de carta clásico es ≥ 145 px).
- Móvil (390×844) no cambia de estructura: los bloques nuevos son solo de
  escritorio corto (`min-width: 1280px and max-height: 1000px`).

## Cómo reproducir

```sh
bun run engine:download     # o el puente de CI en entornos restringidos
bun --bun playwright test ui-deck-10e    # mide el DeclareBlockers real
```

`ui-deck-10e.spec.ts` imprime `MESA_VIEWPORT_EVIDENCE arena-live-block-1440x900`
con el volcado completo; el umbral que antes aceptaba 321 px ahora exige 0.
