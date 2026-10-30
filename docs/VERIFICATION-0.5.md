# Verificación 0.5 — «Jugar Magic, no depurar Magic»

Objetivo de la ronda: que Mesa se sienta como un juego. Lo que sigue separa lo
que **se ejecutó** de lo que solo se puede ejecutar en una máquina con navegador.

## 0. Resumen honesto

| Punto pedido | Estado |
|---|---|
| 1. Conseguir verificación visual | **Bloqueado en este entorno**, con evidencia (§1). Runbook y preflight listos para Windows/Edge. |
| 2. Corregir el E2E de bloqueo | **Hecho**: el spec asigna una bloqueadora real y exige la prueba de que Phase la aceptó (§2). La cadena que usa está probada en Bun. |
| 3. Auditoría de experiencia | **Hecho como auditoría de código**, con los clics contados sobre las rutas reales (§3). Lo visual queda pendiente de navegador. |
| 4. Mejoras de presentación | **Solo las verificables**: un defecto real de marcado de bloqueadoras, feedback de combate en el registro y un atajo de dos pulsaciones (§4). El resto queda propuesto, no aplicado. |
| 5. Rendimiento en interacción | **Medido y optimizado con números antes/después** (§5). |
| 6. Cerrar la documentación del PR | **Hecho** por la API REST (§6). |

## 1. Navegador: qué se intentó y qué falta

No es una suposición; son las comprobaciones de esta máquina:

| Comprobación | Resultado |
|---|---|
| `which chromium chromium-browser google-chrome microsoft-edge` | ninguno |
| `ldconfig -p` para `libnss3`, `libgbm`, `libatk-1.0`, `libxkbcommon`, `libpango`, `libcairo`, `libasound`, `libcups`, `libdrm` | **0 coincidencias** en todas |
| `bun x playwright install chromium` | `error: Socket is closed  code: "ERR_SOCKET_CLOSED"` (CDN bloqueado) |
| `bun --bun playwright test` | `launch: Executable doesn't exist at …/chrome-headless-shell` |
| `~/.cache/ms-playwright` | inexistente |
| Egress | npm, PyPI y GitHub sí; `cdn.playwright.dev`, `playwright.azureedge.net`, `storage.googleapis.com`, `deb.debian.org`: no |

Con eso, los E2E pendientes de 0.3, 0.4, 0.4.2 y 0.4.3 **no se ejecutaron** y no
se declara ningún resultado suyo.

Lo que sí quedó preparado y verificado aquí:

- `scripts/preflight.ts` — comprueba motor, datos, navegadores, Edge/Chrome
  instalados y CDN; sale con 1 si no se puede correr el E2E. Su salida real está
  en `docs/BROWSER-RUNBOOK.md`.
- `playwright.config.ts` — `MESA_BROWSER=msedge|chrome` usa el navegador **ya
  instalado** (`channel`), sin descargar nada; `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`
  sigue mandando. Verificado con `--list`: 25 pruebas listadas bajo el proyecto
  `msedge` y bajo `chrome`.
- `docs/BROWSER-RUNBOOK.md` — pasos para Windows/Edge, cómo generar el artefacto
  WASM (que **no** está versionado) y qué mirar en cada pantalla.

## 2. E2E de bloqueo, corregido

**Antes**: `sawBlock` se ponía a `true` al *entrar* en `DeclareBlockers`. Eso
prueba que la ventana apareció, no que alguien bloqueara.

**Ahora** (`tests/e2e/ui-deck-10e.spec.ts`, prueba «bloqueo real»):

1. se juega hasta declarar un atacante y comprobar que la carta muestra
   `data-combat-role="Atacando"`;
2. en la ventana de bloqueo del asiento defensor se elige una criatura que el
   motor ofrece como bloqueadora (`data-block-options > 0`);
3. se pulsa el atacante para formar el par; la lista «Bloqueos elegidos» debe
   nombrar a **las dos** criaturas, no ids;
4. se confirma y se exige revisión nueva del motor;
5. **prueba de aceptación**: el registro contiene «X bloquea a Y», que es la
   traducción del evento `BlockersDeclared` de Phase — no una suposición del
   cliente;
6. **estado visible**: la bloqueadora queda con `data-combat-role="Bloqueando"`
   y su tira de estado lo dice.

La prueba larga ya no cuenta bloqueos por entrar en la ventana: solo si el
registro contiene «bloquea a».

La cadena que el spec recorre está probada en Bun (`interaction-contract.test.ts`,
10 casos): el par `[bloqueadora, atacante]` que se envía, el rechazo de pares que
Phase no ofrece, y la traducción de `BlockersDeclared` a texto.

## 3. Auditoría de experiencia (con ojos de jugador, sin pantalla)

Metodología: lectura de los componentes que el jugador ve
(`Board`, `Hand`, `CardView`, `DecisionPanel`, `HistoryPanel`) contando **pulsaciones
reales** de cada flujo, no impresiones. Los tamaños (320/375/390/768/1440) están
cubiertos por `visibility.spec.ts`, que **no se ejecutó**.

| Flujo | Pulsaciones antes | Ahora | Cómo se sabe |
|---|---|---|---|
| Jugar una tierra | 2 (carta + botón del panel) | 2, ambas **sobre la carta** | `secondActivation()` (probado) |
| Lanzar criatura con maná automático | 2 | 2 sobre la carta | ídem; si hay dos formas de lanzarla, sigue siendo selección |
| Declarar ataque con *n* criaturas | n + 1 | n + 1 | un destino único se asigna solo (`selectObject`) |
| Declarar un bloqueo | 3 | 3 | bloqueadora → atacante → confirmar |
| Ampliar una carta | doble clic o botón | igual | `CardView` (`ondblclick`, botón «Ampliar») |
| Pasar prioridad | 1 | 1 | botón «Pasar» del panel |

