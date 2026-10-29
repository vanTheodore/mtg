# Cómo ejecutar la verificación en navegador

Este documento existe porque el entorno donde se desarrolló Mesa **no tiene
navegador**: ni binario, ni librerías del sistema, ni acceso al CDN del que
Playwright descarga Chrome. Todo lo demás (pruebas Bun, motor de datos, catálogo)
sí se ejecuta; lo que falta es exactamente «ver la pantalla».

La ruta más corta para tener evidencia visual es una máquina **Windows con
Microsoft Edge**, sin descargar nada:

```powershell
bun install
bun run engine:build          # genera static/wasm/mtg_engine_wasm.wasm (ver §3)
bun scripts/preflight.ts      # dice qué falta, si algo falta
$env:MESA_BROWSER='msedge'
bun run test:e2e
```

`MESA_BROWSER=msedge` hace que Playwright lance el Edge **ya instalado** con
`channel: 'msedge'`; `chrome` hace lo mismo con Chrome. Con cualquiera de los dos
no se consulta el CDN de Playwright, que es lo único bloqueado en el sandbox de
desarrollo.

## 1. Comprobar el entorno antes de gastar tiempo

```sh
bun scripts/preflight.ts            # informe legible
bun scripts/preflight.ts --json     # para CI
```

Comprueba, en este orden: artefacto WASM (existe, tamaño, firma `\0asm`), índice
de catálogo, pack 10E, artefactos de cobertura, navegadores de Playwright, Edge y
Chrome instalados, y egress al CDN. Sale con código 1 si no se puede ejecutar el
E2E, así que sirve como puerta de CI.

Salida real en el sandbox de desarrollo (2026-10-29):

```
  ✘ Motor WASM publicado             falta static/wasm/mtg_engine_wasm.wasm (artifact generado, no versionado)
  ✔ Índice de catálogo               static/data/catalog/index.json
  ✔ Pack 10E                         static/data/catalog/packs/10e.json
  ✔ Cobertura por carta              static/data/catalog/coverage
  ✘ Navegadores de Playwright        /home/user/.cache/ms-playwright: vacío o inexistente
  ✘ Microsoft Edge instalado         no se encontró en las rutas habituales
  ✘ Google Chrome instalado          no se encontró en las rutas habituales
  ✘ CDN de navegadores accesible     ECONNRESET
```

Y el intento real de descarga:

```
$ bun x playwright install chromium
Downloading Chrome for Testing 156.0.8078.4 … from https://cdn.playwright.dev/…
error: Socket is closed   code: "ERR_SOCKET_CLOSED"
```

## 2. Elegir navegador

| `MESA_BROWSER` | Qué lanza | Cuándo usarlo |
|---|---|---|
| *(sin definir)* | Chromium de Playwright | máquina con egress; requiere `bun x playwright install chromium` |
| `msedge` | Microsoft Edge instalado | **Windows**, ruta recomendada |
| `chrome` | Google Chrome instalado | Windows/macOS/Linux con Chrome |
| — | `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/ruta/al/chrome` | build propio o stripped |

`PLAYWRIGHT_CHROMIUM_LIB_PATH` añade un directorio a `LD_LIBRARY_PATH` cuando el
sistema no aporta las bibliotecas que Chromium necesita (`libnss3`, `libgbm`,
`libxkbcommon`, …).

Comprobación sin navegador (funciona en cualquier máquina):

```sh
MESA_BROWSER=msedge bun x playwright test --list   # 25 tests en 9 archivos
```

## 3. El artefacto WASM no está en el repositorio

`static/wasm/mtg_engine_wasm.wasm` (≈46 MiB) es un artefacto generado y está en
`.gitignore`: **no se versiona**. Sin él la app arranca pero no juega
(`No se pudo descargar el motor WASM (404). Ejecuta bun run engine:build.`).

### Ruta A — máquina con acceso a crates.io

```sh
rustup toolchain install nightly-2025-03-02        # 1.87.0-nightly
rustup target add wasm32-unknown-unknown
bun run engine:build                                # cargo build + copia a static/wasm/
bun run engine:optimize                             # opcional: Binaryen (wasm-opt)
bun scripts/preflight.ts                            # debe decir ✔ Motor WASM publicado
```

`scripts/build-engine.ts` fija `-Zcrate-attr=feature(if_let_guard)`,
`-Zcrate-attr=feature(let_chains)`, `-Zthreads=1`, `-Zmir-opt-level=0` y
`--cfg getrandom_backend="custom"`; Phase los necesita y no se le tocan las
reglas. Compila con `-j1` a propósito (2 GB de RAM bastan, más no).

### Ruta B — sandbox sin crates.io (lo que se hizo aquí)

Ni `crates.io`, ni `index.crates.io`, ni `static.crates.io` son alcanzables desde
el sandbox de desarrollo; sí lo son `registry.npmjs.org` y `github.com`. La
cadena que funciona:

