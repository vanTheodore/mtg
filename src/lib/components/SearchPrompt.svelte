<script lang="ts">
  /**
   * `WaitingFor::SearchChoice` — CR 701.23.
   *
   * The library is a hidden zone, so the searcher cannot click the cards on the
   * table: Phase publishes the legal choices and this block lists them. It never
   * decides what is findable.
   *
   * CR 701.23b/701.23d is the subtle part: a *stated-quality* search ("a
   * creature card", "with different names") may find fewer cards than asked —
   * even none — while a pure quantity search must find as many as it can. The
   * prompt carries that window and the confirm button follows it, including the
   * "no encontrar nada" answer.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { manaText } from '#lib/game/cards.ts';

  const prompt = $derived(session.searchPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const chosen = $derived(session.searched);

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
  <div class="prompt" aria-label="Buscar en la biblioteca" data-search-prompt>
    <strong>Buscar en la biblioteca</strong>
    <p class="hint">
      {#if prompt.count === 1}
        Elige la carta que encuentras.
      {:else}
        Elige hasta {prompt.count} cartas.
      {/if}
      {#if prompt.partial}
        Puedes encontrar menos, incluso ninguna.
      {:else}
        Phase pide exactamente {prompt.count}.
      {/if}
      {#if prompt.reveal}Las cartas encontradas se revelan antes de continuar.{/if}
    </p>
    <ul class="cards">
      {#each prompt.cards as id (id)}
        {@const picked = chosen.includes(id)}
        <li>
          <button
            type="button"
            class="card"
            aria-pressed={picked}
            onclick={() => session.toggleSearch(id)}>
            <span class="name">{nameOf(id)}</span>
            <span class="type">{typeLine(id)}</span>
            {#if costOf(id)}<span class="cost">{costOf(id)}</span>{/if}
          </button>
        </li>
      {/each}
    </ul>
    <button type="button" class="primary" disabled={session.busy || !session.searchReady} onclick={() => session.confirmSearch()}>
      {#if prompt.partial && chosen.length === 0}
        No encontrar nada
      {:else}
        Confirmar búsqueda ({chosen.length}/{prompt.count})
      {/if}
    </button>
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
