<script lang="ts">
  /**
   * Card action menu — the port of Phase's `board/BoardContextMenu.tsx` for the
   * actions the engine already publishes for one object.
   *
   * It is a real menu (`role="menu"` with `menuitem`s), not a second panel:
   * everything listed comes from `legal.by_object` or the mana candidates, and
   * an action the engine did not offer cannot appear here. Opening it never
   * changes the selection; closing it returns focus to the card.
   *
   * Triggers live in `Board.svelte`: right click and `Shift+F10`/`ContextMenu`
   * on a focused card (the standard, keyboard-reachable context-menu gesture).
   */
  import { onMount, tick } from 'svelte';
  import { actionsForObject, describeAction } from '#lib/game/actions.ts';
  import { session } from '#lib/game/session.svelte.ts';
  import type { GameAction } from '#lib/engine/types.ts';

  let { objectId, anchor, onclose }: { objectId: number; anchor: DOMRect | null; onclose: () => void } = $props();

  const s = $derived(session.snapshot);
  const object = $derived(s?.state.objects[String(objectId)]);
  const objects = $derived(s?.state.objects ?? {});
  // Only what the engine publishes for this object; mana sources are offered by
  // the decision panel, where the payment prompt lives.
  const actions = $derived(actionsForObject(s?.legal.by_object ?? {}, objectId));

  let root = $state<HTMLElement | null>(null);
  let items = $state<HTMLButtonElement[]>([]);

  /** Keep the menu inside the viewport without measuring twice in CSS. */
  const position = $derived.by(() => {
    if (!anchor) return { top: '1rem', left: '1rem' };
    const width = 260;
    const left = Math.min(Math.max(8, anchor.right - width), Math.max(8, window.innerWidth - width - 8));
    const top = Math.min(anchor.bottom + 6, Math.max(8, window.innerHeight - 40));
    return { top: `${top}px`, left: `${left}px` };
  });

  function focusItem(index: number) {
    const target = items[Math.max(0, Math.min(index, items.length - 1))];
    target?.focus();
  }

  function onKeydown(event: KeyboardEvent) {
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'ArrowDown') { event.preventDefault(); focusItem(current + 1); return; }
    if (event.key === 'ArrowUp') { event.preventDefault(); focusItem(current - 1); return; }
    if (event.key === 'Home') { event.preventDefault(); focusItem(0); return; }
    if (event.key === 'End') { event.preventDefault(); focusItem(items.length - 1); return; }
    if (event.key === 'Tab') close();
  }

  function close() {
    const id = objectId;
    onclose();
    // Focus goes back to the card that opened the menu, not to the document.
    queueMicrotask(() => {
      document.querySelector<HTMLElement>(`[data-card-id="${id}"]`)?.focus();
    });
  }

  function run(action: GameAction) {
    close();
    void session.dispatch(action);
  }

  onMount(() => {
    void tick().then(() => focusItem(0));
    return () => {};
  });
</script>

<div
  class="card-menu"
  role="menu"
  aria-label={object ? `Acciones de ${object.name}` : 'Acciones de la carta'}
  style={`top: ${position.top}; left: ${position.left}`}
  bind:this={root}
  tabindex="-1"
  onkeydown={onKeydown}
>
  <p class="title">{object?.name ?? 'Carta'}</p>
  {#each actions as action, i (i)}
    <button type="button" role="menuitem" bind:this={items[i]} disabled={session.busy} onclick={() => run(action)}>
      {action.type === 'CastSpell' ? `Lanzar ${object?.name ?? 'la carta'}` : describeAction(action, objects)}
    </button>
  {/each}
  {#if !actions.length}
    <p class="empty">El motor no ofrece ninguna acción para esta carta ahora.</p>
  {/if}
  <hr />
  <button type="button" role="menuitem" bind:this={items[actions.length]} onclick={() => { const id = objectId; close(); session.inspect = id; }}>
    Ampliar carta
  </button>
  <button type="button" role="menuitem" bind:this={items[actions.length + 1]} onclick={() => { session.selected = null; close(); }}>
    Quitar selección
  </button>
</div>

<style>
  .card-menu {
    position: fixed;
    z-index: 40;
    width: 260px;
    max-width: calc(100vw - 1rem);
    display: grid;
    gap: .15rem;
    padding: .35rem;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line));
    background: var(--chrome-solid, var(--surface));
    box-shadow: var(--shadow);
    font-size: .82rem;
    color: var(--ink);
  }
  .title {
    margin: .1rem .35rem .25rem;
    font-size: .68rem;
    text-transform: uppercase;
    letter-spacing: .1em;
    color: var(--ink-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .card-menu button {
    display: flex;
    justify-content: space-between;
    gap: .5rem;
    width: 100%;
    min-height: 34px;
    padding: .35rem .5rem;
    border: 1px solid transparent;
    border-radius: 8px;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .card-menu button:hover,
  .card-menu button:focus-visible {
    background: color-mix(in srgb, var(--accent) 18%, var(--surface));
    border-color: color-mix(in srgb, var(--accent) 40%, transparent);
  }
  .card-menu button:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
  .card-menu button:disabled { opacity: .55; cursor: default; }
  .empty { margin: .2rem .5rem .3rem; font-size: .76rem; color: var(--ink-muted); }
  hr { border: 0; border-top: 1px solid var(--line); margin: .25rem 0; }
</style>
