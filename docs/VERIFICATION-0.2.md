# Verificación Mesa 0.2

Rama: `arena/5f317145-mtg` · PR #1 (abierto, sin merge/deploy).
Motor: Phase `c2fbb7a6634a440c7c6b47e6a87a554cc7382f05` (v0.119.0), fuente byte-idéntica.

## Comandos ejecutados

| Comando | Resultado |
|---|---|
| `bun run check` | 0 errores, 0 warnings |
| `bun test src/lib` | 26 pass, 0 fail |
| `bun --bun playwright test` | 14 pass, 1 skipped (Scryfall live opt-in) |
| `MESA_SCRYFALL_LIVE=1 … images-live.spec.ts` | **falló**: egress del sandbox a Scryfall bloqueado |
| `bun run engine:verify` | OK, SHA-256 `7ca901b3…8aa5`, 868 archivos |
| `bun run engine:parity` | 3 semillas × 80 pasos, 0 mismatches |
| `bun run engine:scenarios` | parity_ok=true, goals_ok=true, stale/protocol/revision OK |
| `bun run build` | build estático OK |
| `bun scripts/measure.ts` | `docs/performance.json` |

## Subconjunto jugable verificado

Verificado contra el WASM real en Chromium y/o paridad nativa API directa vs ABI:

- Inicialización, catálogo mínimo, mazos demo, mulligan y paso de asiento seguro.
- Prioridad, fases, jugar tierras, girar tierras/fuentes de maná.
- Lanzamiento de hechizos de coste simple con pago automático, objetivos y pila.
- Criaturas, declaración de atacantes, bloqueadoras y daño de combate.
- Trigger de mantenimiento (Delver of Secrets) y creación de fichas (Heart's Desire).
- Daño directo, pérdida de vida y **victoria determinista** (`GameOver`, winner=0).
- Información oculta del rival no se renderiza ni dispara búsquedas de imagen.
- Fallback de imagen identificable, error explícito y reintento; caras DFC/MDFC y fichas.

Escenarios nativos (`docs/scenarios-report.json`): mana_and_cast,
combat_attack_block_damage, targets_and_burn, trigger_delver_upkeep,
token_heart_desire, endgame_burn_victory. Todos sin mismatches y con los
objetivos requeridos observados. `replacement_copy_pending` se ejecuta como
sonda de paridad, pero **no** se marca como mecánica verificada.

## Rendimiento medido (Chromium 153, 1440×900, Scryfall bloqueado)

- WASM optimizado `-O1`: **42 922 043 B** (40.93 MiB).
- Compilación WASM: ≈361 ms; memoria lineal ≈27.1 MiB.
- Heap JS usado ≈18.2 MB; FPS en reposo ≈61.
- Round-trip `PassPriority` UI→Worker→motor→snapshot→UI: mediana **56 ms**,
  rango 35–84 ms (10 muestras).
- Snapshot ≈70.6 KB para 82 objetos; motor <1 ms por acción en este subconjunto.

No se afirma que estas cifras generalicen a tableros masivos o formato completo.

## Endurecimiento del puente

- `protocol_version=2`; `init` rechaza versiones desconocidas.
- `expected_revision` rechaza acciones obsoletas (`stale_action`) sin aplicarlas.
- `outcome` explícito para `GameOver`; la UI bloquea nuevas acciones.
- `mana_pool` resumido; eventos filtrados por viewer; estado/derived filtrados.
- Imports WASM explícitos: un import desconocido es error de arranque.
- Entropía de host vía `crypto.getRandomValues`; el RNG de reglas sigue sembrado.
- Punteros/longitudes validados; límite de mensaje 64 MiB; liberación en `finally`.

## Imágenes Scryfall

Las pruebas de contrato (oracle/nombre/fuzzy, caras, fichas, 429, caché,
deduplicación, hidden, reintento) pasan con respuestas simuladas. La prueba
**live** opt-in se ejecutó y falló por bloqueo de red del sandbox
(`api.scryfall.com` / `cards.scryfall.io`). No se afirma verificación genuina
de arte en vivo hasta poder ejecutarla con egress real.

## Dependencias y procedencia

- `crates/phase-engine/src` sigue byte-idéntico al commit upstream.
- El bootstrap offline de crates usó espejos GitHub/ChromiumOS y normalización
  de manifests; esos crates **no** se afirman byte-idénticos a crates.io.
- `Cargo.lock` añadió la arista `rustversion` a `strum_macros` durante la
  resolución offline; no cambió las versiones fijadas de Phase.
- Deriva previa auditada: rand_core 0.9.3→0.9.5, strum 0.27.1→0.27.2,
  tracing 0.1.41→0.1.44, equivalent 1.0.1→1.0.2. La paridad conductual se
  verifica con los harnesses, no solo con el hash de la fuente.

## Pendiente / no afirmado

- Pago manual exhaustivo y costes genéricos multic mana en la UI.
- Efectos de reemplazo complejos (copia de Sakashima) como flujo jugable.
- IA, multijugador red, formatos construidos, replay/restauración.
- Reinicio automático del worker tras fallo catastrófico.
- Verificación live de Scryfall mientras el sandbox no tenga egress.
- Catálogo completo de Magic; el demo sigue limitado a 90 caras.
