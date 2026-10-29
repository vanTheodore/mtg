<script lang="ts">
  import { session } from '#lib/game/session.svelte.ts';
  const recent = $derived(session.history);
</script>
<section class="history" aria-label="Registro de la partida">
  <h2>Resoluciones <span class="count">{recent.length}</span></h2>
  {#if recent.length === 0}
    <p class="muted">Aquí aparecerán lanzamientos, daños, cambios de vida y resoluciones.</p>
  {:else}
    <ol aria-live="polite">
      {#each recent.slice(0, 12) as entry (entry.id)}
        <li class:damage={entry.kind === 'damage'} class:life={entry.kind === 'life'}>{entry.text}</li>
      {/each}
    </ol>
  {/if}
</section>
<style>
  .history { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: .7rem .8rem; min-width: 0; }
  h2 { margin: 0 0 .35rem; font-size: .92rem; }
  .count { color: var(--ink-muted); font-weight: 500; }
  .muted { color: var(--ink-muted); font-size: .8rem; margin: .25rem 0; }
  ol { margin: .2rem 0; padding-left: 1.1rem; display: grid; gap: .25rem; font-size: .8rem; }
  li.damage { color: var(--danger); }
  li.life { color: var(--ok); }
</style>
