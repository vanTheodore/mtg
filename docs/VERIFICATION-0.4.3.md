# Verificación 0.4.3 — «Que el mazo se pueda jugar»

Ronda de flujo real, no de infraestructura: pegar un mazo de Décima Edición,
saber qué cartas están disponibles, descargar solo lo necesario y llegar al
motor. No se amplió el catálogo, ni los formatos, ni ninguna función secundaria.

## 1. El defecto, reproducido antes de corregirlo

El constructor comprobaba el mazo contra el **catálogo cargado en memoria**. Con
solo el pack core descargado, una carta que el índice conocía perfectamente se
clasificaba como ausente y el botón 「Jugar con este mazo」 quedaba deshabilitado
antes de que el cargador pudiera bajar su pack.

Reproducción contra el código anterior (`checkAgainstCatalog` ignoraba el
índice):

```
checkAgainstCatalog(lines, loaded)        → found: [Plains],  missing: [Serra Angel]
checkAgainstCatalog(lines, loaded, index) → found: [Plains],  missing: [Serra Angel]   ← el índice se ignoraba
¿bloquea «Jugar»? SÍ — defecto reproducido
```

La prueba que lo fija (`deck-availability.test.ts`) afirma lo contrario de lo que
hacía el código: una carta del índice es `pending`, no `missing`.

## 2. Cinco estados, explícitos

`deckStatus()` (`src/lib/game/decks.ts`) resuelve cada línea con el **índice
canónico** — el mismo que usa el cargador — y la cobertura de Phase:

| Estado | Qué significa | ¿Bloquea el inicio? |
|---|---|---|
| `absent` | ningún pack del índice la sirve | **sí**: el motor la omitiría |
| `pending` | el índice conoce su pack y ese pack no está en memoria | no: el cargador lo descarga |
| `ready` | la cara está en memoria y no tiene limitaciones | no |
| `limited` | Phase declara limitaciones conocidas para esa carta | sí, salvo consentimiento explícito |
| pack sin certificar | el pack existe pero `verified: false` | **sí**: no se juega con cartas no admitidas |

Además de los estados, la función devuelve `neededPacks` (los packs que el mazo
toca, nunca el catálogo entero), `pendingPacks` (los que faltan descargar) y
`copies`, que suma por estado y cuadra con el tamaño del mazo.

El constructor pide la **cobertura** de los packs del mazo —unos KB, no los
packs— para poder marcar limitaciones *antes* de descargar nada, y muestra un
badge por línea. `Board.svelte` comparte ese mismo mapa con la puerta de inicio:
una sola evidencia, dos usos.

## 3. Lo comprobado con los datos publicados

Contra el índice y los packs reales (`deck-start-flow.test.ts`, servidor HTTP de
verdad sobre `static/`), con el mazo del E2E pegado:

| Momento | Resultado |
|---|---|
| Solo el pack core en memoria | 17 listas · 23 pendientes · 0 ausentes |
| Tras pedir la cobertura de los packs del mazo | 17 listas · 22 pendientes · **1 con limitaciones** (`Arcane Teachings`, `SilentDrop:1_of_2`) |
| Packs necesarios | `fixture` (tierras básicas) y `10e`; pendientes: solo `10e` |
| ¿Se puede intentar el inicio? | sí: `canStart = true`, sin nombres ausentes ni packs sin certificar |
| Al iniciar | se descarga **solo** `10e`, con `?v=<sha256>` en la URL; 0 nombres ausentes, 0 sin certificar |
| Carga al motor | 40 cartas por asiento (13 nombres distintos) |
| Cobertura del mazo | 12 admitidas + 1 con limitación |

## 4. El E2E de 10E, corregido

El spec declaraba una lista que sumaba **45** cartas y esperaba 40, y dos de sus
cartas no eran exclusivas de 10E. Ahora:

