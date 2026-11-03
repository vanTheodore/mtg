<script lang="ts">
  import { session } from '#lib/game/session.svelte.ts';
  let { compact = false }: { compact?: boolean } = $props();
  const recent = $derived(session.history);
  const visible = $derived(recent.slice(0, 12));
</script>

<section class="history" aria-label="Registro de la partida" data-compact={compact}>
  <h2>Resoluciones <span class="count">{recent.length}</span></h2>
  {#if compact}
    <!-- The latest event remains announced. The full recent log is available
         through an accessible native disclosure without duplicating actions. -->
    <p class="latest" aria-live="polite" aria-atomic="true">
      {recent.length ? recent[0].text : 'Sin resoluciones todavía.'}
    </p>
    {#if recent.length}
      <details class="history-entries">
        <summary>Ver últimas {visible.length} resoluciones</summary>
        <ol>
          {#each visible as entry (entry.id)}
            <li class:damage={entry.kind === 'damage'} class:life={entry.kind === 'life'}>{entry.text}</li>
          {/each}
        </ol>
      </details>
    {/if}
  {:else if recent.length === 0}
    <p class="muted">Aquí aparecerán lanzamientos, daños, cambios de vida y resoluciones.</p>
  {:else}
    <ol aria-live="polite">
      {#each visible as entry (entry.id)}
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
  .latest { margin: .15rem 0; font-size: .81rem; line-height: 1.35; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .history-entries { margin-top: .4rem; font-size: .79rem; }
  .history-entries summary { cursor: pointer; color: var(--ink-muted); padding: .25rem 0; }
  .history-entries summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  .history-entries[open] ol { max-height: min(30vh, 260px); overflow-y: auto; overscroll-behavior: contain; padding-right: .35rem; }
</style>
