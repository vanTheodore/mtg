# Por qué GitHub Actions no consigue runners

Estado al 2026-10-29. Todas las ejecuciones del workflow `Mesa CI`
(`.github/workflows/ci.yml`) terminan en fracaso **sin haber ejecutado un solo
paso**. Esto es una limitación de infraestructura de la cuenta/repositorio, **no
un fallo de código**: ninguna prueba, typecheck ni compilación llegó a correr.

## Evidencia

Ejecuciones registradas en `vanTheodore/mtg`:

| Run | Commit | Inicio | Jobs con runner | Resultado |
| --- | --- | --- | --- | --- |
| `40842762906` | `7363fcb` | 2026-10-29T08:31Z | 0 de 3 | failure |
| `40842871046` | `0de4e07` (push) | 2026-10-29T08:32Z | 0 de 3 | failure |
| `40891718672` | `0de4e07` (pull_request) | 2026-10-29T14:27Z | 0 de 3 | failure |

Salida de `gh api repos/vanTheodore/mtg/actions/runs/<id>/jobs` para la última
ejecución:

```text
Typecheck, unit tests and static build | concl=failure runner= steps=0 | 14:27:54Z->14:27:57Z
Native parity and explicit mechanics scenarios | concl=failure runner= steps=0 | 14:27:54Z->14:27:57Z
WASM build (pinned Rust, lockfile and Binaryen) | concl=failure runner= steps=0 | 14:27:54Z->14:27:57Z
Chromium integration and visual interaction | concl=skipped runner=null steps=0 | 14:27:57Z->14:27:57Z
```

Hechos que descartan un fallo del workflow o del código:

- **`steps=0`**: el runner nunca ejecutó `actions/checkout`. Un error de YAML, de
  dependencia o de compilación aparecería como un paso fallido, no como cero pasos.
- **`runner_name` vacío** en los tres jobs que sí se intentaron: a ningún job se le
  asignó máquina. Un job que falla *en* una máquina lleva nombre de runner.
- **Duración de 2–3 s** e inicio y fin prácticamente simultáneos: es el tiempo de
  expirar la asignación, no el de arrancar un contenedor.
- **Tercer job en `skipped`** (el de Chromium) porque depende de los anteriores.
- El YAML es válido: GitHub creó la ejecución, listó los cuatro jobs con sus
  nombres y aplicó la dependencia entre ellos, que es lo que define el archivo.

## Qué no se puede consultar desde aquí

`gh api repos/vanTheodore/mtg/actions/permissions` responde **403 Resource not
accessible by integration**. El token de la app no tiene administración sobre el
repositorio, así que no puedo leer si Actions está habilitado, si hay minutos
disponibles o cuál es el límite de gasto. Esas tres cosas son las causas típicas
de «job sin runner» en un repositorio privado:

1. Actions deshabilitado para el repositorio u organización.
2. Sin minutos de cómputo (plan gratuito de repositorio privado) ni método de pago.
3. Límite de gasto alcanzado o puesto a cero.

Ninguna se arregla cambiando el workflow, y **no voy a inventar la causa** sin
poder leer la configuración. Lo que sí queda descartado es el código.

## Qué haría falta para tener cobertura CI real

- Habilitar Actions y asignar minutos o un runner propio en
  *Settings → Actions → General* del repositorio.
- Con eso, la siguiente ejecución ya ejecutaría los cuatro jobs tal como están
  escritos: `bun install --frozen-lockfile`, procedencia del motor, typecheck,
  unitarias, build, compilación WASM fijada con Binaryen, paridad/escenarios
  nativos y Chromium.
- Para un runner autohospedado, cambiar `runs-on` por la etiqueta del runner; el
  resto del workflow no cambia.

## Cómo se evita convertir esto en una afirmación falsa

- El README y `docs/VERIFICATION-0.3.md` dicen explícitamente que **no hay
  cobertura CI**; este documento es la referencia única de ese estado.
- Ningún resultado de CI se cita como evidencia de pruebas. La evidencia son las
  ejecuciones locales listadas en `docs/VERIFICATION-0.4.md`, con su commit.
- Los jobs no se marcan `continue-on-error` ni se silencian: cuando haya runner,
  el semáforo será real.
