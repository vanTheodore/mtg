<script lang="ts">
  /**
   * `WaitingFor::DefilerPayment` — CR 601.2b.
   *
   * A matching Defiler lets the caster pay life to reduce the mana cost of a
   * colored permanent spell. The price is already locked: `life_cost` and
   * `mana_reduction` are the engine's, and `reach` says whether an unmatched
   * unit spills into generic mana (CR 118.7b, the default, omitted on the
   * wire) or is lost (the printed "only the amount of [color] mana you pay").
   * The block prints that quote. It does not re-price the spell.
   *
   * The answer is `DecideOptionalCost { index }`, and the index is not the
   * optional-cost list. The casting dispatch pays only when `index == 0`;
   * index 1 declines and the cast continues at the original cost. Insufficient
   * life is the engine's refusal — this table does not switch the button off.
   *
   * CR 601.2i: cancelling the cast is a real answer. The other seat sees the
   * quote and gets no button (CR 400.2).
   */
  import { session } from '#lib/game/session.svelte.ts';
  import ManaCost from './ManaCost.svelte';

  const prompt = $derived(session.defilerPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const spell = $derived(
    prompt?.spellId != null ? objects[String(prompt.spellId)]?.name ?? `Hechizo ${prompt.spellId}` : ''
  );
  const life = $derived(prompt?.lifeCost ?? null);
  const lifeText = $derived(
    life === null ? null : `${life} ${life === 1 ? 'vida' : 'vidas'}`
  );
  const reach = $derived.by(() => {
    if (!prompt) return '';
    if (prompt.reach === 'colored') {
      return 'CR 118.7b: este descuento sólo reduce el maná de color que publica. Lo que no encuentra no pasa al genérico.';
    }
    if (prompt.reach === 'spill') {
      return 'CR 118.7b: si ese maná no está en el coste, el descuento puede reducir maná genérico. El campo venía omitido o como SpillsToGeneric, que es el valor por defecto; no se asume el límite del ciclo Defiler.';
    }
    return 'El motor publicó un alcance de descuento que esta mesa no lee. No se asume que pase al genérico ni que se pierda.';
  });
</script>

{#if prompt}
  <div
    class="prompt"
    aria-label="Descuento de Defiler"
    data-defiler
    data-defiler-life={life ?? ''}
    data-defiler-reach={prompt.reach}
    data-defiler-spell={prompt.spellId ?? ''}>
    <strong>{spell ? `Descuento de Defiler · ${spell}` : 'Descuento de Defiler'}</strong>
    <p class="hint" data-defiler-rule>
      CR 601.2b: puedes pagar vidas para reducir el coste de maná de este permanente. El motor ya fijó cuántas vidas y cuánto maná.
    </p>
    <p class="hint" data-defiler-price>
      {#if lifeText}
        Vidas que publica el motor: {lifeText}.
      {:else}
        El motor no publica cuántas vidas cuesta este descuento.
      {/if}
      {#if prompt.manaReduction}
        Descuento: <ManaCost cost={prompt.manaReduction} label="Maná que se reduce" />
      {:else}
        El motor no publica el maná que se reduce.
      {/if}
    </p>
    <p class="hint" data-defiler-reach-note>{reach}</p>
    <p class="hint" data-defiler-life-note>
      CR 119.4: si las vidas no alcanzan, lo resuelve el motor y el lanzamiento sigue con el coste original. Esta mesa no apaga el botón.
    </p>
    {#if !mine}
      <p class="hint" data-defiler-other>
        Este descuento lo decide el Jugador {prompt.player + 1}: no es tu decisión. El precio es público (CR 400.2).
      </p>
    {:else}
      <div class="actions">
        <button
          type="button"
          class="primary"
          data-defiler-pay="0"
          disabled={session.busy}
          onclick={() => session.answerDefiler(0)}>
          {lifeText ? `Pagar ${lifeText} y reducir el coste` : 'Pagar las vidas y reducir el coste'}
        </button>
        <button
          type="button"
          class="ghost"
          data-defiler-decline="1"
          disabled={session.busy}
          onclick={() => session.answerDefiler(1)}>
          Seguir con el coste original
        </button>
        <button
          type="button"
          class="ghost"
          data-defiler-cancel
          disabled={session.busy}
          onclick={() => session.cancelDefiler()}>
          Cancelar el lanzamiento
        </button>
      </div>
      <p class="hint" data-defiler-cancel-note>
        Cancelar descarta el lanzamiento: todavía no se ha pagado nada (CR 601.2i).
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
