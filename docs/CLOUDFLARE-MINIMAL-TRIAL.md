# Ensayo mínimo Cloudflare: gates de aislamiento y transferencia

Fecha: 2026-10-30. Actualizado sobre `62c2f30`. Sustituye para cualquier ensayo
el procedimiento de REMOTE-WASM-BUILD-EVALUATION.md. **No ejecutado en Cloudflare.
No autorizado compilar Phase. No se han creado recursos ni credenciales.**

## Estado de los gates

| Gate | Estado |
|---|---|
| Plan Free real y ausencia de productos facturables en el ámbito | **Pendiente de evidencia del titular** |
| Workers y cuota Builds | **Revisados por el titular en solo lectura: 15 Workers, cuota no agotada** |
| Plan Free/Paid | **No visible con los permisos actuales; pendiente** |
| Configuración guardable sin despliegue inicial | **Pendiente** |
| Previews completamente desactivados | **Pendiente de configuración efectiva verificable** |
| Producción no ejecuta deploy tras fallo de build | **Pendiente: un único run mínimo** |
| Transferencia privada y descarga con hash idéntico | **Pendiente; solo después del gate anterior** |

El titular informa de revisión autenticada de solo lectura: hay 15 Workers y
la cuota Builds no está agotada. Se acepta esa información sin solicitar otro
inventario. Esos permisos no permiten ver Free/Paid: plan y garantía de coste
siguen pendientes. No ampliar permisos para inferirlos ni pedir tokens en chat.
Los límites publicados no son una auditoría de la cuenta.

## 0. Confirmaciones del titular ANTES de conectar o crear

Solicitar únicamente capturas/exportaciones **sin secretos**, o que el titular
haga las comprobaciones en su sesión autenticada:

1. Elegir un ámbito aislado y mostrar plan **Workers Free**, cuota Builds restante,
   suscripciones activas y si existe auto-upgrade/consumo facturable. No trial,
   Paid, R2 ni productos facturables usados por el ensayo. No cambiar facturación.
   Free publica 3.000 minutos/mes; Paid permite sobreconsumo cobrado [A]. Si no
   se puede excluir gasto adicional, **STOP**. No interpretar una alerta como cap.
2. Reutilizar la información ya revisada de los **15 Workers** y cuota disponible.
   No solicitar inventario completo nuevo, ni crear otra cuenta para repetir la
   revisión. Cualquier preparación futura se limita al proyecto nuevo aprobado;
   no modificar Workers, proyectos, integraciones o permisos existentes.
3. GitHub: comprobar si la App Cloudflare **ya tiene** acceso a `vanTheodore/mtg`.
   Si no, **STOP**: agregar el repo cambia permisos existentes y requiere una
   autorización específica nueva. No ampliar la instalación, reinstalarla ni
   revocar accesos de otros proyectos. La aprobación del ensayo no elimina
   esta condición. El acceso de lectura de la App para clonar código privado es
   distinto de un secreto GitHub de escritura para exportar (ausente en etapa 1).
4. Inspeccionar el asistente **sin confirmar Connect/Create/Deploy** y comprobar
   que permite guardar build, deploy y preview seguros antes de cualquier run.
   Si requiere publicar un Worker de ejemplo o un primer deployment para tener
   un Worker tag/triggers, **STOP sin crear ni conectar**. No sortearlo por API.
   La documentación de Builds API parte de un Worker identificado por tag [C];
   no demuestra que pueda existir ese contenedor de configuración sin deployment.
5. Si todo lo anterior se prueba, confirmar la creación de **solo un contenedor
   de configuración dedicado** `mesa-wasm-build-only`, sin código publicado,
   rutas, dominios, bindings, cron ni tokens permanentes. Si la plataforma crea
   automáticamente una credencial persistente o de alcance amplio, STOP antes
   de aceptar. No reutilizar tokens existentes. No añadir un secreto de exportación.

No hay cambios previstos en objetos preexistentes. Reutilizar el inventario ya
disponible y limitar las comprobaciones futuras a configuración y actividad del
ensayo; si hay un cambio inesperado en objetos existentes, detener y reportar,
no intentar una «reparación» que afecte otros proyectos. No es posible demostrar
este punto solo revisando los archivos del repo.

## 1. Etapa A: demostrar el bloqueo, SIN secretos de escritura GitHub

No instalar Rust, Bun, deps ni ejecutar código de Mesa. Desactivar install
automático (`SKIP_DEPENDENCY_INSTALL=1`). Desactivar cache y automatismos ajenos
al ensayo. Solo código fijo, sin dump de env ni `set -x`.

Configuración de los comandos (si la UI no acepta estos comandos, STOP):

```sh
# Build command
printf 'MESA_TRIAL_BUILD_START\n'
printf 'MESA_TRIAL_INTENTIONAL_FAILURE rc=42\n'
exit 42
```

