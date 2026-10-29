<script lang="ts">
  import { onMount } from 'svelte';
  import {
    checkAgainstCatalog, deckSize, formatDeckList, makeDeck, parseDeckList, readDecks,
    removeDeck, uniqueCards, upsertDeck, writeDecks, type DeckLine, type SavedDeck
  } from '#lib/game/decks.ts';
  import type { Catalog, CatalogIndex } from '#lib/game/catalog.ts';

  let {
    catalog,
    index = null,
    catalogMissing = [],
    catalogUnverified = [],
    loading = false,
    onrequestpack,
    onplay
  }: {
    /** Packs already in memory. Search supplements them with index names. */
    catalog: Catalog;
    /** The catalog index: names per pack, without downloading the cards. */
    index?: CatalogIndex | null;
    /** Names the catalog index could not serve, surfaced for honesty. */
    catalogMissing?: string[];
    /** Cards the host refused to play because their packs are not certified. */
    catalogUnverified?: string[];
    /** True while one pack is downloading for a selected card. */
    loading?: boolean;
    /** Fetch exactly one pack, when a card is selected or a deck needs it. */
    onrequestpack?: (id: string) => Promise<void>;
    /** Start a game with the chosen deck. */
    onplay: (lines: DeckLine[], name: string) => void;
  } = $props();

  const MAX_RESULTS = 60;
  let open = $state(false);
  let query = $state('');
  let lines = $state<DeckLine[]>([]);
  let deckName = $state('Mi mazo');
  let editingId = $state<string | null>(null);
  let saved = $state<SavedDeck[]>([]);
  let importText = $state('');
  let notice = $state<string | null>(null);
  let importSkipped = $state<string[]>([]);
  let showImport = $state(false);
  let storageWorks = $state(true);

  const storage = typeof localStorage !== 'undefined' ? localStorage : undefined;

  onMount(() => { saved = readDecks(storage); });

  /** Pack id per lower-cased card name, straight from the index. */
  const packByName = $derived.by(() => {
    const map = new Map<string, { id: string; verified: boolean }>();
    for (const pack of index?.packs ?? []) {
      for (const name of pack.names) map.set(name.toLocaleLowerCase('es'), { id: pack.id, verified: pack.verified });
    }
    return map;
  });

  type Result = { key: string; name: string; type: string; pack: string | null; loaded: boolean; certified: boolean };

  /**
   * Names come from the index (cheap, covers the whole catalog); rules text and
   * type only for packs already in memory. Results are capped: the builder never
   * renders a 30k-card list.
   */
  const results = $derived.by<Result[]>(() => {
    const term = query.trim().toLocaleLowerCase('es');
    if (!term) return [];
    const out: Result[] = [];
    const seen = new Set<string>();
    for (const [key, face] of Object.entries(catalog)) {
      const name = String(face.name ?? key);
      const text = String(face.oracle_text ?? '').toLocaleLowerCase('es');
      const type = String(JSON.stringify(face.card_type ?? '')).replace(/[[\]"{}]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!(name.toLocaleLowerCase('es').includes(term) || text.includes(term) || type.toLocaleLowerCase('es').includes(term))) continue;
      out.push({ key, name, type, pack: packByName.get(key)?.id ?? null, loaded: true, certified: packByName.get(key)?.verified ?? false });
      seen.add(key);
      if (out.length >= MAX_RESULTS) return out;
    }
    for (const pack of index?.packs ?? []) {
      for (const name of pack.names) {
        const key = name.toLocaleLowerCase('es');
        if (seen.has(key) || !key.includes(term)) continue;
        out.push({ key, name, type: '', pack: pack.id, loaded: false, certified: pack.verified });
        seen.add(key);
        if (out.length >= MAX_RESULTS) return out;
      }
    }
    return out;
  });

  async function pick(result: Result) {
    // Selective fetch: the pack holding this card, and nothing else.
    if (!result.loaded && result.pack && onrequestpack) await onrequestpack(result.pack);
    add(result.name);
  }
  const total = $derived(deckSize(lines));
  const availability = $derived(checkAgainstCatalog(lines, catalog));
  const missingTotal = $derived(availability.missing.reduce((sum, line) => sum + line.count, 0));
  /** Deck cards whose pack the index marks as not play-certified. */
  const uncertifiedLines = $derived(lines.filter((line) => {
    const pack = packByName.get(line.name.toLocaleLowerCase('es'));
    return pack ? !pack.verified : catalogUnverified.some((name) => name.toLocaleLowerCase('es') === line.name.toLocaleLowerCase('es'));
  }));
  const uncertifiedTotal = $derived(uncertifiedLines.reduce((sum, line) => sum + line.count, 0));

  function countOf(name: string) {
    return lines.find((line) => line.name.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'))?.count ?? 0;
  }

  function add(name: string, delta = 1) {
    const index = lines.findIndex((line) => line.name.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'));
    if (index >= 0) {
      const next = Math.max(0, Math.min(99, lines[index]!.count + delta));
      lines = next === 0 ? lines.filter((_, i) => i !== index) : lines.map((line, i) => (i === index ? { ...line, count: next } : line));
    } else if (delta > 0) {
      lines = [...lines, { name, count: Math.min(99, delta) }];
    }
    notice = null;
  }

  function setCount(name: string, value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    const count = Math.max(0, Math.min(99, Math.floor(parsed)));
    lines = count === 0
      ? lines.filter((line) => line.name !== name)
      : lines.map((line) => (line.name === name ? { ...line, count } : line));
  }

  function save() {
    if (!lines.length) { notice = 'Agrega al menos una carta antes de guardar.'; return; }
    const deck = makeDeck({ id: editingId ?? undefined, name: deckName, lines });
    editingId = deck.id;
    saved = upsertDeck(saved, deck);
    storageWorks = writeDecks(storage, saved);
    notice = storageWorks ? `«${deck.name}» guardado en este navegador.` : 'No se pudo guardar: el almacenamiento local está bloqueado o lleno.';
  }

  function load(deck: SavedDeck) {
    lines = deck.lines.map((line) => ({ ...line }));
    deckName = deck.name;
    editingId = deck.id;
    notice = `Mazo «${deck.name}» cargado para editar.`;
  }

  function remove(id: string) {
    saved = removeDeck(saved, id);
    writeDecks(storage, saved);
    if (editingId === id) editingId = null;
  }

  function startFresh() {
    lines = [];
    deckName = 'Mi mazo';
    editingId = null;
    notice = null;
  }

  function doImport() {
    const parsed = parseDeckList(importText);
    if (!parsed.lines.length) { notice = 'No se reconoció ninguna carta en el texto.'; importSkipped = parsed.skipped; return; }
    lines = parsed.lines;
    importSkipped = parsed.skipped;
    showImport = false;
    importText = '';
    notice = `Importadas ${deckSize(parsed.lines)} cartas (${uniqueCards(parsed.lines)} distintas).`
      + (parsed.sideboard.length ? ` El banquillo (${deckSize(parsed.sideboard)}) no se usa en este formato.` : '')
      + (catalogMissing.length ? ` El catálogo no cubre: ${catalogMissing.slice(0, 5).join(', ')}.` : '');
  }

  function play() {
    if (!lines.length) { notice = 'El mazo está vacío.'; return; }
    // No format rule is enforced here: Phase owns deck legality and the bridge
    // does not expose it yet. This only stops cards the catalog cannot serve.
    if (missingTotal > 0) {
      notice = `Hay ${missingTotal} cartas que el catálogo cargado no contiene. El motor las omitiría: quítalas o cambia de mazo.`;
      return;
    }
    if (uncertifiedTotal > 0) {
      notice = `Hay ${uncertifiedTotal} cartas sin certificar (${uncertifiedLines.map((line) => line.name).slice(0, 5).join(', ')}). `
        + 'Su pack no pasó todavía el análisis de Phase ni una partida real, así que no inicio la partida.';
      return;
    }
    onplay(lines, deckName);
  }
</script>

<section class="builder" aria-label="Constructor de mazos">
  <button
    type="button"
    class="toggle"
    aria-expanded={open}
    aria-controls="deck-builder-panel"
    onclick={() => { open = !open; }}
  >
    {open ? 'Ocultar constructor' : 'Mis mazos'}
  </button>

  {#if open}
    <div id="deck-builder-panel" class="panel" data-testid="deck-builder">
      <header>
        <div>
          <h2>Constructor de mazos</h2>
          <p class="muted">
            Formato <strong>Limited</strong> (el que juega el motor en esta versión, 40 cartas mínimo).
            El puente WASM todavía <strong>no expone la validación de mazo de Phase</strong>: Mesa sólo comprueba
            que las cartas existan en el catálogo y, al iniciar, muestra cuántas cargó el motor de verdad.
          </p>
        </div>
        <div class="counters" aria-live="polite">
          <span class="pill" class:ok={total >= 40} data-testid="deck-total">{total} cartas</span>
          <span class="pill">{uniqueCards(lines)} distintas</span>
        </div>
      </header>

      {#if notice}<p class="notice" role="status">{notice}</p>{/if}
      {#if importSkipped.length}
        <p class="notice warn" role="status">Líneas ignoradas: {importSkipped.slice(0, 6).join(' · ')}{importSkipped.length > 6 ? ' …' : ''}</p>
      {/if}

      <div class="columns">
        <div class="search">
          <label class="field">
            <span>
              Buscar en {index ? `el índice (${index.packs.reduce((sum, pack) => sum + pack.names.length, 0)} nombres)` : 'el catálogo cargado'}
              · {Object.keys(catalog).length} cartas en memoria{loading ? ' · cargando un pack…' : ''}
            </span>
            <input type="search" bind:value={query} placeholder="Nombre, tipo o texto de reglas" autocomplete="off" />
          </label>
          {#if query.trim() && !results.length}
            <p class="muted">Sin resultados para «{query.trim()}». Se busca por nombre en todo el índice; texto y tipo, sólo en los packs en memoria.</p>
          {/if}
          <ul class="results" aria-label="Resultados de búsqueda">
            {#each results as result (result.key)}
              <li>
                <div class="result-text">
                  <strong>{result.name}</strong>
                  <span class="muted">
                    {result.type}
                    {#if !result.certified}<span class="tag warn">sin certificar</span>{/if}
                    {#if !result.loaded}<span class="tag">sólo índice</span>{/if}
                  </span>
                </div>
                <button type="button" class="add" aria-label={`Añadir ${result.name}`} onclick={() => pick(result)}>+</button>
              </li>
            {/each}
          </ul>
        </div>

        <div class="deck">
          <label class="field">
            <span>Nombre del mazo</span>
            <input type="text" bind:value={deckName} maxlength="60" />
          </label>
          {#if lines.length}
            <ul class="lines" aria-label="Cartas del mazo">
              {#each lines as line (line.name)}
                <li>
                  <input
                    class="count"
                    type="number"
                    min="0"
                    max="99"
                    value={line.count}
                    aria-label={`Cantidad de ${line.name}`}
                    oninput={(event) => setCount(line.name, event.currentTarget.value)}
                  />
                  <span class="line-name" class:missing={availability.missing.some((m) => m.name === line.name)}>{line.name}</span>
                  <button type="button" class="link" aria-label={`Quitar ${line.name}`} onclick={() => add(line.name, -line.count)}>Quitar</button>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="muted">Sin cartas. Busca a la izquierda o importa una lista.</p>
          {/if}

          {#if lines.length && total < 40}
            <p class="muted" role="note">
              {total} cartas: el puente fija el formato Limited con mínimo de 40. Mesa no bloquea el inicio
              porque esa comprobación pertenece a Phase y todavía no está expuesta; el motor dirá qué cargó.
            </p>
          {/if}

          {#if uncertifiedTotal > 0}
            <p class="notice warn" role="alert">
              {uncertifiedTotal} cartas sin certificar: {uncertifiedLines.map((line) => line.name).slice(0, 5).join(', ')}.
              El pack existe, pero Phase no validó estas cartas ni las jugó ninguna partida.
            </p>
          {/if}

          {#if missingTotal > 0}
            <p class="notice warn" role="alert">
              {missingTotal} cartas no están en el catálogo cargado: {availability.missing.map((line) => line.name).slice(0, 5).join(', ')}. El motor las omitiría al iniciar.
            </p>
          {/if}

          <div class="actions">
            <button type="button" class="primary" disabled={!lines.length || missingTotal > 0 || uncertifiedTotal > 0} onclick={play}>Jugar con este mazo</button>
            <button type="button" onclick={save}>Guardar</button>
            <button type="button" onclick={() => showImport = !showImport} aria-expanded={showImport}>Importar lista</button>
            <button type="button" onclick={startFresh}>Nuevo</button>
          </div>

          {#if showImport}
            <label class="field">
              <span>Pega una lista (formato Arena/MTGO: «4 Lightning Bolt»)</span>
              <textarea bind:value={importText} rows="6" placeholder={'4 Lightning Bolt\n20 Mountain\n\nSideboard\n2 Shock'}></textarea>
            </label>
            <button type="button" onclick={doImport}>Convertir lista</button>
            <button type="button" class="link" onclick={() => { importText = formatDeckList(lines); }}>Copiar el mazo actual como texto</button>
          {/if}
        </div>
      </div>

      {#if saved.length}
        <section class="saved" aria-label="Mazos guardados">
          <h3>Mazos guardados</h3>
          <ul>
            {#each saved as deck (deck.id)}
              <li>
                <span><strong>{deck.name}</strong> · {deckSize(deck.lines)} cartas · {new Date(deck.updatedAt).toLocaleDateString('es-419')}</span>
                <button type="button" class="link" onclick={() => load(deck)}>Editar</button>
                <button type="button" class="link" aria-label={`Eliminar ${deck.name}`} onclick={() => remove(deck.id)}>Eliminar</button>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    </div>
  {/if}
</section>

<style>
  .builder { display: grid; gap: .6rem; }
  .toggle { justify-self: start; border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); border-radius: 9px; padding: .4rem .7rem; }
  .panel { display: grid; gap: .8rem; border: 1px solid var(--line); border-radius: 12px; padding: .9rem; background: var(--surface); }
  header { display: flex; justify-content: space-between; gap: .8rem; flex-wrap: wrap; align-items: start; }
  h2 { margin: 0 0 .2rem; font-size: 1rem; }
  h3 { margin: 0 0 .3rem; font-size: .9rem; }
  .muted { color: var(--ink-muted); font-size: .78rem; margin: 0; }
  .counters { display: flex; gap: .3rem; }
  .pill { border: 1px solid var(--line); border-radius: 999px; padding: .15rem .5rem; font-size: .75rem; }
  .pill.ok { border-color: var(--ok); color: var(--ok); }
  .columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: .8rem; }
  @media (max-width: 720px) { .columns { grid-template-columns: 1fr; } }
  .field { display: grid; gap: .25rem; font-size: .78rem; color: var(--ink-muted); }
  .field input, .field textarea { border: 1px solid var(--line); border-radius: 8px; padding: .4rem .5rem; background: var(--surface-2); color: var(--ink); font: inherit; }
  .results, .lines, .saved ul { list-style: none; margin: .4rem 0 0; padding: 0; display: grid; gap: .25rem; max-height: 15rem; overflow: auto; }
  .results li { display: flex; justify-content: space-between; gap: .5rem; align-items: center; border-bottom: 1px solid var(--line); padding-bottom: .25rem; }
  .result-text { display: grid; min-width: 0; }
  .result-text strong { font-size: .8rem; overflow-wrap: anywhere; }
  .result-text span { overflow-wrap: anywhere; }
  .add { border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); border-radius: 6px; min-width: 30px; min-height: 30px; font-weight: 700; }
  .lines li { display: grid; grid-template-columns: 4.2rem minmax(0, 1fr) auto; gap: .4rem; align-items: center; }
  .count { width: 100%; border: 1px solid var(--line); border-radius: 6px; padding: .2rem .3rem; background: var(--surface-2); color: var(--ink); font: inherit; }
  .line-name { font-size: .8rem; overflow-wrap: anywhere; }
  .line-name.missing { color: var(--danger, #c0392b); text-decoration: line-through; }
  .actions { display: flex; flex-wrap: wrap; gap: .35rem; margin-top: .6rem; }
  .actions button { border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); border-radius: 8px; padding: .35rem .6rem; }
  .actions .primary { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
  .link { border: none; background: none; color: var(--accent); text-decoration: underline; padding: 0 .2rem; font-size: .75rem; }
  .notice { margin: 0; font-size: .78rem; }
  .notice.warn { color: var(--warn, #a15c00); }
  .tag { margin-left: .3rem; border: 1px solid var(--line); border-radius: 999px; padding: 0 .35rem; font-size: .68rem; }
  .tag.warn { border-color: var(--warn, #a15c00); color: var(--warn, #a15c00); }
  .saved { border-top: 1px solid var(--line); padding-top: .6rem; }
  .saved li { display: flex; gap: .5rem; align-items: center; justify-content: space-between; font-size: .78rem; flex-wrap: wrap; }
</style>
