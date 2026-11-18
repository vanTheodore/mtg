<script lang="ts">
  /**
   * `WaitingFor::DistributeAmong` — CR 601.2d (the division is chosen while
   * casting, and **every** target must receive at least one) and CR 608.2d (the
   * division is chosen as the effect applies, and the chooser may leave
   * candidates out). The engine publishes the amount, the recipients and which of
   * the two it is; the single validator refuses a sum that is not exactly the
   * amount, a zero portion, a repeated recipient, and — announce-time — a target
   * left with nothing.
   *
   * `EvenSplitDamage` is the one unit with no choice in it: the engine computes
   * `total / n` itself, so the block says that instead of offering steppers that
   * would not change anything.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { distinctTargetLabels, targetKey, targetLabel } from '#lib/game/interaction.ts';
  import type { TargetRef } from '#lib/engine/types.ts';

  const prompt = $derived(session.distributePrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  // Same key the session writes with: a `TargetRef` is not a key of its own.
  const amountOf = (target: TargetRef) => session.splitAmount[targetKey(target)] ?? 0;
  // Two permanents can share a name and both be legal recipients (one per side);
  // the shared helper adds the controller only where the name repeats.
  const labels = $derived(prompt ? distinctTargetLabels(prompt.targets, objects) : []);
  const label = (target: TargetRef) => {
    const index = prompt ? prompt.targets.findIndex((other) => targetKey(other) === targetKey(target)) : -1;
    return index >= 0 ? labels[index] ?? targetLabel(target, objects) : targetLabel(target, objects);
  };

  const noun = $derived.by(() => {
    if (!prompt) return '';
    if (prompt.unit === 'counters') return prompt.counterType ? `contadores ${prompt.counterType}` : 'contadores';
    if (prompt.unit === 'life') return 'vidas';
    return 'puntos de daño';
  });

  const ruleLine = $derived.by(() => {
    if (!prompt) return '';
    if (prompt.unit === 'even') {
      return `Phase reparte ${prompt.total} ${noun} por igual entre los ${prompt.targets.length} objetivos: aquí no hay reparto que elegir (CR 601.2d).`;
    }
    if (prompt.scope === 'announced') {
      return `Reparte los ${prompt.total} ${noun} entre los objetivos anunciados: cada uno recibe al menos 1 y no sobra nada (CR 601.2d).`;
    }
    return `Reparte los ${prompt.total} ${noun} entre los candidatos: cada uno que elijas recibe al menos 1, y puedes dejar fuera a los demás (CR 608.2d).`;
  });

  const totalLine = $derived.by(() => {
    if (!prompt) return '';
    const spent = session.splitTotal;
    const left = prompt.total - spent;
    if (left > 0) return `Repartido ${spent} de ${prompt.total} · falta ${left}.`;
    if (left < 0) return `Repartido ${spent} de ${prompt.total} · te pasas por ${-left}.`;
    const missingRecipients = prompt.scope === 'announced'
      ? prompt.targets.filter((target) => amountOf(target) === 0).length
      : 0;
    if (missingRecipients > 0) {
      return `Repartido ${spent} de ${prompt.total} · ${missingRecipients} objetivo${missingRecipients === 1 ? '' : 's'} sin nada.`;
    }
    return `Repartido ${spent} de ${prompt.total}.`;
  });

  const confirmLabel = $derived.by(() => {
    if (!prompt) return '';
    if (prompt.unit === 'even') return `Confirmar el reparto por igual: ${prompt.total / prompt.targets.length} a cada uno`;
    if (!session.splitReady) return session.splitTotal < prompt.total ? 'Reparto incompleto' : 'Reparto inválido';
    const parts = session.splitEntries.map(([target, amount]) => `${label(target)} ${amount}`).join(' · ');
    return `Repartir: ${parts}`;
  });
</script>

{#if prompt && mine}
  <div class="prompt" aria-label="Reparto del daño o los contadores" data-distribute>
    <strong>Reparto de {prompt.total} {noun}</strong>
    <p class="hint">{ruleLine}</p>
    <p class="hint" data-distribute-total>{totalLine}</p>
    {#if prompt.unit !== 'even'}
      {#if prompt.targets.length}
        <ul class="rows">
          {#each prompt.targets as target (targetKey(target))}
            <li class="row">
              <span class="name">{label(target)}</span>
              <span class="stepper">
                <button
                  type="button"
                  class="step"
                  aria-label={`Quitar uno a ${label(target)}`}
                  disabled={session.busy || amountOf(target) === 0}
                  onclick={() => session.setSplit(target, amountOf(target) - 1)}>−</button>
                <output class="amount" aria-label={`Cantidad para ${label(target)}`}>{amountOf(target)}</output>
                <button
                  type="button"
                  class="step"
                  aria-label={`Añadir uno a ${label(target)}`}
                  disabled={session.busy || session.splitTotal >= prompt.total}
                  onclick={() => session.setSplit(target, amountOf(target) + 1)}>+</button>
              </span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="hint">Phase no ofrece destinatarios para este reparto.</p>
      {/if}
    {:else}
      <p class="hint">
        El reparto es el del motor: {prompt.total} entre {prompt.targets.length} da
        {Math.floor(prompt.total / prompt.targets.length)} a cada uno, y el resto al último.
      </p>
    {/if}
    <button
      type="button"
      class="primary"
      disabled={session.busy || !session.splitReady}
      onclick={() => session.confirmSplit()}>
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
