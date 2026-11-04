<script lang="ts">
  import { cardImageLookup, isHidden, manaText, typeLine } from '#lib/game/cards.ts';
  import { resolveCardImage, type ImageFailureReason } from '#lib/game/scryfall.ts';
  import type { CardMeta, GameObject } from '#lib/engine/types.ts';
  import { combatRole as roleLabel, keywordLabel, permanentStates } from '#lib/game/interaction.ts';
  import { impressions } from '#lib/game/impressions.svelte.ts';
  import { session } from '#lib/game/session.svelte.ts';

  let {
    object,
    meta,
    selected = false,
    compact = false,
    onselect,
    oninspect,
    combat,
    keywords = [],
    copy = false,
    targetable = false,
    selectLabel,
    attackOptions = 0,
    blockOptions = 0,
    highlight = false
  }: {
    object: GameObject;
    meta?: CardMeta;
    selected?: boolean;
    compact?: boolean;
    onselect?: (id: number) => void;
    oninspect?: (id: number) => void;
    combat?: string;
    keywords?: unknown[];
    copy?: boolean;
    targetable?: boolean;
    selectLabel?: string;
    attackOptions?: number;
    blockOptions?: number;
    /** The tutorial points at this card: it gets a ring and a written cue. */
    highlight?: boolean;
  } = $props();
  const hidden = $derived(isHidden(object));
  // Published Spanish rules text when one exists for this exact card name; the
  // engine's English text (or none) is always the fallback.
  const rulesText = $derived(
    impressions.lookup.text(object.name)
      ?? object.oracle_text ?? object.token_rules_text ?? meta?.oracle_text ?? ''
  );
  const rulesLang = $derived(impressions.lookup.text(object.name) ? 'es' : 'en');
  const rulesDescriptionId = $props.id();
  const states = $derived([...permanentStates(object, combat), ...(copy ? ['Copia'] : []), ...keywords.map(keywordLabel)]);
  // The printed face itself supplies the accessible name. It stays in sync
  // as illustrations and statuses change; hidden cards retain their own safe
  // explicit label without exposing unknown faces.
  const lookup = $derived.by(() => {
    const base = cardImageLookup(object);
    if (hidden || base.kind === 'token') return base;
    return { ...base, oracleId: base.oracleId ?? meta?.oracle_id ?? undefined, faceName: base.faceName ?? meta?.name, language: session.cardImageLanguage };
  });
  let imageUrl = $state<string | null>(null);
  let imageState = $state<'resolving' | 'loading-art' | 'ready' | 'error' | 'hidden'>('resolving');
  let failureReason = $state<ImageFailureReason | null>(null);
  let retryToken = $state(0);
  const failureLabels: Record<ImageFailureReason, string> = {
    'no-identity': 'Sin identificador de imagen', 'not-found': 'Imagen no disponible',
    network: 'Sin conexión con el servicio de imágenes', 'rate-limit': 'Límite de imágenes; reintenta más tarde',
    server: 'Servicio de imágenes no disponible', 'invalid-response': 'Respuesta de imagen no válida',
    'image-download': 'No se pudo cargar la ilustración'
  };

  $effect(() => {
    const descriptor = lookup;
    const fresh = retryToken > 0;
    void retryToken;
    imageUrl = null;
    failureReason = null;
    if (hidden) { imageState = 'hidden'; return; }
    let cancelled = false;
    imageState = 'resolving';
    resolveCardImage(descriptor, fresh).then((result) => {
      if (cancelled) return;
      if (result.status === 'ready') { imageUrl = result.url; imageState = 'loading-art'; }
      else { failureReason = result.reason; imageState = 'error'; }
    });
    return () => { cancelled = true; };
  });

  function handleKey(event: KeyboardEvent) {
    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault();
      oninspect?.(object.id);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onselect?.(object.id);
    }
  }

</script>

