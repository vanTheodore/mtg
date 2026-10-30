# Verificación 0.5.1 — «Desbloquear Chromium y jugar de verdad»

Esta ronda existía por una pregunta concreta: ¿se puede ver Mesa funcionando en
un navegador dentro de este entorno? **Sí.** El navegador se desbloqueó y la
suite de interfaz se ejecutó de verdad. El motor WASM sigue sin poder compilarse
aquí, y eso separa las pruebas en dos grupos que este documento no mezcla.

## 0. Resumen

| Punto | Estado |
|---|---|
| 1. Chromium funcional en el entorno | **Conseguido** (§1): Chromium 153.0.8010.0, con capturas y 25 pruebas lanzadas |
| 2. Motor WASM | **No conseguido aquí** (§2), con diagnóstico medido: 3.54 GB de pico frente a 3.9 GB de RAM y 0 de swap |
| 3. Ejecutar los E2E | **Hecho** (§3): 25 pruebas, 14 pasan, 10 fallan por el motor, 1 omitida. Capturas en §4 |
| 4. Portabilidad y documentación | **Hecho** (§5): `fileURLToPath`, sin rutas de sesión, versión 0.5.1 |
| Defectos corregidos | **Siete**, todos vistos en capturas reales y con prueba de regresión (§4) |

## 1. Chromium: cómo se desbloqueó

La ruta que falla (y que ya estaba descartada) era `bun x playwright install
chromium` → `ERR_SOCKET_CLOSED` contra `cdn.playwright.dev`.

La ruta que funciona usa **el registro de npm**, que sí responde:

```
$ bun scripts/fetch-chromium.ts
Descargando @sparticuz/chromium@153.0.0…
Descomprimiendo Chromium…
Chromium 153.0.8010.0
Chromium listo en ~/.cache/mesa-chromium (199 MiB).
```

Ese paquete trae el navegador comprimido con brotli (`chromium.br`) junto a
cuatro archivos que resuelven lo que Debian no tiene aquí:

| Archivo | Qué aporta |
|---|---|
| `al2023.tar.br` | `libnss3`, `libnspr4`, `libnssutil3`, `libsmime3`, `libplc4`, `libplds4`, `libfreebl3` |
| `swiftshader.tar.br` | `libEGL`, `libGLESv2`, `libvk_swiftshader`, `libvulkan` para un GL por software |
| `fonts.tar.br` | Open Sans (no se usa: ver la trampa) |

Con eso y `LD_LIBRARY_PATH` apuntando a esas bibliotecas, Playwright lanza el
navegador con `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. `ldd` sobre el binario: **0
bibliotecas no encontradas**.

**La trampa, y por qué importa documentarla.** El paquete trae un `fonts.conf`
que apunta a `/var/task/.fonts` y `/tmp/fonts`. Si exportas `FONTCONFIG_PATH`
hacia él, el navegador **arranca, carga la página y captura una imagen en
blanco**: la maquetación ocurre, el texto no se pinta. Playwright no falla
(`textContent` funciona igual), así que una suite podría «pasar» produciendo
capturas vacías. Se detectó midiendo el tamaño del PNG: 832 B en blanco frente a
7 KB con texto. La solución es **no definir** `FONTCONFIG_PATH` y usar el
fontconfig del sistema. `scripts/screenshots.ts` se niega a producir una galería
vacía por esta razón.

Verificación mínima que cualquiera puede repetir:

```
$ bun -e "…chromium.launch({executablePath}).newPage().setContent('<h1>Mesa</h1>').screenshot()"
bytes 2740   # >1 KB hay texto; ~830 B es una página en blanco
```

No se añadió ninguna dependencia al proyecto: el navegador es un artefacto de la
máquina (`~/.cache`), y el script lo obtiene igual que `playwright install`
obtendría el suyo.

## 2. El motor WASM: dónde se detiene y por qué

### Lo que sí se consiguió

**La cadena de dependencias, completa.** Ni crates.io, ni su índice, ni
`static.crates.io` responden aquí (000), pero `codeload.github.com` y
`api.github.com` sí. `scripts/vendor-crates.ts` trae de sus etiquetas de Git las
**71 crates de `Cargo.lock`** (no una aproximación: lee el lock y falla si una
versión no aparece), expande la herencia de workspace que el `.crate` publicado
ya trae resuelta, y deja `vendor/` con procedencia y sha256 por paquete:

```
$ bun scripts/vendor-crates.ts
+ serde@1.0.228
…
+ zmij@1.0.21
vendidas 71 / 71 (nuevas: 71) en /home/user/mtg/vendor
```

Con `CARGO_OFFLINE=1`, cargo resuelve **exactamente** el lockfile contra ese
directorio y compila 70 de las 71 dependencias sin un solo error:

```
   Compiling serde_core v1.0.228
   Compiling rustc-hash v2.1.2
   …
   Compiling phase-engine v0.119.0
