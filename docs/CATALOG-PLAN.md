# Catálogo ampliable: investigación y plan

Objetivo: dejar de depender de un catálogo fijo de 90 caras y poder incorporar
cartas reales **por demanda, por conjunto o por mazo**, conservando la identidad
Oracle, las caras, y sin declarar compatible una carta por el hecho de aparecer
en el catálogo.

Este documento es la investigación y el plan. Lo que ya está implementado en esta
fase (packs, índice, constructor de mazos, capa de impresiones en español) está
en `docs/VERIFICATION-0.4.md`. Lo que exige recompilar el puente WASM queda
propuesto como **PR siguiente**, con las firmas exactas de Phase que lo hacen
posible.

## 1. Qué tiene Phase hoy (leído en el código fijado `c2fbb7a`)

### Base de datos

| Necesidad | API de Phase | Archivo |
| --- | --- | --- |
| Cargar cartas desde JSON | `CardDatabase::from_json_str(&str)` → `HashMap<String, CardExportEntry>` | `database/card_db.rs` |
| Exportar un subconjunto | `CardDatabase::export_subset_json(&BTreeSet<String>)` | `database/card_db.rs:221` |
| Integridad del catálogo | `export_integrity_errors() -> Vec<String>` | `database/card_db.rs:357` |
| Buscar por cara | `get_face_by_name`, `get_face_by_oracle_id`, `get_face_by_printed_ref` | `database/card_db.rs:205-292` |
| Legalidades por carta | `get_legalities`, `legality_status(name, LegalityFormat)` | `database/card_db.rs:293` |
| Layout (DFC, split, meld…) | `get_layout_kind(oracle_id)`, `LayoutKind` | `database/card_db.rs:353` |
| Impresiones | `printings_for`, `printings_for_key`, `rulings_for` | `database/card_db.rs:305-338` |

El formato que el motor deserializa **no** es MTGJSON «AtomicCards» directo: es
`CardExportEntry`, es decir la cara aplanada junto con `legalities`, `layout`,
`face_index`, `printings`, `rulings` y `bracket_signals`. Así está hoy
`static/data/cards.json` y así lo genera el binario `catalog` desde el fixture.

### Búsqueda y validez de mazo (lo que falta exponer)

| Necesidad | API de Phase | Archivo |
| --- | --- | --- |
| Búsqueda del constructor | `CardSearchQuery { text, colors, type_line, cmc_max, sets, legal_format, limit }` + `CardSearchResults` | `database/search.rs` |
| Formatos legales | `LegalityFormat::ALL` (15 variantes: Standard…Oathbreaker) | `database/legality.rs:12` |
| Validar un mazo por nombre | `validate_name_deck_for_format`, `validate_name_deck_for_format_full` | `game/deck_validation.rs:485-549` |
| Compatibilidad de cartas | `evaluate_deck_compatibility`, `DeckCompatibilityResult`, `UnsupportedCard` | `game/deck_validation.rs:248` |
| Límite de copias | `max_deck_copies`, `deck_copy_limit_for` | `game/deck_validation.rs:3937` |
| Cobertura del parser por carta | `CardCoverageResult`, `GapDetail`, `ParsedItem`, `ParseCategory` | `game/coverage.rs` |
| Config de formato | `GameFormat`, `FormatConfig::limited()`, `legality_format()`, `deck_size_authority()` | `types/format.rs` |

Dos consecuencias directas:

1. **La validación de mazo existe en el motor pero no en el puente.** Hoy
   `crates/mtg-engine-wasm/src/lib.rs` expone `init`, `action`, `snapshot` y
   `view`, con el formato fijado a `FormatConfig::limited()`. Por eso Mesa **no**
   puede validar reglas de mazo todavía, y no las reimplementa en TypeScript.
2. **`resolve_deck_list` omite en silencio los nombres que no conoce**
   (`game/deck_loading.rs:290`). Es el riesgo principal al abrir el catálogo: un
   mazo con una carta ausente arrancaría con menos cartas sin avisar. La UI
   cierra ese hueco leyendo cuántas cartas cargó el motor y comparándolas con las
   pedidas (`Board.svelte`, aviso «Motor: N cartas cargadas por asiento»).

### Cobertura como puerta de compatibilidad

