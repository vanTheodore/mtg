<script lang="ts">
  /**
   * `WaitingFor::ClashCardPlacement` — CR 701.30c.
   *
   * After a clash each participant puts their revealed card on top or bottom of
   * their library, in APNAP order, and every placement commits together once the
   * last player has chosen. The answer is the same published
   * `ChooseTopOrBottom { top }` the library-position window uses; the engine's
   * `ClashCardPlacement` arm accepts it. A button exists only when that boolean
   * is already legal, and a card the wire did not name is not invented.
   *
   * The other seat sees the revealed card and gets no button (CR 400.2).
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { topOrBottomOffers } from '#lib/game/interaction.ts';

  const prompt = $derived(session.clashPlacementPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const offers = $derived(topOrBottomOffers(session.snapshot?.legal.actions ?? []));
  const card = $derived.by(() => {
    const id = prompt?.cardId;
    if (id == null) return '';
    const object = objects[String(id)];
    if (!object || object.display_visible_to_viewer === false) return '';
    return object.name ?? '';
  });
</script>

{#if prompt}
  <div
    class="prompt"
    aria-label="Colocar la carta del choque"
    data-clash-placement
    data-clash-placement-remaining={prompt.remaining.length}>
    <strong>Colocar la carta del choque</strong>
    {#if card}<p class="spell" data-clash-placement-card>{card}</p>{/if}
    <p class="hint" data-clash-placement-rule>
      CR 701.30c: la carta revelada va arriba o abajo de tu biblioteca. Las elecciones se aplican juntas cuando elige el último jugador.
    </p>
    {#if !mine}
      <p class="hint" data-clash-placement-other>
        Esta colocación la decide el Jugador {prompt.player + 1}: no es tu decisión (CR 400.2).
      </p>
    {:else}
      <div class="actions">
        {#if offers.top}
          <button
            type="button"
            class="primary"
            data-clash-placement-top
            disabled={session.busy}
            onclick={() => session.answerClashPlacement(offers.top!)}>
            Arriba de la biblioteca
          </button>
        {/if}
        {#if offers.bottom}
          <button
            type="button"
            class="ghost"
            data-clash-placement-bottom
            disabled={session.busy}
            onclick={() => session.answerClashPlacement(offers.bottom!)}>
            Abajo de la biblioteca
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
  .spell { margin: 0; font-size: .82rem; font-weight: 650; }
  .hint { margin: 0; font-size: .78rem; color: var(--ink-2); }
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
