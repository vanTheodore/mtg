# Arena 1.0 — la puerta de calidad permanente

**Fecha:** 4 de noviembre de 2026 · **Misión:** issue #42, M3

M3 no era una pantalla: era dejar el listón puesto. Lo que sigue es lo que un
cambio de UI tiene que pasar **siempre**, no una corrida puntual, y cómo se
comprueba sin margen de interpretación.

## Lo que ya corría (y sigue corriendo en CI)

`.github/workflows/ci.yml`, cuatro trabajos:

| Trabajo | Qué ejecuta | Bloquea |
| --- | --- | --- |
| `static` | `engine:verify`, `bun run check`, `bun test src/lib`, `bun run build` | Sí |
| `wasm` | compilación WASM con el pin de Rust y `Cargo.lock`, publica `sha256` | Sí |
| `native-integration` | `engine:parity`, `engine:scenarios` | Sí |
| `browser` | `bun --bun playwright test` con el WASM del pin | Sí |

## Lo que se añadió en M3

### 1. Un comando local equivalente: `bun run quality`

```sh
bun run quality          # engine:verify → check → bun test src/lib → build → playwright
bun run quality:engine   # engine:parity + engine:scenarios (necesita Rust nativo)
```

`verify` se queda como estaba (rápido, sin navegador) y `quality` es la corrida
completa: exactamente lo mismo que exigen los cuatro trabajos de CI, en ese
orden, sobre el `main` que se esté mirando.

### 2. `tests/e2e/arena-quality-gate.spec.ts` — cinco anchos, seis promesas

Una prueba por ancho, siempre con navegación real a `/stress`:

| 320 | 375 | 390 | 768 | 1440 |
| --- | --- | --- | --- | --- |
| táctil | táctil | táctil | táctil | ratón + teclado |

En cada ancho se exige:

1. navegación real a una ruta real;
2. `scrollWidth - innerWidth ≤ 1` (nada de desbordamiento horizontal);
3. **ratón**: `document.elementFromPoint` en el centro de una carta del campo
   devuelve la carta —no una herramienta encima ni una capa invisible—;
4. **teclado**: foco en la carta, `Tab` llega a **su** `Ampliar`, `Enter` abre
   el diálogo y `Escape` lo cierra;
5. **táctil**: `tap` sobre el mismo control abre el diálogo, sin `hover`;
6. **axe-core**: cero violaciones `critical` o `serious`;
7. evidencia: captura y JSON con `MESA_VIEWPORT_EVIDENCE`, más la invariante
   de la mano cerrada (<110 px) en los tres teléfonos.

En el teléfono la prueba **abre el cajón con el botón real** antes de medir y lo
**cierra con su botón** antes de capturar: el estado medido es el que ve una
persona, no un montaje.

### 3. Lo que ya existía y se conserva

- `ui-deck-10e.spec.ts` sigue siendo la prueba de verdad: una partida real de
  Phase jugada con controles Svelte, con el `DeclareBlockers` real y la deuda
  vertical afirmada en **0 px**.
- `arena-mobile-drawer.spec.ts` (M2) cubre la mano-cajón con puntero táctil.
- `captureViewportEvidence` sigue escribiendo JSON + PNG por estado
  (`docs/evidence/`, `test-results/`).

## Reglas de la casa que esta puerta hace cumplir

- No se borra, salta ni suaviza una prueba roja; si una métrica no se alcanza,
  se documenta la deuda y su causa (`docs/ARENA-1.0-BOARD.md` y
  `docs/ARENA-1.0-MOBILE.md` son ejemplos de ese registro).
- No se gana altura escondiendo una acción legal de Phase ni encogiendo una
  carta por debajo de lo legible (100 px de ancho en el teléfono es un piso
  medido, no un gusto).
- Las identidades de cartas ocultas no se filtran: la mano rival sigue siendo un
  conteo, y nada de lo añadido en M1–M3 consulta Scryfall por una carta oculta.
- El pin y el ABI de Phase no se tocan como efecto secundario de la UI:
  `engine:verify` lo comprueba en cada corrida.

## Estado medido al cerrar M3

- `bun run check`: 0 errores, 2 avisos preexistentes.
- `bun test src/lib`: 251 pasadas.
- `bun run build`: correcto.
- `bun --bun playwright test`: **62 pasadas, 1 saltada, 0 rojas**
  (antes de M3 eran 58: las cinco de la puerta más la de M2).
- Anchos: 320/375/390/768/1440 sin desbordamiento horizontal y con axe limpio
  en los cinco.
