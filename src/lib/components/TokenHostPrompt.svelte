<script lang="ts">
  /**
   * `WaitingFor::ChooseTokenHost` — digital-only Alchemy, no CR entry: a batch
   * token entry ("one or more creatures enter … attached to one of them")
   * stamped every matching entrant, and the controller picks the host.
   *
   * The engine's note is explicit that this is a CHOICE, not a target, so
   * hexproof / shroud / protection never filtered the list: the block must not
   * imply otherwise. It shows exactly the hosts Phase published and answers with
   * the `ChooseTarget` action the engine also lists.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { targetLabel } from '#lib/game/interaction.ts';

  const prompt = $derived(session.tokenHostPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const source = $derived(prompt ? objects[String(prompt.sourceId)]?.name : undefined);
  const picked = $derived(session.hostPick);
</script>

{#if prompt && mine}
  <div class="prompt" aria-label="Elegir dónde entra la ficha" data-token-host>
    <strong>¿Dónde entra la ficha?{source ? ` · ${source}` : ''}</strong>
    <p class="hint">
      Varias criaturas entraron a la vez y la ficha va con una de ellas. Es una
      elección, no un objetivo: la lista ya viene filtrada por Phase.
    </p>
    {#if prompt.hosts.length === 0}
      <p class="hint">Phase no ofrece ningún destinatario para la ficha.</p>
    {:else}
      <ul class="rows">
        {#each prompt.hosts as host, index (index)}
          <li>
            <button
              type="button"
              class="row"
              aria-pressed={picked === index}
              onclick={() => session.toggleHost(index)}>
              {targetLabel(host, objects)}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    <button
      type="button"
      class="primary"
      disabled={session.busy || !session.hostReady}
      onclick={() => session.confirmHost()}>
      {picked === null || !prompt.hosts[picked]
        ? 'Confirmar destinatario'
        : `Poner la ficha en ${targetLabel(prompt.hosts[picked], objects)}`}
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
  .rows { margin: 0; padding: 0; list-style: none; display: grid; gap: .3rem; max-height: 14rem; overflow: auto; }
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
  .row[aria-pressed='true'] { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
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
  .row:focus-visible, .primary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