`game/coverage.rs` produce por carta `CardCoverageResult` con `ParsedItem`,
`GapDetail` y `ParseCategory`. Es exactamente lo que hace falta para responder
«¿esta carta está soportada?» sin adivinar. Mientras no se exponga, **ninguna
carta nueva entra al catálogo jugable**: el pack `fixture` está marcado
`verified: true` porque una partida real lo jugó de principio a fin; un pack real
llegaría con `verified: false` hasta pasar la puerta.

## 2. Datos: de dónde salen las cartas reales

| Fuente | Accesible en este entorno | Identidad Oracle | Notas |
| --- | --- | --- | --- |
| Scryfall API/bulk (`oracle-cards`) | **No** (egress bloqueado, `000`) | Sí (`oracle_id`) | Fuente preferida y la que ya usa la capa de imágenes |
| MTGJSON v5 `AtomicCards.json` (espejos en GitHub) | Parcial: los repos con el archivo completo pesan cientos de MB | Sí (`identifiers.scryfallOracleId`) | Requiere descarga completa; no sirve para «por demanda» en el sandbox |
| MTGJSON v3 por set (`mtgjson3/json/{SET}.json`, `.es.json`) | **Sí** vía API de GitHub (≤1 MB por archivo) | **No**: sólo `multiverseid` | Datos de 2018; útil para probar la tubería y para la capa en español |
| Fixture de Phase (`data/mtgjson/test_fixture.json`) | Sí, ya en el repo | Sí | 87 cartas; es lo único jugable hoy |

La tubería implementada es independiente de la fuente:

```text
fuente (AtomicCards o set MTGJSON v3)
   → scripts/catalog-packs.ts        (convierte y parte)
   → static/data/catalog/index.json + packs/<id>.json
   → src/lib/game/catalog.ts         (elige packs por mazo, fusiona, cachea)
   → EngineClient.init({ catalog })  (una sola base por partida)
```

`src/lib/game/catalog-source.ts` contiene la conversión `atomicFromMtgjsonSet` y
la extracción de impresiones en español, ambas con pruebas unitarias sobre datos
reales (ver `docs/VERIFICATION-0.4.md`).

## 3. Arquitectura de carga por demanda (implementada)

- El índice declara, por pack: `id`, `label`, `names`, `set`, `core`, `verified`,
  `faces`, `bytes`, `sha256` y `source`.
- Al iniciar una partida, `planLoad(index, nombres)` resuelve **sólo** los packs
  que contienen esas cartas, más los `core` (tierras básicas). Los nombres
  compuestos se abren por cara (`Giant Killer // Chop Down` → `giant killer` +
  `chop down`).
- Los packs se cachean por proceso; un fallo de descarga no envenena la caché.
- Los nombres que el índice no cubre se devuelven en `missing` y **la partida no
  se inicia** en vez de dejar que el motor los omita.

Medición (Bun, catálogo real y tiers sintéticos, `docs/performance-catalog.json`):

| Escala | Archivo único | Índice | Packs por set (~300) | Descarga para un mazo |
| --- | --- | --- | --- | --- |
| 1× (90 caras reales) | 122 KiB | 2.3 KiB | 1 pack | 122 KiB, 1 pack |
| 5× (450, sintético) | 619 KiB | 11.8 KiB | 2 packs | 414 KiB, 1 pack |
| 20× (1800, sintético) | 2484 KiB | 48.0 KiB | 6 packs | 414 KiB, 1 pack |

Con packs del tamaño de un set, el coste de un mazo deja de crecer con el
catálogo: a 20× se bajan 414 KiB en vez de 2.4 MiB. Con shards por hash (4 packs
del mismo tamaño) un mazo toca 3 packs y la ventaja desaparece: **la
granularidad por set es la que importa**, no el número de archivos.

## 4. Lo que falta y requiere tocar el puente WASM (PR siguiente)

Estas operaciones no existen en el puente y **no se pueden añadir sin recompilar
el WASM** (43 036 524 B, `wasm-opt -O1`). Se proponen como PR separado porque
cambian el ABI y exigen repetir paridad, escenarios y E2E.

### 4.1 `catalog_search` — búsqueda del constructor en el motor