<div class="card-shell" class:compact>
  <div
    class="card"
    class:selected
    class:tapped={object.tapped}
    class:targetable
    data-combat-role={combat ?? 'none'}
    data-targetable={String(targetable)}
    data-attack-options={attackOptions}
    data-block-options={blockOptions}
    data-zone={object.zone}
    data-card-id={object.id}
    data-hidden={String(hidden)}
    data-tutorial-focus={String(highlight)}
    role="button"
    tabindex="0"
    data-image-state={imageState}
    aria-label={hidden ? 'Carta oculta' : undefined}
    aria-describedby={!hidden && rulesText ? rulesDescriptionId : undefined}
    aria-pressed={selected}
    aria-current={highlight ? 'step' : undefined}
    onclick={() => onselect?.(object.id)}
    ondblclick={() => oninspect?.(object.id)}
    onkeydown={handleKey}
  >
    {#if hidden}
      <div class="back" aria-hidden="true">
        <span class="back-mark">M</span>
        <span class="back-text">Carta oculta</span>
      </div>
    {:else}
      {#if imageUrl}
        <img
          src={imageUrl}
          alt={object.name}
          loading="lazy"
          decoding="async"
          class:loaded={imageState === 'ready'}
          class:tapped-img={object.tapped}
          onload={() => { imageState = 'ready'; }}
          onerror={() => { imageState = 'error'; failureReason = 'image-download'; imageUrl = null; }}
        />
      {/if}
      <div class="fallback" aria-hidden={imageState === 'ready'}>
        <div class="fallback-head">
          <span class="fallback-name">{object.name || meta?.name || 'Carta'}</span>
          <span class="fallback-cost">{manaText(object.mana_cost ?? meta?.mana_cost)}</span>
        </div>
        <div class="fallback-type">{typeLine(object, meta)}</div>
        <div class="fallback-art">
          {#if imageState === 'error' && failureReason}
            <!-- The note lives in the empty art box: on the card face it was one
                 more cramped line pushing the rules text out (see
                 docs/screenshots/cartas-1440.png in 0.5.1). -->
            <span class="art-status">{failureLabels[failureReason]}</span>
          {:else if imageState === 'resolving' || imageState === 'loading-art'}
            <span class="spinner"></span><span class="art-status">Buscando ilustración…</span>
          {/if}
        </div>
        <p class="fallback-text" lang={rulesLang}>{rulesText}</p>
        {#if object.power != null && object.toughness != null}
          <span class="fallback-pt">{object.power}/{object.toughness}</span>
        {/if}
      </div>
    {/if}
    {#if !hidden && states.length}
      <div class="status-strip">
        {#each states as state (state)}<span class="badge" class:combat-badge={state === 'Atacando' || state === 'Bloqueando'}>{state}</span>{/each}
      </div>
    {/if}
  </div>
  {#if !hidden && rulesText}
    <!-- Outside the button: the name follows visible compact fields while
         the complete rules stay available as an accessible description. -->
    <span id={rulesDescriptionId} class="rules-description">{rulesText}</span>
  {/if}
  {#if !hidden}
    <!--
      The contextual tools live INSIDE the card box, anchored to its top-right
      corner. Two measured reasons (Chromium 1440×900, docs/ARENA-HAND-OVERFLOW-DIAGNOSTIC.md):
      a toolbar placed under the card added a full row of height to every
      permanent, and inside the hand's horizontal scrollport that row fell
      below the viewport (`hitTag: null` at y≈916 of 900). Anchoring it to the
      face keeps it inside the scrollport and out of the layout flow, while a
      click on the card's center still reaches the card itself.
    -->
    <div class="card-tools">
      <button class="inspect" type="button" aria-label={`Ampliar ${object.name}`} onclick={() => oninspect?.(object.id)}>Ampliar</button>
      {#if imageState === 'error'}<button class="retry" type="button" aria-label="Reintentar imagen" onclick={() => retryToken++}>Reintentar imagen</button>{/if}
    </div>
  {/if}
</div>

<style>
  .card-shell { position: relative; width: var(--card-w); flex: 0 0 auto; }
  .rules-description { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .card-shell.compact { width: calc(var(--card-w) * .78); }
  .card {
    position: relative;
    /* The face adapts to its own width, not to the window: the same card is
       148 px on a desktop board, 216 px in the inspect dialog and 112 px in a
       two-column 320 px board. */
    container-type: inline-size;
    width: 100%;
    aspect-ratio: 488 / 680;
    padding: 0;
    border: 2px solid transparent;
    border-radius: var(--card-radius);
    background: var(--surface-2);
    color: var(--ink);
    overflow: visible;
    box-shadow: var(--shadow);
    transition: border-color .12s ease, transform .12s ease;
    cursor: pointer;
  }
  .card.selected { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-dim); }
  /* The tutorial's pointer: a ring plus a written cue, never colour alone. */
  .card[data-tutorial-focus="true"] {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft), 0 0 0 6px var(--accent);
    animation: tutorial-pulse 1.6s ease-in-out infinite;
  }
  @keyframes tutorial-pulse {
    0%, 100% { box-shadow: 0 0 0 3px var(--accent-soft), 0 0 0 6px var(--accent); }
    50% { box-shadow: 0 0 0 3px var(--accent-soft), 0 0 0 9px color-mix(in srgb, var(--accent) 45%, transparent); }
  }
  @media (prefers-reduced-motion: reduce) {
    .card[data-tutorial-focus="true"] { animation: none; }
  }
  .card.targetable { border-color: var(--ok); box-shadow: 0 0 0 2px color-mix(in srgb, var(--ok) 25%, transparent); }
  .card.targetable::after { content: "◎"; position: absolute; right: .25rem; top: .25rem; z-index: 3; background: var(--surface); color: var(--ok); border-radius: 50%; padding: .1rem .25rem; font-weight: 800; }
  .card img { position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; object-fit: cover; border-radius: calc(var(--card-radius) - 2px); display: block; opacity: 0; }
  .card img.loaded { opacity: 1; }
  .card img.tapped-img { transform: rotate(90deg) scale(.78); }
  .back { width: 100%; height: 100%; border-radius: calc(var(--card-radius) - 2px); background: repeating-linear-gradient(45deg, var(--surface-3), var(--surface-3) 8px, var(--surface-2) 8px, var(--surface-2) 16px); display: grid; place-content: center; gap: .4rem; text-align: center; }
  .back-mark { font-size: 2rem; font-weight: 700; color: var(--accent); }
  .back-text { font-size: .72rem; color: var(--ink-muted); }
  /* The card's height comes from `aspect-ratio`; the fallback is out of flow so
     its content can never make one card taller than its neighbour (measured:
     lands came out ~80 px shorter than creatures on the same battlefield). */
  .fallback { position: absolute; inset: 0; height: 100%; border-radius: calc(var(--card-radius) - 2px); background: var(--surface); border: 1px solid var(--line); display: flex; flex-direction: column; padding: .45rem; gap: .25rem; text-align: left; overflow: hidden; }
  .fallback-head { display: flex; justify-content: space-between; gap: .25rem; align-items: baseline; }
  /* The mana cost must stay whole; a long name wraps, it does not push the
     cost past the card edge ("Hechizo 5 {2}{U}" lost its cost at 148 px). */
  .fallback-name { font-weight: 650; font-size: .78rem; line-height: 1.15; min-width: 0; overflow-wrap: anywhere; }
  .fallback-cost { font-size: .68rem; color: var(--ink-muted); white-space: nowrap; flex: 0 0 auto; }
  .fallback-type { font-size: .66rem; color: var(--ink-muted); }
  .fallback-art { flex: 1 1 0; min-height: 0; display: grid; place-items: center; align-content: center; gap: .15rem; background: var(--surface-2); border-radius: 6px; color: var(--accent); font-size: 1.4rem; padding: .1rem; text-align: center; }
  .fallback-art::after { content: '◇'; }
  .fallback-art:has(.art-status)::after { display: none; }
  .fallback-text { margin: 0; font-size: .62rem; line-height: 1.25; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 4; line-clamp: 4; -webkit-box-orient: vertical; }
  .fallback-pt { align-self: flex-end; font-size: .72rem; font-weight: 700; }
  /* The failure note is a full sentence; on a narrow card it must stay on one
     line instead of pushing into the badges below. */
  /* Below ~132 px of face there is no room for name + cost + type + art +
     rules + P/T at 1.25 card ratio (measured: content 150 px inside a 150 px
     box, art squeezed to 3 px). The rules text is what gets dropped, and it is
     still readable in "Ampliar" and the button's accessible description. */
  @container (max-width: 132px) {
    .fallback { padding: .3rem; gap: .15rem; }
    .fallback-name { font-size: .7rem; }
    .fallback-cost, .fallback-type { font-size: .58rem; }
    .fallback-text { display: none; }
    .fallback-pt { font-size: .66rem; }
    .fallback-art { min-height: 1.4rem; }
  }

  .art-status { font-size: .55rem; color: var(--ink-muted); line-height: 1.15; max-width: 100%; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
  /*
   * Contextual card tools.
   *
   * Measured (Chromium 1440×900, PR #41 diagnostic): a toolbar in normal flow
   * under the card costs one row per permanent on the battlefield AND, inside
   * the hand's horizontal scrollport, landed at y≈916 in a 900px viewport with
   * `elementFromPoint` returning null. It was "visible" to Playwright and
   * impossible to click for a person.
   *
   * So the toolbar is anchored to the card's own box (top-right corner), out
   * of the layout flow, with no permanent footprint. Two buttons per card is
   * still a wall of chrome on a 40-permanent board (counted: 80 buttons for 40
   * permanents), so it only appears on hover or keyboard focus; touch keeps it
   * visible because there is no hover there. The card center is never covered:
   * the buttons occupy a 1.55rem strip along the top edge only.
   */
  .card-tools {
    position: absolute;
    z-index: 11;
    inset-block-start: .18rem;
    inset-inline-end: .18rem;
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    gap: .15rem;
    width: max-content;
    max-width: calc(100% - .36rem);
    padding: 0;
    margin: 0;
    pointer-events: none;
    transition: opacity .12s ease;
  }
  .card-shell .card-tools { opacity: 1; }
  @media (hover: hover) and (pointer: fine) {
    .card-shell .card-tools { opacity: 0; }
    .card-shell:hover .card-tools,
    .card-shell:focus-within .card-tools { opacity: 1; }
    /* Only a hovered/focused card lets its buttons take the pointer. */
    .card-shell:hover .card-tools button,
    .card-shell:focus-within .card-tools button { pointer-events: auto; }
  }
  .card-tools button {
    box-sizing: border-box;
    width: 1.55rem;
    height: 1.55rem;
    min-width: 1.55rem;
    min-height: 1.55rem;
    padding: 0;
    font-size: 0;
    line-height: 1;
    flex: 0 0 auto;
    border: 1px solid var(--line);
    border-radius: 6px;
    color: var(--ink);
    background: var(--surface);
    box-shadow: var(--shadow);
    pointer-events: none;
  }
  /* The written label stays for assistive technology; the face shows a glyph. */
  .card-tools .inspect::before { content: "⤢"; font-size: 1rem; line-height: 1; }
  .card-tools .retry::before { content: "↻"; font-size: 1.15rem; line-height: 1; }
  /* Tablet and phone keep the wider toolbar in flow: no hover, bigger target. */
  @media (hover: none), (pointer: coarse) {
    .card-tools {
      position: static;
      width: auto;
      max-width: none;
      margin-top: .25rem;
      pointer-events: auto;
    }
    .card-tools button {
      pointer-events: auto;
      width: auto;
      height: auto;
      min-width: 2.25rem;
      min-height: 32px;
      padding: .2rem .4rem;
      font-size: .65rem;
    }
    .card-tools .inspect::before,
    .card-tools .retry::before { content: none; }
  }
  /*
   * Phones: the labelled in-flow strip costs ~40px on *every* card row and a
   * 390px wide battlefield measured 804px tall with it, which pushed the
   * opponent's side and the player's own permanents off screen. On a phone the
   * tools stay always visible and hit-testable (no hover is required — the
   * buttons take the pointer unconditionally), but they sit on the card's top
   * edge as 32×32 glyphs, exactly like the desktop toolbar, so a row is only
   * as tall as its card. The hand is deliberately excluded: its cards live in
   * the drawer's horizontal strip, where vertical space is free and the wider
   * labelled target is kept.
   */
  @media (max-width: 640px) and (hover: none) {
    :global(.battlefield) .card-tools {
      position: absolute;
      inset-block-start: .1rem;
      inset-inline-end: .1rem;
      width: max-content;
      max-width: calc(100% - .2rem);
      margin-top: 0;
      pointer-events: none;
    }
    :global(.battlefield) .card-tools button {
      width: 2rem;
      height: 2rem;
      min-width: 2rem;
      min-height: 2rem;
      padding: 0;
      font-size: 0;
      pointer-events: auto;
    }
    :global(.battlefield) .card-tools .inspect::before { content: "⤢"; font-size: .95rem; }
    :global(.battlefield) .card-tools .retry::before { content: "↻"; font-size: 1.05rem; }
  }
  .status-strip { position: absolute; z-index: 2; left: .2rem; bottom: .2rem; right: .2rem; display: flex; flex-wrap: wrap; gap: .2rem; align-content: flex-end; pointer-events: none; }
  /* The strip floats over the card, so the fallback has to leave that band
     empty: without this, "Girada" is painted on top of the rules text and the
     failure note (measured in docs/screenshots/cartas-1440.png before the fix). */
  .card:has(.status-strip) .fallback { padding-bottom: 2.1rem; }
  .badge { font-size: .6rem; padding: .1rem .3rem; border-radius: 5px; background: color-mix(in srgb, var(--surface) 88%, transparent); border: 1px solid var(--line); color: var(--ink); font-weight: 650; }
  .combat-badge { background: var(--accent); color: var(--accent-ink); }
  .spinner { width: 1rem; height: 1rem; border: 2px solid var(--line); border-top-color: var(--accent); border-radius: 50%; animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    .card { transition: none; }
    .spinner { animation-duration: 1.6s; }
  }
</style>
