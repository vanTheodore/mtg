<script lang="ts">
  import { onMount } from 'svelte';
  import Hand from './Hand.svelte';
  import Battlefield from './Battlefield.svelte';
  import DecisionPanel from './DecisionPanel.svelte';
  import StackPanel from './StackPanel.svelte';
  import InspectDialog from './InspectDialog.svelte';
  import Settings from './Settings.svelte';
  import CardView from './CardView.svelte';
  import { session } from '#lib/game/session.svelte.ts';
  import type { CardMeta, GameObject } from '#lib/engine/types.ts';

  let catalog = $state<unknown>(null);
  let metas = $state<Record<string, CardMeta>>({});
  let decks = $state<unknown>(null);
  let loadError = $state<string | null>(null);
  let seed = $state(42);
  let handoffButton = $state<HTMLButtonElement | undefined>();

  const snapshot = $derived(session.snapshot);
  const objects = $derived(snapshot?.state.objects ?? {});
  const viewer = $derived(snapshot?.viewer ?? 0);
  const opponent = $derived(viewer === 0 ? 1 : 0);
  const player = $derived(snapshot?.state.players[viewer]);
  const rival = $derived(snapshot?.state.players[opponent]);
  const handObjects = $derived((player?.hand ?? []).map((id) => objects[String(id)]).filter(Boolean) as GameObject[]);
  const rivalHand = $derived((rival?.hand ?? []).map((id) => objects[String(id)]).filter(Boolean) as GameObject[]);
  const graveyardObjects = $derived((player?.graveyard ?? []).map((id) => objects[String(id)]).filter(Boolean) as GameObject[]);
  const battlefieldObjects = $derived((snapshot?.state.battlefield ?? []).map((id) => objects[String(id)]).filter(Boolean) as GameObject[]);
  const needsHandoff = $derived(snapshot !== null && session.revealedViewer !== null && snapshot.viewer !== session.revealedViewer);

  $effect(() => {
    if (needsHandoff) handoffButton?.focus();
  });

  onMount(async () => {
    try {
      const [cards, meta, deckData] = await Promise.all([
        fetch('/data/cards.json').then((r) => r.ok ? r.json() : Promise.reject(new Error('Falta static/data/cards.json. Ejecuta bun run catalog:build.'))),
        fetch('/data/card-meta.json').then((r) => r.ok ? r.json() : {}),
        fetch('/data/decks.json').then((r) => r.ok ? r.json() : Promise.reject(new Error('Falta static/data/decks.json')))
      ]);
      catalog = cards;
      metas = meta as Record<string, CardMeta>;
      decks = deckData;
      const params = new URLSearchParams(location.search);
      if (params.has('autostart')) await start();
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    }
  });

  async function start() {
    if (!catalog || !decks) return;
    await session.start(catalog, decks, seed);
  }

  const cardWidth = $derived(Math.round(148 * session.cardScale));
</script>

<svelte:head><title>Mesa · Cliente MTG</title></svelte:head>

