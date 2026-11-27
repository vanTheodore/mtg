# Mesa — UX-PRIORITY: preparación (sin implementar)

**Estado:** preparación documental. No hay política nueva de automatización en
esta PR; UX-DECISION 1.1 sólo conserva y organiza lo que ya existe.
**Base:** UX-DECISION 1.1 sobre Phase `0.133.0` / pin `e536896…`. Cuando
UP-134 fije un nuevo pin, esta tabla debe re-verificarse contra sus DTO antes
de implementar nada.

> Phase es la autoridad mecánica; Mesa no inventa ventanas, recomendaciones ni
> fuentes de maná. Cada capacidad de abajo dice quién la publica hoy: el
> **motor** (DTO/acción que Phase ya emite) o el **puente de Mesa**
> (`EngineClient` + worker WASM, ops `INIT/ACTION/SNAPSHOT/VIEW/E2E_SCENARIO`).

## Capacidades y quién las expone hoy

| Capacidad | Motor (Phase) | Puente de Mesa hoy | Qué falta para UX-PRIORITY |
| --- | --- | --- | --- |
| `Standard` | `PriorityPassingMode::Standard` y la acción `SetPriorityPassingMode` llegan en `legal.actions` cuando el motor la ofrece. | Se despacha como cualquier `GameAction` desde `AdvancedControls`. Sin estado propio. | Presentación de política: explicar qué ventanas conserva, sin redefinir su semántica. |
| `SkipLowUseWindows` | Mismo DTO; la decisión de qué ventana es «de poco uso» es del motor. | Igual que arriba. Mesa **no** clasifica ventanas por su cuenta. | Copia es-419 que nombre la consecuencia sin prometer qué saltará Phase. |
| `FullControl` | Mismo DTO. En el cliente de Phase es además un conmutador propio (`FullControlToggle`). | Sólo la acción cuando el motor la publica; no hay conmutador persistente en Mesa. | Decidir si es modo persistente de sesión o acción por ventana, leyendo el DTO del pin vigente. |
| Paradas de fase | Las doce paradas son pasos de `PHASE_STEPS`; el motor publica fase y recomendación, no «paradas» como acciones. | **Preferencia local** ya funcional: `session.stops` (persistida en `mesa:stops`), `PhaseStopBar`, `stopActive` bloquea el auto-paso en ese paso. | Ámbitos por turno (el cliente de Phase usa ámbitos tipo `AllTurns`); hoy la parada es por paso, sin ámbito. |
| Auto-pass seguro | `snapshot.auto_pass_recommended`: recomendación del motor, acotada al espectador. | Ya funcional y conservador: `autoPassPending` exige `Priority` + recomendación + sin parada activa; tope de 5000 cesiones con desactivación y aviso. | Política UX-PRIORITY: qué significa «seguro» cuando hay respuestas posibles; nunca pasar si el motor no lo recomienda. |
| Previsualización de maná | Phase calcula pagos (`previewManaPayment` en su cliente, con guarda de época). | **No expuesta.** El ABI no tiene op de preview: `EngineClient` sólo INIT/ACTION/VIEW/E2E_SCENARIO. `derived.mana_ability_payment` sí llega en el snapshot y se detecta, no se interpreta. | Una op nueva en el puente WASM con guarda de revisión, o consumir un DTO que el pin publique. Hasta entonces Mesa no simula fuentes. |
| Resolución de la pila | `state.stack`, ventanas de prioridad y `ResolveAllConsent` llegan en los DTO; la resolución la ejecutan las cesiones reales de todos los jugadores. | `DecisionContext` publica el tamaño de la pila y la consecuencia; no hay «resolver todo» propio. El consentimiento `ResolveAll` ya tiene especialista. | Presentación del orden de resolución y del consentimiento sin atajos que salten respuestas ajenas. |

## Reglas para la futura implementación

1. Ninguna automatización despacha algo que el motor no haya publicado como
   legal en esa ventana, con esa revisión (`stale_action` sigue mandando).
2. El auto-paso sólo sigue `auto_pass_recommended`; las paradas locales sólo
   pueden *retener*, nunca crear una ventana ni forzar una cesión.
3. `SetPriorityPassingMode` es una preferencia global del motor y se presenta
   como tal; un comando que inicia un lanzamiento (p. ej. pago manual) **no**
   es una preferencia y se etiqueta como lanzamiento (UX-DECISION 1.1, A1).
4. Sin preview de maná mientras el puente no lo exponga: ni fuentes simuladas
   ni resultados prometidos.
5. Toda política nueva se mide con la instrumentación 1.1 (identidad,
   hit-testing, interacciones ejecutadas), no con recuentos de botones.

## Cobertura pendiente declarada

- Ámbitos de parada por turno y su persistencia por asiento en hotseat.
- Semántica exacta de `SkipLowUseWindows`/`FullControl` en el pin que fije
  UP-134 (re-verificar DTO y acciones legales antes de escribir la política).
- Preview de maná: depende de una op de puente que hoy no existe.
- Archenemy: **no** habilitado en el producto; la experiencia sigue siendo de
  dos jugadores (ver la PR de UP-134 cuando exista).
