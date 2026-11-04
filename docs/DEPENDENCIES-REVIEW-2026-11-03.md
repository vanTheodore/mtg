# Auditoría de librerías — 3 de noviembre de 2026

`package.json` y `bun.lock` fijan exactamente la misma versión. La auditoría compara publicaciones estables públicas, no ramas `next` ni previews ni el cliente React de Phase.

| Paquete | Instalado | Última estable confirmada | Acción |
| --- | --- | --- | --- |
| Bun | 1.4.4 | 1.4.4 | Sin cambio |
| Svelte | 5.57.3 | 5.57.3 | Sin cambio |
| @sveltejs/kit | 3.1.1 | 3.1.1 | Sin cambio |
| @sveltejs/adapter-static | 4.0.1 | 4.0.1 | Sin cambio |
| @sveltejs/vite-plugin-svelte | 7.3.1 | 7.3.1 | Sin cambio |
| Vite | 8.3.5 | 8.3.5 | Sin cambio |
| @playwright/test | 1.64.1 | 1.64.1 | Sin cambio |
| @axe-core/playwright | 4.14.0 | 4.14.0 | Sin cambio |
| svelte-check | 4.7.8 | 4.7.8 | Sin cambio |
| @types/bun | 1.4.4 | 1.4.4 | Sin cambio |
| TypeScript | 6.0.3 | 7.0.2 | **No actualización automática**: major y nuevo backend de compilador; preparar migración propia y medir impacto en SvelteKit/runes, plugins, build y tests |

Fuentes verificadas: [Bun releases](https://github.com/oven-sh/bun/releases),
[Svelte releases](https://github.com/sveltejs/svelte/releases),
[SvelteKit y adapter](https://github.com/sveltejs/kit/releases),
[Vite releases](https://github.com/vitejs/vite/releases),
[Playwright releases](https://github.com/microsoft/playwright/releases),
[plugin de Svelte](https://github.com/sveltejs/vite-plugin-svelte/releases),
[TypeScript releases](https://github.com/microsoft/TypeScript/releases),
[svelte-check en npm](https://www.npmjs.com/package/svelte-check?activeTab=versions),
[axe Playwright en npm](https://www.npmjs.com/package/%40axe-core/playwright?activeTab=versions) y
[@types/bun en npm](https://www.npmjs.com/package/%40types/bun).

`.github/dependabot.yml` ya comprueba dependencias Bun semanalmente (martes 09:30 America/Santiago), agrupa minor/patch y **omite majors**. No crear un PR con cambios de `package.json` sin resolver también `bun.lock`; CI usa `bun install --frozen-lockfile`. No actualizar Cargo.lock de forma aislada: pertenece al pin de Phase.

**Conclusión:** no hay un bump minor/patch del stack confirmado que justifique arriesgar la partida. Concentrar el CI caro en actualizar Phase con reglas reales.
