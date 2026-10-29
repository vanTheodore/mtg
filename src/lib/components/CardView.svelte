<script lang="ts">
  import { cardImageLookup, isHidden, manaText, typeLine } from '#lib/game/cards.ts';
  import { resolveCardImage, type ImageFailureReason } from '#lib/game/scryfall.ts';
  import type { CardMeta, GameObject } from '#lib/engine/types.ts';

  let {
    object,
    meta,
    selected = false,
    compact = false,
    onselect,
    oninspect
  }: {
    object: GameObject;
    meta?: CardMeta;
    selected?: boolean;
    compact?: boolean;
    onselect?: (id: number) => void;
    oninspect?: (id: number) => void;
  } = $props();

  const hidden = $derived(isHidden(object));
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
    data-card-id={object.id}
    data-hidden={String(hidden)}
    role="button"
    tabindex="0"
    data-image-state={imageState}
    aria-label={hidden ? 'Carta oculta' : undefined}
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
          <span class="fallback-cost">{manaText(object.mana_cost ?? meta?.mana_cost)}</span>
        </div>
        <div class="fallback-type">{typeLine(object, meta)}</div>
        <div class="fallback-art" aria-hidden="true">
          {#if imageState === 'resolving' || imageState === 'loading-art'}<span class="spinner"></span>{:else}<span>◇</span>{/if}
        </div>
        <p class="fallback-text">{object.oracle_text ?? meta?.oracle_text ?? ''}</p>
        {#if object.power != null && object.toughness != null}
          <span class="fallback-pt">{object.power}/{object.toughness}</span>
        {/if}
        {#if imageState === 'error' && failureReason}<span class="art-status">{failureLabels[failureReason]}</span>
        {:else if imageState === 'resolving' || imageState === 'loading-art'}<span class="art-status">Buscando ilustración…</span>{/if}
      </div>
    {/if}
    {#if object.tapped && !hidden}<span class="badge tapped-badge">Girada</span>{/if}
    {#if object.transformed && !hidden}<span class="badge transform-badge">Transformada</span>{/if}
    {#if object.attachments?.length}<span class="badge attach-badge">+{object.attachments.length}</span>{/if}
  </div>
  {#if !hidden && imageState === 'error'}
    <button class="retry" type="button" onclick={() => retryToken++}>Reintentar imagen</button>
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
  .card.selected { border-color: var(--accent); }
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
  .fallback-text { margin: 0; font-size: .62rem; line-height: 1.25; max-height: 4.5em; overflow: hidden; }
  .fallback-pt { align-self: flex-end; font-size: .72rem; font-weight: 700; }
  .art-status { font-size: .58rem; color: var(--ink-muted); }
  .retry { position: absolute; left: 50%; bottom: .35rem; transform: translateX(-50%); z-index: 2; font-size: .62rem; padding: .15rem .35rem; border: 1px solid var(--line); border-radius: 5px; background: var(--surface-2); color: var(--ink); white-space: nowrap; }
  .badge { position: absolute; z-index: 2; font-size: .6rem; padding: .1rem .3rem; border-radius: 5px; background: var(--accent); color: var(--accent-ink); font-weight: 650; }
  .tapped-badge { top: -8px; right: -6px; }
  .transform-badge { bottom: -8px; left: -6px; }
  .attach-badge { top: -8px; left: -6px; background: var(--surface-3); color: var(--ink); }
  .spinner { width: 1rem; height: 1rem; border: 2px solid var(--line); border-top-color: var(--accent); border-radius: 50%; animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    .card { transition: none; }
    .spinner { animation-duration: 1.6s; }
  }
</style>
