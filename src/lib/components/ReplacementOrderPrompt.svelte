<script lang="ts">
  /**
   * `WaitingFor::ReplacementDecisionOrder` — CR 101.4c + CR 616.1.
   *
   * Una población preparada trae **varias** sustituciones simultáneas y el
   * jugador afectado decide cuál se aplica antes. No es `ReplacementChoice`:
   * allí los candidatos son reemplazos con su descripción y se contestan con
   * `ChooseReplacement { index }`; aquí los candidatos son **objetos** —las
   * cosas sobre las que caerá cada sustitución— y se contestan con
   * `SelectCards { cards: [ese] }`, exactamente una.
   *
   * Consecuencia para el dibujo: los botones salen de `legal.actions`, no de un
   * índice reconstruido. Un objeto que el cable publicó pero para el que el
   * motor no ofreció acción se pinta como fila inerte, no como botón muerto.
   * El orden de `objects` es el de anuncio del motor y se respeta.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { typeLine } from '#lib/game/cards.ts';

  const prompt = $derived(session.replacementOrderPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});

  function nameOf(id: number) {
    const object = objects[String(id)];
    if (!object) return `Objeto ${id}`;
    if (object.display_visible_to_viewer === false) return 'Un objeto que el motor no nombró';
    return object.name ?? `Carta ${id}`;
  }
  function typeOf(id: number) {
    const object = objects[String(id)];
    return object ? typeLine(object) : '';
  }
</script>

{#if prompt}
  <div
    class="prompt"
    aria-label="Orden de las sustituciones"
    data-replacement-order
    data-replacement-order-count={prompt.objects.length}
    data-replacement-order-player={prompt.player}>
    <strong>¿Qué sustitución se aplica antes?</strong>
    <p class="hint" data-replacement-order-rule>
      CR 101.4c: {prompt.objects.length} sustituciones se aplican al mismo tiempo sobre este grupo y
      elige el jugador afectado en qué orden se resuelven. CR 616.1: eliges una; Phase la aplica y
      vuelve a preguntar por las que sigan siendo aplicables, así que esto es una elección por paso.
    </p>
    {#if !mine}
      <ul class="faces" data-replacement-order-faces>
        {#each prompt.objects as id (id)}
          <li>{nameOf(id)}</li>
        {/each}
      </ul>
      <p class="hint" data-replacement-order-other>
        Esta elección es del Jugador {prompt.player + 1}: no es tu decisión (CR 400.2).
      </p>
    {:else}
      <ul class="rows">
        {#each prompt.objects as id (id)}
          {@const action = prompt.actions.get(id)}
          <li>
            {#if action}
              <button
                type="button"
                class="row"
                data-replacement-order-option={id}
                disabled={session.busy}
                onclick={() => session.answerReplacementOrder(action)}>
                <span class="text">{nameOf(id)}</span>
                {#if typeOf(id)}<span class="type">{typeOf(id)}</span>{/if}
              </button>
            {:else}
              <span class="inert" data-replacement-order-inert={id}>
                <span class="text">{nameOf(id)}</span>
                <span class="type">Phase no ofrece esta opción ahora mismo</span>
              </span>
            {/if}
          </li>
        {/each}
      </ul>
      <p class="hint" data-replacement-order-again>
        Después de cada elección Phase puede volver a preguntar: la ventana se cierra cuando no queda
        ninguna sustitución aplicable.
      </p>
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
  .rows { margin: 0; padding: 0; list-style: none; display: grid; gap: .3rem; }
  .row {
    display: grid;
    gap: .1rem;
    width: 100%;
    min-height: 44px;
    padding: .45rem .55rem;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--surface-3);
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .text { font-size: .84rem; font-weight: 650; }
  .type { font-size: .74rem; color: var(--ink-2); }
  .row:disabled { opacity: .55; cursor: not-allowed; }
  .row:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .inert {
    display: grid;
    gap: .1rem;
    min-height: 44px;
    align-content: center;
    padding: .45rem .55rem;
    border: 1px dashed var(--line);
    border-radius: 9px;
    color: var(--ink-2);
  }
</style>
