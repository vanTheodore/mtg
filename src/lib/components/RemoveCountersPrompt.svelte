<script lang="ts">
  /**
   * `WaitingFor::RemoveCountersChoice` — CR 107.1c + CR 608.2d: "remove any number
   * of counters" (Rhys, the Evermore; Tetravus) and "remove up to N counters"
   * (Hex Parasite's announced X).
   *
   * Two ceilings, both the engine's: what the source actually carries of each kind,
   * and — when the text says "up to N" — the total across every kind. The block
   * shows both, steps one kind at a time so the player never types a number, and
   * refuses a step that would cross either ceiling instead of letting the engine
   * bounce the answer.
   *
   * Zero is a legal answer (CR 107.1c: "any number" includes zero), so the button
   * announces that consequence in words — removing nothing is a decision, not an
   * incomplete form.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { counterLabel } from '#lib/game/interaction.ts';

  const prompt = $derived(session.removeCountersPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const source = $derived(prompt ? objects[String(prompt.sourceId)]?.name : undefined);
  const offers = $derived(prompt?.available.filter((offer) => offer.count > 0) ?? []);
  const total = $derived(session.removeTotal);
  const budget = $derived(session.removeBudget);

  const capLine = $derived.by(() => {
    if (!prompt) return '';
    if (prompt.maxTotal === null) {
      return 'Sin tope: el texto no limita cuántos, sólo los que hay (CR 107.1c).';
    }
    const left = budget ?? 0;
    return `Tope ${prompt.maxTotal} en total · quedan ${left}`;
  });

  const poolLine = $derived.by(() => {
    if (!prompt) return '';
    if (!offers.length) return 'Phase no publica contadores que quitar en el origen.';
    const parts = offers.map((offer) => `${offer.count} de ${counterLabel(offer.type)}`).join(' · ');
    return `En el origen hay ${parts}.`;
  });

  const confirmLabel = $derived.by(() => {
    if (!prompt) return '';
    if (!total) return 'No quitar ninguno';
    const parts = session.removeSelections
      .map((entry) => `${entry.count} ${counterLabel(entry.counterType)}`)
      .join(' · ');
    return total === 1 ? `Quitar 1 contador: ${parts}` : `Quitar ${total} contadores: ${parts}`;
  });
</script>

{#if prompt && mine}
  <div
    class="prompt"
    aria-label="Quitar contadores"
    data-remove-counters
    data-remove-source={prompt.sourceId}
    data-remove-cap={prompt.maxTotal === null ? 'none' : prompt.maxTotal}>
    <strong>Quitar contadores{source ? ` · ${source}` : ''}</strong>
    <p class="hint">
      Elige cuántos contadores de cada tipo salen del permanente. Se quitan al resolver, sin
      llegar a ningún otro sitio (CR 608.2d).
    </p>
    <p class="hint">{poolLine}</p>
    <p class="hint" data-remove-cap-line>{capLine}</p>
    <p class="hint count" data-remove-total>
      Quitas {total}{prompt.maxTotal === null ? '' : ` de ${prompt.maxTotal}`}
    </p>
    {#if offers.length}
      <ul class="rows">
        {#each offers as offer (offer.type)}
          {@const picked = session.removeAmount(offer.type)}
          {@const canAdd = budget === null || budget > 0}
          <li class="row" data-remove-type={offer.type}>
            <span class="name">{counterLabel(offer.type)}</span>
            <span class="amount" data-remove-count={offer.type}>{picked} de {offer.count}</span>
            <span class="stepper">
              <button
                type="button"
                class="step"
                aria-label={`Quitar uno menos de ${counterLabel(offer.type)}`}
                disabled={session.busy || picked === 0}
                onclick={() => session.stepRemove(offer.type, -1)}>−</button>
              <button
                type="button"
                class="step"
                aria-label={`Quitar uno más de ${counterLabel(offer.type)}`}
                disabled={session.busy || !canAdd || picked >= offer.count}
                onclick={() => session.stepRemove(offer.type, 1)}>+</button>
            </span>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="hint">Phase no publica contadores que quitar.</p>
    {/if}
    <button
      type="button"
      class="primary"
      disabled={session.busy || !session.removeReady}
      data-remove-ready={session.removeReady}
      onclick={() => session.confirmRemoveCounters()}>
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
  .count { font-weight: 650; color: var(--ink); }
  .rows { margin: 0; padding: 0; list-style: none; display: grid; gap: .3rem; }
  .row {
    display: flex;
    align-items: center;
    gap: .5rem;
    min-height: 44px;
    padding: .3rem .5rem;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--surface-3);
  }
  .name { flex: 1; font-size: .84rem; font-weight: 650; }
  .amount { font-size: .78rem; color: var(--ink-2); font-variant-numeric: tabular-nums; }
  .stepper { display: flex; gap: .3rem; }
  .step {
    width: 32px;
    height: 32px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-1);
    color: var(--ink);
    font: inherit;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
  }
  .step:disabled { opacity: .45; cursor: not-allowed; }
  .step:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
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
