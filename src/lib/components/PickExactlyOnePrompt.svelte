<script lang="ts">
  /**
   * `BlightChoice` (CR 701.68a), `HarmonizeTapChoice` (CR 702.180b) y
   * `UnlessBounceChoice` (CR 118.12).
   *
   * Las tres piden exactamente uno de una lista cerrada, y las tres responden
   * distinto: `SelectCards` con una carta, `HarmonizeTap { creature_id }` y otra
   * vez `SelectCards`. El panel comparte dibujo pero cada botón despacha la
   * acción de **su** ventana, ya emparejada por el parser.
   *
   * Dos cosas no se inventan nunca:
   *   - «Ninguno»: sólo se dibuja si el motor publicó `HarmonizeTap { creature_id: null }`.
   *   - El sujeto de la decisión: `counters` y `remaining` se leen del cable, no
   *     se cuentan aquí.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { typeLine } from '#lib/game/cards.ts';

  const prompt = $derived(session.pickExactlyOnePrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});

  function nameOf(id: number) {
    return objects[String(id)]?.name ?? `Objeto ${id}`;
  }
  function typeOf(id: number) {
    const object = objects[String(id)];
    return object ? typeLine(object) : '';
  }

  const title = $derived.by(() => {
    if (!prompt) return '';
    if (prompt.kind === 'blight') return 'Elegir qué criatura malea';
    if (prompt.kind === 'harmonize') return 'Elegir qué criatura girar';
    return 'Elegir qué permanente devolver a la mano';
  });

  const declineLabel = $derived((prompt?.kind === 'harmonize' ? 'No reducir el coste' : ''));
</script>

{#if prompt}
  <div
    class="prompt"
    aria-label={title}
    data-pick-exactly-one
    data-pick-exactly-one-kind={prompt.kind}
    data-pick-exactly-one-count={prompt.candidates.length}
    data-pick-exactly-one-player={prompt.player}>
    <strong>{title}</strong>
    <p class="hint" data-pick-exactly-one-rule>
      {#if prompt.kind === 'blight'}
        CR 701.68a: eliges una criatura, y lleva {prompt.counters} contador(es) -1/-1. La cuenta la fija el motor; aquí sólo se lee.
      {:else if prompt.kind === 'harmonize'}
        CR 702.180b: armonizar reduce el coste girando una criatura que controlas.
      {:else}
        CR 118.12: devuelves un permanente a la mano de los que Phase publicó.
      {/if}
    </p>
    {#if prompt.kind === 'unless-bounce' && (prompt.remaining ?? 0) > 1}
      <p class="hint" data-pick-exactly-one-remaining>Quedan {prompt.remaining} jugadores por decidir.</p>
    {/if}

    {#if !mine}
      <ul class="faces" data-pick-exactly-one-faces>
        {#each prompt.candidates as id (id)}
          <li>{nameOf(id)}</li>
        {/each}
      </ul>
      <p class="hint" data-pick-exactly-one-other>
        Esta elección es del Jugador {prompt.player + 1}: no es tu decisión (CR 400.2).
      </p>
    {:else}
      <div class="actions">
        {#each prompt.candidates as id (id)}
          {@const action = prompt.actions.get(id)}
          {#if action}
            <button
              type="button"
              class="primary"
              data-pick-exactly-one-option={id}
              disabled={session.busy}
              onclick={() => session.answerPickExactlyOne(action)}>
              {nameOf(id)}
              {#if typeOf(id)}<span class="type">{typeOf(id)}</span>{/if}
            </button>
          {:else}
            <span class="no-action" data-pick-exactly-one-inert={id}>{nameOf(id)}</span>
          {/if}
        {/each}
        {#if prompt.decline}
          <button
            type="button"
            class="secondary"
            data-pick-exactly-one-decline
            disabled={session.busy}
            onclick={() => session.answerPickExactlyOne(prompt.decline!)}>
            {declineLabel}
          </button>
        {/if}
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
  .primary, .secondary {
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
  .secondary { border: 1px solid var(--line); background: var(--surface); color: var(--ink); align-content: center; }
  .primary:disabled, .secondary:disabled { opacity: .55; cursor: not-allowed; }
  .primary:focus-visible, .secondary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
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
