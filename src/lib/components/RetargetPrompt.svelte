<script lang="ts">
  /**
   * `WaitingFor::RetargetChoice` — CR 115.7: changing the targets of a spell or
   * ability that is already on the stack.
   *
   * The engine validates one position at a time ("each target can be changed only
   * to another legal target", CR 115.7a), so the screen is one block per declared
   * target, and each block only offers what *that* position admits. Two scopes:
   *
   *   - `single` — "change the target": one position, and it must move: there is
   *     no "keep" (the engine rejects a submission that keeps it);
   *   - `all` — "choose new targets": every position may stay as it is, which is a
   *     legal submission, so the button never blocks.
   *
   * The declared target never appears among its own alternatives: keeping it is
   * either impossible (`single`) or already the default (`all`).
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { distinctTargetLabels, targetKey, targetLabel } from '#lib/game/interaction.ts';

  const prompt = $derived(session.retargetPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const entry = $derived.by(() => {
    if (!prompt) return undefined;
    const stack = (session.snapshot?.state.stack ?? []) as { source_id?: number }[];
    const source = stack[prompt.stackEntryIndex]?.source_id;
    return typeof source === 'number' ? objects[String(source)] : undefined;
  });
  // One label space for the whole prompt, so the same permanent reads the same in
  // the "current" line and in a candidate chip.
  const labels = $derived.by(() => {
    if (!prompt) return new Map<string, string>();
    const all = [...prompt.current, ...prompt.pools.flat(), ...prompt.union];
    const unique = all.filter((ref, index) => all.findIndex((other) => targetKey(other) === targetKey(ref)) === index);
    const names = distinctTargetLabels(unique, objects);
    return new Map(unique.map((ref, index) => [targetKey(ref), names[index] ?? targetLabel(ref, objects)]));
  });
  const labelOf = (ref: unknown) => labels.get(targetKey(ref)) ?? targetLabel(ref, objects);
  const currentName = (index: number) => (prompt ? labelOf(prompt.current[index]) : '');
  const scopeLine = $derived.by(() => {
    if (!prompt) return '';
    const total = prompt.current.length;
    if (prompt.scope === 'single') {
      return 'El hechizo tiene un solo objetivo que cambiar (CR 115.7a): elige otro objetivo legal; no puedes dejarlo como está.';
    }
    return total === 1
      ? 'El hechizo tiene un objetivo: puedes cambiarlo a otro objetivo legal o dejarlo como está (CR 115.7a).'
      : `El hechizo tiene ${total} objetivos: cada uno puede ir a otro objetivo legal o quedarse como está (CR 115.7a).`;
  });
  const confirmLabel = $derived.by(() => {
    if (!prompt) return '';
    if (prompt.scope === 'single') {
      const pick = session.retargetPicked(0);
      return pick ? `Cambiar a ${labelOf(pick)}` : 'Elige un objetivo nuevo';
    }
    const changed = session.retargetChanged;
    return changed ? `Confirmar ${changed} de ${prompt.current.length} cambios` : 'Dejar los objetivos como están';
  });
  const ready = $derived(session.retargetReady);
</script>

{#if prompt && mine}
  <div class="prompt" aria-label="Cambiar objetivos" data-retarget data-retarget-scope={prompt.scope}>
    <strong>Cambiar objetivos{entry?.name ? ` · ${entry.name}` : ''}</strong>
    <p class="hint">{scopeLine}</p>
    <ol class="slots">
      {#each prompt.current as _current, index (index)}
        {@const candidates = session.retargetCandidates(index)}
        {@const picked = session.retargetPicked(index)}
        <li class="slot" data-retarget-position={index}>
          <p class="current">
            Objetivo {index + 1}: <span class="declared">{currentName(index)}</span>
          </p>
          <div class="chips">
            {#if candidates.length}
              {#each candidates as candidate (targetKey(candidate))}
                {@const elect = prompt.keepDistinct[index] && targetKey(candidate) === targetKey(prompt.current[index])}
                <button
                  type="button"
                  class="chip"
                  aria-pressed={picked ? targetKey(picked) === targetKey(candidate) : false}
                  aria-label={elect ? `${labelOf(candidate)} (objeto devuelto)` : undefined}
                  title={elect ? 'El objeto anunciado ya no está: elegir este nombre toma el que volvió (CR 400.7).' : undefined}
                  disabled={session.busy}
                  onclick={() => session.setRetarget(index, candidate)}>{labelOf(candidate)}</button>
              {/each}
            {:else}
              <p class="hint">Phase no publica alternativas legales para este objetivo.</p>
            {/if}
            {#if prompt.scope === 'all'}
              <button
                type="button"
                class="chip keep"
                aria-pressed={!picked}
                disabled={session.busy}
                onclick={() => session.setRetarget(index, null)}>Dejar como está</button>
            {/if}
          </div>
        </li>
      {/each}
    </ol>
    <button
      type="button"
      class="primary"
      disabled={session.busy || !ready}
      data-retarget-changed={session.retargetChanged}
      onclick={() => session.confirmRetarget()}>
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
  .slots { margin: 0; padding: 0; list-style: none; display: grid; gap: .4rem; }
  .slot {
    display: grid;
    gap: .35rem;
    padding: .4rem .5rem;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--surface-3);
  }
  .current { margin: 0; font-size: .78rem; color: var(--ink-2); }
  .declared { font-weight: 700; color: var(--ink); }
  .chips { display: flex; flex-wrap: wrap; gap: .3rem; }
  .chip {
    min-height: 36px;
    padding: .3rem .6rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
    color: var(--ink);
    font: inherit;
    font-size: .8rem;
    font-weight: 650;
    cursor: pointer;
  }
  .chip[aria-pressed='true'] {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-ink);
  }
  .chip.keep[aria-pressed='true'] {
    border-color: var(--line);
    background: var(--surface-1);
    color: var(--ink-2);
  }
  .chip:disabled { opacity: .55; cursor: not-allowed; }
  .chip:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
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
