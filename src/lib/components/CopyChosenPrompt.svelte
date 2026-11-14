<script lang="ts">
  /**
   * `WaitingFor::EachPlayerCopyChosenSelection` — CR 707.2 + CR 101.4: each player
   * chooses one or two creatures, a token copies the **first** one, and the second
   * is only read to put counters on that token.
   *
   * The order is the rule, not a detail: the answer is an ordered list where index
   * 0 is copied and index 1 scales. So the block numbers the picks as they are made
   * and shows which of them is doing what, instead of rendering a set that would
   * look interchangeable. Removing an earlier pick re-ranks the rest, which is the
   * only honest way to let a player fix an order without redoing everything.
   *
   * Nothing is applied until the whole APNAP set is collected (`all_choices`), so
   * the block also shows what earlier players already chose.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { counterLabel, distinctTargetLabels, objectPropertyLabel, objectTarget } from '#lib/game/interaction.ts';

  const prompt = $derived(session.copyChosenPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const labels = $derived(distinctTargetLabels((prompt?.eligible ?? []).map((id) => objectTarget(id)), objects));
  const nameOf = (id: number) => {
    const index = (prompt?.eligible ?? []).indexOf(id);
    return (index >= 0 ? labels[index] : undefined) ?? objects[String(id)]?.name ?? `Objeto ${id}`;
  };

  const scopeLine = $derived.by(() => {
    if (!prompt) return '';
    if (prompt.scope === 'own') return 'Eliges de entre las criaturas que controlas tú.';
    return `Eliges de entre las criaturas que controla tu vecino de la ${prompt.scope === 'left' ? 'izquierda' : 'derecha'} (CR 102.1).`;
  });

  const scaleLine = $derived.by(() => {
    if (!prompt?.scale) return '';
    const counter = counterLabel(prompt.scale.counterType);
    const property = objectPropertyLabel(prompt.scale.property);
    return `El segundo elegido no se copia: sólo añade al token tantos contadores de ${counter} como ${property} tenga (CR 208.1).`;
  });

  const earlierLine = $derived.by(() => {
    if (!prompt?.earlier.length) return '';
    return prompt.earlier
      .map((entry) => `Jugador ${entry.player + 1}: ${entry.chosen.map((id) => nameOf(id)).join(', ')}`)
      .join(' · ');
  });

  const confirmLabel = $derived.by(() => {
    if (!prompt) return '';
    const picked = session.copyChosenPick.length;
    if (picked < prompt.min) {
      return prompt.min === 1 ? 'Elige la criatura que se copia' : `Elige al menos ${prompt.min}`;
    }
    if (picked === 1) return prompt.max > 1 ? 'Copiar 1 criatura' : 'Copiar la criatura elegida';
    return `Copiar la 1ª y escalar con la 2ª`;
  });
</script>

{#if prompt && mine}
  <div class="prompt" aria-label="Copiar una criatura elegida" data-copy-chosen data-copy-chosen-scope={prompt.scope}>
    <strong>Copiar una criatura elegida</strong>
    <p class="hint">
      Elige {prompt.min === prompt.max ? `${prompt.max}` : `entre ${prompt.min} y ${prompt.max}`} criatura{prompt.max === 1 ? '' : 's'}:
      el token copia la <em>primera</em> que elijas y, si eliges una segunda, sólo sirve para los contadores. El orden es
      la regla, no un adorno, así que se numera tal como lo eliges (CR 707.2).
    </p>
    <p class="hint">{scopeLine}</p>
    {#if scaleLine}<p class="hint" data-copy-chosen-scale>{scaleLine}</p>{/if}
    {#if earlierLine}
      <p class="hint" data-copy-chosen-earlier>Ya eligieron — {earlierLine}. Nada se aplica hasta que elija el último jugador (CR 101.4).</p>
    {/if}
    <ol class="picks">
      {#each session.copyChosenPick as id, index (id)}
        <li class="pick">
          <span class="rank">{index + 1}º</span>
          <span class="name">{nameOf(id)}</span>
          <span class="role">{index === 0 ? 'se copia' : 'escala la copia'}</span>
        </li>
      {/each}
      {#if !session.copyChosenPick.length}
        <li class="empty">Todavía no elegiste ninguna.</li>
      {/if}
    </ol>
    {#if prompt.eligible.length}
      <div class="chips">
        {#each prompt.eligible as id (id)}
          {@const rank = session.copyChosenRank(id)}
          <button
            type="button"
            class="chip"
            aria-pressed={rank >= 0}
            disabled={session.busy || (rank < 0 && session.copyChosenPick.length >= prompt.max)}
            data-copy-chosen-pick={id}
            onclick={() => session.toggleCopyChosen(id)}>
            {#if rank >= 0}<span class="chip-rank">{rank + 1}º</span>{/if}
            {nameOf(id)}
          </button>
        {/each}
      </div>
    {:else}
      <p class="hint">Phase no publica criaturas elegibles para esta copia.</p>
    {/if}
    <button
      type="button"
      class="primary"
      disabled={session.busy || !session.copyChosenReady}
      data-copy-chosen-ready={session.copyChosenReady}
      onclick={() => session.confirmCopyChosen()}>
      {confirmLabel}
    </button>
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
  .picks { margin: 0; padding: 0; list-style: none; display: grid; gap: .25rem; }
  .pick {
    display: flex;
    align-items: baseline;
    gap: .4rem;
    padding: .3rem .45rem;
    border: 1px solid var(--accent);
    border-radius: 8px;
    background: var(--surface-1);
  }
  .rank { font-size: .78rem; font-weight: 800; color: var(--accent); }
  .name { flex: 1; font-size: .82rem; font-weight: 650; color: var(--ink); }
  .role { font-size: .7rem; letter-spacing: .04em; text-transform: uppercase; color: var(--ink-2); }
  .empty { padding: .25rem 0; font-size: .78rem; color: var(--ink-2); }
  .chips { display: flex; flex-wrap: wrap; gap: .3rem; }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: .3rem;
    min-height: 36px;
    padding: .3rem .6rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-3);
    color: var(--ink);
    font: inherit;
    font-size: .8rem;
    font-weight: 650;
    cursor: pointer;
  }
  .chip[aria-pressed='true'] { border-color: var(--accent); background: var(--surface-1); }
  .chip-rank { font-size: .72rem; font-weight: 800; color: var(--accent); }
  .chip:disabled { opacity: .55; cursor: not-allowed; }
  .chip:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
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
