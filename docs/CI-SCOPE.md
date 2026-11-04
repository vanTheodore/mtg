# Mesa CI: matriz selectiva y segura

En cada `push` a `main` y ejecución manual se ejecuta la **matriz completa**: estática, paridad/escenarios nativos, WASM, Chromium. Así, un artefacto de motor descargado desde `main` solo puede proceder de un workflow que exigió todas sus verificaciones.

En PRs, la primera etapa (Bun) siempre ejecuta `engine:verify`, `bun run check`, unitarias y `bun run build`. Una puerta (`scripts/ci-change-scope.ts`) compara el árbol de la **fusión provisional** del PR con el SHA base del evento. En cuanto aparezca **cualquier** archivo no permitido, ejecuta Rust, WASM y Chromium como antes. Si no puede determinar la diferencia (SHA no disponible, error de Git, lista vacía), pide la matriz completa.

Solo se omiten los trabajos caros si **todos** los archivos cambiados pertenecen a:

- `docs/` o un archivo `.md` (texto).
- `scripts/install-ci-wasm.ts`, `scripts/preflight.ts`, `src/lib/game/ci-wasm-artifact.test.ts` (diagnóstico/descarga, no cambian Phase).
- `.github/workflows/windows-install-smoke.yml` (smoke de Windows, cuya validación corresponde al workflow propio).

`package.json`, `bun.lock`, `Cargo.lock`, `crates/**`, `src/lib/components/**`, `src/lib/styles/**`, `src/lib/game/**` fuera de la lista, `tests/e2e/**`, `.github/workflows/ci.yml` y cualquier ruta nueva **exigen full**. No se mantiene una excepción general para `scripts/`, porque algunos scripts sí influyen en build/verificación de Phase.

La etapa WASM espera el resultado estático para no consumir Rust cuando typecheck o tests ya fallaron. Chromium sigue dependiendo del artefacto WASM de ese mismo run. Un PR ligero puede ver trabajos nativos/WASM/Chromium `skipped`; esto es deliberado **solo** para su diff. Tras fusionarlo, el `push main` ejecuta la matriz completa.

Los escenarios de rutas están cubiertos por `src/lib/game/ci-change-scope.test.ts`. El primer PR que cambia este workflow está clasificado como **full** y prueba la integración real de la puerta.
