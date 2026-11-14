<script lang="ts">
  /**
   * `WaitingFor::PairChoice` — CR 702.95a + CR 608.2d (soulbond).
   *
   * The creature entering the battlefield may pair with one other unpaired
   * creature its controller controls. The listed objects are legal choices, not
   * targets, and the pairing is optional: `ChoosePair { partner: None }` is an
   * answer the engine offers, so «no emparejar» is a button rather than an
   * abandoned prompt.
   *
   * One pick only: a pair is two creatures, and marking a second partner replaces
   * the first instead of promising a trio.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { manaText } from '#lib/game/cards.ts';

  const prompt = $derived(session.pairPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const picked = $derived(session.pairPick);
  const source = $derived(prompt ? objects[String(prompt.sourceId)]?.name : undefined);

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
  <div class="prompt" aria-label="Elegir pareja" data-pair-prompt>
    <strong>Emparejar{source ? ` · ${source}` : ''}</strong>
    <p class="hint">
      Elige la criatura que será su pareja. Emparejar es opcional: puedes no emparejar.
    </p>
    {#if prompt.choices.length === 0}
      <p class="hint">No hay ninguna criatura legal con la que emparejar.</p>
    {:else}
      <ul class="cards">
        {#each prompt.choices as id (id)}
          <li>
            <button
              type="button"
              class="card"
              aria-pressed={picked === id}
              onclick={() => session.togglePair(id)}>
              <span class="name">{nameOf(id)}</span>
              <span class="type">{typeLine(id)}</span>
              {#if costOf(id)}<span class="cost">{costOf(id)}</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    <div class="row">
      <button
        type="button"
        class="primary"
        disabled={session.busy || !session.pairReady}
        onclick={() => session.confirmPair()}>
        {picked === null ? 'Confirmar pareja' : `Emparejar con ${nameOf(picked)}`}
      </button>
      <button type="button" class="ghost" disabled={session.busy} onclick={() => session.declinePair()}>
        No emparejar
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
