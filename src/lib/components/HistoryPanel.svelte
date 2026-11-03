<script lang="ts">
  import { session } from '#lib/game/session.svelte.ts';
  let { compact = false }: { compact?: boolean } = $props();
  const recent = $derived(session.history);
  const visible = $derived(recent.slice(0, compact ? 3 : 12));
  const older = $derived(compact ? recent.slice(3, 12) : []);
</script>
<section class="history" aria-label="Registro de la partida" data-compact={compact}>
  <h2>Resoluciones <span class="count">{recent.length}</span></h2>
  {#if recent.length === 0}
    <p class="muted">Aquí aparecerán lanzamientos, daños, cambios de vida y resoluciones.</p>
  {:else}
    <ol aria-live="polite">
      {#each visible as entry (entry.id)}
        <li class:damage={entry.kind === 'damage'} class:life={entry.kind === 'life'}>{entry.text}</li>
      {/each}
    </ol>
    {#if older.length}
      <details class="older">
        <summary>Ver {older.length} resoluciones anteriores</summary>
        <ol start={4}>
          {#each older as entry (entry.id)}
            <li class:damage={entry.kind === 'damage'} class:life={entry.kind === 'life'}>{entry.text}</li>
          {/each}
        </ol>
      </details>
    {/if}
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
  .older { margin-top: .45rem; font-size: .8rem; }
  .older summary { cursor: pointer; color: var(--ink-muted); padding: .22rem 0; }
  .older summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
</style>
