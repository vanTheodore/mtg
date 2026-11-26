<script lang="ts">
  /**
   * UX-DECISION · la acción principal contextual.
   *
   * Un único botón dominante cuando la ventana lo permite. La consecuencia se
   * asocia con `aria-describedby` pero NO forma parte del nombre accesible del
   * botón: así «No atacar» sigue siendo exactamente «No atacar» para el lector
   * de pantalla, para el teclado y para las pruebas que buscan esa etiqueta.
   * `decisionProjection` decide qué acción es dominante; este componente nunca
   * elige ni calcula.
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
    {#if action.hint}
      <p id="decision-primary-hint" class="consequence">{action.hint}</p>
    {/if}
  </div>
{/if}

<style>
  .primary-block { display: grid; gap: .25rem; min-width: 0; }
  button {
    width: 100%;
    text-align: left;
    min-height: 48px;
    padding: .6rem .75rem;
    border: 1px solid var(--accent);
    border-radius: 11px;
    background: var(--accent);
    color: var(--accent-ink);
    font: inherit;
    font-size: .95rem;
    font-weight: 700;
    cursor: pointer;
  }
  .consequence {
    margin: 0; font-size: .72rem; line-height: 1.3; color: var(--ink-muted);
    border-left: 2px solid var(--accent); padding-left: .5rem;
  }
  button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  button:disabled { opacity: .55; cursor: wait; }
</style>
