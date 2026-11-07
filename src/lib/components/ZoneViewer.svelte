<script lang="ts">
  /**
   * Zone browser — Phase's `zone/ZoneViewer.tsx` as a native `<dialog>`.
   *
   * What the port keeps: the zone is opened from its pile, shows the cards the
   * **engine** projected for this viewer, and a card still answers the current
   * Phase decision when it is selectable (otherwise it just opens large, never
   * a fabricated action).
   *
   * What it deliberately does not do: invent a library order. Phase sends a
   * count; a private top card only appears when the engine marks it visible.
   * The graveyard and exile are public zones and are listed in append order,
   * top last, exactly as the seat bar counts them.
   */
  import CardView from './CardView.svelte';
  import { session } from '#lib/game/session.svelte.ts';
  import { revealedLibraryCards, zoneCards, zoneCount, ZONE_LABELS, type TableZone } from '#lib/game/zones.ts';
  import { canSelectObject } from '#lib/game/interaction.ts';

  let { zone, playerId, onclose }: { zone: TableZone; playerId: number; onclose: () => void } = $props();

  let dialog = $state<HTMLDialogElement | null>(null);
  const titleId = $props.id();
  const snapshot = $derived(session.snapshot);
  const cards = $derived(zone === 'library'
    ? revealedLibraryCards(snapshot, playerId)
    : zoneCards(snapshot, playerId, zone));
  const count = $derived(zoneCount(snapshot, playerId, zone));
  const title = $derived(`${ZONE_LABELS[zone]} · Jugador ${playerId + 1}`);

  $effect(() => {
    const element = dialog;
    if (!element) return;
    if (!element.open) element.showModal();
    // Closing on unmount keeps the top layer in sync with the component: a
    // pile that disappears with the last card must not leave a modal behind.
    return () => {
      if (element.open) element.close();
    };
  });

  function choose(id: number) {
    // A card the engine accepts as the current answer dispatches exactly that
    // decision. Everything else opens the inspector; the viewer never guesses.
    if (canSelectObject(session.snapshot, id)) session.selectObject(id);
    else session.inspect = id;
  }

  function backdrop(event: MouseEvent) {
    if (event.target === dialog) onclose();
  }
</script>

<dialog
  class="zone-viewer"
  bind:this={dialog}
  onclose={onclose}
  onclick={backdrop}
  aria-labelledby={titleId}
  data-zone-viewer={zone}
>
  <header>
    <h2 id={titleId}>{title} <span class="count">{count}</span></h2>
    <button type="button" class="close" onclick={onclose} aria-label={`Cerrar ${ZONE_LABELS[zone].toLowerCase()}`}>✕</button>
  </header>

  {#if zone === 'library'}
    <p class="note">
      {#if cards.length}
        El motor reveló {cards.length} de {count} carta(s) de esta biblioteca. Se muestran sólo esas; el orden del resto es información oculta.
      {:else}
        Phase no envía el orden de la biblioteca: hay {count} carta(s), ninguna revelada a este asiento.
      {/if}
    </p>
  {/if}

  {#if cards.length}
    <div class="cards">
      {#each cards as card (card.id)}
        <CardView
          object={card}
          compact
          onselect={choose}
          oninspect={(id) => { session.inspect = id; }}
        />
      {/each}
    </div>
  {:else}
    <p class="empty">
      {#if zone === 'library'}La biblioteca está vacía.{:else}No hay cartas en {ZONE_LABELS[zone].toLowerCase()}.{/if}
    </p>
  {/if}

  <p class="hint">Selecciona una carta para responder a Phase si es una opción legal; «Ampliar» la muestra en grande.</p>
</dialog>

<style>
  .zone-viewer {
    width: min(980px, 94vw);
    max-height: 84dvh;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: var(--surface);
    color: var(--ink);
    box-shadow: 0 24px 80px rgb(0 0 0 / 45%);
    overflow: hidden;
  }
  .zone-viewer::backdrop { background: rgb(6 10 14 / 66%); }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: .8rem;
    padding: .8rem 1rem;
    border-bottom: 1px solid var(--line);
    background: var(--surface-2);
    position: sticky;
    top: 0;
    z-index: 1;
  }
  h2 { margin: 0; font-size: 1rem; }
  .count { color: var(--ink-muted); font-weight: 500; }
  .close {
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink);
    border-radius: 8px;
    width: 2rem;
    height: 2rem;
    cursor: pointer;
  }
  .note, .empty, .hint { margin: 0; padding: .7rem 1rem; font-size: .84rem; color: var(--ink-muted); }
  .empty { padding: 1.2rem 1rem 2rem; }
  .cards {
    --card-w: 118px;
    display: flex;
    flex-wrap: wrap;
    gap: .7rem;
    padding: .9rem 1rem;
    max-height: 62dvh;
    overflow: auto;
  }
  .hint { border-top: 1px solid var(--line); font-size: .76rem; }
  @media (max-width: 640px) {
    .cards { --card-w: 92px; gap: .45rem; }
    .zone-viewer { width: 96vw; max-height: 88dvh; }
  }
</style>
