<script lang="ts">
  /**
   * `WaitingFor::CategoryChoice` — CR 101.4 + CR 701.21a: keep one permanent of
   * each of those types, sacrifice the rest.
   *
   * The engine publishes one candidate list **per category**, aligned with
   * `categories`, so the screen is one slot per category and each slot offers only
   * what its own list holds. The answer is one entry per category: a pick where
   * there are candidates, `null` where there are none — the engine rejects both a
   * pick for an empty category and a missing one for a full category, so an empty
   * slot is not an oversight, it is what the payload says.
   *
   * One permanent may fill two slots (an artifact creature satisfies Artifact and
   * Creature); the engine dedupes the protected set, so the screen lets it happen
   * and counts the distinct keeps.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { coreTypeLabel } from '#lib/game/cards.ts';
  import { distinctTargetLabels, objectTarget, targetLabel } from '#lib/game/interaction.ts';

  const prompt = $derived(session.categoryPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const source = $derived(prompt?.sourceId != null ? objects[String(prompt.sourceId)]?.name : undefined);
  // One label space for the whole prompt: two copies of the same card on the same
  // side are both legal in one category, so the shared helper adds the id where the
  // name repeats. Labels are keyed by object id, so a card in two categories reads
  // the same in both.
  const labels = $derived.by(() => {
    const ids = [...new Set((prompt?.categories ?? []).flatMap((entry) => entry.eligible))];
    const names = distinctTargetLabels(ids.map((id) => objectTarget(id)), objects);
    return new Map(ids.map((id, index) => [id, names[index] ?? targetLabel(objectTarget(id), objects)]));
  });
  const nameOf = (id: number) => labels.get(id) ?? objects[String(id)]?.name ?? targetLabel({ Object: id }, objects);

  const scopeLine = $derived.by(() => {
    if (!prompt) return '';
    if (prompt.chooserScope === 'forAll') {
      return `Eliges tú por todos los jugadores del efecto, no sólo por ti (CR 101.4), y ahora te toca el Jugador ${prompt.targetPlayer + 1}.`;
    }
    return `Eliges de entre los permanentes del Jugador ${prompt.targetPlayer + 1}; el resto se sacrifica (CR 101.4).`;
  });

  const emptyCount = $derived(prompt?.categories.filter((entry) => !entry.eligible.length).length ?? 0);
  const confirmLabel = $derived.by(() => {
    const kept = session.categoryKeptCount;
    if (!kept) return 'Elige uno de cada tipo con candidatos';
    const after = prompt && prompt.remainingPlayers.length
      ? ` · después elige el Jugador ${prompt.remainingPlayers[0] + 1}`
      : '';
    return `Conservar ${kept} y sacrificar el resto${after}`;
  });
</script>

{#if prompt && mine}
  <div class="prompt" aria-label="Conservar un permanente de cada tipo" data-category-choice>
    <strong>Conservar un permanente de cada tipo{source ? ` · ${source}` : ''}</strong>
    <p class="hint">{scopeLine}</p>
    <p class="hint">Una misma carta puede cubrir dos tipos a la vez —un artefacto que también es criatura—: no hay que repartirla, cuenta para las dos (CR 701.21a).</p>
    {#if emptyCount}
      <p class="hint" data-category-empty>Sin candidatos en {emptyCount === 1 ? 'un tipo' : `${emptyCount} tipos`}: esa categoría no conserva nada y Phase no admite una elección ahí.</p>
    {/if}
    <ol class="groups">
      {#each prompt.categories as entry, index (entry.category)}
        {@const picked = session.categoryPicked(index)}
        <li class="group" data-category-group={entry.category}>
          <p class="label">
            {coreTypeLabel(entry.category)}
            <span class="status">{entry.eligible.length ? `${entry.eligible.length} candidato${entry.eligible.length === 1 ? '' : 's'}` : 'sin candidatos'}</span>
          </p>
          {#if entry.eligible.length}
            <div class="chips">
              {#each entry.eligible as id (id)}
                <button
                  type="button"
                  class="chip"
                  aria-pressed={picked === id}
                  disabled={session.busy}
                  data-category-pick={id}
                  onclick={() => session.setCategoryPick(index, picked === id ? null : id)}>{nameOf(id)}</button>
              {/each}
            </div>
          {:else}
            <p class="hint">Nada que conservar de este tipo.</p>
          {/if}
        </li>
      {/each}
    </ol>
    <button
      type="button"
      class="primary"
      disabled={session.busy || !session.categoryReady}
      data-category-ready={session.categoryReady}
      onclick={() => session.confirmCategory()}>
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
  .groups { margin: 0; padding: 0; list-style: none; display: grid; gap: .4rem; }
  .group {
    display: grid;
    gap: .35rem;
    padding: .4rem .5rem;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--surface-3);
  }
  .label {
    margin: 0;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: .5rem;
    font-size: .8rem;
    font-weight: 700;
    color: var(--ink);
  }
  .status { font-size: .7rem; font-weight: 600; color: var(--ink-2); }
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
