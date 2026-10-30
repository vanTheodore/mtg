# El artefacto del motor: por qué falta, cómo se recupera y cómo se confía en él

> Estado: **no hay binario en este workspace**. Esta máquina no puede compilarlo;
> la medición que lo demuestra está abajo. El resto del documento describe el
> camino para producirlo en otra máquina y traerlo de vuelta sin confiar en nada
> que no se pueda verificar.

## 1. Qué falta exactamente

`static/wasm/mtg_engine_wasm.wasm` (el motor Phase compilado a WebAssembly) no
existe en este checkout. Está en `.gitignore` a propósito: son ~46 MB de un
binario generado. Sin él, el cliente arranca y el worker de motor falla al
bootear, así que todo el E2E de juego falla por `404` — no por reglas, no por UI.

Lo que **sí** está en el repo y no depende del binario:

| Pieza | Dónde | Qué garantiza |
| --- | --- | --- |
| Phase fijado | `Cargo.toml`, `Cargo.lock`, `vendor/` | El commit `c2fbb7a6634a440c7c6b47e6a87a554cc7382f05` y sus dependencias exactas. |
| Digest de las fuentes | `scripts/verify-engine.ts` | `7ca901b3…` sobre los 581 archivos de `crates/phase-engine/src`. |
| Contrato ABI | `src/lib/engine/engine.worker.ts`, `src/lib/engine/wasm-imports.ts` | Qué exports/imports debe tener el módulo para que el cliente lo pueda usar. |
| Identidad del binario | `scripts/engine-artifact.ts` | sha256, tamaño, lockfile, compilador, flags y ABI en `docs/wasm-artifact.json`. |
| Transporte | `scripts/engine-fetch.ts` | Traerlo por git y **rechazarlo** si no coincide. |

## 2. Por qué esta máquina no lo compila

Medido, no supuesto. Cuatro intentos, siempre el mismo final: `SIGKILL` del
OOM killer (`signal: 9`) sobre `rustc --crate-name engine`.

| # | Configuración | Pico RSS | Resultado |
| --- | --- | --- | --- |
| 1 | `opt-level=1`, `codegen-units=256` | ~3544 MB | SIGKILL |
| 2 | `opt-level=0`, `codegen-units=1024`, `-Zmir-opt-level=0`, `-Zinline-mir=no` | ~3544 MB | SIGKILL |
| 3 | Como 2, `--emit=metadata` (sin codegen) | **3.385.660 kB** | SIGKILL a los ~9 min |
| 4 | Como 2, `+ -Zno-parallel-backend` y `MALLOC_TRIM_THRESHOLD_=0` | ~3540 MB | SIGKILL a los ~24 min |

Datos de la caja: `MemTotal` 4.034.452 kB (3,9 GB), **swap 0**, `CapEff
0000000000000000` (sin privilegios para montar swap ni subir el cgroup), sin
`memory.max` que ajustar. El intento 3 importa: **quitar la generación de código
no bajó el pico**, así que el muro no es LLVM sino el parseo/chequeo de tipos de
un crate de 1,39 millones de líneas en un binario de 64 bits de rustc. No hay
flag que lo esquive; el proceso necesita más RAM de la que hay.

Conclusión: **no se relanza la matriz de flags**. Está agotada. Lo que falta es
una máquina con más memoria.

## 3. Compilarlo donde sí hay memoria

Requisito real: **8 GB de RAM** (el pico observado es 3,6 GB en un solo proceso;
8 GB deja margen para el resto del sistema). 16 GB sobra. Disco: ~13 GB libres.

Requisitos de entorno, todos ya fijados por el repo:

- Rust **nightly** (el build usa `-Z` y `getrandom_backend="custom"`).
- Target `wasm32-unknown-unknown` (`rustup target add wasm32-unknown-unknown`).
- Bun 1.4.4.
- Dependencias offline: `vendor/` + `.cargo/offline.toml` (o red hacia crates.io).

```bash
git clone <repo> && cd mtg
git checkout arena/5f317145-mtg

# 1. Confirmar que el Phase es el fijado (falla si alguien tocó las fuentes).
bun run engine:verify

# 2. Compilar. Sin MESA_RUSTFLAGS_EXTRA: perfil release del repo.
bun run engine:build

# 3. Firmar la identidad del binario -> docs/wasm-artifact.json
bun run engine:artifact

# 4. Verificar de inmediato (el mismo chequeo que usará cualquier otra sesión).
bun run engine:attest
```

