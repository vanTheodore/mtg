<script lang="ts">
  /**
   * `WaitingFor::CopyRetarget` — CR 707.10c (+ CR 722.3c / CR 702.192a): "you may
   * choose new targets for the copy".
   *
   * The engine runs this as a **walk**: it asks one position at a time, and answers
   * advance it. So the block shows the whole walk at once — where it is, what each
   * decided position kept or became, and what the current one admits — instead of a
   * single anonymous target list. Every permission on screen is engine-derived
   * (`can_keep`, `can_decline`, `can_keep_rest`); the block renders them and does
   * not recompute legality.
   *
   * The same variant announces a freshly cast copy's targets (CR 601.2c). That mode
   * has nothing to keep and says so, and an *optional* slot ("up to two") may be
   * declined — which is a real answer, not an incomplete form (CR 115.6).
   *
   * A walk can also open with an announcing-opponent election (CR 115.1 +
   * CR 707.12): then no target is being answered and the question is which opponent
   * announces that group.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { distinctTargetLabels, parseTarget } from '#lib/game/interaction.ts';
  import type { TargetRef } from '#lib/engine/types.ts';

  const prompt = $derived(session.copyRetargetPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const copyName = $derived(prompt ? objects[String(prompt.copyId)]?.name : undefined);
  const slot = $derived(prompt && prompt.slots[prompt.currentSlot] ? prompt.slots[prompt.currentSlot] : null);

  /**
   * Every target the walk can name, labelled once: names repeat across slots and
   * across slots-with-the-same-name, so the shared helper disambiguates by
   * controller and then by id.
   */
  const allTargets = $derived.by(() => {
    const list: TargetRef[] = [];
    for (const entry of prompt?.slots ?? []) {
      if (entry.current) list.push(entry.current);
      list.push(...entry.alternatives);
    }
    return list;
  });
  const labels = $derived(distinctTargetLabels(allTargets, objects));
  const labelOf = (target: TargetRef | null): string => {
    if (!target) return 'sin objetivo';
    const index = allTargets.findIndex((entry) => sameTarget(entry, target));
    return (index >= 0 ? labels[index] : undefined) ?? 'objetivo';
  };
  function sameTarget(a: TargetRef, b: TargetRef): boolean {
    const left = parseTarget(a);
    const right = parseTarget(b);
    return !!left && !!right && left.kind === right.kind && left.id === right.id;
  }

  const decided = $derived(prompt?.picks ?? []);
  const progressLine = $derived.by(() => {
    if (!prompt) return '';
    if (prompt.announcer) return `La copia la anuncia un oponente (CR 115.1).`;
    const place = Math.min(prompt.currentSlot + 1, prompt.slots.length);
    return `Objetivo ${place} de ${prompt.slots.length}`;
  });

  const slotLine = $derived.by(() => {
    if (!slot) return '';
    if (prompt?.mode === 'announce') {
      return slot.canDecline
        ? 'Esta ranura es opcional: puedes no elegir objetivo (CR 115.6).'
        : 'La copia recién lanzada anuncia sus objetivos: cada ranura necesita el suyo (CR 601.2c).';
    }
    return slot.canKeep
      ? `Ahora apunta a ${labelOf(slot.current)}, y puede quedarse así (CR 707.10c).`
      : `Ahora apunta a ${labelOf(slot.current)}, pero este cambio no puede dejarlo como está.`;
  });

  const modeLabel = $derived(prompt?.mode === 'announce' ? 'Anunciar objetivos' : 'Cambiar objetivos');
</script>

