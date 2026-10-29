# Verificación 0.4.2 — «Confianza por carta»

La ronda 0.4.1 dejó tres afirmaciones demasiado anchas: un índice que resolvía
nombres por packs (y podía sobrescribir en silencio), un `verified` que se leía
como «todas las caras están soportadas» y una paridad nativo/WASM demostrada con
totales (mismo número de pasos, mismo ganador) en vez de paso a paso. Esta ronda
estrecha las tres, y añade la integridad del archivo que se descarga.

Todo lo que sigue se ejecutó en este entorno sobre este commit. Los números de
0.4.1 no se reutilizan aquí: ver §9, donde se separan explícitamente.

## 1. Un solo índice canónico (nombre → carta)

Antes, `planLoad()` y el constructor de mazos decidían por su cuenta qué carta era
«Serra Angel» cuando el nombre aparecía en dos packs; el índice sumaba caras por
pack en vez de resolver identidades.

Ahora hay **un** índice, `src/lib/game/canonical.ts`, y todo lo demás lo consulta:

- **Identidad Oracle vs impresión**: la clave es la identidad de la cara (nombre +
  atributos de la cara), no el archivo. La impresión concreta se conserva como
  procedencia (`pack`, `source`), y el dueño de un nombre es el primer pack en
  orden canónico — una regla explícita, no el orden de llegada de las promesas.
- **Sin sobrescrituras silenciosas**: cuando dos packs traen la misma identidad con
  texto distinto, la diferencia se acumula en `conflicts` y se muestra; no se elige
  una y se descarta la otra.
- `mergeCatalogs()` es la única función que fusiona; `mergePacks()` y el cargador
  la usan. `DeckBuilder` resuelve contra el mismo índice que el motor recibirá.

Pruebas discriminantes (`catalog-identity.test.ts`, 7 casos) con cartas repetidas
entre `fixture` y `10e`, y con el fixture real `10e-overlap-faces.json`. El índice
publicado declara `overlap.fixture = 9` nombres compartidos y `duplicates = []`:
hoy el catálogo enviado no tiene dos definiciones incompatibles, y si las tuviera
la prueba falla en vez de elegir una.

Conflictos reales que sí existen entre fuentes y quedan registrados, no ocultos:
`rampant growth`, `serra angel`, `shock`.

## 2. Certificación por carta, no por pack

`verified: true` significa «Phase parseó este pack y una partida real lo jugó».
No significa «cada cara está soportada». Para no confundir las dos cosas, la
evidencia se produce por carta con las APIs de cobertura de Phase:

1. `cargo run -p mtg-engine-wasm --bin coveragepack -- <pack> <packcheck>`
   llama a `analyze_coverage` de Phase y escribe, por cara, qué se reconoció.
2. `bun scripts/build-coverage.ts` verifica el sha256 del pack contra el índice,
   invoca ese binario y publica el artefacto en
   `static/data/catalog/coverage/<pack>.<sha8>.json` — dirección **por
   contenido**: un pack nuevo produce una URL nueva.
3. El cliente lo carga con `loadCoverage()`; un 404 o un digest distinto es
   `null` («sin evidencia»), nunca una excepción ni una suposición.

Estados que se muestran al usuario: encontrada en el catálogo → parseada por
Phase → cobertura de reglas conocida → limitaciones conocidas → ejercitada en una
partida real. La **ausencia** de cobertura no se declara incompatibilidad: se
declara desconocida.

Resultado para `10e` (354 caras): **286 soportadas**, **68 con limitaciones
conocidas**, **12 ejercitadas**. Antes de esta ronda el mismo pack daba 224
soportadas y 130 con huecos: el defecto era que `scripts/import-set.ts` no
trasladaba la línea de palabras clave (`Flying`, `First strike`…), que MTGJSON v3
deja dentro del texto, así que Phase no podía reconocerlas y 62 cartas quedaban
marcadas como efecto desconocido. Se derivan solo líneas exactas de palabras clave
(con texto recordatorio opcional); nada se infiere del texto de efecto y las
palabras clave parametrizadas quedan como hueco declarado.

Política de inicio, conservadora:

