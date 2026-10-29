# Mesa 0.2 — Auditoría de capacidades reutilizadas

## Punto de partida comprobado

Auditoría realizada el **29 de octubre de 2026**, antes de ampliar la jugabilidad.

- PR: <https://github.com/vanTheodore/mtg/pull/1>, abierto y **no fusionado**.
- HEAD remoto del PR al comenzar: `548f5942d34df4205a09f3542d1e6a8262d751e2`.
- El checkout recibido estaba en `419b45c` (commit inicial), sin cambios locales. Se recuperó el HEAD remoto mediante `git fetch` + `git merge --ff-only`, sin cambiar de rama ni reescribir historia.
- Rama de trabajo: `arena/5f317145-mtg`.
- Motor: Phase `c2fbb7a6634a440c7c6b47e6a87a554cc7382f05`, v0.119.0.
- Integridad: `engine:verify` confirma **868 archivos**, SHA-256 `7ca901b32a2ae92ab8d760b32ff65c9ea174f35c374260874968148397cc8aa5`.
- El artefacto WASM no está versionado. En el checkout restaurado faltaba; la prueba de partida falló por ese motivo. Las otras **9 pruebas Chromium** de visibilidad/accesibilidad sí pasaron. No se presenta ese resultado como una partida verificada.
- `svelte-check`: 0 errores/0 avisos; pruebas Bun existentes: 9/9. Son comprobaciones de la base, no pruebas de las mecánicas nuevas.

## Cómo leer la matriz

**Motor** significa que existe implementación en Phase, no que todas las cartas Oracle estén cubiertas. **Puente** significa que Mesa puede transportar la acción o decisión, no que tenga una interacción completa. **Svelte** distingue una etiqueta genérica de un flujo que permite elegir y confirmar. **Partida** se refiere a una ejecución E2E real de Mesa, no a un test unitario de Phase ni al antiguo recorrido de 80 pasos.

- **Sí**: superficie comprobada en el código y contrato identificado.
- **Transporte**: cabe en el contrato genérico, pero falta una operación o presentación específica.
- **Parcial**: existe una parte utilizable, con límites explícitos.
- **No**: no está expuesto o no se ofrece en Mesa.
- **Pendiente**: todavía no hay prueba E2E de Mesa que lo demuestre.

## Matriz del HEAD auditado (`548f594`)

