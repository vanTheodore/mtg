<script lang="ts">
  /**
   * `WaitingFor::ChooseStartingPlayer` — CR 103.1: the players roll before the
   * first turn, and the winner **chooses who takes the first turn**. The roll
   * decides who chooses, not who starts, so a block that said "empiezas tú"
   * would be rewriting the rule.
   *
   * The engine already ran the contest and published the seats it will accept
   * (`candidates`, in seat order). The block names them and nothing else: it
   * does not re-roll, re-order or infer a winner.
   */
  import { session } from '#lib/game/session.svelte.ts';

  const prompt = $derived(session.startingPlayerPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const everyone = $derived(session.snapshot?.state.players.length ?? 0);
</script>

{#if prompt && mine}
  <div class="prompt" aria-label="Quién empieza" data-starting-player>
    <strong>La tirada decide quién elige</strong>
    <p class="hint">
      Ganaste la tirada inicial (CR 103.1), y eso te da la elección: decides
      quién juega el primer turno. No decide la tirada.
    </p>
    {#if prompt.candidates.length === 0}
      <p class="hint">Phase no ofrece ningún asiento para empezar.</p>
    {:else}
      <ul class="rows">
        {#each prompt.candidates as seat (seat)}
          <li>
            <button
              type="button"
              class="row"
              disabled={session.busy}
              onclick={() => session.startWith(seat)}>
              {seat === prompt.player ? `Empieza Jugador ${seat + 1} (tú)` : `Empieza Jugador ${seat + 1}`}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    {#if everyone > 2}
      <p class="hint" data-team-hint>
        En partida por equipos con turno compartido, el asiento nombra al equipo
        que empieza (CR 103.1a).
      </p>
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
  .rows { margin: 0; padding: 0; list-style: none; display: grid; gap: .3rem; }
  .row {
    width: 100%;
    min-height: 44px;
    padding: .45rem .55rem;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--surface-3);
    color: var(--ink);
    font: inherit;
    font-size: .84rem;
    font-weight: 650;
    text-align: left;
    cursor: pointer;
  }
  .row:disabled { opacity: .55; cursor: not-allowed; }
  .row:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
