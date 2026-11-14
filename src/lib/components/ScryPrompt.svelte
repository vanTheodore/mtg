<script lang="ts">
  /**
   * `WaitingFor::ScryChoice` and `WaitingFor::SurveilChoice` — CR 701.22a and
   * CR 701.25a, in the engine's own reading: look at the top N, then put any
   * number of those cards back **in any order**.
   *
   * The two prompts carry the same shape and the same answer (the ordered
   * keep-on-top set), and that is exactly why they need one careful block: what
   * is *not* kept goes to different places. Scry sends it to the bottom of the
   * library; surveil sends it to the graveyard. A shared block that said
   * "al fondo" for both would be teaching the wrong rule half the time.
   *
   * Order is part of the answer — the first kept card is the new top — so the
   * kept list is ordered and can be moved. The table composes the selection
   * because Phase's candidates only enumerate the empty set, the full set and
   * each single card; any subset is legal per the rule, and Phase validates.
   */
  import { session } from '#lib/game/session.svelte.ts';

  const prompt = $derived(session.scryPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const kept = $derived(session.scryKeep);
  const nameOf = (id: number) => objects[String(id)]?.name ?? `Objeto ${id}`;
  const rest = $derived((prompt?.cards ?? []).filter((id) => !kept.includes(id)));
  /** The other destination, named per keyword — never shared. */
  const elsewhere = $derived(
    prompt?.kind === 'surveil' ? 'al cementerio' : 'al fondo de la biblioteca'
  );
  const title = $derived(
    prompt?.kind === 'surveil'
      ? `Vigilar ${prompt.cards.length} (surveil)`
      : `Adivinar ${prompt?.cards.length ?? 0} (scry)`
  );
</script>

{#if prompt && mine}
  <div class="prompt" aria-label="Mirar y ordenar la biblioteca" data-scry-prompt>
    <strong>{title}</strong>
    <p class="hint">
      Mira las primeras cartas y decide cuáles se quedan arriba y en qué orden.
      Lo que no se queda va {elsewhere} (CR {prompt.kind === 'surveil' ? '701.25a' : '701.22a'}).
    </p>

    <ol class="kept" aria-label="Se quedan arriba, en este orden">
      {#each kept as id, index (id)}
        <li class="kept-row">
          <span class="pos">{index + 1}</span>
          <span class="name">{nameOf(id)}</span>
          <button
            type="button"
            class="step"
            aria-label={`Subir ${nameOf(id)}`}
            disabled={session.busy || index === 0}
            onclick={() => session.moveScryKeep(id, -1)}>↑</button>
          <button
            type="button"
            class="step"
            aria-label={`Bajar ${nameOf(id)}`}
            disabled={session.busy || index === kept.length - 1}
            onclick={() => session.moveScryKeep(id, 1)}>↓</button>
          <button
            type="button"
            class="step drop"
            aria-label={`Quitar ${nameOf(id)} de arriba`}
            disabled={session.busy}
            onclick={() => session.toggleScryKeep(id)}>✕</button>
        </li>
      {:else}
        <li class="empty">Nada se queda arriba: toda la mirada va {elsewhere}.</li>
      {/each}
    </ol>

    {#if rest.length}
      <ul class="rows" aria-label="Se pueden quedar arriba">
        {#each rest as id (id)}
          <li>
            <button
              type="button"
              class="row"
              disabled={session.busy}
              onclick={() => session.toggleScryKeep(id)}>
              {nameOf(id)} <span class="go">↑ queda arriba</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    <button
      type="button"
      class="primary"
      disabled={session.busy}
      onclick={() => session.confirmScry()}>
      {kept.length === 0
        ? `Confirmar: todo va ${elsewhere}`
        : `Confirmar: ${kept.map(nameOf).join(' → ')}`}
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
  .kept, .rows { margin: 0; padding: 0; list-style: none; display: grid; gap: .3rem; }
  .kept-row {
    display: flex;
    align-items: center;
    gap: .35rem;
    padding: .3rem .45rem;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--surface-3);
    font-size: .82rem;
  }
  .pos {
    width: 1.2rem;
    color: var(--ink-2);
    font-variant-numeric: tabular-nums;
    font-size: .74rem;
  }
  .name { flex: 1; font-weight: 650; }
  .step {
    min-width: 32px;
    min-height: 32px;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: var(--surface-2);
    color: var(--ink);
    font: inherit;
    font-size: .8rem;
    cursor: pointer;
  }
  .step:disabled { opacity: .45; cursor: not-allowed; }
  .empty { font-size: .78rem; color: var(--ink-2); }
  .row {
    width: 100%;
    min-height: 44px;
    display: flex;
    gap: .5rem;
    align-items: baseline;
    justify-content: space-between;
    padding: .45rem .55rem;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--surface-2);
    color: var(--ink);
    font: inherit;
    font-size: .84rem;
    font-weight: 650;
    text-align: left;
    cursor: pointer;
  }
  .go { font-weight: 500; font-size: .76rem; color: var(--ink-2); }
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
  button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
