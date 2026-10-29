<script lang="ts">
  import { onMount } from 'svelte';
  import Hand from './Hand.svelte';
  import Battlefield from './Battlefield.svelte';
  import DecisionPanel from './DecisionPanel.svelte';
  import StackPanel from './StackPanel.svelte';
  import InspectDialog from './InspectDialog.svelte';
  import Settings from './Settings.svelte';
  import CardView from './CardView.svelte';
  import PlayerPanel from './PlayerPanel.svelte';
  import HistoryPanel from './HistoryPanel.svelte';
  import { session } from '#lib/game/session.svelte.ts';
  import type { CardMeta, GameObject } from '#lib/engine/types.ts';

  let catalog = $state<unknown>(null);
  let metas = $state<Record<string, CardMeta>>({});
  let decks = $state<unknown>(null);
  let loadError = $state<string | null>(null);
  let seed = $state(42);
  let mode = $state<'practice' | 'sparks' | 'standard'>('practice');
  const PRACTICE = { player: { main_deck: [...Array(18).fill('Plains'), ...Array(22).fill('Savannah Lions')] }, opponent: { main_deck: [...Array(18).fill('Plains'), ...Array(22).fill('Savannah Lions')] } };
  // Teaching duel for targeted damage: one Mountain pays one Lightning Bolt.
  const SPARKS = { player: { main_deck: [...Array(24).fill('Mountain'), ...Array(16).fill('Lightning Bolt')] }, opponent: { main_deck: [...Array(40).fill('Island')] } };
  const deckFor = (value: typeof mode) => value === 'practice' ? PRACTICE : value === 'sparks' ? SPARKS : decks;
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
  const needsHandoff = $derived(session.needsHandoff);

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
    await session.start(catalog, deckFor(mode), seed);
  }

  const cardWidth = $derived(Math.round(148 * session.cardScale));
</script>

<svelte:head><title>Mesa · Cliente MTG</title></svelte:head>

