<script lang="ts">
  import { onMount } from 'svelte';
  import BoardCard from './BoardCard.svelte';
  import { wideFan } from '#lib/ui/wideFan.ts';
  import { session } from '#lib/game/session.svelte.ts';
  import { actionsForObject } from '#lib/game/actions.ts';
  import { objectSelectLabel } from '#lib/game/interaction.ts';
  import type { CardMeta, GameObject } from '#lib/engine/types.ts';

  let {
    objects,
    metas,
    title,
    focusId = null,
    onselect
  }: {
    objects: GameObject[];
    metas: Record<string, CardMeta>;
    title: string;
    /** The tutorial points at this card. */
    focusId?: number | null;
    /** Overrides the default selection (the tutorial performs the step). */
    onselect?: (id: number) => void;
  } = $props();
  let scroller: HTMLDivElement | undefined = $state();
  let overflow = $state(false);
  const useFan = $derived(session.boardStyle === 'arena' && objects.length >= 2 && objects.length <= 20);
  const geometry = $derived(wideFan(Math.max(1, objects.length)));
  const fanWidth = $derived(Math.round(148 * session.cardScale * 1.1));

  function updateOverflow() {
    if (scroller) overflow = scroller.scrollWidth > scroller.clientWidth + 2;
  }

  // Measure after layout, not while Svelte is still replacing the card list.
  // A single pending frame avoids duplicate work when resize and ResizeObserver
  // fire together. The scroll event continues to update immediately below.
  let measureFrame = 0;
  function scheduleOverflowMeasurement() {
    if (measureFrame) cancelAnimationFrame(measureFrame);
    measureFrame = requestAnimationFrame(() => {
      measureFrame = 0;
      updateOverflow();
    });
  }

  $effect(() => {
    // Account for the count, fan mode and the user's card scale, rather than
    // only the number of cards: changing density can also alter scrollWidth.
    void objects.length;
    void useFan;
    void fanWidth;
    scheduleOverflowMeasurement();
  });

  onMount(() => {
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(scheduleOverflowMeasurement) : null;
    if (scroller) observer?.observe(scroller);
    window.addEventListener('resize', scheduleOverflowMeasurement);
    scheduleOverflowMeasurement();
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', scheduleOverflowMeasurement);
      if (measureFrame) cancelAnimationFrame(measureFrame);
    };
  });

  function scrollBy(dir: number) {
    scroller?.scrollBy({ left: dir * 240, behavior: 'smooth' });
  }

  function metaFor(obj: GameObject): CardMeta | undefined {
    return metas[obj.printed_ref?.oracle_id ?? ''] ?? metas[obj.name.toLowerCase()];
  }
</script>

