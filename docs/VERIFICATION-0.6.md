# Verificación 0.6 — «Mi primera partida»: una lección jugable para quien nunca vio Magic

Mesa 0.6 no añade reglas ni cambia el motor: **añade una lección**. El
objetivo es concreto: alguien que nunca ha jugado Magic (y viene de otro
TCG) abre Mesa, entra desde la portada y termina una secuencia jugable de
diez minutos sin tener que saber nada de reglas.

Este documento separa lo que se comprobó en este entorno de lo que tuvo que
ir a CI, porque aquí el motor WASM no compila (3.54 GB de pico frente a 3.9 GB
de RAM, sin swap) y los artefactos de CI no se pueden descargar. La lección se
ejecutó de verdad en CI, con Phase compilado a WASM y Chromium real: los
resultados están en §4.2.

## 0. Resumen

| Punto | Estado |
|---|---|
| Lección completa, 9 pasos, con el motor Phase | **Hecho** (§2): guion, máquina y panel |
| Phase es la única autoridad | **Hecho** (§3): cada acción debe ser aceptada por Phase; el ataque combina objetivos que Phase habilita |
| Rival guiado, sin IA | **Hecho** (§3.3): el maniquí solo responde a lo que el motor pregunta |
| Entrada visible desde la portada | **Hecho** (§2.1): «¿Primera vez con Magic?» → «Aprender a jugar» |
| Diseño, accesibilidad y anchos | **Hecho** (§5): 320/375/390/768/1440, teclado, foco visible, sin color solo |
| Pruebas de la lección | **Hecho** (§4.1): 39 pruebas unitarias, todas en verde; 227 en el repositorio |
| Lección jugada en Chromium con el WASM real | **Hecho** (§4.2): 3/3 pruebas en verde en CI, con capturas publicadas |
| Cambios en Phase | **Ninguno** (§6) |

## 1. La lección en una línea

Nueve pasos: entender las vidas → jugar una tierra → generar maná → lanzar una
criatura → leer fuerza y resistencia → terminar el turno → atacar → ver el
daño → pantalla final con opción de repetir.

Cada paso explica **una** cosa, en español llano, y resalta la carta con la
que hay que jugar. No se explica la pila, la prioridad ni las habilidades
complejas antes de que hagan falta.

## 2. Qué se construyó

### 2.1 Entrada

La portada (`src/lib/components/Board.svelte`) abre con un bloque
«¿Primera vez con Magic?» y un botón **«Aprender a jugar»** que lleva a
`/aprender`. No hace falta construir un mazo, importar cartas ni configurar dos
jugadores: el mazo y la semilla los pone la lección.

### 2.2 Las tres piezas y por qué están separadas

| Archivo | Responsabilidad | Qué **no** hace |
|---|---|---|
| `src/lib/tutorial/lesson.ts` | El guion: pasos, texto, mazo, semilla y el selector de acción de cada paso | No decide nada: elige entre las acciones que el motor ya publicó |
| `src/lib/tutorial/machine.ts` | Reductor puro: lee un snapshot, devuelve como máximo **una** acción | No toca el DOM, ni la sesión, ni la red |
| `src/lib/tutorial/controller.svelte.ts` | Puente con el motor: inicia la partida, envía la acción, proyecta el estado | No evalúa reglas |

La máquina es **idempotente para el mismo snapshot**: la misma secuencia de
snapshots produce siempre las mismas decisiones. Eso es lo que hace la lección
reproducible y lo que permiten sus pruebas unitarias, sin motor.

`src/lib/tutorial/glossary.ts` guarda las 22 palabras que la lección
introduce; se muestran a demanda («Palabras nuevas»), nunca en una ventana
modal.

### 2.3 El panel

`src/lib/components/Tutorial.svelte` monta el panel de la lección y el
tablero. En pantallas anchas el panel va a la columna derecha (a partir de
960 px) y en el móvil va arriba del tablero, de modo que **la explicación
nunca tapa el tablero**. El DOM mantiene el panel primero para que un lector
de pantalla lea la lección antes que las cartas.

## 3. Qué ejecutó Phase

### 3.1 Toda acción viene del motor

Cada paso declara un `perform(snapshot, ctx)` que devuelve una acción basada
en el estado y las opciones autorizadas por Phase. Para tierras, maná y hechizos,
usa acciones publicadas en `snapshot.legal`. Para **declarar atacantes**, primero
comprueba `valid_attacker_ids` y `valid_attack_targets_by_attacker` publicados por
Phase y construye la declaración en el formato que utiliza Mesa; **Phase vuelve
a validar esa declaración**. No debe describirse como una copia literal de
`snapshot.legal`.
Si el motor no ofrece la oportunidad todavía, la máquina pasa la prioridad —
una acción publicada por el motor— para llegar al momento oportuno. Si nunca
llega, la lección lo dice y ofrece «Saltar este paso»: **nunca fuerza un
estado**.

