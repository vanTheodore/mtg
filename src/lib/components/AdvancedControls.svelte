<script lang="ts">
  /**
   * UX-DECISION · superficie secundaria de controles avanzados.
   *
   * Phase publica `PriorityPassingMode` (`Standard`, `SkipLowUseWindows`,
   * `FullControl`) y la acción `SetPriorityPassingMode`; Mesa ya conserva las
   * doce paradas de fase y el auto-paso (`session`). Aquí sólo se *organiza* lo
   * que ya existe bajo demanda: no se define todavía una política nueva de
   * automatización (eso pertenece a UX-PRIORITY) y no se simula ningún estado
   * que el motor no haya publicado.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import type { GameAction } from '#lib/engine/types.ts';
  import type { ProjectedAction } from '#lib/game/decisionProjection.ts';

  let {
    modes, disabled = false, onplay
  }: {
    modes: ProjectedAction[];
    disabled?: boolean;
    onplay: (action: GameAction) => void;
  } = $props();

  const MODE_LABELS: Record<string, string> = {
    Standard: 'Estándar',
    SkipLowUseWindows: 'Saltar ventanas de poco uso',
    FullControl: 'Control total'
  };

  const stops = $derived(Object.keys(session.stops ?? {}).length);
  const snapshot = $derived(session.snapshot);

  function openStops() {
    const details = document.querySelector<HTMLDetailsElement>('details[data-advanced-controls]');
    if (!details) return;
    details.open = true;
    details.querySelector<HTMLButtonElement>('button[data-step]')?.focus();
  }

  function modeLabel(action: GameAction): string {
    const mode = action.data?.mode;
    return typeof mode === 'string' ? (MODE_LABELS[mode] ?? mode) : 'Modo de prioridad';
  }
</script>

<div class="advanced" data-advanced-surface>
  <p class="state" data-auto-pass={session.autoPass} data-stops={stops}>
    Auto-paso: {session.autoPass ? 'activo' : 'desactivado'} · Paradas activas: {stops}
    {#if snapshot?.auto_pass_recommended}· Phase recomienda pasar ahora{/if}
  </p>
  <div class="row">
    <button type="button" class="link" data-open-phase-stops onclick={openStops}>Abrir paradas de fase</button>
  </div>
  {#if modes.length}
    <div class="modes" aria-label="Modo de paso de prioridad de Phase">
      {#each modes as mode (mode.key)}
        <button type="button" data-priority-mode={String(mode.action.data?.mode ?? '')} disabled={disabled} onclick={() => onplay(mode.action)}>
          {modeLabel(mode.action)}
        </button>
      {/each}
    </div>
  {:else}
    <p class="muted">Phase no ofrece cambiar el modo de prioridad en esta ventana.</p>
  {/if}
  <p class="muted scope">La política completa de automatización se definirá en UX-PRIORITY; aquí se conserva la funcionalidad existente.</p>
</div>

<style>
  .advanced { display: grid; gap: .35rem; font-size: .76rem; }
  .state { margin: 0; color: var(--ink-muted); }
  .row { display: flex; }
  .link { background: none; border: none; color: var(--focus); font: inherit; padding: .25rem 0; text-align: left; cursor: pointer; min-height: 32px; }
  .modes { display: flex; flex-wrap: wrap; gap: .3rem; }
  .modes button {
    min-height: 36px; padding: .35rem .55rem; font: inherit; font-size: .74rem;
    border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); cursor: pointer;
  }
  .modes button:focus-visible, .link:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .muted { margin: 0; color: var(--ink-muted); }
  .scope { font-size: .7rem; line-height: 1.3; }
  button:disabled { opacity: .55; cursor: wait; }
</style>
