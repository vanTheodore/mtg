<script lang="ts">
  /**
   * The step bar with stops, ported from Phase's `controls/PhaseStopBar.tsx`.
   *
   * A stop is a preference, not a rule: it says "do not let the automatic pass
   * close this step on my behalf". The engine still publishes every window and
   * keeps its own recommendation; `session.stopActive` only makes
   * `autoPassPending` false for the marked step. With no stop the table behaves
   * exactly as before.
   *
   * Twelve steps do not fit in a 290 px rail as twelve labelled buttons, so the
   * row shares the width it has — abbreviated labels, then two lines — instead
   * of scrolling sideways. See `layout` below, which is the measurement that
   * decides it.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { PHASE_STEPS, stepRowFit } from '#lib/ui/phases.ts';

  let { phase, turn, activePlayer }: { phase: string; turn: number; activePlayer: number } = $props();

  const stopped = $derived(PHASE_STEPS.filter((step) => session.isStop(step.value)));

  /**
   * The row fits, or it says what it had to give up.
   *
   * Measured before this change (docs/PHASE-UX-PORT.md, difference 3): the
   * `<ol>` held 868 px of chips in a 362 px rail and the four first steps
   * covered the rest, so eight of the twelve steps vanished with no signal at
   * 1440 and 1280 — the two widths that get used the most. Phase's own client
   * solves it the other way round: its phase row is a chip line that fits.
   *
   * So the row no longer scrolls sideways. What it does depends only on the
   * width the rail *gives* it — never on its own content, because a measurement
   * that changes the labels that are measured oscillates (measured: 366 ↔ 362
   * on every ResizeObserver tick).
   *
   *   ≥ 470 px  one line, full short labels (twelve chips need ~440 px to read
   *             whole; a narrower line only "fits" by clipping every label,
   *             which is the same failure, quieter);
   *   340–469   two lines with the full labels;
   *   < 340     two lines with abbreviated labels (`tiny` in `phases.ts`) and
   *             the caption naming the current step, because `aria-current`
   *             alone is invisible when the eye scans twelve chips.
   */
  let row = $state<HTMLOListElement | null>(null);
  let width = $state(0);

  $effect(() => {
    if (!row) return;
    const measure = () => {
      if (row) width = row.clientWidth;
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(row);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  });

  /* Los umbrales viven en `phases.ts`, con pruebas: aquí sólo se pinta lo que
     esa función decide para el ancho que el rail dé a la fila. */
  const fit = $derived(stepRowFit(width));
  const layout = $derived(fit.layout);
  const abbreviated = $derived(fit.abbreviated);
  /** Under 415 px the caption keeps only what the chips cannot say; the turn
   *  number is repeated by the seat plate. */
  const compact = $derived(fit.compact);

  /** The step whose chip carries `aria-current`; its label is what the caption
   *  prints when the row had to wrap. */
  const current = $derived(PHASE_STEPS.find((step) => step.value === phase));
</script>

<section class="stop-bar" aria-label="Fases y paradas" data-current-phase={phase} data-compact={compact}>
  <p class="caption">
    <span class="turn">Turno {turn} · Jugador {activePlayer + 1}</span>
    {#if compact}
      <span class="current">Ahora: {current?.short ?? phase}</span>
    {/if}
    <span class="state" data-active={stopped.length > 0}>
      {stopped.length === 0
        ? 'Sin paradas: el auto-paso decide'
        : stopped.length === 1
          ? `Parada en ${stopped[0].label}`
          : `${stopped.length} paradas`}
    </span>
  </p>
  <ol class="steps" bind:this={row} data-fit={layout}>
    {#each PHASE_STEPS as step (step.value)}
      {@const label = abbreviated && step.tiny ? step.tiny : step.short}
      <li>
        <button
          type="button"
          class="step"
          data-step={step.value}
          aria-pressed={session.isStop(step.value)}
          aria-current={phase === step.value ? 'step' : undefined}
          aria-label={`${step.short} · parada en ${step.label}`}
          title={`Parada en ${step.label}`}
          onclick={() => session.toggleStop(step.value)}
        >
          {label}
        </button>
      </li>
    {/each}
  </ol>
</section>

<style>
  .stop-bar {
    display: grid;
    gap: .3rem;
    min-width: 0;
    /* Inside `.middle` the board lays out two columns; the bar belongs to the
       whole row, like the turn track it replaces (it would otherwise be
       squeezed into the rail's first column). */
    grid-column: 1 / -1;
  }
  .caption {
    display: flex;
    flex-wrap: wrap;
    gap: .5rem;
    align-items: baseline;
    margin: 0;
    font-size: .72rem;
    color: var(--ink-muted);
  }
  .caption .state {
    text-transform: uppercase;
    letter-spacing: .09em;
    font-size: .64rem;
    font-weight: 700;
  }
  .caption .state[data-active='true'] { color: var(--accent); }
  /* The chips share the row they have instead of overflowing it. The floor is
     the shortest label that still reads ("Daño", "Final"); below that the row
     wraps to two lines rather than clipping, which is what `data-fit` reports. */
  .steps {
    display: flex;
    flex-wrap: wrap;
    gap: .2rem;
    list-style: none;
    margin: 0;
    padding: .15rem;
    min-width: 0;
    overflow: visible;
  }
  .steps[data-fit='row'] { flex-wrap: nowrap; }
  .steps li { flex: 0 1 auto; min-width: 0; display: flex; }
  .step {
    min-height: 26px;
    min-width: 2.15rem;
    padding: .2rem .34rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: color-mix(in srgb, var(--surface) 86%, transparent);
    color: var(--ink-muted);
    font: inherit;
    font-size: .68rem;
    line-height: 1.15;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
    flex: 1 1 auto;
  }
  .caption .turn { display: inline; }
  .caption .current {
    text-transform: uppercase;
    letter-spacing: .07em;
    font-size: .62rem;
    font-weight: 700;
    color: var(--ink);
  }
  .stop-bar[data-compact='true'] .caption .turn { display: none; }
  /* En el rail de escritorio la forma compacta es el chip de Phase
     (`MobilePhaseChip`): la fila de doce chips se queda para la tableta, donde
     tiene ancho. Medido: la fila cuesta 89 px de un rail de 569 y la decisión
     deja de caber entera, que es lo que mide `arena-ui.spec.ts`. */
  @media (min-width: 1100px) and (max-height: 1000px) {
    .stop-bar { display: none; }
  }
  .step:hover { color: var(--ink); border-color: color-mix(in srgb, var(--accent) 55%, var(--line)); }
  .step:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .step[aria-current='step'] {
    color: var(--ink);
    border-color: color-mix(in srgb, var(--accent) 70%, var(--line));
    background: color-mix(in srgb, var(--accent) 20%, var(--surface));
    font-weight: 700;
  }
  /* A stop reads as a filled mark, so it is visible without hovering. */
  .step[aria-pressed='true'] {
    color: var(--accent-ink);
    background: var(--accent);
    border-color: var(--accent);
    font-weight: 750;
  }
  .step[aria-pressed='true'][aria-current='step'] {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent);
  }
</style>