| Estado | Qué hace la interfaz |
|---|---|
| soportada | inicia |
| con limitaciones conocidas | **no inicia**; nombra la carta y su hueco; se puede forzar con una casilla explícita «Permitir N carta(s) con limitaciones conocidas» |
| pack sin artefacto de cobertura | inicia, avisando «sin evidencia» |
| nombre que el catálogo no tiene | se lista como faltante; nunca se descarta en silencio |

## 3. Paridad nativo/WASM paso a paso

Comparar pasos totales y ganador es compatible con dos partidas distintas. Ahora
los dos ejecutables escriben un *trace* por paso y se comparan campo a campo:

- `packcheck --trace <jsonl>` (Rust, `CardDatabase::from_json_str` + `project_state`)
- `bun scripts/wasm-packcheck.ts … --trace <jsonl>` (el `.wasm` publicado, mismo
  protocolo `INIT`/`ACTION` que usa el cliente)
- `bun scripts/parity-trace.ts <nativo> <wasm>` compara y resume.

En cada paso se exige igualdad de: actor, tipo de espera, acción aplicada **con
sus argumentos**, conjunto completo de acciones legales y estado proyectado para
ese espectador. La comparación es semántica (claves ordenadas): `serde_json`
emite las claves de un mapa ordenadas y el objeto de JavaScript las conserva en
orden de inserción, así que una comparación de bytes daría falsos positivos por
un motivo que no es del juego.

Normalización declarada, y solo esta (fijada por prueba para que nadie añada una
tercera sin decirlo):

1. métricas de pared (milisegundos), que no forman parte de la partida;
2. el sobre del run (bytes del motor, memoria, tiempos), que el trace no incluye.

Nada dentro de `state`, `legal` o `action` se normaliza.

Resultado con `docs/packcheck-10e-decks.json`, semilla 7, 444 caras (fixture +
10e): **1055 pasos comparados, 0 divergencias**. Mezcla idéntica de acciones:
`PassPriority` 862, `ActivateAbility` 111, `DeclareAttackers` 27, `CastSpell` 18,
`PlayLand` 18, `DeclareBlockers` 15, `MulliganDecision` 2, `ChooseOption` 1,
`SelectCards` 1. Ganador: asiento 1. `docs/parity-trace.json` guarda el resumen; los
traces (≈100 MB) se generan en `/tmp` y no se versionan.

Si hubiera divergencia, el informe incluye el primer paso distinto, la ruta del
campo, ambos valores y el comando para reproducir el prefijo exacto
(`--max-steps <paso>`), que es el escenario reproducible mínimo pedido.

## 4. Integridad del pack antes de usarlo

El índice ya declaraba `bytes` y `sha256`; el cargador ahora **los exige**:

- `fetchVerifiedPack()` comprueba longitud y SHA-256 antes de adoptar el archivo.
  Un pack que no coincide se rechaza con un mensaje que dice qué esperaba y qué
  llegó; no se juega con medio catálogo.
- La URL es **direccionada por contenido** (`…/10e.json?v=<sha256>`), de modo que
  un índice nuevo no puede recibir el cuerpo viejo de la caché HTTP.
- La caché en memoria sigue indexada por digest: un rechazo no envenena el
  reintento (`pack-integrity.test.ts` lo comprueba cargando el archivo corregido
  después del fallo).

`pack-integrity.test.ts` (8 pruebas, sobre los archivos reales):

| Caso | Resultado esperado | Resultado |
|---|---|---|
| índice vs archivos enviados | longitud y sha256 coinciden | pasa |
| pack verificado | carga, URL con `?v=<sha256>` | pasa |
| alterado (misma longitud, un carácter) | «no coincide con el índice» | pasa |
| truncado | «llegó incompleto» | pasa |
| intercambiado (otro pack real con este nombre) | «llegó incompleto» | pasa |
| índice adelantado / archivo viejo | «no coincide con el índice» | pasa |
| rechazo + archivo corregido | el reintento carga | pasa |
| sesión completa con un pack truncado | `loadCatalog` falla; la partida no arranca | pasa |

## 5. Medidas de esta ronda