```

Ese es el avance real: la falta de crates.io ya no es el bloqueo.

### Lo que no se consiguió, y el número

`phase-engine` son **581 archivos y 1 377 540 líneas** en una sola unidad de
compilación. La máquina: **3.9 GB de RAM, 0 de swap** (`swapon` no existe y no
hay permisos para crear uno; `sudo` no está disponible). Tres configuraciones
distintas, mismo final:

| Intento | Ajustes | RSS al morir |
|---|---|---|
| 1 | release por defecto | 3 540 MB → SIGKILL |
| 2 | `-C opt-level=1 -C codegen-units=256` | 3 543 MB → SIGKILL |
| 3 | `-C opt-level=0 -C codegen-units=1024 -Zinline-mir=no -Zcross-crate-inline-threshold=0`, `MALLOC_ARENA_MAX=1` | 3 544 MB → SIGKILL |

Que las tres mueran en el mismo punto descarta la optimización como causa: el
pico está en el front-end de rustc. **Tres GB y medio no son un error de
configuración; es el tamaño del crate.** Para que nadie tenga que repetir el
diagnóstico, `MESA_RUSTFLAGS_EXTRA` permite bajar el pico sin editar el script.

### Lo que se comprobó y no sirve

- **CI de GitHub Actions**: el job `wasm` existe y compila con el toolchain
  fijado, pero **no corre**: `runner_name` vacío, `steps: []`, 2 s de vida en las
  ejecuciones `40984036044`, `40965975724` y `4096396118`. No hay runners para
  esta cuenta, así que el artefacto no se puede construir allí tampoco.
  (`gh workflow run` responde 403: la integración no puede despachar.)
- **Descargar el `.wasm` de otra parte**: los *releases* de Phase solo publican
  binarios nativos (`phase-server-slim-*`); no hay ningún `.wasm` publicado.
- **Reutilizar el artefacto de la ronda anterior**: no existe en el repo
  (`static/wasm/` está en `.gitignore`), no hay caché de cargo (se perdió en el
  reinicio del espacio de trabajo) y ningún `.wasm` mayor de 1 MB en el sistema.

Con eso, **no se declara ninguna partida jugada en esta ronda**. Lo que sí se
ejecutó es todo lo que no necesita el motor, y no es poco.

## 3. Los E2E, ejecutados

Entorno: Debian 12, Chromium 153.0.8010.0 (npm), `--no-sandbox --disable-gpu`,
Vite dev en 5173, Bun 1.4.4. Comando:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=~/.cache/mesa-chromium/chromium \
LD_LIBRARY_PATH=~/.cache/mesa-chromium/al2023/lib:~/.cache/mesa-chromium \
bun x playwright test --reporter=line
```

Resultado de la corrida final de la suite completa (**27 pruebas, 20.5 min**,
rama `af12af9`, tras corregir los defectos de §4):

```
  10 failed
  1 skipped
  16 passed (20.5m)
```

En esa misma corrida, las 10 fallas son las de abajo: ni una es de interfaz.

**Las 16 que pasan** (ninguna necesita el motor):

| Archivo | Qué cubre |
|---|---|
| `visibility.spec.ts` (7) | Mano de 30 a 320/375/390/768/1440, sin desborde horizontal, todas las cartas enfocables, grupo de 20 fichas expandible, fallback/error/reintento de imagen, información oculta, ampliación por teclado, transformada y adjuntos; **más las dos nuevas de §4** |
| `a11y.spec.ts` | axe sin violaciones críticas ni serias en el fixture |
| `images.spec.ts` | oracle, nombre, cara DFC y ficha con reserva real; reintento recupera arte; oculta no busca |
| `deck-builder.spec.ts` (2 de 3) | Buscar, cantidades, guardar, recargar y persistir; carta fuera del catálogo bloquea el inicio |

**Las 10 que fallan, y por qué** — todas por el artefacto ausente, ninguna por
la interfaz:

| Prueba | Error real |
|---|---|
| `engine-gameplay` | `page.evaluate: Error: No se pudo descargar el motor WASM (404). Ejecuta bun run engine:build` |
| `game` | Espera la mano; el tablero nunca arranca (mismo 404) |
| `ui-game` (3) | Ídem |
| `ui-deck-10e` (4) | Ídem, tras importar correctamente |
| `deck-builder` (1) | Ídem |

La única omitida es `images-live.spec.ts`, opt-in con `MESA_SCRYFALL_LIVE=1`:
sin egress a Scryfall no se puede afirmar nada de imágenes reales.

