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

## 2b. Linux sin CDN: un Chromium que llega por npm

El CDN de Playwright no es la única fuente de un navegador. En un contenedor
Linux sin Edge ni Chrome instalados, y sin egress a `cdn.playwright.dev`, esto
funciona y es lo que se usó para verificar Mesa:

```sh
bun run chromium:fetch                            # ~/.cache/mesa-chromium
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=~/.cache/mesa-chromium/chromium
export LD_LIBRARY_PATH=~/.cache/mesa-chromium/al2023/lib:~/.cache/mesa-chromium
bun x playwright test --reporter=line             # 27 pruebas
bun run screenshots                               # docs/screenshots/, se niega a guardar imágenes vacías
```

**Estado real: funciona.** Chromium 153.0.8010.0, 25 pruebas ejecutadas en 20
minutos, 14 pasan y 10 fallan solo por falta del `.wasm`
(`docs/VERIFICATION-0.5.1.md`).

Qué hace el script: descarga `@sparticuz/chromium` (153.0.8010.0, 199 MiB
descomprimido) desde el registro de npm —el mismo HTTPS que usa `bun install`—
y descomprime `chromium.br`, `al2023.tar.br` (las bibliotecas que en Debian no
están: `libnss3`, `libnspr4`…), `swiftshader.tar.br` y `fonts.tar.br`. No añade
nada a `package.json`: el navegador es un artefacto de la máquina, no una
dependencia del proyecto.

**La trampa que costó una tarde**: el `fonts.conf` que trae el paquete apunta a
`/var/task/.fonts` y `/tmp/fonts`. Si exportas `FONTCONFIG_PATH` hacia él, el
navegador arranca, la página se "pinta" y **el texto no aparece**: las capturas
salen en blanco y Playwright da el test por bueno si no miras la imagen. La ruta
correcta es **no definir** `FONTCONFIG_PATH` y dejar que use
`/etc/fonts/fonts.conf` del sistema (DejaVu está instalado aquí). Comprobación
rápida de que hay texto:

```sh
bun -e "const { chromium } = require('@playwright/test'); (async () => {
  const b = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  const p = await b.newPage(); await p.setContent('<h1>Mesa</h1>');
  const png = await p.screenshot(); console.log('bytes', png.length); await b.close();
})()"   # >1 KB = hay texto; ~800 B = página en blanco
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
vendoring de las 71 crates de `Cargo.lock` (paso 2) **no se completó**, así que
el `.wasm` sigue sin generarse aquí y ningún resultado de esta fase depende de
haberlo tenido. La prueba de dónde se detiene, tal cual:

```
$ PATH=/home/user/tools/rust/bin:$PATH cargo build --offline --locked \
    --target wasm32-unknown-unknown -p mtg-engine-wasm --lib --profile release -j 1
