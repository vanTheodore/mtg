# Niveles de prueba

| Nivel | Qué demuestra | Qué no demuestra |
|---|---|---|
| Unitarias Bun (`bun test src/lib`) | Identidad de imagen, fallback, deduplicación, agrupación conservadora de fichas, etiquetas y guías de decisión, imports WASM estrictos | Reglas Phase ni interacción real |
| Generador de catálogo (`catalog-packs-cli.test.ts`) | El CLI lee **la** fuente que se le indica, rechaza MTGJSON v3 sin escribir nada y produce el pack esperado desde AtomicCards v5 | Que el motor parsee esas cartas |
| Certificación (`catalog-certification.test.ts`, `certification-evidence.test.ts`) | Un pack `verified` exige digest + evidencia de parseo; abrir el constructor no descarga el catálogo; la caché distingue versiones | Que las 90 cartas se hayan ejercitado una por una |
| Verificación de procedencia | 868 archivos de `crates/phase-engine/src` coinciden con el hash fijado | Comportamiento correcto de esas reglas |
| Integración nativa (`engine:parity`, `engine:scenarios`) | API directa de Phase y ABI raw producen el mismo estado; escenarios explícitos alcanzan maná, lanzamiento, objetivos, combate, trigger, ficha y victoria | Que una persona pueda operar la UI |
| Certificación de pack (`cargo run --bin packcheck`) | El pack que descarga el cliente lo deserializa Phase (`from_json_str`), resuelve el mazo completo y juega una partida real | Que el pack sea correcto por sí solo: sólo dice que el motor lo carga y juega |
| Estados del mazo (`deck-availability.test.ts`) | Una carta del índice es `pending`, no `missing`; la ausencia real y el pack sin certificar son los únicos bloqueos |
| Flujo de inicio (`deck-start-flow.test.ts`) | El mazo pegado, sobre HTTP real: estados antes y después de pedir cobertura, packs necesarios, descarga selectiva con digest y 40 cartas por asiento hacia el motor |
| Fixture del E2E (`e2e-deck-10e.test.ts`) | El spec de 10E declara 40 cartas, todas servidas por el índice, exclusivas de 10E salvo las tierras, y exactamente una con limitación conocida |
| Integridad de packs (`pack-integrity.test.ts`) | Un pack alterado, truncado, intercambiado o viejo se rechaza por longitud o sha256 antes de usarse; la URL es direccionada por contenido y el rechazo no envenena la caché | Que el índice no pueda mentir: si índice y archivo se regeneran juntos, ambos coinciden |
| Cobertura por carta (`coverage.test.ts`, `coveragepack`) | El artefacto de cobertura publicado es el de ese sha256, suma lo que declara y la política de inicio bloquea lo limitado | Que una carta «soportada» esté jugada: eso exige `exercised` |
| Paridad paso a paso (`scripts/parity-trace.ts`) | Nativo y WASM coinciden en actor, acción con argumentos, conjunto de legales y estado proyectado en **cada** paso | El espacio de partidas: traza un escenario |
| Paridad por semillas (`scripts/parity-seeds.ts`) | Cinco semillas llegan al mismo paso final, misma mezcla y mismo ganador en ambos motores, con las dos sillas ganando alguna vez | No compara cada paso (para eso está `parity-trace`) |
| Puente WASM (`bun scripts/wasm-packcheck.ts`) | El `.wasm` publicado instancia con los imports del cliente y juega la misma partida que el motor nativo (mismos pasos, mismo ganador) | Pintado, controles Svelte y a11y: siguen necesitando Chromium |
| Integración WASM (`engine-gameplay.spec.ts`) | El Worker, ABI, catálogo, revisión y proyección reales alcanzan victoria y combate | Que los controles Svelte sean usables; llama al cliente desde el test |
| Contrato de interacción (`interaction-contract.test.ts`, `interaction.test.ts`) | La segunda pulsación sobre una carta confirma solo cuando hay **una** acción (`PlayLand`/`CastSpell`) y estamos en prioridad; los bloqueos viajan como `[bloqueadora, atacante]`; `BlockersDeclared` se traduce a «X bloquea a Y» | Que Phase acepte el par: eso lo exige el E2E de bloqueo |
| Método de combate (`interaction.test.ts`) | `combatRole` lee `blocker_to_attacker`, la clave que Phase sí envía; una bloqueadora cuyo atacante salió del combate sigue marcada | Que el jugador vea la insignia: sin navegador no se pinta |
| Presupuesto de trabajo por pulsación (`interaction-budget.test.ts`, `scripts/measure-interaction.ts`) | Un clic sobre 80 permanentes cuesta < 800 µs y el coste crece lineal con el tablero | Fotograma ni pintado; mide el trabajo del cliente |
| Preflight (`scripts/preflight.ts`) | Motor, catálogo, cobertura, navegadores y CDN se comprueban antes del E2E; sale con 1 si falta algo | Que el E2E pase si dice ✔ |
| Navegador disponible (`scripts/fetch-chromium.ts`, `scripts/preflight.ts`) | Que hay un Chromium que Playwright puede lanzar en este entorno, y de dónde salió | Que sea el mismo binario que use una persona en Windows |
| Interacción visual (`ui-deck-10e.spec.ts`, `ui-game.spec.ts`) | Una partida se inicia, conserva manos, juega tierras, lanza criaturas, ataca, **bloquea con una criatura concreta y el motor lo acepta** y gana pulsando controles Svelte; sin importar `EngineClient` ni fabricar acciones | IA, red, formatos completos o todas las cartas. **Ejecutadas con Chromium y el WASM real en 0.5.2**: las tres pruebas que fallaron en la primera corrida (`41007263956`) ya pasan; ver `docs/VERIFICATION-0.5.2.md` |
| Cara de la carta (`visibility.spec.ts`) | Alturas iguales en la fila, sin desborde ni coste recortado a 320 y 1440 px, y nombre accesible en el orden visible | Que se vea bien: eso lo dicen las capturas de `docs/screenshots/` |
| Capturas (`scripts/screenshots.ts`) | Que la aplicación pinta texto en un navegador real, a cinco anchos, con mano de 30, 60 fichas y tema oscuro | Comportamiento: una captura no prueba una regla |
| Imágenes (contrato/mock) | Fallback identificable, oracle/nombre/cara/ficha, 429, caché y hidden | Arte real descargado de Scryfall |
| Imágenes live opt-in (`MESA_SCRYFALL_LIVE=1`) | Descarga real cuando el entorno tiene egress | Disponibilidad permanente del servicio |