| Capacidad | Motor Rust Phase | Puente WASM de Mesa | Svelte al inicio | Partida real al inicio | Pendiente / bloqueo |
|---|---|---|---|---|---|
| Inicialización, mazos, mulligan | Sí: `start_game_with_starting_player`, `load_and_hydrate_decks` | Sí: operación 1, catálogo y dos mazos | Sí: inicio, conservar mano y paso de asiento | Sí en el artefacto del PR anterior; requiere rebuild en este checkout | Conservar; no ampliar formato por defecto sin validación |
| Prioridad, fases y paso de turno | Sí: `apply_with_rejection`, `turn_control` | Sí: acción genérica + snapshot | Sí: pasar prioridad; nombres de fase | Sí: mantenimiento → robo → fase principal | Respuestas e indicadores de prioridad más claros |
| Jugar tierras | Sí: `GameAction::PlayLand` | Sí: acción legal por objeto | Sí | Sí: Forest en la prueba existente | Mantener regresión |
| Girar tierras / producir maná | Sí: `TapLandForMana`, `ActivateManaSource`; capacidades exactas del motor | Transporte: aparecen en `legal.by_object`, no en la lista plana | **No utilizable**: panel contextual incompleto; reserva de maná sin representación | Pendiente | Mostrar fuente, producción, reserva y deshacer cuando el motor lo permita |
| Costes y pago de maná | Sí: `casting_costs`, `cost_payability`, `ManaPayment`, `CastPaymentMode` | Transporte: `spell_costs`, acciones y prompts; sin contrato de pago explícito | **No**: no muestra un flujo de pago completo | Pendiente | Pago automático seguro y manual; no recalcular costes en TypeScript |
| Lanzar hechizos | Sí: `CastSpell` y variantes | Transporte: acción + coste; faltan detalles de anuncio | Etiqueta «Lanzar hechizo», sin objetivos/pago completos | Pendiente | Anuncio → objetivos → coste → pago → pila |
| Resolución de hechizos por pila | Sí: `resolution`, `stack`, `engine` | Sí: `state.stack`, `derived`, eventos | Parcial: lista de entradas, no detalles completos de objetivos/pagos | Solo pila vacía en la prueba existente | Resolver un hechizo real y mostrar el resultado |
| Criaturas y otros permanentes | Sí: resolución y entrada al campo | Sí: objetos/zonas proyectados | Sí: campo por tipos, fichas y adjuntos | Solo tierra verificada | Invocar criatura y comprobar controlador/zona |
| Objetivos | Sí: `TargetSelection`, `TriggerTargetSelection`, `TargetRef`; candidatos del motor | Transporte: prompts y `SelectTargets`/`ChooseTarget` | **No**: no hay selector de objetos/jugadores | Pendiente | Selección basada exclusivamente en candidatos ofrecidos |
| Atacantes | Sí: `combat`, `DeclareAttackers`, destinos por criatura | Transporte: prompt y acciones enumeradas | Etiqueta de acción enumerada; sin selección propia de criaturas/destinos | Pendiente | Elegir criaturas y destino, confirmar declaración legal |
| Bloqueadores | Sí: `DeclareBlockers`, restricciones y candidatos | Transporte: prompt y acciones enumeradas | Etiqueta genérica; sin emparejamiento atacante/bloqueador | Pendiente | Selección de bloqueadores y confirmación |
| Daño de combate | Sí: `combat_damage`, `AssignCombatDamage`, `AssignBlockerDamage` | Transporte genérico | **No**: sin reparto ni resumen de daño | Pendiente | Reparto automático cuando sea único; choice explícita cuando haga falta |
| Habilidades activadas | Sí: `ability_rw`, `ActivateAbility`, pagos y objetivos | Transporte: acciones por objeto | Etiqueta genérica, sin seleccionar habilidad/objetivos | Pendiente | Activación, pago, objetivos y resolución |
| Disparos y ordenación | Sí: `triggers`, `OrderTriggers`, APNAP | Transporte: prompt y acción | Nombre técnico, sin selector de orden | Pendiente | Ordenar disparos propios y mostrar origen/contexto |
| Efectos de reemplazo | Sí: `replacement`, `ReplacementChoice`, `ChooseReplacement` | Transporte genérico | Nombre técnico, sin explicar candidatos | Pendiente | Elegir entre resúmenes del motor; no inventar resultados |
| Final de partida | Sí: `WaitingFor::GameOver { winner }`, concesión y eliminación | **Transporte implícito** dentro de `waiting_for`; sin resultado dedicado | **No**: no hay banner ni bloqueo de juego terminado | Pendiente | Victoria/empate explícitos y partida hasta ganar |
| Formatos | Sí: `FormatConfig`, varios formatos y números de jugadores | **Limitado**: hardcode `limited()`, dos jugadores | Sin selector de formato | Solo Limited local | Mantener este slice; exponer configuración validada más adelante |
| IA | **Separación importante**: `ai_support` enumera/valida acciones; el buscador está en `crates/phase-ai`, no copiado | Solo se reutiliza `legal_actions_for_viewer`; no hay propuesta de IA | No | No | Reutilizar Phase AI mediante contrato propio; medir antes de activar |
| Multijugador | Sí: estado multijugador, visibilidad por asiento y formatos de >2 jugadores | **No red**: hardcode dos jugadores; operación 4 es vista local | Hot-seat de dos asientos, no multijugador red | Solo hot-seat | Transporte/autoridad de servidor y autorización; no confundir con soporte de reglas multijugador |
| Recuperación/replay | Sí en motor y puente original | No expuesto | No | No | Fuera de esta fase salvo que sobre capacidad verificable |
| Imágenes | Phase mantiene `printed_ref`, nombre y procedencia de caras/fichas | No aplica al ABI de reglas | **Parcial**: descriptor tiene nombre, pero la resolución exige `oracleId` | Solo fallos simulados en E2E | Nombre exacto/fuzzy, caras, tokens, caché y prueba live |

## Evidencia en el código

### Motor que se conserva

- `crates/phase-engine/src/game/engine.rs:870`: `apply_with_rejection` es la entrada de reglas utilizada por Mesa.
- `engine.rs:12578–12680`: tierras por maná, fuentes de maná, lanzamiento y habilidades.
- `engine.rs:13272`, `15341`, `15366`, `15583`, `15599`, `16831`: objetivos, combate, reemplazos, disparos y daño.
- `crates/phase-engine/src/ai_support/mod.rs:2416` y `:2618`: acciones legales completas y autorización por jugador. Las acciones de maná están deliberadamente en `by_object`, no en la lista plana.
- `crates/phase-engine/src/game/visibility.rs:1312` y `derived_views.rs:2124`: filtrado por asiento y vistas derivadas.
- `crates/phase-engine/src/types/game_state.rs:16333`: decisiones pendientes; `:16647`: resultado de partida.
- `crates/phase-engine/src/types/actions.rs:157`: contrato de acciones. No se debe convertir una etiqueta de este enum en una afirmación de soporte de UI.

### Lo que realmente hace nuestro puente

`crates/mtg-engine-wasm/src/lib.rs` tiene cuatro operaciones: inicializar, aplicar acción, snapshot del asiento autorizado y snapshot de un asiento local. Usa las APIs anteriores; no contiene un segundo motor de reglas.

