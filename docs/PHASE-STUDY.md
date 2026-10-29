# Estudio de Phase (referencia congelada)

Commit: `c2fbb7a6634a440c7c6b47e6a87a554cc7382f05` (v0.119.0).
Clon auxiliar fuera del repositorio principal: `/home/user/phase-reference`.

## Hallazgos

- `crates/engine` contiene las reglas, el parser Oracle, la base de cartas y
  proyecciones de visibilidad. Es reutilizable sin React.
- `crates/engine-wasm` expone una superficie global muy amplia mediante
  `JsValue`/`serde-wasm-bindgen`, inicialización, acciones, filtros por jugador,
  IA, LLM, draft y multijugador. Para el slice local basta un puente pequeño.
- `client/src/adapter/engine-worker.ts` ya ejecuta WASM en un Worker; el patrón
  es reutilizable, pero el cliente de adapter arrastra stores Zustand,
  animaciones, audio, i18n y recuperación acoplados a React.
- `client/src/game/dispatch.ts` mezcla mutex de acciones, animaciones, audio,
  stores, IA y recuperación. No se migra; se conserva la idea de una cola de
  acciones serializada y la autoridad del motor.
- `client/src/services/cardImageLookup.ts` documenta la clave correcta:
  `printed_ref.oracle_id` + `face_name`, con fallback por nombre. Se reconstruye
  en TypeScript puro con caché, reintentos y fallback textual.
- `client/src/components/card`, `board` y `hand` están acoplados a React,
  Zustand, framer-motion y Tailwind. La mano usa un abanico con solapamiento y
  escalado; el tablero tiene modos compactos y grupos. Se reconstruyen en Svelte
  con scroll explícito, expansión y sin `overflow:hidden` sobre las cartas.

## Riesgos de rendimiento observados en el código

1. Carga del catálogo completo antes de inicializar (`load_card_database`).
2. Serialización de estados amplios en cada acción.
3. Re-renderizado de componentes conectados a stores globales.
4. Animaciones/framer-motion y efectos de fondo opcionales.
5. Búsquedas de IA sobre el estado completo.

Este proyecto mide en lugar de asumir: arranque, WASM, catálogo, acciones,
serialización, render y memoria. La comparación con Phase se documenta como
no ejecutada cuando no hay un build original comparable en este entorno.
