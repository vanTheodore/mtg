# Mesa · cliente MTG independiente con motor Phase

Cliente web ligero y accesible para Magic: The Gathering construido con
**SvelteKit 3 / Svelte 5 runes / TypeScript 6 / Vite 8 / Bun 1.4.4** y el motor
de reglas **Phase (Rust → WASM)**. No es un clon visual de Phase ni de MTG Arena,
y no reimplementa reglas en TypeScript.

## Estado

Vertical slice jugable local de dos jugadores (hot-seat) con el motor real:

- Inicialización de partida, catálogo mínimo y mazos de demo.
- Mulligan, prioridad, fases, pila y acciones legales consultadas al motor.
- Campo de batalla, mano, biblioteca, cementerio y exilio.
- Imágenes Scryfall con fallback identificable, reintento y caché.
- Agrupación de fichas, cartas giradas/transformadas/adjuntas.
- Vista ampliada por ratón y teclado, controles de tamaño/densidad/tema.
- Paso de asiento seguro: la mano del jugador anterior no se renderiza.

Limitaciones actuales: sin IA, sin multijugador de red, sin recuperación de
partidas, sin editor de mazos. El catálogo incluido es un subconjunto de demostración
(90 caras del fixture upstream), no la base completa de Magic.

## Requisitos

- Bun **1.4.4** (`packageManager` fijado).
- Rust nightly con el target `wasm32-unknown-unknown`.
- Para el build WASM sin `wasm-bindgen`: scripts propios en `scripts/`.

No se usan npm/pnpm/Node como dependencias del proyecto. Playwright se ejecuta
con `bun --bun playwright`.

## Puesta en marcha

```sh
bun install
bun run catalog:build   # genera static/data/cards.json + card-meta.json
bun run engine:build    # genera static/wasm/mtg_engine_wasm.wasm
bun run dev
```

En un entorno con toolchain Rust normal y target wasm32 preinstalado:

```sh
ENGINE_BUILD_STD=0 bun run engine:build
```

Por defecto `engine:build` usa `-Z build-std` (requiere `rust-src`) porque el
sandbox de desarrollo no podía descargar std prebuilt para el mismo nightly.
El motor upstream usa `if let` guards experimentales; los scripts inyectan
`feature(if_let_guard)` / `feature(let_chains)` por `RUSTFLAGS` **sin modificar
el código de reglas**.

### Verificación

```sh
bun run check           # svelte-check + TypeScript
bun test src/lib        # pruebas unitarias Bun
bun run engine:verify   # hash del árbol de reglas Phase
bun run engine:parity   # paridad API directa vs wrapper (semillas 42/7/123)
bun run test:e2e        # Chromium real (visibilidad, a11y, partida)
bun run build           # build estático
```

Para Chromium en sandbox sin navegador del sistema:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
PLAYWRIGHT_CHROMIUM_LIB_PATH=/tmp/al2023/lib \
bun run test:e2e
```

## Arquitectura

```text
src/lib/engine/       Worker WASM, protocolo binario/JSON y cliente RPC
src/lib/game/         Estado de sesión (runas), acciones, imágenes Scryfall
src/lib/components/   Board, Hand, Battlefield, CardView, DecisionPanel, …
src/routes/stress/    Fixture determinista de visibilidad (no ejecuta reglas)
crates/phase-engine/  Motor Phase upstream byte-idéntico (ver provenance)
crates/mtg-engine-wasm/ Puente ABI C/JSON, exportador de catálogo y paridad
static/data/          Catálogo mínimo, metadatos UI y mazos demo
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

## Procedencia y licencias

- Phase: commit `c2fbb7a6634a440c7c6b47e6a87a554cc7382f05`, MIT OR Apache-2.0.
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

Las pruebas e2e verifican anchos 320/375/390/768/1440, recorrido completo de una
mano de 30 cartas, expansión de fichas, ausencia de desbordamiento horizontal,
axe-core sin violaciones críticas/serias y una partida real que juega una tierra.
