# Auditoría de Phase upstream — 3 de noviembre de 2026

## Puntero vigente, comprobado contra GitHub

- Repositorio: https://github.com/phase-rs/phase
- Copia importada en Mesa (PR #6): `0dd35e4a9dfe1dfba697224775d2205d56f7f20d`, 2 de noviembre de 2026
- Referencia verificable local: [`PHASE-UPSTREAM-PIN.json`](PHASE-UPSTREAM-PIN.json)
- Último commit revisado en upstream: [`bf584d6`](https://github.com/phase-rs/phase/commit/bf584d6bd39f254549be49ed9ff2b845e748e32c)
- Diferencia: **4 commits** y **8 rutas**, sin divergencia de historial respecto al pin.

Comparación: https://github.com/phase-rs/phase/compare/0dd35e4a9dfe1dfba697224775d2205d56f7f20d...bf584d6bd39f254549be49ed9ff2b845e748e32c

## Cambios concretos

| Commit | Alcance | Relevancia para Mesa |
| --- | --- | --- |
| `8f228ce` | Dependencias de cliente **React/pnpm**, Storybook, Vite y Vitest del cliente Phase | **No portar**: Mesa usa Bun/Svelte/Vite 8, no ese cliente ni su lockfile |
| `764b086` | Pruebas para el destinatario correcto al atacar con Hellrider y Cavalcade of Calamity | Revisar como cobertura; los cambios de este commit son **pruebas**, no un nuevo port del cliente |
| `9b6e15a` | `LazyLock` para reutilizar el análisis del catálogo de fichas en cobertura | Buena mejora de rendimiento para análisis repetidos; no cambia el contrato UI |
| `bf584d6` | Mantiene públicas las cartas reveladas por Ripple mientras se anuncia un lanzamiento gratuito que puede pausar | **Prioridad funcional y de visibilidad**: requiere probar proyección por visor y prompts de orden al fondo |

Los cambios Rust afectan `crates/engine/src/game/coverage.rs`,
`crates/engine/src/game/engine.rs`, `crates/engine/src/types/game_state.rs`
y pruebas de integración. El cliente React upstream y `client/pnpm-lock.yaml`
no forman parte de Mesa.

## Decisión de integración

**Recomendada:** preparar una actualización **separada** del motor desde el
commit `0dd35e4` hasta `bf584d6`, importando solo los tres crates
`phase-engine`, `phase-ast`, `phase-parser` y los cambios Rust correspondientes.
No copiar dependencias de React ni versiones del cliente Phase.

**No marcar como implementada todavía.** Deben regenerarse y verificarse
`docs/PHASE-UPSTREAM-PIN.json`, el hash de procedencia del árbol
`crates/phase-engine/src`, y, si cambia, `Cargo.lock` mediante el
procedimiento de importación controlado, sin modificar `main` directamente.

Puertas para el nuevo PR: `engine:verify`, `cargo metadata --locked`,
WASM con nightly fijada, paridad nativa/bridge, escenarios de mecánicas,
proyección de visibilidad Ripple y suite Chromium (incluido tutorial y
partida completa). Una prueba fallida **bloquea** el merge.

Este informe es una revisión del upstream; no modifica las reglas del motor.
