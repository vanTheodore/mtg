<script lang="ts">
  /**
   * UX-DECISION · divulgación progresiva de las opciones legales.
   *
   * La reducción de controles visibles viene de *organizar*, nunca de podar:
   * todas las acciones que `legal.actions` publica están aquí, repartidas en
   * elecciones estratégicas, acciones secundarias, controles avanzados y
   * cancelación. La cancelación vive fuera del `<details>` para que una acción
   * de seguridad nunca dependa de abrir un panel.
   *
   * Cuando un componente especializado está resolviendo la ventana no hay
   * acción principal dominante, así que el desplegable nace abierto: ninguna
   * opción estratégica queda escondida.
   */
  import type { GameAction } from '#lib/engine/types.ts';
  import type { DecisionProjection, DecisionTier, ProjectedAction } from '#lib/game/decisionProjection.ts';
  import { TIER_LABELS } from '#lib/game/decisionProjection.ts';
  import AdvancedControls from './AdvancedControls.svelte';

  let {
    projection, disabled = false, onplay
  }: {
    projection: DecisionProjection;
    disabled?: boolean;
    onplay: (action: GameAction) => void;
  } = $props();

  const tiers = $derived(projection.tiers);
  /** Con especialista activo, sus propios controles ya están a la vista: el
   * desplegable es un rescate/auditoría y nace cerrado. Si no hay principal ni
   * especialista (ventanas de objetivos o de carta seleccionada), nace abierto
   * para que ninguna opción estratégica quede escondida. */
  const openByDefault = $derived(!projection.specialistActive && projection.primary === null);
  const deferredCount = $derived(tiers.strategic.length + tiers.secondary.length + tiers.advanced.length);
  const modeActions = $derived(tiers.advanced.filter((a) => a.action.type === 'SetPriorityPassingMode'));
  const otherAdvanced = $derived(tiers.advanced.filter((a) => a.action.type !== 'SetPriorityPassingMode' && a.panel !== 'phase-stops'));
  const ORDER: Exclude<DecisionTier, 'primary' | 'cancel'>[] = ['strategic', 'secondary', 'advanced'];

  function rows(tier: Exclude<DecisionTier, 'primary' | 'cancel'>): ProjectedAction[] {
    if (tier === 'advanced') return otherAdvanced;
    return tiers[tier];
  }

  function activate(action: ProjectedAction) {
    if (action.panel === 'phase-stops') {
      const details = document.querySelector<HTMLDetailsElement>('details[data-advanced-controls]');
      if (details) { details.open = true; details.querySelector<HTMLButtonElement>('button[data-step]')?.focus(); }
      return;
    }
    onplay(action.action);
  }
</script>

{#if tiers.cancel.length}
  <div class="cancel-row" data-tier="cancel" aria-label="Cancelación">
    {#each tiers.cancel as action (action.key)}
      <button
        type="button"
        class="cancel"
        data-decision-cancel={action.key}
        disabled={disabled}
        onclick={() => onplay(action.action)}
      >{action.label}</button>
    {/each}
  </div>
{/if}

<details class="tiers" data-decision-tiers open={openByDefault} data-open-by-default={openByDefault}>
  <summary aria-controls="decision-tier-body">
    Más opciones <span class="count">{deferredCount}</span>
    <span class="hint">{openByDefault ? 'todas las opciones legales están aquí' : 'bajo demanda, sin quitar ninguna'}</span>
  </summary>
  <div class="body" id="decision-tier-body">
    {#each ORDER as tier (tier)}
      {@const list = rows(tier)}
      {#if list.length || tier === 'advanced'}
        <section class="tier" data-tier={tier}>
          <h3>{TIER_LABELS[tier]} <span class="count">{tier === 'advanced' ? modeActions.length + otherAdvanced.length : list.length}</span></h3>
          {#if tier === 'advanced'}
            <AdvancedControls modes={modeActions} {disabled} {onplay} />
          {/if}
          <div class="actions">
            {#each list as action (action.key)}
              <button
                type="button"
                data-tier={tier}
                data-decision-action={action.key}
                data-confirmation={action.confirmation ?? undefined}
                disabled={disabled}
                onclick={() => activate(action)}
              >
                <span>{action.label}{action.confirmation ? ' · requiere confirmación' : ''}</span>
                {#if action.hint}<small>{action.hint}</small>{/if}
              </button>
            {/each}
          </div>
        </section>
      {/if}
    {/each}
  </div>
</details>

<!-- Auditoría de integridad: siempre en el DOM, sin costar una fila de alto.
     No depende de abrir el desplegable, igual que la cancelación, y sigue
     siendo legible por el lector de pantalla. -->
<span class="sr-only" data-decision-integrity={projection.integrity.ok} role="status">
  {projection.integrity.total} acciones legales globales · {projection.integrity.byObject} por objeto en el tablero · {projection.integrity.classified} clasificadas
</span>

<style>
  .tiers { margin-top: .5rem; font-size: .8rem; }
  summary {
    cursor: pointer; min-height: 32px; display: flex; align-items: center; gap: .35rem;
    padding: .25rem .45rem; border: 1px solid var(--line); border-radius: 9px;
    background: var(--surface-2); color: var(--ink); list-style-position: inside;
  }
  summary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  summary .hint { color: var(--ink-muted); font-size: .7rem; margin-left: auto; }
  .count {
    font-size: .68rem; font-weight: 700; background: var(--surface); border: 1px solid var(--line);
    border-radius: 999px; padding: .05rem .4rem;
  }
  .body { display: grid; gap: .5rem; padding: .5rem .15rem .15rem; }
  .tier { display: grid; gap: .3rem; }
  h3 { margin: 0; font-size: .74rem; text-transform: uppercase; letter-spacing: .07em; color: var(--ink-muted); }
  .actions { display: grid; gap: .3rem; }
  .actions button, .cancel {
    display: grid; gap: .1rem; text-align: left; min-height: 40px;
    border: 1px solid var(--line); border-radius: 9px; background: var(--surface);
    color: var(--ink); font: inherit; font-size: .8rem; padding: .45rem .6rem; cursor: pointer;
  }
  .actions button small { font-size: .69rem; color: var(--ink-muted); line-height: 1.3; }
  .actions button[data-confirmation] { border-color: color-mix(in srgb, #b45309 65%, var(--line)); }
  .actions button:focus-visible, .cancel:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .cancel-row { display: flex; flex-wrap: wrap; gap: .3rem; margin-top: .4rem; }
  .cancel { min-height: 40px; font-size: .78rem; }
  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
  }
  button:disabled { opacity: .55; cursor: wait; }
</style>