<div class="app" style="--card-w: {cardWidth}px" data-density={session.density} data-actions-applied={snapshot?.actions_applied ?? 0} data-viewer={viewer}>
  <header class="topbar">
    <div class="brand">
      <span class="mark" aria-hidden="true">M</span>
      <div>
        <h1>Mesa</h1>
        <p>Cliente MTG · motor Phase</p>
      </div>
    </div>
    <div class="top-actions">
      {#if snapshot}
        <span class="seat">Jugador {viewer + 1}</span>
      {/if}
      <Settings />
    </div>
  </header>

  {#if loadError}
    <div class="notice error" role="alert">{loadError}</div>
  {/if}
  {#if session.error}
    <div class="notice error" role="alert">{session.error}</div>
  {/if}

  {#if !snapshot}
    <section class="start-panel">
      <h2>Partida local de dos jugadores</h2>
      <p>Motor de reglas Rust/WASM real. Sin IA todavía: ambos asientos se juegan en el mismo dispositivo con paso de asiento seguro.</p>
      <label>Semilla <input type="number" bind:value={seed} min="0" step="1" /></label>
      <button type="button" class="primary" disabled={!catalog || !decks || session.status === 'loading'} onclick={start}>
        {session.status === 'loading' ? 'Inicializando motor…' : 'Iniciar partida'}
      </button>
      {#if session.status === 'loading'}<p class="muted">Descargando y compilando WASM, cargando catálogo mínimo…</p>{/if}
    </section>
  {:else}
    <main class="layout" inert={needsHandoff} aria-hidden={needsHandoff}>
      <section class="rival-bar" aria-label="Rival">
        <div class="life" class:low={rival && rival.life <= 5}>
          <span class="life-label">Jugador {opponent + 1}</span>
          <span class="life-value">{rival?.life ?? '—'}</span>
        </div>
        <div class="zone-counts">
          <span>Mano {rival?.hand.length ?? 0}</span>
          <span>Biblioteca {rival?.library_count ?? 0}</span>
          <span>Cementerio {rival?.graveyard.length ?? 0}</span>
        </div>
      </section>

      {#if rivalHand.length}
        <div class="rival-hand" aria-label="Mano del rival, oculta">
          {#each rivalHand as obj (obj.id)}
            <div class="mini-back" aria-hidden="true"></div>
          {/each}
        </div>
      {/if}

      <Battlefield objects={battlefieldObjects} {metas} owner={opponent} label={`Campo de batalla · Jugador ${opponent + 1}`} />

      <div class="middle">
        <StackPanel />
        <DecisionPanel />
      </div>

      <Battlefield objects={battlefieldObjects} {metas} owner={viewer} label={`Tu campo de batalla · Jugador ${viewer + 1}`} />

      <section class="player-bar" aria-label="Tú">
        <div class="life" class:low={player && player.life <= 5}>
          <span class="life-label">Jugador {viewer + 1}</span>
          <span class="life-value">{player?.life ?? '—'}</span>
        </div>
        <div class="zone-counts">
          <span>Biblioteca {player?.library_count ?? 0}</span>
          <span>Cementerio {player?.graveyard.length ?? 0}</span>
          <span>Exilio {player?.exile.length ?? 0}</span>
        </div>
      </section>

      {#if graveyardObjects.length}
        <section class="graveyard" aria-label="Tu cementerio">
          <h2>Cementerio <span class="count">{graveyardObjects.length}</span></h2>
          <div class="grave-scroll">
            {#each graveyardObjects as obj (obj.id)}
              <CardView object={obj} meta={metas[obj.printed_ref?.oracle_id ?? ''] ?? metas[obj.name.toLowerCase()]} compact
                onselect={(id) => { session.selected = id; }} oninspect={(id) => { session.inspect = id; }} />
            {/each}
          </div>
        </section>
      {/if}

      <Hand objects={handObjects} {metas} title={`Tu mano · Jugador ${viewer + 1}`} />
    </main>

    <footer class="metrics" aria-label="Métricas del motor">
      {#if session.lastMetrics}
        <span>Motor {session.lastMetrics.engine_ms?.toFixed(1) ?? '—'} ms</span>
        <span>Serialización {session.lastMetrics.serialize_ms?.toFixed(1) ?? '—'} ms</span>
        <span>Worker {session.lastMetrics.worker_ms?.toFixed(1) ?? '—'} ms</span>
        <span>WASM {session.lastMetrics.wasm_compile_ms?.toFixed(0) ?? '—'} ms</span>
        <span>{session.lastMetrics.response_bytes ?? '—'} B</span>
        <span>{session.lastMetrics.objects ?? '—'} objetos</span>
        <span>Memoria WASM {session.lastMetrics.wasm_memory_bytes ? (session.lastMetrics.wasm_memory_bytes / 1048576).toFixed(1) : '—'} MiB</span>
      {/if}
    </footer>
  {/if}

  {#if needsHandoff}
    <div class="handoff" role="dialog" aria-modal="true" aria-label="Paso de asiento">
      <div class="handoff-card">
        <h2>Pasa el dispositivo al Jugador {snapshot!.viewer + 1}</h2>
        <p>La mano del jugador anterior queda oculta. Confirma cuando esté listo para ver su propia mano.</p>
        <button type="button" class="primary" bind:this={handoffButton} onclick={() => session.confirmHandoff()}>Estoy listo</button>
      </div>
    </div>
  {/if}

  <InspectDialog {metas} />
</div>

<style>
  .app { min-height: 100vh; display: flex; flex-direction: column; gap: .8rem; padding: .8rem clamp(.6rem, 2vw, 1.4rem); max-width: 1600px; margin: 0 auto; }
  .topbar { display: flex; justify-content: space-between; align-items: center; gap: .8rem; }
  .brand { display: flex; align-items: center; gap: .65rem; }
  .mark { width: 2.4rem; height: 2.4rem; border-radius: 10px; background: var(--accent); color: var(--accent-ink); display: grid; place-items: center; font-weight: 800; font-size: 1.2rem; }
  h1 { margin: 0; font-size: 1.15rem; letter-spacing: .02em; }
  .brand p { margin: 0; font-size: .74rem; color: var(--ink-muted); }
  .top-actions { display: flex; align-items: center; gap: .6rem; }
  .seat { font-size: .8rem; color: var(--ink-muted); }
  .notice { padding: .7rem .9rem; border-radius: 10px; font-size: .88rem; }
  .notice.error { background: color-mix(in srgb, var(--danger) 14%, var(--surface)); border: 1px solid var(--danger); color: var(--danger); }
  .start-panel { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 1.4rem; max-width: 560px; display: grid; gap: .8rem; }
  .start-panel h2 { margin: 0; font-size: 1.2rem; }
  .start-panel p { margin: 0; color: var(--ink-muted); font-size: .9rem; }
  .start-panel label { display: grid; gap: .3rem; font-size: .85rem; color: var(--ink-muted); }
  .start-panel input { background: var(--surface-2); border: 1px solid var(--line); color: var(--ink); border-radius: 8px; padding: .45rem; max-width: 160px; }
  button.primary { background: var(--accent); color: var(--accent-ink); border: none; border-radius: 10px; padding: .65rem 1rem; font-weight: 650; }
  .muted { color: var(--ink-muted); font-size: .82rem; }
  .layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: .8rem; min-width: 0; }
  .rival-bar, .player-bar { display: flex; justify-content: space-between; align-items: center; gap: .8rem; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: .55rem .8rem; flex-wrap: wrap; }
  .life { display: flex; align-items: baseline; gap: .5rem; }
  .life-label { font-size: .8rem; color: var(--ink-muted); }
  .life-value { font-size: 1.5rem; font-weight: 750; }
  .life.low .life-value { color: var(--danger); }
  .zone-counts { display: flex; gap: .8rem; flex-wrap: wrap; font-size: .78rem; color: var(--ink-muted); }
  .rival-hand { display: flex; gap: .3rem; overflow: hidden; padding: .2rem; }
  .mini-back { width: 34px; height: 48px; border-radius: 5px; background: repeating-linear-gradient(45deg, var(--surface-3), var(--surface-3) 5px, var(--surface-2) 5px, var(--surface-2) 10px); border: 1px solid var(--line); flex: 0 0 auto; }
  .middle { display: grid; grid-template-columns: 1fr 1.4fr; gap: .8rem; }
  .graveyard { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: .65rem .8rem; }
  .graveyard h2 { margin: 0 0 .4rem; font-size: .9rem; }
  .count { color: var(--ink-muted); font-weight: 500; }
  .grave-scroll { display: flex; gap: .6rem; overflow-x: auto; padding: .4rem .2rem; }
  .metrics { display: flex; flex-wrap: wrap; gap: .8rem; font-size: .72rem; color: var(--ink-muted); font-family: var(--mono); padding: .3rem 0; }
  .handoff { position: fixed; inset: 0; background: rgb(0 0 0 / 65%); display: grid; place-items: center; z-index: 50; padding: 1rem; }
  .handoff-card { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 1.4rem; max-width: 420px; display: grid; gap: .8rem; text-align: center; }
  .handoff-card h2 { margin: 0; font-size: 1.1rem; }
  .handoff-card p { margin: 0; color: var(--ink-muted); font-size: .88rem; }
  @media (max-width: 768px) {
    .middle { grid-template-columns: 1fr; }
    .app { padding: .6rem; }
  }
</style>
