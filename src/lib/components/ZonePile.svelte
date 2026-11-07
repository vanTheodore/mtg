<script lang="ts">
  /**
   * A zone as Phase draws it: a stack you can open.
   *
   * Upstream (`zone/LibraryPile.tsx`, `GraveyardPile.tsx`, `ZoneViewer.tsx`)
   * shows the top card's art. Here the pile is an inline chip with the same
   * text the seat bar already printed ("Biblioteca 33"), because the Arena
   * board's vertical budget is measured to 0 px and a 60 px pile per seat per
   * zone would spend it. The behaviour — open, read, choose — is the ported
   * part; the size is a decision this project can defend with numbers.
   *
   * The button is the only interactive element; the viewer is a native
   * `<dialog>`, so focus trapping and Escape come from the platform.
   */
  import { zoneCount, zoneTop, ZONE_LABELS, type TableZone } from '#lib/game/zones.ts';
  import { session } from '#lib/game/session.svelte.ts';
  import ZoneViewer from './ZoneViewer.svelte';

  let { zone, playerId }: { zone: TableZone; playerId: number } = $props();
  let open = $state(false);
  const count = $derived(zoneCount(session.snapshot, playerId, zone));
  const top = $derived(zoneTop(session.snapshot, playerId, zone));
  const label = $derived(`${ZONE_LABELS[zone]} de Jugador ${playerId + 1}`);
</script>

<button
  type="button"
  class="zone-chip"
  data-zone-pile={zone}
  data-count={count}
  aria-haspopup="dialog"
  aria-expanded={open}
  aria-label={`${ZONE_LABELS[zone]} ${count} · ${label}. Abrir`}
  title={top ? `${label}: ${top.name}` : label}
  onclick={() => { open = true; }}
>
  <span class="glyph" aria-hidden="true"></span>
  <span class="chip-text">{ZONE_LABELS[zone]} <b>{count}</b></span>
</button>

{#if open}
  <ZoneViewer {zone} {playerId} onclose={() => { open = false; }} />
{/if}

<style>
  /*
   * Deliberately the same type size and line box as the plain text it replaces:
   * the seat bar keeps its measured height (docs/ARENA-1.0-BOARD.md).
   */
  .zone-chip {
    display: inline-flex;
    align-items: center;
    gap: .3rem;
    padding: .05rem .35rem .05rem .2rem;
    border: 1px solid transparent;
    border-radius: 7px;
    background: none;
    color: var(--ink-muted);
    font: inherit;
    font-size: .78rem;
    line-height: 1.25;
    cursor: pointer;
    min-height: 22px;
  }
  .zone-chip:hover,
  .zone-chip:focus-visible {
    border-color: var(--line);
    background: var(--surface-2);
    color: var(--ink);
  }
  .zone-chip b { color: var(--ink); font-weight: 650; }
  /* Three offset sheets: the smallest readable "pile" that is not an image. */
  .glyph {
    position: relative;
    width: 12px;
    height: 15px;
    border: 1px solid var(--line);
    border-radius: 2px;
    background: var(--surface-2);
    box-shadow: 2px 2px 0 -1px var(--surface), 2px 2px 0 0 var(--line);
    flex: 0 0 auto;
  }
  .zone-chip[data-zone-pile='graveyard'] .glyph { box-shadow: 2px 2px 0 -1px var(--surface), 2px 2px 0 0 var(--line), 4px 4px 0 -1px var(--surface), 4px 4px 0 0 var(--line); }
  .zone-chip[data-zone-pile='exile'] .glyph { border-style: dashed; }
  .zone-chip[data-zone-pile='library'] .glyph { background: repeating-linear-gradient(120deg, var(--surface-3) 0 3px, var(--surface-2) 3px 6px); }
  .chip-text { white-space: nowrap; }
</style>
