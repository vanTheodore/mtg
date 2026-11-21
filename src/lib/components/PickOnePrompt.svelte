<script lang="ts">
  /**
   * `BeholdChoice` (CR 701.4a) y `PopulateChoice` (CR 701.47a).
   *
   * Las dos ofrecen una lista de objetos del campo y eligen uno, pero **no
   * responden igual**: behold manda `SelectCards { cards: [esa] }` y populate
   * manda `ChooseTarget { Object(id) }`. Por eso son dos bloques con dos parsers
   * de oferta distintos, aunque compartan dibujo: el botón despacha lo que el
   * motor publicó, y el panel no convierte una acción en la otra.
   *
   * La lista es la publicada, en su orden. Un candidato sin acción publicada es
   * una fila sin botón; un objeto que el cable no publicó como candidato no se
   * pinta aunque exista en el campo.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { typeLine } from '#lib/game/cards.ts';

  const prompts = $derived(session.pickOnePrompt);
  const mine = $derived(prompts !== null && prompts.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});

  function nameOf(id: number) {
    return objects[String(id)]?.name ?? `Objeto ${id}`;
  }
  function typeOf(id: number) {
    const object = objects[String(id)];
    return object ? typeLine(object) : '';
  }

  const title = $derived.by(() => {
    if (!prompts) return '';
    return prompts.kind === 'behold' ? 'Elegir qué mostrar' : 'Elegir qué ficha poblar';
  });
</script>

{#if prompts}
  <div
    class="prompt"
    aria-label={title}
    data-pick-one
    data-pick-one-kind={prompts.kind}
    data-pick-one-count={prompts.options.length}
    data-pick-one-player={prompts.player}>
    <strong>{title}</strong>
    <p class="hint" data-pick-one-rule>
      {#if prompts.kind === 'behold'}
        CR 701.4a: muestras una carta o un permanente de los que Phase publicó, y es exactamente uno.
      {:else}
        CR 701.47a: creas una copia de una de las fichas que ya controlas y que Phase publicó.
      {/if}
    </p>
    {#if !mine}
      <ul class="faces" data-pick-one-faces>
        {#each prompts.options as id (id)}
          <li>{nameOf(id)}</li>
        {/each}
      </ul>
      <p class="hint" data-pick-one-other>
        Esta elección es del Jugador {prompts.player + 1}: no es tu decisión (CR 400.2).
      </p>
    {:else}
      <div class="actions">
        {#each prompts.options as id (id)}
          {@const action = prompts.actions.get(id)}
          {#if action}
            <button
              type="button"
              class="primary"
              data-pick-one-option={id}
              disabled={session.busy}
              onclick={() => session.answerPickOne(action)}>
              {nameOf(id)}
              {#if typeOf(id)}<span class="type">{typeOf(id)}</span>{/if}
            </button>
          {:else}
            <span class="no-action" data-pick-one-inert={id}>{nameOf(id)}</span>
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
    display: grid;
    gap: .1rem;
    text-align: left;
  }
  .primary { border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); }
  .primary:disabled { opacity: .55; cursor: not-allowed; }
  .primary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .type { font-size: .72rem; font-weight: 500; }
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
