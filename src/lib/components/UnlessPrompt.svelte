<script lang="ts">
  /**
   * `WaitingFor::UnlessPayment` — CR 118.12 ("counter it unless its controller
   * pays {3}").
   *
   * The payer answers pay-or-not, and both halves are the engine's: the cost is
   * an `AbilityCost` (mana, life, or an object cost this table cannot price) and
   * the consequence arrives as `effect_description`. Declining is a real answer,
   * so it is a button with the consequence written next to it, not a silent
   * "continue".
   *
   * CR 118.12a: with "unless any player pays", the engine publishes the seats
   * still to be polled; the first one that pays stops the effect, so saying who
   * comes next is not decoration.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { unlessCostLabel } from '#lib/game/interaction.ts';

  const prompt = $derived(session.unlessPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const cost = $derived(prompt ? unlessCostLabel(prompt.cost) : null);
  const others = $derived(prompt?.remaining.length ?? 0);
</script>

{#if prompt && mine}
  <div class="prompt" aria-label="Pagar o aceptar el efecto" data-unless-prompt>
    <strong>{cost ? `Paga ${cost}` : 'Paga el coste'}</strong>
    <p class="hint">
      {#if prompt.effect}
        Si no pagas: {prompt.effect}.
      {:else}
        Phase ejecuta el efecto si no pagas.
      {/if}
      {#if prompt.cost.kind === 'other'}
        La mesa no puede describir este coste con palabras; el motor sí comprueba si puedes pagarlo.
      {/if}
      {#if others > 0}
        Si no pagas, {others === 1 ? 'se le pregunta a 1 jugador más' : `se les pregunta a ${others} jugadores más`}: el primero que pague lo detiene.
      {/if}
    </p>
    <div class="row">
      <button type="button" class="primary" disabled={session.busy} onclick={() => session.decideUnless(true)}>
        {cost ? `Pagar ${cost}` : 'Pagar'}
      </button>
      <button type="button" class="ghost" disabled={session.busy} onclick={() => session.decideUnless(false)}>
        No pagar
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
  .hint { margin: 0; font-size: .78rem; color: var(--ink-2); }
  .row { display: flex; gap: .4rem; flex-wrap: wrap; }
  .primary, .ghost {
    min-height: 44px;
    padding: .55rem .8rem;
    border-radius: 9px;
    font: inherit;
    font-size: .84rem;
    font-weight: 650;
    cursor: pointer;
  }
  .primary { border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); }
  .ghost { border: 1px solid var(--line); background: var(--surface-3); color: var(--ink); }
  .primary:disabled, .ghost:disabled { opacity: .55; cursor: not-allowed; }
  .primary:focus-visible, .ghost:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
