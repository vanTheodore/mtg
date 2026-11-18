<script lang="ts">
  /**
   * `ModeChoice` / `AbilityModeChoice` — CR 700.2.
   *
   * A modal card asks its controller to choose modes before targets and costs.
   * Phase publishes the window, the mode texts and the modes it already rules
   * out; the block only collects the answer (`SelectModes`) and never decides
   * which modes exist.
   *
   * Two details come straight from the rules and are the ones a naive port
   * gets wrong:
   *   - a one-of-one modal answers with the click itself (CR 700.2), so there
   *     is no confirmation to press;
   *   - only an ACTIVATED modal ability can still be cancelled at this step
   *     (CR 602.2b); a triggered one must pick a mode and resolve (CR 603.3c).
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { modeCanCancel, modeIsBudget, modeSingleChoice, modeSpent, modeWeight } from '#lib/game/interaction.ts';

  const prompt = $derived(session.modeChoicePrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const selected = $derived(session.modes);
  const budget = $derived(prompt ? modeIsBudget(prompt) : false);
  const single = $derived(prompt ? modeSingleChoice(prompt) : false);
  const spent = $derived(prompt ? modeSpent(prompt, selected) : 0);
  const card = $derived(
    prompt?.objectId !== undefined
      ? session.snapshot?.state.objects[String(prompt.objectId)]?.name
      : undefined
  );
  const title = $derived.by(() => {
    if (!prompt) return '';
    if (budget) return `Elige modos hasta ${prompt.max} punto${prompt.max === 1 ? '' : 's'}`;
    if (prompt.min === prompt.max) return `Elige ${prompt.min} modo${prompt.min === 1 ? '' : 's'}`;
    return `Elige entre ${prompt.min} y ${prompt.max} modos`;
  });
  /** A mode that no longer fits the remaining budget is offered greyed out. */
  function blocked(index: number) {
    if (!prompt) return true;
    if (prompt.unavailable.includes(index)) return true;
    if (!budget) return false;
    if (!prompt.allowRepeat && selected.includes(index)) return false;
    return spent + modeWeight(prompt, index) > prompt.max;
  }
  function countOf(index: number) {
    return selected.filter((value) => value === index).length;
  }
</script>

{#if prompt && mine}
  <div class="prompt" aria-label="Elegir modos del hechizo" data-mode-choice>
    <strong>{title}{card ? ` · ${card}` : ''}</strong>
    <p class="hint">
      {#if prompt.kind === 'ability'}
        Esta habilidad es modal: Phase resolverá solo los modos que elijas.
      {:else}
        Este hechizo es modal: Phase resolverá solo los modos que elijas.
      {/if}
    </p>
    <div class="modes">
      {#each prompt.descriptions as description, index (index)}
        {@const isBlocked = blocked(index)}
        {@const count = countOf(index)}
        <button
          type="button"
          class="mode"
          aria-pressed={count > 0}
          disabled={isBlocked && count === 0}
          onclick={() => session.toggleMode(index)}>
          <span class="text">{description || `Modo ${index + 1}`}</span>
          {#if budget && modeWeight(prompt, index) > 0}
            <span class="pips" aria-label={`${modeWeight(prompt, index)} puntos`}>{'{P}'.repeat(modeWeight(prompt, index))}</span>
          {/if}
          {#if prompt.unavailable.includes(index)}<span class="tag">Ya no disponible</span>{/if}
          {#if count > 0}<span class="count" aria-label={`elegido ${count} ${count === 1 ? 'vez' : 'veces'}`}>{count}</span>{/if}
        </button>
      {/each}
    </div>
    {#if !single}
      <div class="row">
        <button type="button" class="primary" disabled={session.busy || !session.modesReady} onclick={() => session.confirmModes()}>
          {#if budget}
            Confirmar modos ({spent}/{prompt.max} puntos)
          {:else}
            Confirmar modos ({selected.length}/{prompt.max})
          {/if}
        </button>
        {#if selected.length > 0}
          <button type="button" class="ghost" onclick={() => session.clearModes()}>Limpiar</button>
        {/if}
        {#if modeCanCancel(prompt)}
          <button type="button" class="ghost" onclick={() => session.cancelCast()}>Cancelar</button>
        {/if}
      </div>
    {:else if modeCanCancel(prompt)}
      <div class="row">
        <button type="button" class="ghost" onclick={() => session.cancelCast()}>Cancelar</button>
      </div>
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
  .modes { display: grid; gap: .35rem; }
  .mode {
    display: flex;
    align-items: center;
    gap: .45rem;
    min-height: 44px;
    padding: .5rem .6rem;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--surface-3);
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .mode[aria-pressed='true'] { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
  .mode:disabled { opacity: .45; cursor: not-allowed; }
  .text { flex: 1; font-size: .84rem; }
  .pips { font-size: .78rem; font-weight: 700; letter-spacing: .05em; }
  .tag, .count { font-size: .72rem; padding: .1rem .4rem; border-radius: 999px; }
  .tag { border: 1px solid var(--line); color: var(--ink-2); }
  .count { background: var(--accent); color: var(--accent-ink); font-weight: 700; }
  .row { display: flex; gap: .4rem; flex-wrap: wrap; }
  .primary, .ghost {
    min-height: 44px;
    padding: .5rem .7rem;
    border-radius: 9px;
    font: inherit;
    font-size: .84rem;
    font-weight: 650;
    cursor: pointer;
  }
  .primary { border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); }
  .primary:disabled { opacity: .55; cursor: not-allowed; }
  .ghost { border: 1px solid var(--line); background: var(--surface-3); color: var(--ink); }
  .mode:focus-visible, .primary:focus-visible, .ghost:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
