<script lang="ts">
  /**
   * `WaitingFor::ChooseFromZoneChoice` — CR 608.2d.
   *
   * The player picks from a tracked set the engine already filtered. The answer
   * is `SelectCards`, and the confirm gate is Phase's: exact `count` unless
   * `up_to`, plus an injective type assignment when the constraint is
   * `DistinctCardTypes`. `TotalManaValue` is not checked here — the engine
   * rejects the sum. A `0` is a hidden card, not a click.
   *
   * The other seat sees that a choice is open and how many cards were
   * redacted, and gets no button (CR 400.2).
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { manaText } from '#lib/game/cards.ts';

  const prompt = $derived(session.zoneChoicePrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const chosen = $derived(session.zonePick);
  const TYPE_ES: Record<string, string> = {
    Artifact: 'artefacto',
    Creature: 'criatura',
    Enchantment: 'encantamiento',
    Instant: 'instantáneo',
    Land: 'tierra',
    Planeswalker: 'planeswalker',
    Sorcery: 'conjuro',
    Tribal: 'tribal',
    Battle: 'batalla',
    Kindred: 'afín',
    Dungeon: 'mazmorra'
  };
  const COMPARE: Record<string, string> = {
    GT: '>', LT: '<', GE: '≥', LE: '≤', EQ: '=', NE: '≠'
  };

  function nameOf(id: number) {
    return objects[String(id)]?.name ?? `Carta ${id}`;
  }
  function typeLine(id: number) {
    const types = objects[String(id)]?.card_types?.core_types ?? [];
    const subtypes = objects[String(id)]?.card_types?.subtypes ?? [];
    return [...types, ...subtypes].join(' ') || 'Carta';
  }
  const source = $derived(
    prompt?.sourceId != null ? objects[String(prompt.sourceId)]?.name ?? `Objeto ${prompt.sourceId}` : ''
  );
  const hidden = $derived(prompt?.cards.filter((id) => id === 0 || objects[String(id)] == null).length ?? 0);
  const rule = $derived.by(() => {
    if (!prompt) return '';
    if (prompt.count === null) return 'El motor no publica cuántas cartas hay que elegir.';
    const window = prompt.upTo
      ? `hasta ${prompt.count}`
      : `exactamente ${prompt.count}`;
    const constraint = prompt.constraint;
    if (constraint.kind === 'distinct-types') {
      const names = constraint.categories.map((type) => TYPE_ES[type] ?? type).join(', ');
      return `CR 608.2d: elige ${window}. Los tipos tienen que poder asignarse sin repetir: ${names || 'ninguno publicado'}.`;
    }
    if (constraint.kind === 'total-mana') {
      const mark = COMPARE[constraint.comparator] ?? constraint.comparator;
      return `CR 608.2d: elige ${window}. El valor de maná total tiene que cumplir ${mark} ${constraint.value}. Lo comprueba el motor al confirmar, no esta mesa.`;
    }
    if (constraint.kind === 'unknown') {
      return `CR 608.2d: elige ${window}. El motor publicó una restricción que esta mesa no lee; no se inventa un filtro.`;
    }
    return `CR 608.2d: elige ${window} del conjunto que publica el motor.`;
  });
  const role = $derived(
    prompt?.reciprocal === 'produce'
      ? 'Esta mitad publica el conjunto.'
      : prompt?.reciprocal === 'consume'
        ? 'Esta mitad consume el conjunto.'
        : prompt?.reciprocal === 'unknown'
          ? 'El motor publicó un papel recíproco que esta mesa no nombra.'
          : ''
  );
</script>

{#if prompt}
  <div
    class="prompt"
    aria-label="Elegir cartas de una zona"
    data-zone-choice
    data-zone-choice-count={prompt.count ?? ''}
    data-zone-choice-up-to={prompt.upTo}
    data-zone-choice-constraint={prompt.constraint.kind}
    data-zone-choice-cards={prompt.cards.length}
    data-zone-choice-hidden={hidden}
    data-zone-choice-role={prompt.reciprocal ?? ''}>
    <strong>{source ? `Elegir cartas · ${source}` : 'Elegir cartas'}</strong>
    <p class="hint" data-zone-choice-rule>{rule}</p>
    {#if role}<p class="hint" data-zone-choice-reciprocal>{role}</p>{/if}
    <ul class="cards">
      {#each prompt.cards as id, index (`${id}-${index}`)}
        {#if id === 0 || objects[String(id)] == null}
          <li class="hidden" data-zone-choice-hidden-slot>Carta oculta</li>
        {:else}
          {@const picked = chosen.includes(id)}
          <li>
            <button
              type="button"
              class="card"
              aria-pressed={picked}
              data-zone-choice-card={id}
              disabled={!mine || session.busy}
              onclick={() => session.toggleZoneChoice(id)}>
              <span class="name">{nameOf(id)}</span>
              <span class="type">{typeLine(id)}</span>
              {#if manaText(objects[String(id)]?.mana_cost)}
                <span class="cost">{manaText(objects[String(id)]?.mana_cost)}</span>
              {/if}
            </button>
          </li>
        {/if}
      {/each}
    </ul>
    {#if !mine}
      <p class="hint" data-zone-choice-other>
        Esta elección la hace el Jugador {prompt.player + 1}: no es tu decisión. El conjunto oculto no se reconstruye (CR 400.2).
      </p>
    {:else}
      <button
        type="button"
        class="primary"
        data-zone-choice-confirm
        disabled={session.busy || !session.zoneChoiceReady}
        onclick={() => session.confirmZoneChoice()}>
        {#if prompt.upTo && chosen.length === 0}
          No elegir ninguna
        {:else}
          Confirmar ({chosen.length}/{prompt.count ?? '—'})
        {/if}
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
  .cards { margin: 0; padding: 0; list-style: none; display: grid; gap: .3rem; max-height: 16rem; overflow: auto; }
  .card {
    display: flex;
    align-items: baseline;
    gap: .45rem;
    width: 100%;
    min-height: 44px;
    padding: .45rem .55rem;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--surface-3);
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .card[aria-pressed='true'] { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
  .card:disabled { cursor: default; }
  .name { font-size: .84rem; font-weight: 650; }
  .type, .cost { font-size: .74rem; color: var(--ink-2); }
  .cost { margin-left: auto; }
  .hidden { font-size: .78rem; color: var(--ink-2); padding: .35rem .1rem; }
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
  .card:focus-visible, .primary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
