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
| Línea de tipo (`Criatura legendaria — Humano Mago`, `Tierra básica — Llanura`, `Ficha de criatura — Soldado`) | `cards.ts` (`typeLine`) | Español con reserva |

La línea de tipo es solo presentación: el agrupamiento de fichas, los filtros de
zona y las comprobaciones de reglas siguen leyendo las claves inglesas del motor
(`Creature`, `Land`, `Token`, …). Si aparece un tipo sin traducción verificada,
la línea completa vuelve al inglés en lugar de mezclar idiomas a medias.

## Qué sigue en inglés

- **Nombres de carta, texto de reglas y texto de ambientación.** Mesa no traduce
  datos de carta: los nombres y textos provienen de Phase (`static/data/cards.json`,
  fixture upstream) y el arte se resuelve por `oracle_id`/nombre de cara en
  Scryfall, cuya base por defecto es inglesa.
- Traducir a mano esos textos inventaría nombres que no coinciden con la
  impresión real y rompería la identidad de carta que usan la caché de imágenes,
  las pruebas y el motor. Es una decisión de datos, no de copia.

Cómo añadirlo más adelante, sin tocar reglas:

1. Consultar Scryfall con `lang:es` (o el idioma elegido) por `oracle_id` y
   mostrar `printed_name` / `printed_text` de la impresión localizada.
2. Guardar esa capa como superposición cacheada con reserva al inglés, igual que
   hoy falla la imagen: nunca información oculta, siempre identificable.
3. Verificar que el nombre localizado sigue identificando la misma carta (misma
   cara, mismo `oracle_id`) y que la vista ampliada y las pruebas de
   accesibilidad siguen pasando.

En este entorno la API de Scryfall no es alcanzable (ver
`docs/VERIFICATION-0.3.md`), así que esa capa no está implementada ni simulada.

## Subtipos con reserva

El mapa de `cards.ts` traduce los 50 subtipos del catálogo que tienen forma
española verificable. Se dejan en inglés los que no la tienen confirmada
(`Aetherborn`, `Glimmer`, `Phyrexian`). `Berserker` se mantiene igual porque las
impresiones en español también lo usan.

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
