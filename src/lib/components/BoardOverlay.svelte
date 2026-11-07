<script lang="ts">
  /**
   * The line layer of the table — Phase's target, stack and combat arcs.
   *
   * Ported in spirit from Phase `targeting/TargetingOverlay.tsx`,
   * `board/AttackTargetLines.tsx`, `board/BlockAssignmentLines.tsx` and
   * `stack/StackTargetArcs.tsx` (commit `f671692…`, MIT OR Apache-2.0), without
   * React, portals or framer-motion.
   *
   * Three properties matter more than the looks:
   *
   * 1. **The engine draws the lines.** Every endpoint is a point the DOM
   *    occupies and every target comes from the snapshot. An arc that is not
   *    offered by Phase is impossible, so this layer can never imply a legal
   *    move the engine would reject.
   * 2. **It costs no layout.** The SVG is fixed and `pointer-events: none`, and
   *    measuring writes to local state only. The board's measured vertical
   *    budget (docs/ARENA-1.0-BOARD.md) is untouched.
   * 3. **It is decorative.** `aria-hidden`, no focus stops: the same targets
   *    are already announced by the cards, the seat buttons and the decision
   *    panel. A screen reader does not need a second, incomplete copy.
   */
  import { onMount, tick } from 'svelte';
  import { session } from '#lib/game/session.svelte.ts';
  import { boardLines, type Anchors, type BoardLine } from '#lib/ui/board-lines.ts';
  import { withArcPaths, type Point } from '#lib/ui/arc.ts';

  let anchors = $state<Anchors>({ objects: {}, players: {} });
  const snapshot = $derived(session.snapshot);
  const lines = $derived(boardLines(snapshot, anchors, { attacks: session.attacks, blocks: session.blocks }));
  /**
   * Parallel layers must not hide each other: a stack object's declared target
   * and the legal targets offered for the same spell can share both anchors
   * exactly (measured in /ux?scene=targets: two arcs, one visible). Stack arcs
   * bow the opposite way; everything else keeps Phase's curve.
   */
  const BEND_FOR: Record<BoardLine['kind'], number> = {
    target: 1,
    chosen: 1,
    stack: -0.62,
    attack: 0.55,
    'attack-draft': 0.55,
    block: 0.8,
    'block-draft': 0.8
  };
  const drawn = $derived(withArcPaths(lines, (line) => BEND_FOR[line.kind]));

  /** Markers are filled explicitly: SVG marker paint cannot read a CSS class. */
  const MARKER_FOR: Record<BoardLine['kind'], string> = {
    target: 'gold',
    chosen: 'gold',
    stack: 'violet',
    attack: 'red',
    'attack-draft': 'orange',
    block: 'cyan',
    'block-draft': 'cyan'
  };

  function center(rect: DOMRect): Point {
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  /** The board region, never a dialog or the hand drawer's duplicate faces. */
  function scope(): ParentNode {
    return document.querySelector<HTMLElement>('[data-board-region]') ?? document;
  }

  function sameAnchors(a: Anchors, b: Anchors): boolean {
    const keys = Object.keys(a.objects);
    if (keys.length !== Object.keys(b.objects).length) return false;
    if (Object.keys(a.players).length !== Object.keys(b.players).length) return false;
    for (const key of keys) {
      const left = a.objects[key];
      const right = b.objects[key];
      if (!right || Math.abs(left.x - right.x) > 0.5 || Math.abs(left.y - right.y) > 0.5) return false;
    }
    for (const key of Object.keys(a.players)) {
      const left = a.players[key];
      const right = b.players[key];
      if (!right || Math.abs(left.x - right.x) > 0.5 || Math.abs(left.y - right.y) > 0.5) return false;
    }
    return true;
  }

  /**
   * Read the anchors the cards and seats actually occupy.
   *
   * `querySelectorAll` order is DOM order, so the first face for an object id
   * wins. A card with a zero-area box (inside a closed disclosure, during the
   * first frame) is skipped instead of anchoring at (0, 0).
   */
  function measure() {
    if (typeof document === 'undefined') return;
    const root = scope();
    const objects: Record<string, Point> = {};
    root.querySelectorAll<HTMLElement>('[data-card-id]').forEach((element) => {
      const id = element.dataset.cardId;
      if (!id || objects[id]) return;
      const rect = element.getBoundingClientRect();
      if (!rect.width && !rect.height) return;
      objects[id] = center(rect);
    });
    const players: Record<string, Point> = {};
    root.querySelectorAll<HTMLElement>('[data-player-id]').forEach((element) => {
      const id = element.dataset.playerId;
      if (!id || players[id]) return;
      const rect = element.getBoundingClientRect();
      if (!rect.width && !rect.height) return;
      players[id] = center(rect);
    });
    const next = { objects, players };
    if (!sameAnchors(anchors, next)) anchors = next;
  }

  // Re-measure after every board commit. The revision covers engine state; the
  // preference values cover a card resizing under the same state.
  $effect(() => {
    snapshot?.revision;
    snapshot?.state.waiting_for;
    session.attacks;
    session.blocks;
    session.selected;
    session.inspect;
    session.cardScale;
    session.density;
    session.boardStyle;
    session.handDrawerOpen;
    void tick().then(measure);
  });

  onMount(() => {
    measure();
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    window.addEventListener('resize', schedule);
    // Capture: the hand strip and the battlefield's own scrollports both move
    // anchors without resizing the document.
    window.addEventListener('scroll', schedule, true);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    if (observer) {
      observer.observe(document.documentElement);
      const region = document.querySelector<HTMLElement>('[data-board-region]');
      if (region) observer.observe(region);
    }
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      observer?.disconnect();
    };
  });