Máquina de 2 vCPU y 3 GB. Las cifras nativas son de un build `dev`
(`-Zmir-opt-level=0`, `-j1`), sin el coste de escribir el trace:

| Medida | Nativo (`packcheck`) | WASM publicado |
|---|---|---|
| Pasos | 1055 | 1055 |
| Por paso | 6,48 ms | mediana 9,54 ms · p90 12,25 ms · máx 19,92 ms |
| Arranque del motor | 541,7 ms (primera lectura: 328,2 ms de parseo de packs) | `init` 214,4 ms tras instanciar |
| Compilación / instanciación | — | 739,8 ms / 20,3 ms |
| Memoria del módulo | — | 33,1 MB |
| Respuesta máxima del ABI | — | 216 375 B |
| Resolución de mazos | 6,9 ms (40/40 por asiento) | 40/40 tras `INIT` |

Comparación honesta con 0.4.1: aquel build nativo daba 6,07 ms/paso con 1063
pasos; hoy 6,48 ms con 1055. Son la misma máquina y el mismo perfil, y la
diferencia está dentro del ruido, así que no se presenta como mejora ni como
regresión.

## 6. Lo que quedó bloqueado

- **Chromium/Playwright**: sigue sin haber navegador ni librerías en este
  entorno. `tests/e2e/ui-game.spec.ts` (partida completa con mazo propio de 10E a
  través de los controles Svelte, incluida la regresión visual del estado de
  bloqueo de 0.3) está escrito y **no se ejecutó**. No hay capturas ni
  comprobación de a11y en 320/375/390/768/1440 en esta ronda.
- **Recompilación del WASM**: el `.wasm` publicado
  (`static/wasm/mtg_engine_wasm.wasm`, 48 374 605 B) es el mismo artefacto con el
  que se mide; el código de Phase no se tocó. No se afirma nada sobre
  reproducibilidad binaria de otra máquina.
- **GitHub Actions**: sin runners asignados (ver `docs/CI-DIAGNOSIS.md`); toda la
  verificación es local y así se reporta.

## 7. Qué no se afirma

- Que las 354 caras de 10E estén soportadas: 68 tienen limitaciones conocidas y se
  enumeran en el artefacto de cobertura.
- Que cobertura ≠ corrección exhaustiva: «parseada y con reglas reconocidas» no es
  «jugada de extremo a extremo». Ejercitadas hay 12.
- Que la paridad cubra todos los mazos: cubre un escenario semilla 7 con dos mazos
  y 1055 pasos. Ampliarlo es trabajo pendiente, no una conclusión.
- Que la interfaz esté verificada visualmente: no se ejecutó el navegador.

## 8. Identidad

- Rama `arena/5f317145-mtg`; PR #1 abierto, sin merge ni despliegue.
- Commits de la ronda: `9949def` (índice canónico), `697ce8e` (certificación por
  carta), `04600dc` (paridad paso a paso), y el de integridad de packs.
- Motor Phase: `c2fbb7a6634a440c7c6b47e6a87a554cc7382f05`, sin cambios.
- Artefactos de esta ronda: `static/data/catalog/index.json` (v4),
  `static/data/catalog/packs/{fixture,10e}.json`,
  `static/data/catalog/coverage/{fixture.b0e06de9,10e.8f269bf4}.json`,
  `docs/packcheck-10e.json`, `docs/wasm-packcheck.json`, `docs/parity-trace.json`,
  `docs/engine-coverage.json`.

## 9. Separación de evidencia respecto de 0.4.1

`docs/VERIFICATION-0.4.1.md` conserva lo medido entonces (1063 pasos, 6,07 ms por
paso nativo, mediana WASM 10,27 ms, 444 caras). Los archivos de evidencia se
regeneraron en esta ronda tras corregir la derivación de palabras clave, así que
`docs/packcheck-10e.json` y `docs/wasm-packcheck.json` ya **no** contienen los
números de 0.4.1: los de 0.4.1 viven en su documento y los actuales, aquí. Los
recuentos de «ejercitadas» tampoco son comparables entre rondas (0.4.1 contaba 23
caras por otra definición; hoy son 12 nombres ejercitados), y no se mezclan.