| Paso | Acción que ejecuta Phase |
|---|---|
| Jugar la tierra | `PlayLand` |
| Generar maná | `TapLandForMana` |
| Lanzar la criatura | `CastSpell` |
| Terminar el turno | `PassPriority` (en cadena) |
| Atacar | `DeclareAttackers` |
| Pagar un coste, si el motor lo pide | `ActivateManaSource` / `TapLandForMana` |

### 3.2 Las reglas no están duplicadas

Los predicados de «paso cumplido» (`battleStepIsDone`) **leen** lo que el
motor publicó: una tierra en el campo, la reserva de maná, el número de vidas
del rival, los atacantes declarados. No hay una segunda implementación de
ninguna regla en TypeScript.

Un detalle que conviene dejar escrito: la regla de «no puedes atacar con una
criatura recién llegada» la aplica el motor (CR 302.6); la lección solo
comprueba que la criatura siga en el campo y que el motor acepte la
declaración.

### 3.3 El rival es un maniquí guiado

No hay IA. El maniquí solo responde a lo que el motor le pregunta:

- `Priority` → `PassPriority`.
- `DeclareAttackers` → la propuesta del propio motor de **no** declarar atacantes.
- `DeclareBlockers` → la propuesta del propio motor de **no** declarar bloqueadoras.
- `MulliganDecision` → conservar la mano.

Su mazo son 40 Llanuras que nunca usa.

### 3.4 Reproducibilidad

Mazo: 20 Llanuras + 20 Savannah Lions contra 40 Llanuras. Semilla fija
(`20261030`) y primer jugador fijo (el aprendiz). El motor baraja con una
semilla, así que la mano inicial es la misma en cada partida y en cada
repetición. Si la mano inicial no alcanzara para la lección (falta una tierra
o una criatura), Mesa pide una nueva mano, como en una partida real, hasta
dos veces.

## 4. Pruebas

### 4.1 Pruebas unitarias (ejecutadas aquí)

```
$ bun test src/lib
227 pass
0 fail
2229 expect() calls
```

De ellas, 39 son de la lección:

- `src/lib/tutorial/__tests__/lesson.test.ts` (14): el guion, el mazo, la
  semilla, los selectores de acción, el glosario y los pips de coste.
- `src/lib/tutorial/__tests__/machine.test.ts` (22): la máquina con snapshots
  sintéticos que tienen **la misma forma que los que publica el motor**.
- `src/lib/tutorial/__tests__/action-slot.test.ts` (3): la decisión que
  espera a que el motor quede libre.

Las pruebas comprueban, entre otras cosas, que la máquina **respeta las opciones autorizadas por Phase**:
usa las acciones publicadas por el motor donde existen y, en la declaración
de ataque, solo objetivos que Phase declara atacables y que ante un estado inesperado se detiene en vez de
forzar.

### 4.2 Pruebas de navegador (Chromium + WASM real)

`tests/e2e/tutorial.spec.ts` juega la lección como lo haría una persona:

1. **La lección completa**: entra desde la portada, juega la tierra, genera
   maná, lanza la criatura, termina el turno, ataca y comprueba que el
   maniquí pasa de 20 a 18 vidas.
2. **Acción inesperada**: toca la carta que no toca y la lección explica por
   qué, sin romperse.
3. **Repetición determinista**: repite la lección y comprueba que la mano
   inicial es la misma.
4. **Teclado y axe**: el botón principal se alcanza con `Tab`, la carta
   resaltada se activa con `Enter` y axe no encuentra violaciones graves.
5. **Cinco anchos**: 320, 375, 390, 768 y 1440 px, sin desbordamiento
   horizontal y sin solapamiento entre el panel y el tablero.

Este entorno **no puede ejecutar** esa suite: no hay Rust ni el artefacto WASM,
y el motor no compila aquí por falta de RAM. La evidencia sale de CI, en un
workflow **nuevo y aparte** (`.github/workflows/lesson.yml`) que compila
Phase, juega la lección en Chromium y sube las capturas y el informe como
**artefactos de GitHub Actions**. Ya no fuerza escrituras en una rama de evidencias;
el token del workflow es de solo lectura.

**Resultado (ejecución `41024422260`, commit `c937be0`):**

| Prueba | Resultado |
|---|---|
| La lección se completa jugando de verdad con el motor Phase | ✓ (4.4 s) |
| La lección se puede usar con teclado y sin axe grave | ✓ (2.8 s) |
| La lección se ve entera en 320, 375, 390, 768 y 1440 px | ✓ (2.8 s) |

Las tres en verde: `3 passed`, y el rastro de decisiones que el motor dejó en
el informe va de `MulliganDecision` (rev 0) al daño de combate (rev 47). El
veredicto del workflow sale del **informe de cada prueba** (JSON de
Playwright), no del código de salida del proceso: en una ejecución anterior el
runner terminó con un código distinto de cero aunque las tres pruebas
hubieran pasado, y ese rojo no era de la lección.

