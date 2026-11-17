<script lang="ts">
  /**
   * `WaitingFor::ChoosePermanentTypeSlot` — CR 110.4.
   *
   * A multi-type card from the graveyard consumes one open slot of a
   * once-per-turn-per-type permission. The buttons are the published
   * `ChoosePermanentTypeSlot` actions, in the engine's order. A type the card
   * has and the engine did not publish is not rebuilt. The permission is not
   * re-sent; its absence is a land play (CR 305.1).
   *
   * The other seat sees the slots and gets no button (CR 400.2).
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { typeSlotOffers } from '#lib/game/interaction.ts';

  const prompt = $derived(session.typeSlotPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const offers = $derived(typeSlotOffers(session.snapshot?.legal.actions ?? []));
  const card = $derived(prompt?.objectId != null ? objects[String(prompt.objectId)] : undefined);
  const source = $derived.by(() => {
    const id = prompt?.sourceId;
    if (id == null || id === 0) return '';
    const object = objects[String(id)];
    if (!object || object.display_visible_to_viewer === false) return '';
    return object.name ?? '';
  });

  const SLOT: Record<string, string> = {
    Creature: 'Criatura',
    Artifact: 'Artefacto',
    Enchantment: 'Encantamiento',
    Land: 'Tierra',
    Planeswalker: 'Planeswalker',
    Battle: 'Batalla',
    Instant: 'Instantáneo',
    Sorcery: 'Conjuro',
    Tribal: 'Tribal',
    Kindred: 'Afín',
    Dungeon: 'Mazmorra',
    Plane: 'Plano',
    Phenomenon: 'Fenómeno',
    Scheme: 'Plan',
    Vanguard: 'Vanguardia',
    Conspiracy: 'Conspiración',
    Boss: 'Jefe',
    Event: 'Evento'
  };
  function slotLabel(slot: string) {
    return SLOT[slot] ?? slot;
  }
</script>

{#if prompt}
  <div
    class="prompt"
    aria-label="Elegir ranura de tipo"
    data-type-slot
    data-type-slot-count={prompt.slots.length}
    data-type-slot-permission={prompt.hasPermission ? 'yes' : 'no'}
    data-type-slot-payment={prompt.paymentMode}>
    <strong>Elegir ranura de tipo{card?.name ? ` · ${card.name}` : ''}</strong>
    <p class="hint" data-type-slot-rule>
      CR 110.4: esta carta consume un espacio de los que publicó el motor. Un tipo que tenga y no esté aquí no es un botón.
    </p>
    {#if source}
      <p class="hint" data-type-slot-source>mediante {source}</p>
    {/if}
    {#if !prompt.hasPermission}
      <p class="hint" data-type-slot-land>
        El motor no publicó un permiso de cementerio: esta jugada es una tierra (CR 305.1).
      </p>
    {/if}
    {#if prompt.paymentMode !== 'Auto'}
      <p class="hint" data-type-slot-mode>El pago que sigue es el que publicó el motor: {prompt.paymentMode}.</p>
    {/if}
    {#if !mine}
      <ul class="faces" data-type-slot-faces>
        {#each prompt.slots as slot (slot)}
          <li>{slotLabel(slot)}</li>
        {/each}
      </ul>
      <p class="hint" data-type-slot-other>
        Esta ranura la elige el Jugador {prompt.player + 1}: no es tu decisión (CR 400.2).
      </p>
    {:else}
      <div class="actions">
        {#each prompt.slots as slot (slot)}
          {@const action = offers.bySlot.get(slot)}
          {#if action}
            <button
              type="button"
              class="primary"
              data-type-slot-option={slot}
              disabled={session.busy}
              onclick={() => session.answerTypeSlot(action)}>
              {slotLabel(slot)}
            </button>
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
