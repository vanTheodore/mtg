# Mesa Arena 0.8 — HUD contextual (3 noviembre 2026)

Primera fase del [issue #19](https://github.com/vanTheodore/mtg/issues/19). Apilada sobre [PR #18](https://github.com/vanTheodore/mtg/pull/18).

- Arena: el evento más reciente permanece visible y anunciado con aria-live; la bitácora completa de las doce últimas resoluciones se despliega con un details/summary nativo y foco de teclado.
- Clásico mantiene el registro siempre abierto.
- Escritorio amplio: decisiones legales en una columna principal junto a pila e historial. Sin duplicar acciones ni estado del motor.
- Móvil: conserva la disposición vertical, privacidad del traspaso de asiento y accesibilidad.

Verificar batalla real, 12 resoluciones al expandir, geometría en 1440×900 y 390×844, cambio de modo, axe y CI completo. No afirmar paridad visual completa con Phase ni fusionar sin CI.
