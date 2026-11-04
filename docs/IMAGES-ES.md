# Imágenes impresas de Magic en español

Fuentes: Scryfall (`lang:es`) para imágenes y MTGJSON para datos del set.
`data/mtgjson/10E.es.json` ya contiene 363 caras de Décima Edición,
pero no imágenes. MTGJSON recomienda Scryfall para el arte.

Ajustes → Idioma de la imagen: inglés (por defecto) o español cuando exista.
Solo se consulta una imagen cuando Phase muestra la identidad de la carta al
espectador actual. La mano ajena oculta no se consulta ni se revela.

El buscador usa el nombre Oracle exacto con `lang:es` y valida el Oracle ID
antes de aceptar el resultado. Exige además `image_status` `highres_scan` o
`lowres`: una impresión con imagen `missing` o `placeholder` no se
presenta como un escaneo español. Cuando no se dispone de imagen localizada, usa
la ruta inglesa existente. El cache incluye idioma y respeta intervalos,
429 y Retry-After. No se copian imágenes al repositorio.

Límite de esta fase: si hay varias ediciones en español, puede aparecer una
ilustración distinta de la edición del mazo. Para conservar impresión exacta
se necesitará exponer set y número de coleccionista en la capa de presentación
y consultar `/cards/{set}/{number}/es`. El motor Phase no cambia.

Las ilustraciones pertenecen a Wizards of the Coast y los artistas.
Respetar las directrices de Scryfall sobre créditos, proporciones y
redistribución. No es una licencia abierta para reempaquetar un catálogo.


## Validación al integrar Mesa Arena

El E2E `tests/e2e/spanish-images.spec.ts` monta una respuesta simulada de
Scryfall (sin imágenes externas) y comprueba que **Ajustes** persiste el idioma,
que la cara visible carga el escaneo español de identidad Oracle coincidente,
que volver al inglés invalida la imagen anterior y que las **cartas ocultas
nunca solicitan sus nombres**. La cara accesible conserva nombre y reglas
canónicos, independientemente del idioma del arte.

El selector no cambia la traducción de reglas de Phase ni garantiza la
impresión exacta del mazo; ese trabajo necesita datos de set y número.
