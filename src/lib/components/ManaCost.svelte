<script lang="ts">
  import { manaPips } from '#lib/game/cards.ts';

  let {
    cost,
    label = 'Coste de maná',
    size = 'normal'
  }: { cost: unknown; label?: string; size?: 'normal' | 'small' } = $props();

  const pips = $derived(manaPips(cost));
  const spoken = $derived(pips.length ? pips.map((pip) => pip.symbol).join(' ') : 'sin coste de maná');
</script>

<!-- The pips are decoration; the words carry the meaning for a screen reader. -->
<span class="cost" class:small={size === 'small'}>
  <span class="sr-only">{label}: {spoken}.</span>
  <span class="pips" aria-hidden="true">
    {#each pips as pip, i (i)}<span class={`pip ${pip.kind}`}>{pip.symbol}</span>{/each}
  </span>
</span>

<style>
  .cost { display: inline-flex; align-items: center; }
  .pips { display: inline-flex; gap: .18rem; }
  .pip {
    min-width: 1.15rem;
    height: 1.15rem;
    padding: 0 .25rem;
    border-radius: 999px;
    display: inline-grid;
    place-items: center;
    font-size: .68rem;
    font-weight: 750;
    border: 1px solid var(--line);
    background: var(--surface-2);
    color: var(--ink);
  }
  .small .pip { min-width: .95rem; height: .95rem; font-size: .58rem; }
  .pip.white { background: #f5f0dc; color: #2b2b20; }
  .pip.blue { background: #b9d9f2; color: #102a43; }
  .pip.black { background: #3a3438; color: #f4eee8; }
  .pip.red { background: #f2b8a8; color: #4a160c; }
  .pip.green { background: #b9dcc0; color: #12301b; }
  .pip.colorless { background: var(--surface-3); color: var(--ink); }
  .pip.generic { background: var(--surface-3); color: var(--ink); }
</style>
