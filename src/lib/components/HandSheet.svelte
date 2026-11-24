<script lang="ts">
  /**
   * The phone hand: a full-screen sheet, not a drawer.
   *
   * Measured baseline (Chromium, /stress?hand=15, 390×844) before this sheet:
   * 2 cards visible of 15, ~1 988px of horizontal scrolling, and the card face
   * at 147px wide. The drawer was a horizontal strip showing two cards, so
   * reading the hand meant a marathon of swipes.
   *
   * This sheet inverts that: a grid of large cards, the whole hand on one
   * screenful of scrolling (vertical, which a thumb already understands), and
   * per-card explicit actions. It is inspired by Phase's `MobileHandDrawer`
   * (same pin) — full-screen panel, grid of cards, tap to act — but it is not a
   * copy: Phase opens a separate choice modal for multi-action cards and hides
   * non-playable cards behind long-press; here the actions live in a detail
   * panel that also carries the Oracle text, so inspection and casting do not
   * fight over the same gesture.
   *
   * Authority: every action rendered comes from `session.snapshot.legal` as
   * published by Phase. This component never derives legality, never counts
   * hand size for a rule, and dispatches through `session.dispatch`, which
   * serialises on its own queue and drops stale revisions in the session. It is
   * a view of the snapshot, never a second copy of the game state.
   */
  import { tick } from 'svelte';
  import HandSheetCard from './HandSheetCard.svelte';
  import { session } from '#lib/game/session.svelte.ts';
  import { actionsForObject, describeAction } from '#lib/game/actions.ts';
  import { isManaAction, manaActions, manualCast } from '#lib/game/interaction.ts';
  import { manaText } from '#lib/game/cards.ts';
  import type { CardMeta, GameObject, GameAction } from '#lib/engine/types.ts';

  let {
    objects,
    metas,
    title
  }: {
    objects: GameObject[];
    metas: Record<string, CardMeta>;
    title: string;
  } = $props();

  const open = $derived(session.handDrawerOpen);
  const snapshot = $derived(session.snapshot);

  let detailId = $state<number | null>(null);
  let sheetEl = $state<HTMLElement | undefined>();
  let detailEl = $state<HTMLElement | undefined>();
  let closeButton = $state<HTMLButtonElement | undefined>();
  let lastFocused = $state<HTMLElement | null>(null);

  /**
   * The detail card is resolved from the *current* snapshot, so a card that
   * leaves the hand (played, discarded, or hidden by a seat change) closes the
   * detail instead of rendering a stale object. This is the whole of the
   * staleness policy: there is no cached copy to invalidate.
   */
  const detail = $derived(detailId === null ? undefined : objects.find((o) => o.id === detailId));
  $effect(() => { if (open && detailId !== null && !detail) detailId = null; });
  $effect(() => { if (!open && detailId !== null) detailId = null; });

  /**
   * Opening moves focus into the sheet. The board behind is `inert`, so if
   * focus stayed on the trigger a keyboard or switch-control player would be
   * stranded outside every interactive region. Board.svelte keeps the sheet
   * outside `main.layout` for exactly this reason.
   */
  $effect(() => {
    if (!open) return;
    void tick().then(() => sheetEl?.querySelector<HTMLElement>('.sheet-close')?.focus());
  });

  /** Phase's own legality list for one object, split the way the panel does. */
  function actionsOf(id: number): GameAction[] {
    return actionsForObject(snapshot?.legal.by_object ?? {}, id);
  }
  function castsOf(id: number): GameAction[] {
    return actionsOf(id).filter((a) => a.type === 'CastSpell');
  }
  function manaOf(id: number): GameAction[] {
    return manaActions(snapshot, id);
  }
  function playLabel(objectId: number): string | null {
    const kinds = new Set(actionsOf(objectId).map((a) => a.type));
    if (kinds.has('CastSpell')) return 'Lanzar';
    if (kinds.has('PlayLand')) return 'Jugar tierra';
    if (kinds.has('ActivateAbility')) return 'Activar';
    if (kinds.has('Foretell')) return 'Predecir';
    if (castsOf(objectId).length) return 'Lanzar';
    if (manaOf(objectId).length) return 'Producir maná';
    return null;
  }
  function openCard(objectId: number) {
    lastFocused = (document.activeElement as HTMLElement | null) ?? null;
    detailId = objectId;
    void tick().then(() => detailEl?.querySelector<HTMLElement>('[data-detail-primary]')?.focus());
  }
  function closeDetail() {
    const back = lastFocused;
    detailId = null;
    void tick().then(() => back?.focus());
  }
  /**
   * The single obvious action for a card, dispatched straight from the grid.
   * Everything else (several casts, manual mana, abilities) opens the detail,
   * so a fast tap never guesses which of two options the player wanted.
   */
  function quickPlay(objectId: number) {
    const actions = actionsOf(objectId);
    const commit =
      actions.find((a) => a.type === 'PlayLand') ??
      (castsOf(objectId).length === 1 ? castsOf(objectId)[0] : undefined) ??
      (actions.filter((a) => a.type === 'ActivateAbility').length === 1
        ? actions.find((a) => a.type === 'ActivateAbility')
        : undefined);
    if (!commit) { openCard(objectId); return; }
    void play(commit);
  }

  /**
   * Dispatch, then hand the player back to the table only if the engine
   * accepted it.
   *
   * Closing on success and staying on failure is the difference between "your
   * card resolved, here is the prompt it opened" and "that was rejected while
   * you were looking at a full-screen sheet". `session.dispatch` resolves
   * after the reply is applied, so the revision tells us which happened — and
   * a double tap is refused before that, by `busy`.
   */
  async function play(action: GameAction) {
    if (session.busy) return;
    const before = session.snapshot?.revision ?? -1;
    detailId = null;
    await session.dispatch(action);
    await tick();
    if ((session.snapshot?.revision ?? -1) <= before) return;
    /*
     * The action this play unlocked is the next thing the player needs: focus
     * it before closing, and wait for it to exist. After a land drop the panel
     * may keep showing the previous prompt for one commit, and focusing a
     * button that is about to be replaced leaves focus on `<body>` — measured
     * in Mesa CI, where the focused element was `.actions button` at a moment
     * when that node had already been swapped out.
     */
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const panel = document.querySelector('section[aria-label="Decisión pendiente"]');
      const target = panel?.querySelector<HTMLButtonElement>(
        '[aria-label^="Carta seleccionada"] .actions button:not([disabled]), .actions button:not([disabled])'
      );
      if (target) target.focus();
      if (target && document.activeElement === target) break;
      if ((session.snapshot?.revision ?? -1) > before && target) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    session.setHandDrawer(false);
  }

  function close() {
    session.setHandDrawer(false);
  }

  /**
   * Escape is the sheet's, and only the sheet's. The board behind is `inert`,
   * so a listener on the sheet element would miss the key whenever focus sat
   * on `<body>` (for example after a card was dispatched). One window listener
   * here replaces the one Board.svelte used to keep: two handlers on the same
   * key reopened race conditions and stole focus.
   */
  $effect(() => {
    if (!open) return;
    const onWindowKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // A native modal (the enlarged card) owns Escape while it is open: it
      // was shown on top of the sheet, so it is what the player means.
      if (document.querySelector('dialog[open]')) return;
      event.preventDefault();
      if (detailId !== null) { closeDetail(); return; }
      close();
    };
    window.addEventListener('keydown', onWindowKey);
    return () => window.removeEventListener('keydown', onWindowKey);
  });

  /**
   * Focus lives inside the sheet while it is open, and Escape leaves.
   * `session.setHandDrawer(false)` is the only close path so the trigger keeps
   * ownership of focus restoration (Hand.svelte focuses it back).
   */
  function onkeydown(event: KeyboardEvent) {
    if (event.key !== 'Tab' || !sheetEl) return;
    const focusable = [...sheetEl.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
      .filter((el) => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
</script>

{#if open}
  <div
    class="hand-sheet"
    role="dialog"
    aria-modal="true"
    aria-label={`${title}. Hoja de la mano.`}
    tabindex="-1"
    bind:this={sheetEl}
    onkeydown={onkeydown}
  >
    <header class="sheet-head">
      <div class="sheet-title">
        <h2>{title}</h2>
        <p class="sheet-sub">{objects.length} {objects.length === 1 ? 'carta' : 'cartas'}</p>
      </div>
      <button class="sheet-close" type="button" bind:this={closeButton} onclick={close} aria-label="Cerrar la mano y volver al tablero">
        Volver al tablero
      </button>
    </header>

    <div class="sheet-grid" role="list" aria-label="Cartas en la mano">
      {#each objects as object (object.id)}
        <div class="sheet-cell" role="listitem">
          <HandSheetCard
            {object}
            meta={metas[object.printed_ref?.oracle_id ?? ''] ?? metas[object.name.toLowerCase()]}
            costLabel={manaText(snapshot?.legal.spell_costs[String(object.id)] ?? object.mana_cost)}
            playLabel={playLabel(object.id)}
            playCount={castsOf(object.id).length}
            busy={session.busy}
            onplay={() => quickPlay(object.id)}
            onopen={() => openCard(object.id)}
            oninspect={() => { session.inspect = object.id; }}
          />
        </div>
      {:else}
        <p class="sheet-empty" role="listitem">Tu mano está vacía.</p>
      {/each}
    </div>

    {#if detail}
      <section class="sheet-detail" aria-label={`Detalle de ${detail.name}`} bind:this={detailEl}>
        <header class="detail-head">
          <h3>{detail.name}</h3>
          <button type="button" class="detail-back" data-detail-primary onclick={closeDetail} aria-label="Volver a la mano">Volver</button>
        </header>
        <p class="detail-text" lang={detail.oracle_text ? 'en' : undefined}>
          {detail.oracle_text ?? 'Sin texto de reglas publicado por Phase para esta carta.'}
        </p>
        <div class="detail-actions">
          {#each castsOf(detail.id) as action, i (i)}
            <button type="button" class="primary" disabled={session.busy} onclick={() => play(action)}>
              Lanzar{castsOf(detail.id).length > 1 ? ` · opción ${i + 1}` : ''}
            </button>
            <button type="button" disabled={session.busy} onclick={() => play(manualCast(action))}>Elegir maná manualmente</button>
          {/each}
          {#each actionsOf(detail.id).filter((a) => a.type !== 'CastSpell' && !isManaAction(a)) as action, i (i)}
            <button type="button" disabled={session.busy} onclick={() => play(action)}>{describeAction(action, snapshot?.state.objects ?? {})}</button>
          {/each}
          {#each manaOf(detail.id) as action, i (i)}
            <button type="button" disabled={session.busy} onclick={() => play(action)}>{describeAction(action, snapshot?.state.objects ?? {})}</button>
          {/each}
          {#if !actionsOf(detail.id).length && !manaOf(detail.id).length}
            <p class="detail-idle">Phase no ofrece ninguna acción para esta carta ahora.</p>
          {/if}
        </div>
      </section>
    {/if}
  </div>
{/if}

<style>
  /*
   * Full-screen sheet. `100dvh` follows the browser chrome on phones; the safe
   * area insets keep the last row clear of the home indicator and the first
   * row clear of the notch. In landscape (844×390) the grid simply gains
   * columns instead of growing taller.
   */
  .hand-sheet {
    position: fixed;
    inset: 0;
    /*
     * Above the trigger's own `.hand-zone` (also z-index 60 and later in the
     * DOM, so it would paint over the sheet) and above the board. Measured:
     * equal z-index made elementFromPoint hit the empty `.hand-zone`.
     */
    z-index: 70;
    display: flex;
    flex-direction: column;
    gap: .5rem;
    background: var(--surface);
    padding:
      calc(.5rem + env(safe-area-inset-top, 0px))
      calc(.6rem + env(safe-area-inset-right, 0px))
      calc(.5rem + env(safe-area-inset-bottom, 0px))
      calc(.6rem + env(safe-area-inset-left, 0px));
    height: 100dvh;
    overflow: hidden;
  }
  .sheet-head { display: flex; align-items: center; gap: .6rem; flex: 0 0 auto; }
  .sheet-title { min-width: 0; }
  .sheet-title h2 { margin: 0; font-size: .95rem; font-weight: 700; }
  .sheet-sub { margin: 0; font-size: .74rem; color: var(--ink-muted); }
  .sheet-close {
    margin-left: auto;
    min-height: 44px;
    padding: .4rem .8rem;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--surface-2);
    color: var(--ink);
    font-size: .8rem;
    font-weight: 650;
    white-space: nowrap;
  }
  /*
   * The grid is the whole point: `auto-fill` with a floor of 132px gives two
   * large columns at 320px, two at 390px, three at 640px, and five in
   * landscape. The card is never below ~132px wide, and never stretched past
   * ~1fr of a row.
   */
  .sheet-grid {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(132px, 100%), 1fr));
    gap: .55rem;
    min-width: 0;
    padding-bottom: .4rem;
  }
  .sheet-cell { min-width: 0; }
  .sheet-empty { margin: 1rem 0; color: var(--ink-muted); font-size: .88rem; }

  /*
   * The detail sheet is a panel over the grid, not a route: the player keeps
   * their scroll position in the hand behind it, which is the "return to where
   * you were" the brief asks for.
   */
  .sheet-detail {
    position: absolute;
    inset: auto 0 0 0;
    max-height: 82dvh;
    display: flex;
    flex-direction: column;
    gap: .45rem;
    padding: .6rem .7rem calc(.7rem + env(safe-area-inset-bottom, 0px));
    background: var(--surface-2);
    border-top: 1px solid var(--line);
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -14px 34px rgb(0 0 0 / 34%);
    overflow-y: auto;
  }
  .detail-head { display: flex; align-items: center; gap: .5rem; }
  .detail-head h3 { margin: 0; font-size: .95rem; }
  .detail-back {
    margin-left: auto;
    min-height: 44px;
    padding: .3rem .8rem;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink);
    font-size: .8rem;
    font-weight: 650;
  }
  .detail-text { margin: 0; font-size: .84rem; line-height: 1.35; white-space: pre-line; }
  .detail-actions { display: flex; flex-direction: column; gap: .4rem; }
  .detail-actions button {
    min-height: 44px;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink);
    font-size: .84rem;
    font-weight: 600;
    padding: .4rem .6rem;
  }
  .detail-actions button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); font-weight: 700; }
  .detail-idle { margin: 0; color: var(--ink-muted); font-size: .82rem; }

  /*
   * Landscape keeps the same 132px floor: at 844×390 that is five columns of
   * ~155px, which still reads. Shrinking the floor to 112px bought a sixth
   * column and a smaller face — a worse card, for a number that was never the
   * constraint.
   */
  @media (orientation: landscape) and (max-height: 500px) {
    .sheet-detail { max-height: 92dvh; }
  }
  @media (prefers-reduced-motion: no-preference) {
    .sheet-detail { animation: detail-in .16s ease-out; }
    @keyframes detail-in { from { transform: translateY(8%); opacity: .7; } to { transform: none; opacity: 1; } }
  }
</style>
