# Mirror of Phase battlefield lanes — Mesa Svelte native

Reference: Phase `client/src/components/board/PlayerArea.tsx`
at `0dd35e4a9dfe1dfba697224775d2205d56f7f20d`.

- **Own seat:** creatures/tokens close to the combat center; lands and
  support in a common middle row behind them.
- **Opponent:** middle row above creatures; creatures again face combat.
- **Classic:** unchanged simple lands → creatures → support reading order.
- Svelte snippets reuse exactly the same components and valid Phase actions.
  This is actual DOM order, not CSS `order`, so keyboard/screen readers
  follow the same order that users see.
- Preserves token groups, expansion buttons and separate individual units.
- On narrow screens the two middle lanes stack naturally.

This is still a partial UI port: Phase's editable pane splitter, dynamic
per-zone scaling and animated target lines are not yet integrated. The
screen-reader and focus-order invariant must be tested before merge.
