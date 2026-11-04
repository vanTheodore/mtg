# Phase: importación aislada de fuentes Rust — 4 nov 2026

- Pin antiguo: `d963d0a2379c8396e8ffff28c4df87ab8580559f`.
- Pin nuevo: `b17e4fb146cbad67670a0bada55d16bc5ee9b6d4` (15 commits posteriores).
- Comprobación previa: los tres árboles de fuente vendorizados eran idénticos al pin antiguo. No se sobrescribieron parches locales.
- Importados únicamente `crates/engine/src` → `crates/phase-engine/src`, `crates/phase-ast/src` y `crates/phase-parser/src`, byte-idénticos a upstream. No se incorpora el cliente React, servidor, bots de draft, `engine-wasm` upstream ni assets propietarios.
- El nuevo SHA-256 agregado para `phase-engine/src` se ha calculado de todos los archivos importados. `Cargo.lock` y el puente WASM propio permanecen intactos.
- Cambios relevantes: reversión de pago de maná, coste de desanexar Equipos, disparadores y rendimiento de limpieza de tablero (Wrath of God), además de reglas de copiar fichas y validación de objetos.
- **Pendiente de aprobación**: `bun run engine:verify`, typecheck/tests/build Bun, paridad nativa y escenarios de combate, compilación WASM, Chromium y regresiones Rust seleccionadas. La importación no implica equivalencia ni compatibilidad plena con todas las cartas.

Comparación: https://github.com/phase-rs/phase/compare/d963d0a2379c8396e8ffff28c4df87ab8580559f...b17e4fb146cbad67670a0bada55d16bc5ee9b6d4
