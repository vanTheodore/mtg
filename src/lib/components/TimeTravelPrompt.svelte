<script lang="ts">
  /**
   * `WaitingFor::TimeTravelChoice` — CR 701.56a: for each chosen object, put **or**
   * remove a time counter.
   *
   * The engine models that "or" as two phases over the same list: the remove phase
   * runs first (advancing suspended cards toward casting) and the add phase then
   * runs over what is still eligible, **without** the objects just chosen to remove
   * — so each object gets at most one of the two. The phase is the whole screen:
   * identical rows, opposite verb, and the block names the phase instead of asking
   * the player to remember which half they are in.
   *
   * Eligible: permanents the player controls with a time counter, and suspended
   * cards they own in exile with one (CR 702.62b). Any number, including none.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { distinctTargetLabels, targetKey } from '#lib/game/interaction.ts';

  const prompt = $derived(session.timeTravelPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const labels = $derived(distinctTargetLabels(prompt?.eligible ?? [], objects));
  const removing = $derived(prompt?.phase !== 'add');

  const ruleLine = $derived.by(() => {
    if (!prompt) return '';
    return prompt.phase === 'add'
      ? 'Segunda mitad del viaje en el tiempo: a estos objetos les toca recibir un contador de tiempo (CR 701.56a). Ya no están los que elegiste restar, porque cada objeto recibe o pierde, no las dos cosas.'
      : 'Primera mitad del viaje en el tiempo: elige de qué objetos quitar un contador de tiempo (CR 701.56a). Después se ofrece la otra mitad a los que queden.';
  });

  const confirmLabel = $derived.by(() => {
    const picked = session.timeTravelPick.length;
    if (!picked) return removing ? 'Confirmar sin quitar ninguno' : 'Confirmar sin poner ninguno';
    const verb = removing ? 'Quitar un contador a' : 'Poner un contador en';
    return picked === 1 ? `${verb} 1 elegido` : `${verb} ${picked} elegidos`;
  });
</script>

{#if prompt && mine}
  <div class="prompt" aria-label="Viajar en el tiempo" data-time-travel data-time-travel-phase={prompt.phase}>
    <strong>Viaje en el tiempo · {removing ? 'quitar contadores' : 'poner contadores'}</strong>
    <p class="hint">{ruleLine}</p>
    <p class="hint count" data-time-travel-count>
      Elegidos {session.timeTravelPick.length} de {prompt.eligible.length}
    </p>
    {#if prompt.eligible.length}
      <ul class="rows">
        {#each prompt.eligible as target, index (targetKey(target))}
          {@const picked = session.timeTravelIsPicked(target)}
          <li>
            <button
              type="button"
              class="row"
              aria-pressed={picked}
              disabled={session.busy}
              data-time-travel-object={targetKey(target)}
              onclick={() => session.toggleTimeTravel(target)}>
              <span class="tick" aria-hidden="true">{picked ? (removing ? '−' : '+') : ''}</span>
              <span class="name">{labels[index] ?? 'Objeto'}</span>
              <span class="zone">{objects[String((target as { Object?: number }).Object ?? -1)]?.zone === 'Exile' ? 'Exilio' : 'Permanente'}</span>
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="hint">Phase no publica objetos con contadores de tiempo.</p>
    {/if}
    <button
      type="button"
      class="primary"
      disabled={session.busy}
      data-time-travel-ready={session.timeTravelPick.length}
      onclick={() => session.confirmTimeTravel()}>
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
  .tick { width: 1.1ch; font-size: .95rem; font-weight: 800; color: var(--accent); }
  .name { flex: 1; font-size: .84rem; font-weight: 650; }
  .zone { font-size: .7rem; letter-spacing: .04em; text-transform: uppercase; color: var(--ink-2); }
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
