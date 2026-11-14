<script lang="ts">
  /**
   * `WaitingFor::MiracleReveal` — CR 702.94a. The first card a player draws in a
   * turn can carry `Miracle`, and Phase offers the reveal as a **binary** offer.
   *
   * Accepting does not cast: it reveals the card and puts the miracle triggered
   * ability on the stack ("When you reveal this card this way, you may cast it for
   * [miracle cost]"), so the table still gets priority before anything is cast
   * (CR 608.2g). The block says that, because a button that reads «lanzar» would
   * promise a step the engine has not taken yet.
   *
   * The cost travels latched in the offer: the granting source may be gone by the
   * time the offer resolves, and the engine does not re-read it (CR 608.2b).
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { isHidden, manaText } from '#lib/game/cards.ts';

  const prompt = $derived(session.miraclePrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const card = $derived(prompt ? objects[String(prompt.objectId)] : undefined);
  /** A card the viewer cannot see is not a card they were offered. */
  const named = $derived(card && !isHidden(card) ? card.name : undefined);
  /** `NoCost`, `SelfManaCost` and friends are not printed pips; say so instead. */
  const miracleCost = $derived.by(() => {
    const text = manaText(prompt?.cost);
    return text && text !== 'NoCost' ? text : '';
  });
  const printedCost = $derived.by(() => {
    const text = manaText(card?.mana_cost);
    return text && text !== 'NoCost' ? text : '';
  });
</script>

{#if prompt && mine}
  <div class="prompt" aria-label="Milagro" data-miracle data-miracle-object={prompt.objectId}>
    <strong>Milagro{named ? ` · ${named}` : ''}</strong>
    <p class="hint">
      {named ?? 'Esta carta'} es la primera carta que robas este turno y tiene milagro: puedes
      revelarla y lanzarla por su coste de milagro en vez de su coste normal (CR 702.94a).
    </p>
    {#if miracleCost}
      <p class="hint" data-miracle-cost>Coste de milagro: {miracleCost}</p>
    {:else}
      <p class="hint" data-miracle-cost>Phase no publica el coste de milagro de esta oferta.</p>
    {/if}
    {#if printedCost}
      <p class="hint" data-miracle-printed>Coste impreso: {printedCost}</p>
    {/if}
    <p class="hint" data-miracle-reveal-hint>
      Revelarla todavía no la lanza: pone en la pila su habilidad de milagro, y cualquiera
      puede responder antes de que decidas lanzarla (CR 608.2g).
    </p>
    <div class="row">
      <button
        type="button"
        class="primary"
        data-miracle-reveal
        disabled={session.busy}
        onclick={() => session.revealMiracle()}>
        Revelar{miracleCost ? ` y lanzarla por ${miracleCost}` : ''}
      </button>
      <button
        type="button"
        class="ghost"
        data-miracle-decline
        disabled={session.busy}
        onclick={() => session.declineMiracle()}>
        Dejarla en la mano
      </button>
    </div>
    <p class="hint" data-miracle-decline-hint>
      Si no la revelas, se queda en tu mano y la oferta se gasta: milagro sólo mira la
      primera carta que robas en el turno.
    </p>
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
  .primary,
  .ghost {
    min-height: 44px;
    padding: .55rem .7rem;
    border-radius: 9px;
    font: inherit;
    font-size: .84rem;
    font-weight: 650;
    cursor: pointer;
  }
  .primary { flex: 1; border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); }
  .primary:disabled, .ghost:disabled { opacity: .55; cursor: not-allowed; }
  .ghost { border: 1px solid var(--line); background: var(--surface-3); color: var(--ink); }
  .primary:focus-visible, .ghost:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
