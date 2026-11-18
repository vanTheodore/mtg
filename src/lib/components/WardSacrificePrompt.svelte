<script lang="ts">
  /**
   * `WaitingFor::WardSacrificeChoice` — CR 702.21a/b: paying a ward cost by
   * sacrificing permanents.
   *
   * Two things the block must not get wrong:
   *   - this prompt is reached **after** the payer said yes to the ward, and the
   *     engine accepts exactly one permanent per round-trip (or one set whose
   *     total power reaches the threshold). There is no "no pago" here, so the
   *     block offers none and says why;
   *   - the options are Phase's own `SelectCards` candidates. The table never
   *     builds a set of its own: it cannot know which combinations the engine
   *     accepts beyond the one it published.
   */
  import { session } from '#lib/game/session.svelte.ts';

  const prompt = $derived(session.wardSacrificePrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});

  function nameOf(id: number): string {
    return objects[String(id)]?.name ?? `Objeto ${id}`;
  }
  function label(cards: number[]): string {
    if (!cards.length) return 'No hay permanentes elegibles: confirmar';
    return cards.map(nameOf).join(' + ');
  }
</script>

{#if prompt && mine}
  <div class="prompt" aria-label="Pagar la guardia con permanentes" data-ward-sacrifice>
    <strong>Guardia · sacrificar</strong>
    <p class="hint">
      Ya pagas la guardia (CR 702.21a); falta elegir qué se sacrifica.
      {#if prompt.remaining > 1}Quedan {prompt.remaining} sacrificios.{/if}
    </p>
    {#if prompt.minTotalPower !== undefined}
      <p class="hint" data-ward-threshold>
        El coste pide permanentes cuyo poder total llegue a {prompt.minTotalPower}.
        Phase propone un conjunto; la mesa no arma otro (CR 118.12a).
      </p>
    {/if}
    {#if prompt.options.length}
      <ul class="rows">
        {#each prompt.options as option, index (index)}
          <li>
            <button
              type="button"
              class="row"
              disabled={session.busy}
              onclick={() => session.payWard(option.cards)}>
              {label(option.cards)}{#if option.cards.length > 1 && option.power !== null}
                <span class="power">poder total {option.power}</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="hint">Phase no ofrece ninguna selección para este coste.</p>
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
    display: flex;
    gap: .5rem;
    align-items: baseline;
    justify-content: space-between;
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
  .power { font-weight: 500; font-size: .76rem; color: var(--ink-2); }
  .row:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
