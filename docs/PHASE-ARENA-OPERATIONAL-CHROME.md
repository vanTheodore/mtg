# Arena 0.8.4 — compactación de estado operativo (propuesta)

## Evidencia y motivo

En el artefacto Chromium del PR #39, run [41881997634](https://github.com/vanTheodore/mtg/actions/runs/41881997634), el combate real de Phase a 1440×900 produjo `document.scrollHeight=1037` y **137 px** de desbordamiento vertical, sin scroll horizontal. El `main.layout` ocupó 778 px; las cartas del combate siguieron midiendo **124×173 px**. La fixture sintética espejo 6 tierras + 4 criaturas por lado y 7 cartas en mano ya cabía con **0 px** vertical.

La captura de la partida auténtica muestra dos áreas que no son decisiones legales ni cartas: (1) el aviso verde de carga de mazo **40/40** en su propia fila; (2) más de una docena de indicadores técnicos de tiempo al pie. La advertencia de cobertura de reglas también está presente, pero **no debe ocultarse**.

## Cambios preparados

- En Arena, **solo cuando todos los asientos tienen el número de cartas solicitado**, la confirmación aparece en el encabezado como `role=status` con el texto visible `Motor: 40 / 40`, y el detalle completo permanece como etiqueta accesible. No se duplica la notificación a ancho completo.
- Si falta una sola carta, permanece el **aviso de advertencia visible** con el mensaje previo. El estilo Clásico mantiene el aviso verde completo.
- Las métricas internas siguen completas en un `footer` con su nombre accesible, ahora dentro de `details` / `summary`. En Arena, el desplegable está cerrado por defecto; se puede abrir por mouse, teclado o lector de pantalla. En Clásico continúa abierto y visualmente igual.

No hay cambios a Phase, `GameAction`, tarjetas, mano ni opciones legales.

## Verificaciones

- [ ] `bun run check`, `bun test src/lib`, build, motor nativo/escenarios, WASM.
- [ ] E2E 10E: assert del status de carga 40/40 y su texto accesible; comprobar `details.open`, lectura del `footer.metrics` y cierre.
- [ ] E2E Phase `DeclareBlockers`: nueva captura de 1440×900 **sobre exactamente el mismo estado real**, reportar `verticalOverflow` y comparar con 137 px; no declarar pantalla única antes de ver 0 px.
- [ ] Confirmar que advertencias de cobertura/carga parcial conservan su visibilidad, que el modo Clásico no pierde su pie expandido y que 320/390/768 no ganan scroll horizontal.
- [ ] Fusionar **solo después** del PR #39 verde; no abrir un PR ni desplegar basándose únicamente en el screenshot anterior.

**Estado:** commits de implementación y prueba en la rama `ui/arena-compact-engine-status-20261104`. No probados aún. El cálculo de ahorro de píxeles es una hipótesis hasta obtener nueva evidencia Chromium.
