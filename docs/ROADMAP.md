# Mesa — Roadmap de producto

Última actualización: 2026-11-27 · UP-134 (PR independiente sobre la rama de la sesión).

Estado de las misiones, de más antigua a más reciente. «Integrado» significa
fusionado en `main`; «Draft» significa PR abierta sin fusionar ni desplegar.

| Misión | Estado | Base / commit | Nota |
| --- | --- | --- | --- |
| UX-HAND 1.1 / 1.2 | Integrado | PR #72, `7aa89ca…` | Inspeccionar ≠ ejecutar, hoja de mano, privacidad hotseat, gate de Playwright. |
| UP-131 (Phase v0.131.0) | Integrado | PR #71 | Importación aislada y procedencia. |
| UP-133 (Phase v0.133.0) | **Integrado** | PR #75 → merge `dd531f46d20b6136cb2b7a40962a210fad6a4de0` | Pin `e53689630206f113ec61f4813b41856d5cd7c8a9`, 202 pruebas UP-133 verdes, WASM, paridad y Chromium. |
| **UX-DECISION 1.1** | **PR #76 (esta entrega)** | `dd531f46…` | 1.0 + identidad de acciones (pago vinculado a carta/alternativa elegida), instrumentación por identidad/hit-testing con interacciones ejecutadas, evidencia en 8 estados y objetivos táctiles de 44 px. Fusión autorizada con CI verde; sin deploy. |
| UP-134 (Phase v0.134.0) | **PR independiente (esta entrega)** | `main` @ `185b9e1…` (#76) | Pin fijado: `c551672cd7f262579a6cdcd25db128376b1fd9c7` (el HEAD verificado; upstream no había avanzado al fijarlo). 22 commits, `GameAction` byte-idéntico. Archenemy **no** se habilita en el producto; experiencia de dos jugadores. Sin fusión ni deploy. |
| Cobertura de packs `fixture`/`10e` | Pendiente declarada | — | `docs/engine-coverage.json` sigue en `c2fbb7a6…` (v0.119.0). Regenerar exige compilar `coveragepack` con el pin vigente; no se marca ninguna carta certificada sólo por parsear. |
| UX-PRIORITY 1.0 | Implementación en esta entrega; validación completa pendiente | Phase `0.134.0` · pin `c551672…` | Preferencias y scopes por asiento sincronizados con Phase, Control total temporal, pases/recomendaciones con gate explícito, cancelación, Resolve All `Own` y handoff hotseat. Ver `docs/UX-PRIORITY.md`; falta ejecutar CI/WASM y Chromium en un entorno con Rust y navegador. |
| Preview de pagos de maná | Planificado / bloqueado por ABI | Después de UX-DECISION | Exponer en el puente WASM una operación equivalente a `previewManaPayment` con guarda de revisión; hoy `EngineClient` sólo tiene INIT/ACTION/VIEW/E2E_SCENARIO. Hasta entonces Mesa no simula fuentes (§2.3 de `UX-DECISION-1.0.md`). |
| Sugerencia de daño de combate | Planificado | Después de UX-DECISION | `DerivedViews::combat_damage_suggestion` ya llega en `snapshot.derived`; falta decidir su presentación sin duplicar la autoridad del motor. |
| UX-ZONES / siguiente importación Phase | Sin planificar | — | Requiere una nueva misión con pin verificado. |

## Criterios que no se negocian

- Phase es la autoridad mecánica; el cliente no reimplementa reglas.
- Ninguna acción legal desaparece para reducir botones.
- No se reduce la cobertura de `WaitingFor`.
- Inspeccionar una carta nunca la ejecuta; las acciones que consumen su carta
  requieren confirmación (`consumes_source`).
- El WASM de producción rechaza la operación 5 de `GameScenario`; el de pruebas
  está aislado.
- Las capturas y métricas se fijan a commits, no a fechas.
- Las PR de producto se entregan como Draft y no se fusionan ni despliegan
  automáticamente.
