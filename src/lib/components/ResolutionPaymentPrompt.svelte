<script lang="ts">
  /**
   * `WaitingFor::ResolutionOptionalPaymentChoice` — CR 118.12.
   *
   * While an effect resolves, the payer may pay one published branch or
   * decline. Each button is the published
   * `ChooseResolutionOptionalPaymentBranch`. `index` is the branch's place in
   * the original cost: an omitted sibling is not renumbered into a button.
   * Decline exists only when the tagged `Decline` is itself legal. A cost this
   * table cannot name is still a button, labeled by that index.
   *
   * The other seat sees the branches and gets no button (CR 400.2).
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { namedAbilityCost, resolutionPaymentOffers } from '#lib/game/interaction.ts';

  const prompt = $derived(session.resolutionPaymentPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const offers = $derived(resolutionPaymentOffers(session.snapshot?.legal.actions ?? []));
  const source = $derived.by(() => {
    const id = prompt?.sourceId;
    if (id == null || id === 0) return '';
    const object = objects[String(id)];
    if (!object || object.display_visible_to_viewer === false) return '';
    return object.name ?? '';
  });

  function optionLabel(index: number, cost: unknown) {
    const named = namedAbilityCost(cost).label;
    return named ? `Pagar ${named}` : `Pagar índice ${index}`;
  }
</script>

{#if prompt}
  <div class="prompt" aria-label="Elegir un pago opcional" data-res-pay data-res-pay-count={prompt.options.length}>
    <strong>Elegir un pago opcional{source ? ` · ${source}` : ''}</strong>
    <p class="hint" data-res-pay-rule>
      CR 118.12: pagas una rama de las que publicó el motor, o no pagas si esa respuesta está en el cable. El índice es el del motor: no se renumera.
    </p>
    {#if !mine}
      <ul class="faces" data-res-pay-faces>
        {#each prompt.options as option (option.index)}
          <li>{optionLabel(option.index, option.cost)}</li>
        {/each}
      </ul>
      <p class="hint" data-res-pay-other>
        Este pago lo elige el Jugador {prompt.player + 1}: no es tu decisión (CR 400.2).
      </p>
    {:else}
      <div class="actions">
        {#each prompt.options as option (option.index)}
          {@const action = offers.byIndex.get(option.index)}
          {#if action}
            <button
              type="button"
              class="primary"
              data-res-pay-option={option.index}
              disabled={session.busy}
              onclick={() => session.answerResolutionPayment(action)}>
              {optionLabel(option.index, option.cost)}
            </button>
          {/if}
        {/each}
        {#if offers.decline}
          <button
            type="button"
            class="ghost"
            data-res-pay-decline
            disabled={session.busy}
            onclick={() => session.declineResolutionPayment()}>
            No pagar
          </button>
        {/if}
      </div>
      {#if offers.decline}
        <p class="hint" data-res-pay-decline-note>No pagar deja el efecto sin esa rama.</p>
      {/if}
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