```sh
# Deploy command: centinela, NUNCA invoca Wrangler
printf 'MESA_TRIAL_FORBIDDEN_PRODUCTION_DEPLOY_REACHED\n'
exit 97
```

### Previews desactivados; un solo run de producción

Antes de cualquier build futuro, comprobar en configuración efectiva que los
preview builds están **deshabilitados por completo**: sin trigger preview activo,
reglas wildcard de ramas alternativas ni mecanismo de preview automático que
pueda publicar. Guardar evidencia del estado deshabilitado (UI y, si ya está
accesible en solo lectura, listado/configuración de triggers). Campo Preview
command vacío o no haber visto URLs **no demuestra** desactivación.

No ejecutar un run preview ni reactivar previews para probarlos. La conclusión
será «previews desactivados», no «fallo de build probado en preview».
Si no se puede verificar la desactivación total, STOP y volver a consultar;
no reemplazar este ensayo por dos runs automáticamente.

El centinela de deploy es defensa adicional: incluso si se alcanza el paso
prohibido no publica nada, y su ejecución implica que **el ensayo falló**.
No basta con que el resultado global sea rojo ni con no encontrar una URL.

Tras confirmar plan y configuración segura, y obtener aprobación para crear el
proyecto, usar un único run por trigger de producción del proyecto dedicado:
`arena/5f317145-mtg`, con SHA completo fijado. No crear/cambiar ramas ni construir
`main`. Nada de build todavía en la preparación actual.

Guardar por run: build UUID, SHA, trigger UUID/tipo, configuración efectiva,
horas UTC, log completo y estado de cada fase. Exigir:

- Build ejecutado y terminado en error 42 con ambos marcadores propios.
- Fase deploy correspondiente explícitamente omitida/no iniciada (si el API/UI
  no da estado por fase, la ausencia del centinela no es prueba suficiente).
- Ningún centinela prohibido presente en el log de ejecución. El texto puede
  aparecer en la configuración o eco del comando: distinguirlo de su ejecución.
- Historial de versiones/deployments/previews del proyecto sin nuevos registros;
  inventario de objetos existentes sin cambios y sin llamadas de publicación.

Descargar logs desde la sesión autenticada y compararlos con lo mostrado.
Cloudflare documenta 90 días de retención de build/logs [A], y endpoint
`GET /accounts/{account_id}/builds/builds/{build_uuid}/logs` [C]. Es una lectura;
usar IDs reales descubiertos, no inventados. No crear un token amplio solo
para leer si el titular puede exportar desde dashboard. SHA-256 de las evidencias
exportadas; registrar estado final **pendiente/aprobado/fallido**, no «pasó» sin datos.

**Etapa B prohibida hasta verificar previews desactivados y aprobar el único
run de producción.** Desactivar el trigger de ensayo tras el run
para no dispararlos por los pushes documentales de este PR.

## 2. Etapa B: archivo pequeño y credenciales temporales mínimas

Solo después de A: confirmar explícitamente crear una release **borrador privada**
de este repo, sin publicarla ni marcar latest; nunca Pages/R2/almacenamiento nuevo.
No crear una App ni claves permanentes para este ensayo.

Si existe ya un mecanismo autorizado de token efímero, usarlo solo para este
repo con caducidad suficiente para un run corto (objetivo ≤1 hora). La API de
release assets requiere Contents write: **no existe aquí una garantía de token
«solo subir este asset»**. Ese permiso puede modificar el repo; el titular debe
aceptar ese alcance o STOP. No usar ni exponer las credenciales GitHub de Arena.
Si generar el token requiere ampliar una App/integración existente, STOP y pedir
permiso por separado. No presentar un token permanente como temporal por prometer
borrarlo después.

Guardar la credencial solo en secrets del proyecto NUEVO y solo durante B. El
comando fijo genera `probe.txt` con identificador de run y SHA de Mesa (sin
secretos), calcula bytes y SHA-256, sube con nombre único a la release aprobada,
y descarga autenticado a otro archivo para comparar. El host de upload se fija
a `uploads.github.com`; no enviar Authorization a destinos arbitrarios ni seguir
redirecciones de upload. Descargar por cliente autenticado autorizado.

Después descargar también desde el entorno que ejecutará E2E. Si Arena bloquea
el redirect, el titular puede descargar y adjuntar el archivo aquí: registrar
ese paso manual. Eso prueba recuperación con intervención, **no automatizada**.
Comparar SHA y bytes en los dos extremos; hash de solo la copia origen no basta.

Exportar logs/status y terminar el build con error deliberado; el mismo gate de
A sigue activo. Revocar al terminar o fallar, eliminar secret del proyecto,
comprobar que ya no autentica y desconectar triggers. Borrar el asset de prueba
solo tras preservar evidencia y con permiso del titular. No probar con WASM.

