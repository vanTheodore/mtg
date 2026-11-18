<script lang="ts">
  /**
   * `WaitingFor::OrderTriggers` — CR 603.3b.
   *
   * When several abilities one player controls trigger at the same time, that
   * player chooses the order they go on the stack. The list reads like the
   * stack (CR 405.3): the top row resolves **last**, the bottom row resolves
   * first. Phase owns the summaries and accepts a permutation of their
   * indices; this block only moves rows and dispatches that permutation.
   */
  import { session } from '#lib/game/session.svelte.ts';

  const prompt = $derived(session.triggerOrderPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const order = $derived(session.triggerOrder);
</script>

{#if prompt && mine}
  <div class="prompt" aria-label="Orden de los disparos" data-trigger-order>
    <strong>Orden de los disparos</strong>
    <p class="hint">
      Varias habilidades tuyas se disparan a la vez. Elige en qué orden se apilan:
      la primera de la lista se resuelve la última.
    </p>
    <p class="edge">Se resuelven al final</p>
    <ol class="rows">
      {#each order as engineIndex, position (engineIndex)}
        {@const trigger = prompt.triggers[engineIndex]}
        <li class="row" data-trigger-index={engineIndex}>
          <span class="number" aria-hidden="true">{engineIndex + 1}</span>
          <div class="text">
            <span class="name">{trigger.name || `Disparo ${engineIndex + 1}`}</span>
            {#if trigger.description}<span class="description">{trigger.description}</span>{/if}
          </div>
          <div class="moves">
            <button
              type="button"
              class="move"
              aria-label={`Subir ${trigger.name || `disparo ${engineIndex + 1}`}`}
              disabled={position === 0}
              onclick={() => session.moveTrigger(position, position - 1)}>▲</button>
            <button
              type="button"
              class="move"
              aria-label={`Bajar ${trigger.name || `disparo ${engineIndex + 1}`}`}
              disabled={position === order.length - 1}
              onclick={() => session.moveTrigger(position, position + 1)}>▼</button>
          </div>
        </li>
      {/each}
    </ol>
    <p class="edge">Se resuelve primero</p>
    <button type="button" class="primary" disabled={session.busy} onclick={() => session.confirmTriggerOrder()}>
      Confirmar orden
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
  .hint, .edge { margin: 0; font-size: .78rem; }
  .hint { color: var(--ink-2); }
  .edge {
    text-transform: uppercase;
    letter-spacing: .04em;
    font-size: .68rem;
    color: var(--ink-2);
  }
  .rows { margin: 0; padding: 0; list-style: none; display: grid; gap: .35rem; }
  .row {
    display: flex;
    align-items: flex-start;
    gap: .5rem;
    padding: .45rem .55rem;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--surface-3);
  }
  .number { font-size: .78rem; font-weight: 700; opacity: .7; min-width: 1rem; }
  .text { display: grid; gap: .12rem; flex: 1; min-width: 0; }
  .name { font-size: .84rem; font-weight: 650; }
  .description { font-size: .78rem; color: var(--ink-2); }
  .moves { display: grid; gap: .2rem; }
  .move {
    min-height: 44px;
    min-width: 44px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
    color: var(--ink);
    font: inherit;
    font-size: .8rem;
    cursor: pointer;
  }
  .move:disabled { opacity: .45; cursor: not-allowed; }
  .primary {
    min-height: 44px;
    padding: .55rem .7rem;
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
  .move:focus-visible, .primary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
