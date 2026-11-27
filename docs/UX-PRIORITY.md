# Mesa — UX-PRIORITY 1.0

**Estado:** implementación de producto en esta entrega; la validación completa de
WASM y navegador sigue pendiente en este entorno.

**Phase:** `0.134.0`, pin `c551672cd7f262579a6cdcd25db128376b1fd9c7`.
**Principio:** Phase es la autoridad de prioridad. Mesa configura preferencias,
presenta recomendaciones que Phase publica y envía únicamente acciones legales
para la revisión actual; no predice ventanas, pagos, respuestas ni fronteras.

## Contrato de producto

### Preferencias por asiento

- Mesa conserva `Standard` o `SkipLowUseWindows` y las paradas de fase por
  asiento en `localStorage` (`mesa:priorityPreferences`). No cruza preferencias
  entre P0 y P1.
- `FullControl` es una excepción temporal para la partida actual: se sincroniza
  con Phase, no se persiste como modo y se retira al terminar esa partida.
  Rechaza pases automáticos, pero no impide un pase que la persona ordena
  explícitamente.
- La migración única de `mesa:stops` conserva los booleanos verdaderos como
  `AllTurns` sólo para P0. El antiguo `mesa:autoPass=off` se interpreta como
  Control total temporal para el próximo inicio, nunca como permiso automático
  para el otro asiento. Las claves heredadas se eliminan.
- Cada parada conserva el alcance que entiende Phase: `AllTurns` → `OwnTurn` →
  `OpponentsTurns` → apagada. Una parada sólo retiene una ventana existente; no
  crea ventanas ni ordena pases. La barra comunica por separado si la parada
  aplica al paso/turno actual.
- El cliente sincroniza modo y paradas con `SetPriorityPassingMode` y
  `SetPhaseStops`. Si la sincronización falla, queda visible y requiere un
  reintento explícito; no se afirma que la preferencia local esté aplicada.

### Pases explícitos y recomendaciones

- El pase recomendado de una ventana exige simultáneamente `Priority`, una
  `PassPriority` legal y `auto_pass_recommended=true` del snapshot de Phase. La
  recomendación no se calcula en Mesa.
- Una recomendación pendiente queda anclada a partida, asiento, revisión,
  jugador activo, fase, tipo de ventana y versión de preferencias. Una acción
  manual, cambio de ventana/preferencias, parada aplicable, resultado o handoff
  invalida el trabajo que aún no se envió.
- Un resultado `stale` o rechazo pausa el gate. Cambiar una preferencia invalida
  el envío pendiente, pero no lo reanuda; sólo una acción nueva, el comando
  explícito **Reanudar pase recomendado** o un inicio nuevo puede quitar esa
  pausa. No se reintenta en silencio.
- **Pasar hasta el inicio del siguiente turno** y **Pasar hasta que vuelva a
  empezar mi turno** son órdenes explícitas `SetAutoPass`, distintas de la
  recomendación de una ventana. Phase gestiona los pases y detenciones hasta la
  frontera; Control total se desactiva antes de enviarlas.
- **Cancelar pase…** aparece sólo si el estado del asiento visible contiene su
  propia sesión `auto_pass`; despacha `CancelAutoPass`. Si un `PassPriority` ya
  está enviado al Worker, no puede retirarse: Mesa muestra la cancelación en
  curso, deja que Phase responda y encola la cancelación para el **mismo asiento
  solicitante**, aunque la prioridad haya cambiado de mano. La cancelación
  revoca las ventanas restantes, no una acción que Phase ya procesó. La
  proyección WASM de `auto_pass`, modos y paradas procede del estado filtrado
  por Phase para ese espectador: no expone la automatización de otro asiento.

### Resolución de pila

**Resolver mis ventanas hasta vaciar la pila** solicita
`BeginResolveAll { scope: Own, max_resolutions: 0 }`. Es una acción explícita de
Phase y sólo abarca las ventanas propias; nunca implica consentimiento de otro
asiento ni salta su posibilidad de respuesta. Control total se desactiva antes
de iniciar la orden. Phase conserva la autoridad sobre pases, prioridad,
respuestas, fronteras y resolución.

### Privacidad hotseat

Un pase hasta la frontera que cambia el asiento activa el handoff antes de
mostrar la mano del nuevo espectador. El tablero queda oculto/inactivo y Mesa no
monta la superficie de decisiones del asiento entrante hasta que confirme
**Estoy listo**: así tampoco quedan nombres de cartas privadas expuestos en el
DOM durante el handoff. Las preferencias y la cancelación son siempre del asiento
que el snapshot autoriza.

## Cobertura añadida

- Unitarias: migración y aislamiento por asiento, ciclo de scopes, forma de las
  acciones Phase, identidad de recomendación y pausa/invalidez del gate.
- Playwright con el WASM aislado de `GameScenario`: sincronización de modos y
  scopes, pase explícito con handoff y `Resolve All Own` real. Esta última
  prueba lanza Lightning Bolt, verifica que `Own` deja a P1 en `Priority` con
  la pila intacta y luego acepta el Counterspell legal de P1. Si es el único
  objetivo posible, Phase lo asigna durante `CastSpell`; la evidencia verifica
  el objetivo publicado en la pila sin inventar un `ChooseTarget`. `priority-auto-pass`
  crea una sesión de cancelación en un fixture generado por el motor; no se
  forja una acción en el navegador. La matriz retiene una respuesta real de
  `PassPriority` después de que Phase la procesa, solicita cancelar mientras la
  UI sigue ocupada y verifica que el pase se aplica primero, que `CancelAutoPass`
  conserva P0 como actor, que Phase elimina su sesión y que P1 ejecuta luego una
  acción legal.
- `scripts/e2e-summary.ts` trata las cuatro transiciones UX-PRIORITY como
  obligatorias, al igual que los contratos UX-HAND/UX-DECISION; un test ausente,
  omitido o con reintento no deja verde el gate funcional.
- El job independiente `ux-priority-evidence` compara tres modos desde los
  mismos fixtures Phase y genera `evidence/priority/metrics.json`,
  `comparison.json`, `COMPARACION.md` y capturas por escenario. Sólo cuenta
  solicitudes de Worker aceptadas y pasos realmente ejecutados. La recuperación
  registra la sesión Phase/Worker y la revisión aplicada por el pase frente a
  la revisión con que se envía `CancelAutoPass`; no afirma que cancelar deshaga
  el `PassPriority` que Phase ya aceptó.
- La compilación de `project_state()` requiere Rust/Cargo y la suite de
  navegador requiere el WASM E2E y Chromium. En esta sesión el entorno no
  proporciona Rust/Cargo ni Chromium; esas comprobaciones deben ejecutarse en
  CI o en un entorno que los tenga instalados.

## Límites explícitos

- No hay preview de maná ni simulación de fuentes; el ABI no publica esa
  operación.
- No se habilita Archenemy ni se amplía el producto más allá de dos jugadores.
- Mesa no reproduce reglas de prioridad, no interpreta qué ventana es «de poco
  uso» y no reemplaza consentimiento ni respuestas que Phase solicite.
