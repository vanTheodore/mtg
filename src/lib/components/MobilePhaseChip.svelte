<script lang="ts">
  /**
   * Phone phase chip — Phase's `controls/MobilePhaseChip.tsx` for the narrow
   * table.
   *
   * Upstream hides the desktop dot strips on phones because a 24 px stop toggle
   * is untappable, and splits their two jobs across a disclosure: the chip names
   * the step the engine reports, and opening it offers every step at touch size.
   * That is exactly the problem Mesa had: at 320 px the twelve-chip bar took
   * 84 px of an 800 px screen and each chip was 30 px tall.
   *
   * What the port keeps: the chip is one line, the sheet lists all twelve steps
   * in turn order (including the ones no other part of the chrome shows), and
   * the current step is marked. What it changes: Phase cycles a stop through
   * three scopes (all turns, own turn, opponents' turns); Mesa's `session.stops`
   * is still a boolean per step, so the row answers "hay parada" or "no hay
   * parada" and nothing else. No rule lives here: a stop only makes
   * `session.stopActive` false so the automatic pass does not answer for the
   * player at that step.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { PHASE_STEPS } from '#lib/ui/phases.ts';

  let { phase, turn, activePlayer }: { phase: string; turn: number; activePlayer: number } = $props();

  let dialog = $state<HTMLDialogElement | null>(null);
  let chip = $state<HTMLButtonElement | null>(null);
  let open = $state(false);
  const titleId = $props.id();

  const current = $derived(PHASE_STEPS.find((step) => step.value === phase));
  const stopped = $derived(PHASE_STEPS.filter((step) => session.isStop(step.value)));
  const stopText = $derived(stopped.length === 0
    ? 'Sin paradas'
    : stopped.length === 1
      ? 'Parada en 1 paso'
      : `Paradas en ${stopped.length} pasos`);

  function show() {
    open = true;
  }

  function close() {
    open = false;
  }

  $effect(() => {
    const element = dialog;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      // The step the engine reports is the row a player came for; focusing it
      // also keeps the twelve rows reachable with one thumb.
      element.querySelector<HTMLElement>('[aria-current="step"]')?.focus();
    }
    if (!open && element.open) element.close();
  });

  // A dialog closes on Escape by itself; `onclose` is the one place that has to
  // put the focus back on the chip, or the phone would land on the document.
  function closedByUser() {
    open = false;
    chip?.focus();
  }

  function backdrop(event: MouseEvent) {
    if (event.target === dialog) close();
  }
</script>

<section class="phase-chip" data-current-phase={phase}>
  <button
    type="button"
    class="chip"
    bind:this={chip}
    aria-haspopup="dialog"
    aria-expanded={open}
    onclick={show}
  >
    <span class="turn">Turno {turn}</span>
    <strong class="step">{current?.short ?? (phase || 'Fases')}</strong>
    <span class="stops" data-active={stopped.length > 0}>{stopText}</span>
    <span class="chevron" aria-hidden="true">▾</span>
  </button>
</section>

{#if open}
  <dialog class="phase-sheet" bind:this={dialog} onclose={closedByUser} onclick={backdrop} aria-labelledby={titleId}>
    <header>
      <h2 id={titleId}>Paradas del turno</h2>
      <button type="button" class="close" onclick={close} aria-label="Cerrar las paradas">✕</button>
    </header>
    <p class="note">
      Una parada no cambia ninguna regla: el motor sigue publicando la ventana y su recomendación, y aquí
      sólo dejas de aceptarla en el paso que marques. Turno {turn} · Jugador {activePlayer + 1}.
    </p>
    <ol class="rows">
      {#each PHASE_STEPS as step, index (step.value)}
        <li>
          <button
            type="button"
            class="row"
            data-step={step.value}
            aria-current={step.value === phase ? 'step' : undefined}
            aria-pressed={session.isStop(step.value)}
            onclick={() => session.toggleStop(step.value)}
          >
            <span class="text">
              <span class="name">{step.label}</span>
              <span class="mark">
                {step.value === phase ? 'Paso actual' : `Paso ${index + 1} de ${PHASE_STEPS.length}`}
              </span>
            </span>
            <span class="badge" data-on={session.isStop(step.value)}>
              {session.isStop(step.value) ? 'Con parada' : 'Sin parada'}
            </span>
          </button>
        </li>
      {/each}
    </ol>
  </dialog>
{/if}

<style>
  /* The chip is the phone form of the stop bar; from 641 px up the bar has room
     for twelve chips and the sheet would be a second way to do the same thing. */
  .phase-chip { display: none; }
  @media (max-width: 640px) {
    .phase-chip { display: block; min-width: 0; }
  }
  .chip {
    display: flex;
    gap: .45rem;
    align-items: baseline;
    width: 100%;
    min-height: 36px;
    padding: .3rem .55rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: color-mix(in srgb, var(--surface) 90%, transparent);
    color: var(--ink);
    font: inherit;
    font-size: .74rem;
    text-align: left;
    cursor: pointer;
  }
  .chip:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .turn { color: var(--ink-muted); font-size: .68rem; }
  .step { font-weight: 700; }
  .stops {
    margin-inline-start: auto;
    text-transform: uppercase;
    letter-spacing: .08em;
    font-size: .6rem;
    font-weight: 700;
    color: var(--ink-muted);
  }
  .stops[data-active='true'] { color: var(--accent); }
  .chevron { color: var(--ink-muted); font-size: .7rem; }

  .phase-sheet {
    width: min(30rem, calc(100vw - 1.5rem));
    max-height: min(38rem, calc(100dvh - 2rem));
    padding: 0;
    border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--line));
    border-radius: 16px;
    background: var(--chrome-solid, var(--surface));
    color: var(--ink);
  }
  .phase-sheet::backdrop { background: rgb(3 6 10 / 62%); }
  .phase-sheet header {
    display: flex;
    gap: .5rem;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    padding: .7rem .8rem .5rem;
    background: var(--chrome-solid, var(--surface));
  }
  .phase-sheet h2 { margin: 0; font-size: .95rem; }
  .close {
    min-width: 32px;
    min-height: 32px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: transparent;
    color: var(--ink);
    font: inherit;
    cursor: pointer;
  }
  .close:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .note {
    margin: 0 .8rem .5rem;
    font-size: .74rem;
    line-height: 1.4;
    color: var(--ink-muted);
  }
  .rows {
    display: grid;
    gap: .2rem;
    margin: 0;
    padding: 0 .5rem .7rem;
    list-style: none;
    max-height: 60dvh;
    overflow-y: auto;
  }
  .row {
    display: flex;
    gap: .6rem;
    align-items: center;
    width: 100%;
    min-height: 44px;
    padding: .35rem .5rem;
    border: 1px solid transparent;
    border-radius: 10px;
    background: transparent;
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .row:hover { border-color: var(--line); }
  .row:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .row[aria-current='step'] { border-color: color-mix(in srgb, var(--accent) 35%, var(--line)); }
  .row[aria-pressed='true'] {
    border-color: color-mix(in srgb, var(--accent) 55%, var(--line));
    background: color-mix(in srgb, var(--accent) 16%, transparent);
  }
  .text { display: grid; gap: .1rem; min-width: 0; }
  .name { font-size: .85rem; font-weight: 600; }
  .mark { font-size: .68rem; color: var(--ink-muted); }
  .badge {
    margin-inline-start: auto;
    flex: 0 0 auto;
    padding: .15rem .45rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    font-size: .6rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: var(--ink-muted);
  }
  .badge[data-on='true'] {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-ink);
  }
</style>