## 3. Logs/métricas ante error y timeout: protocolo corregido

La receta anterior con `set -e` perdía la fase de exportación al primer error.
No se ejecutará esa receta. Para un FUTURO build, aún no autorizado:

- Supervisor fuera del proceso hijo; tee a log y stdout del proveedor desde el
  inicio. Registrar cada 10 s UTC, fase, elapsed, memoria RSS del árbol si es
  accesible, MemAvailable y disco. Nada de env completo, credenciales ni URLs
  firmadas. Métrica no disponible se marca null, no cero.
- Deadline **global** desde inicio del job, incluyendo instalación, no 14 min
  adicionales después del setup. Detener trabajo antes de 17 min; TERM, gracia
  corta, KILL al grupo del hijo si hace falta, sin matar supervisor. Reservar
  hasta 2 min para empaquetado/exportación antes de los 20 min del proveedor.
- Capturar código real del hijo (`PIPESTATUS` si se usa tee); no ocultarlo con
  `|| true`. `trap EXIT/TERM/INT` idempotente para finalización de mejor esfuerzo.
  Registrar señales, timeout, último heartbeat y errores de upload. Exportación
  con timeout y reintentos acotados; fallo de exportación nunca es éxito.
- Durante B comprobar recuperación de logs/status en caso de fallo deliberado y
  **timeout interno corto** (p.ej. hijo sleep 5 s, límite 2 s). Esto no requiere
  rustc ni llegar al límite de 20 min. No usar el archivo probe como motor.
- Un observador fuera del contenedor (sesión del titular o herramienta aprobada)
  captura/persiste logs recibidos y estado final del proveedor. En A no necesita
  secreto en el runner. En B, snapshots de evidencia a destino privado aprobado
  pueden conservar avances; se subirán con nombres diferentes de artefacto final.
- Al error/timeout: exportar SOLO evidencia y métricas con `complete=false`,
  `reason`, `exit_code` (null si desconocido). Nunca empaquetar automáticamente
  `target/`, `.wasm` de trabajo o archivos de una ejecución anterior.

**Límite físico:** SIGKILL, caída del host o deadline duro pueden impedir todo
trap, último upload y flush. No existe garantía de conservar el último byte.
Los logs ya recibidos por Cloudflare y el observador externo son el respaldo;
registrar la truncación. Sin acceso probado a esos logs después de matar el hijo,
la preservación queda pendiente y no se autoriza el build largo. No prometer
retención independiente basada solo en el filesystem efímero.

### Gate futuro de un WASM completo (no implementar/ejecutar ahora)

Cada run usará directorio limpio y salida exclusiva. Solo tras exit 0 del build,
validación del módulo, procedencia/fuentes/lockfile y pruebas ABI/protocolo se
podrá preparar un candidato con tamaño y hash. El candidato se transfiere como
no aprobado; descargar y revalidar bytes/hash antes de emitir un registro final
`complete=true` que identifique assets exactos. Upload interrumpido sin ese
registro nunca es consumible. Los consumidores rechazan assets sin registro o
con hash distinto; un build fallido no sube ningún WASM. No confiar en extensión,
exports aislados ni presencia de un archivo no vacío como prueba de completitud.

## 4. Próxima acción exacta requerida del titular

**Ahora solo dos confirmaciones, sin crear ni conectar nada:**

1. En una sesión que ya permita ver el plan, confirmar **Free o Paid** del ámbito
   revisado y las condiciones de cobro aplicables. No repetir inventario ni cuota,
   cambiar plan, facturación o permisos. Si no se puede consultar, queda pendiente.
2. Inspeccionar la pantalla PREVIA a conectar/crear y confirmar que permite guardar
   build seguro, deploy centinela y previews desactivados **antes de ejecutar
   cualquier build**, no solo antes de publicar. No pulsar Connect/Create/Deploy.
   Si obliga a un run/deployment inicial, STOP sin crear recursos.

El acceso GitHub ya concedido y cualquier token requerido se comprobarán antes
de una eventual conexión, sin ampliar integraciones ni crear credenciales
permanentes. No se requiere hacerlo ahora para estas dos confirmaciones.

Con esas evidencias decidiremos si se puede realizar A cumpliendo las condiciones.
No hace falta ningún secreto GitHub de escritura para A. B exige confirmación
separada de release borrador y alcance/caducidad del token. **No solicitado ni
permitido el build completo de Phase. PR #1 abierto, sin merge ni despliegue.**

Fuentes oficiales consultadas:

- [A] https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/
- [B] https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
- [C] https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/

B describe build seguido de deploy y comandos production/preview distintos;
no sustituye la evidencia de previews desactivados y del único run de producción. C describe tokens API user-scoped y
permisos; no es autorización para crearlos ni garantía de creación sin deploy.
