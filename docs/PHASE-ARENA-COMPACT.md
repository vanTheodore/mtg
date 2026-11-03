# Mesa Arena — primera corrección medible de composición

## Por qué existe

La captura de la **partida real ganada por Phase** en el CI del PR #8
([run 41591947935](https://github.com/vanTheodore/mtg/actions/runs/41591947935),
artifact `playwright-results/test-results/ui-game-victory.png`) mide
**1280 × 2427 px**. Aunque pasan TypeScript, Bun, Rust/WASM y Chromium,
su composición sigue siendo muy vertical y dominada por cajas; no equivale
al diseño compacto e integrado del cliente Phase React.

Dos causas observables:

1. `Battlefield.svelte` reservaba dos columnas iguales para tierras y
   apoyo incluso cuando la segunda no contenía nada. Seis tierras ocupaban
   dos filas sin necesidad.
2. `HistoryPanel.svelte` mostraba hasta doce eventos a la vez, por encima
   del campo propio. Es información secundaria cuando ya se puede consultar
   el historial a demanda.

## Cambios sin alterar las reglas

- En Arena, la banda posterior solo renderiza los carriles que realmente
  contienen objetos. Si únicamente hay tierras o apoyo, ocupa todo el ancho.
  Si ambos existen, conserva las dos columnas. Si solo hay criaturas,
  no se inventa una banda posterior vacía.
- El registro de Arena muestra los **tres sucesos más recientes**, que
  siguen anunciándose con `aria-live=polite`; hasta nueve adicionales
  se despliegan con `details/summary` nativo y accesible.
- La pila vacía se compacta visualmente, conservando su texto explicativo
  en el árbol de accesibilidad.
- **Clásico permanece igual**: orden de zonas y hasta doce eventos abiertos.
- No se fabrican acciones del motor ni se mueve el estado de Phase.
  La mano del adversario y la privacidad del traspaso de asiento no cambian.

## Puertas de verificación

- `arena-zones.spec.ts`: en 1440 px, seis tierras reales de la fixture
  de presentación deben caber en una sola fila y cada carril debe ocupar
  al menos el 95 % de la anchura; se verifica para ambos asientos.
- `ui-game.spec.ts`: partida WASM real hasta la victoria, tres últimos
  eventos visibles, nueve accesibles al desplegar el historial, sin
  pérdida de eventos.
- Suite completa de Bun, SvelteKit, paridad nativa, WASM y Chromium.
- Comparar la nueva captura de victoria con el artefacto base para medir
  el alto final. **No se afirma aún paridad visual con Phase.**

## Siguiente iteración

Contrastar fase por fase contra capturas de Phase React equivalentes,
priorizar HUD, tamaño de cartas, pila/acciones y mano inferior.
Medir siempre layout y accesibilidad antes de integrar a `main`.
