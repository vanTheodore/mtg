<script lang="ts">
  /**
   * `WaitingFor::PayAmountChoice` — CR 107.1c + CR 118.1.
   *
   * The engine owns the window (`min..max`) and says what the amount is spent
   * on. Two cases share the prompt and must not be confused:
   *   - a payment (`Energy`, `Mana`, `Counters`, `Life`, `Speed`), where the
   *     amount is a cost the player chooses to pay;
   *   - CR 732.2a's loop collapse (`LoopCollapse`), where NOTHING is spent: the
   *     amount is how many cycles a suggested loop is collapsed into, so the
   *     label counts iterations and never says "pagar".
   *
   * The entry is sanitised with `parseAmount` (digits only, inside the window)
   * and an invalid entry disables the commit instead of being clamped: a number
   * the player did not type never reaches Phase.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { payAmountLabel } from '#lib/game/interaction.ts';
  import AmountField from './AmountField.svelte';

  const prompt = $derived(session.payAmountPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer && prompt.max >= prompt.min);
  const source = $derived(
    prompt ? session.snapshot?.state.objects[String(prompt.sourceId)]?.name : undefined
  );
  const value = $derived(session.payValue);
  const title = $derived(
    !prompt
      ? ''
      : prompt.resource.kind === 'loop'
        ? 'Collapsar el bucle'
        : prompt.pendingManaAbility
          ? 'Anunciar X de la habilidad de maná'
          : 'Elige una cantidad'
  );
  const hint = $derived(
    !prompt
      ? ''
      : `${prompt.min > 0 ? `Entre ${prompt.min} y ${prompt.max}` : `Máximo ${prompt.max}`}${
          prompt.accumulated > 0 ? ` · llevas ${prompt.accumulated}` : ''
        }`
  );
  const error = $derived(
    value === null && prompt ? `Escribe un número entre ${prompt.min} y ${prompt.max}.` : ''
  );
</script>

{#if prompt && mine}
  <div class="prompt" aria-label="Elegir una cantidad" data-pay-amount>
    <strong>{title}{source ? ` · ${source}` : ''}</strong>
    {#if prompt.resource.kind === 'loop'}
      <p class="note">No se gasta nada: el motor aplica ese número de ciclos.</p>
    {/if}
    <AmountField
      raw={session.payRaw}
      min={prompt.min}
      max={prompt.max}
      value={value}
      name="pay"
      inputLabel="Cantidad"
      decreaseLabel="Restar uno a la cantidad"
      increaseLabel="Sumar uno a la cantidad"
      maxLabel="Cantidad al máximo"
      {hint}
      {error}
      oninput={(raw) => session.setPayRaw(raw)}
      onstep={(delta) => session.stepPay(delta)}
      onmaximum={() => session.setPayRaw(String(prompt.max))}
      onenter={() => session.confirmPay()} />
    <div class="row">
      <button
        type="button"
        class="primary"
        disabled={session.busy || value === null}
        onclick={() => session.confirmPay()}>
        {payAmountLabel(prompt, value)}
      </button>
    </div>
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
  .note { margin: 0; font-size: .78rem; color: var(--ink-2); }
  .row { display: flex; gap: .4rem; flex-wrap: wrap; }
  .primary {
    min-height: 44px;
    padding: .5rem .8rem;
    border: 1px solid var(--accent);
    border-radius: 9px;
    background: var(--accent);
    color: var(--accent-ink);
    font: inherit;
    font-size: .84rem;
    font-weight: 650;
    cursor: pointer;
  }
  .primary:disabled { opacity: .55; cursor: not-allowed; }
  .primary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
