<script lang="ts">
  /**
   * `ChooseRoomDoor` — CR 709.5f-g.
   *
   * Una Room tiene dos mitades y el jugador elige sobre cuál actúa y con qué
   * operación. Lo importante: el motor publica **pares** `(op, door)` y exige que
   * la respuesta sea uno de esos pares. La lista de botones es, por tanto, la de
   * pares publicados — no el producto cartesiano de operaciones y puertas, que
   * ofrecería combinaciones que el motor rechaza.
   *
   * Un par sin acción publicada se lee sin botón.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { doorName, opName, roomDoorKey, roomDoorOffers } from '#lib/game/interaction.ts';

  const prompt = $derived(session.roomDoorPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const offers = $derived(roomDoorOffers(session.snapshot?.legal?.actions ?? []));
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const roomName = $derived(
    prompt?.objectId !== null && prompt?.objectId !== undefined
      ? objects[String(prompt.objectId)]?.name ?? null
      : null
  );

  function label(op: string, door: string) {
    const opText = opName(op);
    const doorText = doorName(door);
    // CR 709.5f-g: si el cable publicó algo que no es una de las tres operaciones
    // ni una de las dos mitades, se dice el valor tal cual.
    if (!opText || !doorText) return `${opText ?? op} · ${doorText ?? door}`;
    return `${opText} la ${doorText}`;
  }
</script>

{#if prompt}
  <div
    class="prompt"
    aria-label="Elegir puerta de la Room"
    data-room-door
    data-room-door-count={prompt.options.length}
    data-room-door-player={prompt.player}>
    <strong>Elegir puerta de la Room</strong>
    <p class="hint" data-room-door-rule>
      CR 709.5f: Phase publica qué operaciones admite cada mitad; eliges una de las que ofrece.
    </p>
    {#if roomName}
      <p class="hint" data-room-door-source>Room: {roomName}</p>
    {/if}

    {#if !mine}
      <ul class="faces" data-room-door-faces>
        {#each prompt.options as option (`${option.op}-${option.door}`)}
          <li>{label(option.op, option.door)}</li>
        {/each}
      </ul>
      <p class="hint" data-room-door-other>
        Esta elección es del Jugador {prompt.player + 1}: no es tu decisión (CR 400.2).
      </p>
    {:else}
      <div class="actions">
        {#each prompt.options as option (`${option.op}-${option.door}`)}
          {@const action = offers.byPair.get(roomDoorKey(option.op, option.door))}
          {#if action}
            <button
              type="button"
              class="primary"
              data-room-door-option={`${option.op}-${option.door}`}
              disabled={session.busy}
              onclick={() => session.answerRoomDoor(action)}>
              {label(option.op, option.door)}
            </button>
          {:else}
            <span class="no-action" data-room-door-inert={`${option.op}-${option.door}`}>
              {label(option.op, option.door)}
            </span>
          {/if}
        {/each}
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
  .hint { margin: 0; font-size: .78rem; color: var(--ink-2); }
  .faces { margin: 0; padding-left: 1.1rem; font-size: .78rem; }
  .actions { display: flex; gap: .4rem; flex-wrap: wrap; }
  .primary {
    min-height: 44px;
    padding: .55rem .7rem;
    border-radius: 9px;
    font: inherit;
    font-size: .82rem;
    font-weight: 650;
    cursor: pointer;
  }
  .primary { border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); }
  .primary:disabled { opacity: .55; cursor: not-allowed; }
  .primary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .no-action {
    min-height: 44px;
    display: grid;
    align-items: center;
    padding: .55rem .7rem;
    border: 1px dashed var(--line);
    border-radius: 9px;
    font-size: .82rem;
    color: var(--ink-2);
  }
</style>
