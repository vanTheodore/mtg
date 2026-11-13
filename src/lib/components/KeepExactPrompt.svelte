<script lang="ts">
  /**
   * `WaitingFor::KeepExactPermanentsChoice` — CR 101.4 + CR 701.21a: keep exactly N
   * permanents, sacrifice the rest.
   *
   * The number is the engine's: `required_count` arrives **already capped to what
   * is eligible** under CR 609.3 ("do as much as possible"), and the prompt's own
   * contract says clients render it instead of deriving a second legality rule from
   * the pool. So the block shows that number, counts down to it, and never quietly
   * lowers it when the pool is short — a short pool means the engine already
   * decided, and the screen would only be second-guessing it.
   *
   * When the instruction owes its keepers a mark (CR 122.1 — Promise of Loyalty's
   * vow counter), it is placed **before** the sacrifice, so it is announced with
   * the choice and not after it.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { counterLabel, distinctTargetLabels, objectTarget } from '#lib/game/interaction.ts';

  const prompt = $derived(session.keepExactPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const labels = $derived(distinctTargetLabels((prompt?.eligible ?? []).map((id) => objectTarget(id)), objects));
  const nameOf = (id: number) => {
    const index = (prompt?.eligible ?? []).indexOf(id);
    return (index >= 0 ? labels[index] : undefined) ?? objects[String(id)]?.name ?? `Permanente ${id}`;
  };
  const picked = $derived(session.keepExactPick.length);

  const counterLine = $derived.by(() => {
    if (!prompt?.keeperCounter) return '';
    const label = counterLabel(prompt.keeperCounter.type);
    const amount = prompt.keeperCounter.count === 1 ? `un contador de ${label}` : `${prompt.keeperCounter.count} contadores de ${label}`;
    return `Cada permanente conservado recibe ${amount} antes de que se sacrifique el resto (CR 122.1).`;
  });

  const scopeLine = $derived.by(() => {
    if (!prompt) return '';
    if (prompt.chooserScope === 'forAll') {
      return `Eliges tú por todos los jugadores del efecto (CR 101.4), y ahora te toca el Jugador ${prompt.targetPlayer + 1}.`;
    }
    // What stays is named by the engine's filters, which this block does not read:
    // "candidatos" covers creature-only keepers like Promise of Loyalty as well.
    return `Eliges de entre los candidatos del Jugador ${prompt.targetPlayer + 1}.`;
  });

  // CR 609.3: the engine capped the number to the pool before publishing it, so the
  // screen states both figures as they arrive and derives no rule of its own.
  const poolLine = $derived.by(() => {
    if (!prompt) return '';
    return `Hay ${prompt.eligible.length} candidatos y el número ya viene recortado a lo que se puede hacer (CR 609.3).`;
  });

  const confirmLabel = $derived.by(() => {
    if (!prompt) return '';
    const left = session.keepExactRemaining;
    if (left > 0) return left === 1 ? 'Elige uno más' : `Elige ${left} más`;
    const after = prompt.remainingPlayers.length ? ` · después elige el Jugador ${prompt.remainingPlayers[0] + 1}` : '';
    return `Conservar ${prompt.requiredCount} y sacrificar el resto${after}`;
  });
</script>

{#if prompt && mine}
  <div class="prompt" aria-label="Conservar permanentes" data-keep-exact data-keep-exact-required={prompt.requiredCount}>
    <strong>Conservar exactamente {prompt.requiredCount}</strong>
    <p class="hint">
      Ni uno más ni uno menos: el resto se sacrifica (CR 701.21a). Cuántos se conservan lo resuelve el
      motor; aquí sólo se elige cuáles.
    </p>
    <p class="hint">{scopeLine}</p>
    <p class="hint" data-keep-exact-pool>{poolLine}</p>
    {#if counterLine}<p class="hint" data-keep-exact-counter>{counterLine}</p>{/if}
    <p class="hint count" data-keep-exact-count>Elegidos {picked} de {prompt.requiredCount}</p>
    {#if prompt.eligible.length}
      <ul class="rows">
        {#each prompt.eligible as id (id)}
          {@const chosen = session.keepExactIsPicked(id)}
          <li>
            <button
              type="button"
              class="row"
              aria-pressed={chosen}
              disabled={session.busy || (!chosen && picked >= prompt.requiredCount)}
              data-keep-exact-object={id}
              onclick={() => session.toggleKeepExact(id)}>
              <span class="tick" aria-hidden="true">{chosen ? '✓' : ''}</span>
              <span class="name">{nameOf(id)}</span>
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="hint">Phase no publica permanentes que conservar.</p>
    {/if}
    <button
      type="button"
      class="primary"
      disabled={session.busy || !session.keepExactReady}
      data-keep-exact-ready={session.keepExactReady}
      onclick={() => session.confirmKeepExact()}>
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
  .count { font-weight: 650; color: var(--ink); }
  .rows { margin: 0; padding: 0; list-style: none; display: grid; gap: .3rem; }
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
  .tick { width: 1.1ch; font-size: .9rem; font-weight: 800; color: var(--accent); }
  .name { flex: 1; font-size: .84rem; font-weight: 650; }
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
