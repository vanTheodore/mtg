<script lang="ts">
  /**
   * `WaitingFor::BetweenGamesChoosePlayDraw` — CR 103.1.
   *
   * The designated chooser decides whether they take the first turn of the next
   * game. Each button is the published `ChoosePlayDraw`; a boolean the wire did
   * not publish is not drawn. `play_first: true` is the chooser going first, not
   * «the first player».
   *
   * The other seat sees the choice and gets no button (CR 400.2).
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { playDrawOffers } from '#lib/game/interaction.ts';

  const prompt = $derived(session.playDrawPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const offers = $derived(playDrawOffers(session.snapshot?.legal.actions ?? []));

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
    aria-label="Elegir jugar o robar"
    data-play-draw
    data-play-draw-player={prompt.player}>
    <strong>{mine ? 'Elige si juegas o robas' : 'El Jugador ' + (prompt.player + 1) + ' elige jugar o robar'}</strong>
    {#if score}<p class="hint" data-play-draw-score>{score}</p>{/if}
    <p class="hint" data-play-draw-rule>
      CR 103.1: quien elige decide si empieza la próxima partida. Jugar es empezar tú; robar es dejar que el otro empiece y robar una carta más.
    </p>
    {#if !mine}
      <p class="hint" data-play-draw-other>
        Esta elección la hace el Jugador {prompt.player + 1}: no es tu decisión (CR 400.2).
      </p>
    {:else}
      <div class="actions">
        {#if offers.play}
          <button
            type="button"
            class="primary"
            data-play-draw-play
            disabled={session.busy}
            onclick={() => session.answerPlayDraw(offers.play!)}>
            Jugar primero
          </button>
        {/if}
        {#if offers.draw}
          <button
            type="button"
            class="ghost"
            data-play-draw-draw
            disabled={session.busy}
            onclick={() => session.answerPlayDraw(offers.draw!)}>
            Robar primero
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