### 4.3 Lo que encontraron las primeras ejecuciones en Chromium

La lección se ejecutó de verdad en CI varias veces, y cada ejecución encontró
un defecto que ninguna prueba unitaria podía ver (todas necesitan el motor).
El rastro de decisiones que la lección escribe en la consola durante el
desarrollo es lo que permitió localizarlos:

| Defecto | Síntoma | Causa | Corrección |
|---|---|---|---|
| La decisión se perdía | La tierra nunca se resaltaba: la lección esperaba un momento que no llegaba | La decisión que llegaba mientras el motor atendía la anterior se descartaba | `ActionSlot`: la decisión espera a que el motor quede libre |
| El maniquí no sabía responder a la limpieza | La lección se quedaba en «Termina tu turno» | Al final del turno el motor pide descartar hasta siete cartas (CR 705.2) y el maniquí no contestaba | `discardAction`: se responde con una de las selecciones legales que publica el motor |
| El paso de ataque se completaba demasiado pronto | El texto del daño se leía antes de que el daño existiera | El paso se completaba al declarar el ataque, no al recibir el daño | El paso se completa cuando las vidas del maniquí bajan |

Los tres están cubiertos ahora por pruebas unitarias (39 en total para la
lección) y por la suite de navegador.

> El workflow principal (`ci.yml`) está siendo arreglado en el PR #2 (el
> diagnóstico de `Cargo.lock`) y este PR **no lo toca**: por eso la evidencia
> de la lección vive en su propio workflow. El fallo del job `browser` del CI
> principal es previo a esta fase.

## 5. Diseño y accesibilidad

| Requisito | Cómo se cumple |
|---|---|
| Resaltar la carta con la que hay que jugar | Anillo + texto «Toca esta carta» (`data-tutorial-focus`, `aria-current="step"`) |
| Explicaciones que no tapan el tablero | Panel en columna aparte a partir de 960 px; arriba del tablero en móvil |
| Coste visible | Pips de maná (`ManaCost.svelte`), no solo texto |
| Cambios de turno visibles | Banda de turno: «Tu turno · turno 2 · Fase principal» / «Turno del maniquí» |
| Ataque y daño representados | «Atacan: Savannah Lions» y las vidas del rival en su panel |
| Ayuda sin interrumpir | «Ver el repaso» y «Palabras nuevas» desplegables; nunca un modal |
| Identidad visual y temas | Se reutilizan los componentes y los tokens de Mesa (claro/oscuro/sistema) |
| Teclado | Todo son botones y enlaces reales, con foco visible |
| No solo color | El resaltado combina anillo, texto y posición; el daño se anuncia con texto |

### 5.1 Capturas

Las hizo el navegador de CI, con el motor real de fondo:

| Captura | Qué muestra |
|---|---|
| `docs/screenshots/tutorial-1440.png` | Paso 4: la criatura resaltada en la mano, el coste en pips y el maná en la reserva |
| `docs/screenshots/tutorial-combate-1440.png` | Paso 8: el maniquí pasa de 20 a 18 vidas |
| `docs/screenshots/tutorial-final-1440.png` | Paso 9: «¡Lo lograste!» y el botón de repetir |
| `docs/screenshots/tutorial-320.png` | La misma lección en 320 px: el panel arriba y la mano deslizable |
| `docs/screenshots/tutorial-{375,390,768}.png` | Los otros tres anchos |

## 6. Lo que este PR no toca

- **Phase** (`crates/phase-engine`, `crates/mtg-engine-wasm`): ni una línea.
- **`ci.yml`**: ni una línea (el PR #2 lo está modificando).
- Sin dependencias nuevas, sin backend, sin servicios externos, sin IA
  generativa.
- Sin merge ni deploy.

## 7. Límites conocidos

- La lección enseña **un mazo y un turno**: no cubre instants, respuestas,
  contralados, reemplazos ni estados de juego.
- El maniquí no bloquea ni ataca: el bloqueo se explica, pero no se practica.
- La evidencia de navegador depende de CI mientras el motor no se pueda
  compilar en el entorno de desarrollo (aquí no entra).
- El job `browser` del CI principal sigue en rojo por el diagnóstico de
  `Cargo.lock` que trabaja el PR #2; esta fase no lo toca.

## 8. Mesa 0.7 (propuesta)

1. **Repetir con variación**: que «Repetir la lección» ofrezca la misma mano
   o una nueva, y que el panel mida cuánto tardó el principiante.
2. **Una segunda lección**: «tu primer bloqueo», con el mismo motor y el
   mismo maniquí.
3. **Un maniquí que responde**: que pueda bloquear de verdad, siempre con las
   acciones que Phase le ofrece, para enseñar el bloqueo de verdad.
4. **Modo práctica con pistas**: que el panel sugiera la jugada siguiente sin
   imponerla.
