# Verificación 0.4.1 — «las cartas tienen que existir de verdad»

Ronda centrada en un solo defecto de fondo: el catálogo podía *parecer* completo
sin serlo. Un flag de certificación que nadie leía, un generador de packs que
leía otro archivo del que se le indicaba y un constructor que abría descargando
todo el catálogo son tres formas distintas del mismo fallo: datos plausibles sin
evidencia detrás.

Este documento dice qué se ejecutó en este entorno, qué quedó bloqueado y con qué
prueba. No reutiliza resultados de fases anteriores como si fueran de este commit.

## 1. Defecto reproducido primero (RED) y corregido

`scripts/catalog-packs.ts` documentaba `--set-file <MTGJSON>`, pero el archivo que
leía era `--input` o su valor por defecto `static/data/cards.json`; `--set-file`
sólo cambiaba el conversor. Consecuencia: el índice declaraba como procedencia el
set indicado mientras el pack contenía otras cartas.

- Prueba nueva: `src/lib/game/__tests__/catalog-packs-cli.test.ts` ejecuta el CLI
  real (`Bun.spawn`) contra el archivo real `data/mtgjson/10E.es.json`.
- Reproducción contra el script anterior (`git show HEAD~1:scripts/catalog-packs.ts`):
  **3 de 4 pruebas en rojo**, incluida la que exige que un set v3 se rechace con
  instrucciones (`Received: "El catálogo static/data/cards.json no tiene cartas."`)
  y la que exige que `--set-file` sea la fuente.
- Corrección: `--set-file` **es** la fuente; combinarlo con `--input` es error
  explícito (código 2); un MTGJSON v3 se rechaza sin escribir nada; un archivo que
  no es AtomicCards v5 ni la exportación plana del motor también.

## 2. Procedencia: quién parsea las cartas

El generador de packs ya no convierte MTGJSON por su cuenta. El camino es:

1. `bun scripts/import-set.ts --set-file data/mtgjson/10E.es.json` — **sólo**
   adapta el esquema v3 → AtomicCards v5 (colores `White` → `W`, `cmc` →
   `manaValue`, `multiverseid` → `identifiers`). No inventa caras ni texto.
2. `cargo run -p mtg-engine-wasm --bin catalog -- <atomic> <out>` — **Phase**
   parsea el set (`CardDatabase::from_mtgjson`) y exporta
   (`export_subset_json`) el `CardExportEntry` que el motor deserializa.
3. `bun run catalog:packs -- --set-file <out>/cards.json …` — empaqueta la
   exportación del motor, no una conversión paralela.

Si el set trae cartas que v3 no puede representar sin inventar datos (una
multifaz sin texto por cara), `import-set` **falla** salvo `--allow-multiface`, y
el set queda marcado `partial`.

## 3. Certificación efectiva (`verified`)

Antes: el índice tenía `verified` y el cargador lo ignoraba. Ahora:

- `planLoad()` devuelve además `unverified` y `unverifiedPacks`.
- `loadCatalog()` los propaga; `Board.startWith()` **no inicia** la partida y
  muestra el diagnóstico: cuántas cartas, cuáles y en qué packs.
- `DeckBuilder` marca cada resultado con «sin certificar» y deshabilita «Jugar
  con este mazo» en cuanto el mazo toca un pack no certificado.
- `docs/engine-coverage.json` + `certification-evidence.test.ts`: un pack con
  `verified: true` debe tener registro con **el mismo sha256**, el mismo número de
  caras, `found` y `parsed` en verdadero y evidencia de parseo. Un registro sin
  pack en el índice es una afirmación obsoleta y falla.

Niveles, explícitos en el documento: `found` (está en el índice), `parsed`
(Phase lo deserializó), `coverage_known` (Phase conoce el soporte de la carta —
**no expuesto por el puente**) y `exercised` (la carta se usó en una partida real).

## 4. Constructor sin descargar el catálogo entero

Antes: abrir el constructor llamaba `loadCatalog(..., { allPacks: true })`.
Ahora:

- Al abrir sólo se usa el índice ya cargado; la búsqueda recorre **nombres** del
  índice (barato) y, para los packs ya en memoria, también texto y tipo.
- Los resultados están acotados (`MAX_RESULTS = 60`).
- Al añadir una carta de un pack no cargado se pide **ese** pack
  (`loadPack(fetcher, index, id)`), no la colección.
- La caché de packs se indexa por `versión de índice + id + sha256`; un pack
  reconstruido ya no se sirve desde memoria.
- Prueba: `catalog-certification.test.ts` — abrir el constructor pide
  `index.json` + el pack `core` y nada más; elegir una carta pide un único pack y
  la segunda elección del mismo pack no hace peticiones.

## 5. Lo que se ejecutó en este entorno

Todo lo de esta sección se ejecutó en este checkout, con el árbol de trabajo de
esta ronda. No reutiliza cifras de fases anteriores.

### 5.1 Set real, de punta a punta

