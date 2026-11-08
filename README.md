# Mesa · cliente MTG independiente con motor Phase

> **Mesa 0.6 + interfaz Arena (3 de noviembre de 2026):** Tutorial,
> tablero espejado, mano en abanico y composición adaptativa para escritorio
> y móvil. **Phase sigue siendo la única autoridad de reglas**: motor fijado
> en el [manifiesto de procedencia](docs/PHASE-UPSTREAM-PIN.json), con
> verificación de Rust/WASM, paridad, Chromium y regresiones de reglas. Ver
> [Mesa CI](https://github.com/vanTheodore/mtg/actions/workflows/ci.yml)
> y [procedencia del motor](docs/PHASE-UPSTREAM-PIN.json).
> La fidelidad visual completa a Phase todavía está en desarrollo.


Cliente web ligero y accesible para Magic: The Gathering construido con
**SvelteKit 3 / Svelte 5 runes / TypeScript 6 / Vite 8 / Bun 1.4.4** y el motor
de reglas **Phase (Rust → WASM)**. No es un clon visual de Phase ni de MTG Arena,
y no reimplementa reglas en TypeScript.

## Estado

Vertical slice jugable local de dos jugadores (hot-seat) con el motor real:

- Inicialización de partida, catálogo mínimo y mazos de demo.
- Mulligan, prioridad, fases, pila y acciones legales consultadas al motor.
- Maná, lanzamiento de coste simple, objetivos, criaturas, combate y victoria
  determinista verificados contra el WASM real.
- Partida completa jugada **desde los controles Svelte**: elegir y lanzar,
  objetivos con clic en carta/jugador, maná automático o manual, atacantes con
  destino, pila, resoluciones, daño, vida y victoria (ver
  `docs/VERIFICATION-0.3.md`).
- Mazos didácticos seleccionables (duelo de práctica, duelo de chispas), mazos de
  demostración y **mazos propios**, con auto-paso por recomendación de Phase y
  paso de asiento configurable.
- **Catálogo por packs**: el índice mapea nombre → pack y cada partida descarga
  sólo los packs que su mazo necesita (más los `core` de tierras básicas).
- **Constructor de mazos** en Svelte: buscar, cantidades, guardar en el navegador,
  importar listas Arena/MTGO y jugar con lo construido. Sólo el formato que el
  motor configura hoy (Limited); no se anuncia ningún otro.
- **Impresiones en español opcionales**: cuando existe una impresión publicada
  para esa carta se muestra su texto real, con reserva al inglés.
- Campo de batalla, mano, biblioteca, cementerio y exilio.
- Imágenes Scryfall con fallback identificable, reintento y caché.
- Agrupación de fichas, cartas giradas/transformadas/adjuntas.
- **Capa de mesa tipo Phase**: líneas de objetivo, de pila y de combate
  dibujadas desde la instantánea del motor, más pilas de zona abribles
  (biblioteca, cementerio, exilio) con su visor accesible y los contadores de
  veneno/energía del asiento. Ver [`docs/PHASE-UX-PORT.md`](docs/PHASE-UX-PORT.md).
- Vista ampliada por ratón y teclado, controles de tamaño/densidad/tema.
- Paso de asiento seguro: la mano del jugador anterior no se renderiza.
- Interfaz en **español de Latinoamérica** (`es-419`): copia, decisiones, palabras
  clave, contadores, estados y línea de tipo en español; los datos de carta del
  motor siguen en inglés (ver [`docs/LOCALE.md`](docs/LOCALE.md)).

### Implementado frente a verificado visualmente

No es lo mismo «la interfaz lo permite» que «una prueba de Chromium lo ejecutó de
principio a fin». Esta tabla mantiene la distinción:

| Interacción | Implementada en la UI | Verificada con E2E de Chromium |
| --- | --- | --- |
| Iniciar partida, mulligan, mano, robo | Sí | Sí |
| Jugar tierras y lanzar hechizos (pago automático) | Sí | Sí |
| Elegir objetivo seleccionando carta o jugador | Sí | Sí (`20 → 17` vidas con Lightning Bolt) |
| Declarar atacantes con destino | Sí | Sí |
| Descartar hasta siete, historial, victoria | Sí | Sí (partida completa ganada) |
| Pago de maná: fuentes seleccionables, "Elegir maná manualmente" y "Confirmar pago" | Sí | Parcial: el E2E confirma pagos, pero no hay aserción dedicada de costes genéricos multi-maná |
| **Declarar bloqueadoras por atacante** | **Sí** (pares, selección y confirmación) | **Sí**: `ui-deck-10e.spec.ts` ejecuta el bloqueo real desde Svelte y lo confirma con teclado |
| Paso de asiento cada cambio de jugador | Sí | Sí (modal, modo por turno) |
| Vista ampliada, tamaño/densidad/tema | Sí | Sí (a11y y anchos 320–1440) |
| Constructor: buscar, cantidades, guardar, importar lista | Sí | **Sí**: `tests/e2e/deck-builder.spec.ts` en Chromium con motor disponible |
| Jugar un mazo propio y leer cartas cargadas por el motor | Sí | **Sí**: prueba de constructor → partida con cartas del pack real |
| Líneas de objetivo, pila y combate; pilas de zona con visor | Sí | **Parcial**: `ux-lab.spec.ts` (18 pruebas, con axe) lo verifica en Chromium sobre el fixture `/ux` sin motor; en partida real lo mide el CI con el WASM del pin |

Sobre el bloqueo, en tres niveles distintos:

1. **Reglas**: escenarios nativos de combate en el motor (300 pasos,
   `parity_ok=true`).
2. **Integración**: `tests/e2e/engine-gameplay.spec.ts` construye
   `DeclareBlockers` desde los pares que el propio motor ofrece
   (`derived.blocker_assignment_pairs`) y observa `blockers` y `combat_damage`.
   Prueba el motor a través del cliente, **no** los controles Svelte.
3. **Interacción visual**: `tests/e2e/ui-deck-10e.spec.ts` alcanza un turno real de bloqueadoras con Phase, asigna la criatura al atacante desde los controles Svelte y confirma la decisión con teclado. Comprueba que la revisión del motor cambie y que el atacante conserve su estado legal. Esto es evidencia de ese escenario, **no** de compatibilidad con todas las cartas o reglas de MTG.

Limitaciones actuales: sin IA, sin multijugador de red y sin recuperación de
partidas. El catálogo jugable sigue siendo un subconjunto verificado (fixture
y una parte certificada de Décima Edición): la tubería para sets reales existe,
pero **ninguna carta nueva entra al juego sin pasar la puerta de cobertura del motor** (ver
[`docs/CATALOG-PLAN.md`](docs/CATALOG-PLAN.md)). El puente aún no expone la
validación de mazo de Phase, así que el constructor comprueba existencia en el
catálogo y muestra lo que el motor cargó, **no** legalidad de formato.

## Requisitos

- Bun **1.4.4** (`packageManager` fijado).
- **Para jugar en un checkout de `main`**: GitHub CLI y acceso a un run verde del mismo commit (`bun run engine:download`). No necesitas Rust local.
- **Para recompilar el motor o modificar Phase**: Rust nightly con el target `wasm32-unknown-unknown`; los scripts de `scripts/` construyen el WASM sin `wasm-bindgen`.

No se usan npm/pnpm/Node como dependencias del proyecto. Playwright se ejecuta
con `bun --bun playwright`.

## Instalación rápida en Windows 11 (sin Rust local)

Clona el repositorio, ejecuta `bun install --frozen-lockfile`, autentica GitHub CLI con `gh auth login` y descarga el motor compilado para **el mismo HEAD de main** mediante `bun run engine:download`. Después usa `bun run dev`. Los fondos Arena, packs 10E y textos españoles ya vienen incluidos; las ilustraciones se consultan en Scryfall según demanda.

Guía completa: [`docs/LOCAL-ASSETS-WINDOWS.md`](docs/LOCAL-ASSETS-WINDOWS.md).

## Puesta en marcha

Para jugar con los datos incluidos en el clon (también en Windows PowerShell 7):

```sh
bun install --frozen-lockfile
bun run engine:download      # WASM desde el CI verde del mismo commit en main
bun run dev
```

Los packs 10E, tierras, catálogo e impresiones españolas ya están en `static/data/`. Si estás desarrollando el generador de datos, **opcionalmente** puedes regenerarlos y validar un mazo; esto no es necesario para abrir la partida:

```sh
bun run catalog:build
bun run catalog:packs
bun run wasm:packcheck static/data/catalog/packs/fixture.json,static/data/catalog/packs/10e.json --decks docs/packcheck-10e-decks.json
bun run impressions:es --set-file data/mtgjson/10E.es.json
```

Para reconstruir WASM desde Rust, la alternativa de desarrollo es `bun run engine:build`.


`catalog:packs` acepta la exportación plana del motor (`cards.json`) o un archivo
**AtomicCards v5** (`{ meta, data }`). Un set MTGJSON **v3** (como
`data/mtgjson/10E.es.json`) no se empaqueta a mano: primero se adapta a
AtomicCards v5 y lo parsea Phase, para que la identidad y las caras las decida el
motor:

```sh
bun scripts/import-set.ts --set-file data/mtgjson/10E.es.json --out /tmp/10E.atomic.json
cargo run -p mtg-engine-wasm --bin catalog -- /tmp/10E.atomic.json /tmp/10e   # Phase parsea y exporta
bun run catalog:packs -- --set-file /tmp/10e/cards.json --set-code 10E --pack-id 10e
```

Para añadir un set real al índice que ya existe (sin perder el pack `core` de
tierras básicas) se usa `--append`: reemplaza un pack con el mismo id, conserva
los demás y sube la versión del índice para que la caché del cliente no sirva
bytes viejos.

```sh
bun run catalog:packs -- --set-file /tmp/10e/cards.json --set-code 10E --pack-id 10e --append --verified
```

Un pack sin `--verified` queda marcado como no certificado: se puede buscar y
cargar, pero **el inicio de partida se niega** con el diagnóstico concreto
(`docs/engine-coverage.json` guarda qué evidencia respalda cada pack certificado,
y `packcheck` es el binario que la produce: carga el pack con
`CardDatabase::from_json_str`, resuelve el mazo y juega una partida real).

`engine:build` usa el target `wasm32-unknown-unknown` preinstalado. Si solo
 dispones de `rust-src` y necesitas compilar std, usa `ENGINE_BUILD_STD=1`
 (requiere las dependencias de `library/Cargo.lock` vendorizadas).

El motor upstream usa `if let` guards experimentales; los scripts inyectan
`feature(if_let_guard)` / `feature(let_chains)` por `RUSTFLAGS` **sin modificar
el código de reglas**.

Optimización opcional de tamaño con Binaryen (herramienta nativa externa,
probada con 132; no es dependencia de la app):

```sh
WASM_OPT=/ruta/a/wasm-opt bun run engine:optimize
# o integrado en el build:
WASM_OPT=/ruta/a/wasm-opt ENGINE_OPTIMIZE=1 bun run engine:build
```

En este repositorio `-O1` redujo el artefacto de ≈46 MiB a ≈41 MiB (43 036 524 B)
y pasó la partida real E2E. `-Oz` puede reducir más, pero es mucho más lento.

### Verificación

```sh
bun run check           # svelte-check + TypeScript
bun test src/lib        # pruebas unitarias Bun
bun run engine:verify   # hash del árbol de reglas Phase
bun run engine:parity   # paridad API directa vs wrapper (semillas 42/7/123)
bun run engine:scenarios # escenarios explícitos: maná, lanzamiento, combate, objetivos, triggers, reemplazo, victoria
bun run test:e2e        # Chromium real (visibilidad, a11y, partida completa por UI, motor)
bun run deps:audit      # drift de dependencias contra el registro npm
bun run build           # build estático
```

Para Chromium en sandbox sin navegador del sistema:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
PLAYWRIGHT_CHROMIUM_LIB_PATH=/tmp/al2023/lib \
bun run test:e2e
```

## Auditoría de capacidades

La fotografía inicial de Mesa 0.2 está en [`docs/AUDIT-0.2.md`](docs/AUDIT-0.2.md) y
la auditoría de interacción de 0.3 en [`docs/AUDIT-0.3.md`](docs/AUDIT-0.3.md).
Distingue las reglas disponibles en Phase, las acciones transportadas por Mesa,
los flujos realmente utilizables en Svelte y las mecánicas verificadas en una
partida. Una etiqueta de acción no equivale a soporte completo.

El contrato ABI/worker vigente se documenta en
[`docs/ENGINE-CONTRACT-0.2.md`](docs/ENGINE-CONTRACT-0.2.md): versión de
protocolo, revisión de acciones obsoletas, resultado de partida, resumen de
maná, eventos filtrados, entropía de host y lista explícita de imports WASM.

La evidencia vigente está en
[`docs/VERIFICATION-0.5.1.md`](docs/VERIFICATION-0.5.1.md): **el navegador ya no
es un bloqueo**. Chromium 153 se obtiene del registro de npm
(`bun run chromium:fetch`), la suite de interfaz se ejecutó completa (14
pasan; las 10 restantes fallan solo por el artefacto WASM) y las capturas reales
de `docs/screenshots/` destaparon siete defectos de presentación, ya corregidos
con prueba de regresión.

Cómo ejecutar todo esto —Chromium sin CDN, Edge en Windows, `vendor/` de las
crates sin crates.io y el límite de memoria medido al compilar el motor— está en
[`docs/BROWSER-RUNBOOK.md`](docs/BROWSER-RUNBOOK.md). La ronda anterior
—interacción por carta, combate marcado por el motor y presupuesto por
selección— sigue en
[`docs/VERIFICATION-0.5.md`](docs/VERIFICATION-0.5.md), y la de mazo pegado de
10E, estados por carta, descarga selectiva e integridad de packs en
[`docs/VERIFICATION-0.4.3.md`](docs/VERIFICATION-0.4.3.md); la anterior, con el
índice canónico, la certificación por carta y la paridad paso a paso, en
[`docs/VERIFICATION-0.4.2.md`](docs/VERIFICATION-0.4.2.md). Las rondas anteriores
siguen en [`docs/VERIFICATION-0.4.1.md`](docs/VERIFICATION-0.4.1.md),
[`docs/VERIFICATION-0.4.md`](docs/VERIFICATION-0.4.md),
[`docs/VERIFICATION-0.3.md`](docs/VERIFICATION-0.3.md) y
[`docs/VERIFICATION-0.2.md`](docs/VERIFICATION-0.2.md). Los niveles de prueba se
explican en [`docs/TESTING.md`](docs/TESTING.md).

La capa de mesa portada desde Phase —qué se reutiliza, qué no y qué falta— está
en [`docs/PHASE-UX-PORT.md`](docs/PHASE-UX-PORT.md). La investigación del catálogo ampliable —qué ofrece Phase, qué falta en el puente
y el plan por PRs— está en [`docs/CATALOG-PLAN.md`](docs/CATALOG-PLAN.md). El
idioma y su reserva en [`docs/LOCALE.md`](docs/LOCALE.md); las dependencias en
[`docs/DEPENDENCIES.md`](docs/DEPENDENCIES.md).

## Integración continua

**GitHub Actions activo y verificado.** El [run de `main` del 4 de noviembre de 2026](https://github.com/vanTheodore/mtg/actions/runs/41773779460) terminó en verde: build y tests Bun, procedencia de Phase, paridad y escenarios nativos, WASM y **45 E2E Chromium aprobados (una prueba de imágenes Scryfall en vivo omitida)**. El documento [`CI-DIAGNOSIS.md`](docs/CI-DIAGNOSIS.md) describe un bloqueo **histórico** anterior a que hubiera runners, no el estado vigente.

`.github/workflows/ci.yml` publica builds estáticos, motor WASM con SHA-256, informes nativos y evidencia Playwright. El instalador `bun run engine:download` solo acepta motores de un CI verde del mismo commit, no de otra rama. No se despliega automáticamente ni se incorporan imágenes propietarias de cartas.

Desde el [PR #31](https://github.com/vanTheodore/mtg/pull/31), el CI usa una [clasificación conservadora de cambios](docs/CI-SCOPE.md): documentación y herramientas locales conocidas pueden omitir Rust/WASM/Chromium **solo en PRs**, pero cada `push main` ejecuta la batería completa. El [PR #33](https://github.com/vanTheodore/mtg/pull/33) incorporó pruebas en runners Windows: el test del instalador y el catálogo ya pasaron; la descarga real del motor se verifica únicamente después de un CI de `main` completamente verde.

## Arquitectura

```text
src/lib/engine/       Worker WASM, protocolo binario/JSON y cliente RPC
src/lib/game/         Sesión (runas), acciones, packs de catálogo, mazos,
                      impresiones es, imágenes Scryfall, zonas de mesa
src/lib/ui/           Geometría de arcos y proyección de líneas (puro, probado)
src/lib/components/   Board, Hand, Battlefield, CardView, DecisionPanel,
                      BoardOverlay, ZonePile, ZoneViewer, …
src/routes/stress/    Fixture determinista de visibilidad (no ejecuta reglas)
src/routes/ux/        Fixture de presentación de la capa Phase (no ejecuta reglas)
crates/phase-engine/  Motor Phase upstream byte-idéntico (ver provenance)
crates/mtg-engine-wasm/ Puente ABI C/JSON, exportador de catálogo y paridad
static/data/          Catálogo del motor, índice+packs, metadatos, mazos demo,
                      impresiones en español
```

Principios:

1. **Una instancia del motor por partida**, en un Worker dedicado.
2. **El motor es la autoridad**: la UI envía `GameAction` y recibe snapshots
   filtrados por jugador + acciones legales. No hay reglas falsas en TS.
3. **Estado granular**: `$state.raw` para snapshots, listas con claves estables
   por `ObjectId`, sin reconstruir todo el tablero en cada acción.
4. **Visibilidad primero**: cada carta es accesible directamente o mediante
   expansión/desplazamiento; el arte ausente nunca se confunde con información
   oculta.
5. **Datos mínimos**: catálogo de subconjunto (≈123 KB) + metadatos (≈35 KB);
   las imágenes se resuelven bajo demanda por `oracle_id` con deduplicación.

## Dependencias

`bun run deps:audit` compara cada paquete de `bun.lock` con el registro npm.
Al 2026-10-29: 88 paquetes (10 directos), 24 desactualizados y **1 directo**
(`typescript` 6.0.3 → 7.0.2, retenido porque el stack fijado es TS 6). El resto
son transitorios atados al rango de su padre. Detalle en
[`docs/DEPENDENCIES.md`](docs/DEPENDENCIES.md).

## Procedencia y licencias

- Phase: MIT OR Apache-2.0. Commit y huella autoritativos: [`docs/PHASE-UPSTREAM-PIN.json`](docs/PHASE-UPSTREAM-PIN.json).
- `crates/phase-engine/src` es byte-idéntico al upstream; ver
  `docs/ENGINE-PROVENANCE.md` y `bun run engine:verify`.
- No se redistribuyen ilustraciones propietarias de Wizards. Las imágenes se
  consultan en Scryfall en tiempo de ejecución y pueden fallar; el fallback
  textual siempre identifica la carta.
- Licencias Phase en `licenses/PHASE-MIT` y `licenses/PHASE-APACHE`.

## Pruebas de visibilidad

`/stress?hand=30&tokens=20` es un fixture de interfaz determinista para probar
manos multitudinarias, tableros con fichas, DFC, adjuntos, información oculta y
fallbacks. **No simula reglas**; la fidelidad de juego se prueba contra el WASM
real en `/`.

`/ux?scene=targets|combat|idle` es el laboratorio de presentación de la capa
Phase (arcos de objetivo/pila/combate y visores de zona). Instala una
instantánea escrita a mano: **no ejecuta reglas** y lo verifica
`tests/e2e/ux-lab.spec.ts`.

Las pruebas e2e verifican anchos 320/375/390/768/1440, recorrido completo de una
mano de 30 cartas, expansión de fichas, ausencia de desbordamiento horizontal,
axe-core sin violaciones críticas/serias y una partida completa ganada desde los
controles Svelte (sin llamar al motor desde el test).

## Rendimiento medido

`bun scripts/measure.ts` (con `bun run dev` activo) escribe
`docs/performance.json`. Última corrida: Chromium 153 headless, 1440×900,
Scryfall bloqueado, WASM optimizado con `wasm-opt -O1`.

- Artefacto WASM: 43 036 524 B (≈41.04 MiB), SHA-256 `9ef61f91a988…`.
- Arranque: DOMContentLoaded ≈20.5 ms, carga ≈21.2 ms, heap JS usado ≈16.1 MB.
- Por acción (12 muestras, mediana): reglas Rust 0.7 ms, acciones legales 2.5 ms,
  proyección 2.1 ms, serialización 0.8 ms, transporte 5.5 ms, worker 10.5 ms,
  commit Svelte 3.9 ms, presentación ≈31 ms (proxy de dos frames).
- Round-trip completo acción → worker → motor → snapshot → UI: mediana 92 ms,
  p90 93 ms, máximo 106 ms (una muestra incluye el paso de asiento y se reporta).
- FPS en reposo deliberadamente no medido: no describe ninguna interacción.

Escalado del catálogo (`docs/performance-catalog.json`, Bun, 1×/5×/20×): con packs
del tamaño de un set, jugar un mazo descarga ~414 KiB tanto a 5× como a 20×, frente
a 619 KiB y 2.4 MiB del archivo único. El plan de carga cuesta 0.1–1.0 ms y el
índice mide 48 KiB a 1800 cartas.

Motor y set real (`docs/wasm-packcheck.json`, sin navegador): el `.wasm` publicado
(48,3 MB) compila en 823 ms e instancia en 19,6 ms; `init` con 444 caras y dos
mazos de 40 tarda 203 ms; una partida de 1063 pasos corre a 10,3 ms de mediana por
acción (p90 12,4 ms) con 33,6 MB de memoria. La misma semilla en el motor nativo da
los mismos 1063 pasos y el mismo ganador (`engine-parity.test.ts`): el puente no
altera la partida. Producto real: un mazo de 10E descarga 635 KiB (índice 12,4 KiB
+ 2 packs) y abrir el constructor cuesta sólo el índice.

Limitaciones actuales: 453 caras reales (90 del fixture + 363 de Décima Edición),
sin base completa de cartas (falta AtomicCards completo),
sin IA, sin multijugador red, sin recuperación de partida y con artefacto WASM
todavía grande. La prioridad es una experiencia real, verificable y accesible
antes que ampliar cobertura.
