# Primera adaptación de la UI Arena de Phase a Svelte 5

Referencias estudiadas: https://github.com/phase-rs/phase (licencias MIT / Apache-2.0).
Componentes upstream: ArenaBackground.tsx, GameBoard.tsx, PlayerArea.tsx, OpponentSeatPane.tsx.

- ArenaSurface.svelte: cinco ambientes por color de maná, superficies y anillos CSS sin texturas ni shaders.
- Board.svelte y Tutorial.svelte: la misma escena detrás de los controles ya existentes.
- Battlefield.svelte, PlayerPanel.svelte, Hand.svelte: se mantienen como componentes Svelte reales conectados a Phase; arena.css cambia la presentación sin duplicar reglas.
- Ajustes: el usuario puede regresar a Clásico y se conserva la preferencia en localStorage.
- No se importa React, Framer Motion, Tailwind, arte de cartas ni dependencias adicionales.

La primera versión es estática para funcionar en PC de pocos recursos. No hay efectos continuos.
Conservar privacidad de manos en el paso de asiento, controles de teclado, lector de pantalla,
accesibilidad móvil y reduced-motion.

Próximas fases separadas:
1. Abanico de mano accesible sin perder scroll ni compatibilidad con 30 cartas.
2. Fases de turno y líneas de ataque / bloqueo desde snapshots legales de Phase.
3. Animaciones breves de daño y entrada de cartas tras medir rendimiento y batería.

CI debe comprobar preferencias persistentes, responsive, tutorial y partida real.
No fusionar con tests rojos ni desplegar la UI sin autorización.
