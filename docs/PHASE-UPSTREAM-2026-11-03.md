# Auditoría de Phase upstream — 3 de noviembre de 2026

## Punto de partida de la auditoría, comprobado contra GitHub

- Repositorio: https://github.com/phase-rs/phase
- Copia inicial al comenzar la auditoría (PR #6): `0dd35e4a9dfe1dfba697224775d2205d56f7f20d`, 2 de noviembre de 2026
- Referencia verificable local: [`PHASE-UPSTREAM-PIN.json`](PHASE-UPSTREAM-PIN.json)
- Último commit revisado en upstream: [`bf584d6`](https://github.com/phase-rs/phase/commit/bf584d6bd39f254549be49ed9ff2b845e748e32c)
- Diferencia al comenzar la revisión: **4 commits** y **8 rutas**, sin divergencia de historial respecto al pin antiguo. El valor **vigente** se consulta en el JSON de procedencia.

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

## Implementación en Mesa

Los cambios del motor se incorporaron en el [PR #16](https://github.com/vanTheodore/mtg/pull/16), de forma independiente a las actualizaciones de Svelte y a la UI. Se copiaron **solo cinco rutas Rust** (tres fuentes y dos pruebas); las otras tres rutas de upstream pertenecen exclusivamente al cliente React, pnpm y un test del adaptador del cliente.

Cada archivo incorporado se contrastó por **Git blob SHA** contra el pin antiguo y contra `bf584d6`; se actualizó `docs/PHASE-UPSTREAM-PIN.json` y se volvió a ejecutar `engine:verify` con la huella de fuente resultante. No cambió `Cargo.lock`. El workflow temporal con permiso de escritura se eliminó antes del commit.

**Importación no equivale a aprobación:** el PR permanece en borrador mientras se comprueban sus controles. El workflow permanente `Phase source regressions` compila y ejecuta el código de pruebas **original** de Ripple, Hellrider y Cavalcade, además del CI general (WASM, paridad, Chromium). El arnés se genera solo dentro del runner, y el script auxiliar requerido por una herramienta de Phase se descarga solo en el runner y se comprueba contra el blob oficial.

No aplicar `merge` sin confirmar ambas suites verdes, sin errores de privacidad y con `engine:verify` verificando la huella actual. En el futuro la fuente autoritativa del commit de Phase es el manifiesto, no este informe histórico.
