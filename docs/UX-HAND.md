# UX-HAND 1.0 — la mano del teléfono como superficie de primera clase

Referencia de diseño: la hoja **HAND** de Phase en el pin `31123e2` (`client/src/components/hand/MobileHandDrawer.tsx`), no su `DecisionPanel`. Mesa la adopta como idea —panel a pantalla completa, rejilla de cartas grandes, tocar para actuar— y se aparta de ella en dos puntos decididos con evidencia (§3).

Sin dependencias nuevas de interfaz. Svelte 5 + TS. Textos en es-419.

---

## 1. Baseline medido (Chromium real, fixture `/stress`, antes del cambio)

Fixture determinista de interfaz, 15 cartas, sin motor (el fixture no publica acciones legales). `@sparticuz/chromium` 131 desde npm con sus libs `al2023`, porque el CDN de Playwright y los artefactos de Azure están bloqueados en el entorno.

| Viewport | Cartas visibles | Ancho de carta | Desbordamiento horizontal | Desplazamiento lateral |
|---|---|---|---|---|
| 390×844 | 2 | 147 px | 0 (del documento) | **1 988 px** dentro del cajón |
| 375×844 | 2 | 140 px | 0 | 1 890 px |
| 320×844 | 2 | 112 px | 0 | 1 533 px |
| 844×390 | 5 | 148 px | 282 px | 760 px |

Con 7 cartas a 390×844 el cajón medía 78dvh y **tapaba el panel de decisión**; jugar exigía tres interacciones (abrir → tocar la carta, que cerraba el cajón y enfocaba un botón → pulsar «Lanzar»), y el cajón se cerraba justo para que se pudiera pulsar. Inspeccionar una carta de la mano no era posible desde el cajón: sólo con «Ampliar carta» en el panel.

## 2. La hoja nueva

`HandSheet.svelte` (superficie) + `HandSheetCard.svelte` (una carta). Se monta junto al disparador, fuera del `main` que el tablero marca `inert`.

- **Pantalla completa** (`inset: 0`, `100dvh`), con `env(safe-area-inset-*)` en los cuatro lados.
- **Rejilla** `repeat(auto-fill, minmax(min(132px, 100%), 1fr))`: dos columnas a 320/375/390 px, tres a 640, seis en horizontal a 844×390. Scroll **vertical** con `overscroll-behavior: contain`.
- **Inspeccionar y ejecutar dejan de compartir gesto**: tocar la cara de la carta abre un panel de detalle (texto Oracle + acciones legales); **lanzar es un botón propio de 44 px** con etiqueta (`Lanzar`, `Jugar tierra`, `Activar`, `Producir maná`). Sin lanzamientos accidentales.
- **Autoridad única**: cada acción sale de `snapshot.legal.by_object` y cada despacho pasa por `session.dispatch` (cola propia, `busy`, `stale_action` → re-view). No hay estado de juego en TS ni una segunda lista de legalidad.
- **Foco**: al abrir entra en la superficie; Escape cierra el detalle y luego la hoja; al cerrar, el foco vuelve al disparador (también si la hoja se cierra sola al agrandar la ventana).

## 3. Donde Mesa se aparta de Phase, con la razón

Phase abre un modal de elección aparte para las cartas con varias acciones y esconde las no jugables tras una pulsación larga. Aquí:

1. **Las acciones viven en el detalle, no en un modal.** El detalle también lleva el texto Oracle, así que inspeccionar y ejecutar ocurren en la misma superficie sin competir por el gesto — es el requisito de «distinguir inspeccionar de ejecutar» sin añadir un segundo diálogo.
2. **La carta inactiva no se esconde.** Un `role="status"` visualmente oculto dice «Sin acción ahora» y la carta queda sin anillo. Medido: una fila de 44 px «Sin acción ahora» bajo cada carta inactiva costaba una fila entera por pantalla (15 cartas a 390×844: 2 148 px de scroll, 4 visibles). Al ocultarla visualmente: **1 758 px y 4-6 visibles** según ancho.

## 4. Después

| Viewport | Cartas visibles | Ancho de carta | Desbordamiento horizontal | Scroll vertical | Toque efectivo |
|---|---|---|---|---|---|
| 320×844 | 6 de 15 | 146 px | 0 | 1 366 px | 6/6 |
| 375×844 | 4 de 15 | 174 px | 0 | 1 674 px | 6/6 |
| 390×844 | 4 de 15 | 181 px | 0 | 1 758 px | 6/6 |
| 844×390 | 6 de 15 | 132 px+ | 0 | 567 px | 6/6 |