Limites encontrados:

1. `project_state` no incluye una revisión de estado para descartar acciones obsoletas.
2. `legal.actions` y `legal.by_object` pueden repetir acciones; la UI ocultaba además las acciones de maná sin ofrecer otra superficie.
3. `derived` y `events` se serializan ampliamente aunque la UI consume muy poco. Hay que medir y recortar con pruebas de no filtración, no eliminar candidatos necesarios.
4. `GameOver` viaja dentro de `waiting_for`, pero no existe una experiencia de final de partida.
5. Formato y número de asientos están fijados en el puente.
6. Los rechazos pierden la estructura tipada de Phase y se convierten con `Debug`.
7. El ABI empaqueta puntero/longitud en 32 bits cada uno; falta validar punteros, tamaños y liberación en el host.
8. Importaciones WASM desconocidas devuelven `0`. Es un fallo silencioso que debe convertirse en error explícito.
9. El backend `getrandom` usa un LCG fijo. Aunque `GameRng` usa ChaCha20 con semilla, no es una estrategia aceptable para entropía de producción.
10. El worker no ofrece un mecanismo de cancelación/reinicio ante un cálculo bloqueado. La UI sigue en otro hilo, pero una partida puede quedar ocupada indefinidamente.

### Referencia original consultada, no copiada

Se consultó el `crates/engine-wasm/src/lib.rs` del commit fijado de Phase y `client/src/services/cardImageLookup.ts`. El original tiene operaciones separadas para propuestas IA, vistas, recuperación, formatos y multijugador. Mesa no necesita copiar ese módulo completo ni su cliente React.

La búsqueda original de imágenes admite dos caminos: `oracleId` y nombre. Nuestro `cardImageLookup` ya conserva el nombre, pero `scryfallImageUrl` lo descarta si falta el identificador. Además, la cara debe seguir la identidad mostrada por el motor; no se debe girar una cara solo por una suposición de la UI.

## Dependencias y reproducibilidad

El árbol de reglas es idéntico, pero el lock no es una copia completa del lock de Phase. En la gráfica del motor coinciden, entre otros, `rand 0.9.4`, `rand_chacha 0.9.0`, `serde 1.0.228`, `indexmap 2.14.0` y `im 15.1.0`.

Diferencias relevantes detectadas frente al lock original:

| Paquete | Mesa al inicio | Phase original |
|---|---:|---:|
| `rand_core` 0.9 | 0.9.3 | 0.9.5 |
| `strum` / `strum_macros` | 0.27.1 / 0.27.1 | 0.27.2 / 0.27.2 |
| `tracing` / core / attributes | 0.1.41 / 0.1.33 / 0.1.28 | 0.1.44 / 0.1.36 / 0.1.31 |
| `equivalent` | 1.0.1 | 1.0.2 |

`rand 0.10.1` también aparece en el lock original, pero pertenece a otra parte del workspace; **no** significa que el motor haya cambiado a rand 0.10. No se debe comparar solo por nombre de paquete sin mirar la gráfica de dependencias.

La ampliación debe mantener el motor intacto, fijar/verificar las versiones y repetir escenarios explícitos. El viejo informe de 80 pasos elegía casi siempre mulligan, tierra o pasar; no demuestra hechizos, combate, objetivos ni victoria.

## Verificación de imágenes: límite real del entorno

Se intentó `https://api.scryfall.com/cards/named?exact=Forest` tanto directamente como desde Chromium. Ambas peticiones fallaron por conectividad (`SSL_ERROR_SYSCALL` / `Failed to fetch`). No se ha obtenido una imagen real de Scryfall en este entorno.

Por tanto:

- Las pruebas con respuestas controladas seguirán siendo útiles para caras, 404, 429, red, reintento y deduplicación.
- No se llamarán «imágenes reales» a esas respuestas.
- La prueba live quedará marcada como bloqueada hasta poder acceder al servicio. No se usará un proxy para eludir la restricción de red.
- El fallback visible y la distinción de información oculta siguen siendo obligatorios aunque la red funcione.

## Orden de implementación acordado para esta fase

1. Auditoría y recuperación verificable del entorno de build.
2. Identificadores de imagen robustos y contratos de fallo explícitos.
3. Maná y lanzamiento de criaturas; después hechizos con objetivos y respuesta en la pila.
4. Ataque, bloqueo y daño; finalmente una condición de victoria determinista.
5. Cada ampliación necesita recorrido E2E y escenario de paridad que ejerza esa mecánica. Si una etapa no queda verificada, se documenta como pendiente y no se anuncia como soportada.

Este documento conserva la fotografía inicial. Los resultados posteriores se registrarán en `docs/PHASE-0.2-REPORT.md`, sin reescribir la auditoría para hacer parecer que las capacidades ya existían.
