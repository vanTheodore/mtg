<script lang="ts">
  import { manaPips, manaSpoken, type ManaPip } from '#lib/game/cards.ts';

  let {
    cost,
    label = 'Coste de maná',
    size = 'normal'
  }: { cost: unknown; label?: string; size?: 'normal' | 'small' } = $props();

  const pips = $derived(manaPips(cost));
  const spoken = $derived(manaSpoken(pips));

  /**
   * Hybrid and Phyrexian symbols are wider than a letter, and a split fill
   * fights the glyph. The text sits on the surface; the edge carries the
   * halves, so `{W/P}` stays readable in both themes instead of vanishing.
   */
  const HALF_EDGE: Record<string, string> = {
    W: '#f3ead2', U: '#7eb0d4', B: '#2c282b', R: '#e08a78', G: '#7dba8a',
    C: '#c8c2b6', '2': '#c8c2b6', P: '#8a7044'
  };
  function edgeOf(pip: ManaPip): string | undefined {
    if (pip.kind !== 'hybrid' && pip.kind !== 'phyrexian') return undefined;
    const stops = pip.symbol.split('/').map((half) => HALF_EDGE[half] ?? '#c8c2b6');
    return stops.length > 1 ? `linear-gradient(135deg, ${stops.join(', ')})` : undefined;
  }
</script>

<!-- The pips are decoration; the words carry the meaning for a screen reader. -->
<span class="cost" class:small={size === 'small'}>
  <span class="sr-only">{label}: {spoken}.</span>
  <span class="pips" aria-hidden="true">
    {#each pips as pip, i (i)}<span class={`pip ${pip.kind}`} class:wide={pip.symbol.length > 1} style:--pip-edge={edgeOf(pip)}>{pip.symbol}</span>{/each}
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
    white-space: nowrap;
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
  .pip.snow { background: #e7f4f6; color: #12343a; }
  .pip.variable { font-style: italic; }
  .pip.wide { padding: 0 .32rem; font-size: .62rem; letter-spacing: -0.03em; }
  .small .pip.wide { font-size: .54rem; }
  .pip.hybrid,
  .pip.phyrexian {
    border: 1.5px solid transparent;
    background:
      linear-gradient(var(--surface-2), var(--surface-2)) padding-box,
      var(--pip-edge, var(--line)) border-box;
    color: var(--ink);
  }
</style>