Hallazgos, con su evidencia:

1. **Las bloqueadoras nunca se marcaban.** `combatRole()` leía
   `state.combat.blockers`, un campo que Phase **no envía**: el motor serializa
   `CombatState` con `blocker_assignments` (atacante → bloqueadoras) y
   `blocker_to_attacker` (bloqueadora → atacantes). Consecuencia: la insignia
   «Bloqueando» no aparecía nunca y el jugador no veía su propio bloqueo.
   **Corregido** (`types.ts` + `interaction.ts`), con prueba sobre la forma real
   del JSON y sobre el caso CR 509.1g (bloqueadora cuyo atacante salió del
   combate).
2. **El registro no contaba el combate.** `AttackersDeclared` y
   `BlockersDeclared` se descartaban, así que atacar y bloquear no dejaba rastro
   legible. **Corregido**: «Atacan X, Y (Jugador 2).» y «B bloquea a A.».
3. **Los controles por carta son muchos.** Cada carta dibuja una fila con
   «Ampliar» (y «Reintentar imagen» cuando falla el arte): en un tablero de 40
   permanentes son 40 botones más. **Propuesta, no aplicada**: mostrarlos al
   pasar el ratón o al enfocar con teclado (`:focus-within`), porque un cambio
   así solo se puede aprobar viéndolo.
4. **Sin arte, la carta girada no se gira.** La rotación se aplica solo a la
   imagen (`img.tapped-img`); la cara de reserva no rota y la única señal es la
   insignia «Girada». **Propuesta, no aplicada** (visual).
5. **La pila y la prioridad** se explican con `decisionGuide` y `StackPanel`;
   hay auto-paso configurable y el motor decide cuándo recomienda pasar. No se
   puede juzgar legibilidad sin pantalla.
6. **Accesibilidad de teclado**: las cartas son `role="button"`, `tabindex="0"`,
   Enter/Espacio seleccionan y Mayús+Enter amplía; el diálogo de asiento lleva el
   foco y el tablero queda `inert`. Con la mejora de la segunda pulsación, Enter
   dos veces juega una tierra o lanza el único hechizo disponible.

## 4. Cambios aplicados en esta ronda

| Cambio | Por qué es verificable |
|---|---|
| `combatRole` lee `blocker_to_attacker` (+ `blockedAttackerIds`) | Prueba sobre la forma real del `CombatState` de Phase |
| `AttackersDeclared`/`BlockersDeclared` en el registro | Prueba de texto esperado y de «no inventar nada» sin pares |
| Segunda pulsación confirma la acción obvia (`secondActivation`) | 5 pruebas: tierra, hechizo único, dos opciones (no confirma), prompt (no confirma), permanente sin acción |
| `attackDeclaration`/`blockDeclaration` extraídos y probados | Se comprueba el par exacto `[bloqueadora, atacante]` |
| E2E de bloqueo reescrito | Prueba estática que ata cada selector del spec a la fuente del componente que lo dibuja |

**No se tocó**: catálogo, packs, motor Phase, formatos, ni una sola regla.

## 5. Rendimiento durante la interacción

`bun scripts/measure-interaction.ts` mide el trabajo **por acción** sobre
snapshots con forma de Phase (rol de combate, insignias, seleccionable, registro
de 13 eventos), barriendo el tamaño del tablero:

| Permanentes | Antes | Después |
|---|---|---|
| 8 | 165 µs | 24 µs |
| 20 | 392 µs | 48 µs |
| 40 | 525 µs | 70 µs |
| 80 | **1202 µs** | **142 µs** |

Causa y arreglo: `manaActions(s, id)` aplanaba **todas** las acciones legales del
tablero para **cada** permanente dibujado (coste cuadrático con el tablero). Ahora
consulta el cubo del objeto por el que se pregunta. **8,5× más rápido** en un
tablero de 80 permanentes, con el mismo resultado (prueba incluida).

`interaction-budget.test.ts` fija un presupuesto (80 permanentes < 800 µs y
crecimiento < 24× de 10 a 80) para que la regresión no vuelva sin que nadie lo
note.

Lo que estas cifras **no** miden: layout, pintado, ni la llamada al motor. Eso
necesita el navegador; el proxy `presentation_ms` de la sesión lo mide en vivo
cuando hay motor.

## 6. Documentación del PR

`gh pr edit` sigue fallando por *Projects (classic)*; el cuerpo se actualizó con
la **API REST** (`gh api -X PATCH repos/vanTheodore/mtg/pulls/1`). Describe 0.5 y
separa, fase por fase, lo verificado de lo pendiente.

## 7. Lo que no se afirma

- Que los E2E pasen: no se ejecutaron, no hay navegador.
- Que la interfaz se vea bien: no hay capturas.
- Que la partida sea fluida de verdad: se midió el trabajo del cliente, no el
  fotograma.
- Que el artefacto WASM exista en el clon: no está versionado; ver
  `docs/BROWSER-RUNBOOK.md` §3.

## 8. Identidad

- Rama `arena/5f317145-mtg`; PR #1 **abierto**, sin merge ni despliegue.
- Motor Phase `c2fbb7a6634a440c7c6b47e6a87a554cc7382f05`, sin cambios.
- `bun test src/lib`: **188 pasan, 0 fallan**; `bun run check`: 0/0;
  `bun run build`: correcto.
