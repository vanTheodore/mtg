<script lang="ts">
  import { session } from '#lib/game/session.svelte.ts';
  const snapshot = $derived(session.snapshot);
  const stack = $derived(snapshot?.state.stack ?? []);
  const objects = $derived(snapshot?.state.objects ?? {});
  const entries = $derived(stack.map((raw, i) => {
    const entry = raw as { source_id?: number; controller?: number; kind?: { type?: string } };
    const source = entry.source_id !== undefined ? objects[String(entry.source_id)] : undefined;
    return {
      key: i,
      name: source?.name ?? `Objeto en la pila #${i + 1}`,
      controller: entry.controller !== undefined ? `Jugador ${entry.controller + 1}` : '',
      kind: entry.kind?.type ?? ''
    };
  }));
</script>

<section class="stack" aria-label="Pila">
  <h2>Pila <span class="count">{stack.length}</span></h2>
  {#if stack.length === 0}
    <p class="muted">La pila está vacía.</p>
  {:else}
    <ol>
      {#each entries as entry (entry.key)}
        <li>
          <strong>{entry.name}</strong>
          <span>{[entry.controller, entry.kind].filter(Boolean).join(' · ')}</span>
        </li>
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
