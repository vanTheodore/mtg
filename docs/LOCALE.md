# Idioma de Mesa: español (Latinoamérica)

Mesa se juega en **español de Latinoamérica (`es-419`)**. Esta nota fija qué está
traducido, qué sigue en inglés y por qué, para que la interfaz no derive por
accidente hacia el español peninsular ni mezcle idiomas en la misma línea.

## Decisión

- `<html lang="es-419">` en `src/app.html`; todos los nombres accesibles
  (`aria-label`) y la guía de decisión están en español.
- La copia evita formas peninsulares (`pulsa`, `ordenador`, `móvil`). Se usa
  «selecciona» para la interacción con cartas y jugadores, que funciona igual
  con ratón, teclado y pantalla táctil.
- Se conservan los términos de juego de las impresiones oficiales en español,
  idénticos en España y Latinoamérica: *coste*, *maná*, *cementerio*, *campo de
  batalla*, *pila*, *mulligan*, *planeswalker*, *ficha*.

## Qué está traducido

| Superficie | Dónde | Estado |
| --- | --- | --- |
| Armazón, ajustes, mensajes de estado | `src/routes/+page.svelte`, `src/lib/components/*.svelte` | Español |
| Guía de decisión, objetivos, maná, ataque, bloqueo, descarte, mulligan | `DecisionPanel.svelte`, `interaction.ts` | Español |
| Etiquetas de acciones legales y del historial | `actions.ts`, `events.ts` | Español |
| Palabras clave y contadores (`Flying` → `Vuelo`, `PlusOnePlusOne` → `+1/+1`) | `interaction.ts` | Español |
| Estados de permanente (`Girada`, `Transformada`, `Atacando`, `Bloqueando`, `N daño`) | `interaction.ts` | Español |
| Línea de tipo (`Criatura legendaria — Humano Mago`, `Tierra básica — Llanura`, `Ficha de criatura — Soldado`) | `cards.ts` (`typeLine`) | Español parcial (ver abajo) |

La línea de tipo es solo presentación: el agrupamiento de fichas, los filtros de
zona y las comprobaciones de reglas siguen leyendo las claves inglesas del motor
(`Creature`, `Land`, `Token`, …).

### Cómo reserva realmente `typeLine`

La reserva **no es uniforme**; depende de qué parte de la línea falte. El
comportamiento real (verificado ejecutando `typeLine` sobre el catálogo y sobre
casos sintéticos) es:

| Caso | Entrada | Salida real |
| --- | --- | --- |
| Todo traducido | `Legendary Creature — Human Wizard` | `Criatura legendaria — Humano Mago` |
| Todo traducido | `Basic Land — Plains` | `Tierra básica — Llanura` |
| Ficha | `Token Creature — Soldier` | `Ficha de criatura — Soldado` |
| **Subtipo sin traducir** | `Creature — Aetherborn Vampire` | `Criatura — Aetherborn Vampiro` (mezcla) |
| **Subtipo sin traducir** | `Creature — Human Glimmer` | `Criatura — Humano Glimmer` (mezcla) |
| **Tipo principal desconocido** | `Conspiracy — Scheme` | `Conspiracy — Scheme` (toda la línea en inglés) |
| **Supertipo desconocido** | `World Enchantment — Aura` | `World Enchantment — Aura` (toda la línea en inglés) |

Reglas que se desprenden:

1. Si falta un **tipo principal** (`CORE_TYPES_ES`) o un **supertipo**
   (`SUPERTYPES_ES`), la línea completa se devuelve en inglés. Son siete tipos y
   tres supertipos, así que en la práctica cubre todo Magic impreso.
2. Si falta un **subtipo**, no se abandona el español: ese subtipo concreto se
   queda en inglés dentro de una línea en español. Es una mezcla deliberada y
   visible, preferible a inventar una traducción.

## Subtipos: 48 traducidos, resto en inglés

