<script lang="ts">
  /**
   * CR 700.3 — "separate into two piles, then an opponent chooses one" (Make an
   * Example, Fact or Fiction, Boneyard Parley). The engine runs it as three stages
   * and this is one block in all three, because it is one flow:
   *
   *   - who partitions (multiplayer only — with one opponent the engine skips it),
   *   - the partition itself, where the subject only names **pile A** and pile B is
   *     derived as the rest of the pool (CR 700.3a),
   *   - the chooser's pick of a side, one subject at a time (CR 101.4c).
   *
   * Both piles may be empty (CR 700.3d), so an empty pile A is a real answer and the
   * button says what it means instead of looking half-filled. `pile_source` decides
   * the word: permanents from the battlefield, cards from the top of the library, or
   * cards exiled earlier.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { distinctTargetLabels, objectTarget } from '#lib/game/interaction.ts';

  const prompt = $derived(session.separatePilesPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});

  const noun = $derived(prompt?.pileSource === 'battlefield' ? 'permanentes' : 'cartas');
  const sourceLine = $derived.by(() => {
    if (!prompt) return '';
    if (prompt.pileSource === 'library') {
      const count = prompt.libraryCount;
      return count
        ? `Son las ${count} cartas de la parte superior de tu biblioteca (CR 700.3).`
        : 'Son cartas reveladas de la parte superior de tu biblioteca (CR 700.3).';
    }
    if (prompt.pileSource === 'exile') return 'Son cartas exiliadas antes en esta misma resolución (CR 700.3).';
    return 'Son permanentes del campo de batalla (CR 700.3).';
  });

  /** Every id the block can name, labelled once: two piles can repeat a name. */
  const allIds = $derived.by(() => {
    const list: number[] = [];
    const add = (ids: number[]) => {
      for (const id of ids) if (!list.includes(id)) list.push(id);
    };
    if (prompt) {
      add(prompt.eligible);
      if (prompt.current) {
        add(prompt.current.pileA);
        add(prompt.current.pileB);
      }
      for (const entry of prompt.pending) {
        add(entry.pileA);
        add(entry.pileB);
      }
      for (const entry of prompt.remainingSubjects) add(entry.eligible);
    }
    return list;
  });
  const labels = $derived(distinctTargetLabels(allIds.map((id) => objectTarget(id)), objects));
  const nameOf = (id: number): string => {
    const index = allIds.indexOf(id);
    return (index >= 0 ? labels[index] : undefined) ?? objects[String(id)]?.name ?? `Objeto ${id}`;
  };
  const listOf = (ids: number[]): string => (ids.length ? ids.map(nameOf).join(' · ') : 'nada');

  const pileB = $derived((prompt?.eligible ?? []).filter((id) => !session.pileIsPicked(id)));
  const chosenLine = $derived.by(() => {
    if (!prompt || prompt.stage !== 'partition') return '';
    const a = session.pilePick;
    return `Montón A: ${listOf(a)} · Montón B: ${listOf(pileB)}`;
  });
  const confirmLabel = $derived.by(() => {
    if (!prompt || prompt.stage !== 'partition') return '';
    const a = session.pilePick;
    if (!a.length) return 'Dejar todo en el montón B';
    if (!pileB.length) return 'Dejar todo en el montón A';
    return `Separar en dos montones (${a.length} y ${pileB.length})`;
  });
</script>

