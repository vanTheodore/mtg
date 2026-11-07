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
   * Twelve steps do not fit at 320 px, so the row scrolls horizontally with
   * snap points instead of wrapping into four lines that would eat the board's
   * measured height.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { PHASE_STEPS } from '#lib/ui/phases.ts';

  let { phase, turn, activePlayer }: { phase: string; turn: number; activePlayer: number } = $props();

  const stopped = $derived(PHASE_STEPS.filter((step) => session.isStop(step.value)));
</script>

<section class="stop-bar" aria-label="Fases y paradas" data-current-phase={phase}>
  <p class="caption">
    Turno {turn} · Jugador {activePlayer + 1}
    <span class="state" data-active={stopped.length > 0}>
      {stopped.length === 0
        ? 'Sin paradas: el auto-paso decide'
        : stopped.length === 1
          ? `Parada en ${stopped[0].label}`
          : `${stopped.length} paradas`}
    </span>
  </p>
  <ol class="steps">
    {#each PHASE_STEPS as step (step.value)}
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
          {step.short}
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
  .steps {
    display: flex;
    gap: .25rem;
    list-style: none;
    margin: 0;
    padding: .15rem;
    min-width: 0;
    overflow-x: auto;
    scroll-snap-type: x proximity;
    scrollbar-width: thin;
  }
  .steps li { flex: 0 0 auto; scroll-snap-align: start; }
  .step {
    min-height: 30px;
    padding: .25rem .55rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: color-mix(in srgb, var(--surface) 86%, transparent);
    color: var(--ink-muted);
    font: inherit;
    font-size: .72rem;
    white-space: nowrap;
    cursor: pointer;
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
  @media (max-width: 640px) {
    .steps { padding-bottom: .3rem; }
  }
</style>