## Comandos

```sh
bun run check
bun test src/lib
bun run engine:verify
bun run engine:parity
bun run engine:scenarios
bun run coverage:build
bun run parity:trace <nativo.jsonl> <wasm.jsonl>
bun run parity:seeds
bun run build
bun run test:e2e
MESA_SCRYFALL_LIVE=1 bun run test:e2e -- images-live.spec.ts
```

`engine:parity` y `engine:scenarios` requieren el toolchain Rust y compilan Phase
de forma nativa; son trabajos separados en CI. `packcheck --trace` y
`wasm-packcheck --trace` escriben un JSONL por paso (≈100 MB por partida): se
generan en `/tmp` y `parity-trace.ts` deja solo el resumen versionado en
`docs/parity-trace.json`. La compilación WASM usa el
toolchain fijado, `Cargo.lock`, `rust-src`, `--locked` y Binaryen 132. CI publica
el SHA-256 del artefacto y la versión de Binaryen, pero **no** afirma que dos
máquinas produzcan bytes idénticos: la reproducibilidad se limita a entradas y
herramientas fijadas y a los hashes publicados.

## Criterio de engaño cero

- Un escenario no ejecutado no se marca como pass.
- `replacement_copy_pending` es una sonda de paridad sin objetivo requerido y no
  cuenta como soporte de efectos de reemplazo.
- La prueba visual de victoria no usa atajos del motor. La prueba WASM que sí los
  usa se documenta por separado.
- Scryfall live depende del egress; si falla se informa como no verificado.

## CI

`.github/workflows/ci.yml` crea cuatro trabajos (estático, WASM, integración
nativa y navegador). **Ninguno se ejecuta**: en las corridas `40984036044`,
`40965975724` y `4096396118` los tres primeros terminan en 2 s con
`runner_name` vacío y `steps: []`, es decir, sin que se asigne una máquina. Eso
convierte a CI en una vía muerta también para obtener el `.wasm`: no hay runners
en esta cuenta, y `gh workflow run` responde 403 porque la integración no puede
despachar. Los trabajos están escritos para ejecutar los comandos de verdad, pero
**no se afirma cobertura CI** ni se usa CI como fuente de artefactos.
