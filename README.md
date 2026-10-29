# Mesa

Cliente independiente de Magic: The Gathering construido con SvelteKit, Bun y
el motor de reglas Rust de [Phase](https://github.com/phase-rs/phase).

> Estado: base en construcción. La referencia de Phase está congelada en
> `c2fbb7a6634a440c7c6b47e6a87a554cc7382f05`. No es un clon visual de Phase.

## Stack

SvelteKit 3 · Svelte 5 (runes) · TypeScript 6 · Vite 8 · Bun 1.4.4 · Rust/WASM.
CSS propio con tokens semánticos. Sin React, Tailwind, Zustand ni Node como
dependencia del proyecto.

## Desarrollo

```sh
bun install
bun run dev
```

## Licencia y procedencia

El código derivado de Phase conserva MIT/Apache-2.0. Ver `NOTICE`,
`licenses/` y `reference/phase.json`. No se redistribuyen ilustraciones
propias de Wizards of the Coast.
