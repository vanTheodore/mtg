# Mano tipo abanico — segunda etapa Arena

PR dependiente de la primera adaptación a Svelte 5.

- De 2 a 20 cartas, en vista Arena a partir de 1100 px: perfil **wide** de Phase (mismos umbrales de solapamiento, rotación y arco).
- Hover o foco de teclado: eleva la carta y la devuelve al eje para leerla.
- En 320/375/390/768 px y con manos de más de 20 cartas se conserva el scroll original. En escritorio también hay scroll por accesibilidad.
- Con Ajustes → Clásico desaparece el abanico.
- Se preservan los nodos DOM, los nombres accesibles, las acciones de Phase y el tutorial.
- Sin JS para arrastrar, sin React, sin dependencias, sin animación continua.
- En dispositivos con movimiento reducido se eliminan las transiciones.

Antes de fusionar: Chromium debe validar los 30 objetos, foco secuencial, 7 cartas
y partida real, además de verificar que la nueva capa Arena original ha sido fusionada.

Fórmulas portadas con atribución desde `client/src/components/card/fanGeometry.ts` y `client/src/components/hand/handFanPresentation.ts`, Phase @ 0dd35e4, MIT/Apache-2.0. No se importó React.