- **40 cartas exactas**: 17 `Plains` (pack core) + 22 criaturas + 1 `Arcane
  Teachings`, todas las demás servidas únicamente por el pack `10e`.
- `Arcane Teachings` es la carta con limitación conocida que exige el
  consentimiento explícito; la prueba comprueba que sigue siendo la única.
- `e2e-deck-10e.test.ts` **lee el propio spec** y verifica contra los artefactos
  publicados: total 40, todas servidas por el índice, solo `Plains` del pack
  core, ninguna otra presente en el pack core, exactamente una limitación, y
  todas las cartas en el catálogo que el motor recibiría.
- Selectores revisados contra los componentes: `Mis mazos`, `data-testid="deck-builder"`,
  la lista por su etiqueta «Pega una lista», `Convertir lista`,
  `data-testid="deck-total"`, `Jugar con este mazo`, el aviso `role="alert"`, la
  casilla de consentimiento, `section[aria-label^="Tu mano"]`,
  `section[aria-label="Decisión pendiente"]`, el diálogo `Paso de asiento` y el
  `main.layout` con `inert` y `aria-hidden`.

**NO EJECUTADO.** Ver §5.

## 5. Navegador: qué se comprobó y por qué sigue bloqueado

Comprobaciones hechas en este entorno, no supuestas:

| Comprobación | Resultado |
|---|---|
| `which chromium chromium-browser google-chrome` | ninguno |
| `ldconfig -p` con `libnss3`, `libgbm`, `libatk-1.0`, `libxkbcommon` | 0 coincidencias |
| `apt-get download libnss3` | `E: Unable to locate package libnss3` (sin listas ni egress a Debian) |
| `~/.cache/ms-playwright` | no existe: nunca se descargó un navegador |
| Egress permitido | GitHub, npm, PyPI; el CDN de navegadores de Playwright no |

Con eso, el E2E —importación, descarga selectiva, advertencias de cobertura,
inicio 40/40, imágenes o fallbacks, acciones, combate y bloqueo, paso de asiento,
resultado y a11y en 320/375/390/768/1440— **queda pendiente**, escrito y sin
resultado. No se afirma que pase.

Lo que sí se ejecutó en su lugar es la ruta completa **hasta el borde del
motor**: los mismos módulos que usan los componentes, sobre HTTP real, con el
índice, los packs y la cobertura publicados (§3). Lo único que no se puede
probar sin navegador es el renderizado y la interacción, no la lógica de datos
que decidía el defecto.

## 6. Pruebas ejecutadas

| Orden | Resultado |
|---|---|
| `bun test src/lib` | **173 pruebas, 0 fallos** |
| `bun run check` | 0 errores, 0 avisos |
| `bun run build` | correcto |

Archivos nuevos o reescritos en esta ronda: `deck-availability.test.ts` (7),
`deck-start-flow.test.ts` (4, integración sobre HTTP real),
`e2e-deck-10e.test.ts` (6, valida el fixture del E2E), `tests/e2e/ui-deck-10e.spec.ts`
(reescrito, no ejecutado).

## 7. Qué no se afirma

- Que el E2E pase: no se ejecutó.
- Que la partida se haya visto ganar o perder en pantalla: eso lo prueba el E2E.
- Que el motor haya cargado 40/40 en esta ronda: el motor no está disponible en
  este entorno; lo que se probó es que el cliente le entrega 40 nombres por
  asiento y solo descarga el pack necesario.
- Que una carta `pending` sea jugable: el motor dirá qué resolvió; el aviso
  `Motor: N / M` sigue siendo la única autoridad.

## 8. Identidad

- Rama `arena/5f317145-mtg`; PR #1 abierto, sin merge ni despliegue.
- Commits de la ronda: `d1e9b12` (estados del mazo), `040efd2` (fixture del E2E),
  más el de documentación.
- Catálogo, formatos y motor sin cambios: packs e índice siguen siendo
  `index.json` v5 con `10e` en `fa1cd22d…`.
