<script lang="ts">
  /**
   * `WaitingFor::MoveCountersDistribution` — CR 122.5 + CR 608.2d: "move any
   * number of counters". Unlike a division, the amount is **not** fixed; the pool
   * on the source is. The counters leave the source as they arrive at each
   * destination, one selection per (destination, type) pair.
   *
   * What the engine enforces, and the block states rather than predicts: no zero
   * counts, destinations only from its list, no repeated pair, and never more of a
   * type than the source has. Moving nothing is legal — the text says "may".
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { counterLabel, distinctTargetLabels } from '#lib/game/interaction.ts';

  const prompt = $derived(session.moveCountersPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const source = $derived(prompt ? objects[String(prompt.sourceId)]?.name : undefined);
  // Two objects can share a name (one per side); the shared helper adds the
  // controller only where it repeats, so rows stay distinguishable.
  const destinationTargets = $derived((prompt?.destinations ?? []).map((id) => ({ Object: id })));
  const labels = $derived(distinctTargetLabels(destinationTargets, objects));
  const nameOf = (id: number) => {
    const index = destinationTargets.findIndex((target) => target.Object === id);
    return labels[index] ?? objects[String(id)]?.name ?? `Objeto ${id}`;
  };
  const offers = $derived(prompt?.available.filter((offer) => offer.count > 0) ?? []);

  const availableLine = $derived.by(() => {
    if (!offers.length) return 'Phase no publica contadores que mover en el origen.';
    const parts = offers.map((offer) => `${offer.count} de ${counterLabel(offer.type)}`).join(' · ');
    return `En el origen hay ${parts}.`;
  });

  const confirmLabel = $derived.by(() => {
    if (!prompt) return '';
    const selections = session.moveSelections;
    if (!selections.length) return 'Confirmar sin mover nada';
    const parts = selections
      .map((entry) => `${entry.count} ${counterLabel(entry.counterType)} a ${nameOf(entry.destinationId)}`)
      .join(' · ');
    return `Mover: ${parts}`;
  });
</script>

{#if prompt && mine}
  <div class="prompt" aria-label="Mover contadores" data-move-counters>
    <strong>Mover contadores{source ? ` · ${source}` : ''}</strong>
    <p class="hint">
      Elige cuántos contadores de cada tipo van a cada permanente. Salen del origen al
      llegar, así que nunca puedes mover más de los que hay (CR 122.5).
    </p>
    <p class="hint" data-move-available>{availableLine}</p>
    {#if offers.length && prompt.destinations.length}
      {#each offers as offer (offer.type)}
        <div class="group">
          <p class="type">
            {counterLabel(offer.type)} · quedan
            <span data-move-remaining={offer.type}>{session.moveRemaining(offer.type)}</span>
            de {offer.count}
          </p>
          <ul class="rows">
            {#each prompt.destinations as id (id)}
              <li class="row">
                <span class="name">{nameOf(id)}</span>
                <span class="stepper">
                  <button
                    type="button"
                    class="step"
                    aria-label={`Quitar un ${counterLabel(offer.type)} a ${nameOf(id)}`}
                    disabled={session.busy || session.moveAmount(offer.type, id) === 0}
                    onclick={() => session.setMove(offer.type, id, session.moveAmount(offer.type, id) - 1)}>−</button>
                  <output class="amount" aria-label={`${counterLabel(offer.type)} para ${nameOf(id)}`}>
                    {session.moveAmount(offer.type, id)}
                  </output>
                  <button
                    type="button"
                    class="step"
                    aria-label={`Añadir un ${counterLabel(offer.type)} a ${nameOf(id)}`}
                    disabled={session.busy || session.moveRemaining(offer.type) === 0}
                    onclick={() => session.setMove(offer.type, id, session.moveAmount(offer.type, id) + 1)}>+</button>
                </span>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    {:else}
      <p class="hint">Phase no ofrece destinatarios para estos contadores.</p>
    {/if}
    <button type="button" class="primary" disabled={session.busy} onclick={() => session.confirmMoveCounters()}>
      {confirmLabel}
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
  .group { display: grid; gap: .3rem; }
  .type { margin: 0; font-size: .76rem; font-weight: 700; color: var(--ink); }
  .rows { margin: 0; padding: 0; list-style: none; display: grid; gap: .3rem; }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: .5rem;
    min-height: 44px;
    padding: .35rem .45rem .35rem .55rem;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--surface-3);
  }
  .name { font-size: .84rem; font-weight: 650; color: var(--ink); }
  .stepper { display: inline-flex; align-items: center; gap: .25rem; }
  .step {
    width: 34px;
    height: 34px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
    color: var(--ink);
    font: inherit;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
  }
  .step:disabled { opacity: .5; cursor: not-allowed; }
  .step:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .amount {
    min-width: 2ch;
    text-align: center;
    font-size: .9rem;
    font-weight: 700;
    color: var(--ink);
  }
  .primary {
    min-height: 44px;
    padding: .45rem .7rem;
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
  .primary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
