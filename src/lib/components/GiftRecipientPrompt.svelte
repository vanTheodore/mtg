<script lang="ts">
  /**
   * `WaitingFor::ChooseGiftRecipient` — CR 601.2 + CR 115.10a.
   *
   * While casting, the caster chooses one opponent. `purpose` says why: the
   * promised gift's recipient (CR 702.174a; an absent purpose is Gift) or the
   * opponent an effect-as-cost acts on (CR 601.2h). Each button is the
   * published `ChooseGiftRecipient`. Candidate order is the engine's; this
   * table does not re-sort it. `CancelCast` exists only when it is legal.
   *
   * The other seat sees the candidates and gets no button (CR 400.2).
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { giftRecipientOffers, type GiftKindName } from '#lib/game/interaction.ts';

  const prompt = $derived(session.giftRecipientPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const offers = $derived(giftRecipientOffers(session.snapshot?.legal.actions ?? []));
  const spell = $derived.by(() => {
    const id = prompt?.spellId;
    if (id == null || id === 0) return '';
    const object = objects[String(id)];
    if (!object || object.display_visible_to_viewer === false) return '';
    return object.name ?? '';
  });

  const GIFT_ES: Record<GiftKindName, string> = {
    card: 'una carta: el oponente elegido roba una carta',
    treasure: 'una ficha de Tesoro',
    food: 'una ficha de Comida',
    'tapped-fish': 'una ficha de Pez 1/1 azul girada',
    'extra-turn': 'un turno extra después de este',
    unknown: 'un regalo que esta mesa no sabe nombrar'
  };

  const title = $derived(
    prompt?.purpose === 'effect-cost' ? 'Elegir a quién afecta el coste' : 'Elegir destinatario del regalo'
  );
  const giftLine = $derived(
    prompt?.purpose === 'gift' && prompt.giftKind
      ? `El regalo prometido es ${GIFT_ES[prompt.giftKind] ?? 'un regalo'}.`
      : ''
  );
  const costLine = $derived.by(() => {
    if (prompt?.purpose !== 'effect-cost') return '';
    if (prompt.lifeGain === null) return 'El coste actúa sobre el oponente elegido. Esta mesa no nombra la cantidad.';
    const noun = prompt.lifeGain === 1 ? 'vida' : 'vidas';
    return `El oponente elegido gana ${prompt.lifeGain} ${noun}.`;
  });

  function seat(id: number) {
    return `Jugador ${id + 1}`;
  }
</script>

{#if prompt}
  <div
    class="prompt"
    aria-label={title}
    data-gift-recipient
    data-gift-recipient-purpose={prompt.purpose}
    data-gift-recipient-count={prompt.candidates.length}>
    <strong>{title}</strong>
    {#if spell}<p class="spell" data-gift-recipient-spell>{spell}</p>{/if}
    <p class="hint" data-gift-recipient-rule>
      CR 115.10a: eliges un oponente de los que publicó el motor. El orden es el del cable: no se reordena.
    </p>
    {#if giftLine}<p class="hint" data-gift-recipient-gift>{giftLine}</p>{/if}
    {#if prompt.purpose === 'unknown'}
      <p class="hint" data-gift-recipient-unknown>El motor no dijo para qué se elige este oponente.</p>
    {/if}
    {#if costLine}<p class="hint" data-gift-recipient-cost>{costLine}</p>{/if}
    {#if !mine}
      <ul class="faces" data-gift-recipient-faces>
        {#each prompt.candidates as id (id)}
          <li>{seat(id)}</li>
        {/each}
      </ul>
      <p class="hint" data-gift-recipient-other>
        Este oponente lo elige el Jugador {prompt.player + 1}: no es tu decisión (CR 400.2).
      </p>
    {:else}
      <div class="actions">
        {#each prompt.candidates as id (id)}
          {@const action = offers.byOpponent.get(id)}
          {#if action}
            <button
              type="button"
              class="primary"
              data-gift-recipient-option={id}
              disabled={session.busy}
              onclick={() => session.answerGiftRecipient(action)}>
              {seat(id)}
            </button>
          {/if}
        {/each}
        {#if offers.cancel}
          <button
            type="button"
            class="ghost"
            data-gift-recipient-cancel
            disabled={session.busy}
            onclick={() => session.cancelGiftRecipient()}>
            Cancelar lanzamiento
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
  .spell { margin: 0; font-size: .82rem; font-weight: 650; }
  .hint { margin: 0; font-size: .78rem; color: var(--ink-2); }
  .faces { margin: 0; padding-left: 1.1rem; font-size: .78rem; }
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
