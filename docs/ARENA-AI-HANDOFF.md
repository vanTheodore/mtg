# Mesa — handoff a Arena.ai (4 de noviembre de 2026)

**Encargo completo y fuente de verdad:** [Misión Arena.ai — Mesa 1.0, issue #42](https://github.com/vanTheodore/mtg/issues/42).

Esta rama `docs/arena-ai-handoff-20261104` contiene únicamente documentación para facilitar el traspaso. No modifica `main`, el motor ni CI; **no la confundas con una entrega funcional**. Copia estas directivas o incorpóralas en tu rama de trabajo solo si corresponde.

## Diagnóstico inicial, de fuentes reales

| Recurso | HEAD revisado | Evidencia |
| --- | --- | --- |
| [main](https://github.com/vanTheodore/mtg) | `90ce36f23507ca069e826b825d14afc1a65c2227` | Último merge de Arena 0.8.2 |
| [PR #39](https://github.com/vanTheodore/mtg/pull/39) | `997b9bc83093b0a1624f61ca64c6d10c73273346` | [CI #41895147893](https://github.com/vanTheodore/mtg/actions/runs/41895147893): static, native, WASM verdes; **45 Chromium PASS, 1 FAIL, 1 SKIP** |
| [PR #41](https://github.com/vanTheodore/mtg/pull/41) | `1dbe12611367b5d0a7c216b625b0770cf679df55` | [CI #41892364979](https://github.com/vanTheodore/mtg/actions/runs/41892364979): static, native, WASM verdes; **50 Chromium PASS, 1 FAIL, 1 SKIP** |
| [HUD 0.8.4 experimental](https://github.com/vanTheodore/mtg/tree/ui/arena-compact-engine-status-20261104) | `972b76ef0474c4a200925e6a8431381bd365c83f` | Sin PR, sin CI ni merge; revisar propuesta por separado |
| [Phase upstream #40](https://github.com/vanTheodore/mtg/issues/40) | Pin `b17e4fb` | Auditar más tarde, fuera del rediseño |

**Fallos precisos, no solo «CI rojo»:**

- #39: `tests/e2e/ui-deck-10e.spec.ts:336` falla con `No se pudo pulsar la carta` de `tests/e2e/support/board-driver.ts:93` en una partida Phase real y larga. Anteriores E2E indicaron botones de `CardView` interceptando puntero. El nuevo toolbar de iconos de #39 redujo de 10 fallos a 1; **no asumir que eliminó el último**. Analizar artefactos y reproducir la interacción, no emplear click forzado.
- #41: `tests/e2e/hand-overflow-evidence.spec.ts:203` captura opacidad **0.163964** en medio de transición CSS; `pointerHitsToolbar=true`. Esperar explícitamente estabilidad antes de medir. Casi todo el diagnóstico de mano se aprobó, incluida transición 1440 → 390 → 1440. A 1440/4 cartas se observó una cara rotada parcialmente fuera del scrollport a la izquierda sin overflow reportado: tratar como hipótesis independiente.
- #41 nace de `main` previo a #39. Al integrar #39, actualizar la base del siguiente PR y volver a correr los E2E. **No fusionar el PR #41 sin reconciliar esas diferencias**.
- La suite de #39 midió **0px** de deuda en el espejo sintético 6 tierras + 4 criaturas por lado con 7 cartas, y **137px** durante `DeclareBlockers` real Phase a 1440×900. No son la misma escena; el objetivo de la misión es dejar también el combate real en una sola pantalla, manteniendo decisiones/foco/cartas.

## Primer comando recomendado para el agente

```sh
git clone https://github.com/vanTheodore/mtg.git
cd mtg
bun install --frozen-lockfile
gh issue view 42 -R vanTheodore/mtg
gh pr view 39 -R vanTheodore/mtg
gh pr view 41 -R vanTheodore/mtg
bun run check
bun test src/lib
```

Comprueba `main` y el estado remoto al iniciar. El motor WASM **no viene en Git**; en CI se construye y, para jugar en Windows en `main`, sigue `docs/LOCAL-ASSETS-WINDOWS.md`.

## Resultado exigido

Trabajo en PR separados, con commits y evidencias (capturas + métricas + tests), no una respuesta de solo investigación. Primero sanear CI y clics reales, luego mejorar interfaz y móvil; Phase sigue siendo autoridad de reglas y el modo Clásico no se rompe. Si el CI de una rama es rojo, dejarla en draft y explicar claramente por qué. Sin merge ni despliegue a ciegas.