</script>

{#if snapshot && drawn.length}
  <svg
    class="board-overlay"
    data-lines={drawn.length}
    aria-hidden="true"
    focusable="false"
    preserveAspectRatio="none"
  >
    <defs>
      <marker id="mesa-arc-gold" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
        <path d="M0,0 L7,3.5 L0,7 Z" fill="#d8a35d"></path>
      </marker>
      <marker id="mesa-arc-violet" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
        <path d="M0,0 L7,3.5 L0,7 Z" fill="#a78bfa"></path>
      </marker>
      <marker id="mesa-arc-red" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
        <path d="M0,0 L7,3.5 L0,7 Z" fill="#ef4444"></path>
      </marker>
      <marker id="mesa-arc-orange" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
        <path d="M0,0 L7,3.5 L0,7 Z" fill="#fb923c"></path>
      </marker>
      <marker id="mesa-arc-cyan" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
        <path d="M0,0 L7,3.5 L0,7 Z" fill="#38bdf8"></path>
      </marker>
    </defs>
    {#each drawn as line (line.key)}
      <g class="arc" data-kind={line.kind}>
        <!-- Dark underlay first: the lines cross card art, and a single thin
             stroke disappears on light illustrations. -->
        <path class="halo" d={line.d}></path>
        <path
          class="stroke"
          d={line.d}
          stroke-dasharray={line.dashed ? '9 7' : undefined}
          marker-end={`url(#mesa-arc-${MARKER_FOR[line.kind]})`}
        ></path>
      </g>
    {/each}
  </svg>
{/if}

<style>
  /*
   * `position: fixed` matches the viewport coordinates `measure()` reads from
   * `getBoundingClientRect()`. Painting above the table but below dialogs keeps
   * the overlay out of the way of the handoff and the zone viewer.
   */
  .board-overlay {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 4;
    pointer-events: none;
    overflow: visible;
  }
  .halo {
    fill: none;
    stroke: rgb(8 12 18 / 55%);
    stroke-width: 5;
    stroke-linecap: round;
  }
  .stroke {
    fill: none;
    stroke-width: 2.2;
    stroke-linecap: round;
  }
  .arc[data-kind='target'] .stroke { stroke: #d8a35d; opacity: .85; }
  .arc[data-kind='chosen'] .stroke { stroke: #d8a35d; stroke-width: 3; }
  .arc[data-kind='stack'] .stroke { stroke: #a78bfa; stroke-width: 2.4; }
  .arc[data-kind='attack'] .stroke { stroke: #ef4444; stroke-width: 2.8; }
  .arc[data-kind='attack-draft'] .stroke { stroke: #fb923c; stroke-width: 2.4; }
  .arc[data-kind='block'] .stroke { stroke: #38bdf8; stroke-width: 2.4; }
  .arc[data-kind='block-draft'] .stroke { stroke: #38bdf8; stroke-width: 2.2; opacity: .85; }
  /* The engine can ask for a target while a dialog covers the board; the arcs
     follow the anchors, which are then zero-area and already skipped. */
  @media (prefers-reduced-motion: reduce) {
    .board-overlay { transition: none; }
  }
</style>
