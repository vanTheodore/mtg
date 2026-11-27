<script lang="ts">
  /**
   * The step bar with Phase's three-cycle stop scopes: all turns, my turn, or
   * opponents' turns. A stop is a preference, not a rule: it can retain a Phase
   * window but cannot create one or force a pass.
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
  const SCOPE_LABELS = {
    AllTurns: 'todos los turnos',
    OwnTurn: 'mi turno',
    OpponentsTurns: 'turnos de oponentes'
  } as const;

  function scopeLabel(scope: keyof typeof SCOPE_LABELS | undefined): string {
    return scope ? SCOPE_LABELS[scope] : 'sin parada';
  }

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
   * width the table *gives* it — never on its own content, because a measurement
   * that changes the labels that are measured oscillates (measured: 366 ↔ 362
   * on every ResizeObserver tick). The bar now sits on the table, full width,
   * and the numbers are the ones measured there (746 px for the twelve short
   * labels, 656 px with the four long ones abbreviated):
   *
   *   ≥ 746 px  one line, full short labels;
   *   656–745   one line, the four long steps abbreviated (`tiny`);
   *   < 656     two lines, abbreviated, and the caption names the current step
   *             because `aria-current` alone is invisible when the eye scans
   *             twelve chips.
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
    <span class="state" data-active={session.stopActive}>
      {session.stopActive
        ? `Parada activa · ${current?.label ?? phase}`
        : stopped.length === 0
          ? 'Sin paradas configuradas'
          : `${stopped.length} parada${stopped.length === 1 ? '' : 's'} configurada${stopped.length === 1 ? '' : 's'}`}
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
          data-stop-scope={session.stopScope(step.value) ?? 'off'}
          aria-pressed={session.isStop(step.value)}
          aria-current={phase === step.value ? 'step' : undefined}
          aria-label={`Cambiar parada en ${step.short}. Estado: ${scopeLabel(session.stopScope(step.value))}`}
          title={`Parada en ${step.label} · ${scopeLabel(session.stopScope(step.value))}`}
          onclick={() => session.cycleStop(step.value)}
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
  /* Both scoped modes stay filled, while their border treatment makes the
     distinction visible even when the abbreviated step label is the same. */
  .step[aria-pressed='true'][data-stop-scope='OwnTurn'] { border-style: dashed; }
  .step[aria-pressed='true'][data-stop-scope='OpponentsTurns'] { border-style: dotted; }
  .step[aria-pressed='true'][aria-current='step'] {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent);
  }
</style>
