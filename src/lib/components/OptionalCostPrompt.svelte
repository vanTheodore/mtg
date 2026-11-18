<script lang="ts">
  /**
   * `WaitingFor::OptionalCostChoice` — CR 601.2b + CR 601.2h.
   *
   * The caster is announcing an additional cost. The answer is one index,
   * `DecideOptionalCost { index }`, and the index means what the engine's
   * option list says:
   *
   *   - Optional / Kicker: 0 pays the one live cost, 1 declines it. A kicker
   *     window publishes that live cost only; a sibling kicker is another
   *     window, not a second button here.
   *   - Choice: one button per published alternative, no decline. The caster
   *     must pay exactly one. An unnamed cost is still a button — dropping it
   *     would renumber the rest.
   *   - Required is not prompted. If it arrives, the only payment is index 0.
   *
   * `origin` is how the block knows to say "regalo" without reading the card.
   * Gift's published cost is a zero-mana sentinel, not a mana payment, so the
   * buttons say promise / don't. `times_kicked` and `repeatable` are the
   * engine's; the block does not count payments itself.
   *
   * CR 601.2i: cancelling the cast is a real answer. Nothing has been paid.
   * The other seat sees the offer and gets no button (CR 400.2).
   */
  import { session } from '#lib/game/session.svelte.ts';
  import ManaCost from './ManaCost.svelte';

  const prompt = $derived(session.optionalCostPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const spell = $derived(
    prompt?.spellId != null ? objects[String(prompt.spellId)]?.name ?? `Hechizo ${prompt.spellId}` : ''
  );
  const pay = $derived(prompt?.options.find((option) => option.kind === 'pay') ?? null);
  const decline = $derived(prompt?.options.find((option) => option.kind === 'decline') ?? null);
  const choice = $derived(prompt?.shape === 'choice');
  const gift = $derived(prompt?.origin === 'gift');

  const ORIGIN_TITLE: Record<string, string> = {
    kicker: 'Potenciar',
    casualty: 'Baja',
    offspring: 'Progenie',
    squad: 'Escuadrón',
    replicate: 'Replicar',
    bargain: 'Regatear',
    teamwork: 'Trabajo en equipo',
    gift: 'Regalo',
    other: 'Coste adicional',
    unknown: 'Coste adicional'
  };
  const title = $derived.by(() => {
    if (!prompt) return '';
    if (prompt.shape === 'choice') return prompt.alternativeOffered ? 'Coste alternativo' : 'Elige un coste';
    if (prompt.shape === 'required') return 'Coste obligatorio';
    if (prompt.shape === 'unknown') return 'Coste adicional';
    return ORIGIN_TITLE[prompt.origin] ?? 'Coste adicional';
  });
  const rule = $derived.by(() => {
    if (!prompt) return '';
    if (prompt.shape === 'unknown') {
      return 'CR 601.2b: el motor publicó un coste adicional que esta mesa no lee. No se inventa un botón de pago.';
    }
    if (prompt.shape === 'required') {
      return 'CR 601.2b: el motor publicó un coste obligatorio. Normalmente no pregunta esto; la única respuesta de pago es el índice 0.';
    }
    if (prompt.shape === 'choice' && prompt.alternativeOffered) {
      return 'CR 118.9: la primera opción es el coste alternativo que el motor ofrece ahora. Cualquier otra lo rechaza, y el motor puede ofrecer el siguiente si queda alguno.';
    }
    if (prompt.shape === 'choice') {
      return 'CR 601.2b: hay que pagar exactamente una. No se pueden rechazar todas; cancelar el lanzamiento es la otra salida (CR 601.2i).';
    }
    if (prompt.origin === 'gift') {
      return 'CR 702.174a: puedes prometer un regalo al lanzar este hechizo. Si lo prometes, el motor asigna al oponente, y pregunta cuál si hay más de uno elegible.';
    }
    if (prompt.origin === 'kicker') {
      return 'CR 702.33a: potenciar (kicker) es un coste adicional opcional. Pagar anuncia este coste; no pagar sigue el lanzamiento sin él.';
    }
    if (prompt.origin === 'casualty') {
      return 'CR 702.153a: baja (casualty) es un coste adicional opcional. Si lo pagas, copias el hechizo.';
    }
    if (prompt.origin === 'offspring') {
      return 'CR 702.175a: progenie (offspring) es un coste adicional opcional. Si lo pagas, al entrar se crea una ficha copia 1/1.';
    }
    if (prompt.origin === 'squad') {
      return 'CR 702.157a: escuadrón (squad) es un coste adicional que puedes pagar más de una vez. Al entrar, una ficha copia por cada pago.';
    }
    if (prompt.origin === 'replicate') {
      return 'CR 702.56a: replicar es un coste adicional que puedes pagar más de una vez. Al lanzarlo, una copia por cada pago.';
    }
    if (prompt.origin === 'bargain') {
      return 'CR 702.166a: regatear (bargain) es un coste adicional opcional. El coste publicado es el que se paga, no una lectura de la carta.';
    }
    if (prompt.origin === 'teamwork') {
      return 'CR 702.194a: trabajo en equipo es un coste adicional opcional. El coste publicado dice cuánta fuerza hay que girar.';
    }
    if (prompt.origin === 'unknown') {
      return 'CR 601.2b: el motor ofrece este coste adicional. El origen publicado no es uno que esta mesa nombre.';
    }
    return 'CR 601.2b: el motor ofrece este coste adicional. Pagarlo o no es la decisión; el coste es el que publica, no uno que esta mesa calcule.';
  });
  const again = $derived.by(() => {
    if (!prompt?.repeatable || choice) return '';
    if (prompt.origin === 'kicker') {
      return 'CR 702.33c: puedes pagarlo cualquier número de veces. Si pagas, el motor vuelve a preguntar; si no pagas, no se potencia más.';
    }
    return 'Si pagas, el motor vuelve a preguntar; si no pagas, no hay más pagos de este coste.';
  });
  const GIFT_ES: Record<string, string> = {
    card: 'una carta: el oponente elegido roba una carta',
    treasure: 'una ficha de Tesoro',
    food: 'una ficha de Comida',
    'tapped-fish': 'una ficha de Pez 1/1 azul girada',
    'extra-turn': 'un turno extra después de este',
    unknown: 'un regalo que esta mesa no sabe nombrar'
  };
  const giftLine = $derived(
    gift && prompt?.giftKind ? `El regalo prometido es ${GIFT_ES[prompt.giftKind] ?? 'un regalo'}.` : ''
  );
  const kicked = $derived(
    prompt && prompt.timesKicked > 0
      ? `Ya pagado ${prompt.timesKicked} ${prompt.timesKicked === 1 ? 'vez' : 'veces'}.`
      : ''
  );
  function optionText(label: string | null, index: number): string {
    return label ?? `Opción ${index + 1} · la mesa no nombra este coste`;
  }
  function payText(label: string | null): string {
    if (gift) return label && label !== '{0}' ? `Prometer el regalo y pagar ${label}` : 'Prometer el regalo';
    if (!label) return 'Pagar el coste';
    return label === '{0}' ? 'Pagar {0}' : `Pagar ${label}`;
  }
</script>

{#if prompt}
  <div
    class="prompt"
    aria-label={title}
    data-optional-cost
    data-optional-cost-shape={prompt.shape}
    data-optional-cost-origin={prompt.origin}
    data-optional-cost-repeatable={prompt.repeatable ? 'true' : 'false'}
    data-optional-cost-kicked={prompt.timesKicked}
    data-optional-cost-options={prompt.options.length}
    data-optional-cost-gift={prompt.giftKind ?? ''}
    data-optional-cost-alternative={prompt.alternativeOffered ? 'true' : 'false'}
    data-optional-cost-spell={prompt.spellId ?? ''}>
    <strong>{spell ? `${title} · ${spell}` : title}</strong>
    <p class="hint" data-optional-cost-rule>{rule}</p>
    {#if giftLine}<p class="hint" data-optional-cost-gift-kind>{giftLine}</p>{/if}
    {#if kicked}<p class="hint" data-optional-cost-times>{kicked}</p>{/if}
    {#if again}<p class="hint" data-optional-cost-again>{again}</p>{/if}
    {#if !choice && pay}
      <p class="hint" data-optional-cost-live>
        {#if pay.label === '{0}'}
          Coste que publica el motor: {'{0}'}.
        {:else if pay.mana}
          Coste que publica el motor: <ManaCost cost={pay.mana} label="Coste adicional" />
        {:else if pay.label}
          Coste que publica el motor: {pay.label}.
        {:else}
          El motor no publica un coste que esta mesa sepa nombrar. El índice 0 lo paga igual.
        {/if}
      </p>
    {/if}
    {#if !choice && pay && !pay.label}
      <p class="hint" data-optional-cost-unnamed>
        La mesa no puede describir este coste con palabras; el motor sí comprueba si puedes pagarlo.
      </p>
    {/if}
    {#if !mine}
      <p class="hint" data-optional-cost-other>
        Este coste lo decide el Jugador {prompt.player + 1}: no es tu decisión. El hechizo y el coste son públicos (CR 400.2).
      </p>
    {:else}
      <div class="actions">
        {#if choice}
          {#each prompt.options as option (option.index)}
            <button
              type="button"
              class="primary"
              data-optional-cost-option={option.index}
              disabled={session.busy}
              onclick={() => session.answerOptionalCost(option.index)}>
              {#if option.mana && option.label && option.label !== '{0}'}
                <ManaCost cost={option.mana} label={option.label} size="small" />
              {:else}
                {optionText(option.label, option.index)}
              {/if}
            </button>
          {/each}
        {:else if pay}
          <button
            type="button"
            class="primary"
            data-optional-cost-pay={pay.index}
            disabled={session.busy}
            onclick={() => session.answerOptionalCost(pay.index)}>
            {payText(pay.label)}
          </button>
          {#if decline}
            <button
              type="button"
              class="ghost"
              data-optional-cost-decline={decline.index}
              disabled={session.busy}
              onclick={() => session.answerOptionalCost(decline.index)}>
              {gift ? 'No prometer' : 'No pagar'}
            </button>
          {/if}
        {/if}
        <button
          type="button"
          class="ghost"
          data-optional-cost-cancel
          disabled={session.busy}
          onclick={() => session.cancelOptionalCost()}>
          Cancelar el lanzamiento
        </button>
      </div>
      <p class="hint" data-optional-cost-cancel-note>
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
