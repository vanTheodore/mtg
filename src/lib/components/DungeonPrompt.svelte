<script lang="ts">
  /**
   * `ChooseDungeon` (CR 701.49a) y `ChooseDungeonRoom` (CR 309.5a).
   *
   * La pregunta es «¿a qué dungeon entras?» o «¿a qué habitación avanzas?», y el
   * motor manda la lista ya resuelta: `DungeonPreview` con su nombre impreso y
   * la habitación de entrada, `RoomPreview` con el índice, el nombre y el texto.
   * El bloque pinta eso: no tiene tablas de dungeons propias ni deduce nombres
   * del id, porque el nombre que el jugador lee tiene que ser el del cable.
   *
   * Lo que no viene no se pinta: una preview sin nombre no es una fila.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { dungeonOffers } from '#lib/game/interaction.ts';

  const prompt = $derived(session.dungeonPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const offers = $derived(dungeonOffers(session.snapshot?.legal.actions ?? []));
  const choosingDungeon = $derived((prompt?.dungeons.length ?? 0) > 0);
  // `DungeonId` comes over the wire as an object, so `String(id)` is `[object
  // Object]` for every one of them — the canonical JSON is what tells them apart,
  // and it is the same form `dungeonOffers` indexes by.
  const dungeonKey = (id: unknown) => JSON.stringify(id ?? null);
</script>

{#if prompt}
  <div
    class="prompt"
    aria-label={choosingDungeon ? 'Elegir dungeon' : 'Elegir habitación'}
    data-dungeon
    data-dungeon-kind={choosingDungeon ? 'dungeon' : 'room'}
    data-dungeon-count={choosingDungeon ? prompt.dungeons.length : prompt.rooms.length}
    data-dungeon-player={prompt.player}>
    <strong>{choosingDungeon ? 'Elegir dungeon' : 'Elegir habitación'}</strong>
    <p class="hint" data-dungeon-rule>
      {#if choosingDungeon}
        CR 701.49a: te aventuras en una dungeon de tu elección. El marcador empieza en la habitación de entrada que se muestra.
      {:else}
        CR 309.5a: el pasillo se bifurca y eliges a qué habitación avanza el marcador.
      {/if}
    </p>

    {#if !choosingDungeon && prompt.dungeonName}
      <p class="hint" data-dungeon-name>Dungeon: {prompt.dungeonName}</p>
    {/if}

    {#if !mine}
      <ul class="faces" data-dungeon-faces>
        {#if choosingDungeon}
          {#each prompt.dungeons as option (dungeonKey(option.id))}
            <li>
              <span class="name">{option.name}</span>
              {#if option.roomName}<span class="entry">Entrada: {option.roomName}</span>{/if}
            </li>
          {/each}
        {:else}
          {#each prompt.rooms as option (option.index)}
            <li>
              <span class="name">{option.name}</span>
              {#if option.text}<span class="text">{option.text}</span>{/if}
            </li>
          {/each}
        {/if}
      </ul>
      <p class="hint" data-dungeon-other>
        Esta elección es del Jugador {prompt.player + 1}: no es tu decisión (CR 400.2).
      </p>
    {:else}
      <div class="actions">
        {#if choosingDungeon}
          {#each prompt.dungeons as option (dungeonKey(option.id))}
            {@const action = offers.byDungeon.get(JSON.stringify(option.id ?? null))}
            {#if action}
              <button
                type="button"
                class="primary"
                data-dungeon-option={option.name}
                disabled={session.busy}
                onclick={() => session.answerDungeon(action)}>
                {option.name}
                {#if option.roomName}<span class="entry">Entrada: {option.roomName}</span>{/if}
                {#if option.roomText}<span class="text">{option.roomText}</span>{/if}
              </button>
            {:else}
              <span class="no-action" data-dungeon-inert={option.name}>{option.name}</span>
            {/if}
          {/each}
        {:else}
          {#each prompt.rooms as room (room.index)}
            {@const action = offers.byRoom.get(room.index)}
            {#if action}
              <button
                type="button"
                class="primary"
                data-dungeon-option={room.name}
                data-dungeon-room={room.index}
                disabled={session.busy}
                onclick={() => session.answerDungeon(action)}>
                {room.name}
                {#if room.text}<span class="text">{room.text}</span>{/if}
              </button>
            {:else}
              <span class="no-action" data-dungeon-inert={room.name}>{room.name}</span>
            {/if}
          {/each}
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
  .hint { margin: 0; font-size: .78rem; color: var(--ink-2); }
  .faces { margin: 0; padding-left: 1.1rem; font-size: .78rem; display: grid; gap: .25rem; }
  .faces li { display: grid; gap: .1rem; }
  .actions { display: flex; gap: .4rem; flex-wrap: wrap; }
  .primary {
    min-height: 44px;
    padding: .55rem .7rem;
    border-radius: 9px;
    font: inherit;
    font-size: .82rem;
    font-weight: 650;
    cursor: pointer;
    display: grid;
    gap: .1rem;
    text-align: left;
    max-width: 22rem;
  }
  .primary { border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); }
  .primary:disabled { opacity: .55; cursor: not-allowed; }
  .primary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .name { font-weight: 650; }
  .entry, .text { font-size: .72rem; font-weight: 500; }
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
