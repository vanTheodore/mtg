<script lang="ts">
  /**
   * `WaitingFor::ProliferateChoice` — CR 701.34a: "choose any number of permanents
   * and/or players, then give each another counter of each kind already there".
   *
   * The engine publishes exactly what qualifies — permanents with a counter, plus
   * players with poison or energy — so there is nothing to compute here and no
   * window: any number, including none, and no duplicates. Choosing a player is
   * choosing their poison/energy counters, which is why a seat can appear in the
   * list.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { distinctTargetLabels, parseTarget, targetKey } from '#lib/game/interaction.ts';

  const prompt = $derived(session.proliferatePrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const labels = $derived(distinctTargetLabels(prompt?.eligible ?? [], objects));

  const confirmLabel = $derived.by(() => {
    const picked = session.proliferatePick.length;
    if (!picked) return 'Confirmar sin proliferar nada';
    return picked === 1 ? 'Proliferar 1 elegido' : `Proliferar ${picked} elegidos`;
  });
</script>

{#if prompt && mine}
  <div class="prompt" aria-label="Proliferar" data-proliferate>
    <strong>Proliferar</strong>
    <p class="hint">
      Elige cualquier número de permanentes y jugadores que ya lleven contadores: cada uno recibe
      otro contador de cada clase que ya tenga (CR 701.34a). Elegir un jugador es elegir su veneno o
      su energía, por eso aparece en la lista.
    </p>
    <p class="hint count" data-proliferate-count>Elegidos {session.proliferatePick.length} de {prompt.eligible.length}</p>
    {#if prompt.eligible.length}
      <ul class="rows">
        {#each prompt.eligible as target, index (targetKey(target))}
          {@const picked = session.proliferateIsPicked(target)}
          <li>
            <button
              type="button"
              class="row"
              aria-pressed={picked}
              disabled={session.busy}
              data-proliferate-object={targetKey(target)}
              onclick={() => session.toggleProliferate(target)}>
              <span class="tick" aria-hidden="true">{picked ? '✓' : ''}</span>
              <span class="name">{labels[index] ?? 'Objeto'}</span>
              <span class="kind">{parseTarget(target)?.kind === 'player' ? 'Jugador' : 'Permanente'}</span>
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="hint">Phase no publica objetos con contadores para proliferar.</p>
    {/if}
    <button
      type="button"
      class="primary"
      disabled={session.busy}
      data-proliferate-ready={session.proliferatePick.length}
      onclick={() => session.confirmProliferate()}>
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
    gap: .45rem;
    width: 100%;
    min-height: 44px;
    padding: .35rem .5rem;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--surface-3);
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .row[aria-pressed='true'] {
    border-color: var(--accent);
    background: var(--surface-1);
    box-shadow: inset 3px 0 0 var(--accent);
  }
  .row:disabled { opacity: .55; cursor: not-allowed; }
  .row:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .tick { width: 1.1ch; font-size: .9rem; font-weight: 800; color: var(--accent); }
  .name { flex: 1; font-size: .84rem; font-weight: 650; }
  .kind { font-size: .7rem; letter-spacing: .04em; text-transform: uppercase; color: var(--ink-2); }
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