error: no matching package named `indexmap` found
location searched: crates.io index
required by package `phase-engine v0.119.0 (/home/user/mtg/crates/phase-engine)`
```

En una máquina normal la Ruta A lo resuelve en un comando.

## 3b. Compilar sin crates.io: `vendor/`

Cuando `crates.io`, su índice y `static.crates.io` no responden pero GitHub sí,
las 71 dependencias de `Cargo.lock` se traen de sus etiquetas de Git:

```sh
bun scripts/vendor-crates.ts        # ~30 s, escribe vendor/ (28 MiB) y PROVENANCE.txt
CARGO_OFFLINE=1 bun run engine:build
```

`vendor/` y `.cargo/offline.toml` están en `.gitignore`: se regeneran, no se
versionan. El script lee `Cargo.lock` (nombres y versiones, sin excepciones),
busca en cada repositorio la etiqueta que corresponde a esa versión —o la de un
hermano del mismo repo, como `js-sys` bajo la etiqueta de `wasm-bindgen`—,
descarga `codeload.github.com/<repo>/tar.gz/<tag>` y copia el paquete al
directorio `vendor/<crate>/`. `PROVENANCE.txt` deja por escrito de qué
repositorio y etiqueta salió cada uno, con su sha256.

Lo que el script **tiene** que arreglar, y por qué (cada punto fue un error real
de cargo hasta que se resolvió):

| Problema | Qué hace el script |
|---|---|
| Una etiqueta de Git tiene el manifiesto **sin expandir** (`version.workspace = true`) | Lo expande desde el `[workspace.package]`/`[workspace.dependencies]` del repo, como haría el `.crate` publicado |
| `path = "../hermano"` deja de existir al copiar solo un paquete | Quita `path`; la versión la sigue fijando `Cargo.lock` |
| `dev-dependencies` con solo `path` (futures-core → `../futures`) | Las elimina y limpia las features que solo existían para activarlas |
| Manifiestos con `[target."cfg(any(...))".dependencies]` opcionales y nunca activables | Quita las de tabla de target que ninguna feature puede activar; una opcional normal **falla** en vez de perderse |
| Dependencias de plataformas que este build nunca resuelve (`r-efi`, `winapi-util`, `wasip2`) | Descarta las de tabla de target que **no están en `Cargo.lock`**: si el lock no la fija, no forma parte de esta compilación |
| `build = "build/build.rs"` (rustversion), `include_str!("../examples/...")` (winnow) | Conserva el árbol completo salvo `tools/`, `vendor/`, `target/`, `.github/`… (zerocopy trae 600 MB de eso) |
| Claves TOML como `[target."cfg(all(...))"]` | Las vuelve a emitir entrecomilladas; sin comillas el TOML es inválido |

## 3c. Cuando la máquina no alcanza: el límite real

Con `vendor/` completo la compilación **avanza** hasta `phase-engine` y ahí la
mata el OOM killer. No es un error de configuración, es tamaño:

- `crates/phase-engine/src`: **581 archivos, 1 377 540 líneas**, una sola unidad
  de compilación que rustc no puede partir.
- La máquina de este sandbox: **3.9 GB de RAM y 0 de swap** (no hay `swapon` ni
  permisos para crear swap).

Medido con `ps` durante tres configuraciones distintas, el proceso muere siempre
al mismo RSS, señal 9:

| Intentos | Ajustes | RSS al morir |
|---|---|---|
| 1 | release por defecto (`opt-level=z`) | 3 540 MB → SIGKILL |
| 2 | `opt-level=1 -C codegen-units=256` | 3 543 MB → SIGKILL |
| 3 | `opt-level=0 -C codegen-units=1024 -Zinline-mir=no -Zcross-crate-inline-threshold=0`, `MALLOC_ARENA_MAX=1` | 3 544 MB → SIGKILL |
| 4 | intento 3 + `--emit=metadata` (**sin** generación de código) | 3 385 MB → SIGKILL a los ~9 min |
| 5 | intento 3 + `-Zno-parallel-backend`, `MALLOC_TRIM_THRESHOLD_=0`, `MALLOC_TOP_PAD_=0` | 3 540 MB → SIGKILL a los ~24 min |

Que las cinco mueran en el mismo punto descarta la optimización como causa: el
pico está en el front-end, y 3.5 GB es simplemente la memoria que queda libre
antes de que el kernel elija una víctima. El intento 4 es el decisivo: aun
quitando LLVM del camino, el chequeo de tipos solo ya pide 3.39 GB. La matriz de
flags está agotada y no se repite. Detalle completo, y qué hacer en una máquina
con memoria: [`docs/ENGINE-ARTIFACT.md`](ENGINE-ARTIFACT.md).

`MESA_RUSTFLAGS_EXTRA` existe para esto: una máquina con poca RAM puede bajar
el pico sin editar el script.

  MESA_RUSTFLAGS_EXTRA="-C opt-level=1 -C codegen-units=256" CARGO_OFFLINE=1 bun run engine:build

Con 8 GB o más, `CARGO_OFFLINE=1 bun run engine:build` termina y escribe
`static/wasm/mtg_engine_wasm.wasm`. El artefacto **no se versiona**: se firma con
`bun run engine:artifact` (escribe `docs/wasm-artifact.json`) y se publica en la
rama `artifacts/wasm` para que otra sesión lo recupere con `bun run engine:fetch`,
que lo rechaza si el sha256, el tamaño o el ABI no coinciden.

## 3d. El binario como archivo único en una rama

Publicar desde la máquina que compiló:

```bash
git checkout --orphan artifacts/wasm
git add -f static/wasm/mtg_engine_wasm.wasm docs/wasm-artifact.json
git commit -m "engine artifact: $(sha256sum static/wasm/mtg_engine_wasm.wasm | cut -c1-16)"
git push origin artifacts/wasm
git checkout -            # la rama no se mezcla con main nunca
```

Recuperar en cualquier otra sesión:

```bash
bun run engine:fetch     # trae origin/artifacts/wasm y verifica antes de instalar
bun run engine:attest    # confirma digest, Phase, Cargo.lock y ABI
```

`engine:fetch` no instala nada si falta el manifiesto, si el digest no coincide
o si el módulo no expone el puente de Mesa; en esos casos borra el archivo
temporal. Probado con repositorio desechable y módulos sintéticos, en los cuatro
caminos (ver `docs/ENGINE-ARTIFACT.md` §5).

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
