# Phase upstream: importación d963d0a (3 de noviembre de 2026)

## Alcance contrastado con GitHub

- Anterior: [`bf584d6`](https://github.com/phase-rs/phase/commit/bf584d6bd39f254549be49ed9ff2b845e748e32c).
- Nuevo pin propuesto: [`d963d0a`](https://github.com/phase-rs/phase/commit/d963d0a2379c8396e8ffff28c4df87ab8580559f).
- [Comparación de upstream](https://github.com/phase-rs/phase/compare/bf584d6bd39f254549be49ed9ff2b845e748e32c...d963d0a2379c8396e8ffff28c4df87ab8580559f): **11 commits**, todos posteriores al pin previo, sin divergencia upstream.
- [`docs/PHASE-UPSTREAM-PIN.json`](PHASE-UPSTREAM-PIN.json) sigue siendo el manifiesto autoritativo del SHA y la huella; `engine:verify` comprueba la integridad de `phase-engine/src`.

## Qué cambia realmente

- **Reglas:** las reducciones de coste de habilidades activadas de *Training Grounds* no se propagan a cementerio o mano; se limita la búsqueda de pagos hermanos.
- **Resolución:** se completa correctamente una resolución pausada incluso cuando la carta vuelve a lanzarse, y *Mosswort Bridge* no ofrece jugar una carta inexistente tras un Hideaway vacío.
- **Habilidades y parser:** regresiones de *Accursed Witch* y disparadores, y nuevas pruebas de *Ignite Memories* y del emblema de *Tezzeret, Cruel Captain*.
- **Registro:** mensaje de traspaso de prioridad corregido.
- **Cliente React:** la corrección de identidades de comandante en `client/src/providers/GameProvider.tsx` **no se importa**: Mesa usa Svelte 5 y su propia capa de sesión, sin copiar estados React.
- **Otros cambios no importados:** herramientas de censo CR 733, tests de IA y snapshots/fixtures pesadas de upstream. No se proclama cobertura integral de todos ellos.

## Ficheros importados

Se importan **exactamente ocho archivos** de `crates/engine/src` → `crates/phase-engine/src`, y **dos** de `crates/phase-parser/src`, con la misma identidad de blob Git que upstream, sin alterar la lógica. Cargo.lock y el puente `mtg-engine-wasm` permanecen tal como estaban.

Se añaden dos archivos de pruebas originales, también con identidad Git idéntica, en `crates/phase-engine/tests/integration`: `issue_10401_off_zone_ability_cost_reduction.rs` y `ignite_memories_random_reveal.rs`. El workflow de regresiones monta esos archivos como módulos dentro del runner y ejecuta sus tests originales, además de Ripple, Hellrider y Cavalcade. No crea reglas equivalentes en TypeScript.

## Gate para fusionar

1. `bun run engine:verify` aprueba el SHA-256 agregado de las fuentes y lo relaciona con el commit del manifiesto.
2. TypeScript/Svelte, tests unitarios Bun, build estático.
3. Cargo metadata y compilación del WASM con toolchain y lock fijados; paridad motor ↔ ABI y escenarios.
4. Chromium E2E completo (partida real, tutorial, privacidad/hot-seat, nuevo HUD e imágenes españolas).
5. Workflow Rust especializado (Training Grounds e Ignite Memories, además de las tres regresiones originales existentes).

**Importar upstream no equivale a fusionar.** Si alguna nueva prueba necesita los fixtures completos de upstream, declarar exactamente esa limitación y no falsear el resultado. Mantener el PR en borrador hasta tener evidencia. No desplegar.
