# 0.5.2 — motor WASM: bloqueo y alternativa mínima

## Estado

**Bloqueado por infraestructura; no listo para recomendar el merge.** No se ha
producido ni recuperado un WASM en esta ronda. No hay SHA-256, tamaño ni capturas
de partida nuevos que reportar. Phase y Cargo.lock permanecen intactos. No se
contrataron recursos, modificaron límites de gasto ni cambiaron la visibilidad
del repositorio. PR #1 abierto, sin merge ni despliegue.

## Alternativa remota posterior: pendiente de autorización

La evaluación de Workers Builds y Vercel Hobby, con procedimiento sin deploy,
cuotas y recuperación privada, está en
[REMOTE-WASM-BUILD-EVALUATION.md](REMOTE-WASM-BUILD-EVALUATION.md). Es investigación
documental; no se han creado recursos ni realizado compilaciones remotas.

## Entorno de más memoria investigado

El checkout partió del HEAD remoto del PR: `fa940c5275d2ff962800689b70a7fef16929c0f8`.

La alternativa accesible es el workflow existente `.github/workflows/ci.yml`,
que ya compila el puente Mesa con Rust `nightly-2025-03-02`, Bun 1.4.4,
`Cargo.lock` y Binaryen 132. **No está disponible ahora.** La anotación de
GitHub para el check `123830687772` del run `40984036044` dice literalmente:

> The job was not started because recent account payments have failed or your
> spending limit needs to be increased. Please check the 'Billing & plans'
> section in your settings

Consultado con:

```sh
gh api repos/vanTheodore/mtg/check-runs/123830687772/annotations
```

Esto precisa el diagnóstico anterior de «sin runner»: no demuestra ausencia de
runners, sino un bloqueo de facturación de la cuenta. No se cambia sin permiso.
La integración tampoco puede despachar workflows (403). No se dispone de otro
host de 8–16 GB ni de una API autorizada para ampliar este sandbox.

Localmente: MemTotal 4 034 452 kB, sin swap, CapEff=0; no hay un límite cgroup
editable accesible. No puedo aumentar memoria ni habilitar swap desde aquí.

## Intentos adicionales: resultado y corrección del diagnóstico

Se hicieron dos intentos locales adicionales, que **no resolvieron el bloqueo**:

- Una sonda pretendidamente de metadata terminó también en SIGKILL. **No prueba
  que el front-end sea el único responsable**: la invocación efectiva de cargo
  conservaba `--emit=dep-info,metadata,link` además de `--emit=metadata`.
- Heap glibc recortado y `-Zno-parallel-backend`, sin el servidor Vite residente:
  también SIGKILL, pico observado de aproximadamente 3,54 GiB.

No debí seguir explorando flags locales ante la petición de buscar más memoria.
No se repiten. Tampoco se afirma que 8 GB basten por medición: 8–16 GB es el
siguiente entorno candidato, no una compilación ya verificada.

## Alternativa mínima reproducible

Requiere una máquina **ya disponible/autorizada** con 8–16 GB o más, disco libre
y acceso a crates.io. No requiere contratar nada ni publicar el repositorio.
Usar el HEAD de esta misma rama, no crear otra rama para binarios.

```sh
# En el checkout del PR #1, limpio:
bun install --frozen-lockfile
rustup toolchain install nightly-2025-03-02 --profile minimal
rustup target add --toolchain nightly-2025-03-02 wasm32-unknown-unknown
export RUSTUP_TOOLCHAIN=nightly-2025-03-02
unset RUSTFLAGS MESA_RUSTFLAGS_EXTRA ENGINE_BUILD_STD ENGINE_OPTIMIZE
export CARGO_LOCKED=1
bun run engine:verify
bun run engine:build
```

Bun debe ser 1.4.4. El build aplica los feature gates y el backend de entropía de
Mesa sin editar Phase. `--locked` prohíbe resolver otras versiones. Esta ruta
usa la std precompilada; no requiere Binaryen porque no optimiza después del
link. Si se usa el workflow existente en su lugar, registrar también el
build-std y Binaryen 132 que ese workflow aplica.

### Identidad y compatibilidad antes de reutilizar

Guardar junto al WASM un registro de:

- SHA-256 y bytes del archivo **final**, tras cualquier optimización;
- commit Mesa y Phase `c2fbb7a6634a440c7c6b47e6a87a554cc7382f05`;
- salida de `bun run engine:verify`, hash de Cargo.lock;
- `rustc -Vv`, `cargo -V`, `bun --version`, SO/memoria;
- log completo, perfil release, flags efectivos de `scripts/build-engine.ts`,
  variables adicionales y cualquier postprocesado.

```sh
sha256sum static/wasm/mtg_engine_wasm.wasm Cargo.lock
wc -c < static/wasm/mtg_engine_wasm.wasm
rustc -Vv
cargo -V
```

Los exports `memory`, `mtg_alloc`, `mtg_free`, `mtg_request` son necesarios pero
**no suficientes** para demostrar que el motor es Phase y habla el protocolo
actual. Verificar las fuentes y ejecutar el módulo con el host real del cliente:

```sh
bun run wasm:packcheck -- --seed 7
# Consultar scripts/parity-trace.ts y scripts/parity-seeds.ts para comparar
# la misma secuencia/semillas con la referencia nativa, sin reciclar reportes.
```

No aceptar un binario por nombre, exports o un manifiesto autocertificado.
La evidencia de compilación y las partidas/paridad deben acompañar al hash.

### Conservación entre sesiones

No añadir el WASM a Git. Guardar el archivo, registro y logs en almacenamiento
privado duradero controlado por el usuario (o el artefacto del workflow existente
mientras siga vigente su retención de 7 días). No se ha comprobado todavía un
almacenamiento duradero accesible desde este sandbox; **recuperación pendiente**.

Para restaurar, transferir el archivo por un canal autorizado a
`static/wasm/mtg_engine_wasm.wasm`, comparar su SHA-256 con el registro de la
compilación confiable y volver a ejecutar `wasm:packcheck`. Si cambian Phase,
puente o Cargo.lock, reconstruir; no asumir compatibilidad.

## Orden de cierre cuando exista el artefacto

```sh
bun run test:e2e -- tests/e2e/ui-deck-10e.spec.ts tests/e2e/engine-gameplay.spec.ts
bun run test:e2e
```

Primero 10E, combate y bloqueo; después la suite completa de 27. Obtener capturas
por controles reales de mano/campo, selección de bloqueadoras y resultado;
probar que Phase aceptó el bloqueo y el final. Separar infraestructura, cliente
y motor al corregir fallos. Hasta entonces **no recomendar fusionar**.

## Comprobaciones de esta ronda

Tras retirar herramientas experimentales de distribución/verificación que no
aportaban un artefacto real, se mantienen los comandos existentes. No cambia la
versión aceptada 0.5.1: 0.5.2 no está completada.

Se reejecutaron 10 pruebas de visibilidad y 4 de a11y/imágenes: 14 pasan. La
prueba `engine-gameplay` falla inmediatamente con el 404 del WASM, no constituye
una partida. No se volvió a ejecutar la suite completa ni se obtuvieron capturas
de partida. La primera invocación visual sin la variable de ruta Chromium falló
por configuración; el reintento correcto es el resultado informado.
