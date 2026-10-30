# Contrato Mesa ↔ Phase WASM (0.2)

Este documento describe **solo lo que Mesa expone hoy**. El motor Rust sigue siendo
Phase, fijado en `c2fbb7a6634a440c7c6b47e6a87a554cc7382f05` (v0.119.0). Mesa no
reimplementa reglas; añade una ABI mínima, proyecciones seguras y una UI Svelte.

## ABI raw

`mtg_request(op, ptr, len) -> packed(ptr<<32 | len)` con asignación exacta:

| op | solicitud | respuesta |
|----|-----------|-----------|
| 1 | `init` | snapshot del viewer inicial |
| 2 | `action` | snapshot tras aplicar, o rechazo estructurado |
| 3 | `snapshot` | snapshot del viewer actual |
| 4 | `viewer` | snapshot filtrado para otro asiento |

`protocol_version = 2`. `init` rechaza versiones desconocidas. Las respuestas de
estado incluyen `protocol_version`, `revision`, `seed`, `outcome`, `state`,
`derived`, `legal`, `events`, `metrics`.

### Acciones obsoletas

`action` acepta `expected_revision`. Si no coincide con `revision` del servidor,
el motor **no aplica** la acción y devuelve:

```json
{ "ok": false, "rejected": true, "code": "stale_action", "revision": 7, "expected_revision": 6 }
```

La UI refresca la vista y pide volver a seleccionar. Los rechazos de reglas usan
el código serializado de Phase (`wrong_player`, `invalid_action`, …), no un
`Debug` inestable.

### Información oculta y resultado

- `state` y `derived` pasan por `filter_state_for_viewer` / `derive_filtered_views`.
- `events` pasa por `filter_events_for_viewer`; no se transmiten eventos ocultos.
- `mana_pool` se proyecta como resumen `{total, white, blue, black, red, green,
  colorless}`; no se serializan procedencias/restricciones internas completas.
- `outcome` es `null` o `{winner, draw}` cuando `WaitingFor::GameOver`. La UI
  muestra el resultado y bloquea nuevas acciones.

## Entropía

- **Reglas del juego:** el RNG sembrado de `GameState` (ChaCha20) sigue siendo la
  autoridad. Semillas idénticas + acciones idénticas producen partidas idénticas.
- **Entropía de host:** `getrandom` custom backend llama a `env.mesa_random`, que
  usa `crypto.getRandomValues`. No hay fallback determinista en producción. Esto
  cubre solicitudes no relacionadas con resultados de juego (p. ej. hash seeds).

## Imports WASM

El worker usa una lista explícita (`wasm-imports.ts`). Un import desconocido es
un error de arranque, nunca un cero silencioso. Solo se permiten:

- `env.mesa_now_ms`, `env.mesa_random`.
- Placeholders `wasm-bindgen` de `web-time`/externref (timing y referencias).
- Tabla externref con reutilización de slots liberados.

Los punteros/longitudes de entrada y salida se validan contra la memoria WASM;
límite de mensaje 64 MiB. La entrada se libera incluso si `mtg_request` falla.

## Verificación

- `bun run engine:parity`: 80 pasos genéricos × semillas, API directa vs ABI.
- `bun run engine:scenarios`: escenarios explícitos de maná/lanzamiento, combate,
  objetivos, triggers/fichas, reemplazo y victoria; compara estado, acciones
  legales, costes y `by_object`, y exige observar cada mecánica.
- Pruebas Bun de imports/contratos de imagen; Chromium para UI/imágenes.

## Pendiente / no afirmado

IA, multijugador completo, formatos construidos, pago manual exhaustivo,
reemplazos complejos y restauración/replay no están expuestos ni verificados en
Mesa 0.2. La paridad genérica no sustituye a los escenarios explícitos.