```rust
// crates/mtg-engine-wasm/src/lib.rs
#[derive(Deserialize)] struct SearchRequest { query: CardSearchQuery }
#[derive(Serialize)]   struct SearchReply { ok: bool, total: usize, results: Vec<CardSearchResult> }
```

Usa `database/search.rs` tal cual. Ventaja: los filtros de legalidad (`legal_format`)
y de identidad de color salen del motor, no de TS. El cliente sólo pinta.

### 4.2 `validate_deck` — legalidad del mazo por formato

```rust
#[derive(Deserialize)] struct ValidateRequest { format: String, main_deck: Vec<String>, sideboard: Vec<String>, commander: Vec<String> }
#[derive(Serialize)]   struct ValidateReply { ok: bool, legal: bool, errors: Vec<String>, unsupported: Vec<UnsupportedCard> }
```

Llama a `validate_name_deck_for_format_full` + `evaluate_deck_compatibility`.
Con esto la UI deja de tener cualquier noción de «40 cartas» y pasa a mostrar la
frase que da el motor (`DeckFormatGateResult`). Requiere además mapear el
`format` del cliente a `GameFormat` y dejar de fijar `FormatConfig::limited()` en
`initialize`.

### 4.3 `export_subset` — construir packs desde el propio motor

`CardDatabase::export_subset_json(&BTreeSet<String>)` ya existe. Expuesto como
operación nativa (binario `catalog`), permite generar packs reales desde
`AtomicCards.json` sin duplicar la lógica de conversión en TypeScript.

### 4.4 `coverage` — la puerta de compatibilidad

Exponer `CardCoverageResult` por carta (`ParsedItem`, `GapDetail`). Un pack con
cartas que tengan huecos de parser se marca `verified: false` y la UI lo dice al
elegir el mazo. Es la diferencia entre «aparece en la búsqueda» y «Phase lo
juega bien», que es justo lo que no se debe confundir.

### 4.5 Orden propuesto

1. `format` configurable + `validate_deck` (desbloquea el constructor con reglas
   reales y formatos acotados).
2. `catalog_search` (búsqueda con filtros del motor sobre catálogos grandes).
3. `coverage` + `export_subset` + primer set real (p. ej. Limited de un set
   pequeño) con certificación por cobertura y escenarios.
4. Sólo después, formatos construidos (Modern/Standard/Commander) con sus
   reglas verificadas una por una.

## 5. Formatos: qué se puede afirmar

- **Sí**: `Limited` es lo que el motor juega hoy (`FormatConfig::limited()`, 40
  cartas mínimo, sin singleton, 2 jugadores). La partida está verificada.
- **No**: Modern, Standard, Commander, Pauper… Phase tiene configuración y tablas
  de legalidad, pero Mesa no las expone ni las ha probado. No se anuncian.
- El constructor guarda el mazo con `format: 'limited'` y lo declara en pantalla,
  sin prometer validación que no ocurre.

## 6. Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Carta sin soporte real jugada como si lo tuviera | Pack `verified` + `coverage` como puerta; hoy sólo el fixture está verificado |
| Nombre no resuelto omitido en silencio por `resolve_deck_list` | `missing` del índice + lectura de cartas cargadas por el motor |
| Catálogo gigante en memoria del WASM | Packs por set + carga mínima por mazo; medido hasta 20× |
| Índice creciendo sin control (nombres por pack) | 48 KiB a 1800 cartas; si un catálogo completo lo hace incómodo, shardear el índice por letra o por set, mismo formato |
| Datos de 2018 (v3) sin `oracle_id` | Sólo para probar tubería/impresiones; el catálogo jugable exige fuente con identidad Oracle |
| Licencias | Sin arte de Wizards; textos de carta con atribución a MTGJSON; Phase MIT/Apache intacto |

## 7. Criterios de aceptación del PR siguiente

1. `format` seleccionable entre los que el motor configure y **validación hecha
   por Phase**, con el mensaje del motor en pantalla.
2. Un set real cargado en packs, con `coverage` por carta y escenarios que jueguen
   cartas de ese set (no sólo que aparezcan en la búsqueda).
3. Paridad y escenarios nativos en verde con el nuevo ABI; E2E de Chromium del
   constructor y de una partida con mazo propio.
4. Medición de memoria/arranque con el set real frente a esta fase, sin regresión
   en las fases ya verificadas.
