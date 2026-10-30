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
- CI: el workflow existe y GitHub lo registró, pero ningún job recibió runner
  (ver sección siguiente). No se declara cobertura CI.

## Estado real de CI (importante)

GitHub aceptó el workflow y creó la ejecución `40842762906` para el HEAD
`7363fcb`, pero **ningún job obtuvo runner**: los tres jobs terminaron en 1–2 s
con `runner_name` vacío y el job de navegador quedó en `skipped` por dependencia.
Es una limitación de la cuenta/repositorio privado (Actions sin minutos de
runner), no un resultado de las pruebas. Por eso:

- No se declara ninguna cobertura CI.
- Lo verificado es exactamente lo ejecutado en el sandbox y listado arriba.
- Cuando el repositorio tenga runners disponibles, los jobs ejecutarán
  `bun install --frozen-lockfile`, procedencia, typecheck, unitarias, build,
  compilación WASM fijada, paridad/escenarios nativos y Chromium.

## Adenda 2026-10-29: idioma es-419 y auditoría de dependencias

Cambios verificados en esta sesión (misma rama, sin fusionar):

- `src/app.html` declara `lang="es-419"`; la copia de `DecisionPanel` usa
  «selecciona» en lugar de «pulsa»; Ajustes muestra el idioma y aclara que los
  datos de carta llegan en inglés desde Phase.
- `typeLine` en `src/lib/game/cards.ts` renderiza tipos en español con reserva
  al inglés: `Criatura legendaria — Humano Mago`, `Tierra básica — Llanura`,
  `Criatura artefacto — Golem`, `Ficha de criatura — Soldado`.
- `scripts/deps-audit.ts` + `bun run deps:audit`: 88 paquetes, 10 directos,
  24 desactualizados, 1 directo (`typescript` 6.0.3 → 7.0.2, retenido).

Ejecutado en este entorno (Bun 1.4.4, `bun install --frozen-lockfile`):

| Comando | Resultado |
| --- | --- |
| `bun run check` | 0 errores, 0 advertencias |
| `bun test src/lib` | 40 pasan, 0 fallan (6 archivos, 105 expectativas) |
| `bun run build` | OK (`adapter-static`, `build/`) |
| `bun run deps:audit` | 24 desactualizados, 1 directo |

No ejecutado en este paso: `bun run test:e2e`, `engine:verify`, `engine:parity`
y `engine:scenarios`. La imagen de este sandbox es Debian 12 sin Chromium ni
bibliotecas de navegador y sin espejo de paquetes alcanzable, y no hay toolchain
Rust instalada; los resultados de esas suites siguen siendo los registrados
arriba para el commit `5289568` y **no se reafirman para este commit**. Las
pruebas unitarias citadas cubren los cambios de idioma (`locale.test.ts`,
`cards.test.ts`).