{#if prompt && mine}
  <div
    class="prompt"
    aria-label="Objetivos de la copia"
    data-copy-retarget
    data-copy-mode={prompt.mode}
    data-copy-slot={prompt.currentSlot}
    data-copy-slots={prompt.slots.length}
    data-copy-keep-rest={prompt.canKeepRest}>
    <strong>
      Copia{modeLabel ? ` · ${modeLabel}` : ''}{copyName ? ` · ${copyName}` : ''}
    </strong>
    <p class="hint">
      {#if prompt.mode === 'announce'}
        Una copia que se lanza elige sus propios objetivos: no hereda los del hechizo original (CR 707.12).
      {:else}
        Puedes elegir objetivos nuevos para la copia y dejar los que quieras como están (CR 707.10c).
      {/if}
    </p>
    {#if prompt.controller !== null && prompt.controller !== prompt.player}
      <p class="hint" data-copy-controller>
        La copia es del Jugador {prompt.controller + 1}; quien responde aquí es el Jugador {prompt.player + 1} (CR 112.2).
      </p>
    {/if}

    {#if prompt.announcer}
      <p class="hint" data-copy-progress>{progressLine}</p>
      <p class="hint">
        Grupo {prompt.announcer.choiceIndex} de {prompt.announcer.choiceCount}: elige qué oponente lo anuncia (CR 601.2c).
      </p>
      <ul class="rows">
        {#each prompt.announcer.candidates as candidate (candidate)}
          <li>
            <button
              type="button"
              class="row"
              disabled={session.busy}
              data-copy-announcer={candidate}
              onclick={() => session.chooseCopyAnnouncer(candidate)}>
              Jugador {candidate + 1}
            </button>
          </li>
        {/each}
      </ul>
    {:else if slot}
      <p class="hint" data-copy-progress>{progressLine}</p>
      {#if decided.length}
        <ul class="picks" data-copy-picks>
          {#each decided as pick, index (index)}
            <li>Objetivo {index + 1}: {pick ? labelOf(pick) : 'se queda como estaba'}</li>
          {/each}
        </ul>
      {/if}
      <p class="hint" data-copy-current>{slotLine}</p>
      <ul class="rows">
        {#if slot.alternatives.length}
          {#each slot.alternatives as alternative, index (index)}
            <li>
              <button
                type="button"
                class="row"
                disabled={session.busy}
                data-copy-candidate={index}
                onclick={() => session.answerCopySlot(alternative)}>
                {labelOf(alternative)}
              </button>
            </li>
          {/each}
        {:else}
          <li class="none">Phase no publica objetivos alternativos para esta ranura.</li>
        {/if}
        {#if slot.canKeep}
          <li>
            <button
              type="button"
              class="row keep"
              disabled={session.busy}
              data-copy-keep
              onclick={() => session.answerCopySlot(null)}>
              Dejarlo en {labelOf(slot.current)}
            </button>
          </li>
        {/if}
        {#if slot.canDecline}
          <li>
            <button
              type="button"
              class="row keep"
              disabled={session.busy}
              data-copy-decline
              onclick={() => session.answerCopySlot(null)}>
              No elegir objetivo para esta ranura
            </button>
          </li>
        {/if}
      </ul>
      {#if prompt.canKeepRest}
        <button
          type="button"
          class="primary"
          disabled={session.busy}
          data-copy-keep-rest
          onclick={() => session.keepRemainingCopyTargets()}>
          Dejar el resto como está
        </button>
      {/if}
    {:else}
      <p class="hint">Phase no publica ranuras para esta copia.</p>
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
  .picks {
    margin: 0;
    padding: 0 0 0 .9rem;
    font-size: .78rem;
    color: var(--ink-2);
  }
  .rows { margin: 0; padding: 0; list-style: none; display: grid; gap: .3rem; }
  .none { font-size: .78rem; color: var(--ink-2); }
  .row {
    display: flex;
    align-items: center;
    gap: .45rem;
    width: 100%;
    min-height: 44px;
    padding: .35rem .5rem;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--surface-3);
    color: var(--ink);
    font: inherit;
    font-size: .84rem;
    font-weight: 650;
    text-align: left;
    cursor: pointer;
  }
  .row.keep { background: var(--surface-1); font-weight: 600; }
  .row:disabled { opacity: .55; cursor: not-allowed; }
  .row:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
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
