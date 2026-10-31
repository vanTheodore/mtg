# Verificación 0.5.2 — Chromium con Phase real: las tres pruebas de interfaz que fallaban

PR #2 consigue compilar Phase a WASM con el toolchain fijado, corregir
`Cargo.lock` y ejecutar Chromium con el motor real. Al hacerlo por fin, la
suite de interfaz se ejecutó por primera vez en un navegador y salieron tres
pruebas rojas: 23 aprobadas, 3 fallidas y 1 omitida (ejecución `41007263956`).

Este documento cuenta **por qué** fallaban, **qué** se cambió y **qué** se
comprobó después. La regla de fondo no cambió: Phase es la única autoridad
sobre las reglas, y ninguna prueba se rebajó, se omitió ni se borró.

## 0. Resumen

| Fallo | Causa raíz | Responsable | Corrección |
|---|---|---|---|
| A. «bloqueo real» se pasa de 600 s | el conductor de la prueba no sabía responder el descarte de limpieza ni jugar cartas | arnés | `tests/e2e/support/board-driver.ts` |
| B. «estado de bloqueo»: no aparece el diálogo «Paso de asiento» | la prueba nunca respondió el mulligan del primer asiento, así que el tablero nunca cambió de manos | arnés | la prueba responde el mulligan antes de esperar el diálogo |
| C. «la partida se juega hasta el final»: `waiting=DiscardToHandSize, viewer=1` | el conductor no sabía responder el descarte de limpieza: la partida se quedaba esperando una decisión que nadie tomaba | arnés | el conductor responde el descarte con el número que publica Phase |
| Extra: durante el paso de asiento se puede leer la mano del asiento entrante | producto | producto | mientras el diálogo está abierto, Mesa no dibuja ninguna mano |

Con estas correcciones la suite completa pasa: **26 aprobadas y 1 omitida**
(la omitida es `images-live.spec.ts`, que necesita salida real a Scryfall).

## 1. Lo que NO era la causa

Antes de tocar nada se comprobó, con el motor real delante, que:

- **Phase publica el descarte como debe.** En la limpieza del turno el motor
  publica `waiting_for = DiscardToHandSize { player, count, cards }` (CR 514.1):
  cuántos cartas descartar y cuáles acepta. No hay que adivinar nada.
- **Mesa lo expone y deja responderlo.** El panel muestra «Descartar N carta(s)»,
  el borrador va contando lo que se elige, «Confirmar descarte (n/N)» se
  habilita cuando el número coincide y la confirmación es un `SelectCards` con
  exactamente las cartas elegidas. En una partida de práctica, respondiendo el
  aviso como lo haría una persona, la partida sigue y el motor avanza.
- **El bloqueo funciona.** Al confirmar, el borrador nombra a las dos criaturas,
  la revisión del motor avanza, el registro trae el evento de Phase
  («X bloquea a Y») y el tablero marca «Atacando» y «Bloqueando».
- **El paso de asiento funciona.** Tras responder el mulligan del primer
  asiento, el motor cambia de asiento, el diálogo aparece con el botón
  «Estoy listo» enfocado y el tablero queda `inert` y `aria-hidden`.

Es decir: **las reglas no estaban rotas**. Lo que faltaba era un conductor de
partida que supiera responder todo lo que la interfaz ofrece.

## 2. Los tres fallos, en detalle

### A. «bloqueo real» (600 s)

La prueba juega hasta que hay un atacante, espera la ventana de bloqueo,
elige una bloqueadora, la empareja con el atacante y confirma. Antes de este
PR:

1. El bucle jugaba la partida **sin jugar nada**: solo pasaba prioridad.
   Sin tierras ni criaturas no hay atacantes, y la prueba se quedaba
   esperando «no se llegó a declarar un atacante».
2. Cuando el turno se cerraba con más de siete cartas en la mano, Phase
   pedía el descarte (CR 514.1). El conductor pulsaba siempre la **primera**
   carta de la mano, que la marcaba y la desmarcaba alternativamente: el
   número de cartas elegidas nunca llegaba al que pedía el motor.
3. La partida quedaba congelada en `DiscardToHandSize`, y cada vuelta del
   bucle gastaba segundos esperando una revisión que no iba a llegar: de ahí
   el timeout de 600 s en lugar de un fallo con mensaje.

**Corrección**: el conductor compartido responde el descarte (leyendo del panel
cuántas cartas pide Phase, nunca supuestas), juega la primera carta que Mesa
marca como jugable y responde el resto de decisiones.

