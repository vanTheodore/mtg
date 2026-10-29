# Verificación Mesa 0.3

HEAD de referencia al cerrar esta fase: ver `git log -1`. PR #1 abierto, sin
merge ni despliegue.

## Comandos ejecutados

| Comando | Resultado |
|---|---|
| `bun run check` | 0 errores, 0 warnings |
| `bun test src/lib` | 34 pass, 0 fail (5 archivos) |
| `bun --bun playwright test` | 17 pass, 1 skipped (Scryfall live opt-in), 1.2 min |
| `bun run engine:verify` | OK, 868 archivos, SHA-256 `7ca901b3…8aa5` |
| `bun run engine:parity` | 3 semillas × 80 pasos, 0 mismatches |
| `bun run engine:scenarios` | `parity_ok=true`, `goals_ok=true` |
| `bun run build` | build estático OK |
| `bun scripts/measure.ts` | escribe `docs/performance.json` |

## Partida completa desde la interfaz

`tests/e2e/ui-game.spec.ts` no importa `EngineClient` ni construye acciones: pulsa
controles Svelte reales.

- Arranque visible y elección de mazo de práctica, conservar mano y descartes.
- Tierra, criatura, selección de atacantes con destino y confirmación.
- El asiento defensor responde sus propias decisiones (declinar combate).
- Victoria comprobada: banner «Jugador 1 gana», vida del rival ≤ 0, registro con
  daños y cambios de vida.
- Prueba adicional de objetivos: Lightning Bolt, clic sobre el jugador marcado
  como objetivo válido, vida 20 → 17 y registro «pierde 3 vidas».

El auto-paso es una casilla visible. Solo se activa cuando Phase publica
`auto_pass_recommended` para el espectador; cada paso sigue siendo una acción
`PassPriority` registrada (contador visible en el pie). Se desactiva a los 5000
pasos o ante un error.

## Interacción cubierta

| Flujo | Estado | Evidencia |
|---|---|---|
| Elegir y lanzar hechizos | Sí | E2E visual (tierra y criatura), escenario nativo `mana_and_cast` |
| Objetivos por clic en carta/jugador | Sí | E2E visual de Lightning Bolt; lista accesible alternativa |
| Maná automático y preferencia manual | Sí (pago manual expuesto; fuentes individuales clicables) | `manualCast` unit test; `ManaPayment` UI |
| Atacantes y destino | Sí | E2E visual de victoria |
| Bloqueadoras por atacante | Implementado y probado en Phase/WASM (`combat_attack_block_damage`, E2E de motor) y en la decisión pura `nextBlockAssignment`; **sin** E2E visual estable todavía | Se documenta como hueco |
| Pila, respuestas y resoluciones | Sí | Pila con detalles de Phase, registro de resoluciones |
| Daño, vida y victoria | Sí | Banner + vida + `-N vidas` + registro |

## Representación de permanentes

- Agrupación conservadora: dos fichas solo comparten grupo si coinciden **todos**
  los campos públicos (estadísticas, contadores, habilidades, adjuntos, tapped,
  cara, rol de combate). Cualquier diferencia crea un grupo propio.
- Cada carta expone `data-card-id`, `data-combat-role`, `data-targetable`,
  `data-attack-options`, `data-block-options` y un `aria-label` que refleja el
  texto visible (nombre, coste, tipo, reglas, P/T, estados).
- Badges visibles: Atacando, Bloqueando, Girada, daño marcado, contadores,
  adjuntos, copia, transformada.

## Rendimiento medido (`docs/performance.json`)

Chromium headless, 1440×900, Scryfall bloqueado, WASM `-O1` (43 036 524 B).

| Fase | Mediana | p90 | Máx |
|---|---|---|---|
| Rust `apply` (`engine_ms`) | 0.7 ms | 2.1 ms | 7.0 ms |
| Acciones legales (`legal_ms`) | 2.5 ms | 7.8 ms | 14.2 ms |
| Proyección derivada (`projection_ms`) | 2.1 ms | 3.3 ms | 4.8 ms |
| Serialización JSON (`serialize_ms`) | 0.8 ms | 1.2 ms | 2.8 ms |
| Transporte host↔worker (`transport_ms`) | 5.5 ms | 6.8 ms | 8.5 ms |
| Worker total (`worker_ms`) | 10.5 ms | 21.5 ms | 23.1 ms |
| Commit Svelte (`svelte_commit_ms`) | 3.9 ms | 7.3 ms | 7.9 ms |
| Presentación (`presentation_ms`, proxy) | 31.2 ms | 31.9 ms | 32.0 ms |

n = 12 acciones reales. Round-trip completo de una acción: mediana **92 ms**
(min 89, p90 93, máx 106). `presentation_ms` termina en el segundo
`requestAnimationFrame`, no en un fotograma compuesto por la GPU; no se reporta
FPS en reposo porque no mide ninguna interacción.

## Límites declarados

- Scryfall live sigue bloqueado por el egress del entorno: la prueba opt-in se
  marcó como skip y no se afirma arte real verificado.
- El duelo de práctica y el de chispas son mazos didácticos de la app, no
  formatos construidos.
- Sin IA, sin red, sin replay. Catálogo de 90 caras.
- CI (`.github/workflows/ci.yml`) aún no se ha ejecutado en GitHub en esta fase:
  se añadió y se validó su sintaxis localmente, pero no se declara cobertura CI
  hasta verla correr en el PR.