{#if prompt && mine}
  <div class="prompt" aria-label="Separar en dos montones" data-separate-piles data-pile-stage={prompt.stage}>
    <strong>Separar en dos montones</strong>
    <p class="hint">{sourceLine}</p>

    {#if prompt.stage === 'opponent'}
      <!-- CR 700.3: only reachable with three or more players; with one opponent
           the engine picks them itself and never asks. -->
      <p class="hint" data-pile-opponent-line>
        Elige qué oponente separa {noun} en dos montones; después tú eliges uno (CR 700.3).
      </p>
      <ul class="rows">
        {#each prompt.candidates as candidate (candidate)}
          <li>
            <button
              type="button"
              class="row"
              disabled={session.busy}
              data-pile-opponent={candidate}
              onclick={() => session.choosePileOpponent(candidate)}>
              Jugador {candidate + 1}
            </button>
          </li>
        {/each}
      </ul>
    {:else if prompt.stage === 'partition'}
      <p class="hint">
        Separa {noun} en dos montones. Sólo eliges el montón A: el B se queda con lo demás
        (CR 700.3a), y cualquiera de los dos puede quedar vacío (CR 700.3d).
      </p>
      {#if prompt.chooser !== null}
        <p class="hint" data-pile-chooser>Después elige un montón el Jugador {prompt.chooser + 1} (CR 700.3).</p>
      {/if}
      {#if prompt.remainingSubjects.length}
        <p class="hint" data-pile-queue>
          Después separan: {prompt.remainingSubjects.map((entry) => `Jugador ${entry.player + 1}`).join(' · ')}
        </p>
      {/if}
      <p class="hint count" data-pile-piles>{chosenLine}</p>
      {#if prompt.eligible.length}
        <ul class="rows">
          {#each prompt.eligible as id (id)}
            {@const picked = session.pileIsPicked(id)}
            <li>
              <button
                type="button"
                class="row"
                aria-pressed={picked}
                disabled={session.busy}
                data-pile-object={id}
                data-pile-picked={picked}
                onclick={() => session.togglePileCard(id)}>
                <span class="tick" aria-hidden="true">{picked ? 'A' : ''}</span>
                <span class="name">{nameOf(id)}</span>
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="hint">Phase no publica objetos que separar.</p>
      {/if}
      <button
        type="button"
        class="primary"
        disabled={session.busy}
        data-pile-ready={session.pileReady}
        onclick={() => session.confirmPilePartition()}>
        {confirmLabel}
      </button>
    {:else if prompt.current}
      <p class="hint">
        Elige un montón. El elegido recibe el efecto y el otro no (CR 700.3); si quedan más
        jugadores, volverá a preguntarse por cada uno (CR 101.4c).
      </p>
      <p class="hint" data-pile-subject>Separó el Jugador {prompt.current.subject + 1}.</p>
      <div class="piles">
        <button
          type="button"
          class="pile"
          disabled={session.busy}
          data-pile-side="A"
          onclick={() => session.choosePile('A')}>
          <span class="side">Montón A · {prompt.current.pileA.length}</span>
          <span class="items">{listOf(prompt.current.pileA)}</span>
        </button>
        <button
          type="button"
          class="pile"
          disabled={session.busy}
          data-pile-side="B"
          onclick={() => session.choosePile('B')}>
          <span class="side">Montón B · {prompt.current.pileB.length}</span>
          <span class="items">{listOf(prompt.current.pileB)}</span>
        </button>
      </div>
      {#if prompt.pending.length}
        <p class="hint" data-pile-more>
          Quedan {prompt.pending.length} jugador(es) por elegir.
        </p>
      {/if}
    {:else}
      <p class="hint">Phase no publica montones para esta elección.</p>
    {/if}
  </div>
{/if}

<style>
  .prompt {
    display: grid;
    gap: .45rem;
    padding: .65rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface-2);
  }
  strong { font-size: .9rem; }
  .hint { margin: 0; font-size: .78rem; color: var(--ink-2); }
  .count { font-weight: 650; color: var(--ink); }
  .rows { margin: 0; padding: 0; list-style: none; display: grid; gap: .3rem; }
  .row {
    display: flex;
    align-items: center;
    gap: .45rem;
    width: 100%;
    min-height: 44px;
    padding: .35rem .55rem;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--surface-3);
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .row[aria-pressed='true'] {
    border-color: var(--accent);
    background: var(--surface-1);
    box-shadow: inset 3px 0 0 var(--accent);
  }
  .row:disabled { opacity: .55; cursor: not-allowed; }
  .row:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .tick { width: 1.1ch; font-size: .82rem; font-weight: 800; color: var(--accent); }
  .name { flex: 1; font-size: .84rem; font-weight: 650; }
  .piles { display: grid; gap: .4rem; grid-template-columns: 1fr 1fr; }
  .pile {
    display: grid;
    gap: .2rem;
    padding: .5rem;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--surface-3);
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .pile:disabled { opacity: .55; cursor: not-allowed; }
  .pile:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .side { font-size: .78rem; font-weight: 700; }
  .items { font-size: .78rem; color: var(--ink-2); overflow-wrap: anywhere; }
  .primary {
    min-height: 44px;
    padding: .45rem .7rem;
    border: 1px solid var(--accent);
    border-radius: 9px;
    background: var(--accent);
    color: var(--accent-ink);
    font: inherit;
    font-size: .84rem;
    font-weight: 650;
    cursor: pointer;
  }
  .primary:disabled { opacity: .55; cursor: not-allowed; }
  .primary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
