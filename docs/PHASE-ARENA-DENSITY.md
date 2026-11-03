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