`engine:build` escribe `static/wasm/mtg_engine_wasm.wasm`; `engine:artifact`
rechaza cualquier archivo que no empiece con `\0asm`, que pese menos de 1 MB o
que no exponga el puente de Mesa.

## 4. El contrato ABI que se exige

El módulo tiene que ser **exactamente** el puente de Mesa, o no sirve:

- **exports**: `memory`, `mtg_alloc(len) → ptr`, `mtg_free(ptr, len)`,
  `mtg_request(op, ptr, len) → bigint` (los 32 bits altos son `outPtr`, los 32
  bajos `outLen`).
- **imports**: `env.mesa_now_ms`, `env.mesa_random(ptr, len)`.
- Un import desconocido es un error de arranque, no un aviso.

Ese contrato está en `src/lib/engine/engine.worker.ts` y
`src/lib/engine/wasm-imports.ts`, y está cubierto por
`src/lib/engine/__tests__/artifact-verify.test.ts`: ocho pruebas construyen
módulos wasm a mano (con y sin cada export, con y sin los imports, con un byte
cambiado) y comprueban que el gate acepta solo el correcto.

## 5. Traerlo a una sesión nueva (`scripts/engine-fetch.ts`)

Los *release assets* de GitHub no sirven aquí: redirigen a
`objects.githubusercontent.com`, que esta caja no alcanza. Git sí funciona, así
que el binario viaja como un **archivo único en la rama `artifacts/wasm`**, fuera
de `main`.

Publicarlo (una vez, desde la máquina que compiló):

```bash
git checkout --orphan artifacts/wasm
git add -f static/wasm/mtg_engine_wasm.wasm docs/wasm-artifact.json
git commit -m "engine artifact: <sha256 corto>"
git push origin artifacts/wasm
git checkout -            # volver; la rama no se mezcla nunca
```

Recuperarlo (en cualquier sesión, incluida esta):

```bash
bun run engine:fetch     # git fetch origin artifacts/wasm
bun run engine:attest    # opcional: fetch ya verifica antes de instalar
```

`engine-fetch` no instala por confianza:

1. Si ya hay un artefacto que verifica, no toca nada (salvo `--force`).
2. Sin `docs/wasm-artifact.json` no hay digest de referencia y **no instala**.
3. Trae el archivo a `static/wasm/mtg_engine_wasm.wasm.incoming`, calcula sha256
   y tamaño, y los compara con el manifiesto.
4. Si no coinciden, **borra el archivo temporal y no instala nada**.
5. Solo si coinciden lo renombra y corre la verificación completa (ABI incluida).
   Si esa verificación falla, **elimina el archivo instalado**.

Los cuatro caminos se probaron de verdad con un repositorio git desechable y
módulos wasm sintéticos: sin manifiesto, digest ajeno, digest correcto con ABI
inválida y trayecto completo correcto. Los dos últimos instalan o descartan
según el ABI, no según el nombre del archivo.

## 6. Por qué el binario no se versiona en `main`

- Son ~46 MB; cada recompilación infla el historial para siempre.
- El binario es *derivado*: no debe sobrevivir a un cambio de `Cargo.lock` ni de
  fuentes de Phase, y `engine:attest` lo detecta.
- La rama `artifacts/wasm` es descartable: se puede borrar y volver a publicar
  sin tocar el historial del proyecto.

**Un binario de procedencia desconocida no se instala nunca**, ni siquiera para
"probar rápido": el manifiesto registra qué Phase y qué flags lo produjeron, y
si no hay manifiesto, no hay binario.

## 7. Qué sigue cuando el binario exista

En orden, sin saltos:

```bash
bun run engine:attest                  # 1. identidad + ABI
bun run engine:packcheck               # 2. partidas reales headless (sin navegador)
bun run test:e2e --grep "10E|combat|block"   # 3. E2E de juego: 10E, combate, bloqueo
bun run test:e2e                        # 4. las 27
```

Estado esperado en esta sesión mientras falte el binario: el cliente compila,
las pruebas unitarias pasan, y **todo E2E de juego falla con 404 del motor**.
Eso es una falla de infraestructura, no de código, y no se reporta como
resultado de juego.
