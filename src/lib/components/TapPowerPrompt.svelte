<script lang="ts">
  /**
   * `WaitingFor::CrewVehicle` and `WaitingFor::SaddleMount` — CR 702.122a and
   * CR 702.171a: tap creatures whose contribution adds up to N.
   *
   * The numbers are the engine's, not the printed power: a Pilot token
   * contributes more ("as though its power were N greater") and a Mount can
   * count toughness instead, so the block sums `contributions` and says so. When
   * the engine sends no contribution list there is no total to claim, and the
   * block does not invent one: it shows the pick and lets Phase decide.
   *
   * The keyword names its own action — crew answers `CrewVehicle`, saddle
   * answers `SaddleMount` — and the block says which one it is asking for.
   */
  import { session } from '#lib/game/session.svelte.ts';

  const prompt = $derived(session.tapPowerPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const source = $derived(prompt ? objects[String(prompt.sourceId)]?.name : undefined);
  const picked = $derived(session.tapPick);
  const total = $derived(session.tapTotal);
  const nameOf = (id: number) => objects[String(id)]?.name ?? `Objeto ${id}`;
  const keyword = $derived(prompt?.kind === 'saddle' ? 'Montar' : 'Tripular');
  // One expression, not a template split by blocks: Svelte trims the whitespace at
  // the edge of a block, and `{total} · suficiente` came out as `3· suficiente`.
  const ruleLine = $derived.by(() => {
    if (!prompt) return '';
    const base = `Gira criaturas tuyas hasta sumar ${prompt.required}.`;
    return prompt.kind === 'saddle'
      ? `${base} Es montar, no tripular: el coste y la acción son otros (CR 702.171a).`
      : base;
  });
  const totalLine = $derived.by(() => {
    if (!prompt) return '';
    if (total === null) {
      return 'Phase no publica la aportación de cada criatura, así que aquí no hay suma que enseñar: valida la elección el motor.';
    }
    return `Sumas ${total} de ${prompt.required}${total >= prompt.required ? ' · suficiente' : ''}.`;
  });
</script>

{#if prompt && mine}
  <div class="prompt" aria-label="Girar criaturas por un coste" data-tap-power>
    <strong>{keyword}{source ? ` · ${source}` : ''}</strong>
    <p class="hint">{ruleLine}</p>
    <p class="hint" data-tap-total>{totalLine}</p>
    {#if prompt.creatures.length}
      <ul class="rows">
        {#each prompt.creatures as creature (creature.id)}
          <li>
            <button
              type="button"
              class="row"
              aria-pressed={picked.includes(creature.id)}
              disabled={session.busy}
              onclick={() => session.toggleTapPick(creature.id)}>
              <span>{nameOf(creature.id)}</span>
              <span class="power">{creature.contribution ?? '?'}</span>
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="hint">Phase no ofrece criaturas para este coste.</p>
    {/if}
    <button
      type="button"
      class="primary"
      disabled={session.busy || !session.tapReady}
      onclick={() => session.confirmTapPick()}>
      {picked.length === 0
        ? `Girar para ${keyword.toLowerCase()}`
        : `${keyword}: ${picked.map(nameOf).join(' + ')}`}
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
  .rows { margin: 0; padding: 0; list-style: none; display: grid; gap: .3rem; }
  .row {
    width: 100%;
    min-height: 44px;
    display: flex;
    gap: .5rem;
    align-items: baseline;
    justify-content: space-between;
    padding: .45rem .55rem;
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
  .row[aria-pressed='true'] { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
  .power { font-weight: 500; font-size: .76rem; color: var(--ink-2); }
  .primary {
    min-height: 44px;
    padding: .55rem .7rem;
    border: 1px solid var(--accent);
    border-radius: 9px;
    background: var(--accent);
    color: var(--accent-ink);
    font: inherit;
    font-size: .84rem;
    font-weight: 650;
    cursor: pointer;
  }
  .primary:disabled, .row:disabled { opacity: .55; cursor: not-allowed; }
  button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
