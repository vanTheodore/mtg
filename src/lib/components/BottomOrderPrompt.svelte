<script lang="ts">
  /**
   * `RippleBottomOrder` / `RevealUntilBottomOrder` / `DigBottomOrder` — CR 702.60a,
   * CR 701.20a, CR 701.20e.
   *
   * The controller announces the order of a revealed pile that goes to the
   * bottom of the library. The order IS the answer: `SelectCards { cards }`,
   * and the engine accepts it only as a permutation of the published pile. The
   * list therefore starts as the engine's own order and only moves those cards;
   * the button exists only when every published card is used once.
   *
   * The other seat sees the pile and gets no button (CR 400.2). A card the wire
   * did not publish is not named.
   */
  import { session } from '#lib/game/session.svelte.ts';

  const prompt = $derived(session.bottomOrderPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const order = $derived(prompt ? session.bottomOrderFor(prompt) : []);
  // Seeding is an effect, not a derivation: writing state inside `$derived` is
  // forbidden in Svelte 5 and would break every scene that mounts this block.
  $effect(() => {
    if (prompt) session.seedBottomOrder(prompt);
  });

  function name(id: number) {
    const object = objects[String(id)];
    if (!object || object.display_visible_to_viewer === false) return 'Una carta que el motor no nombró';
    return object.name ?? 'Una carta sin nombre';
  }

  const title = $derived.by(() => {
    if (!prompt) return '';
    if (prompt.kind === 'ripple') return 'Ordenar el fondo del estruendo';
    if (prompt.kind === 'reveal-until') return 'Ordenar el fondo de lo revelado';
    return 'Ordenar el fondo de lo mirado';
  });
  const rule = $derived.by(() => {
    if (!prompt) return '';
    if (prompt.kind === 'ripple') {
      const n = prompt.rippleCount === null ? '' : ` El estruendo era de ${prompt.rippleCount}.`;
      return `CR 702.60a: las cartas reveladas que no lanzaste van al fondo.${n} Elige el orden: es la respuesta.`;
    }
    if (prompt.kind === 'reveal-until') return 'CR 701.20a: las cartas que no se quedaron van al fondo en el orden que elijas.';
    return 'CR 701.20e: las cartas miradas que no se quedaron van al fondo en el orden que elijas.';
  });
</script>

{#if prompt}
  <div
    class="prompt"
    aria-label={title}
    data-bottom-order
    data-bottom-order-kind={prompt.kind}
    data-bottom-order-count={prompt.cards.length}>
    <strong>{title}</strong>
    <p class="hint" data-bottom-order-rule>{rule}</p>
    {#if !mine}
      <ol class="pile" data-bottom-order-faces>
        {#each prompt.cards as id (id)}
          <li>{name(id)}</li>
        {/each}
      </ol>
      <p class="hint" data-bottom-order-other>
        Este orden lo elige el Jugador {prompt.player + 1}: no es tu decisión (CR 400.2).
      </p>
    {:else}
      <ol class="pile" data-bottom-order-pile>
        {#each order as id, index (id)}
          <li data-bottom-order-row={id}>
            <span class="name">{index + 1}. {name(id)}</span>
            <span class="moves">
              <button
                type="button"
                class="ghost"
                data-bottom-order-earlier={id}
                aria-label={`Antes: ${name(id)}`}
                disabled={session.busy || index === 0}
                onclick={() => session.moveBottomOrder(id, -1)}>
                Antes
              </button>
              <button
                type="button"
                class="ghost"
                data-bottom-order-later={id}
                aria-label={`Después: ${name(id)}`}
                disabled={session.busy || index === order.length - 1}
                onclick={() => session.moveBottomOrder(id, 1)}>
                Después
              </button>
            </span>
          </li>
        {/each}
      </ol>
      <div class="actions">
        <button
          type="button"
          class="primary"
          data-bottom-order-submit
          disabled={session.busy || prompt.cards.length === 0}
          onclick={() => session.submitBottomOrder()}>
          Poner en el fondo en este orden
        </button>
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
  .pile { margin: 0; padding-left: 1.1rem; font-size: .78rem; display: grid; gap: .3rem; }
  .pile li { display: grid; gap: .25rem; }
  .name { font-weight: 600; }
  .moves { display: flex; gap: .3rem; flex-wrap: wrap; }
  .actions { display: flex; gap: .4rem; flex-wrap: wrap; }
  .primary,
  .ghost {
    min-height: 44px;
    padding: .55rem .7rem;
    border-radius: 9px;
    font: inherit;
    font-size: .82rem;
    font-weight: 650;
    cursor: pointer;
  }
  .primary { border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); }
  .ghost { border: 1px solid var(--line); background: var(--surface-3); color: var(--ink); }
  .primary:disabled,
  .ghost:disabled { opacity: .55; cursor: not-allowed; }
  .primary:focus-visible,
  .ghost:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
