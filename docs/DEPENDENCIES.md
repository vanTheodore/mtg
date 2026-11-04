# Dependencias de Mesa — auditoría del 3 de noviembre de 2026

**Stack estable:** Bun 1.4.4, Svelte 5, SvelteKit 3, Vite 8, TypeScript 6,
Rust/Phase vendorizado y Playwright Chromium. La versión de Bun está
fijada tanto en `package.json` como en CI. El registro de versiones
exactas de los paquetes está en `package.json` y el lock reproducible
está en `bun.lock`.

## Versiones contrastadas

| Dependencia | Fijada | Última estable consultada | Acción |
| --- | --- | --- | --- |
| Bun | 1.4.4 | 1.4.4 | Mantener |
| `@sveltejs/kit` | 3.1.0 | **3.1.1** | Candidata, en PR generado con lockfile |
| `@sveltejs/adapter-static` | 4.0.0 | **4.0.1** | Candidata, junto con Kit |
| `svelte-check` | 4.7.7 | **4.7.8** | Candidata, con test de tipos |
| `@sveltejs/vite-plugin-svelte` | 7.3.1 | 7.3.1 | Mantener |
| Vite | 8.3.5 | 8.3.5 | Mantener |
| Playwright | 1.64.1 | 1.64.1 | Mantener |
| `@axe-core/playwright` | 4.14.0 | 4.14.0 | Mantener |
| Svelte | 5.57.3 | Se mantiene hasta confirmar tag estable más nuevo | Mantener |
| TypeScript | 6.0.3 | Serie 7 publicada | **Mantener TS 6** por contrato del proyecto |
| `@types/bun` | 1.4.4 | Compatible con Bun 1.4.4 | Mantener |

Referencias: https://www.npmjs.com/package/@sveltejs/kit ;
https://www.npmjs.com/package/@sveltejs/adapter-static ;
https://www.npmjs.com/package/svelte-check ;
https://www.npmjs.com/package/vite ;
https://www.npmjs.com/package/@playwright/test ;
https://bun.com/blog .

## Actualizaciones propuestas de forma segura

GitHub Dependabot admite el ecosistema `bun` y el **`bun.lock` de texto**
con Bun 1.4 (soporte anunciado el 20 de octubre de 2026):
https://github.blog/changelog/2026-10-20-dependabot-now-supports-npm-12-pnpm-11-and-12-and-bun-1-4/

La nueva [configuración de Dependabot](../.github/dependabot.yml)
solicita **como máximo dos PR activos**, agrupa los parches/minor de Svelte
y herramientas, revisa semanalmente en horario de Chile y desactiva el
rebase automático. Así evita generar numerosas ejecuciones CI al subir
un upstream o al reabrir un PR.

El bot debe actualizar **`package.json` + `bun.lock` juntos**; no se
sube solo `package.json` porque el CI exige
`bun install --frozen-lockfile`. Ninguna actualización de Dependabot
hace merge automático. Los PR requieren `bun run check`,
`bun test src/lib`, `bun run engine:verify`, build,
WASM/paridad y Chromium completos cuando cambian librerías de UI.

Se ignoran los saltos **major**, incluido TypeScript 7. Los updates
de Cargo/Phase están fuera de Dependabot a propósito: los crates son
fuentes vendorizadas y el hash del motor, Cargo.lock y la toolchain
requieren un proceso de importación controlado y sus propios tests.

**Limitación:** para Bun, Dependabot publica actualizaciones de versión,
pero sus actualizaciones automáticas por avisos de seguridad no tienen
el mismo soporte que npm. Conviene conservar `bun run deps:audit` y
revisiones de advisories sin asumir que el bot cubre todo.

Este documento **es una auditoría**; no afirma que las tres versiones
candidatas estén instaladas ni que sus tests hayan pasado. Un futuro PR
de Dependabot aportará el lock regenerado y el CI correspondiente.

## Revisión anterior

La versión anterior (29 oct.) seguía a Phase `c2fbb7a`, antes de
la actualización ya fusionada del PR #6 a `0dd35e4`. Ver la procedencia
vigente en [`ENGINE-PROVENANCE.md`](ENGINE-PROVENANCE.md) y la auditoría
de upstream del [3 de noviembre](PHASE-UPSTREAM-2026-11-03.md).