<div class="app" style="--card-w: {cardWidth}px" data-density={session.density} data-actions-applied={snapshot?.actions_applied ?? 0} data-viewer={viewer} data-busy={String(session.busy)} data-waiting={snapshot?.state.waiting_for.type ?? 'none'} data-attacker-ids={JSON.stringify((snapshot?.state.waiting_for?.data as { valid_attacker_ids?: number[] } | undefined)?.valid_attacker_ids ?? [])}>
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
      <label class="auto-pass"><input type="checkbox" checked={session.autoPass} onchange={(e) => session.setAutoPass(e.currentTarget.checked)} /> Auto-pasar ventanas sin acciones</label>
      <label class="auto-pass"><input type="checkbox" checked={session.handoffMode === 'every'} onchange={(e) => session.setHandoffMode(e.currentTarget.checked ? 'every' : 'turn')} /> Confirmar cada cambio de asiento</label>
      <Settings />
    </div>
  </header>

  {#if loadError}
    <div class="notice error" role="alert">{loadError}</div>
  {/if}
  {#if session.error}
    <div class="notice error" role="alert">{session.error}</div>
  {/if}
  {#if snapshot?.outcome}
    <div class="game-over" role="status">
      <strong>{snapshot.outcome.draw ? 'Empate' : `Jugador ${snapshot.outcome.winner! + 1} gana`}</strong>
      <span>La partida terminó. Puedes revisar el tablero, pero no hay más acciones legales.</span>
    </div>
  {/if}

  {#if !snapshot}
    <section class="start-panel">
      <h2>Partida local de dos jugadores</h2>
      <p>Motor Rust/WASM real. No hay IA ni turnos ocultos: juegas ambos asientos en este dispositivo y confirmas el paso de asiento.</p>
      <fieldset class="modes">
        <legend>Formato de la partida</legend>
        <label><input type="radio" bind:group={mode} value="practice" /> Duelo de práctica <span>Savannah Lions 1/1 contra Savannah Lions 1/1; 18 Plains por asiento. Permite aprender y completar una partida.</span></label>
        <label><input type="radio" bind:group={mode} value="sparks" /> Duelo de chispas <span>24 Mountain y 16 Lightning Bolt contra 40 Island. Practica objetivos y daño directo.</span></label>
        <label><input type="radio" bind:group={mode} value="standard" /> Mazos de demostración <span>40 cartas cada uno, con costes variados y más decisiones.</span></label>
      </fieldset>
      <label>Semilla <input type="number" bind:value={seed} min="0" step="1" /></label>
      <button type="button" class="primary" disabled={!catalog || !decks || session.status === 'loading'} onclick={start}>
        {session.status === 'loading' ? 'Inicializando motor…' : 'Iniciar partida'}
      </button>
      {#if session.status === 'loading'}<p class="muted">Descargando y compilando WASM, cargando catálogo mínimo…</p>{/if}
    </section>
  {:else}
    <svelte:boundary>
    <main class="layout" inert={needsHandoff} aria-hidden={needsHandoff}>
      <PlayerPanel player={rival!} showHand />
      {#if rivalHand.length}
        <div class="rival-hand" aria-label={`Mano oculta del Jugador ${opponent + 1}`}>
          {#each rivalHand as obj (obj.id)}<div class="mini-back" aria-hidden="true"></div>{/each}
        </div>
      {/if}
      <Battlefield objects={battlefieldObjects} {metas} owner={opponent} label={`Campo de batalla · Jugador ${opponent + 1}`} />
      <div class="middle">
        <div class="center">
          <StackPanel />
          <HistoryPanel />
        </div>
        <DecisionPanel />
      </div>

      <Battlefield objects={battlefieldObjects} {metas} owner={viewer} label={`Tu campo de batalla · Jugador ${viewer + 1}`} />

      <PlayerPanel player={player!} />

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
    {#snippet failed(error, reset)}
      <div class="notice error" role="alert">
        <strong>La interfaz encontró un error al dibujar el tablero.</strong>
        <p>{error instanceof Error ? error.message : String(error)}</p>
        <button type="button" onclick={reset}>Reintentar dibujar</button>
      </div>
    {/snippet}
    </svelte:boundary>

    <footer class="metrics" aria-label="Métricas del motor">
      {#if session.lastMetrics}
        <span>Reglas {session.lastMetrics.engine_ms?.toFixed(1) ?? '—'} ms</span>
        <span>Legales {session.lastMetrics.legal_ms?.toFixed(1) ?? '—'} ms</span>
        <span>Proyección {session.lastMetrics.projection_ms?.toFixed(1) ?? '—'} ms</span>
        <span>Serialización {session.lastMetrics.serialize_ms?.toFixed(1) ?? '—'} ms</span>
        <span>Transporte {session.lastMetrics.transport_ms?.toFixed(1) ?? '—'} ms</span>
        <span>Encode {session.lastMetrics.encode_ms?.toFixed(1) ?? '—'} ms</span>
        <span>Decode {session.lastMetrics.decode_ms?.toFixed(1) ?? '—'} ms</span>
        <span>Commit Svelte {session.lastMetrics.svelte_commit_ms?.toFixed(1) ?? '—'} ms</span>
        <span>Auto-pasos {session.autoPasses}</span>
        <span>Presentación {session.lastMetrics.presentation_ms?.toFixed(1) ?? '—'} ms</span>
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
  .game-over { padding: 14px 18px; border-radius: var(--radius-lg); background: var(--accent-dim); border: 1px solid var(--accent); display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; }
  .game-over strong { font: 700 20px var(--font-serif); }
  .game-over span { color: var(--text-secondary); font-size: 13px; }
  .app { min-height: 100vh; display: flex; flex-direction: column; gap: .8rem; padding: .8rem clamp(.6rem, 2vw, 1.4rem); max-width: 1600px; margin: 0 auto; }
  .topbar { display: flex; justify-content: space-between; align-items: center; gap: .8rem; }
  .brand { display: flex; align-items: center; gap: .65rem; }
  .mark { width: 2.4rem; height: 2.4rem; border-radius: 10px; background: var(--accent); color: var(--accent-ink); display: grid; place-items: center; font-weight: 800; font-size: 1.2rem; }
  h1 { margin: 0; font-size: 1.15rem; letter-spacing: .02em; }
  .brand p { margin: 0; font-size: .74rem; color: var(--ink-muted); }
  .top-actions { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; }
  .auto-pass { display: flex; align-items: center; gap: .35rem; font-size: .76rem; color: var(--ink-muted); }
  .seat { font-size: .8rem; color: var(--ink-muted); }
  .notice { padding: .7rem .9rem; border-radius: 10px; font-size: .88rem; }
  .notice.error { background: color-mix(in srgb, var(--danger) 14%, var(--surface)); border: 1px solid var(--danger); color: var(--danger); }
  .start-panel { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 1.4rem; max-width: 560px; display: grid; gap: .8rem; }
  .start-panel h2 { margin: 0; font-size: 1.2rem; }
  .start-panel p { margin: 0; color: var(--ink-muted); font-size: .9rem; }
  .start-panel label { display: grid; gap: .3rem; font-size: .85rem; color: var(--ink-muted); }
  .start-panel input { background: var(--surface-2); border: 1px solid var(--line); color: var(--ink); border-radius: 8px; padding: .45rem; max-width: 160px; }
  .modes { border: 1px solid var(--line); border-radius: 10px; padding: .6rem; display: grid; gap: .55rem; }
  .modes legend { font-size: .82rem; color: var(--ink-muted); padding: 0 .3rem; }
  .modes label { display: grid; grid-template-columns: auto 1fr; gap: .15rem .5rem; align-items: baseline; font-size: .88rem; color: var(--ink); }
  .modes label span { grid-column: 2; font-size: .78rem; color: var(--ink-muted); }
  .modes input { max-width: none; }
  button.primary { background: var(--accent); color: var(--accent-ink); border: none; border-radius: 10px; padding: .65rem 1rem; font-weight: 650; }
  .muted { color: var(--ink-muted); font-size: .82rem; }
  .layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: .8rem; min-width: 0; }
  .rival-hand { display: flex; gap: .3rem; overflow: hidden; padding: .2rem; }
  .mini-back { width: 34px; height: 48px; border-radius: 5px; background: repeating-linear-gradient(45deg, var(--surface-3), var(--surface-3) 5px, var(--surface-2) 5px, var(--surface-2) 10px); border: 1px solid var(--line); flex: 0 0 auto; }
  .middle { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.3fr); gap: .8rem; align-items: start; }
  .center { display: grid; gap: .8rem; min-width: 0; }
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
