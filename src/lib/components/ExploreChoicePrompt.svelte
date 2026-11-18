<script lang="ts">
  /**
   * `WaitingFor::ExploreChoice` — CR 701.44d: several permanents explore at the
   * same time, so their controller chooses **the order**, one explorer per step.
   *
   * The engine publishes two lists and they are not the same one: `choosable` is
   * what this player may send now, `remaining` is the whole queue. When permanents
   * of several players explore together, each orders their own (CR 101.4), so the
   * gap between the lists is exactly what someone else will decide — the block says
   * so instead of showing a queue the player cannot touch.
   *
   * CR 701.44a is stated, not asked: each explorer reveals the top card of its
   * controller's library, a land goes to that player's hand, and anything else puts
   * a +1/+1 counter on the creature. Those are the engine's own steps.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { distinctTargetLabels, objectTarget } from '#lib/game/interaction.ts';

  const prompt = $derived(session.explorePrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  // One label pass over the union: two Merfolk can share a name on either side.
  const labels = $derived(
    distinctTargetLabels(
      (prompt?.remaining ?? []).map((id) => objectTarget(id)),
      objects
    )
  );
  const nameOf = (id: number) => {
    const index = (prompt?.remaining ?? []).indexOf(id);
    return (index >= 0 ? labels[index] : undefined) ?? objects[String(id)]?.name ?? `Permanente ${id}`;
  };
  const others = $derived((prompt?.remaining ?? []).filter((id) => !(prompt?.choosable ?? []).includes(id)));

  const queueLine = $derived.by(() => {
    if (!prompt) return '';
    const total = prompt.remaining.length;
    if (!total) return 'No queda ningún permanente por explorar.';
    const left = total === 1 ? 'Queda 1 permanente por explorar' : `Quedan ${total} permanentes por explorar`;
    return others.length
      ? `${left}; ${others.length} de ellos los elige su controlador (CR 101.4).`
      : `${left}, y el orden lo eliges tú (CR 701.44d).`;
  });
</script>

{#if prompt && mine}
  <div class="prompt" aria-label="Elige quién explora" data-explore data-explore-queue={prompt.remaining.length}>
    <strong>Explorar</strong>
    <p class="hint">
      Varios permanentes exploran a la vez, así que eliges cuál lo hace ahora y en qué orden
      (CR 701.44d). Después volverá a preguntarse por el siguiente.
    </p>
    <p class="hint">
      Cada uno revela la primera carta de la biblioteca de su controlador: si es una tierra va a su
      mano, y si no, el permanente recibe un contador +1/+1 (CR 701.44a).
    </p>
    <p class="hint" data-explore-remaining>{queueLine}</p>
    {#if prompt.choosable.length}
      <ul class="rows">
        {#each prompt.choosable as id (id)}
          <li>
            <button
              type="button"
              class="row"
              disabled={session.busy}
              data-explore-object={id}
              onclick={() => session.chooseExplorer(id)}>
              {nameOf(id)}
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="hint">Phase no publica permanentes que puedas hacer explorar.</p>
    {/if}
    {#if others.length}
      <p class="hint" data-explore-others>En cola para otros jugadores: {others.map(nameOf).join(' · ')}</p>
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
    display: flex;
    align-items: center;
    width: 100%;
    min-height: 44px;
    padding: .35rem .55rem;
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
