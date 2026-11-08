<script lang="ts">
  /**
   * The discard prompt — Phase's `modal/DiscardChoice` family, as one block.
   *
   * Three different prompts ask for cards out of a hand and Phase answers all of
   * them with the same action (`SelectCards` with exactly the chosen cards):
   *
   *   - `DiscardToHandSize` / `ConniveDiscard` — cleanup, CR 514.1 (seven cards);
   *   - `DiscardChoice` — a discard effect (Mind Rot, Ravenous Rats), with
   *     `count` and, when the text says "up to", `up_to`;
   *   - `WardDiscardChoice` — ward's discard cost, one card per round-trip.
   *
   * The component never counts a hand and never decides what may be discarded:
   * `session.discardPrompt` publishes the cards and the count, `toggleChoice`
   * collects the answer and `discardReady` says whether the engine will take it.
   * With `up_to` the empty answer is legal, so the same button reads "No
   * descartar" until a card is marked.
   */
  import { session } from '#lib/game/session.svelte.ts';

  const prompt = $derived(session.discardPrompt);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);

  const label = $derived.by(() => {
    if (!prompt) return { title: '', hint: '' };
    const plural = prompt.count === 1 ? '' : 's';
    if (prompt.kind === 'handSize') {
      return {
        title: `Descartar ${prompt.count} carta${plural}`,
        hint: 'Al terminar el turno solo puedes conservar siete cartas. Selecciona las cartas de tu mano que descartas.'
      };
    }
    if (prompt.kind === 'ward') {
      return {
        title: `Descartar 1 carta · coste de protección${prompt.source ? ` de ${prompt.source}` : ''}`,
        hint: 'Phase pide una carta para que el efecto no te alcance. Si no descartas, el hechizo o la habilidad se resuelve igual.'
      };
    }
    return {
      title: prompt.upTo ? `Descartar hasta ${prompt.count} carta${plural}` : `Descartar ${prompt.count} carta${plural}`,
      hint: prompt.upTo
        ? 'Puedes descartar menos, incluso ninguna. La carta marcada en tu mano es la que entregas.'
        : 'Elige exactamente esta cantidad en tu mano. Phase comprobará el descarte al confirmar.'
    };
  });
</script>

{#if prompt && mine}
  <div class="prompt" aria-label={label.title}>
    <strong>{label.title}</strong>
    <p>{label.hint}</p>
    <ul class="draft">
      {#each session.choosing as id (id)}
        <li>{objects[String(id)]?.name ?? `Carta ${id}`}</li>
      {/each}
      {#if !session.choosing.length}<li>Sin cartas elegidas.</li>{/if}
    </ul>
    <button type="button" class="primary" disabled={session.busy || !session.discardReady} onclick={() => session.confirmDiscard()}>
      {prompt.upTo && !session.choosing.length ? 'No descartar' : 'Confirmar descarte'} ({session.choosing.length}/{prompt.count})
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
  p { margin: 0; font-size: .82rem; }
  .draft { margin: .2rem 0; padding-left: 1.1rem; font-size: .82rem; display: grid; gap: .3rem; }
  .primary {
    min-height: 36px;
    padding: .55rem .65rem;
    border: 1px solid var(--accent);
    border-radius: 9px;
    background: var(--accent);
    color: var(--accent-ink);
    font: inherit;
    font-size: .84rem;
    font-weight: 650;
    text-align: left;
    cursor: pointer;
  }
  .primary:disabled { opacity: .55; cursor: not-allowed; }
  .primary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
