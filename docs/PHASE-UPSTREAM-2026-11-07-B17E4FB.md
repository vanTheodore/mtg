# Phase upstream: deriva medida desde `b17e4fb` — 7 nov 2026

> **Aplicado el mismo día** en [`PHASE-UPSTREAM-2026-11-07-F671692.md`](PHASE-UPSTREAM-2026-11-07-F671692.md):
> el pin pasa a `f671692` con el digest de la tabla. Este documento se queda como la
> medición de la deriva (qué había por delante y cómo se comprobó); la sección
> «Por qué no se aplica aquí» describe el estado del entorno antes de ese PR.

Comprobación de deriva, **sin importar código ni mover el pin**. El pin
autoritativo sigue siendo `b17e4fb` en [`PHASE-UPSTREAM-PIN.json`](PHASE-UPSTREAM-PIN.json);
este documento sólo mide cuánto hay por delante y deja el trabajo preparado.

- Pin local: `b17e4fb146cbad67670a0bada55d16bc5ee9b6d4` (workspace `0.119.0`).
- Upstream `main` hoy: [`f671692`](https://github.com/phase-rs/phase/commit/f67169218fa9f5dec439b9024906b891a926210e) (workspace `0.119.0`, sin cambio de versión).
- Comparación: https://github.com/phase-rs/phase/compare/b17e4fb146cbad67670a0bada55d16bc5ee9b6d4...f67169218fa9f5dec439b9024906b891a926210e
- **56 commits por delante, 0 por detrás.** 300 ficheros tocados, de los cuales **166** están bajo `crates/engine`, `crates/phase-ast` o `crates/phase-parser`. `Cargo.toml` y `Cargo.lock` del workspace **no** cambian.

## Qué se midió del árbol nuevo

Se descargó el tarball del `main` upstream (`codeload.github.com`, 150 MB) y se
aplicó el mismo algoritmo canónico de `bun run engine:verify` (rutas POSIX
ordenadas, `path \0 sha256(contenido)`, digest agregado):

| Árbol upstream | Ficheros | SHA-256 agregado |
| --- | --- | --- |
| `crates/engine/src` (nuevo `f671692`) | 468 | `f07d25246dc4d6ddc34a784c1b482acda41598311bc6fe362cfcae5bbcc2b15d` |
| `crates/phase-engine/src` (pin local `b17e4fb`) | 468 | `3be834f5026e3745800a5f840d7e8130bcc3487971bba2afdbbe89bd33982aa9` |
| `crates/phase-ast/src` (informativo) | 33 | no forma parte del digest canónico |
| `crates/phase-parser/src` (informativo) | 392 | no forma parte del digest canónico |

`bun run engine:verify` sobre el árbol local sigue en verde (`ok: true`, 468
ficheros, digest esperado). Es decir: **el pin actual está íntegro**; lo que hay
es upstream nuevo, no corrupción local.

## Composición del salto

Conteo por prefijo del asunto (los 56 commits):

| Tipo | Nº |
| --- | --- |
| `fix(parser)` | 15 |
| `fix(engine)` | 6 |
| `chore(deps)` / `chore(deps-dev)` | 8 |
| `fix(ai)` y arreglos de IA sin prefijo | 3 |
| `feat(engine)` | 2 |
| `test(engine)` | 2 |
| `fix(coverage)` | 1 |
| `chore(card-data)`, `chore(cr)`, `chore(security)`, `ci`, `docs`, `chore(changelog)` | 9 |
| Cartas y correcciones puntuales sin prefijo (Leyline Tyrant, Diabolic Vision, Alabaster Potion, Gix, coin-flips, batch delivery…) | 10 |

Lo que más pesa para Mesa es el parser (15 commits: referentes de «that
player»/«they», ventanas de frase, duraciones inyectadas, tipos apilados,
búsquedas en la biblioteca del jugador que dispara) y motor (combate, pulso de
pago de maná, revelaciones públicas, *crew* de Golden Argosy, energía de Blaster
Hulk). Hay además un `feat(engine)`: zona de mando opcional para formatos
limitados.

## Por qué no se aplica aquí

Actualizar el pin son tres cosas, no una, y este entorno sólo puede hacer la
primera:

1. **Importar los crates** (`scripts/vendor-crates.ts`) desde `f671692`
   renombrando `crates/engine|phase-ast|phase-parser` → `crates/phase-*`. Posible,
   pero deshace cualquier parche local deliberado si se hace a ciegas.
2. **Recalcular `sourceSha256`** en el manifiesto con el digest de arriba.
   Trivial.
3. **Reconstruir el WASM** que sirve la app (`static/wasm/mtg_engine_wasm.wasm`,
   hoy `77c9df4a…567a53`). **Imposible aquí: no hay `cargo`, `rustc` ni
   `rustup` en el entorno.** El binario lo produce CI y se instala con
   `scripts/install-ci-wasm.ts` desde la rama `ci/wasm-artifacts`.

Sin el paso 3, el repo diría «motor `f671692`» y el navegador seguiría corriendo
el motor de `b17e4fb`: exactamente el falso verde que este proyecto no admite.
Por eso el pin **no** se mueve en esta pasada.

## Siguiente paso propuesto (PR aparte)

Un PR «chore(phase): importar `f671692`» con el flujo que ya usaron las
importaciones anteriores:

1. `scripts/vendor-crates.ts` contra `f671692`; comprobar que los tres árboles
   son byte-idénticos al upstream antes de sobrescribir.
2. Actualizar `docs/PHASE-UPSTREAM-PIN.json` (`commit`, `sourceSha256` de la
   tabla de arriba, informe `PHASE-UPSTREAM-2026-11-07-F671692.md`).
3. Dejar que CI compile el WASM y ejecute `engine:verify`, `engine:parity`,
   `engine:scenarios`, la suite Rust seleccionada y Chromium. El PR no se declara
   verde hasta que el binario publicado sea el del pin nuevo.
4. Sólo entonces, `install-ci-wasm` local + `bun run quality`.

Mientras eso no ocurra, este informe es la referencia de cuánto se ha quedado
atrás y de qué digest habría que esperar.
