<script lang="ts">
  import ManaPool from './ManaPool.svelte';
  import { session } from '#lib/game/session.svelte.ts';
  import { attackTargets, playerTarget, targetAction } from '#lib/game/interaction.ts';
  import type { PlayerView } from '#lib/engine/types.ts';
  let { player, showHand = false }: { player: PlayerView; showHand?: boolean } = $props();
  const s = $derived(session.snapshot);
  const isTarget = $derived(!!targetAction(s, playerTarget(player.id)));
  const attackDestination = $derived(session.selected !== null && attackTargets(s, session.selected).find((t) => t.type === 'Player' && t.data === player.id));
  const selectable = $derived(isTarget || !!attackDestination);
  const label = $derived(isTarget ? `Elegir Jugador ${player.id + 1} como objetivo` : `Atacar a Jugador ${player.id + 1}`);
  const change = $derived(session.lifeChanges[String(player.id)]);
  const recent = $derived(change && s && s.revision - change.revision <= 2 && change.amount !== 0 ? change.amount : null);
</script>
<section class="player-bar" aria-label={`Jugador ${player.id + 1}`} data-player-id={player.id} data-life={player.life}>
  <div class="identity">
    {#if selectable}
      <button type="button" class="life targetable" disabled={session.busy} aria-label={label} onclick={() => session.selectPlayer(player.id)}>
        <span class="life-label">{label}</span><span class="life-value">{player.life} vidas</span><span class="target-mark">◎</span>
      </button>
    {:else}
      <div class="life" class:low={player.life <= 5} aria-label={`Jugador ${player.id + 1}, ${player.life} vidas`}>
        <span class="life-label">Jugador {player.id + 1}</span><span class="life-value">{player.life}</span><span class="unit">vidas</span>
      </div>
    {/if}
    {#if recent !== null}<span class="life-change" class:gain={recent > 0} role="status">{recent > 0 ? '+' : ''}{recent} vidas</span>{/if}
    {#if player.is_eliminated}<span class="eliminated">Eliminado</span>{/if}
  </div>
  <div class="zone-counts">
    {#if showHand}<span>Mano {player.hand.length}</span>{/if}
    <span>Biblioteca {player.library_count}</span><span>Cementerio {player.graveyard.length}</span><span>Exilio {player.exile.length}</span>
    <ManaPool pool={player.mana_pool} />
  </div>
</section>
<style>
  .player-bar { display: flex; justify-content: space-between; align-items: center; gap: .8rem; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: .55rem .8rem; flex-wrap: wrap; }
  .identity { display: flex; align-items: center; flex-wrap: wrap; gap: .6rem; }
  .life { display: flex; align-items: baseline; gap: .5rem; color: var(--ink); }
  button.life { background: var(--surface-2); border: 2px solid var(--ok); border-radius: 10px; padding: .4rem .6rem; cursor: pointer; flex-wrap: wrap; text-align: left; }
  .life-label, .unit { font-size: .8rem; color: var(--ink-muted); }
  .life-value { font-size: 1.5rem; font-weight: 750; }
  .life.low .life-value { color: var(--danger); }
  .target-mark { color: var(--ok); font-weight: 800; }
  .life-change { font-size: .85rem; font-weight: 700; color: var(--danger); }
  .life-change.gain { color: var(--ok); }
  .eliminated { color: var(--danger); font-size: .8rem; }
  .zone-counts { display: flex; gap: .8rem; flex-wrap: wrap; font-size: .78rem; color: var(--ink-muted); }
</style>
