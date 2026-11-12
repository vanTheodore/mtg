# Phase: importación aislada de fuentes Rust — 7 nov 2026 (12 commits más)

- Pin antiguo: `917542cd0e91463d8f53e92781f3188c8ebcf092` (v0.123.0).
- Pin nuevo: `3c8d9bca3019c92a36b51f96760a102a8c26181d` (**12 commits posteriores**, sin release nuevo: el workspace sigue en **0.123.0**, así que las versiones literales de los `Cargo.toml` y sus tres líneas de `Cargo.lock` no cambian).
- Comparación: https://github.com/phase-rs/phase/compare/917542cd0e91463d8f53e92781f3188c8ebcf092...3c8d9bca3019c92a36b51f96760a102a8c26181d
- Importados de nuevo `crates/engine/src`, `crates/phase-ast/src` y `crates/phase-parser/src` desde el tarball del commit nuevo. `diff -rq` contra el tarball: **idénticos en los tres**.

Los `Cargo.toml` de las tres crates son los mismos entre los dos pines (solo difiere la línea de versión, que aquí es literal), así que no hay dependencias nuevas.

## Qué cambia de tamaño

| Árbol | Ficheros antes | Ficheros ahora |
| --- | --- | --- |
| `crates/phase-engine/src` | 480 | 480 |
| `crates/phase-ast/src` | 34 | 34 |
| `crates/phase-parser/src` | 392 | 392 |

En total, **28 ficheros reescritos, +2 881 líneas y −363** entre `src`, pruebas y fixtures. El bloque más grande es la selección manual de maná para habilidad de maná (`3c8d9bca`, Doubling Cube), seguido de la asignación de arrollar «assign the rest» (`88968956`) y del cálculo de huecos por cara del mazo (`7eba085d`).

## Los 12 commits

| Commit | Asunto | Efecto en la mesa |
| --- | --- | --- |
| `3c8d9bca` | pick the pool mana that pays a mana ability in manual mode; Doubling Cube is a mana ability (#10801) | Modo manual de maná: se elige qué maná del pool paga la habilidad; Doubling Cube pasa a ser habilidad de maná. |
| `88968956` | trample "assign the rest", attack-target hover line, per-target attack totals (#10782) | Arrollar con «asignar el resto» y totales por objetivo de ataque. |
| `7eba085d` | share per-face gap computation between deck coverage and analyze_coverage (#10733) | Cobertura del mazo por cara; informes, no reglas de partida. |
| `3ebfdf2a` | show on the play / on the draw at the opening hand; dice overlay names the roll winner (#10800) | Quién juega primero en la mano inicial; el dado dice quién ganó la tirada. |
| `7062e1a9` | refresh MTGJSON token & subtype catalogs (#10790) | Datos del parser. |

El resto son de cliente (filas de contadores en Click Mode, exportar mazo, atajo K, umbral de daño de comandante, borde animado de prioridad) y de draft (pods), que Mesa no porta; y un anuncio de changelog.

## Impacto en el port de vistas (#60)

`WaitingFor` sigue con **147 variantes**, sin altas ni bajas, y los bloques de campos de las **trece** variantes que Mesa ya representa son **idénticos** a los del pin anterior, comprobado bloque a bloque (`RevealChoice`, `DigChoice`, `SearchChoice`, `PayAmountChoice`, `OptionalEffectChoice`, `OpponentMayChoice`, `UnlessPayment`, `PairChoice`, `ChooseTokenHost`, `ManaSourceSelection`, `ModeChoice`, `OrderTriggers`, `ChooseXValue`). La actualización no cambia ningún contrato de esas vistas.

## Pruebas y datos que se sincronizan a la vez

La importación mueve también lo que no es `src` y el código necesita para compilar o para correr sus regresiones:

- Ficheros de prueba y fixtures que Mesa conserva: **8 ficheros cambian** (`activation_manual_mana_payment`, `ai_multi_target_selection`, `created_token_counter_sequence`, `granted_ability_self_binding` y los shards 2–4). `diff -rq` contra el tarball no encuentra diferencias entre los conservados; la poda de 69 ficheros upstream se mantiene.
- `crates/phase-ast/data/known-tokens.toml` (catálogos de tokens) y el sello `mtgjson-vintage` (2026-11-10 → **2026-11-11**). No hay ficheros de datos nuevos en este rango.

## Verificación

- SHA-256 agregado de `phase-engine/src` con el algoritmo canónico de `bun run engine:verify` (**480 ficheros**): **`630b08c3b4196fa1dad4b2946dcf641b7f049ebd5e44b06bd57f009ea996fdd6`**.
- `bun run engine:verify` en verde contra el manifiesto nuevo.
- `diff -rq` de los tres árboles `src` contra el tarball de `3c8d9bca`: sin diferencias.
- Sin toolchain de Rust en este sandbox; la compilación la validan los trabajos **Native parity**, **WASM build** y **Phase source regressions** de CI sobre este commit, cuyos errores de cargo ya se leen como anotaciones (`scripts/rust-annotations.ts`).
