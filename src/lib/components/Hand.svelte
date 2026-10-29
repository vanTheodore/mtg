<script lang="ts">
  import CardView from './CardView.svelte';
  import { session } from '#lib/game/session.svelte.ts';
  import { actionsForObject } from '#lib/game/actions.ts';
  import type { CardMeta, GameObject } from '#lib/engine/types.ts';

  let { objects, metas, title }: { objects: GameObject[]; metas: Record<string, CardMeta>; title: string } = $props();
  let scroller: HTMLDivElement | undefined = $state();
  let overflow = $state(false);

  function updateOverflow() {
    if (scroller) overflow = scroller.scrollWidth > scroller.clientWidth + 2;
  }

  $effect(() => {
    objects.length;
    requestAnimationFrame(updateOverflow);
  });

  function scrollBy(dir: number) {
    scroller?.scrollBy({ left: dir * 240, behavior: 'smooth' });
  }

  function metaFor(obj: GameObject): CardMeta | undefined {
    return metas[obj.printed_ref?.oracle_id ?? ''] ?? metas[obj.name.toLowerCase()];
  }
</script>

<section class="hand-zone" aria-label={title}>
  <header class="zone-head">
    <h2>{title} <span class="count">{objects.length}</span></h2>
    {#if overflow}
      <div class="scroll-controls">
        <button type="button" aria-label="Desplazar mano a la izquierda" onclick={() => scrollBy(-1)}>←</button>
        <button type="button" aria-label="Desplazar mano a la derecha" onclick={() => scrollBy(1)}>→</button>
      </div>
    {/if}
  </header>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="hand-scroll" bind:this={scroller} onscroll={updateOverflow} role="region" tabindex="0" aria-label={`${title}, ${objects.length} cartas. Desplázate para ver todas.`}>
    {#each objects as obj (obj.id)}
      <div class="hand-card">
        <CardView
          object={obj}
          meta={metaFor(obj)}
          selected={session.selected === obj.id}
          onselect={(id) => { session.selected = session.selected === id ? null : id; }}
          oninspect={(id) => { session.inspect = id; }}
        />
        {#if actionsForObject(session.snapshot?.legal.by_object ?? {}, obj.id).length}
          <span class="playable" aria-label="Jugable">●</span>
        {/if}
      </div>
    {:else}
      <p class="empty">Sin cartas en esta zona.</p>
    {/each}
  </div>
  {#if overflow}<p class="more-hint" aria-live="polite">Hay más cartas fuera de la vista. Usa las flechas o desplázate.</p>{/if}
</section>

<style>
  .hand-zone { min-width: 0; max-width: 100%; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: .65rem .8rem; }
  .zone-head { display: flex; align-items: center; justify-content: space-between; gap: .5rem; margin-bottom: .45rem; }
  h2 { margin: 0; font-size: .9rem; font-weight: 650; }
  .count { color: var(--ink-muted); font-weight: 500; }
  .scroll-controls { display: flex; gap: .3rem; }
  .scroll-controls button { border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); border-radius: 7px; width: 2rem; height: 1.8rem; }
  .hand-scroll { min-width: 0; max-width: 100%; display: flex; gap: .65rem; overflow-x: auto; overflow-y: visible; padding: .6rem .2rem .8rem; scroll-snap-type: x proximity; }
  .hand-card { position: relative; scroll-snap-align: start; }
  .playable { position: absolute; bottom: -2px; left: 50%; transform: translateX(-50%); color: var(--ok); font-size: .7rem; }
  .empty { color: var(--ink-muted); font-size: .85rem; margin: .5rem 0; }
  .more-hint { margin: .1rem 0 0; font-size: .72rem; color: var(--ink-muted); }
</style>
