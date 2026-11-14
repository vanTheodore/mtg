<script lang="ts">
  /**
   * `WaitingFor::DigChoice` — CR 701.20e.
   *
   * "Look at the top N cards" shows cards from a hidden zone, so the searcher
   * cannot click them on the table: Phase publishes them here, marks which ones
   * pass the effect's filter and says where each pile ends up. The block keeps
   * only what the player picked; the rest is the engine's business.
   *
   * The destination is part of the decision, not decoration: keeping a card
   * "on top of your library" and "into your hand" are different choices over
   * the same cards, and a port that omits the label asks the player to guess.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { manaText } from '#lib/game/cards.ts';

  const prompt = $derived(session.digPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const kept = $derived(session.dug);

  function nameOf(id: number) {
    return objects[String(id)]?.name ?? `Carta ${id}`;
  }
  function costOf(id: number) {
    return manaText(objects[String(id)]?.mana_cost) ?? '';
  }
</script>

{#if prompt && mine}
  <div class="prompt" aria-label="Mirar cartas de la biblioteca" data-dig-prompt>
    <strong>Mira {prompt.cards.length} carta{prompt.cards.length === 1 ? '' : 's'}</strong>
    <p class="hint">
      {#if prompt.count === 1}
        Te quedas con una.
      {:else}
        Te quedas con hasta {prompt.count}.
      {/if}
      {#if prompt.partial}Puedes no quedarte con ninguna.{/if}
      {#if prompt.count < prompt.cards.length && !prompt.partial}Solo cuentan las que encajan con el efecto.{/if}
    </p>
    <p class="dest">Lo que guardas va a <strong>{prompt.keptLabel}</strong>; el resto {prompt.restLabel}.</p>
    {#if prompt.enterTapped || prompt.entersAttacking}
      <p class="dest">
        {prompt.entersAttacking ? 'Entran atacando' : 'Entran giradas'}.
      </p>
    {/if}
    <ul class="cards">
      {#each prompt.cards as id (id)}
        {@const eligible = prompt.selectable.includes(id)}
        {@const picked = kept.includes(id)}
        <li>
          <button
            type="button"
            class="card"
            aria-pressed={picked}
            disabled={!eligible}
            onclick={() => session.toggleDig(id)}>
            <span class="name">{nameOf(id)}</span>
            {#if costOf(id)}<span class="cost">{costOf(id)}</span>{/if}
            {#if !eligible}<span class="tag">No encaja</span>{/if}
          </button>
        </li>
      {/each}
    </ul>
    <button type="button" class="primary" disabled={session.busy || !session.digReady} onclick={() => session.confirmDig()}>
      {#if prompt.partial && kept.length === 0 && prompt.count > 0}
        No guardar nada
      {:else}
        Guardar ({kept.length}/{prompt.count})
      {/if}
    </button>
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
  .hint, .dest { margin: 0; font-size: .78rem; }
  .hint { color: var(--ink-2); }
  .dest { color: var(--ink-2); }
  .cards { margin: 0; padding: 0; list-style: none; display: grid; gap: .3rem; max-height: 14rem; overflow: auto; }
  .card {
    display: flex;
    align-items: baseline;
    gap: .45rem;
    width: 100%;
    min-height: 44px;
    padding: .45rem .55rem;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--surface-3);
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .card[aria-pressed='true'] { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
  .card:disabled { opacity: .45; cursor: not-allowed; }
  .name { font-size: .84rem; font-weight: 650; }
  .cost { font-size: .74rem; color: var(--ink-2); margin-left: auto; }
  .tag { font-size: .7rem; padding: .1rem .4rem; border-radius: 999px; border: 1px solid var(--line); }
  .primary {
    min-height: 44px;
    padding: .55rem .7rem;
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
  .card:focus-visible, .primary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
