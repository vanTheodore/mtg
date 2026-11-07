<script lang="ts">
  /**
   * The table's status row: who holds priority, how many cards are in hand, the
   * step Phase reports and the manual/auto-pass switch.
   *
   * Ported from Phase's bottom dock (`hud/PlayerHud.tsx` + `controls/
   * PassButton.tsx` + `controls/FullControlToggle.tsx`). Composition only: the
   * labels come from the snapshot Phase sends, and the switch drives the same
   * `autoPass` preference the top bar already had — no rule lives here.
   *
   * The pass itself stays in `DecisionPanel`: that is where the engine-authored
   * `PassPriority` action is rendered with the rest of the legal actions, and
   * the E2E drivers locate it there. Duplicating the button would give two
   * controls the same accessible name.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { phaseLabel, seatStatus } from '#lib/ui/phases.ts';

  let { compact = false }: { compact?: boolean } = $props();

  const s = $derived(session.snapshot);
  const viewer = $derived(s?.viewer ?? 0);
  const waiting = $derived(s?.state.waiting_for);
  const status = $derived(seatStatus(waiting, viewer));
  const phase = $derived(phaseLabel(s?.state.phase));
  const handCount = $derived(s?.state.players?.[viewer]?.hand.length ?? 0);
</script>

<div class="status-dock" data-compact={compact} role="group" aria-label="Estado de la mesa">
  <span class="chip status" data-tone={status.tone}>
    <span class="dot" aria-hidden="true"></span>{status.label}
  </span>
  {#if phase}<span class="chip phase"><span class="sr-only">Fase: </span>{phase}</span>{/if}
  {#if session.stopActive}<span class="chip stop">Parada</span>{/if}
  <span class="chip hand"><span class="caps">Mano</span> {handCount}</span>
  <!-- Same preference as the top-bar checkbox, with its own name so neither
       control shadows the other for assistive technology or the E2E. -->
  <button
    type="button"
    class="chip control"
    aria-pressed={!session.autoPass}
    aria-label="Control total (desactiva el auto-paso)"
    aria-describedby="mesa-control-hint"
    onclick={() => session.setAutoPass(!session.autoPass)}
  >
    Control
  </button>
  <span id="mesa-control-hint" class="sr-only">
    Con el control total activo recibes cada ventana de prioridad; con el auto-paso, Phase pasa las ventanas que no
    ofrecen acciones.
  </span>
</div>

<style>
  .status-dock {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: .4rem;
    flex-wrap: wrap;
    min-width: 0;
    font-size: .74rem;
    color: var(--ink-muted);
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: .35rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: .22rem .6rem;
    background: color-mix(in srgb, var(--surface) 86%, transparent);
    font: inherit;
    line-height: 1.2;
    white-space: nowrap;
  }
  .status { color: var(--ink); font-weight: 650; }
  .status .dot {
    width: .42rem;
    height: .42rem;
    border-radius: 50%;
    background: var(--ink-muted);
  }
  .status[data-tone='mine'] {
    border-color: color-mix(in srgb, var(--ok) 55%, var(--line));
    color: var(--ok);
  }
  .status[data-tone='mine'] .dot { background: var(--ok); }
  .status[data-tone='theirs'] .dot { background: var(--accent); }
  .caps {
    text-transform: uppercase;
    letter-spacing: .09em;
    font-size: .66rem;
    font-weight: 700;
  }
  .hand { color: var(--ink); }
  .stop {
    border-color: color-mix(in srgb, var(--accent) 70%, var(--line));
    background: color-mix(in srgb, var(--accent) 24%, var(--surface));
    color: var(--ink);
    text-transform: uppercase;
    letter-spacing: .09em;
    font-size: .64rem;
    font-weight: 700;
  }
  .control {
    text-transform: uppercase;
    letter-spacing: .09em;
    font-size: .66rem;
    font-weight: 700;
    cursor: pointer;
    min-height: 26px;
  }
  .control:hover { border-color: var(--accent); color: var(--ink); }
  .control[aria-pressed='true'] {
    border-color: color-mix(in srgb, var(--accent) 70%, var(--line));
    background: color-mix(in srgb, var(--accent) 22%, var(--surface));
    color: var(--ink);
  }
  .control:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
  @media (max-width: 640px) {
    .status-dock { justify-content: flex-start; gap: .3rem; }
    .chip { padding: .2rem .5rem; }
  }
</style>
