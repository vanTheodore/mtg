<script lang="ts">
  /**
   * `WaitingFor::ClashChooseOpponent` — CR 701.30b.
   *
   * "Clash with an opponent" makes the clashing player choose which opponent to
   * clash with. Each button is the published `ChooseClashOpponent`. Candidate
   * order is the engine's; this table does not re-sort it. The engine publishes
   * no cancel for this window, so there is none here.
   *
   * The other seat sees the candidates and gets no button (CR 400.2).
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { clashOffers } from '#lib/game/interaction.ts';

  const prompt = $derived(session.clashPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const offers = $derived(clashOffers(session.snapshot?.legal.actions ?? []));

  function seat(id: number) {
    return `Jugador ${id + 1}`;
  }
</script>

{#if prompt}
  <div
    class="prompt"
    aria-label="Elegir oponente del choque"
    data-clash
    data-clash-count={prompt.candidates.length}>
    <strong>Elegir oponente del choque</strong>
    <p class="hint" data-clash-rule>
      CR 701.30b: eliges con qué oponente chocar. Los dos revelan su primera carta y gana el valor de maná más alto.
    </p>
    {#if !mine}
      <ul class="faces" data-clash-faces>
        {#each prompt.candidates as id (id)}
          <li>{seat(id)}</li>
        {/each}
      </ul>
      <p class="hint" data-clash-other>
        Este oponente lo elige el Jugador {prompt.player + 1}: no es tu decisión (CR 400.2).
      </p>
    {:else}
      <div class="actions">
        {#each prompt.candidates as id (id)}
          {@const action = offers.byOpponent.get(id)}
          {#if action}
            <button
              type="button"
              class="primary"
              data-clash-option={id}
              disabled={session.busy}
              onclick={() => session.answerClashOpponent(action)}>
              {seat(id)}
            </button>
          {/if}
        {/each}
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
  .primary {
    min-height: 44px;
    padding: .55rem .7rem;
    border-radius: 9px;
    font: inherit;
    font-size: .82rem;
    font-weight: 650;
    cursor: pointer;
  }
  .primary { border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); }
  .primary:disabled { opacity: .55; cursor: not-allowed; }
  .primary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
