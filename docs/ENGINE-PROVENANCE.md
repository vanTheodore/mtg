# Procedencia del motor

- Upstream: `https://github.com/phase-rs/phase.git`
- Commit fijado: `c2fbb7a6634a440c7c6b47e6a87a554cc7382f05` (workspace `0.119.0`)
- Licencias upstream: MIT OR Apache-2.0; ver `licenses/PHASE-MIT` y `licenses/PHASE-APACHE`.
- Copia local de estudio: `/home/user/phase-reference` (no forma parte del cliente).
- Árbol incorporado: `crates/phase-engine`.

## Integridad de las reglas

El directorio `crates/phase-engine/src` es byte-idéntico al upstream en el commit
fijado. Huella SHA-256 del árbol (rutas relativas + hash de cada archivo,
ordenado):

```text
7ca901b32a2ae92ab8d760b32ff65c9ea174f35c374260874968148397cc8aa5
868 archivos
```

Verificar con:

```sh
bun scripts/verify-engine.ts
```

No se reescribieron reglas en TypeScript. El cliente consulta acciones legales y
envía acciones al motor Rust/WASM; la autoridad de reglas, visibilidad y
legalidad sigue siendo Phase.

## Adaptaciones de build (sin cambios de reglas)

- `crates/phase-engine/Cargo.toml` se des-workspacé y se retiraron binarios,
  dev-dependencies y features no necesarias para el puente WASM.
- `crates/mtg-engine-wasm` es un puente propio de ABI C/JSON, sin `wasm-bindgen`.
- El upstream usa `if let` guards experimentales. En este sandbox se compila con
  nightly y se inyectan `feature(if_let_guard)` / `feature(let_chains)` por
  `RUSTFLAGS`, en vez de modificar el código de reglas.
- Dependencias vendidas fuera del repositorio por restricciones de red. Versiones
  que difieren del lock upstream y motivo:
  - `strum` / `strum_macros` 0.27.1 (tag upstream disponible)
  - `rand_core` 0.9.3 (+ parche de feature `std`), 0.6.4
  - `rand_xoshiro` 0.6.0 (mirror openkylin del crate publicado)
  - `equivalent` 1.0.1
  - `generic-array` 0.14.7, `same-file` 1.0.6 (mirror Chromium)
  - `js-sys` 0.3.98
  - `tracing` 0.1.41 / `tracing-attributes` 0.1.28 / `tracing-core` 0.1.33
- `data/mtgjson/test_fixture.json` proviene del fixture upstream (508 KB). No
  incluye ilustraciones propietarias de Wizards.
