# Mesa 0.3 — auditoría de interacción

Partida del HEAD `b43703f6536fe44fd6235820eddfc09e7cf60c93`, PR #1 abierto.

| Flujo | Phase/WASM ya publica | Interfaz al iniciar 0.3 | Trabajo |
|---|---|---|---|
| Lanzar | `CastSpell`, coste efectivo en `spell_costs`, preferencia `Auto/Manual` | Botón por carta; sin superficie clara de coste/pago | Selección → coste → lanzamiento; opción manual sobre candidato del motor |
| Objetivos | `TargetSelection.selection.current_legal_targets`, acciones `ChooseTarget`, clase de objetivo derivada | Lista de acciones abstracta | Resaltar y pulsar cartas/jugadores; alternativa textual accesible |
| Maná | Acciones exactas `ActivateManaSource/TapLandForMana`, `ManaPayment`, `CancelCast`, confirmación por `PassPriority` | Reserva visible, sin flujo de pago dedicado | Fuentes pulsables, elección de producción, confirmar/cancelar sin calcular asequibilidad en TS |
| Atacantes | IDs válidos y destinos permitidos por atacante | Declaraciones enumeradas, sin selección por criatura | Borrador local, destino visible, confirmar al motor |
| Bloqueadoras | Mapa bloqueadora → atacantes válidos, restricciones y pares de combate actuales | Un botón agrupaba todos los pares | Selección bloqueadora/atacante, pares explícitos, quitar y confirmar |
| Pila | Entradas, detalles derivados, eventos filtrados | Nombre/clase, sin objetivos/pago ni registro de resolución | Detalles del motor y registro de daños/vida/resoluciones |
| Resultado | `outcome`, eventos de vida/daño | Banner de ganador | Jugadores como destinos, cambios de vida y victoria visibles |
| Fichas | `is_token`, características/contadores/habilidades/estado público | Agrupaba por nombre/controlador; detectaba token por substring | Clave conservadora de equivalencia; nunca ocultar diferencias relevantes |
| Rendimiento | Apply Rust medido; proyección+legal+serialización mezcladas | Worker y FPS, sin commit Svelte/presentación | Separar fases, medir interacción real, declarar límites de los proxies |
| CI | Sin workflows/checks | Pruebas locales documentadas | Jobs separados; WASM compilado, no sustituido por mocks |

## Autoridad y límites

La UI puede conservar un **borrador de intención** (qué atacante o bloqueadora ha
pulsado la persona), pero no decide si es legal. Solo utiliza IDs, destinos,
objetivos y acciones publicados por Phase. El reducer vuelve a validar la acción
y la revisión del puente rechaza borradores obsoletos. Cambiar la preferencia de
pago de un `CastSpell` ofrecido a `Manual` no calcula costes ni asequibilidad.

Los controles avanzados no deben convertirse en una pantalla de nombres internos.
Una decisión aún no adaptada debe decirlo explícitamente, no simular soporte.

## Verificación prevista

1. Pruebas puras: presentación, equivalencia de fichas, selección de candidatos y
   resúmenes de eventos; no cuentan como prueba de reglas.
2. Integración: mismo motor nativo/ABI y WASM real en Worker; paridad y mecánicas.
3. Interacción visual: Playwright pulsa controles Svelte, inspecciona cartas,
   objetivos, pagos, combate y resultado. La partida completa no puede importar
   `EngineClient`, fabricar acciones ni consultar un endpoint de depuración.

El duelo de práctica será una elección visible de mazos para dos personas en el
mismo dispositivo. El asiento de práctica no tiene IA ni automatismos: la prueba
debe pasar su prioridad explícitamente, igual que una persona.

## Hallazgos que no se deben ocultar

- La prueba de victoria de 0.2 llamaba al cliente desde `page.evaluate`; prueba
  integración del WASM, **no** usabilidad de la UI.
- El botón «bloquear con todas» de 0.2 no permitía elegir una asignación concreta.
- `groupTokens` ignoraba contadores, habilidades, estadísticas, tapped y combate.
- `serialize_ms` incluía cálculo de acciones legales/proyección; no era una
  medición pura de serialización.
- Scryfall live sigue sujeto al egress del entorno; los mocks no prueban arte real.
- El build offline de 0.2 utilizó crates normalizados de espejos externos. CI
  debe compilar con el lockfile y toolchain fijados y declarar su procedencia.
