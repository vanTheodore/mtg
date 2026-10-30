<script lang="ts">
  import type { ManaPoolSummary } from '#lib/engine/types.ts';
  let { pool }: { pool?: ManaPoolSummary } = $props();
  const entries = $derived([
    ['white', 'Blanco', pool?.white ?? 0], ['blue', 'Azul', pool?.blue ?? 0], ['black', 'Negro', pool?.black ?? 0],
    ['red', 'Rojo', pool?.red ?? 0], ['green', 'Verde', pool?.green ?? 0], ['colorless', 'Incoloro', pool?.colorless ?? 0]
  ] as const);
  const visible = $derived(entries.filter(([, , n]) => n > 0));
</script>

<span class="mana-pool" aria-label={`Maná disponible: ${pool?.total ?? 0}`}>
  <span class="label">Maná</span>
  {#if visible.length}
    {#each visible as [key, label, n] (key)}<span class={`pip ${key}`} title={`${label}: ${n}`} aria-label={`${label}: ${n}`}>{n}</span>{/each}
  {:else}<span class="zero">0</span>{/if}
</span>

<style>
  .mana-pool { display: inline-flex; align-items: center; gap: 5px; }
  .label { color: var(--text-muted); }
  .zero { color: var(--text-secondary); }
  .pip { min-width: 20px; height: 20px; padding: 0 5px; border-radius: 999px; display: inline-grid; place-items: center; font-size: 11px; font-weight: 700; border: 1px solid var(--border); background: var(--bg-card); color: var(--text-primary); }
  .pip.white { background: #f5f0dc; color: #2b2b20; }
  .pip.blue { background: #b9d9f2; color: #102a43; }
  .pip.black { background: #3a3438; color: #f4eee8; }
  .pip.red { background: #f2b8a8; color: #4a160c; }
  .pip.green { background: #b9dcc0; color: #12301b; }
</style>
