<script lang="ts">
  /**
   * Attack-target picker — Phase's `controls/AttackTargetPicker.tsx`, reduced to
   * what a single table can show: the engine's per-attacker list of legal
   * defenders, anchored to the card that is attacking.
   *
   * What the port keeps: the options are exactly
   * `waiting_for.data.valid_attack_targets_by_attacker[id]` (the map the engine
   * already narrows with CR 508.1a–d), the chosen one is marked, and the picker
   * never validates or widens anything — `session.chooseAttackDestination`
   * re-checks the same list before writing the draft.
   *
   * What it deliberately does not port: upstream's bucket-per-target board with
   * stacks, steppers and even splits. That exists for multiplayer games where
   * several attackers must be spread over several defenders at once; Mesa
   * declares one attack at a time from the same engine list, and the decision
   * panel still carries the full action.
   */
  import { onMount, tick } from 'svelte';
  import { placePopover } from '#lib/ui/anchored.ts';
  import { attackLabel, attackTargets } from '#lib/game/interaction.ts';
  import { session } from '#lib/game/session.svelte.ts';
  import type { AttackTarget } from '#lib/engine/types.ts';

  let { objectId, anchor, onclose }: { objectId: number; anchor: DOMRect | null; onclose: () => void } = $props();

  const snapshot = $derived(session.snapshot);
  const object = $derived(snapshot?.state.objects[String(objectId)]);
  const objects = $derived(snapshot?.state.objects ?? {});
  const targets = $derived(attackTargets(snapshot, objectId));
  const chosen = $derived(session.attacks[String(objectId)] ?? null);

  const same = (a: AttackTarget | null, b: AttackTarget) => a !== null
    && a.type === b.type
    && JSON.stringify(a.data) === JSON.stringify(b.data);

  let items = $state<HTMLButtonElement[]>([]);

  /**
   * Placement uses the measured box, not a guess: a creature in the lower half
   * of the screen put a fixed-bottom placement off-screen (measured at
   * 1440×900: the box opened at y 890 and only its title row was visible).
   */
  let root = $state<HTMLElement | null>(null);
  let placed = $state<{ top: number; left: number } | null>(null);

  $effect(() => {
    const element = root;
    if (!element || !anchor) return;
    const box = element.getBoundingClientRect();
    placed = placePopover(anchor, { width: box.width, height: box.height }, {
      width: window.innerWidth,
      height: window.innerHeight
    });
  });

  const style = $derived(placed === null
    ? 'top: 0; left: 0; visibility: hidden'
    : `top: ${placed.top}px; left: ${placed.left}px`);

  function focusItem(index: number) {
    items[Math.max(0, Math.min(index, items.length - 1))]?.focus();
  }

  function onKeydown(event: KeyboardEvent) {
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key === 'ArrowDown') { event.preventDefault(); focusItem(current + 1); return; }
    if (event.key === 'ArrowUp') { event.preventDefault(); focusItem(current - 1); return; }
    if (event.key === 'Home') { event.preventDefault(); focusItem(0); return; }
    if (event.key === 'End') { event.preventDefault(); focusItem(items.length - 1); return; }
    if (event.key === 'Tab') close();
  }

  function close() {
    const id = objectId;
    onclose();
    // Focus goes back to the attacker, not to the document.
    queueMicrotask(() => {
      document.querySelector<HTMLElement>(`[data-card-id="${id}"]`)?.focus();
    });
  }

  function pick(target: AttackTarget) {
    session.chooseAttackDestination(objectId, target);
    close();
  }

  onMount(() => {
    void tick().then(() => focusItem(0));
    return () => {};
  });
</script>

<div
  class="attack-picker"
  role="menu"
  aria-label={object ? `A quién ataca ${object.name}` : 'A quién ataca'}
  {style}
  bind:this={root}
  tabindex="-1"
  onkeydown={onKeydown}
>
  <p class="title">{object?.name ?? 'Criatura'} ataca a…</p>
  {#each targets as target, i (i)}
    <button
      type="button"
      role="menuitemradio"
      aria-checked={same(chosen, target)}
      bind:this={items[i]}
      onclick={() => pick(target)}
    >
      {attackLabel(target, objects)}
    </button>
  {/each}
  {#if !targets.length}
    <p class="empty">El motor no ofrece destinos para esta criatura ahora.</p>
  {/if}
  {#if chosen}
    <hr />
    <button type="button" role="menuitem" bind:this={items[targets.length]} onclick={() => { session.removeAttack(objectId); close(); }}>
      No atacar
    </button>
  {/if}
</div>

<style>
  .attack-picker {
    position: fixed;
    z-index: 40;
    width: 240px;
    max-width: calc(100vw - 1rem);
    display: grid;
    gap: .15rem;
    padding: .35rem;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--danger-ink, var(--accent)) 45%, var(--line));
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
  .attack-picker button {
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
  .attack-picker button:hover,
  .attack-picker button:focus-visible {
    background: color-mix(in srgb, var(--accent) 18%, var(--surface));
    border-color: color-mix(in srgb, var(--accent) 40%, transparent);
  }
  .attack-picker button:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
  .attack-picker button[aria-checked='true'] {
    border-color: color-mix(in srgb, var(--accent) 60%, var(--line));
    background: color-mix(in srgb, var(--accent) 22%, var(--surface));
    font-weight: 700;
  }
  .empty { margin: .2rem .5rem .3rem; font-size: .76rem; color: var(--ink-muted); }
  hr { border: 0; border-top: 1px solid var(--line); margin: .25rem 0; }
</style>
