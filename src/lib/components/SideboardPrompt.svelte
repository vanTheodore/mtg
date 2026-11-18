<script lang="ts">
  /**
   * `WaitingFor::BetweenGamesSideboard` — CR 100.2b + CR 100.4a.
   *
   * Between games the player submits a main deck and a sideboard. The floor and
   * the cap are the engine's own acceptance predicate, published in the prompt,
   * so this block prints them instead of deriving a deck size. A sideboard cap
   * of `0` is a format that forbids a sideboard (the Commander family), not a
   * missing value. The answer is the published `SubmitSideboard`; the counts
   * shown are that action's own lists.
   *
   * Under a `Minimum` deck-size rule the deck may legally grow, so this block
   * never asks for a one-for-one swap.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { sideboardOffers } from '#lib/game/interaction.ts';

  const prompt = $derived(session.sideboardPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const offers = $derived(sideboardOffers(session.snapshot?.legal.actions ?? []));

  const bounds = $derived.by(() => {
    if (!prompt) return '';
    const floor = prompt.minMainDeckSize === null ? null : `al menos ${prompt.minMainDeckSize} cartas en el mazo principal`;
    const cap =
      prompt.maxSideboardSize === null
        ? 'sin tope de banquillo'
        : prompt.maxSideboardSize === 0
          ? 'este formato no tiene banquillo'
          : `hasta ${prompt.maxSideboardSize} cartas en el banquillo`;
    if (!floor) return cap;
    return `${floor}, y ${cap}`;
  });
  const score = $derived.by(() => {
    const s = prompt?.score;
    if (!s) return '';
    const game = prompt?.gameNumber === null || prompt?.gameNumber === undefined ? '' : `Partida ${prompt!.gameNumber}. `;
    const draws = s.draws === 0 ? '' : `, ${s.draws} tablas`;
    return `${game}Marcador: Jugador 1 ${s.p0}, Jugador 2 ${s.p1}${draws}.`;
  });
</script>

{#if prompt}
  <div
    class="prompt"
    aria-label="Ajustar el mazo entre partidas"
    data-sideboard
    data-sideboard-player={prompt.player}
    data-sideboard-min={prompt.minMainDeckSize ?? ''}
    data-sideboard-max={prompt.maxSideboardSize ?? ''}>
    <strong>Ajustar el mazo entre partidas</strong>
    {#if score}<p class="hint" data-sideboard-score>{score}</p>{/if}
    <p class="hint" data-sideboard-rule>
      CR 100.2b: entregas el mazo principal y el banquillo como los publicó el motor. Los límites los fija el formato, no esta mesa.
    </p>
    {#if bounds}<p class="hint" data-sideboard-bounds>{bounds}.</p>{/if}
    {#if !mine}
      <p class="hint" data-sideboard-other>
        Ajusta el Jugador {prompt.player + 1}: no es tu decisión (CR 400.2).
      </p>
    {:else}
      <ul class="counts" data-sideboard-counts>
        {#if offers.mainCount !== null}
          <li data-sideboard-main>{offers.mainCount} cartas en el mazo principal</li>
        {/if}
        {#if offers.sideboardCount !== null}
          <li data-sideboard-side>{offers.sideboardCount} cartas en el banquillo</li>
        {/if}
      </ul>
      {#if offers.submit}
        <div class="actions">
          <button
            type="button"
            class="primary"
            data-sideboard-submit
            disabled={session.busy}
            onclick={() => session.submitSideboard()}>
            Entregar este mazo
          </button>
        </div>
      {/if}
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
  .counts { margin: 0; padding-left: 1.1rem; font-size: .78rem; }
  .actions { display: flex; gap: .4rem; flex-wrap: wrap; }
  .primary {
    min-height: 44px;
    padding: .55rem .7rem;
    border-radius: 9px;
    border: 1px solid var(--accent);
    background: var(--accent);
    color: var(--accent-ink);
    font: inherit;
    font-size: .82rem;
    font-weight: 650;
    cursor: pointer;
  }
  .primary:disabled { opacity: .55; cursor: not-allowed; }
  .primary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
