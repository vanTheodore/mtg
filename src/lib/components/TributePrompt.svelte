<script lang="ts">
  /**
   * `WaitingFor::TributeChoice` — CR 702.104a. A Tribute creature enters and an
   * **opponent** decides whether to put the counters on it.
   *
   * The engine answers it with the same `DecideOptionalEffect` as "you may", but
   * this is not the controller's question: paying the tribute makes the creature
   * bigger, and declining is what turns on the card's "if tribute wasn't paid"
   * ability (CR 702.104b). The block says both, because the two answers leave the
   * game in different places.
   */
  import { session } from '#lib/game/session.svelte.ts';

  const prompt = $derived(session.tributePrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const source = $derived(prompt ? objects[String(prompt.sourceId)]?.name : undefined);
  const counters = $derived(prompt ? `${prompt.count} ${prompt.count === 1 ? 'contador' : 'contadores'} +1/+1` : '');
</script>

{#if prompt && mine}
  <div class="prompt" aria-label="Tributo" data-tribute>
    <strong>Tributo{source ? ` · ${source}` : ''}</strong>
    <p class="hint">
      {source ?? 'La criatura'} entra con tributo: un oponente suyo decide si se
      paga. El controlador no elige, y aquí decides tú.
    </p>
    {#if prompt.count > 0}
      <p class="hint" data-tribute-count>Pagar el tributo es poner {counters} sobre {source ?? 'la criatura'}.</p>
    {:else}
      <p class="hint">Phase no publica cuántos contadores vale este tributo.</p>
    {/if}
    <div class="row">
      <button
        type="button"
        class="primary"
        disabled={session.busy || prompt.count === 0}
        onclick={() => session.decideTribute(true)}>
        Pagar el tributo{source ? `: ${counters}` : ''}
      </button>
      <button
        type="button"
        class="ghost"
        disabled={session.busy}
        onclick={() => session.decideTribute(false)}>
        No pagar
      </button>
    </div>
    <p class="hint" data-tribute-decline-hint>
      Si no se paga, cuenta como no pagado: se dispara lo que la carta diga para
      ese caso (CR 702.104b).
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
  .row { display: flex; gap: .4rem; flex-wrap: wrap; }
  .primary,
  .ghost {
    min-height: 44px;
    padding: .55rem .7rem;
    border-radius: 9px;
    font: inherit;
    font-size: .84rem;
    font-weight: 650;
    cursor: pointer;
  }
  .primary { flex: 1; border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); }
  .primary:disabled, .ghost:disabled { opacity: .55; cursor: not-allowed; }
  .ghost { border: 1px solid var(--line); background: var(--surface-3); color: var(--ink); }
  .primary:focus-visible, .ghost:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
