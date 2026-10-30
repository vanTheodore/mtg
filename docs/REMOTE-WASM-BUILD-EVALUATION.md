# Compilar Mesa fuera del sandbox: Workers Builds y Vercel Hobby

Investigación documental: 2026-10-30. Base: HEAD de PR #1
`294b3829998f1d27cbc850e3c40266eb15cdaf19`. **No ejecutado en ninguno de los
proveedores. No se han creado proyectos, almacenamiento, tokens, releases ni
despliegues; no se ha tocado facturación.** No se hicieron builds locales.

> **Protocolo actualizado:** [CLOUDFLARE-MINIMAL-TRIAL.md](CLOUDFLARE-MINIMAL-TRIAL.md).
> Las etapas A/B y sus gates sustituyen la ejecución propuesta aquí. No se han
> verificado plan, permisos ni ausencia de despliegue inicial en la cuenta.

## Dictamen

**Workers Builds es candidato viable para un ensayo autorizado, no una solución
ya probada.** La memoria y el disco publicados eliminan el límite conocido del
sandbox; quedan por medir la instalación del toolchain y el build completo en
20 minutos. No se puede deducir duración contando 71 dependencias: Phase es el
crate dominante, y los tiempos bajo presión de RAM/OOM no son un benchmark.

**Vercel Hobby es reserva con más margen temporal**: 8 GB, 2 vCPU, 32 GB de disco
y 45 minutos. Solo para uso personal no comercial y sujeto a las restricciones
de autoría de commits/repositorios privados. No hace falta desplegar Mesa para
compilar; ambos productos están orientados a despliegues, por eso proponemos
cortar expresamente el build antes de publicar nada.

## 1. Qué está comprobado y qué no

| Punto | Workers Builds | Vercel Hobby |
|---|---|---|
| Memoria/disco | 8 GB / 20 GB, 2 vCPU Free [1] | 8 GB / 32 GB, 2 vCPU [7] |
| Tiempo | 20 min por build; 3.000 min/mes Free, 1 concurrente [1] | 45 min por build [8] |
| Imagen | Ubuntu 24.04 x86_64; curl, git y build-essential [2] | No presumir mismo SO/imagen; comprobar en el ensayo |
| Bun | Documentado override `BUN_VERSION`; fijar 1.4.4 y comprobar salida [2] | Instalar/fijar 1.4.4 si la imagen no la proporciona |
| Rust | No figura como runtime gestionado en la tabla: instalar rustup en HOME [2]; pendiente prueba de red/instalación | Instalar rustup en HOME; pendiente prueba real |
| Cargo.lock | `CARGO_LOCKED=1` hace que el script Mesa pase `--locked`; no cambiarlo | Igual |
| Git privado | App Workers & Pages con acceso solo al repo [3] | Verificar elegibilidad privada/autor de commit antes de importar [9] |
| Artefacto | Exportación explícita; no asumir un almacén descargable de resultados | Igual; no usar un deployment como almacén |

Rust `nightly-2025-03-02` y target `wasm32-unknown-unknown` son compatibles con
el procedimiento existente de Mesa (ya fijados por su CI), pero **no hay prueba
de instalación en Cloudflare ni Vercel**. La prueba debe validar `rustc -Vv`,
fecha/hash y `bun --version`; si hay discrepancia, parar, no sustituir por stable
ni actualizar dependencias. El host puede tener Node: no se añade ninguna
dependencia Node a la aplicación.

## 2. ¿Cabe en 20 minutos?

Desconocido. Presupuesto de admisión propuesto, no medición:

- Hasta 3 minutos para checkout/setup/rustup/target y fetch de dependencias.
- Hasta 14 minutos para `bun run engine:build` release, tal como está.
- Hasta 2 minutos para checksum, registro y exportación: objetivo total <19 min.

Si setup consume más, no se promete que el resto quepa. Un timeout debe exportar
al menos el log si hay tiempo, sin presentar un WASM parcial como resultado.
No optimizar con Binaryen en este primer ensayo; no compilar la std desde
fuentes; no ejecutar Chromium ni compilar la referencia nativa en el mismo job.
La paridad y los E2E se hacen después de recuperar el binario.

El caché documentado de Cloudflare cubre gestores JS y ciertas carpetas de
frameworks; **no incluye `~/.cargo`, rustup ni `target/`** [4]. No planificar que
un segundo build continúe el primero ni que un timeout preserve un objeto Rust.
No guardar `target/` disfrazado de caché Bun. Primer ensayo frío; máximo un
segundo intento solo si los datos del primero justifican un ajuste de setup.
Si Phase supera el plazo, pasar a evaluar Vercel (45 min), no más flags locales.

## 3. Aislarlo de los Workers existentes y evitar cargos

Condiciones **previas** a aprobar la ejecución:

1. Verificar plan y cuota reales. La tabla Free no convierte una cuenta Workers
   Paid en Free: Paid factura minutos adicionales sobre su inclusión [1]. Para
   garantía fuerte de cero gasto, usar un ámbito/cuenta Free independiente ya
   disponible o aprobar expresamente su creación; nunca cambiar el plan de la
   cuenta que contiene los Workers actuales. Si solo hay Paid, no declarar cero
   coste garantizado ni ejecutar bajo este procedimiento.
