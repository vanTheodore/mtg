<script lang="ts">
  /**
   * `SpecializeColor` — CR 253.2 + CR 702.168a.
   *
   * Al resolverse la especialización, la carta gana un color adicional y el
   * jugador elige cuál. Las opciones son las que el motor publicó, en su orden.
   *
   * El nombre del color sale de una tabla de cinco entradas que es el propio
   * enum del motor (`ManaColor`: White, Blue, Black, Red, Green). Un valor que no
   * sea uno de esos cinco se dice sin nombre —el botón muestra el valor del
   * cable— en vez de inventarle una traducción.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { colorName, specializeOffers } from '#lib/game/interaction.ts';

  const prompt = $derived(session.specializePrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const offers = $derived(specializeOffers(session.snapshot?.legal.actions ?? []));
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const sourceName = $derived(
    prompt?.objectId !== null && prompt?.objectId !== undefined
      ? objects[String(prompt.objectId)]?.name ?? null
      : null
  );
</script>

{#if prompt}
  <div
    class="prompt"
    aria-label="Elegir color de especialización"
    data-specialize
    data-specialize-count={prompt.options.length}
    data-specialize-player={prompt.player}>
    <strong>Elegir color de especialización</strong>
    <p class="hint" data-specialize-rule>
      CR 253.2: la carta gana un color adicional de los que Phase publicó.
    </p>
    {#if sourceName}
      <p class="hint" data-specialize-source>Carta: {sourceName}</p>
    {/if}

    {#if !mine}
      <ul class="faces" data-specialize-faces>
        {#each prompt.options as color (color)}
          <li>{colorName(color) ?? color}</li>
        {/each}
      </ul>
      <p class="hint" data-specialize-other>
        Esta elección es del Jugador {prompt.player + 1}: no es tu decisión (CR 400.2).
      </p>
    {:else}
      <div class="actions">
        {#each prompt.options as color (color)}
          {@const action = offers.byColor.get(color)}
          {#if action}
            <button
              type="button"
              class="primary"
              data-specialize-option={color}
              disabled={session.busy}
              onclick={() => session.answerSpecialize(action)}>
              {colorName(color) ?? color}
            </button>
          {:else}
            <span class="no-action" data-specialize-inert={color}>{colorName(color) ?? color}</span>
          {/if}
        {/each}
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
  .faces { margin: 0; padding-left: 1.1rem; font-size: .78rem; }
  .actions { display: flex; gap: .4rem; flex-wrap: wrap; }
  .primary {
    min-height: 44px;
    padding: .55rem .7rem;
    border-radius: 9px;
    font: inherit;
    font-size: .82rem;
    font-weight: 650;
    cursor: pointer;
  }
  .primary { border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); }
  .primary:disabled { opacity: .55; cursor: not-allowed; }
  .primary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .no-action {
    min-height: 44px;
    display: grid;
    align-items: center;
    padding: .55rem .7rem;
    border: 1px dashed var(--line);
    border-radius: 9px;
    font-size: .82rem;
    color: var(--ink-2);
  }
</style>
