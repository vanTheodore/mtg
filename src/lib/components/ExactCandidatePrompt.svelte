<script lang="ts">
  /**
   * `ChooseRingBearer` (CR 701.54a), `ChooseLegend` (CR 704.5j) y
   * `BattleProtectorChoice` (CR 310.11).
   *
   * Tres preguntas, una forma: el motor publica una lista cerrada de candidatos
   * y la respuesta elige uno. El bloque no filtra, no ordena y no completa la
   * lista: pinta los candidatos que llegaron, en su orden, y sólo dibuja botón
   * para el candidato que además tiene una acción publicada en `legal.actions`.
   * Un candidato sin acción es una fila que se lee sin botón — se dice lo que el
   * cable dice, y nada más.
   *
   * El nombre del candidato es el del objeto del campo; si el cable no publica
   * ese objeto, la fila se lee sin nombre inventado. El asiento que no decide ve
   * la misma lista y no recibe botones (CR 400.2).
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { distinctTargetLabels, exactCandidateAction, exactCandidateOffers, objectTarget } from '#lib/game/interaction.ts';
  import { typeLine } from '#lib/game/cards.ts';

  const prompt = $derived(session.exactCandidatePrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const offers = $derived(exactCandidateOffers(session.snapshot?.legal.actions ?? []));

  // Los dos prompts de objeto comparten el vocabulario de nombres del campo.
  const labels = $derived(
    prompt && prompt.kind !== 'battle-protector'
      ? distinctTargetLabels(prompt.candidates.map((id) => objectTarget(id)), objects)
      : []
  );

  function seat(id: number) {
    return `Jugador ${id + 1}`;
  }

  /** CR 310.11: un protector es un asiento. */
  function candidateName(id: number, index: number) {
    if (!prompt) return '';
    if (prompt.kind === 'battle-protector') return seat(id);
    return labels[index] ?? objects[String(id)]?.name ?? `Objeto ${id}`;
  }

  function candidateType(id: number) {
    const object = objects[String(id)];
    return object ? typeLine(object) : '';
  }

  const title = $derived.by(() => {
    if (!prompt) return '';
    if (prompt.kind === 'ring-bearer') return 'Elegir portador del Anillo';
    if (prompt.kind === 'battle-protector') return 'Elegir protector de la batalla';
    // CR 704.5j: el nombre legendario viene del cable; sin él no se inventa uno.
    return prompt.legendName ? `Elegir qué ${prompt.legendName} se queda` : 'Elegir qué legendario se queda';
  });

  const battleName = $derived(
    prompt?.battleId !== null && prompt?.battleId !== undefined
      ? objects[String(prompt.battleId)]?.name ?? null
      : null
  );
</script>

{#if prompt}
  <div
    class="prompt"
    aria-label={title}
    data-exact-candidate
    data-exact-candidate-kind={prompt.kind}
    data-exact-candidate-count={prompt.candidates.length}
    data-exact-candidate-player={prompt.player}>
    <strong>{title}</strong>
    <p class="hint" data-exact-candidate-rule>
      {#if prompt.kind === 'ring-bearer'}
        CR 701.54a: el Anillo te tienta y eliges qué criatura lo porta. Las criaturas de la lista son las que Phase publicó.
      {:else if prompt.kind === 'battle-protector'}
        CR 310.11: al quedar la batalla sin protector, su controlador elige qué jugador la protege.
      {:else}
        CR 704.5j: dos o más legendarios con el mismo nombre no pueden estar bajo el mismo control; eliges cuál se queda y el resto va al cementerio.
      {/if}
    </p>

    {#if prompt.kind === 'battle-protector' && battleName}
      <p class="hint" data-exact-candidate-battle>Batalla: {battleName}</p>
    {/if}

    {#if !mine}
      <ul class="faces" data-exact-candidate-faces>
        {#each prompt.candidates as id, index (id)}
          <li>{candidateName(id, index)}</li>
        {/each}
      </ul>
      <p class="hint" data-exact-candidate-other>
        Esta elección es del Jugador {prompt.player + 1}: no es tu decisión (CR 400.2).
      </p>
    {:else}
      <div class="actions">
        {#each prompt.candidates as id, index (id)}
          {@const action = exactCandidateAction(offers, prompt, id)}
          {#if action}
            <button
              type="button"
              class="primary"
              data-exact-candidate-option={id}
              disabled={session.busy}
              onclick={() => session.answerExactCandidate(action)}>
              {candidateName(id, index)}
              {#if candidateType(id)}<span class="type">{candidateType(id)}</span>{/if}
            </button>
          {:else}
            <span class="no-action" data-exact-candidate-inert={id}>{candidateName(id, index)}</span>
          {/if}
        {/each}
      </div>
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
  .faces { margin: 0; padding-left: 1.1rem; font-size: .78rem; }
  .actions { display: flex; gap: .4rem; flex-wrap: wrap; }
  .primary {
    min-height: 44px;
    padding: .55rem .7rem;
    border-radius: 9px;
    font: inherit;
    font-size: .82rem;
    font-weight: 650;
    cursor: pointer;
    display: grid;
    gap: .1rem;
    text-align: left;
  }
  .primary { border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); }
  .primary:disabled { opacity: .55; cursor: not-allowed; }
  .primary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .type { font-size: .72rem; font-weight: 500; }
  .no-action {
    min-height: 44px;
    display: grid;
    align-items: center;
    padding: .55rem .7rem;
    border: 1px dashed var(--line);
    border-radius: 9px;
    font-size: .82rem;
    color: var(--ink-2);
  }
</style>
