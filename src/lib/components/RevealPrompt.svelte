<script lang="ts">
  /**
   * `WaitingFor::RevealChoice` — CR 701.20a.
   *
   * The player shows one card from a hidden zone. The engine publishes the
   * cards it accepts and whether the reveal is optional: the reveal-land
   * pattern (Port Town, Gilt-Leaf Palace) makes «no revelar» a real answer that
   * runs the card's other branch, so the decline is a button, not an accident.
   *
   * How many cards may be marked is the engine's `cardinality` (CR 608.2d): the
   * historical shape is exactly one — where marking a second card replaces the
   * first instead of adding to it — and "reveal any number" (CR 107.1c) admits any
   * subset of the offered cards, including none.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { manaText } from '#lib/game/cards.ts';

  const prompt = $derived(session.revealPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const picked = $derived(session.revealPick);
  const picks = $derived(session.revealPicks);
  const marked = (id: number) => (picks.includes(id) || picked === id);
  const single = $derived(prompt?.cardinality.kind === 'exactly' && prompt.cardinality.count === 1);
  const count = $derived(prompt?.cardinality.kind === 'exactly' ? prompt.cardinality.count : null);

  const title = $derived(prompt?.optional ? 'Revelar de la mano' : 'Mano del oponente');
  const hint = $derived.by(() => {
    if (!prompt) return '';
    if (single) return prompt.optional ? 'Elige una carta para revelar, o no reveles.' : 'Elige la carta que te muestran.';
    if (count !== null) return `Elige exactamente ${count} cartas para revelar.`;
    // CR 107.1c: any subset of the offered cards, and none at all.
    return 'Puedes revelar cualquier número de estas cartas, incluso ninguna (CR 107.1c).';
  });

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
            aria-pressed={marked(id)}
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
        {#if picks.length}
          Revelar {picks.length === 1 ? '1 carta' : `${picks.length} cartas`}
        {:else if picked !== null}
          Revelar {nameOf(picked)}
        {:else if prompt.cardinality.kind === 'any'}
          Revelar ninguna
        {:else}
          Confirmar
        {/if}
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
