# Mesa Arena — densidad adaptable al alto visible (3 nov 2026)

## Observación en partida real

En Chromium, la captura del PR #12 mostraba 1280 × 2124 px
([run 41644376670](https://github.com/vanTheodore/mtg/actions/runs/41644376670)).
La reducción previa de carriles/historial ahorró 303 px, pero la escena
seguía alta, especialmente los cuadros de cartas de 148 px y el abanico
con 2 rem de margen superior + 2.4 rem inferior.

## Corrección acotada

La vista **Arena** en escritorio (anchura >= 1100 px y alto <= 1000 px)
limita el ancho de las cartas a lo menor entre:

- el tamaño configurado por el usuario, multiplicado por 0.84;
- 15 % del alto visible;
- el presupuesto de dos columnas para pantallas estrechas.

Aplica lo mismo al abanico sin alterar el solapamiento, rotación,
orden del DOM ni focos de teclado. Se compactan paddings de cartas,
campo, banda de fases y mano sin esconder acciones del motor. En
Clásico, pantallas de móvil y escritorio alto no hay limitador nuevo.

No cambia Rust/WASM, el número de permanentes, las zonas privadas,
ni sustituye la ilustración fallida por un asset inventado. En
una carta pequeña, el fallback usa la estrategia existente: omitir
texto de reglas dentro de la carta y mantenerlo accesible en la inspección.

## Comprobación discriminante

`arena-ui.spec.ts` abre un juego **real con Phase** en 1440 × 900:
verifica siete cartas en la mano, ancho acotado en Arena, y que Clásico
es más ancho/alto con los mismos objetos. Luego cambia a 390 × 844
sin reiniciar el juego y comprueba la anchura original de móvil,
scroll horizontal, foco de teclado y ausencia de desbordamiento de la
página. La fixture y las pruebas existentes también siguen en el CI.

Este PR no proclama todavía paridad exacta con la captura de Phase:
queda pendiente integrar HUD, prioridad/pila/acciones en una sola escena
y medir capturas de un estado comparable.

## Arena 0.8.3: herramientas contextuales (4 nov 2026)

**Problema observado:** las acciones secundarias «Ampliar» y «Reintentar imagen»
en `CardView.svelte` tenían `opacity: 0` en escritorio con mouse, pero
seguían reservando altura bajo cada carta de las dos filas de permanentes y
del abanico. No son acciones de Phase; sus botones son herramientas de inspección
de imágenes y reglas.

**Cambio acotado:** solo en Arena con ancho ≥1280px, alto ≤1000px y
`(hover: hover) and (pointer: fine)`, la misma barra conserva sus botones
en el DOM y en el orden de tabulación, pero sale del flujo visual.
Aparece con mouse o al enfocar la carta y permanece accesible al tabular
hacia los botones. En Clásico, táctil/móvil, pantallas altas y diálogo
de inspección la barra queda en el flujo original.

El E2E nuevo verifica que un usuario de teclado puede enfocar la carta,
entrar a **Ampliar** y abrir la inspección con **Enter**, y que a 768px
los botones vuelven al flujo. Los dos E2E comparables de 1440×900
tienen puertas nuevas: menos de 90px de desbordamiento en el fixture
6 tierras + 4 criaturas por asiento + mano de 7, y menos de 300px
en un bloqueo **real** decidido por Phase. Sus baselines comprobados
del PR #37 son, respectivamente, 105px y 320px.

**No confundir criterios con resultados:** estas metas solo quedarán
acreditadas cuando Chromium del HEAD del PR las mida y todos sus trabajos
terminen en verde. El objetivo final de una pantalla sin scroll sigue
abierto en el issue #19.
