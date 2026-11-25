<script lang="ts">
  /**
   * One card inside the phone hand sheet.
   *
   * Read-only display plus a single explicit action button. The card's *lawful*
   * actions are exactly the ones Phase publishes for that object
   * (`legal.by_object`); this component never decides what may be played, it
   * only renders the list it is handed. Tapping the card opens the detail view
   * — an inspection, never a play — so a card can be read without the risk of
   * casting it by accident.
   */
  import CardView from './CardView.svelte';
  import type { CardMeta, GameObject } from '#lib/engine/types.ts';

  let {
    object,
    meta,
    costLabel = '',
    playLabel = null,
    choiceCount = 0,
    busy = false,
    onplay,
    oninspect,
    onopen
  }: {
    object: GameObject;
    meta?: CardMeta;
    /** Effective mana cost, when Phase publishes one for this card. */
    costLabel?: string;
    /** `null` when the card has no playable action right now. */
    playLabel?: string | null;
    /**
     * How many different actions Phase publishes for this card. With more than
     * one, the visible control asks the player to choose instead of guessing.
     */
    choiceCount?: number;
    /** An action is in flight: the button stays visible but cannot double-fire. */
    busy?: boolean;
    onplay?: () => void;
    oninspect?: () => void;
    onopen?: () => void;
  } = $props();
</script>

<div class="sheet-card" class:playable={playLabel !== null}>
  <CardView {object} {meta} compact onselect={() => onopen?.()} oninspect={() => oninspect?.()} />
  {#if costLabel}
    <p class="sheet-cost" aria-label={`Coste: ${costLabel}`}>{costLabel}</p>
  {/if}
  {#if playLabel !== null}
    <button class="sheet-play" type="button" disabled={busy} onclick={() => onplay?.()} aria-label={playLabel}>
      {playLabel}
    </button>
  {:else if choiceCount > 1}
    <!-- Several different actions: a single press cannot pick one for the player. -->
    <button class="sheet-choose" type="button" disabled={busy} onclick={() => onopen?.()} aria-label={`Elegir entre ${choiceCount} acciones`}>
      Elegir ({choiceCount})
    </button>
  {:else}
    <!--
      No action today. The cue stays for assistive tech but leaves the visual
      flow: a 44px row repeating "Sin acción ahora" under every idle card cost
      a whole card row per screenful (measured: 15 cards at 390×844 scrolled
      2 148px, 4 visible). The ring on playable cards is the visual signal.
    -->
    <p class="sheet-idle">Sin acción ahora</p>
  {/if}
</div>

<style>
  .sheet-card { position: relative; display: flex; flex-direction: column; gap: .3rem; min-width: 0; }
  /*
   * The card fills the grid cell; its width is owned by the sheet's grid, so
   * the same markup is 150px on a 320px phone and 220px on a tablet without a
   * second layout. `--card-w` is what CardView's fallback art and rules text
   * measure against.
   */
  /*
   * `compact` sizes the shell as `calc(var(--card-w) * .78)`, so the shell —
   * not the card — has to be pinned to the cell width with `!important`, or the
   * grid column overflows by exactly that 22%. Measured at 320px: 169px of
   * content in a 146px column, 23px of stray horizontal scroll.
   */
  .sheet-card :global(.card-shell),
  .sheet-card :global(.card-shell.compact) { --card-w: 100% !important; width: 100% !important; }
  .sheet-card :global(.card) { width: 100%; aspect-ratio: 5 / 7; }
  /*
   * CardView's tool row holds "Ampliar" (53px) and, after an image failure,
   * "Reintentar imagen" (109px): 169px in a 146px column at 320px, which spilled
   * 11px past the cell and produced horizontal scroll. The sheet keeps the
   * inspect affordance and drops retry — the detail panel is the place to read
   * the card, and the board still offers retry.
   */
  .sheet-card :global(.card-tools .retry) { display: none; }
  .sheet-cost {
    margin: 0;
    font-size: .72rem;
    font-weight: 650;
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
    text-align: center;
  }
  /*
   * Play is its own control, 44px tall — the minimum a thumb can hit without
   * aiming. It is never the card face: on the card, a tap inspects.
   */
  .sheet-play {
    min-height: 44px;
    padding: .35rem .5rem;
    border-radius: 9px;
    border: 1px solid var(--accent);
    background: var(--accent);
    color: var(--accent-ink);
    font-size: .78rem;
    font-weight: 700;
    line-height: 1.1;
  }
  .sheet-play:active { transform: scale(.98); }
  .sheet-play[disabled] { opacity: .6; }
  .sheet-choose {
    min-height: 44px;
    padding: .35rem .5rem;
    border-radius: 9px;
    border: 1px solid var(--accent);
    background: transparent;
    color: var(--accent);
    font-size: .78rem;
    font-weight: 700;
    line-height: 1.1;
  }
  .sheet-choose[disabled] { opacity: .6; }
  .sheet-idle {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  /* A card you can act on is marked with a written cue and a ring, not colour alone. */
  .sheet-card.playable :global(.card) { outline: 2px solid var(--accent); outline-offset: 1px; }
  @media (prefers-reduced-motion: reduce) { .sheet-play:active { transform: none; } }
</style>
