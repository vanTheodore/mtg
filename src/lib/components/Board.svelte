<script lang="ts">
  import { onMount, tick } from 'svelte';
  import ArenaSurface from './ArenaSurface.svelte';
  import TurnTrack from './TurnTrack.svelte';
  import Hand from './Hand.svelte';
  import Battlefield from './Battlefield.svelte';
  import DecisionPanel from './DecisionPanel.svelte';
  import StackPanel from './StackPanel.svelte';
  import InspectDialog from './InspectDialog.svelte';
  import Settings from './Settings.svelte';
  import CardView from './CardView.svelte';
  import PlayerPanel from './PlayerPanel.svelte';
  import BoardOverlay from './BoardOverlay.svelte';
  import HistoryPanel from './HistoryPanel.svelte';
  import DeckBuilder from './DeckBuilder.svelte';
  import { session } from '#lib/game/session.svelte.ts';
  import type { CardMeta, GameObject } from '#lib/engine/types.ts';
  import { loadCatalog, loadPack, type Catalog, type CatalogIndex } from '#lib/game/catalog.ts';
  import { mergeCatalogs } from '#lib/game/canonical.ts';
  import { assessDeck, describeAssessment, loadCoverage, type CardAssessment, type CoverageDocument } from '#lib/game/coverage.ts';
  import { toEngineDeck, deckSize, type DeckLine } from '#lib/game/decks.ts';
  import { impressions } from '#lib/game/impressions.svelte.ts';
  import { TUTORIAL_STORAGE_KEY } from '#lib/tutorial/lesson.ts';

  let catalog = $state<Catalog>({});
  /** The index, without the packs: what the builder searches before fetching. */
  let catalogIndex = $state<CatalogIndex | null>(null);
  let metas = $state<Record<string, CardMeta>>({});
  let decks = $state<unknown>(null);
  let loadError = $state<string | null>(null);
  let seed = $state(42);
  let mode = $state<'practice' | 'sparks' | 'standard' | 'custom'>('practice');
  /** Deck chosen in the builder, if any. */
  let customLines = $state<DeckLine[]>([]);
  let customName = $state('');
  /** Names the index could not serve for the last started game. */
  let unresolved = $state<string[]>([]);
  /** Cards the deck needs whose packs are not play-certified. */
  let uncertified = $state<string[]>([]);
  let catalogConflicts = $state<string[]>([]);
  /**
   * Cards Phase reports as having known gaps, and the explicit opt-in that lets
   * a game start with them anyway. Default is conservative: no opt-in, no game.
   */
  let limitedCards = $state<CardAssessment[]>([]);
  let allowLimited = $state(false);
  let coverageNotice = $state<string | null>(null);
  /** What the engine actually loaded, read back from its own snapshot. */
  let engineLoad = $state<{ requested: number; seats: number[] } | null>(null);
  let catalogReady = $state(false);
  /** True when the learner already finished the guided lesson in this browser. */
  let lessonDone = $state(false);
  let loadingPacks = $state(false);
  /**
   * Coverage artifacts already fetched, keyed by pack. Shared by the deck
   * builder (to label cards) and the start gate (to require consent), so both
   * read the same evidence instead of two independent fetches.
   */
  let coverage = $state<Map<string, CoverageDocument | null>>(new Map());
  const coveragePending = new Set<string>();
  const PRACTICE = { player: { main_deck: [...Array(18).fill('Plains'), ...Array(22).fill('Savannah Lions')] }, opponent: { main_deck: [...Array(18).fill('Plains'), ...Array(22).fill('Savannah Lions')] } };
  // Teaching duel for targeted damage: one Mountain pays one Lightning Bolt.
  const SPARKS = { player: { main_deck: [...Array(24).fill('Mountain'), ...Array(16).fill('Lightning Bolt')] }, opponent: { main_deck: [...Array(40).fill('Island')] } };
  const deckFor = (value: typeof mode) => value === 'practice' ? PRACTICE : value === 'sparks' ? SPARKS : decks;
  /** Card names a deck needs, de-duplicated: what the load plan resolves. */
  const deckNames = (deck: unknown): string[] => {
    const seats = deck as { player?: { main_deck?: string[] }; opponent?: { main_deck?: string[] } };
    return [...new Set([...(seats.player?.main_deck ?? []), ...(seats.opponent?.main_deck ?? [])])];
  };
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

  /**
   * The phone hand sheet is a modal surface: while it is open the board is
   * inert so a stray tap cannot target a hidden permanent, and focus moves
   * into the sheet. Closing returns focus to the summary button (Hand.svelte
   * does that itself). Nothing here reads or changes Phase state.
   *
   * The focus call has to wait for the sheet to be laid out (`tick`), and the
   * hand region itself is a tab stop, so it is a safe target even when the
   * hand is empty.
   */
  $effect(() => {
    if (!session.handDrawerOpen) return;
    void tick().then(() => {
      const target = document.querySelector<HTMLElement>('#mesa-hand-sheet .hand-scroll');
      target?.focus();
    });
  });

  /** Escape closes the phone hand sheet from anywhere (the board is inert). */
  function onWindowKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && session.handDrawerOpen) {
      event.preventDefault();
      session.setHandDrawer(false);
      document.querySelector<HTMLElement>('.hand-trigger')?.focus();
    }
  }

  onMount(async () => {
    try {
      lessonDone = localStorage.getItem(TUTORIAL_STORAGE_KEY) === '1';
      // Only the core packs load up front; a deck's packs are fetched when a game
      // actually needs them.
      const [loaded, meta, deckData] = await Promise.all([
        loadCatalog(fetch, [], { corePacksOnly: true }),
        fetch('/data/card-meta.json').then((r) => r.ok ? r.json() : {}),
        fetch('/data/decks.json').then((r) => r.ok ? r.json() : Promise.reject(new Error('Falta static/data/decks.json'))),
        impressions.load(fetch)
      ]);
      catalog = loaded.catalog;
      catalogIndex = loaded.index;
      catalogReady = true;
      metas = meta as Record<string, CardMeta>;
      decks = deckData;
      const params = new URLSearchParams(location.search);
      if (params.has('autostart')) await start();
      window.addEventListener('keydown', onWindowKeydown);
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    }
  });

  /**
   * The builder searches the index (names only) and asks for one pack when a
   * card is selected. Opening it never downloads the whole catalog: a catalog
   * with a thousand packs still costs one index request up front.
   */
  async function requestPack(id: string) {
    if (!catalogIndex || loadingPacks) return;
    const meta = catalogIndex.packs.find((entry) => entry.id === id);
    if (!meta) return;
    loadingPacks = true;
    try {
      const pack = await loadPack(fetch, catalogIndex, id);
      // Same rule as the loader: first definition wins and an overwrite is
      // reported, never merged by spread order.
      const merged = mergeCatalogs([{ id: 'loaded', catalog }, { id, catalog: pack }]);
      catalog = merged.catalog;
      if (merged.conflicts.length) {
        catalogConflicts = merged.conflicts.map((entry) => `${entry.name} (${entry.kept} vs ${entry.dropped}${entry.conflict ? `, ${entry.conflict}` : ''})`);
      }
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    } finally {
      loadingPacks = false;
    }
  }

  /**
   * Fetch coverage for the given packs once, and keep it. Idempotent: asking
   * twice for the same pack performs no request and no state change, so the
   * builder can call it from an effect without looping.
   */
  async function requestCoverage(ids: string[]): Promise<void> {
    if (!catalogIndex) return;
    const wanted = catalogIndex.packs.filter((pack) => ids.includes(pack.id)
      && !coverage.has(pack.id) && !coveragePending.has(pack.id));
    if (!wanted.length) return;
    for (const pack of wanted) coveragePending.add(pack.id);
    try {
      const loaded = await loadCoverage(fetch, wanted);
      const next = new Map(coverage);
      for (const [id, document] of loaded) next.set(id, document);
      coverage = next;
    } finally {
      for (const pack of wanted) coveragePending.delete(pack.id);
    }
  }

  /**
   * Start a game from deck *names*: only the packs holding those cards are
   * fetched. `missing` comes from the index, never from guessing.
   */
  async function startWith(deck: unknown, label: string): Promise<boolean> {
    const names = deckNames(deck);
    const loaded = await loadCatalog(fetch, names);
    unresolved = loaded.missing;
    uncertified = loaded.unverified;
    if (loaded.missing.length) {
      loadError = `El catálogo no contiene: ${loaded.missing.slice(0, 8).join(', ')}${loaded.missing.length > 8 ? '…' : ''}. El motor las omitiría; la partida no se inicia.`;
      return false;
    }
    // `verified: false` means Phase never parsed these cards and no game proved
    // them. Starting anyway is exactly the silent half-game this gate prevents.
    if (loaded.conflicts.length) {
      // Two packs defined the same name and their faces disagree: the engine
      // would play one of them silently. Refuse and name them.
      const detail = loaded.conflicts.slice(0, 6).map((entry) => `${entry.name}: ${entry.kept} vs ${entry.dropped} (${entry.conflict ?? 'idénticas'})`);
      loadError = `Cartas definidas dos veces con reglas distintas: ${detail.join('; ')}. El motor usaría una sola versión en silencio.`;
      return false;
    }
    if (loaded.unverified.length) {
      const packs = loaded.unverifiedPacks.join(', ');
      loadError = `Cartas sin certificar (${loaded.unverified.length}): ${loaded.unverified.slice(0, 8).join(', ')}${loaded.unverified.length > 8 ? '…' : ''}. `
        + `Están en ${loaded.unverifiedPacks.length === 1 ? 'el pack' : 'los packs'} ${packs}, que Phase todavía no validó. No inicio la partida con cartas sin admitir.`;
      return false;
    }
    // Coverage comes from Phase (`analyze_coverage`), one artifact per pack,
    // content-addressed by the pack digest. Missing artifact = unknown, not
    // incompatible; `supported: false` = known limitation, blocked by default.
    // The builder may already have fetched it for the packs this deck touches.
    await requestCoverage(loaded.packs);
    const assessment = assessDeck(names, loaded.index, new Map(coverage), loaded.catalog);
    limitedCards = assessment.limited;
    coverageNotice = describeAssessment(assessment);
    if (assessment.limited.length && !allowLimited) {
      const detail = assessment.limited.slice(0, 6).map((card) => `${card.name}: ${card.gaps[0] ?? 'sin detalle'}`);
      loadError = `Phase conoce limitaciones en ${assessment.limited.length} carta(s) del mazo: ${detail.join('; ')}${assessment.limited.length > 6 ? '…' : ''}. `
        + 'No inicio la partida con cartas que el motor declara incompletas. Marcá «Permitir limitaciones conocidas» si querés jugarla igual.';
      return false;
    }
    loadError = null;
    session.modeLabel = label;
    await session.start(loaded.catalog, deck, seed);
    return true;
  }

  async function start() {
    if (!decks) return;
    if (mode === 'custom' && !customLines.length) return;
    try {
      const deck = mode === 'custom' ? toEngineDeck(customLines) : deckFor(mode);
      const label = mode === 'custom' ? (customName || 'Mazo propio')
        : mode === 'practice' ? 'Duelo de práctica'
        : mode === 'sparks' ? 'Duelo de chispas' : 'Mazos de demostración';
      const requested = (deck as { player: { main_deck: string[] } }).player.main_deck.length;
      const started = await startWith(deck, label);
      // Read back what the engine loaded: the only authority on deck resolution.
      engineLoad = started && session.snapshot ? { requested, seats: seatSizes(session.snapshot) } : null;
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    }
  }

  /** Cards the engine put into each seat's library + hand after starting. */
  function seatSizes(snapshot: typeof session.snapshot): number[] {
    if (!snapshot) return [];
    return snapshot.state.players.map((player) => (player.library_count ?? 0) + (player.hand?.length ?? 0));
  }

  function playCustom(lines: DeckLine[], name: string) {
    customLines = lines;
    customName = name;
    mode = 'custom';
    void start();
  }

  const cardWidth = $derived(Math.round(148 * session.cardScale));
  const arenaColor = $derived(mode === 'sparks' ? 'red' : mode === 'practice' ? 'white' : 'blue');
