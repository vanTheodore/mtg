<script lang="ts">
  /**
   * UX-DECISION · la acción principal contextual.
   *
   * Un único botón dominante cuando la ventana lo permite. La consecuencia se
   * asocia con `aria-describedby` mediante un texto sólo para lectores de
   * pantalla: NO forma parte del nombre accesible del botón, así «No atacar»
   * sigue siendo exactamente «No atacar». La explicación visible ya la publica
   * `DecisionContext`; duplicarla aquí costaba el alto que el rail de escritorio
   * y la hoja fija del teléfono necesitan para que el último botón responda.
   */
  import type { GameAction } from '#lib/engine/types.ts';
  import type { ProjectedAction } from '#lib/game/decisionProjection.ts';

  let {
    action, disabled = false, onplay
  }: {
    action: ProjectedAction | null;
    disabled?: boolean;
    onplay: (action: GameAction) => void;
  } = $props();
</script>

{#if action}
  <div class="primary-block" data-decision-surface-primary>
    <button
      type="button"
      class="primary"
      data-tier="primary"
      data-decision-primary={action.key}
      data-origin={action.origin}
      aria-describedby={action.hint ? 'decision-primary-hint' : undefined}
      disabled={disabled}
      onclick={() => onplay(action.action)}
    >{action.label}</button>
    {#if action.hint}<span id="decision-primary-hint" class="sr-only">{action.hint}</span>{/if}
  </div>
{/if}

<style>
  .primary-block { display: grid; min-width: 0; }
  button {
    width: 100%;
    text-align: left;
    min-height: 44px;
    padding: .5rem .65rem;
    border: 1px solid var(--accent);
    border-radius: 10px;
    background: var(--accent);
    color: var(--accent-ink);
    font: inherit;
    font-size: .88rem;
    font-weight: 700;
    cursor: pointer;
  }
  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
  }
  button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  button:disabled { opacity: .55; cursor: wait; }
</style>
