<script lang="ts">
  import { session } from '#lib/game/session.svelte.ts';
  const snapshot = $derived(session.snapshot);
  const stack = $derived(snapshot?.state.stack ?? []);
  const derivedStack = $derived((snapshot?.derived as Record<string, unknown> | undefined)?.stack_entries as Array<Record<string, unknown>> | undefined);
</script>

<section class="stack" aria-label="Pila">
  <h2>Pila <span class="count">{stack.length}</span></h2>
  {#if stack.length === 0}
    <p class="muted">La pila está vacía.</p>
  {:else if derivedStack?.length}
    <ol>
      {#each derivedStack as entry, i (i)}
        <li><strong>{entry.source_name ?? 'Hechizo'}</strong><span>{entry.kind_label ?? ''}</span></li>
      {/each}
    </ol>
  {:else}
    <ol>
      {#each stack as entry, i (i)}
        <li>Objeto en la pila #{i + 1}</li>
      {/each}
    </ol>
  {/if}
</section>

<style>
  .stack { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: .8rem; }
  h2 { margin: 0 0 .4rem; font-size: .95rem; }
  .count { color: var(--ink-muted); font-weight: 500; }
  .muted { color: var(--ink-muted); font-size: .84rem; margin: .3rem 0; }
  ol { margin: .3rem 0; padding-left: 1.1rem; display: grid; gap: .35rem; }
  li { font-size: .82rem; display: flex; flex-direction: column; }
  li span { color: var(--ink-muted); font-size: .74rem; }
</style>
