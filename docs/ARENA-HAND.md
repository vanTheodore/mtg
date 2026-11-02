# Mano tipo abanico — segunda etapa Arena

PR dependiente de la primera adaptación a Svelte 5.

- De 2 a 7 cartas, en vista Arena a partir de 1220 px: rotación ligera y solapamiento CSS.
- Hover o foco de teclado: eleva la carta y la devuelve al eje para leerla.
- En 320/375/390/768 px y con manos de 8 o más cartas se usa el scroll original.
- Con Ajustes → Clásico desaparece el abanico.
- Se preservan los nodos DOM, los nombres accesibles, las acciones de Phase y el tutorial.
- Sin JS para arrastrar, sin React, sin dependencias, sin animación continua.
- En dispositivos con movimiento reducido se eliminan las transiciones.

Antes de fusionar: Chromium debe validar los 30 objetos, foco secuencial, 7 cartas
y partida real, además de verificar que la nueva capa Arena original ha sido fusionada.
