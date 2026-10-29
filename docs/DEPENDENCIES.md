# Auditoría de dependencias (2026-10-29)

Reproducible con `bun run deps:audit` (`scripts/deps-audit.ts`): lee cada paquete
fijado en `bun.lock`, consulta el canal `latest` del registro npm y compara
versiones con orden semántico (incluidas preversiones). No instala ni modifica
nada.

## Resultado

- **88 paquetes** en `bun.lock`, **10 directos**.
- **24 desactualizados**, de los cuales **1 es directo**: `typescript`.
- Ningún otro dependiente directo están por detrás del registro.

| Directo | Fijado | `latest` | Estado |
| --- | --- | --- | --- |
| `typescript` | 6.0.3 | 7.0.2 | Retenido a propósito: el stack obligatorio es TS 6 |
| `@sveltejs/kit` | 3.1.0 | 3.1.0 | Al día |
| `svelte` | 5.57.3 | 5.57.3 | Al día |
| `vite` | 8.3.5 | 8.3.5 | Al día |
| `@sveltejs/vite-plugin-svelte` | 7.3.1 | 7.3.1 | Al día |
| `@sveltejs/adapter-static` | 4.0.0 | 4.0.0 | Al día |
| `svelte-check` | 4.7.7 | 4.7.7 | Al día |
| `@playwright/test` | 1.64.1 | 1.64.1 | Al día |
| `@axe-core/playwright` | 4.14.0 | 4.14.0 | Al día |
| `@types/bun` | 1.4.4 | 1.4.4 | Al día |
| runtime `bun` | 1.4.4 | 1.4.4 | Fijado en `packageManager` y `engines` |

### Por qué TypeScript no se sube

TypeScript 7 es el compilador nativo (port a Go) y cambia el toolchain del
proyecto. El stack acordado es TS 6 con `svelte-check`/Vite 8; subir de mayor
exigiría revalidar tipos, build, pruebas unitarias, E2E y el contrato del worker
bajo un compilador distinto. Se deja anotado, no aplicado.

### Transitorios desactualizados (contexto, no acción directa)

| Paquete | Fijado | `latest` | Por qué no se toca a mano |
| --- | --- | --- | --- |
| `@rolldown/binding-*` (16 plataformas) | 1.2.15 | 1.2.16 | `optionalDependencies` exactas del rolldown que resuelve Vite 8.3.5; suben con Vite |
| `@oxc-project/types` | 0.155.0 | 0.156.0 | Fijado con `=` por rolldown; mismo caso |
| `chokidar`, `readdirp` | 4.x | 6 / 5 | Rangos `^4` de Vite/Kit; el salto es de sus padres |
| `devalue` | 5.9.4 | 6.0.3 | Rango `^5` de SvelteKit/Svelte |
| `nanoid`, `obug` | 3.3.20 / 2.2.1 | 6 / 3 | Rangos de los padres |
| `@types/estree`, `aria-query`, `undici-types` | 1.0.9 / 5.3.1 / 8.9.0 | 1.0.10 / 5.3.2 / 8.12.3 | Parches/minors dentro del rango; una resolución limpia los tomaría |

`aria-query` está fijado a `5.3.1` exacto por Svelte 5.57.3, así que el
`5.3.2` disponible no entra sin cambiar Svelte.

## Rust y el motor

- Phase permanece en el commit `c2fbb7a6634a440c7c6b47e6a87a554cc7382f05`
  (v0.119.0) para que `crates/phase-engine/src` siga byte-idéntico al upstream
  (`bun run engine:verify`, 868 archivos, SHA-256 `7ca901b3…8aa5`).
- `main` de Phase está **2 commits por delante** de ese pin al 2026-10-29
  (`57ef03d2` «refresh metagame feeds», `db0decf6` «close the AST layer against
  state and game modules»). No se adoptan en esta fase: cambiaría el árbol de
  reglas y exigiría repetir paridad, escenarios, E2E y medición.
- Dependencias del puente (`crates/mtg-engine-wasm`): `serde` 1.0.228,
  `serde_json` 1.0.149, `web-time`, `getrandom` 0.3.4, `wasm-bindgen` 0.2.121 y
  `rand` 0.9.4 (heredado de Phase), todas resueltas y fijadas en `Cargo.lock`.
  El registro de crates no es alcanzable en este entorno; el lock se valida
  compilando (`cargo check --offline`) y con `bun run engine:parity`.

## Política de actualización

1. Solo se sube un directo con verificación completa:
   `bun run check && bun test src/lib && bun run engine:verify && bun run build`
   más `bun run test:e2e` cuando haya navegador disponible.
2. Nada de Node/npm/pnpm ni dependencias de aplicación en Node: el runtime es
   Bun 1.4.4 y las herramientas nativas (Rust, Binaryen) no son dependencias de
   la app.
3. Los transitorios se actualizan subiendo su padre, no editando `bun.lock`.