</script>

<svelte:head><title>Mesa · Cliente MTG</title></svelte:head>

<!-- Two cards per row is the minimum a board needs to be readable as a board.
     On a 320 px screen a fixed 148 px card left exactly one column, turning the
     battlefield into a 70-card vertical marathon (docs/screenshots/cartas-320.png
     in 0.5.1). The cap only bites on narrow screens; the density control still
     wins everywhere else. -->
<div class="app" data-board-style={session.boardStyle} style="--card-w: min({cardWidth}px, calc((100vw - 6rem) / 2)); --arena-base-card-w: {Math.round(cardWidth * 0.84)}px" data-density={session.density} data-actions-applied={snapshot?.actions_applied ?? 0} data-viewer={viewer} data-busy={String(session.busy)} data-waiting={snapshot?.state.waiting_for.type ?? 'none'} data-attacker-ids={JSON.stringify((snapshot?.state.waiting_for?.data as { valid_attacker_ids?: number[] } | undefined)?.valid_attacker_ids ?? [])}>
  {#if session.boardStyle === 'arena'}
    <ArenaSurface color={arenaColor} />
  {/if}
  <!--
    Arena 1.0 — the top bar is a *table* bar, not a settings page.
    Measured at 1440×900 during a real DeclareBlockers: the bar plus two
    full-width notice rows took 145px before the battlefield began, on a
    board that owed 137px. Arena now keeps the identity, the engine status
    and one disclosure; the Classic board keeps every control in the open
    (its own tests assert that) and no state is hidden in either.
  -->
  <header class="topbar">
    <div class="brand">
      <span class="mark" aria-hidden="true">M</span>
      <div class="brand-text">
        <h1>Mesa</h1>
        <p>Cliente MTG · motor Phase</p>
      </div>
    </div>
    {#if snapshot && session.boardStyle === 'arena' && engineLoad}
      {@const short = engineLoad.seats.filter((size) => size !== engineLoad!.requested)}
      <p class="engine-status" role="status" data-state={short.length ? 'warn' : 'ok'}>
        <span class="dot" aria-hidden="true"></span>
        <!-- Same sentence Phase's deck report has always used: the status
             moved from a full-width banner into the table bar, so the wording
             the documentation and the E2E quote still holds ("Motor: 40 / 40
             cartas cargadas por asiento"). -->
        Motor: {engineLoad.seats.join(' / ')} cartas cargadas por asiento ({engineLoad.requested} pedidas)
        {#if short.length}
          <strong>· revisa el mazo antes de jugar.</strong>
        {:else}
          · El mazo se cargó completo
        {/if}
      </p>
    {/if}
    <div class="top-actions">
      {#if snapshot}
        <span class="seat">Jugador {viewer + 1}</span>
        {#if session.modeLabel}<span class="seat mode">{session.modeLabel}</span>{/if}
      {/if}
      <!--
        Arena 1.0 — compact table controls, complete accessible names.
        A previous iteration folded these into a disclosure; that hid a
        gameplay toggle from the driver and made the settings button vanish on
        a style switch (its panel remounted), so instead every control stays
        present and only its *label* is abbreviated on screen. The full name
        is what assistive technology and the E2E read.
      -->
      <label class="auto-pass chip">
        <input type="checkbox" checked={session.autoPass} onchange={(e) => session.setAutoPass(e.currentTarget.checked)} />
        <span aria-hidden="true">Auto-paso</span>
        <span class="sr-only">Auto-pasar ventanas sin acciones</span>
      </label>
      <label class="auto-pass chip">
        <input type="checkbox" checked={session.handoffMode === 'every'} onchange={(e) => session.setHandoffMode(e.currentTarget.checked ? 'every' : 'turn')} />
        <span aria-hidden="true">Asiento</span>
        <span class="sr-only">Confirmar cada cambio de asiento</span>
      </label>
      <Settings />
    </div>
  </header>

  {#if loadError}
    <div class="notice error" role="alert">{loadError}</div>
  {/if}
  {#if session.error}
    <div class="notice error" role="alert">{session.error}</div>
  {/if}
  {#if coverageNotice && snapshot}
    {#if session.boardStyle === 'arena'}
      <details class="notice-line warn">
        <summary>Cobertura del mazo: {coverageNotice}</summary>
        <p>{limitedCards.length ? 'Partida iniciada con permiso explícito para las cartas marcadas.' : 'Phase analizó todas las cartas del mazo.'}</p>
      </details>
    {:else}
      <div class="notice warn" role="status">
        Cobertura: {coverageNotice}.{limitedCards.length ? ' Partida iniciada con permiso explícito.' : ''}
      </div>
    {/if}
  {/if}
  {#if catalogConflicts.length}
    <div class="notice warn" role="status">
      Nombres definidos por más de un pack: {catalogConflicts.slice(0, 4).join('; ')}{catalogConflicts.length > 4 ? '…' : ''}.
      Se usa la primera definición (el pack dueño del nombre) y el resto no sobrescribe nada.
    </div>
  {/if}
  {#if engineLoad && snapshot && session.boardStyle !== 'arena'}
    {@const short = engineLoad.seats.filter((size) => size !== engineLoad!.requested)}
    <div class="notice {short.length ? 'warn' : 'ok'}" role="status" aria-live="polite">
      Motor: {engineLoad.seats.join(' / ')} cartas cargadas por asiento ({engineLoad.requested} pedidas).
      {#if short.length}
        <strong>Algunas cartas no se resolvieron; revisa el mazo antes de jugar.</strong>
      {:else}
        El mazo se cargó completo.
      {/if}
    </div>
  {/if}
  {#if snapshot?.outcome}
    <div class="game-over" role="status">
      <strong>{snapshot.outcome.draw ? 'Empate' : `Jugador ${snapshot.outcome.winner! + 1} gana`}</strong>
      <span>La partida terminó. Puedes revisar el tablero, pero no hay más acciones legales.</span>
    </div>
  {/if}

  {#if !snapshot}
    <section class="start-panel">
      <div class="learn">
        <h2>¿Primera vez con Magic?</h2>
        <p>
          Empieza por la lección guiada: diez minutos, sin construir un mazo, sin importar cartas y sin configurar dos jugadores.
          Juegas de verdad — Phase mueve cada carta — y aprendes a jugar una tierra, generar maná, lanzar una criatura y atacar.
        </p>
        <a class="learn-button" href="/aprender">Aprender a jugar</a>
        {#if lessonDone}<span class="learn-done">Ya completaste la lección. Puedes repetirla cuando quieras.</span>{/if}
      </div>

      <h2>Partida local de dos jugadores</h2>
      <p>Motor Rust/WASM real. No hay IA ni turnos ocultos: juegas ambos asientos en este dispositivo y confirmas el paso de asiento.</p>
      <fieldset class="modes">
        <legend>Formato de la partida</legend>
        <label><input type="radio" bind:group={mode} value="practice" /> Duelo de práctica <span>Savannah Lions 1/1 contra Savannah Lions 1/1; 18 Plains por asiento. Permite aprender y completar una partida.</span></label>
        <label><input type="radio" bind:group={mode} value="sparks" /> Duelo de chispas <span>24 Mountain y 16 Lightning Bolt contra 40 Island. Practica objetivos y daño directo.</span></label>
        <label><input type="radio" bind:group={mode} value="standard" /> Mazos de demostración <span>40 cartas cada uno, con costes variados y más decisiones.</span></label>
        {#if customLines.length}
          <label><input type="radio" bind:group={mode} value="custom" /> Mazo propio: {customName} <span>{deckSize(customLines)} cartas, {customLines.length} distintas. Sólo se cargan los packs que necesita.</span></label>
        {/if}
      </fieldset>
      {#if limitedCards.length}
        <label class="allow-limited">
          <input type="checkbox" bind:checked={allowLimited} />
          Permitir {limitedCards.length} carta(s) con limitaciones conocidas del parser
        </label>
      {/if}
      <DeckBuilder
        catalog={catalog}
        index={catalogIndex}
        catalogMissing={unresolved}
        catalogUnverified={uncertified}
        loading={loadingPacks}
        coverage={coverage}
        onrequestpack={requestPack}
        onrequestcoverage={requestCoverage}
        onplay={playCustom}
      />
      <label>Semilla <input type="number" bind:value={seed} min="0" step="1" /></label>
      <button type="button" class="primary" disabled={!catalog || !decks || session.status === 'loading'} onclick={start}>
        {session.status === 'loading' ? 'Inicializando motor…' : 'Iniciar partida'}
      </button>
      {#if session.status === 'loading'}<p class="muted">Descargando y compilando WASM, cargando catálogo mínimo…</p>{/if}
    </section>
  {:else}
    <svelte:boundary>
    <main class="layout" data-board-region inert={needsHandoff || session.handDrawerOpen} aria-hidden={needsHandoff}>
      <PlayerPanel player={rival!} showHand />
      <!-- While the device changes hands the board is covered and inert, so
           the other seat's hand is not drawn either: the dialog promises that
           the previous player's hand stays hidden, and the count of those
           backs would say how many cards they are holding. -->
      {#if rivalHand.length && !needsHandoff}
        <div class="rival-hand" role="group" aria-label={`Mano oculta del Jugador ${opponent + 1}`}>
          {#each rivalHand as obj (obj.id)}<div class="mini-back" aria-hidden="true"></div>{/each}
        </div>
      {/if}
      <Battlefield objects={battlefieldObjects} {metas} owner={opponent} side="opponent" label={`Campo de batalla · Jugador ${opponent + 1}`} />
      <div class="middle">
        {#if session.boardStyle === 'arena'}
          <TurnTrack phase={snapshot?.state.phase ?? ''} turn={snapshot?.state.turn_number ?? 0} activePlayer={snapshot?.state.active_player ?? 0} />
        {/if}
        <div class="center">
          <StackPanel />
          <HistoryPanel compact={session.boardStyle === 'arena'} />
        </div>
        <DecisionPanel />
      </div>

      <Battlefield objects={battlefieldObjects} {metas} owner={viewer} side="player" label={`Tu campo de batalla · Jugador ${viewer + 1}`} />

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

    </main>
    <!-- Phase's line layer: target, stack and combat arcs between measured
         anchors. Fixed-position and pointer-events:none, so it adds no layout
         and cannot steal a click from a card. Arena only: Clásico stays the
         plain, text-first board its own tests describe. -->
    {#if session.boardStyle === 'arena' && !needsHandoff}
      <BoardOverlay />
    {/if}
    {#snippet failed(error, reset)}
      <div class="notice error" role="alert">
        <strong>La interfaz encontró un error al dibujar el tablero.</strong>
        <p>{error instanceof Error ? error.message : String(error)}</p>
        <button type="button" onclick={reset}>Reintentar dibujar</button>
      </div>
    {/snippet}
    </svelte:boundary>

    <!--
      The hand is a sibling of the board, not a row inside it.

      Two reasons, both measured: (1) on a phone it is a fixed drawer, and a
      drawer that lives inside an `inert` container cannot receive focus —
      Chrome refuses to focus anything under `inert`, so the sheet opened and
      trapped the player outside it; (2) a row inside the 1440×900 grid costs
      182px that the battlefield needs.

      On desktop it is still the same fan, still at the bottom of the table,
      and every card, count and legality mark comes from Phase.
    -->
    {#if !needsHandoff}
      <Hand objects={handObjects} {metas} title={`Tu mano · Jugador ${viewer + 1}`} />
    {/if}

    <footer class="metrics" aria-label="Métricas del motor" data-collapsible={session.boardStyle === 'arena'}>
      {#if session.boardStyle === 'arena'}
        <!-- One line until the player asks for numbers: 56px of metric text
             under the table is not part of a card game. The full set stays one
             keystroke away and is still labelled for assistive technology. -->
        <details>
          <summary>Rendimiento del motor{session.lastMetrics ? ` · reglas ${session.lastMetrics.engine_ms?.toFixed(1) ?? '—'} ms · ${session.lastMetrics.objects ?? '—'} objetos` : ''}</summary>
          <div class="metric-items">
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
          </div>
        </details>
      {:else}
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
  .topbar { display: flex; justify-content: space-between; align-items: center; gap: .8rem; flex-wrap: wrap; }
  /* Engine status: one measured line instead of a full-width banner. The
     numbers are Phase's own report of what it loaded (never a UI guess). */
  .engine-status { margin: 0; display: inline-flex; align-items: center; gap: .4rem; font-size: .78rem; color: var(--ink-muted); border: 1px solid var(--line); border-radius: 999px; padding: .18rem .7rem; }
  .engine-status .dot { width: .5rem; height: .5rem; border-radius: 50%; background: var(--ok); }
  .engine-status[data-state="warn"] { border-color: var(--accent); color: var(--ink); }
  .engine-status[data-state="warn"] .dot { background: var(--danger); }
  /* Collapsed status lines in Arena: readable, one row, no full-width banner. */
  .notice-line { font-size: .76rem; color: var(--ink-muted); padding: .1rem .2rem; }
  .notice-line > summary { cursor: pointer; }
  .notice-line p { margin: .25rem 0 0; }
  .metrics[data-collapsible="true"] { padding: 0; }
  .metrics[data-collapsible="true"] > details { font-size: .72rem; color: var(--ink-muted); }
  .metrics[data-collapsible="true"] > details > summary { cursor: pointer; padding: .1rem 0; list-style: none; }
  .metrics[data-collapsible="true"] > details > summary::-webkit-details-marker { display: none; }
  .metrics[data-collapsible="true"] > details > summary::before { content: "▸ "; }
  .metrics[data-collapsible="true"] > details[open] > summary::before { content: "▾ "; }
  .metrics .metric-items { display: flex; flex-wrap: wrap; gap: .8rem; padding-block: .2rem; }
  .brand { display: flex; align-items: center; gap: .65rem; }
  .mark { width: 2.4rem; height: 2.4rem; border-radius: 10px; background: var(--accent); color: var(--accent-ink); display: grid; place-items: center; font-weight: 800; font-size: 1.2rem; }
  h1 { margin: 0; font-size: 1.15rem; letter-spacing: .02em; }
  .brand p { margin: 0; font-size: .74rem; color: var(--ink-muted); }
  .top-actions { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; }
  .auto-pass { display: flex; align-items: center; gap: .35rem; font-size: .76rem; color: var(--ink-muted); }
  .auto-pass.chip { border: 1px solid var(--line); border-radius: 999px; padding: .18rem .6rem .18rem .45rem; background: var(--surface-2); }
  .auto-pass.chip input { margin: 0; }
  .seat { font-size: .8rem; color: var(--ink-muted); }
  .seat.mode { border: 1px solid var(--line); border-radius: 999px; padding: .1rem .5rem; }
  .allow-limited { display: flex; align-items: center; gap: .45rem; font-size: .85rem; color: var(--ink-muted); }
  .notice { padding: .7rem .9rem; border-radius: 10px; font-size: .88rem; }
  .notice.error { background: color-mix(in srgb, var(--danger) 14%, var(--surface)); border: 1px solid var(--danger); color: var(--danger); }
  .notice.ok { background: color-mix(in srgb, var(--ok) 10%, var(--surface)); border: 1px solid var(--ok); color: var(--ok); }
  .notice.warn { background: color-mix(in srgb, var(--accent) 14%, var(--surface)); border: 1px solid var(--accent); color: var(--ink); }
  .start-panel { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 1.4rem; max-width: 560px; display: grid; gap: .8rem; }
  .learn { background: var(--surface-2); border: 1px solid var(--accent); border-radius: 14px; padding: .9rem 1rem; display: grid; gap: .5rem; }
  .learn h2 { margin: 0; font-size: 1.05rem; }
  .learn p { margin: 0; }
  .learn-button { justify-self: start; background: var(--accent); color: var(--accent-ink); border-radius: 10px; padding: .6rem 1.1rem; font-weight: 700; text-decoration: none; min-height: 40px; display: inline-grid; place-items: center; }
  .learn-done { font-size: .8rem; color: var(--ok); font-weight: 650; }
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
