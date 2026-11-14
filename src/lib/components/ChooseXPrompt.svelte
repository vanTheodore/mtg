<script lang="ts">
  /**
   * `WaitingFor::ChooseXValue` — the caster announces X while casting.
   *
   * CR 107.3a: the value belongs to the caster and is announced, not inferred;
   * CR 601.2f then pins the total cost that X feeds. The window arrives from
   * Phase (`min..max`, with `max` derived from what this player can pay) and
   * this block holds no bound of its own: it reads the window, validates the
   * entry with `parseX` and dispatches the exact `ChooseX` the engine offers.
   *
   * An out-of-range entry is REJECTED, not clamped: `99` under `max = 5` used
   * to cast for 5, a value the caster never typed.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { manaText } from '#lib/game/cards.ts';
  import { xCost } from '#lib/game/interaction.ts';
  import AmountField from './AmountField.svelte';

  const prompt = $derived(session.chooseXPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer && prompt.min <= prompt.max);
  const card = $derived(
    prompt?.objectId !== undefined
      ? session.snapshot?.state.objects[String(prompt.objectId)]?.name
      : undefined
  );
  const value = $derived(session.xValue);
  const cost = $derived(prompt && mine && value !== null ? manaText(xCost(prompt, value)) : '');
  const hint = $derived(
    !prompt ? '' : prompt.min > 0 ? `Entre ${prompt.min} y ${prompt.max}` : `Máximo ${prompt.max}`
  );
  const error = $derived(
    value === null && prompt ? `Escribe un número entre ${prompt.min} y ${prompt.max}.` : ''
  );
</script>

{#if prompt && mine}
  <div class="prompt" aria-label="Elegir la X del hechizo" data-x-prompt>
    <strong>Elegir X{card ? ` · ${card}` : ''}</strong>
    {#if cost}<p class="cost">Coste con X = {value}: {cost}</p>{/if}
    <AmountField
      raw={session.xRaw}
      min={prompt.min}
      max={prompt.max}
      value={value}
      name="x"
      inputLabel="Valor de X"
      decreaseLabel="Restar uno a X"
      increaseLabel="Sumar uno a X"
      maxLabel="X al máximo"
      {hint}
      {error}
      oninput={(raw) => session.setXRaw(raw)}
      onstep={(delta) => session.stepX(delta)}
      onmaximum={() => session.setXRaw(String(prompt.max))}
      onenter={() => session.confirmX()} />
    <div class="row">
      <button
        type="button"
        class="primary"
        disabled={session.busy || value === null}
        onclick={() => session.confirmX()}>
        {value === null ? 'Confirmar X' : `Confirmar X = ${value}`}
      </button>
      <button type="button" class="ghost" onclick={() => session.cancelCast()}>Cancelar</button>
    </div>
  </div>
{/if}

<style>
  .prompt {
    display: grid;
    gap: .4rem;
    padding: .65rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface-2);
  }
  strong { font-size: .9rem; }
  .cost { margin: 0; font-size: .82rem; color: var(--ink-2); }
  .row { display: flex; gap: .4rem; flex-wrap: wrap; }
  .primary, .ghost {
    min-height: 44px;
    padding: .5rem .7rem;
    border-radius: 9px;
    font: inherit;
    font-size: .84rem;
    font-weight: 650;
    cursor: pointer;
  }
  .primary { border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); }
  .primary:disabled { opacity: .55; cursor: not-allowed; }
  .ghost { border: 1px solid var(--line); background: var(--surface-3); color: var(--ink); }
  .primary:focus-visible, .ghost:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
</style>