1. **Toolchain desde npm** (`@rustbin/*`, 1.87.0-nightly, el mismo commit que el
   resto de la fase):

   ```sh
   for p in rustc cargo rust-std-nightly-x86_64-unknown-linux-gnu; do …; done
   # tarballs: @rustbin/rustc-nightly-x86_64-unknown-linux-gnu,
   #           @rustbin/cargo-nightly-x86_64-unknown-linux-gnu,
   #           @rustbin/rust-std-nightly-{x86_64-unknown-linux-gnu,wasm32-unknown-unknown}
   ```

   Cada tarball trae `package/{bin,lib,libexec,share}` + `rust-std-*/lib/rustlib`;
   se fusionan en un prefijo único y `rustc -V` responde
   `1.87.0-nightly (f4a216d28 2025-03-02)`. Verificado en esta ronda.

2. **Dependencias**: las 71 crates de `Cargo.lock` hay que traerlas de sus
   repositorios de GitHub (tag = versión) y montar un directorio vendor con
   `.cargo-checksum.json` (`{"files":{}}`) más un `[source]` de reemplazo:

   ```toml
   [source.crates-io]
   replace-with = "mesa-vendor"

   [source.mesa-vendor]
   directory = "/ruta/vendor"

   [net]
   offline = true
   ```

   `cargo build … --offline --locked --config <ese archivo>` la usa.

3. `bun run engine:build` con `CARGO_OFFLINE=1`.

**Estado de esta ronda**: el toolchain (paso 1) se instaló y verificó; el
vendoring de las 71 crates (paso 2) **no se completó**, así que el `.wasm` sigue
sin generarse aquí y ningún resultado de esta fase depende de haberlo tenido.
En una máquina normal la Ruta A lo resuelve en un comando.

## 4. Qué ejecutar y qué mirar

```sh
MESA_BROWSER=msedge bun run test:e2e                       # 25 specs, ~15-25 min
MESA_BROWSER=msedge bun x playwright test ui-deck-10e.spec.ts
MESA_BROWSER=msedge bun x playwright test --grep "bloqueo real" --headed
```

Las capturas de fallo caen en `test-results/`; los traces se abren con
`bun x playwright show-trace <archivo>.zip`.

Recorrido manual para mirar con ojos de jugador (`bun run dev`, abrir
`http://localhost:5173`):

1. **Importar**: «Mis mazos» → «Importar lista» → pegar un mazo de 40 cartas de
   décima → «Convertir lista». Cada línea debe decir `se descargará`, `en memoria`,
   `limitaciones` o `no está en el índice`.
2. **Descarga selectiva**: DevTools → Network. Al pulsar «Jugar con este mazo»
   deben aparecer `packs/10e.json?v=<sha256>` y nada más que el pack que el mazo
   necesita.
3. **Cobertura**: con `Arcane Teachings` en el mazo, el aviso debe nombrarla y el
   botón debe quedar bloqueado hasta marcar «Permitir 1 carta(s) con limitaciones
   conocidas».
4. **40/40**: tras iniciar, el aviso debe decir `Motor: 40 / 40 cartas cargadas
   por asiento (40 pedidas)`.
5. **Cartas e imágenes**: sin red, cada carta muestra su cara de reserva
   (nombre, coste, tipo, texto) y el botón «Reintentar imagen»; con red, el arte.
6. **Acciones**: pulsar una tierra de la mano (selecciona), pulsar otra vez
   (la juega). Pulsar una criatura dos veces la lanza. Enter y Espacio hacen lo
   mismo con teclado.
7. **Combate**: atacar → confirmar; en la ventana de bloqueo, pulsar una
   bloqueadora y después el atacante: la lista debe mostrar «X bloquea a Y» y,
   al confirmar, el registro «X bloquea a Y.»
8. **Paso de asiento**: activar «Confirmar cada cambio de asiento»; el tablero
   queda `inert`, tapado y sin la mano del rival.
9. **Resultado**: jugar hasta `Jugador N gana`.
10. **Tamaños**: 320, 375, 390, 768, 1440 px con `visibility.spec.ts` o a mano;
    el objetivo es que ninguna carta quede cortada y que la mano siga siendo
    alcanzable.

## 5. Lo que este runbook no promete

- Que los E2E pasen a la primera: son 25 pruebas de UI sobre un motor real y
  nunca se ejecutaron en un navegador. La primera corrida es parte del trabajo.
- Que el arte de las cartas aparezca sin red: no hay egress a Scryfall desde el
  sandbox; el fallback es el comportamiento diseñado, no un defecto.
- Nada sobre rendimiento de pintado: `scripts/measure-interaction.ts` mide el
  trabajo del cliente (µs), no el layout ni el GPU.