`cards.ts` mapea **48 subtipos** (`SUBTYPES_ES`), no 50. Son los que tienen forma
española confirmada en impresiones oficiales: `Human` → `Humano`, `Wizard` →
`Mago`, `Goblin` → `Trasgo`, `Plains` → `Llanura`, etc.

Quedan **sin entrada** y por tanto se muestran en inglés dentro de la línea
española: `Aetherborn`, `Glimmer` y `Phyrexian` (entre otros fuera del catálogo
actual). `Berserker` tampoco está mapeado, pero en español se escribe igual, así
que el resultado visible coincide; **no** es una decisión de traducción, es el
fallback.

## Qué sigue en inglés

- **Nombres de carta.** El nombre es la identidad de carta en Phase y en la caché
  de imágenes; no se sustituye nunca.
- **Texto de reglas, salvo impresiones publicadas.** Por defecto se muestra el
  texto que envía el motor (inglés). Si existe una impresión en español para esa
  carta exacta, se muestra ese texto (ver la sección siguiente); el motor sigue
  usando el inglés.
- **Texto de ambientación.** No se traduce ni se sustituye.
- Traducir a mano esos textos inventaría nombres que no coinciden con la
  impresión real y rompería la identidad de carta que usan la caché de imágenes,
  las pruebas y el motor. Es una decisión de datos, no de copia.

## Capa de impresiones: qué está implementado (fase 0.4)

La capa existe y funciona con datos **reales**, no con traducciones hechas aquí:

- `src/lib/game/impressions.ts` resuelve texto y línea de tipo por nombre inglés,
  con reserva total al inglés y tolerancia a un 404.
- `static/data/impressions.es.json` contiene 9 cartas del catálogo con el texto
  publicado de *Tenth Edition* en español, extraído de
  `data/mtgjson/10E.es.json` (MTGJSON v3, descargado de GitHub el 2026-10-29).
- `CardView` muestra ese texto con `lang="es"`; `InspectDialog` indica el set de
  la impresión y recuerda que la identidad sigue siendo el nombre inglés.

Límites de esta capa, sin adornos:

1. **Nombres**: MTGJSON v3 no publica el nombre localizado de esta edición, así
   que `printed_name` queda vacío y el nombre se mantiene en inglés. No se
   inventa.
2. **Cobertura**: 9 de 90 cartas. El resto no tiene impresión en ese set; la
   reserva al inglés es el comportamiento normal, no un error.
3. **Fuente preferida**: Scryfall `lang:es` por `oracle_id` sigue siendo la vía
   correcta para cubrir el catálogo completo. En este entorno Scryfall no es
   alcanzable, por eso la tubería es independiente de la fuente y acepta
   cualquier archivo normalizado.
4. **Reglas**: el motor sigue leyendo el texto inglés. La capa es sólo de
   presentación; no altera identificadores, caras ni comportamiento.

## Cómo ampliarla sin tocar reglas

1. Obtener las impresiones localizadas por `oracle_id` y cara (Scryfall `lang:es`
   o un set MTGJSON traducido).
2. Normalizarlas con `impressionsFromMtgjsonSet` (o un conversor equivalente) y
   regenerar `impressions.es.json`; el formato ya está versionado.
3. Verificar que cada entrada apunta a una carta del catálogo (la prueba
   `impressions.test.ts` falla si no) y que el `sha256` de la fuente queda
   registrado en `source`.

## Cómo se protege

`src/lib/game/__tests__/locale.test.ts` falla si:

- el documento deja de declarar `lang="es-419"`;
- reaparece una forma peninsular en `src/app.html`, `src/routes/+page.svelte` o
  cualquier componente;
- una pantalla vuelve a mostrar identificadores del motor en lugar de copia en
  español.

```sh
bun test src/lib   # incluye locale.test.ts y typeLine
bun run check      # svelte-check + TypeScript
```

## Límite conocido

Solo existe el idioma `es-419`; no hay conmutador de idioma. Agregar otro exige
una capa de mensajes (claves + diccionarios) y no se declara hasta estar
implementada y probada.
