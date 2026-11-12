<script lang="ts">
  /**
   * `WaitingFor::RevealChoice` — CR 701.20a.
   *
   * The player shows one card from a hidden zone. The engine publishes the
   * cards it accepts and whether the reveal is optional: the reveal-land
   * pattern (Port Town, Gilt-Leaf Palace) makes «no revelar» a real answer that
   * runs the card's other branch, so the decline is a button, not an accident.
   *
   * Exactly one card is picked. Marking a second one replaces the first instead
   * of adding to it — the engine asks for one card and a multi-select would
   * promise something the answer cannot express.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { manaText } from '#lib/game/cards.ts';

  const prompt = $derived(session.revealPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const picked = $derived(session.revealPick);

  const title = $derived(prompt?.optional ? 'Revelar de la mano' : 'Mano del oponente');
  const hint = $derived(
    !prompt
      ? ''
      : prompt.optional
        ? 'Elige una carta para revelar, o no reveles.'
        : 'Elige la carta que te muestran.'
  );

  function nameOf(id: number) {
    return objects[String(id)]?.name ?? `Carta ${id}`;
  }
  function typeLine(id: number) {
    const types = objects[String(id)]?.card_types?.core_types ?? [];
    const subtypes = objects[String(id)]?.card_types?.subtypes ?? [];
    return [...types, ...subtypes].join(' ') || 'Carta';
  }
  function costOf(id: number) {
    return manaText(objects[String(id)]?.mana_cost) ?? '';
  }
</script>

{#if prompt && mine}
  <div class="prompt" aria-label="Revelar una carta" data-reveal-prompt>
    <strong>{title}</strong>
    <p class="hint">
      {hint}
      {#if prompt.optional && !prompt.declineRunsContinuation}
        Si no revelas, se salta la elección que venía después.
      {/if}
    </p>
    <ul class="cards">
      {#each prompt.cards as id (id)}
        <li>
          <button
            type="button"
            class="card"
            aria-pressed={picked === id}
            onclick={() => session.toggleReveal(id)}>
            <span class="name">{nameOf(id)}</span>
            <span class="type">{typeLine(id)}</span>
            {#if costOf(id)}<span class="cost">{costOf(id)}</span>{/if}
          </button>
        </li>
      {/each}
    </ul>
    <div class="row">
      <button
        type="button"
        class="primary"
        disabled={session.busy || !session.revealReady}
        onclick={() => session.confirmReveal()}>
        {picked === null ? 'Confirmar' : `Revelar ${nameOf(picked)}`}
      </button>
      {#if prompt.optional}
        <button type="button" class="ghost" disabled={session.busy} onclick={() => session.declineReveal()}>
          No revelar
        </button>
      {/if}
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
  .cards { margin: 0; padding: 0; list-style: none; display: grid; gap: .3rem; max-height: 16rem; overflow: auto; }
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
  .name { font-size: .84rem; font-weight: 650; }
  .type, .cost { font-size: .74rem; color: var(--ink-2); }
  .cost { margin-left: auto; }
  .row { display: flex; gap: .4rem; flex-wrap: wrap; }
  .primary, .ghost {
    min-height: 44px;
    padding: .55rem .7rem;
    border-radius: 9px;
    font: inherit;
    font-size: .84rem;
    font-weight: 650;
    cursor: pointer;
  }
  .primary { border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); }
  .primary:disabled { opacity: .55; cursor: not-allowed; }
  .ghost { border: 1px solid var(--line); background: var(--surface-3); color: var(--ink); }
  .card:focus-visible, .primary:focus-visible, .ghost:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
