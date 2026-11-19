<script lang="ts">
  /**
   * `EffectZoneChoice`, `HeroEventChoice`, `DrawnThisTurnTopdeckChoice` y
   * `SearchPartitionChoice` — cuatro ventanas que el motor clasifica igual
   * (`HumanResponseModel::Select`) y contesta igual (`SelectCards { cards }`),
   * pero cuya **ventana** de tamaños no se calcula en TypeScript:
   *
   *   - `EffectZoneChoice`: `count` exactas, o `min_count..=count` si `up_to`.
   *   - `HeroEventChoice`: `count` exactas, o `min..=count` si `up_to`.
   *   - `DrawnThisTurnTopdeckChoice`: `min_count..=count` siempre; el mínimo es
   *     el que la vida del jugador permite pagar, y lo publica el motor.
   *   - `SearchPartitionChoice`: exactamente `primary_count`. Ninguna otra.
   *
   * El bloque no filtra la lista ni la reordena: marca cartas del conjunto
   * publicado y el botón sólo se habilita dentro de la ventana del cable. Una
   * lista vacía no es «ninguna» salvo que el mínimo publicado sea cero.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { typeLine } from '#lib/game/cards.ts';

  const prompt = $derived(session.selectFromListPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const chosen = $derived(session.selectFromList);

  function nameOf(id: number) {
    const object = objects[String(id)];
    if (!object) return `Objeto ${id}`;
    if (object.display_visible_to_viewer === false) return 'Una carta que el motor no nombró';
    return object.name ?? `Carta ${id}`;
  }
  function typeOf(id: number) {
    const object = objects[String(id)];
    return object ? typeLine(object) : '';
  }

  const title = $derived.by(() => {
    if (!prompt) return '';
    if (prompt.kind === 'effect-zone') {
      return prompt.zone ? `Elegir en ${prompt.zone}` : 'Elegir permanentes o cartas';
    }
    if (prompt.kind === 'hero-event') return 'Elegir para el evento';
    if (prompt.kind === 'drawn-topdeck') return 'Elegir qué robar va a la biblioteca';
    return 'Elegir qué va a cada zona';
  });

  const rule = $derived.by(() => {
    if (!prompt) return '';
    if (prompt.kind === 'effect-zone') {
      return prompt.window
        ? `CR 608.2d: el motor acepta entre ${prompt.min} y ${prompt.max} de las ${prompt.cards.length} publicadas.`
        : `CR 608.2d: el motor pide exactamente ${prompt.max} de las ${prompt.cards.length} publicadas.`;
    }
    if (prompt.kind === 'hero-event') {
      return prompt.window
        ? `Evento: el equipo elige entre ${prompt.min} y ${prompt.max}; la cuenta la lleva el motor.`
        : `Evento: el equipo elige exactamente ${prompt.max}; la cuenta la lleva el motor.`;
    }
    if (prompt.kind === 'drawn-topdeck') {
      const life = prompt.lifePayment === null ? '' : ` Cada carta que no va arriba cuesta ${prompt.lifePayment} vida.`;
      return `CR 614.1: puedes mandar arriba entre ${prompt.min} y ${prompt.max} de las robadas este turno.${life}`;
    }
    return `CR 608.2d: exactamente ${prompt.max} van a ${prompt.primaryDestination ?? 'el destino primario'}; el resto, a ${prompt.restDestination ?? 'el otro destino'}.`;
  });
</script>

{#if prompt}
  <div
    class="prompt"
    aria-label={title}
    data-select-from-list
    data-select-from-list-kind={prompt.kind}
    data-select-from-list-count={prompt.cards.length}
    data-select-from-list-min={prompt.min}
    data-select-from-list-max={prompt.max}
    data-select-from-list-window={prompt.window}
    data-select-from-list-player={prompt.player}>
    <strong>{title}</strong>
    <p class="hint" data-select-from-list-rule>{rule}</p>
    {#if prompt.event}
      <p class="hint" data-select-from-list-event>{prompt.event}</p>
    {/if}

    {#if !mine}
      <ul class="faces" data-select-from-list-faces>
        {#each prompt.cards as id (id)}
          <li>{nameOf(id)}</li>
        {/each}
      </ul>
      <p class="hint" data-select-from-list-other>
        Esta elección es del Jugador {prompt.player + 1}: no es tu decisión (CR 400.2).
      </p>
    {:else}
      <ul class="cards">
        {#each prompt.cards as id (id)}
          {@const picked = chosen.includes(id)}
          <li>
            <button
              type="button"
              class="card"
              data-select-from-list-option={id}
              aria-pressed={picked}
              disabled={session.busy}
              onclick={() => session.toggleSelectFromList(id)}>
              <span class="name">{nameOf(id)}</span>
              {#if typeOf(id)}<span class="type">{typeOf(id)}</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
      <p class="hint" data-select-from-list-counts>
        Marcadas {chosen.length} de {prompt.max}{prompt.window ? ` (mínimo ${prompt.min})` : ''}.
      </p>
      <button
        type="button"
        class="primary"
        data-select-from-list-confirm
        disabled={session.busy || !session.selectFromListReady}
        onclick={() => session.confirmSelectFromList()}>
        {chosen.length === 0 && prompt.min === 0 ? 'No elegir ninguna' : `Confirmar (${chosen.length}/${prompt.max})`}
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
  .faces { margin: 0; padding-left: 1.1rem; font-size: .78rem; }
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
  .name { font-size: .84rem; font-weight: 650; }
  .type { font-size: .74rem; color: var(--ink-2); }
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
