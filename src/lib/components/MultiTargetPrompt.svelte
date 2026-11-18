<script lang="ts">
  /**
   * `WaitingFor::MultiTargetSelection` — CR 601.2c: a spell or ability with more
   * than one instance of "target" asks for a **set**, inside a window the engine
   * owns (`min_targets..=max_targets`).
   *
   * The window is the whole rule here, and it is not the same as a cost:
   * "any number of targets" starts at zero and may be declined, "up to two" caps
   * at two, and a fixed count has min == max. Above the maximum the engine would
   * reject the extra target, so the row stops accepting one instead of letting the
   * player compose something Phase will refuse.
   *
   * CR 115.3 forbids naming the same target twice for one instance of "target":
   * each permanent is offered once and toggles.
   */
  import { session } from '#lib/game/session.svelte.ts';

  const prompt = $derived(session.multiTargetPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const source = $derived(prompt?.sourceId != null ? objects[String(prompt.sourceId)]?.name : undefined);
  const picked = $derived(session.multiPick);
  const nameOf = (id: number) => objects[String(id)]?.name ?? `Objeto ${id}`;
  const full = $derived(prompt !== null && picked.length >= prompt.max);

  const ruleLine = $derived.by(() => {
    if (!prompt) return '';
    if (prompt.min === 0 && prompt.max === 0) return 'Esta habilidad no puede elegir objetivos ahora mismo.';
    if (prompt.min === 0) return `Elige hasta ${prompt.max} objetivo${prompt.max === 1 ? '' : 's'}; ninguno es una respuesta legal.`;
    if (prompt.min === prompt.max) {
      return `Elige exactamente ${prompt.min} objetivo${prompt.min === 1 ? '' : 's'} (CR 601.2c).`;
    }
    return `Elige entre ${prompt.min} y ${prompt.max} objetivos (CR 601.2c).`;
  });
  const countLine = $derived.by(() => {
    if (!prompt) return '';
    const n = picked.length;
    const missing = prompt.min - n;
    if (missing > 0) return `Elegidos ${n} de ${prompt.max} · faltan ${missing}.`;
    if (n >= prompt.max) return `Elegidos ${n} de ${prompt.max} · el máximo.`;
    return `Elegidos ${n} de ${prompt.max}.`;
  });
  const confirmLabel = $derived.by(() => {
    if (!prompt) return '';
    const n = picked.length;
    const missing = prompt.min - n;
    // Below the minimum the button cannot be an offer: it says what is missing
    // instead of naming a set Phase would reject.
    if (missing > 0) return missing === 1 ? 'Falta 1 objetivo' : `Faltan ${missing} objetivos`;
    if (n === 0) return 'Confirmar sin objetivos';
    // A set of targets has no order of its own (CR 601.2c names them, does not
    // sequence them), so the label follows the engine's list and not the clicks.
    const chosen = prompt.targets.filter((id) => picked.includes(id));
    return `Confirmar ${n} objetivo${n === 1 ? '' : 's'}: ${chosen.map(nameOf).join(' + ')}`;
  });
</script>

{#if prompt && mine}
  <div class="prompt" aria-label="Objetivos de la habilidad" data-multi-target>
    <strong>Objetivos{source ? ` · ${source}` : ''}</strong>
    <p class="hint">{ruleLine}</p>
    <p class="hint" data-multi-count>{countLine}</p>
    {#if prompt.targets.length}
      <ul class="rows">
        {#each prompt.targets as id (id)}
          <li>
            <button
              type="button"
              class="row"
              aria-pressed={picked.includes(id)}
              disabled={session.busy || (full && !picked.includes(id))}
              onclick={() => session.toggleMultiPick(id)}>
              {nameOf(id)}
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="hint">Phase no ofrece ningún objetivo para esta habilidad.</p>
    {/if}
    <button
      type="button"
      class="primary"
      disabled={session.busy || !session.multiReady}
      onclick={() => session.confirmMultiPick()}>
      {confirmLabel}
    </button>
    <p class="hint small">
      Un mismo objetivo no se puede nombrar dos veces para la misma instancia de «objetivo»
      (CR 115.3).
    </p>
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
  .hint.small { font-size: .72rem; }
  .rows { margin: 0; padding: 0; list-style: none; display: grid; gap: .3rem; }
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
  .row[aria-pressed='true'] { border-color: var(--accent); outline: 1px solid var(--accent); }
  .row:disabled { opacity: .55; cursor: not-allowed; }
  .row:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .primary {
    min-height: 44px;
    padding: .45rem .7rem;
    border: 1px solid var(--accent);
    border-radius: 9px;
    background: var(--accent);
    color: var(--accent-ink);
    font: inherit;
    font-size: .86rem;
    font-weight: 750;
    cursor: pointer;
  }
  .primary:disabled { opacity: .55; cursor: not-allowed; }
  .primary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
