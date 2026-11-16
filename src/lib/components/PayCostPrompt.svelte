<script lang="ts">
  /**
   * `WaitingFor::PayCost` — CR 118.3 + CR 601.2b + CR 601.2h. A cost paid by
   * **choosing objects**: one window, one answer (`SelectCards { cards }`), and a
   * dozen meanings that the `kind` tag keeps apart. The engine already filtered the
   * candidates and published the cardinality contract, so this block shows the kind,
   * the numbers and the objects — and adds nothing.
   *
   * Two things it must not fake:
   *
   *   - **The count contract.** `count` is the ceiling and `min_count` the floor;
   *     when they are equal the cost is «exactly N» and the confirm is dead until N
   *     are picked. When the floor is lower, fewer are legal (the empty answer
   *     included) and the button says so.
   *   - **The redaction (CR 400.2).** A viewer without private access receives
   *     placeholders (`0`) or no list at all for `Reveal`/`Discard`. A `0` is not a
   *     card: those rows read «carta oculta» and cannot be clicked, and if the whole
   *     list vanished the block says the candidates are not shown to this seat
   *     instead of claiming there are none.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { distinctTargetLabels, objectTarget } from '#lib/game/interaction.ts';
  import type { PayCostKindName } from '#lib/game/interaction.ts';

  const prompt = $derived(session.payCostPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const labels = $derived(
    distinctTargetLabels((prompt?.choices ?? []).map((id) => objectTarget(id)), objects)
  );
  const nameOf = (id: number) => {
    const index = (prompt?.choices ?? []).indexOf(id);
    return (index >= 0 ? labels[index] : undefined) ?? objects[String(id)]?.name ?? `Objeto ${id}`;
  };
  const picked = $derived(session.payCostPick);

  const TITLES: Record<PayCostKindName, string> = {
    discard: 'Descartar como coste',
    reveal: 'Revelar como coste',
    sacrifice: 'Sacrificar como coste',
    'return-to-hand': 'Devolver a la mano como coste',
    'exile-from-zone': 'Exiliar como coste',
    'exile-materials': 'Exiliar materiales',
    'exile-permanent': 'Exiliar un permanente como coste',
    'exile-from-mana-zone': 'Exiliar como coste de habilidad de maná',
    unattach: 'Desacoplar como coste',
    'remove-counter': 'Quitar contadores como coste',
    'tap-creatures': 'Girar criaturas como coste',
    behold: 'Contemplar como coste',
    'exile-aggregate': 'Exiliar por agregado como coste',
    unknown: 'Pagar un coste'
  };
  const RULES: Record<PayCostKindName, string> = {
    discard: 'CR 118.3 + CR 601.2b: la carta va de la mano al cementerio como parte del coste, no como efecto.',
    reveal: 'CR 701.20a: revelar no mueve la carta; se queda en la mano y el motor la recuerda como el objeto que pagó el coste (CR 608.2k).',
    sacrifice: 'CR 701.21a: el permanente va al cementerio como coste, así que sus disparos de muerte sí se disparan.',
    'return-to-hand': 'CR 118.3: el objeto vuelve a la mano como parte del coste, antes de que nada se resuelva.',
    'exile-from-zone': 'CR 701.13: exiliar no es sacrificar; no hay disparos de muerte por este pago.',
    'exile-materials': 'CR 702.167a: los materiales del oficio salen del campo de batalla o del cementerio, y el motor ya validó la unión.',
    'exile-permanent': 'CR 601.2h + CR 701.13: se exilia un permanente que controlas; es exilio, no sacrificio, así que no hay disparos de muerte.',
    'exile-from-mana-zone': 'CR 118.3 + CR 605.3b: el coste pertenece a una habilidad de maná, así que se paga antes de producir el maná.',
    unattach: 'CR 701.3d: el permanente se desacopla del anfitrión pero se queda en el campo de batalla.',
    'remove-counter': 'CR 122.1: los contadores se quitan como coste; el objeto no cambia de zona.',
    'tap-creatures': 'CR 118.6: girar es el coste, y girar una criatura ya girada no vuelve a pagarlo.',
    behold: 'CR 701.31a: contemplar es elegir un permanente del tipo pedido o revelar una carta del mismo tipo.',
    'exile-aggregate': 'CR 118.3: exilias cualquier número de las cartas publicadas hasta que la suma cumpla el umbral.',
    unknown: 'CR 118.3: el motor pide objetos para pagar un coste que esta versión de la mesa no sabe nombrar.'
  };
  const RESUMES: Record<string, string> = {
    spell: 'Se paga al lanzar el hechizo.',
    'spell-cost': 'Es un componente más del coste del hechizo.',
    'mana-ability': 'Se paga dentro de una habilidad de maná.',
    resolution: 'Se paga al resolver un efecto.',
    'team-tap': 'Es un pago por equipo: cada compañero aporta su parte.',
    'turn-face-up': 'Se paga al voltear la carta boca arriba.',
    unknown: 'El motor no publica a qué tubería vuelve el pago.'
  };
  const ZONES: Record<string, string> = {
    Hand: 'la mano',
    Graveyard: 'el cementerio',
    Library: 'la biblioteca',
    Battlefield: 'el campo de batalla',
    Exile: 'el exilio',
    Stack: 'la pila',
    Command: 'la zona de mando'
  };
  const SHARED: Record<string, string> = {
    Name: 'el nombre',
    ManaValue: 'el valor de maná',
    Power: 'la fuerza',
    Toughness: 'la resistencia',
    TotalPowerToughness: 'la fuerza y la resistencia sumadas',
    CreatureType: 'el tipo de criatura',
    Color: 'el color',
    CardType: 'el tipo de carta',
    LandType: 'el tipo de tierra',
    PermanentType: 'el tipo de permanente'
  };

  const title = $derived(TITLES[prompt?.kind ?? 'unknown']);
  const rule = $derived(RULES[prompt?.kind ?? 'unknown']);
  const contract = $derived.by(() => {
    if (!prompt) return '';
    if (prompt.tapAggregate) {
      return `Gira las criaturas que quieras hasta sumar fuerza ${prompt.tapAggregate.symbol} ${prompt.tapAggregate.value} (CR 208.1).`;
    }
    if (prompt.exileAggregate) {
      const { property, function: fn, comparator, value } = prompt.exileAggregate;
      return `Elige cualquier número de cartas hasta que «${fn} de ${property}» sea ${comparator} ${value}.`;
    }
    if (prompt.minCount === prompt.count) {
      return prompt.count === 1
        ? 'Elige exactamente 1 objeto de los publicados.'
        : `Elige exactamente ${prompt.count} objetos de los ${prompt.choices.length} publicados.`;
    }
    return prompt.minCount === 0
      ? `Puedes elegir hasta ${prompt.count}; ninguna elección también es legal.`
      : `Elige al menos ${prompt.minCount} y como mucho ${prompt.count}.`;
  });
  const counterLine = $derived.by(() => {
    const counters = prompt?.counters;
    if (!counters) return '';
    const kind = prompt?.counterKind === 'cualquiera' ? 'de cualquier tipo' : `de tipo ${prompt?.counterKind ?? 'publicado'}`;
    return counters.perObject === 'single'
      ? `Quita ${counters.count} contador${counters.count === 1 ? '' : 'es'} ${kind} de un solo permanente.`
      : `Quita ${counters.count} contador${counters.count === 1 ? '' : 'es'} ${kind} repartidos entre los elegidos.`;
  });
  const powerLine = $derived.by(() => {
    const aggregate = prompt?.tapAggregate;
    if (!aggregate) return '';
    const total = session.payCostPower;
    if (total === null) return 'Fuerza elegida sin publicar: el motor hace la cuenta final.';
    const holds = session.payCostAggregateHolds;
    return `Fuerza elegida ${total} de ${aggregate.value}${holds === false ? ' · todavía no llega al umbral' : ''}.`;
  });
  const confirmLabel = $derived.by(() => {
    if (!prompt) return '';
    if (!picked.length) return prompt.minCount === 0 ? 'Confirmar sin elegir ninguno' : 'Confirmar';
    return `Confirmar ${picked.length} ${picked.length === 1 ? 'objeto' : 'objetos'}`;
  });
</script>

{#if prompt}
  <div
    class="prompt"
    aria-label={title}
    data-pay-cost
    data-pay-cost-kind={prompt.kind}
    data-pay-cost-resume={prompt.resume}
    data-pay-cost-choices={prompt.choices.length}
    data-pay-cost-hidden={prompt.hiddenChoices}
    data-pay-cost-count={prompt.count}
    data-pay-cost-min={prompt.minCount}
    data-pay-cost-chosen={picked.length}>
    <strong>{title}</strong>
    <p class="hint" data-pay-cost-rule>{rule}</p>
    <p class="hint" data-pay-cost-contract>{contract}</p>
    <p class="hint" data-pay-cost-resume>{RESUMES[prompt.resume]}</p>
    {#if prompt.zone}
      <p class="hint" data-pay-cost-zone>Sale de {ZONES[prompt.zone] ?? prompt.zone}.</p>
    {/if}
    {#if prompt.sharedQuality}
      <p class="hint" data-pay-cost-shared>
        Las cartas tienen que compartir {SHARED[prompt.sharedQuality] ?? prompt.sharedQuality}.
      </p>
    {/if}
    {#if counterLine}
      <p class="hint" data-pay-cost-counters>{counterLine}</p>
    {/if}
    {#if powerLine}
      <p class="hint" data-pay-cost-power>{powerLine}</p>
    {/if}
    {#if !mine}
      <p class="hint" data-pay-cost-other>
        Este coste lo paga el Jugador {prompt.player + 1}: no es tu decisión y los candidatos se publican como el
        motor los deja ver (CR 400.2).
      </p>
      {#if prompt.hiddenChoices || !prompt.choices.length}
        <p class="hint" data-pay-cost-redacted>
          Phase no publica los candidatos a este asiento (CR 400.2): la lista existe, pero su contenido es privado.
        </p>
      {/if}
    {:else if prompt.choices.length}
      <ul class="rows">
        {#each prompt.choices as id (id)}
          {@const chosen = session.payCostIsPicked(id)}
          <li>
            <button
              type="button"
              class="row"
              aria-pressed={chosen}
              disabled={session.busy || (!chosen && picked.length >= prompt.count)}
              data-pay-cost-object={id}
              onclick={() => session.togglePayCost(id)}>
              <span class="tick" aria-hidden="true">{chosen ? '✓' : ''}</span>
              <span class="name">{nameOf(id)}</span>
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="hint" data-pay-cost-empty>
        El motor no publica ningún candidato para este coste.
      </p>
    {/if}
    {#if prompt.hiddenChoices}
      <p class="hint" data-pay-cost-placeholders>
        {prompt.hiddenChoices} de las entradas llegan como marcador vacío: son cartas que no ves y no se pueden
        elegir desde aquí.
      </p>
    {/if}
    {#if mine}
      <button
        type="button"
        class="primary"
        data-pay-cost-confirm
        disabled={session.busy || !session.payCostReady}
        onclick={() => session.confirmPayCost()}>
        {confirmLabel}
      </button>
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
  .rows { margin: 0; padding: 0; list-style: none; display: grid; gap: .3rem; }
  .row {
    display: flex;
    align-items: center;
    gap: .45rem;
    width: 100%;
    min-height: 44px;
    padding: .35rem .55rem;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--surface-3);
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .row[aria-pressed='true'] { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
  .row:disabled { opacity: .55; cursor: not-allowed; }
  .row:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .tick { width: 1rem; font-size: .8rem; color: var(--accent); }
  .name { font-size: .84rem; font-weight: 650; }
  .primary {
    justify-self: start;
    min-height: 44px;
    padding: .55rem .7rem;
    border-radius: 9px;
    border: 1px solid var(--accent);
    background: var(--accent);
    color: var(--accent-ink);
    font: inherit;
    font-size: .82rem;
    font-weight: 650;
    cursor: pointer;
  }
  .primary:disabled { opacity: .55; cursor: not-allowed; }
  .primary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
