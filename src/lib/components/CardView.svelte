<script lang="ts">
  import { cardImageLookup, isHidden, manaText, typeLine } from '#lib/game/cards.ts';
  import { resolveCardImage, type ImageFailureReason } from '#lib/game/scryfall.ts';
  import type { CardMeta, GameObject } from '#lib/engine/types.ts';
  import { combatRole as roleLabel, keywordLabel, permanentStates } from '#lib/game/interaction.ts';

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
    blockOptions = 0
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
  } = $props();
  const hidden = $derived(isHidden(object));
  const states = $derived([...permanentStates(object, combat), ...(copy ? ['Copia'] : []), ...keywords.map(keywordLabel)]);
  // The accessible name mirrors the visible face in DOM order: axe's
  // label-content-name-mismatch (WCAG 2.5.3) requires visible text to be part
  // of the name, and a card face has several visible fields.
  const visibleName = $derived.by(() => {
    const cost = manaText(object.mana_cost ?? meta?.mana_cost);
    const type = typeLine(object, meta);
    const rules = object.oracle_text ?? object.token_rules_text ?? meta?.oracle_text ?? '';
    const pt = object.power != null && object.toughness != null ? `${object.power}/${object.toughness}` : '';
    const art = imageState === 'error' && failureReason ? failureLabels[failureReason] : imageState === 'resolving' || imageState === 'loading-art' ? 'Buscando ilustración' : '';
    return [object.name || meta?.name || 'Carta', cost, type, rules, pt, art, ...states, selectLabel].filter(Boolean).join(', ');
  });
  const accessibleName = $derived(hidden ? 'Carta oculta' : visibleName);
  const lookup = $derived.by(() => {
    const base = cardImageLookup(object);
    if (hidden || base.kind === 'token') return base;
    return { ...base, oracleId: base.oracleId ?? meta?.oracle_id ?? undefined, faceName: base.faceName ?? meta?.name };
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
    role="button"
    tabindex="0"
    data-image-state={imageState}
    aria-label={accessibleName}
    aria-pressed={selected}
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
          <span class="fallback-cost" aria-hidden="true">{manaText(object.mana_cost ?? meta?.mana_cost)}</span>
        </div>
        <div class="fallback-type" aria-hidden="true">{typeLine(object, meta)}</div>
        <div class="fallback-art" aria-hidden="true">
          {#if imageState === 'resolving' || imageState === 'loading-art'}<!-- The glyph is decorative and lives in CSS so it never becomes text content. --><span class="spinner"></span>{/if}
        </div>
        <p class="fallback-text" aria-hidden="true">{object.oracle_text ?? object.token_rules_text ?? meta?.oracle_text ?? ''}</p>
        {#if object.power != null && object.toughness != null}
          <span class="fallback-pt" aria-hidden="true">{object.power}/{object.toughness}</span>
        {/if}
        {#if imageState === 'error' && failureReason}<span class="art-status" aria-hidden="true">{failureLabels[failureReason]}</span>
        {:else if imageState === 'resolving' || imageState === 'loading-art'}<span class="art-status" aria-hidden="true">Buscando ilustración…</span>{/if}
      </div>
    {/if}
    {#if !hidden && states.length}
      <div class="status-strip" aria-hidden="true">
        {#each states as state (state)}<span class="badge" class:combat-badge={state === 'Atacando' || state === 'Bloqueando'}>{state}</span>{/each}
      </div>
    {/if}
  </div>
  {#if !hidden}
    <div class="card-tools">
      <button class="inspect" type="button" aria-label={`Ampliar ${object.name}`} onclick={() => oninspect?.(object.id)}>Ampliar</button>
      {#if imageState === 'error'}<button class="retry" type="button" onclick={() => retryToken++}>Reintentar imagen</button>{/if}
    </div>
  {/if}
</div>

<style>
  .card-shell { position: relative; width: var(--card-w); flex: 0 0 auto; }
  .card-shell.compact { width: calc(var(--card-w) * .78); }
  .card {
    position: relative;
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
  .card.targetable { border-color: var(--ok); box-shadow: 0 0 0 2px color-mix(in srgb, var(--ok) 25%, transparent); }
  .card.targetable::after { content: "◎"; position: absolute; right: .25rem; top: .25rem; z-index: 3; background: var(--surface); color: var(--ok); border-radius: 50%; padding: .1rem .25rem; font-weight: 800; }
  .card img { position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; object-fit: cover; border-radius: calc(var(--card-radius) - 2px); display: block; opacity: 0; }
  .card img.loaded { opacity: 1; }
  .card img.tapped-img { transform: rotate(90deg) scale(.78); }
  .back { width: 100%; height: 100%; border-radius: calc(var(--card-radius) - 2px); background: repeating-linear-gradient(45deg, var(--surface-3), var(--surface-3) 8px, var(--surface-2) 8px, var(--surface-2) 16px); display: grid; place-content: center; gap: .4rem; text-align: center; }
  .back-mark { font-size: 2rem; font-weight: 700; color: var(--accent); }
  .back-text { font-size: .72rem; color: var(--ink-muted); }
  .fallback { width: 100%; height: 100%; border-radius: calc(var(--card-radius) - 2px); background: var(--surface); border: 1px solid var(--line); display: flex; flex-direction: column; padding: .45rem; gap: .25rem; text-align: left; overflow: hidden; }
  .fallback-head { display: flex; justify-content: space-between; gap: .25rem; align-items: baseline; }
  .fallback-name { font-weight: 650; font-size: .78rem; line-height: 1.15; }
  .fallback-cost { font-size: .68rem; color: var(--ink-muted); white-space: nowrap; }
  .fallback-type { font-size: .66rem; color: var(--ink-muted); }
  .fallback-art { flex: 1; min-height: 2rem; display: grid; place-items: center; background: var(--surface-2); border-radius: 6px; color: var(--accent); font-size: 1.4rem; }
  .fallback-art::after { content: '◇'; }
  .fallback-text { margin: 0; font-size: .62rem; line-height: 1.25; max-height: 4.5em; overflow: hidden; }
  .fallback-pt { align-self: flex-end; font-size: .72rem; font-weight: 700; }
  .art-status { font-size: .58rem; color: var(--ink-muted); }
  .card-tools { display: flex; flex-wrap: wrap; gap: .25rem; margin-top: .25rem; }
  .card-tools button { font-size: .65rem; padding: .2rem .35rem; border: 1px solid var(--line); border-radius: 5px; background: var(--surface-2); color: var(--ink); min-height: 24px; }
  .status-strip { position: absolute; z-index: 2; left: .2rem; bottom: .2rem; right: .2rem; display: flex; flex-wrap: wrap; gap: .2rem; align-content: flex-end; pointer-events: none; }
  .badge { font-size: .6rem; padding: .1rem .3rem; border-radius: 5px; background: color-mix(in srgb, var(--surface) 88%, transparent); border: 1px solid var(--line); color: var(--ink); font-weight: 650; }
  .combat-badge { background: var(--accent); color: var(--accent-ink); }
  .spinner { width: 1rem; height: 1rem; border: 2px solid var(--line); border-top-color: var(--accent); border-radius: 50%; animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    .card { transition: none; }
    .spinner { animation-duration: 1.6s; }
  }
</style>