<section class="hand-zone" aria-label={title}>
  <header class="zone-head">
    <h2>{title} <span class="count">{objects.length}</span></h2>
    {#if overflow}
      <div class="scroll-controls">
        <button type="button" aria-label="Desplazar mano a la izquierda" onclick={() => scrollBy(-1)}>←</button>
        <button type="button" aria-label="Desplazar mano a la derecha" onclick={() => scrollBy(1)}>→</button>
      </div>
    {/if}
  </header>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="hand-scroll"
    class:fan={useFan}
    style={useFan ? `--hand-natural-w: min(${fanWidth}px, ${(92 / geometry.spreadFactor).toFixed(3)}vw); --fan-overlap-factor: ${geometry.overlapFraction}` : undefined}
    bind:this={scroller}
    onscroll={updateOverflow}
    role="region"
    tabindex="0"
    aria-label={`${title}, ${objects.length} cartas. Desplázate para ver todas.`}
  >
    {#each objects as obj, index (obj.id)}
      <div
        class="hand-card"
        style={`--fan-angle: ${geometry.rotation(index)}deg; --fan-drop: ${geometry.arc(index)}px`}
      >
        <BoardCard object={obj} meta={metaFor(obj)} highlight={focusId === obj.id} {onselect} />
        {#if focusId === obj.id}
          <span class="playable focus">Toca esta carta</span>
        {:else if objectSelectLabel(session.snapshot, obj.id)}
          <span class="playable">{objectSelectLabel(session.snapshot, obj.id)}</span>
        {:else if actionsForObject(session.snapshot?.legal.by_object ?? {}, obj.id).some((a) => a.type === 'CastSpell' || a.type === 'PlayLand')}
          <span class="playable">Disponible para jugar</span>
        {/if}
      </div>
    {:else}
      <p class="empty">Sin cartas en esta zona.</p>
    {/each}
  </div>
  {#if overflow}<p class="more-hint" aria-live="polite">Hay más cartas fuera de la vista. Usa las flechas o desplázate.</p>{/if}
</section>

<style>
  .hand-zone { min-width: 0; max-width: 100%; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: .65rem .8rem; }
  .zone-head { display: flex; align-items: center; justify-content: space-between; gap: .5rem; margin-bottom: .45rem; }
  h2 { margin: 0; font-size: .9rem; font-weight: 650; }
  .count { color: var(--ink-muted); font-weight: 500; }
  .scroll-controls { display: flex; gap: .3rem; }
  .scroll-controls button { border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); border-radius: 7px; width: 2rem; height: 1.8rem; }
  .hand-scroll { min-width: 0; max-width: 100%; display: flex; gap: .65rem; overflow-x: auto; overflow-y: visible; padding: .6rem .2rem .8rem; scroll-snap-type: x proximity; }
  .hand-card { position: relative; scroll-snap-align: start; display: flex; flex-direction: column; gap: .2rem; }
  /*
   * Mirrors the wide Phase hand geometry while retaining the original DOM
   * order, focus, keyboard selection and accessible horizontal scroll.
   * Mobile remains a scroll surface until Mesa's true Phase-style drawer is ported.
   */
  @media (min-width: 1100px) {
    .hand-scroll.fan {
      /* Hand computes the natural spread; CSS then owns the viewport cap.
       * No inline custom property can override the short-viewport rule. */
      --hand-card-w: var(--hand-natural-w);
      --fan-overlap: calc(var(--hand-card-w) * var(--fan-overlap-factor));
      gap: 0;
      padding: 2rem .5rem 2.4rem;
      scroll-snap-type: none;
    }
    .hand-scroll.fan .hand-card {
      --card-w: var(--hand-card-w);
      flex: 0 0 var(--hand-card-w);
      width: var(--hand-card-w);
      z-index: 0;
      transform-origin: center 82%;
      transform: translateY(var(--fan-drop)) rotate(var(--fan-angle));
      transition: transform 160ms ease, filter 160ms ease;
    }
    .hand-scroll.fan .hand-card + .hand-card { margin-left: var(--fan-overlap); }
    .hand-scroll.fan .hand-card:focus-within {
      transform: translateY(-24px) rotate(0deg) scale(1.04);
      z-index: 3;
      filter: drop-shadow(0 8px 9px rgb(0 0 0 / 17%));
    }
    .hand-scroll.fan .hand-card:has([data-tutorial-focus="true"]) { z-index: 4; }
  }
  @media (min-width: 1100px) and (max-height: 1000px) {
    .hand-scroll.fan {
      /* min() is computed here, not from an inline style containing an
       * inherited cap. This also scales the overlap with the visible cards. */
      --hand-card-w: min(var(--hand-natural-w), var(--arena-base-card-w, 124px), 15dvh);
    }
  }
  @media (min-width: 1100px) and (hover: hover) and (pointer: fine) {
    .hand-scroll.fan .hand-card:hover {
      transform: translateY(-24px) rotate(0deg) scale(1.04);
      z-index: 3;
      filter: drop-shadow(0 8px 9px rgb(0 0 0 / 17%));
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .hand-scroll.fan .hand-card { transition: none; }
  }
  .playable { color: var(--ok); font-size: .68rem; text-align: center; max-width: var(--card-w); }
  /* The tutorial's cue: written, not only coloured. */
  .playable.focus { color: var(--accent); font-weight: 700; }
  .empty { color: var(--ink-muted); font-size: .85rem; margin: .5rem 0; }
  .more-hint { margin: .1rem 0 0; font-size: .72rem; color: var(--ink-muted); }
</style>