| Paso | Comando | Resultado |
| --- | --- | --- |
| Adaptar el esquema | `bun scripts/import-set.ts --set-file data/mtgjson/10E.es.json --out /tmp/10E.atomic.json` | 363/363 caras, 0 omitidas |
| Parsear y exportar con Phase | `target/…/debug/catalog /tmp/10E.atomic.json /tmp/10e-engine` | `exported 363 faces` (513 KiB/`cards.json`) |
| Empaquetar junto al fixture | `bun scripts/catalog-packs.ts --set-file … --append --verified` | índice **v1 → v2**, packs `fixture` (90, `core`) + `10e` (363) |
| Certificar el pack | `packcheck packs/fixture.json,packs/10e.json docs/packcheck-10e-decks.json 7 4000` | 444 caras, **40/40 resueltas** por asiento, **1063 pasos**, ganador asiento 1 → `docs/packcheck-10e.json` |
| Repetir por el WASM publicado | `bun scripts/wasm-packcheck.ts packs/fixture.json,packs/10e.json --seed 7` | **mismos 1063 pasos, mismo ganador**, `resolved_after_init [40, 40]` → `docs/wasm-packcheck.json` |

Dos defectos reales aparecieron al ejecutarlo, y están corregidos:

- `mtgjsonV3ToAtomic` omitía `colors` en cartas incoloras y `manaValue` en cartas
  sin coste: Phase abortaba con `missing field colors` / `missing field manaValue`.
  Ahora escribe `[]` y `0`, y `catalog-source.test.ts` lo comprueba sobre todo el
  set (no sólo sobre Serra Angel).
- Los sets MTGJSON v3 **no traen tierras básicas** (363 cartas, ninguna `Plains`).
  Un mazo de 10E resolvía 23 de 40 cartas y el motor seguía jugando con lo que
  quedaba. El pack `core` aporta las básicas y `packcheck` compara pedidas contra
  resueltas: la partida no se declara buena con cartas de menos.

### 5.2 Pruebas

- `bun test src/lib` → **121 pruebas, 0 fallos** (`catalog-packs-cli` 5,
  `catalog-real-set` 7, `engine-parity` 5, `catalog-source` 9, `certification-evidence` 5).
- `bun run check` → 0 errores, 0 avisos.
- `bun run build` → correcto.

### 5.3 Medido, no estimado

Motor WASM publicado (`static/wasm/mtg_engine_wasm.wasm`, 48 374 605 B):

| Medida | Valor |
| --- | --- |
| Compilación del módulo (`WebAssembly.compile`) | 823 ms |
| Instanciación | 19,6 ms |
| Memoria WASM tras la partida | 33,6 MB |
| `init` con catálogo de 444 caras y dos mazos de 40 | 203 ms |
| Paso de acción (mediana / p90 / máx) | 10,3 / 12,4 / 31,6 ms |
| Partida completa (1063 pasos) | ≈ 12,5 s |

Cliente, datos (`docs/performance-catalog.json` → `shipped`): índice 12,4 KiB,
plan 0,34–0,37 ms, parseo de los dos packs 3,5–3,7 ms, merge 0,24 ms. Un mazo de
10E descarga 635 KiB (fixture 122 + 10E 513) frente a 625 KiB de un archivo único
equivalente: **a este tamaño no hay ahorro de bytes**, y decirlo importa. El
ahorro está donde sí se mide: abrir el constructor cuesta 12 KiB de índice y una
partida de sólo cartas `core` sigue en 122 KiB.

Nativo (debug, `docs/packcheck-10e.json` → `timing_ms`): parseo de los 444
registros 77,6 ms, resolución de mazos 0,3 ms, arranque del motor 160,4 ms y
6,07 ms por paso (1063 pasos, 6,45 s). Ganador asiento 1, igual que el WASM
(`engine-parity.test.ts` lo exige).

## 6. Lo que quedó bloqueado

- **Chromium/Playwright**: no hay navegador ni librerías en este entorno
  (`apt` no disponible). `tests/e2e/*.spec.ts` no se ejecutó: ni capturas, ni
  interacción real, ni comprobación de a11y en 320/375/390/768/1440. La UI de
  esta ronda no se declara verificada visualmente.
- **Cobertura por carta**: el puente sigue sin exponer `coverage` de Phase. Un
  pack `verified` significa «Phase lo parseó y una partida real lo usó», no «las
  363 caras están soportadas una por una». `exercised` queda en `parcial` y el
  documento lo repite donde importa.
- **Multifaz, alias y duplicados entre sets**: 10E no tiene cartas de doble cara
  ni nombres impresos alternativos, así que esta ronda **no** los prueba. El
  código los contempla (claves por cara, `faceNames`) pero no hay evidencia.
- **GitHub Actions**: sigue sin asignar runners (ver `docs/CI-DIAGNOSIS.md`); la
  verificación es local y así se reporta.

## 7. Lecciones y límites

- `verified` sin evidencia es una opinión: ahora hay un documento y una prueba
  que lo atan al sha256 del pack y a la fuente de la evidencia.
- La granularidad de los packs manda más que su número: un shard por hash reparte
  un mazo entre varios archivos; un pack por set lo deja en uno.
- El puente sigue sin exponer `catalog_search`, `validate_deck`, `coverage` ni
  `export_subset`. Mientras falte, la cobertura por carta se documenta como
  desconocida y no se deduce del hecho de que la carta se vea en pantalla.

## 8. Identidad

- Rama `arena/5f317145-mtg`, PR #1 abierto (sin merge ni despliegue).
- Motor Phase: `c2fbb7a6634a440c7c6b47e6a87a554cc7382f05` (sin cambios).
- Dependencias: `rolldown` 1.2.15 → 1.2.16; TypeScript sigue en 6.0.3.
- Artefactos de evidencia: `docs/packcheck-10e.json` (nativo),
  `docs/wasm-packcheck.json` (WASM), `docs/packcheck-10e-decks.json` (mazos),
  `docs/engine-coverage.json` (registro de certificación).
