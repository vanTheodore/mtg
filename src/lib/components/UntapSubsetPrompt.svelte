<script lang="ts">
  /**
   * `WaitingFor::ChooseUntapSubset` — CR 502.3. A `MaxUntapPerType` cap (Smoke,
   * Stoic Angel, Damping Field, Winter Orb class) leaves more eligible permanents
   * than the cap allows, so the active player **must** say which ones untap.
   *
   * This is a bounded subset, not a per-permanent decline: `group` is the over-cap
   * set the engine already filtered (tapped, controlled by the player, matching the
   * cap, able to untap), `max` is the ceiling, and the complement stays tapped. An
   * empty answer is legal — nothing untaps — which is why the confirm button is
   * never disabled for choosing too little.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { manaText, typeLine } from '#lib/game/cards.ts';

  const prompt = $derived(session.untapSubsetPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const picked = $derived(session.untapSubsetPick);
  const nameOf = (id: number) => objects[String(id)]?.name ?? `Objeto ${id}`;
  function typeOf(id: number) {
    const object = objects[String(id)];
    return object ? typeLine(object) : 'Permanente';
  }
  function costOf(id: number) {
    return manaText(objects[String(id)]?.mana_cost) ?? '';
  }
  const confirm = $derived(
    !prompt
      ? ''
      : picked.length === 0
        ? 'No enderezar ninguno'
        : picked.length === 1
          ? `Enderezar ${nameOf(picked[0])}`
          : `Enderezar ${picked.length} permanentes`
  );
</script>

{#if prompt && mine}
  <div
    class="prompt"
    aria-label="Qué permanentes se enderezan"
    data-untap-subset
    data-untap-subset-group={prompt.group.length}
    data-untap-subset-max={prompt.max}
    data-untap-subset-chosen={picked.length}
    data-untap-subset-progress={prompt.progress}>
    <strong>Enderezar hasta {prompt.max} de {prompt.group.length}</strong>
    <p class="hint" data-untap-subset-rule>
      CR 502.3: un efecto limita cuántos permanentes de este tipo se enderezan a la vez, y Phase
      publica exactamente el grupo que compite por ese tope. Eliges cuáles se enderezan; el resto se
      queda girado.
    </p>
    {#if prompt.progress === 'before-turn-based-actions'}
      <p class="hint" data-untap-subset-resume>
        Este paso viene de una partida guardada por una versión anterior: el motor lo reanuda desde
        su primera acción (faseo y día/noche) antes de enderezar, no a mitad del paso.
      </p>
    {/if}
    <p class="hint" data-untap-subset-count>
      {picked.length === 0
        ? `Puedes enderezar hasta ${prompt.max}; si no eliges ninguno, ninguno se endereza.`
        : `${picked.length} de ${prompt.max} elegidos.`}
    </p>
    <ul class="rows">
      {#each prompt.group as id (id)}
        <li>
          <button
            type="button"
            class="row"
            data-untap-subset-option={id}
            aria-pressed={picked.includes(id)}
            disabled={session.busy || (!picked.includes(id) && picked.length >= prompt.max)}
            onclick={() => session.toggleUntapSubset(id)}>
            <span class="name">{nameOf(id)}</span>
            <span class="type">{typeOf(id)}</span>
            {#if costOf(id)}<span class="cost">{costOf(id)}</span>{/if}
          </button>
        </li>
      {/each}
    </ul>
    <div class="row">
      <button
        type="button"
        class="primary"
        data-untap-subset-confirm
        disabled={session.busy || !session.untapSubsetReady}
        onclick={() => session.confirmUntapSubset()}>
        {confirm}
      </button>
    </div>
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
    align-items: baseline;
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
  .row[aria-pressed='true'] { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
  .row:disabled { opacity: .55; cursor: not-allowed; }
  .row:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .name { font-size: .84rem; font-weight: 650; }
  .type, .cost { font-size: .74rem; color: var(--ink-2); }
  .cost { margin-left: auto; }
  .primary {
    min-height: 44px;
    padding: .55rem .7rem;
    border-radius: 9px;
    border: 1px solid var(--accent);
    background: var(--accent);
    color: var(--accent-ink);
    font: inherit;
    font-size: .82rem;
    font-weight: 650;
    cursor: pointer;
  }
  .primary:disabled { opacity: .55; cursor: not-allowed; }
  .primary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
