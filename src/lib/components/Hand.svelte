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
  /**
   * When the fan does not fit, the hand is a drawer. "Does not fit" is a
   * measured condition, not a taste:
   *
   *   ≤640 px wide          the ±147px cards no longer fit a row;
   *   ≤1099 × ≤899 px tall  the fan is 324px of a 768px screen (measured on
   *                         /?autostart at 1024×768: 486px of document debt);
   *   ≤520 px tall          a phone in landscape is a phone.
   *
   * 768×1024 (tablet portrait) keeps the inline fan: the fan fits and the
   * existing 768px coverage measures that layout.
   */
  const DRAWER_QUERY = '(max-width: 640px), (max-width: 1099px) and (max-height: 899px), (max-height: 520px)';
  let narrowViewport = $state(false);
  const useFan = $derived(session.boardStyle === 'arena' && objects.length >= 2 && objects.length <= 20);
  const geometry = $derived(wideFan(Math.max(1, objects.length)));
  const fanWidth = $derived(Math.round(148 * session.cardScale * 1.1));

  /**
   * `overflow` is a *layout* fact. With the drawer closed on a phone the
   * scrollport is deliberately collapsed to 1px (see the drawer CSS), which is
   * not "this hand overflows, show the arrows": the arrows belong to the open
   * sheet and to the desktop fan, where the scrollport is always laid out.
   */
  function updateOverflow() {
    if (!scroller) return;
    if (narrowViewport && !session.handDrawerOpen) { overflow = false; return; }
    overflow = scroller.scrollWidth > scroller.clientWidth + 2;
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
    // Account for the count, fan mode, the user's card scale and the drawer's
    // open state: any of them can change what fits in the scrollport.
    void objects.length;
    void useFan;
    void fanWidth;
    void session.handDrawerOpen;
    scheduleOverflowMeasurement();
  });

  onMount(() => {
    const media = matchMedia(DRAWER_QUERY);
    const sync = () => {
      narrowViewport = media.matches;
      // A drawer that survived a resize into a desktop window would keep the
      // board `inert` (Board.svelte) with no visible trigger to close it. The
      // wide layout has no drawer, so wide means closed.
      if (!media.matches && session.handDrawerOpen) session.setHandDrawer(false);
      scheduleOverflowMeasurement();
    };
    sync();
    media.addEventListener('change', sync);
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(scheduleOverflowMeasurement) : null;
    if (scroller) observer?.observe(scroller);
    window.addEventListener('resize', scheduleOverflowMeasurement);
    return () => {
      observer?.disconnect();
      media.removeEventListener('change', sync);
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

  /**
   * Phone drawer behaviour.
   *
   * On a touch-sized viewport the hand becomes a fixed sheet with a summary
   * button. It opens on explicit request, closes with Escape or the close
   * button, moves focus into the sheet, and returns focus to the summary on
   * close. `inert` is applied to the board by the caller, never to the sheet.
   *
   * The drawer is a *phone* affordance. Tablets (768px) still have room for
   * the inline fan and keep it: `arena-scene-evidence` measures the 768px
   * hand tools, and a 768px screen shows seven cards without stealing the
   * board. 640px is where the fan stops fitting (±147px cards).
   */
  let sheet = $state<HTMLElement | undefined>();
  let port = $state<HTMLElement | undefined>();
  let trigger = $state<HTMLButtonElement | undefined>();
  const open = $derived(session.handDrawerOpen);

  function close() {
    session.setHandDrawer(false);
    trigger?.focus();
  }

  function onSheetKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }
</script>

<button
  class="hand-trigger"
  type="button"
  bind:this={trigger}
  aria-expanded={open}
  aria-controls="mesa-hand-sheet"
  onclick={() => session.setHandDrawer(true)}
>
  <span class="hand-trigger-label">Mano</span>
  <span class="hand-trigger-count">{objects.length}</span>
  {#if objects.length}
    <span class="hand-trigger-hint">Desliza para jugar</span>
  {/if}
</button>

<section
  class="hand-zone"
  class:sheet-open={open}
  aria-label={title}
  id="mesa-hand-sheet"
  bind:this={sheet}
>
  {#if open}
    <button class="hand-close" type="button" aria-label="Cerrar la mano" onclick={close}>✕<span class="sr-only"> Cerrar la mano</span></button>
  {/if}
  <header class="zone-head">
    <h2>{title} <span class="count">{objects.length}</span></h2>
    {#if overflow}
      <div class="scroll-controls">
        <button type="button" aria-label="Desplazar mano a la izquierda" onclick={() => scrollBy(-1)}>←</button>
        <button type="button" aria-label="Desplazar mano a la derecha" onclick={() => scrollBy(1)}>→</button>
      </div>
    {/if}
  </header>
  <!-- The scrollport already carries role=region and a tab stop; Escape is the
       standard way out of the phone sheet, so it listens on the same element. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div
    class="hand-scroll"
    class:fan={useFan}
    style={useFan ? `--hand-natural-w: min(${fanWidth}px, ${(92 / geometry.spreadFactor).toFixed(3)}vw); --fan-overlap-factor: ${geometry.overlapFraction}` : undefined}
    bind:this={scroller}
    onscroll={updateOverflow}
    onkeydown={onSheetKeydown}
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
    /*
     * Lift + zoom on hover/focus.
     *
     * Geometry, measured in Chromium at 1440×900 (docs/ARENA-HAND-OVERFLOW-DIAGNOSTIC.md):
     * the fan rotates around `center 82%`, so a card's BOTTOM barely moves
     * while its TOP rises by (`0.82 × overflow`) plus the translate. With the
     * old -24px / 1.04 the raised tool strip sat 25px above the scrollport
     * (button top 599 against a port top of 624): a person hovering a hand
     * card could see "Ampliar" and never click it.
     *
     * -14px / 1.05 keeps the whole raised card inside the hand's scrollport
     * (7 of 7 hand cards hit-test to the button) and still reads as "this card
     * is the one you are pointing at". The tools stay anchored to the card's
     * top edge, so the card's centre is never covered.
     */
    .hand-scroll.fan .hand-card:focus-within {
      transform: translateY(-14px) rotate(0deg) scale(1.05);
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
      transform: translateY(-14px) rotate(0deg) scale(1.05);
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

  /*
   * Phone hand drawer.
   *
   * Everything below is scoped to the widths and heights where the fan does
   * not fit (see DRAWER_QUERY). Where it does fit, the trigger does not exist
   * and the sheet keeps its inline role, so the tablet-and-desktop fan, its
   * keyboard order and every existing E2E are untouched.
   *
   * The sheet is `position: fixed` with its own scrollport: thirty cards are
   * reachable by swipe and by Tab, which is what the mission asked for
   * (320/390/768 px, "todas las 30 cartas alcanzables").
   */
  .hand-trigger { display: none; }

  @media (max-width: 640px), (max-width: 1099px) and (max-height: 899px), (max-height: 520px) {
    .hand-trigger {
      display: flex;
      align-items: center;
      gap: .45rem;
      width: 100%;
      min-height: 44px;
      padding: .4rem .7rem;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--surface-2);
      color: var(--ink);
      font-size: .85rem;
      font-weight: 650;
      text-align: left;
    }
    .hand-trigger-count {
      display: inline-grid;
      place-items: center;
      min-width: 1.5rem;
      height: 1.5rem;
      border-radius: 999px;
      background: var(--accent);
      color: var(--accent-ink);
      font-size: .78rem;
      font-weight: 700;
    }
    .hand-trigger-hint { margin-left: auto; font-weight: 500; color: var(--ink-muted); font-size: .78rem; }
    .hand-trigger[aria-expanded="true"] { border-color: var(--accent); }

    /* Closed: the inline row stays in the DOM (so counts and tests that read
       the hand keep working) but does not take vertical space. */
    /* The closed sheet keeps its scrollport in the DOM — so the hand's
       region, counts and card list stay in the accessibility tree and every
       existing test that reads them keeps working — but takes no space and
       cannot be reached by pointer. Opening the sheet is the only way in. */
    .hand-zone:not(.sheet-open) .hand-scroll {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
      pointer-events: none;
    }
    /* Cerrada, la mano no ocupa ninguna fila: en un teléfono el borde inferior
       es el pulgar del jugador, no una sección del documento. La zona sigue
       montada (con su scrollport de 1 px recortado) para no perder ni el
       recuento ni las cartas del árbol de accesibilidad; medido a 390×844
       eran 24 px de documento que no mostraban nada. */
    .hand-zone:not(.sheet-open) {
      position: fixed;
      inset: auto 0 0 0;
      height: 0;
      min-height: 0;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
    }
    .hand-zone:not(.sheet-open) .zone-head {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
      margin: 0;
    }

    .hand-zone.sheet-open {
      position: fixed;
      inset: auto 0 0 0;
      z-index: 60;
      max-height: 78dvh;
      display: flex;
      flex-direction: column;
      border-radius: 18px 18px 0 0;
      border-bottom: 0;
      box-shadow: 0 -12px 34px rgb(0 0 0 / 38%);
      padding: .5rem .6rem calc(.6rem + env(safe-area-inset-bottom, 0px));
    }
    .hand-zone.sheet-open .hand-scroll {
      display: flex;
      flex: 1 1 auto;
      min-height: 0;
      overflow-x: auto;
      overflow-y: hidden;
      overscroll-behavior-x: contain;
      scroll-snap-type: x proximity;
      -webkit-overflow-scrolling: touch;
    }
    /* A round close control in the sheet's top-left corner, where it cannot
       collide with the title or the scroll arrows (measured overlap: the
       button landed on top of "Tu mano · Jugador N"). */
    .hand-close {
      position: absolute;
      top: .4rem;
      left: .5rem;
      width: 2.25rem;
      height: 2.25rem;
      display: grid;
      place-items: center;
      padding: 0;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: var(--surface-2);
      color: var(--ink);
      font-size: 1rem;
      z-index: 3;
    }
    .hand-zone.sheet-open .zone-head { padding-left: 2.6rem; }
  }

  @media (max-width: 640px) and (prefers-reduced-motion: no-preference),
    (max-width: 1099px) and (max-height: 899px) and (prefers-reduced-motion: no-preference),
    (max-height: 520px) and (prefers-reduced-motion: no-preference) {
    .hand-zone.sheet-open { animation: sheet-in .18s ease-out; }
    @keyframes sheet-in { from { transform: translateY(14%); opacity: .6; } to { transform: none; opacity: 1; } }
  }
</style>