### B. «estado de bloqueo» (el diálogo no aparecía)

La prueba activaba «Confirmar cada cambio de asiento», arrancaba la partida y
esperaba el diálogo «Paso de asiento». El diálogo aparece cuando **el tablero
cambia de manos**, y en una partida de dos asientos eso ocurre después de que
el primer asiento responda su mulligan (CR 103.5: los dos mulligan son
simultáneos, así que el motor pasa al segundo asiento). La prueba nunca
respondía ese mulligan, así que el asiento no cambiaba nunca y el diálogo no
tenía por qué aparecer.

**Corrección**: la prueba responde el mulligan del primer asiento (el botón
«Conservar mano» del panel) y a continuación espera el diálogo. **Las
aserciones de privacidad no se tocan**: el tablero debe seguir `inert`,
`aria-hidden`, cubierto por encima del 90 % de opacidad y con el fondo opaco.

### C. «la partida se juega hasta el final»

El mensaje del fallo era explícito:

```
La interfaz se bloqueó en el paso 46: waiting=DiscardToHandSize, viewer=1
```

Es el mismo descarte de la limpieza que en A: el motor lo pide, la interfaz lo
muestra y se puede responder, pero el conductor no lo respondía. La partida se
quedaba esperando ese descarte para siempre.

**Corrección**: el mismo conductor de A.

## 3. Qué se cambió

### Producto (2 archivos, 1 comportamiento)

| Archivo | Cambio | Por qué |
|---|---|---|
| `src/lib/components/Board.svelte` | Mientras el diálogo de paso de asiento está abierto, Mesa no dibuja la mano del asiento entrante ni los dorsos de la mano rival | **Fuga real**: el velo del diálogo solo atenúa el tablero (65 % de negro), así que la mano que se estaba entregando se leía entera en la pantalla de quien entregaba el dispositivo. Es justo lo contrario de lo que promete el diálogo |
| `src/lib/game/interaction.ts` + `src/lib/game/session.svelte.ts` | El aviso de descarte pasa a ser una función pura (`discardPrompt`) y su respuesta un constructor puro (`discardSelection`) | El comportamiento no cambia: ahora el mismo dato se puede comprobar sin navegador (prueba nueva) |

Ningún cambio toca las reglas de Phase, ni el `Cargo.lock`, ni el toolchain.

### Arnés (2 archivos)

| Archivo | Cambio |
|---|---|
| `tests/e2e/support/board-driver.ts` (nuevo) | Conductor de tablero compartido: resuelve el paso de asiento, responde el descarte de limpieza con el número que publica el panel, juega la primera carta jugable, declara atacantes y asigna bloqueadoras. Solo hace clic en lo que la interfaz muestra; nunca fabrica un `GameAction` |
| `tests/e2e/ui-deck-10e.spec.ts` | Usa el conductor. En el test del paso de asiento responde el mulligan antes de esperar el diálogo. En el del bloqueo, el atacante y la bloqueadora se buscan donde el tablero los esté mostrando (el tablero cambia de manos durante el combate) y el auto-paso se desactiva para poder leer el estado de combate que Phase publicó |

### Pruebas nuevas

`src/lib/game/__tests__/discard.test.ts` (5 casos) fija el contrato del
descarte sin necesitar motor: el aviso repite **carta por carta** lo que
Phase publicó, el aviso sin jugador pertenece al asiento que se está
mostrando, no hay descarte cuando el motor no lo pide y la respuesta es un
`SelectCards` con exactamente las cartas elegidas.

### La fuga que encontró la prueba del paso de asiento

La prueba del diálogo «Paso de asiento» comprueba que el tablero queda
inerte, cubierto y sin fuga de mano. Al ejecutarla en un navegador con el
motor real apareció algo que no estaba en el plan: **la mano del asiento
entrante estaba dibujada debajo del velo**. El velo es `rgb(0 0 0 / 65 %)`, o
sea que atenúa, no tapa: en la captura se leen las siete cartas del Jugador 2
(«Plains», «Savannah Lions»…) mientras el Jugador 1 todavía tiene el
dispositivo en la mano.

El diálogo dice «La mano del jugador anterior queda oculta» y lo que hacía
Mesa era exactamente lo contrario: escondía la mano del jugador anterior (que
ya no se está mostrando, porque el tablero ahora es del otro asiento) y
dejaba ver la del siguiente.

