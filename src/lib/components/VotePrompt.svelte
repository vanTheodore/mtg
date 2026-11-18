<script lang="ts">
  /**
   * `WaitingFor::VoteChoice` — CR 101.4 + CR 701.38: a vote, which the engine runs
   * as a session: every voter casts its ballots in APNAP order and the tally waits
   * for the queue.
   *
   * The block is the room, not the ballot: it says who votes now, what is already
   * tallied (and for what), and what is left. Two shapes share it and they answer
   * differently — a named vote ("votes for profit or security") sends the canonical
   * option, while an object vote (Council's Judgment) sends the candidate's
   * **index**, because two candidates can share a name.
   *
   * The engine decides who may answer (`actor`), so a friend-or-foe ballot is
   * gated on the resolved seat, not on the voter. And a secret vote carries its
   * tallies scrubbed for viewers until the simultaneous reveal: the block says it is
   * secret instead of drawing zeros as if nobody had voted.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { distinctTargetLabels, objectTarget } from '#lib/game/interaction.ts';

  const prompt = $derived(session.votePrompt);
  const mine = $derived(prompt !== null && prompt.voter === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const source = $derived(prompt ? objects[String(prompt.sourceId)]?.name : undefined);
  const open = $derived(prompt?.visibility === 'open');

  /** Object-pool candidates get the shared disambiguating labels; one call only. */
  const candidateLabels = $derived(
    distinctTargetLabels((prompt?.entries ?? []).flatMap((entry) => (entry.candidateId === null ? [] : [objectTarget(entry.candidateId)])), objects)
  );
  const candidateLabelOf = (id: number): string => {
    const order = (prompt?.entries ?? []).flatMap((entry) => (entry.candidateId === null ? [] : [entry.candidateId]));
    const index = order.indexOf(id);
    return (index >= 0 ? candidateLabels[index] : undefined) ?? objects[String(id)]?.name ?? `Permanente ${id}`;
  };
  const labelOf = (index: number): string => {
    const entry = prompt?.entries[index];
    if (!entry) return `Opción ${index + 1}`;
    if (entry.candidateId !== null) return candidateLabelOf(entry.candidateId);
    return entry.label || entry.option || `Opción ${index + 1}`;
  };

  const talliesLine = $derived.by(() => {
    if (!prompt) return '';
    if (!open) return 'Voto secreto: el recuento no se publica hasta que todos hayan votado (CR 701.38).';
    const cast = prompt.ballots.length;
    if (!cast) return 'Todavía no ha votado nadie.';
    return cast === 1 ? '1 voto emitido.' : `${cast} votos emitidos.`;
  });

  const turnLine = $derived.by(() => {
    if (!prompt) return '';
    const who = prompt.delegated
      ? `Vota el Jugador ${prompt.player + 1}, y lo haces tú por él (CR 101.4).`
      : `Te toca votar, Jugador ${prompt.player + 1}.`;
    const many = prompt.remainingVotes > 1 ? ` Tienes ${prompt.remainingVotes} votos seguidos (CR 701.38d).` : '';
    const after = prompt.remainingVoters.length
      ? ` Después vota el Jugador ${prompt.remainingVoters[0].player + 1}.`
      : '';
    return `${who}${many}${after}`;
  });
</script>

{#if prompt && mine}
  <div
    class="prompt"
    aria-label="Votación"
    data-vote
    data-vote-kind={prompt.objectPool ? 'object' : 'named'}
    data-vote-visibility={prompt.visibility}
    data-vote-remaining={prompt.remainingVotes}>
    <strong>Votación{source ? ` · ${source}` : ''}</strong>
    <p class="hint">Cada jugador emite sus votos en orden de turno, empezando por quien lanza el efecto (CR 101.4).</p>
    <p class="hint" data-vote-turn>{turnLine}</p>

    {#if open}
      <p class="hint" data-vote-tallies>{talliesLine}</p>
    {:else}
      <p class="hint" data-vote-secret>{talliesLine}</p>
    {/if}

    <ul class="rows">
      {#each prompt.entries as entry, index (index)}
        <li>
          <button
            type="button"
            class="row"
            disabled={session.busy}
            data-vote-choice={entry.option ?? `#${index}`}
            data-vote-index={index}
            onclick={() =>
              prompt.objectPool ? session.castVoteCandidate(index) : session.castVote(entry.option ?? '')}>
            <span class="name">{labelOf(index)}</span>
            {#if open}
              <span class="tally" data-vote-tally={index}>{entry.tally}</span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>

    {#if open && prompt.ballots.length}
      <ul class="ballots" data-vote-ballots>
        {#each prompt.ballots as ballot, index (index)}
          <li>Jugador {ballot.player + 1}: {labelOf(ballot.choice)}</li>
        {/each}
      </ul>
    {/if}

    {#if prompt.remainingVoters.length > 1}
      <p class="hint" data-vote-queue>
        Pendientes: {prompt.remainingVoters.map((entry) => `Jugador ${entry.player + 1}`).join(' · ')}
      </p>
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
  .rows { margin: 0; padding: 0; list-style: none; display: grid; gap: .3rem; }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: .5rem;
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
  .row:disabled { opacity: .55; cursor: not-allowed; }
  .row:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .name { font-size: .84rem; font-weight: 650; }
  .tally {
    min-width: 1.6rem;
    padding: .05rem .35rem;
    border-radius: 999px;
    background: var(--surface-1);
    font-size: .78rem;
    font-weight: 700;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .ballots {
    margin: 0;
    padding: 0 0 0 .9rem;
    font-size: .78rem;
    color: var(--ink-2);
  }
</style>
