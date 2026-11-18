<script lang="ts">
  /**
   * `WaitingFor::CastOffer` — CR 608.2g. Nine shapes, one question: a spell or
   * ability is resolving and the engine offers a cast it would not offer at
   * priority. The block keeps one frame and changes its words, because the
   * question is the same and the consequences of saying no are not.
   *
   * The shapes matter on the decline, which is where they differ most:
   *
   *   - `Miracle` (CR 702.94a) leaves the card in hand; `Madness` (CR 702.35a)
   *     sends it to the graveyard, which is the trade madness offers.
   *   - `Cascade` (CR 702.85a) and `Ripple` (CR 702.60a) put the hit and every
   *     miss on the library bottom; `Discover` (CR 701.57a) keeps the hit in hand.
   *   - `GraveyardPaidCast` (CR 609.4b) offers the card at its real cost and
   *     leaves it in the graveyard on decline.
   *   - `FreeCastWindow` (CR 608.2c) has no single card: a list of candidates, an
   *     optional cast bound and an optional mana-value budget, and closing it is
   *     the way to say no.
   *   - `Adventure` (CR 715.3a) is not a yes/no at all: the engine publishes a
   *     face, so the block offers the two faces and no decline.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { manaText } from '#lib/game/cards.ts';

  const prompt = $derived(session.castOfferPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const nameOf = (id: number) => objects[String(id)]?.name ?? `Carta ${id}`;
  const card = $derived(prompt && prompt.objectId !== null ? objects[String(prompt.objectId)] : undefined);
  const cardName = $derived(card?.name ?? 'La carta ofrecida');
  function costText(cost: unknown) {
    const text = manaText(cost);
    return text && text !== 'NoCost' ? text : '';
  }
  const cost = $derived(costText(prompt?.cost));
  const extra = $derived(costText(prompt?.additionalCost));

  const rule = $derived.by(() => {
    if (!prompt) return '';
    switch (prompt.shape) {
      case 'adventure':
        return 'Esta carta tiene dos caras: puedes lanzar la criatura o su mitad de aventura (CR 715.3a).';
      case 'miracle':
        return 'La revelaste al robarla, y su habilidad de milagro te deja lanzarla por su coste de milagro en vez de su coste normal (CR 702.94a).';
      case 'madness':
        return 'La descartaste y la exiliaste, y la habilidad de locura te deja lanzarla por su coste de locura (CR 702.35a).';
      case 'paradigm':
        return 'El motor ofrece lanzar una copia de un hechizo exiliado con paradigma, de una en una.';
      case 'cascade':
        return 'Cascada: puedes lanzarla sin pagar su coste, y sólo si su valor de maná acaba por debajo del hechizo que la provocó (CR 702.85a).';
      case 'discover':
        return 'Descubrir: puedes lanzarla sin pagar su coste, si su valor de maná no supera el valor descubierto (CR 701.57a).';
      case 'ripple':
        return 'Ola: es una de las cartas reveladas del mismo nombre, así que puedes lanzarla sin pagar su coste (CR 702.60a).';
      case 'freeWindow':
        return 'Una ventana de lanzamiento gratuito: eliges qué lanzar, una carta por vez, y cerrarla termina la ventana (CR 608.2g).';
      case 'graveyardPaid':
        return 'Puedes lanzarla desde el cementerio pagando su coste real: no es un lanzamiento gratis (CR 609.4b).';
    }
    return '';
  });

  const decline = $derived.by(() => {
    if (!prompt) return { label: '', hint: '' };
    switch (prompt.shape) {
      case 'miracle':
        return { label: 'Dejarla en la mano', hint: 'Si no la lanzas, el disparo de milagro se gasta y la carta sigue en tu mano.' };
      case 'madness':
        return { label: 'Mandarla al cementerio', hint: 'Si no la lanzas, la carta va al cementerio de su dueño: eso es lo que locura cambia (CR 702.35a).' };
      case 'cascade': {
        const total = prompt.misses.length + 1;
        return {
          label: 'Al fondo de la biblioteca',
          hint: `Al declinar, ${cardName} y las ${prompt.misses.length} cartas exiliadas van al fondo en orden aleatorio: ${total} en total (CR 702.85a).`
        };
      }
      case 'discover':
        return {
          label: 'A la mano',
          hint: `Al declinar, ${cardName} va a tu mano y las ${prompt.misses.length} cartas exiliadas al fondo de la biblioteca (CR 701.57a).`
        };
      case 'ripple':
        return {
          label: 'Al fondo de la biblioteca',
          hint: `Al declinar, ${cardName}, las copias pendientes y las ${prompt.misses.length} cartas falladas van al fondo de la biblioteca (CR 702.60a).`
        };
      case 'freeWindow':
        return { label: 'Terminar la ventana', hint: 'Cerrar la ventana no lanza nada más y devuelve la prioridad.' };
      case 'paradigm':
        return { label: 'Pasar', hint: 'Pasar deja la oferta sin usar: no se lanza ninguna copia.' };
      case 'graveyardPaid':
        return { label: 'Dejarla en el cementerio', hint: 'Si no la lanzas, la carta se queda donde está y la resolución sigue (CR 609.4b).' };
      case 'adventure':
        return { label: '', hint: '' };
    }
    return { label: '', hint: '' };
  });

  const budget = $derived.by(() => {
    if (!prompt || prompt.shape !== 'freeWindow') return '';
    const casts = prompt.remainingCasts === null
      ? 'sin límite de lanzamientos'
      : prompt.remainingCasts === 1 ? 'queda 1 lanzamiento' : `quedan ${prompt.remainingCasts} lanzamientos`;
    const mv = prompt.mvBudget === null
      ? 'sin tope de valor de maná'
      : `${prompt.mvBudget} de valor de maná disponible${prompt.mvBudget === 1 ? '' : 's'}`;
    return `${casts.charAt(0).toUpperCase()}${casts.slice(1)} · ${mv}.`;
  });
</script>

{#if prompt && mine}
  <div class="prompt" aria-label="Lanzar durante la resolución" data-cast-offer data-cast-shape={prompt.shape}>
    <strong data-cast-subject>
      {#if prompt.shape === 'paradigm'}
        Lanzar una copia
      {:else if prompt.shape === 'freeWindow'}
        Ventana de lanzamiento gratuito
      {:else}
        {cardName}
      {/if}
    </strong>
    <p class="hint" data-cast-rule>{rule}</p>

    {#if cost}
      <p class="hint" data-cast-cost>
        {prompt.shape === 'miracle' ? 'Coste de milagro' : prompt.shape === 'madness' ? 'Coste de locura' : 'Coste'}: {cost}
        {#if extra} · más {extra} adicional{/if}
      </p>
    {:else if extra}
      <p class="hint" data-cast-cost>Coste adicional: {extra}</p>
    {/if}

    {#if prompt.shape === 'graveyardPaid' && prompt.anyMana}
      <p class="hint" data-cast-any-mana>
        La concesión de CR 609.4b se aplica: cualquier tipo de maná puede pagarla.
      </p>
    {/if}

    {#if prompt.shape === 'cascade' && prompt.sourceMv !== null}
      <p class="hint" data-cast-gate>El hechizo que la provoca tiene valor de maná {prompt.sourceMv}.</p>
    {/if}
    {#if prompt.shape === 'discover' && prompt.discoverValue !== null}
      <p class="hint" data-cast-gate>Descubrir {prompt.discoverValue}: su valor de maná no puede superarlo.</p>
    {/if}
    {#if prompt.shape === 'ripple' && prompt.remainingHits.length}
      <p class="hint" data-cast-remaining>
        Quedan {prompt.remainingHits.length} {prompt.remainingHits.length === 1 ? 'copia' : 'copias'} del mismo
        nombre por ofrecer después.
      </p>
    {/if}

    {#if prompt.shape === 'freeWindow'}
      <p class="hint" data-cast-budget>{budget}</p>
      {#if prompt.candidates.length}
        <ul class="rows">
          {#each prompt.candidates as id (id)}
            <li>
              <button
                type="button"
                class="row"
                data-cast-candidate={id}
                disabled={session.busy}
                onclick={() => session.castFreeCandidate(id)}>
                Lanzar {nameOf(id)} sin pagar
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="hint">La ventana no tiene candidatas que quepan en su presupuesto.</p>
      {/if}
    {:else if prompt.shape === 'paradigm'}
      {#if prompt.candidates.length}
        <ul class="rows">
          {#each prompt.candidates as id (id)}
            <li>
              <button
                type="button"
                class="row"
                data-cast-candidate={id}
                disabled={session.busy}
                onclick={() => session.castParadigmCopy(id)}>
                Lanzar la copia de {nameOf(id)}
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="hint">Phase no publica fuentes de paradigma que lanzar.</p>
      {/if}
    {/if}

    {#if prompt.shape === 'adventure'}
      <div class="row">
        <button type="button" class="primary" data-cast-accept disabled={session.busy} onclick={() => session.chooseAdventureFace(true)}>
          Lanzar la criatura
        </button>
        <button type="button" class="ghost" data-cast-face-adventure disabled={session.busy} onclick={() => session.chooseAdventureFace(false)}>
          Lanzar la aventura
        </button>
      </div>
    {:else if prompt.shape === 'miracle' || prompt.shape === 'madness'}
      <div class="row">
        <button type="button" class="primary" data-cast-accept disabled={session.busy} onclick={() => session.castOfferedCard()}>
          Lanzarla{cost ? ` por ${cost}` : ''}
        </button>
        <button type="button" class="ghost" data-cast-decline disabled={session.busy} onclick={() => session.declineMiracle()}>
          {decline.label}
        </button>
      </div>
    {:else if prompt.shape === 'paradigm'}
      <div class="row">
        <button type="button" class="ghost" data-cast-decline disabled={session.busy} onclick={() => session.passParadigmOffer()}>
          {decline.label}
        </button>
      </div>
    {:else if prompt.shape === 'freeWindow'}
      <div class="row">
        <button type="button" class="ghost" data-cast-decline disabled={session.busy} onclick={() => session.finishFreeCastWindow()}>
          {decline.label}
        </button>
      </div>
    {:else}
      <div class="row">
        <button type="button" class="primary" data-cast-accept disabled={session.busy} onclick={() => session.answerCastOffer(true)}>
          {prompt.shape === 'graveyardPaid' ? 'Lanzarla pagando su coste' : 'Lanzarla sin pagar'}
        </button>
        <button type="button" class="ghost" data-cast-decline disabled={session.busy} onclick={() => session.answerCastOffer(false)}>
          {decline.label}
        </button>
      </div>
    {/if}

    {#if decline.hint}
      <p class="hint" data-cast-decline-hint>{decline.hint}</p>
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
  .row { display: flex; gap: .4rem; flex-wrap: wrap; }
  .rows { margin: 0; padding: 0; list-style: none; display: grid; gap: .3rem; }
  .row button,
  .rows button {
    min-height: 44px;
    padding: .55rem .7rem;
    border-radius: 9px;
    font: inherit;
    font-size: .84rem;
    font-weight: 650;
    cursor: pointer;
  }
  .row .primary { flex: 1; border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); }
  .row .ghost { border: 1px solid var(--line); background: var(--surface-3); color: var(--ink); }
  .rows button {
    width: 100%;
    border: 1px solid var(--line);
    background: var(--surface-3);
    color: var(--ink);
    text-align: left;
  }
  button:disabled { opacity: .55; cursor: not-allowed; }
  button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