2. Tras aprobación, crear únicamente un proyecto/Worker de build dedicado
   `mesa-wasm-build-only`; **no reutilizar, renombrar ni desconectar** ninguno de
   los Workers actuales. No dominios, rutas, cron, bindings, KV, D1, R2, Queues,
   Containers ni secretos de producción. No instalar Wrangler en Mesa.
3. Autorizar la App de GitHub solo para `vanTheodore/mtg`. Si ya existe una
   instalación, añadir ese repo sin retirar otros permisos ni reinstalar la
   App: esa instalación es compartida con otros proyectos [3].
4. Restringir el trigger a `arena/5f317145-mtg`, no `main`; previews y triggers
   automáticos adicionales deshabilitados. Si la UI exige llamar a esta rama
   «production branch», eso no autoriza un deploy: el gate siguiente lo impide.
5. Antes de conectar o guardar algo que lance el primer build, comprobar que
   los comandos seguros pueden guardarse **antes** de que se ejecute. Si el
   asistente fuerza un primer deploy o no deja fijar el gate, **abortar**: no
   pulsar «Deploy» confiando en arreglarlo después. Una alternativa por API
   requeriría aprobación separada y comprobación del esquema vigente.
6. No compartir tokens de Cloudflare con otros servicios. La configuración
   permite token autogenerado de despliegue [5]: inspeccionar su alcance y
   rechazar permisos que expongan los Workers existentes. Una cuenta Free
   aislada limita el radio de daño; proyecto distinto en misma cuenta no equivale
   a aislamiento IAM. No podemos verificar permisos/planes de tu cuenta aquí.
7. Límite operativo: un ensayo, máximo 20 min; desactivar trigger al terminar.
   Free comparte su cuota/concurrencia entre builds de la cuenta: no saturar
   proyectos existentes. No upgrades, add-ons ni reintentos en bucle.

### Cero despliegues, incluidos previews

Workers Builds ejecuta build primero y deploy después; por defecto el segundo
es `npx wrangler deploy`, y los previews también crean recursos [5]. No usar
`versions upload` ni `--dry-run` como sustituto de un aislamiento seguro.

El comando de build debe ejecutar el procedimiento de §4 y **terminar siempre
con código distinto de cero**, incluso después de exportar con éxito:

```sh
bash procedimiento-aprobado.sh
rc=$?
printf 'MESA_BUILD_ONLY: resultado=%s; deploy deliberadamente bloqueado\n' "$rc"
exit 1
```

Configurar también deploy y preview como `exit 1` si la plataforma lo permite;
no basar la garantía solo en que acepte comandos no-Wrangler, porque eso no está
prometido por la documentación. Si falla setup, upload o timeout, el build
igualmente falla y no pasa a deploy. El dashboard quedará **rojo a propósito**;
la evidencia de éxito son archivo exportado + hash + log, no el check verde.
Este comportamiento de separación debe confirmarse primero en un ensayo mínimo
sin secretos y sin compilar, después de autorizar la creación del proyecto.

## 4. Receta retirada: no ejecutar

Se retira la receta de compilación anterior: `set -e` podía saltarse la
exportación de evidencia al fallar el build. No se autoriza Phase todavía.
El protocolo corregido está en [CLOUDFLARE-MINIMAL-TRIAL.md](CLOUDFLARE-MINIMAL-TRIAL.md):
supervisor, deadline global, logs en streaming, finalización de mejor esfuerzo
y respaldo externo para SIGKILL/timeout duro; ningún WASM de un build fallido.
Primero etapa A sin secretos de escritura GitHub, después B con archivo pequeño
y credencial efímera. No ampliar instalaciones GitHub existentes sin permiso.

## 5. Conservar y recuperar sin publicación ni almacenamiento facturable

Propuesta preferida: **assets de una release borrador del repo privado**,
con aprobación específica. No añadir binarios a Git, nuevas ramas ni R2. GitHub
documenta assets de menos de 2 GiB y sin límite total de tamaño/banda para
releases [10]. Un WASM del tamaño histórico de Mesa cabe holgadamente; su tamaño
real debe medirse, no copiarse de un informe antiguo.

Procedimiento posterior a aprobación:

1. Crear un borrador identificado por SHA Mesa (sin publicarlo, sin marcar latest,
   sin mover main ni fusionar). Esta creación **no se ha hecho**. Usar el SHA de
   la rama actual como target si hace falta; ningún nuevo branch.
2. Dar al runner una credencial temporal limitada al repo privado y el permiso
   mínimo que requiera subir assets (GitHub contents write); ese permiso no es
   «solo uploads», por lo que exige confianza en el build y caducidad/revocación.
   No reutilizar token de producción ni enviar credenciales por chat. Guardar
   en build secrets, nunca en log; no pasarlo al compilador si puede separarse
   la etapa de exportación. Sin credencial autorizada, no ejecutar.