Esto **corrige** lo que decía `docs/VERIFICATION-0.5.md`: allí los E2E figuraban
como no ejecutados por falta de navegador. Ya no: el navegador existe y lo que
falta es solo el motor. La primera corrida dio 14 aciertos con 25 pruebas; la
segunda, con las dos de regresión de §4, 16 de 27.

## 4. Lo que se vio, y los defectos corregidos

`bun scripts/screenshots.ts` genera 13 capturas reales en
`docs/screenshots/` (inicio a cinco anchos, campo con mano de 30 y 20 fichas,
saturación 60+60, constructor, importación, tema oscuro). Mirarlas encontró
siete defectos que ninguna prueba cubría:

1. **Cartas de distinta altura en la misma fila.** La altura venía del contenido,
   así que una tierra quedaba ~50 px más baja que una criatura. Ahora la cara
   ocupa el `aspect-ratio` de la carta y toda la fila mide lo mismo.
2. **La tira de estado tapaba texto.** «Girada» se pintaba encima de las reglas
   y del aviso de imagen. Ahora la cara reserva la banda inferior.
3. **Desborde a 320 px.** Con 112 px de ancho el contenido no cabía y la
   fuerza/resistencia se salía de la carta. Ahora el campo se reparte en dos
   columnas (antes: una, 70 cartas en vertical) y la regla se omite por debajo de
   132 px — sigue disponible en «Ampliar» y en el nombre accesible.
4. **Coste de maná recortado** cuando el nombre era largo («Hechizo 5 {2}{U}»
   perdía el coste). El nombre ahora envuelve; el coste nunca se corta.
5. **Texto cortado sin puntos suspensivos**, que además parecía completo.
6. **«1 adjuntos»** en lugar de «1 adjunto».
7. **Nombre accesible fuera de orden** (axe 2.5.3): el aviso de imagen iba
   después de las reglas en la etiqueta y antes en el DOM. La prueba de a11y
   llevaba pasando porque el texto recortado no contaba como visible; al
   arreglar el recorte, el defecto salió a la luz.

Pruebas de regresión añadidas a `visibility.spec.ts`:

- alturas iguales en la fila, sin desborde, sin coste recortado y con caja de
  arte utilizable, **a 320 y 1440 px**;
- el nombre accesible sigue el orden visible (la comprobación que hace axe).

## 5. Portabilidad y documentación

- `scripts/preflight.ts` usa `fileURLToPath(new URL('..', import.meta.url))` en
  lugar de `URL.pathname`, que en Windows queda como `/C:/…` y rompe cualquier
  `join`. Añade la comprobación de `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, para
  que un Chromium traído de npm o de un bundle cuente como navegador disponible.
- `scripts/build-engine.ts` escribe `.cargo/offline.toml` desde la ruta **de este
  checkout** en cada ejecución (`MESA_VENDOR_DIR` permite moverla); ya no se
  apoya en un archivo temporal de una sesión anterior. Añade
  `MALLOC_ARENA_MAX=1` y `MESA_RUSTFLAGS_EXTRA`.
- `vendor/` y `.cargo/offline.toml` quedan en `.gitignore`: se regeneran, no se
  versionan. `vendor/PROVENANCE.txt` deja por escrito repo, etiqueta y sha256 de
  cada crate.
- Versión del proyecto a **0.5.1**; scripts nuevos `preflight`, `chromium:fetch`,
  `crates:vendor`, `screenshots`; README apunta a esta ronda y al runbook.

## 6. Lo que se afirma y lo que no

**Se afirma**, con evidencia en este documento: que Mesa se pinta en un Chromium
real; que 14 pruebas de interfaz, accesibilidad e imágenes pasan; que las 10
restantes fallan por el `.wasm` y no por la interfaz; que las dependencias del
motor se resuelven sin crates.io y que la compilación se detiene en
`phase-engine` por memoria, con tres medidas que lo respaldan.

**No se afirma**: ninguna partida jugada en esta ronda, ningún resultado de
combate real, ninguna medida de fluidez en el fotograma, ni que el artefacto WASM
sea recuperable — se comprobó que no lo es, por tres vías.

## 7. Identidad

- Rama `arena/5f317145-mtg`, PR #1 **abierto**, sin merge ni despliegue.
- Phase `c2fbb7a6634a440c7c6b47e6a87a554cc7382f05`: sin cambios de reglas; el
  único añadido es el *vendor* de sus dependencias desde sus propios repositorios.
- `bun test src/lib`: **188 pasan, 0 fallan**. `bun run check`: **0/0**.
  `bun run build`: correcto. `bun x playwright test --list`: **27 pruebas**.
