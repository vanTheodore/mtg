# Verificación 0.4 — catálogo por packs, constructor de mazos e impresiones en español

Alcance de esta fase y, sobre todo, **qué se ejecutó en este entorno** frente a
lo que quedó escrito pero sin ejecutar. Ningún resultado de una fase anterior se
presenta como perteneciente a este commit.

## 1. Funcionalidad entregada

### Catálogo ampliable por packs (cliente)

- `scripts/catalog-packs.ts`: parte un catálogo en packs + índice con `sha256`,
  bytes, nombres, set, `core` y `verified`. Acepta el formato que el motor
  deserializa (`CardExportEntry`) o un set MTGJSON v3 y lo convierte.
- `src/lib/game/catalog.ts`: `planLoad()` decide los packs mínimos para un mazo
  (más los `core`), `loadCatalog()` los descarga, los cachea y los fusiona.
  Los nombres compuestos se resuelven por cara. Los nombres ausentes se
  devuelven en `missing` y **la partida no arranca** con ellos.
- `static/data/catalog/index.json` + `packs/fixture.json`: 90 caras reales
  (fixture de Phase), 122 KiB, `verified: true`.

### Constructor e importador de mazos

- `src/lib/game/decks.ts`: parser Arena/MTGO (cantidades, `4x`, códigos de set,
  banquillo, comentarios), exportador, expansión a `main_deck` del motor,
  persistencia en `localStorage` con validación de esquema.
- `src/lib/components/DeckBuilder.svelte`: búsqueda en el catálogo cargado,
  cantidades, nombre, guardar/cargar/eliminar, importar lista, y «Jugar con este
  mazo».
- `Board.svelte`: modo «Mazo propio», carga de sólo los packs que el mazo usa y
  aviso de lo que **el motor** cargó (`40 / 40 cartas por asiento`).

### Cartas en español (capa opcional)

- `src/lib/game/impressions.ts` + `impressions.svelte.ts`: capa opcional por
  nombre inglés, con reserva total al inglés y 404 tolerado.
- `scripts/build-impressions-es.ts` + `static/data/impressions.es.json`:
  **9 impresiones reales** de *Tenth Edition* en español (texto y línea de tipo),
  extraídas de `data/mtgjson/10E.es.json` (MTGJSON, descargado de GitHub).
  No hay traducción manual y ningún nombre se reemplaza.
- `CardView` y `InspectDialog` muestran el texto español cuando existe y marcan
  la impresión de origen.

## 2. Ejecutado en este commit

Comandos corridos en esta sesión, en este árbol de trabajo:

| Comando | Resultado |
| --- | --- |
| `bun install --frozen-lockfile` | 63 paquetes, lockfile respetado |
| `bun run check` | **0 errores, 0 advertencias** |
| `bun test src/lib` | **81 pasan, 0 fallan** (11 archivos, 319 expectativas) |
| `bun run build` | OK (`adapter-static`, `build/`) |
| `bun run deps:audit` | 88 paquetes, 10 directos, 26 desactualizados, 1 directo (`typescript` 6.0.3 → 7.0.2, retenido) |
| `bun run scripts/measure-catalog.ts` | escrito `docs/performance-catalog.json` |

Desglose de pruebas nuevas (todas con `bun test`, sin navegador):

| Archivo | Qué prueba |
| --- | --- |
| `catalog.test.ts` | plan de packs, nombres compuestos, `missing`, orden, caché-shape, fusión |
| `catalog-http.test.ts` | servidor Bun real sirviendo `static/`: descarga por pack, fusión idéntica al catálogo del motor, caché, error 404 legible |
| `catalog-artifacts.test.ts` | los artefactos generados: índice ↔ `cards.json` (mismos nombres), `sha256` y bytes de cada pack, los tres mazos demo resueltos, metadatos de UI completos |
| `decks.test.ts` | parser/exportador, banquillo separado, líneas basura reportadas, expansión, `localStorage` corrupto, fallo de escritura |
| `impressions.test.ts` | archivo real bien formado y sólo de cartas del catálogo, búsqueda por nombre, reserva al inglés, 404/payload roto |

## 3. NO ejecutado aquí (y por qué)

| Suite | Estado | Motivo |
| --- | --- | --- |
| `bun run test:e2e` (Playwright/Chromium) | **No ejecutado** | Este sandbox es Debian 12 sin Chromium ni sus bibliotecas, sin espejo apt alcanzable y sin toolchain Rust |
| `bun run engine:verify` / `engine:parity` / `engine:scenarios` | **No ejecutado** | No hay Rust instalable sin red a crates.io/rust-lang |
| Partida real en navegador con mazo propio | **No ejecutado** | Falta además el artefacto `static/wasm/mtg_engine_wasm.wasm` (generado en build, no versionado) |

Consecuencia honesta: **el flujo nuevo de la UI no está verificado visualmente**.
Lo verificado sin navegador es la capa de datos (unitarias + HTTP real) y los
tipos/build. `tests/e2e/deck-builder.spec.ts` se añadió para que la primera
ejecución con navegador cubra constructor, importación, persistencia, inicio de
partida con mazo propio y el caso de carta ausente; **no se afirma que pase**.

## 4. Rendimiento medido (`docs/performance-catalog.json`)

Bun 1.4.4, catálogo real 1× y tiers sintéticos 5×/20× (réplica con sufijo, no
cartas nuevas verificadas). Mediana de 5 muestras.

| Escala | Archivo único | Parse | Índice | Plan de un mazo | Descarga con packs por set (~300) |
| --- | --- | --- | --- | --- | --- |
| 1× · 90 caras | 122 KiB | 0.47–0.94 ms | 2.3 KiB | 0.08–0.12 ms | 122 KiB, 1 pack |
| 5× · 450 | 619 KiB | 2.5–2.9 ms | 11.8 KiB | 0.33 ms | 414 KiB, 1 pack |
| 20× · 1800 | 2484 KiB | 10.4–15.7 ms | 48.0 KiB | 0.97 ms | 414 KiB, 1 pack |

Sin regresión frente a la fase anterior en lo comparable: el catálogo real sigue
siendo 122 KiB y el plan de carga añade ~0.1 ms. El punto del diseño queda
medido: con packs del tamaño de un set, la descarga de un mazo **no crece** con
el catálogo (414 KiB a 20× frente a 2.4 MiB del archivo único). Con 4 shards por
hash el mazo toca 3 packs y la ventaja se pierde: la granularidad por set importa
más que el número de archivos.

## 5. Correcciones de documentación de esta sesión

- `docs/LOCALE.md` ahora describe el comportamiento **real** de `typeLine`: la
  reserva no es uniforme (un subtipo sin traducir queda en inglés dentro de la
  línea española; un tipo principal o supertipo desconocido devuelve toda la
  línea al inglés), corregido a **48 subtipos** mapeados (no 50) y aclarando que
  `Berserker` no tiene entrada: coincide por casualidad.
- `README.md` separa «implementado en la UI» de «verificado con E2E», con el
  bloqueo declarado en sus tres niveles (reglas, integración vía `EngineClient`,
  interacción visual **sin** E2E estable).

## 6. Identidad

- Rama: `arena/5f317145-mtg`. PR #1 abierto, sin merge ni despliegue.
- Motor Phase: `c2fbb7a6634a440c7c6b47e6a87a554cc7382f05` (sin cambios).
- Dependencias: sin cambios de versión; TypeScript se mantiene en 6.0.3.
