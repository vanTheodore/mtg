<script lang="ts">
  /**
   * `WaitingFor::ModalFaceChoice` — CR 712.12 / CR 712.11b.
   *
   * The buttons are the actions the engine already published. A face exists
   * only when `legal.actions` contains that `ChooseModalFace`; cancel exists
   * only when `CancelCast` does. Rebuilding a front/back pair from the card
   * would offer a face the engine had already refused.
   *
   * A land face is played (CR 712.12). A spell face is cast. The other seat
   * sees the faces and gets no button (CR 400.2).
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { modalFaceOffers } from '#lib/game/interaction.ts';
  import ManaCost from './ManaCost.svelte';

  const prompt = $derived(session.modalFacePrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const offers = $derived(modalFaceOffers(session.snapshot?.legal.actions ?? []));
  const object = $derived(prompt?.objectId != null ? objects[String(prompt.objectId)] : undefined);
  const front = $derived({
    name: object?.name ?? '',
    cost: object?.mana_cost,
    types: object?.card_types
  });
  const back = $derived({
    name: object?.back_face?.name ?? 'Cara trasera',
    cost: object?.back_face?.mana_cost,
    types: object?.back_face?.card_types
  });

  function verb(types: { core_types?: string[] } | undefined, name: string) {
    return types?.core_types?.includes('Land') ? `Jugar ${name}` : `Lanzar ${name}`;
  }
  function typeLine(types: { core_types?: string[]; subtypes?: string[] } | undefined) {
    return [...(types?.core_types ?? []), ...(types?.subtypes ?? [])].join(' ');
  }
</script>

{#if prompt}
  <div
    class="prompt"
    aria-label="Elegir una cara"
    data-modal-face
    data-modal-face-payment={prompt.paymentMode}
    data-modal-face-object={prompt.objectId ?? ''}>
    <strong>Elige una cara</strong>
    <p class="hint" data-modal-face-rule>Elige qué cara jugar o lanzar.</p>
    {#if prompt.additionalCost}
      <p class="hint" data-modal-face-cost>
        El motor añade este maná al coste de la cara elegida:
        <ManaCost cost={prompt.additionalCost} label="Coste añadido a la cara" size="small" />
      </p>
    {/if}
    {#if prompt.paymentMode !== 'Auto'}
      <p class="hint" data-modal-face-mode>El pago que sigue es el que publicó el motor: {prompt.paymentMode}.</p>
    {/if}
    {#if !mine}
      <p class="hint" data-modal-face-faces>
        {front.name ? verb(front.types, front.name) : 'Cara frontal'} · {verb(back.types, back.name)}
      </p>
      <p class="hint" data-modal-face-other>
        Esta cara la elige el Jugador {prompt.player + 1}: no es tu decisión (CR 400.2).
      </p>
    {:else}
      <div class="actions">
        {#if offers.front}
          <button
            type="button"
            class="primary"
            data-modal-face-front="false"
            disabled={session.busy}
            onclick={() => session.answerModalFace(offers.front!)}>
            <span>{verb(front.types, front.name || 'cara frontal')}</span>
            {#if front.cost}<ManaCost cost={front.cost} label="Coste de la cara frontal" size="small" />{/if}
            {#if typeLine(front.types)}<span class="type">{typeLine(front.types)} · Frontal</span>{:else}<span class="type">Frontal</span>{/if}
          </button>
        {/if}
        {#if offers.back}
          <button
            type="button"
            class="primary"
            data-modal-face-back="true"
            disabled={session.busy}
            onclick={() => session.answerModalFace(offers.back!)}>
            <span>{verb(back.types, back.name)}</span>
            {#if back.cost}<ManaCost cost={back.cost} label="Coste de la cara trasera" size="small" />{/if}
            {#if typeLine(back.types)}<span class="type">{typeLine(back.types)} · Trasera</span>{:else}<span class="type">Trasera</span>{/if}
          </button>
        {/if}
        {#if offers.cancel}
          <button
            type="button"
            class="ghost"
            data-modal-face-cancel
            disabled={session.busy}
            onclick={() => session.cancelModalFace()}>
            Cancelar
          </button>
        {/if}
      </div>
      {#if !offers.front && !offers.back}
        <p class="hint" data-modal-face-none>El motor no publicó ninguna cara que se pueda elegir desde aquí.</p>
      {/if}
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
  .actions { display: grid; gap: .4rem; }
  .primary, .ghost {
    display: grid;
    gap: .15rem;
    justify-items: start;
    min-height: 44px;
    padding: .55rem .7rem;
    border-radius: 9px;
    font: inherit;
    font-size: .82rem;
    font-weight: 650;
    cursor: pointer;
    text-align: left;
  }
  .primary { border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); }
  .ghost { border: 1px solid var(--line); background: var(--surface-3); color: var(--ink); }
  .type { font-size: .72rem; font-weight: 650; color: var(--accent-ink); }
  .primary:disabled, .ghost:disabled { opacity: .55; cursor: not-allowed; }
  .primary:focus-visible, .ghost:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