La corrección es que, mientras el diálogo está abierto, no se dibuja ninguna
mano: ni la del asiento entrante (que es privada) ni los dorsos de la otra
(el número de cartas en la mano es información pública, pero un tablero
«cubierto» no debería enseñar nada). El resto del tablero —campo de batalla,
registro, paneles— es información pública y puede seguir viéndose atenuado
detrás del velo.

La aserción que lo fija es discriminante: sin la corrección la prueba falla
con «Expected: 0, Received: 7» (las siete cartas del asiento entrante), y
con ella pasa.

## 4. Cómo se comprobó

En este entorno, sin Rust ni capacidad de compilar el motor, la única forma de
correr la suite con el motor real es CI. Por eso el workflow publica además el
binario en la rama `ci/wasm-mirror` (`sha256
f54eff5ecbcbcf5e44adaae2b05209cd9061fec4e86ad8ebdd66163e1151c5c4`): con él se
puede bajar el motor y correr la suite en local, sin descargar artefactos.

| Corrida | Motor | Resultado |
|---|---|---|
| Local, Chromium 153 + WASM de CI | real | `ui-deck-10e`: **4 aprobadas** (2.0 min) |
| Local, Chromium 153 + WASM de CI | real | suite completa: **26 aprobadas, 1 omitida** (3.8 min) |
| CI (`Mesa CI`, rama de este PR) | real | ver §5 |

Cada fallo se reprodujo antes de corregirlo (los tres tests fallaban con los
mensajes citados) y se vuelven a ejecutar después.

## 5. Resultado de GitHub Actions

Pendiente de la última ejecución de esta rama (se completa en el PR).

## 6. Riesgos y límites pendientes

- **El velo del paso de asiento atenúa, no tapa.** Con la corrección, lo que
  queda debajo es solo información pública, pero conviene saberlo: si mañana
  se dibuja algo privado bajo el velo, se verá. La prueba lo vigila contando
  las cartas de la mano.
- **El tablero cambia de manos durante el combate.** Las aserciones que miran
  una carta concreta tienen que buscarla en todo el tablero, no en «tu campo
  de batalla»: el asiento que se está mostrando cambia en mitad del combate.
  Es el comportamiento correcto de una partida en el mismo dispositivo.
- **El aviso de descarte depende del asiento mostrado.** El panel solo lo
  muestra cuando el descarte es del asiento que se está viendo, que es cuando
  ese jugador puede responderlo. Con un espectador de otro asiento, el motor
  sigue esperando: es el motor quien decide a quién le toca.
- **La rama `ci/wasm-mirror` guarda el binario (48 MiB).** Solo se republica
  cuando cambia el `sha256`, así que no crece en cada corrida.
- **El resto de la suite E2E depende de CI** para construir el motor; el
  espejo permite correrla en local, pero el binario oficial sigue siendo el
  que compila el workflow con `--locked`.

## 7. Qué comprobar al integrar con el PR #3 (la lección guiada)

El PR #3 (`arena/17cfe5c1-mtg`) sale de `main` y no incluye los cambios de
PR #2 ni estos. Al integrar:

- **Archivos que tocan los dos**: `src/lib/components/Board.svelte` (aquí, la
  mano del rival durante el paso de asiento; allí, el bloque «¿Primera vez con
  Magic?») y `src/lib/game/session.svelte.ts` (aquí, el aviso de descarte;
  allí, `reset()` para liberar la sesión). Son zonas distintas del archivo: el
  merge debería salir limpio, pero conviene comprobar que los dos bloques
  conviven.
- **El tutorial tiene su propio conductor** (`src/lib/tutorial/machine.ts` y
  `controller.svelte.ts`) y ya responde el descarte de la limpieza para su
  maniquí. No debe copiarse nada de aquí: el conductor compartido es para
  pruebas de interfaz, no para el juego.
- **Los dos workflows escriben ramas propias** (`ci/lesson-screenshots` y
  `ci/wasm-mirror`): no se pisan.
- **El PR #3 no toca `src/lib/game/interaction.ts`**: la función pura del
  descarte no debería entrar en conflicto.
- Después de integrar, la comprobación que falta es la del navegador con las
  dos suites a la vez (la lección de Mesa 0.6 y las 27 de interfaz) en el mismo
  motor, y confirmar que el paso de asiento de la lección no se rompe con el
  cambio de la mano del rival.
