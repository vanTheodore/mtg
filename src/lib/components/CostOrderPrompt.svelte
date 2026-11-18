<script lang="ts">
  /**
   * `WaitingFor::OrderCostReductions` — CR 601.2b + CR 601.2f.
   *
   * The engine already proved which elections lock different totals, and
   * published one representative each. Each button is that published
   * `OrderCostReductions`. This block does not reorder the reductions and does
   * not announce a hybrid the outcome did not carry. A total the prompt lists
   * and `legal.actions` does not is not a button. `CancelCast` appears only
   * when it is legal. The locked cost is printed, never recomputed.
   *
   * The other seat sees the published totals and gets no button (CR 400.2).
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { costOrderOffers } from '#lib/game/interaction.ts';
  import { manaText } from '#lib/game/cards.ts';

  const prompt = $derived(session.costOrderPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const offers = $derived(costOrderOffers(session.snapshot?.legal.actions ?? []));
  const spell = $derived.by(() => {
    const id = prompt?.spellId;
    if (id == null || id === 0) return '';
    const object = objects[String(id)];
    if (!object || object.display_visible_to_viewer === false) return '';
    return object.name ?? '';
  });

  function costLabel(cost: unknown) {
    const text = manaText(cost);
    if (text) return text;
    if (cost && typeof cost === 'object' && (cost as { type?: unknown }).type === 'Cost') return '{0}';
    return '';
  }
  function reductionName(index: number) {
    const reduction = prompt?.reductions[index];
    return reduction?.name || `Reducción ${index + 1}`;
  }
  function orderNote(order: number[]) {
    const names = order.map(reductionName);
    if (names.length === 0) return 'El motor no publicó un orden legible.';
    if (names.length === 1) return `Se aplica ${names[0]}.`;
    return `Primero ${names[0]}, luego ${names.slice(1).join(', luego ')}.`;
  }
  function hybridLabel(shards: string[]) {
    return manaText({ type: 'Cost', generic: 0, shards }) || shards.join(', ');
  }
</script>

{#if prompt}
  <div class="prompt" aria-label="Elegir coste fijado" data-cost-order data-cost-order-count={prompt.outcomes.length}>
    <strong>Elegir coste fijado{spell ? ` · ${spell}` : ''}</strong>
    <p class="hint" data-cost-order-rule>
      CR 601.2f: el orden cambia el total. Cada botón es un total que el motor ya fijó. Esta mesa no reordena ni anuncia un híbrido por su cuenta.
    </p>
    <ul class="faces" data-cost-order-reductions>
      {#each prompt.reductions as reduction (reduction.index)}
        <li>
          {reduction.name || `Reducción ${reduction.index + 1}`}
          {#if costLabel(reduction.amount)}{costLabel(reduction.amount)}{/if}
          {#if reduction.multiplier !== null && reduction.multiplier > 1}×{reduction.multiplier}{/if}
          {#if reduction.reach === 'ColoredManaOnly'}· sólo maná de color{/if}
          {#if reduction.minimumMana !== null}· no baja de {reduction.minimumMana}{/if}
        </li>
      {/each}
    </ul>
    {#if !mine}
      <ul class="faces" data-cost-order-faces>
        {#each prompt.outcomes as outcome (outcome.index)}
          <li>
            {costLabel(outcome.lockedCost) || 'total publicado'}
            · {orderNote(outcome.order)}
          </li>
        {/each}
      </ul>
      <p class="hint" data-cost-order-other>
        Este total lo elige el Jugador {prompt.player + 1}: no es tu decisión (CR 400.2).
      </p>
    {:else}
      <div class="actions">
        {#each prompt.outcomes as outcome (outcome.index)}
          {@const action = offers.byKey.get(outcome.key)}
          {#if action}
            <button
              type="button"
              class="primary"
              data-cost-order-outcome={outcome.index}
              disabled={session.busy}
              onclick={() => session.answerCostOrder(action)}>
              Fijar {costLabel(outcome.lockedCost) || 'el total publicado'}
            </button>
          {/if}
        {/each}
        {#if offers.cancel}
          <button
            type="button"
            class="ghost"
            data-cost-order-cancel
            disabled={session.busy}
            onclick={() => session.cancelCostOrder()}>
            Cancelar lanzamiento
          </button>
        {/if}
      </div>
      {#each prompt.outcomes as outcome (outcome.index)}
        {#if offers.byKey.has(outcome.key)}
          <p class="hint" data-cost-order-note={outcome.index}>{orderNote(outcome.order)}</p>
          {#if outcome.hybrid.length}
            <p class="hint" data-cost-order-hybrid={outcome.index}>Anuncia {hybridLabel(outcome.hybrid)}.</p>
          {:else if prompt.hybridSymbols.length}
            <p class="hint" data-cost-order-hybrid={outcome.index}>No anuncia el híbrido.</p>
          {/if}
        {/if}
      {/each}
    {/if}
  </div>
{/if}

<style>
  .prompt {
    display: grid;
    gap: .45rem;
    padding: .65rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface-2);
  }
  strong { font-size: .9rem; }
  .hint { margin: 0; font-size: .78rem; color: var(--ink-2); }
  .faces { margin: 0; padding-left: 1.1rem; font-size: .78rem; }
  .actions { display: flex; gap: .4rem; flex-wrap: wrap; }
  .primary,
  .ghost {
    min-height: 44px;
    padding: .55rem .7rem;
    border-radius: 9px;
    font: inherit;
    font-size: .82rem;
    font-weight: 650;
    cursor: pointer;
  }
  .primary { border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); }
  .ghost { border: 1px solid var(--line); background: var(--surface-3); color: var(--ink); }
  .primary:disabled,
  .ghost:disabled { opacity: .55; cursor: not-allowed; }
  .primary:focus-visible,
  .ghost:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
