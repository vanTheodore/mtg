# Instrucciones para agentes que trabajan en Mesa MTG

Antes de modificar código, lee la misión activa: https://github.com/vanTheodore/mtg/issues/42
El handoff técnico de esta preparación está en `docs/ARENA-AI-HANDOFF.md` (rama `docs/arena-ai-handoff-20261104`).
Revalida el estado de `main`, PR, checks y HEAD en GitHub: el handoff tiene fecha, no es estado permanente.

## Contratos NO negociables

- **Phase en Rust/WASM es la única autoridad de reglas MTG.** Svelte muestra observables, decisiones y estados; no inventa legalidad, fases, triggers, maná ni resultados.
- Preserve `docs/PHASE-UPSTREAM-PIN.json` y la procedencia verificable. Actualizaciones upstream de Phase van en PR independiente, con auditoría y escenarios; no mezclar con cambios visuales.
- **Stack Bun-only** (`bun@1.4.4` según package.json), SvelteKit 3, Svelte 5 runes, TypeScript 6, Vite 8. No incorporar React ni crear un runtime Node de producción; no npm/pnpm.
- **es-419 y cartas privadas:** jamás mostrar al rival identidades de cartas ocultas; no llamar a Scryfall por identidades ocultas. Imágenes con fallbacks y resoluciones oficiales, sin inventar ni distribuir escaneos privados.
- La UI puede ser cercana a una mesa Arena/Phase; no duplicar la UI de React con su estado de reglas. Modo Clásico reversible. Mouse, teclado, táctil, lectores de pantalla y 320/375/390/768/1440 px.
- No borrar, omitir, forzar (`force: true`) ni debilitar una prueba real que falla. Si un objetivo de viewport no se logra, reportar la deuda medida y sus causas.

## Preparación, comandos y PR

- Fuente de verdad: `README.md`, `docs/ENGINE-CONTRACT-0.2.md`, `docs/PHASE-UPSTREAM-PIN.json`, `docs/PHASE-ARENA-DENSITY.md`, `docs/LOCAL-ASSETS-WINDOWS.md`, `docs/LOCALE.md` y el [issue #42](https://github.com/vanTheodore/mtg/issues/42).
- Descarga `bun install --frozen-lockfile`; `bun run check`; `bun test src/lib`; `bun run engine:verify`; `bun run build`; `bun --bun playwright test`.
- Paridad y escenarios: `bun run engine:parity` y `bun run engine:scenarios` a través de GitHub Actions o en entorno equipado con Rust. En Windows ligero no exige compilar Rust localmente. El WASM se descarga mediante `bun run engine:download` desde un run verde de **main al mismo commit**, no de PR diferentes.
- No abrir decenas de runs completos por cada ajuste CSS. Focalizar E2E mientras iteras, aprovechar cache/concurrencia por PR y exigir suite completa en **HEAD final**. Capturas, JSON y logs deben permitir reproducir una afirmación.
- Secuencia de la misión: resolver PR #39 y #41 con CI verde → UI de partida Arena 1.0 en PR separados → accesibilidad/móvil/comprobación real de Phase. La rama experimental de status compacto está **sin verificar**. Issue #40 de upstream Phase va separado.
- No hacer merge con checks rojos, ni deploy sin solicitud. No presentar una fixture sintética como prueba de legalidad MTG.