«Toque efectivo» = `elementFromPoint` en el centro de cada carta devuelve la carta, no una caja delimitadora. Antes de corregir el `z-index` (la hoja y el `.hand-zone` compartían 60 y el segundo pintaba encima) daba 2 de 4.

Escritorio intacto: a 768/1440 px sigue mandando el abanico (`wideFan`), y las suites de abanico, escena y desbordes pasan con el mismo número de cartas.

## 5. Defectos encontrados midiendo

- **Hoja por debajo del cajón viejo.** Mismo `z-index: 60`, el `.hand-zone` posterior en el DOM ganaba: `elementFromPoint` devolvía el cajón. Ahora 70.
- **La rejilla desbordaba 23 px a 320 px.** `CardView compact` dimensiona con `calc(var(--card-w) * .78)` y la fila de herramientas («Ampliar» 53 px + «Reintentar imagen» 109 px) medía 169 px en una columna de 146. Se fija el ancho de la tarjeta y la hoja conserva «Ampliar» sin la fila de reintento.
- **El cajón viejo reaparecía al abrir la hoja**, con sus flechas, su pista y una segunda copia tabulable de la misma mano. Se retira en la vista angosta: la zona queda montada y colapsada, sin `sheet-open`, y el `overflow` que alimenta flechas y pista ya no se calcula en móvil.
- **La pista «Hay más cartas fuera de la vista» desapareció del escritorio** al atarla al abanico: `useFan` es falso con 30 cartas. Se ata a la presentación en línea, no al abanico.
- **El foco quedaba en `<body>`** al cerrar la hoja con Escape. Ahora vuelve al disparador por efecto, no dentro de la función de cierre.

## 6. Integridad

- Carta que sale de la mano → el detalle se cierra solo: se resuelve contra el snapshot actual, no contra una copia.
- Doble pulsación → `session.busy` deshabilita el botón y `quickPlay`/`play` salen antes; el motor sigue siendo quien rechaza una revisión obsoleta.
- Mano vacía → «Tu mano está vacía», sin rejilla ni desbordes.
- Rotación → a 844×390 la hoja sigue a pantalla completa y gana columnas.
- Cambio de asiento → `session` ya resetea `selected`/`inspect`; la hoja sólo lee el snapshot vigente.
- Privacidad: la hoja nunca muestra cartas ocultas ni la mano contraria (aserción con motor real en CI).

## 7. Evidencia

Ejecutado aquí (sin motor): `arena-hand-sheet` 12 pasan / 3 omitidos con motivo; `arena-quality-gate` 7/7 (axe en 320/375/390/768/844/1024/1440); `hand-overflow-evidence` 6/6; `arena-card-tools-reachability` 2/2; `arena-hand-fan`, `arena-zones`, `visibility`, `ux-themes`, `arena-phone-footer` 29/29; `bun test src/lib` 790/790; `bun run check` 0 errores; `bun run build` correcto; axe-core 0 violaciones en claro/oscuro a 320 y 390.

No ejecutado aquí: `arena-touch-play`, `arena-mobile-drawer`, `arena-viewport-matrix`, `arena-ui` y las dos pruebas de motor de la hoja. Todas navegan a `/?autostart` y necesitan `static/wasm/mtg_engine_wasm.wasm`; compilar Rust está fuera de esta misión y el artefacto de CI está en Azure, bloqueado. Corren en Mesa CI. No se presenta su resultado como evidencia local.

Capturas en `docs/screenshots/ux-hand/`: hoja 390×844 claro/oscuro, 320×844, 844×390 y detalle de inspección.

## 8. Límites conocidos

- Con 15 cartas y 4-6 visibles por pantalla, siguen haciendo falta dos o tres gestos de scroll; es el precio de cartas de 146-181 px en vez de 112-147.
- Dos columnas a 320 px es lo máximo que cabe sin bajar de 132 px de carta.
- El detalle reutiliza el texto del motor (inglés) cuando existe; el texto publicado en español se sigue mostrando en la cara de la carta vía `impressions`.
- Las pruebas con motor real no se pudieron ejecutar en este entorno: quedan como contrato para CI, no como resultado.
