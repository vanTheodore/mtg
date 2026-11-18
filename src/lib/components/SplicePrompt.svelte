<script lang="ts">
  /**
   * `WaitingFor::SpliceOffer` — CR 702.47a–e.
   *
   * The caster may reveal one eligible splice card, or finish. Each button is
   * the published `RespondToSpliceOffer`. A card the prompt did not list is not
   * a button, and decline exists only when `card: null` is itself legal. The
   * splice cost is not on this prompt; the block does not read it off the card.
   * A `0` is a hidden card, not a splice (CR 400.2).
   *
   * The offer comes back after each acceptance. This block does not remember
   * what was already spliced.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { spliceOffers } from '#lib/game/interaction.ts';

  const prompt = $derived(session.splicePrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const offers = $derived(spliceOffers(session.snapshot?.legal.actions ?? []));
  const spell = $derived(
    prompt?.spellId != null ? objects[String(prompt.spellId)]?.name ?? '' : ''
  );
  const hidden = $derived(prompt?.eligible.filter((id) => id === 0).length ?? 0);

  function cardName(id: number) {
    if (id === 0) return '';
    const object = objects[String(id)];
    if (!object || object.display_visible_to_viewer === false) return '';
    return object.name ?? '';
  }
</script>

{#if prompt}
  <div
    class="prompt"
    aria-label="Empalmar"
    data-splice
    data-splice-count={prompt.eligible.length}
    data-splice-hidden={hidden}>
    <strong>Empalmar{spell ? ` · ${spell}` : ''}</strong>
    <p class="hint" data-splice-rule>
      CR 702.47a: puedes revelar una carta con empalmar, copiar su texto y pagar su coste. El motor cobra ese coste; esta mesa no lo calcula.
    </p>
    {#if !mine}
      <ul class="faces" data-splice-faces>
        {#each prompt.eligible as id, index (`${id}-${index}`)}
          <li>{id === 0 || !cardName(id) ? 'Carta oculta' : cardName(id)}</li>
        {/each}
      </ul>
      <p class="hint" data-splice-other>
        Esto lo elige el Jugador {prompt.player + 1}: no es tu decisión (CR 400.2).
      </p>
    {:else}
      {#if hidden}
        <p class="hint" data-splice-hidden-note>{hidden === 1 ? '1 carta oculta' : `${hidden} cartas ocultas`} no se puede empalmar desde aquí.</p>
      {/if}
      <div class="actions">
        {#each prompt.eligible as id, index (`${id}-${index}`)}
          {@const action = id === 0 ? undefined : offers.byCard.get(id)}
          {#if action}
            <button
              type="button"
              class="primary"
              data-splice-card={id}
              disabled={session.busy}
              onclick={() => session.answerSplice(action)}>
              Empalmar {cardName(id) || `carta ${id}`}
            </button>
          {/if}
        {/each}
        {#if offers.decline}
          <button
            type="button"
            class="ghost"
            data-splice-decline
            disabled={session.busy}
            onclick={() => session.declineSplice()}>
            No empalmar
          </button>
        {/if}
      </div>
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