3. Subir mediante API HTTPS autenticada los tres archivos a nombres únicos por
   SHA + build ID: WASM, evidencia comprimida y checksum. Usar el `upload_url`
   real retornado por GitHub, sin su plantilla `{?name,label}`; con curl
   `--fail-with-body --retry 0 --data-binary @archivo`, content-type binario,
   Authorization secret y nombre URL-encoded. No sobrescribir assets anteriores.
   Esta es una operación externa dentro del build, **no un deploy de Worker**.
4. Descargar con autenticación y comparar bytes y SHA-256 antes de instalar.
   Ejemplo desde una máquina autorizada con `gh`:

   ```sh
   gh release download "$APPROVED_TAG" --repo vanTheodore/mtg \
     --pattern "$EXACT_ASSET_NAME" --dir recovered
   ```

5. **Prueba de recuperación obligatoria antes de gastar tiempo en rustc**:
   subir/descargar un archivo de prueba de pocos bytes a ese borrador, desde el
   runner y desde el entorno que ejecutará los E2E. Borrarlo tras comparar hash.
   Los assets GitHub redirigen a hosts que Arena no tiene permitidos; `gh` no
   elude esa restricción. Si aquí no se pueden recuperar, el usuario deberá
   descargar en un cliente autorizado y adjuntar los archivos a esta sesión.
   Si ese traspaso no es aceptable, esta ruta queda bloqueada; no prometer
   recuperación automática ni cambiar egress/billing para forzarla.
6. Mantener privado el repo y el borrador, no activar Pages/URLs públicas. Tras
   recuperar el artefacto revocar la credencial de upload y desconectar el trigger.

R2 no es la elección por defecto: exige suscripción/checkout y factura uso
mensual [11]. Estar bajo la franquicia no es una garantía de coste cero. No se
creará bucket ni se activará R2 para este ensayo. El caché de build tampoco es
archivo duradero: expira y no cubre Cargo [4].

Hash y exports solos no certifican el motor. Antes de E2E hay que contrastar
Phase/fuentes/lockfile y ejecutar el puente con los imports del cliente y su
protocolo actual: `bun run wasm:packcheck -- --seed 7`, y paridad disponible con
misma semilla/acciones. Un error de ABI/import/protocolo es incompatibilidad,
no «ya tenemos motor».

## 6. Reserva: Vercel Hobby

Ventaja: 45 min con 8 GB, más margen que Workers Builds [7][8]. Condiciones:

- Hobby real, no trial Pro ni equipo Pro; uso personal no comercial [7].
- El repo actual es privado de propietario tipo User (comprobado por API), pero
  Hobby verifica autoría de commits en repos privados; los commits del agente
  pueden no ser elegibles. No falsificar autoría ni cambiar visibilidad para
  sortearlo. Revisar vinculación/elegibilidad; si exige Pro, parar [9].
- Tras aprobación, proyecto dedicado sin dominios ni secretos de otros proyectos,
  triggers controlados y comando de build que exporte y salga 1 antes de producir
  salida desplegable. Configurarlo **antes del primer build automático**; abortar
  si la importación impone deploy. No usar `vercel --prod` ni output público.
- Reutilizar toolchain/lockfile/procedencia/asset privado del procedimiento
  anterior. No suponer que un preview es privado por defecto ni usarlo de almacén.
- Confirmar instalación de Bun/Rust y exportación con prueba mínima; reservar
  margen de upload dentro de 45 min. Hobby pausa recursos al superar cuotas,
  en vez de contratar automáticamente Pro [7]; no activar almacenamiento/add-ons.

## 7. Decisión solicitada y criterios de salida

**Recomiendo autorizar primero solo el ensayo mínimo Cloudflare**, no el build
largo: ámbito Free aislado, proyecto dedicado sin deploy, acceso a este repo,
release borrador privada y prueba de ida/vuelta. Si no se puede garantizar uno
de esos puntos, no crear recursos restantes ni empezar a compilar.

Solo tras verificarlo, autorizar un build frío de hasta 20 min. Éxito significa
WASM completo recuperado con procedencia y SHA, no check verde. Si el tiempo no
basta, evaluar una ejecución Vercel Hobby elegible; si tampoco lo es, mantener
el bloqueo documentado. Ningún nuevo intento local de rustc.

Con motor compatible recuperado: primero 10E/combate/bloqueo, luego los 27 E2E,
clasificar fallos reales y capturar partida (mano, campo, selección de
bloqueadoras, resultado). PR #1 sigue abierto, sin merge ni despliegue.

## Fuentes oficiales consultadas

[1] https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/
[2] https://developers.cloudflare.com/workers/ci-cd/builds/build-image/
[3] https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/
[4] https://developers.cloudflare.com/workers/ci-cd/builds/build-caching/
[5] https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
[7] https://vercel.com/docs/plans/hobby
[8] https://vercel.com/docs/limits
[9] https://vercel.com/docs/deployments/troubleshoot-project-collaboration
[10] https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases
[11] https://developers.cloudflare.com/r2/get-started/

Las páginas pueden cambiar; revisar límites y configuración visibles en la
cuenta antes de aprobar. La documentación de proveedor no equivale a una prueba
real del build de Mesa ni a una inspección de tus cuentas.
