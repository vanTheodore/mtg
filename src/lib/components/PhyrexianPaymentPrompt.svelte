<script lang="ts">
  /**
   * `WaitingFor::PhyrexianPayment` — CR 107.4f + CR 601.2f. Phyrexian mana lets the
   * caster pay **2 life instead of the colored mana**, per shard, at the moment the
   * cost is paid. This is not a subset and not a toggle: the answer is an **ordered
   * vector with one entry per shard**, in the engine's `shard_index` order, and its
   * length must equal `shards.len()`.
   *
   * The engine already decided which payments each shard allows — `ManaOnly` (no
   * life to spend, or a CR 119.8 lock), `LifeOnly` (no mana of that color reachable
   * under the current restrictions) and `ManaOrLife` — so the block offers exactly
   * that per row and never computes affordability itself. Confirming stays dead
   * until every shard has an answer; a partial vector is not an answer.
   *
   * CR 601.2i: cancelling the cast is a real answer here, and it discards every
   * choice made so far because nothing has been paid yet.
   */
  import { session } from '#lib/game/session.svelte.ts';

  const prompt = $derived(session.phyrexianPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const spellName = $derived(
    prompt ? objects[String(prompt.spellId)]?.name ?? `Hechizo ${prompt.spellId}` : ''
  );
  const COLORS: Record<string, string> = {
    White: 'blanco',
    Blue: 'azul',
    Black: 'negro',
    Red: 'rojo',
    Green: 'verde'
  };
  const PIPS: Record<string, string> = {
    White: 'W',
    Blue: 'U',
    Black: 'B',
    Red: 'R',
    Green: 'G'
  };
  const colorOf = (color: string) => COLORS[color] ?? color;
  const answered = $derived(
    (prompt?.shards ?? []).filter((_, position) => session.phyrexianChoiceAt(position) !== null).length
  );
  const lifeTotal = $derived((prompt?.shards ?? []).filter((_, position) => session.phyrexianChoiceAt(position) === 'life').length * 2);
</script>

{#if prompt && mine}
  <div
    class="prompt"
    aria-label="Pagar maná frigio"
    data-phyrexian
    data-phyrexian-spell={prompt.spellId}
    data-phyrexian-shards={prompt.shards.length}
    data-phyrexian-answered={answered}>
    <strong>Maná frigio · {spellName}</strong>
    <p class="hint" data-phyrexian-rule>
      CR 107.4f: cada símbolo frigio se puede pagar con un maná de su color o con 2 vidas, y se decide al pagar el
      coste (CR 601.2f). Hacen falta {prompt.shards.length}
      {prompt.shards.length === 1 ? 'respuesta' : 'respuestas'}, una por símbolo y en este orden.
    </p>
    <ul class="rows">
      {#each prompt.shards as shard, position (shard.index)}
        {@const choice = session.phyrexianChoiceAt(position)}
        <li class="shard">
          <span class="symbol" aria-hidden="true">{PIPS[shard.color] ?? 'P'}</span>
          <span class="name">Símbolo {position + 1} · {colorOf(shard.color)}</span>
          <span class="options">
            <button
              type="button"
              class="choice"
              aria-pressed={choice === 'mana'}
              disabled={session.busy || shard.options === 'life-only'}
              data-phyrexian-mana={shard.index}
              onclick={() => session.setPhyrexianChoice(position, 'mana')}>
              {PIPS[shard.color] ?? ''}
            </button>
            <button
              type="button"
              class="choice"
              aria-pressed={choice === 'life'}
              disabled={session.busy || shard.options === 'mana-only'}
              data-phyrexian-life={shard.index}
              onclick={() => session.setPhyrexianChoice(position, 'life')}>
              2 vidas
            </button>
          </span>
          {#if shard.options === 'mana-only'}
            <span class="note" data-phyrexian-mana-only={shard.index}>sólo maná</span>
          {:else if shard.options === 'life-only'}
            <span class="note" data-phyrexian-life-only={shard.index}>sólo vidas</span>
          {/if}
        </li>
      {/each}
    </ul>
    <p class="hint" data-phyrexian-total>
      {lifeTotal === 0
        ? 'Ningún símbolo se paga con vidas.'
        : `Pagas ${lifeTotal} ${lifeTotal === 1 ? 'vida' : 'vidas'} y el resto con maná.`}
    </p>
    <div class="actions">
      <button
        type="button"
        class="primary"
        data-phyrexian-confirm
        disabled={session.busy || !session.phyrexianReady}
        onclick={() => session.confirmPhyrexian()}>
        Pagar {prompt.shards.length === 1 ? 'el símbolo' : `los ${prompt.shards.length} símbolos`}
      </button>
      <button
        type="button"
        class="ghost"
        data-phyrexian-cancel
        disabled={session.busy}
        onclick={() => session.cancelPhyrexian()}>
        Cancelar el lanzamiento
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
  .shard {
    display: flex;
    align-items: center;
    gap: .45rem;
    flex-wrap: wrap;
    padding: .35rem .55rem;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--surface-3);
  }
  .symbol {
    display: grid;
    place-items: center;
    width: 1.4rem;
    height: 1.4rem;
    border-radius: 999px;
    background: var(--surface-1);
    border: 1px solid var(--line);
    font-size: .72rem;
    font-weight: 700;
  }
  .name { font-size: .82rem; font-weight: 650; }
  .options { display: flex; gap: .3rem; margin-left: auto; }
  .choice {
    min-height: 34px;
    min-width: 44px;
    padding: .25rem .5rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-1);
    color: var(--ink);
    font: inherit;
    font-size: .78rem;
    font-weight: 650;
    cursor: pointer;
  }
  .choice[aria-pressed='true'] { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
  .choice:disabled { opacity: .45; cursor: not-allowed; }
  .choice:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .note { font-size: .72rem; color: var(--ink-2); }
  .actions { display: flex; gap: .4rem; flex-wrap: wrap; }
  .primary,
  .ghost {
    min-height: 44px;
    padding: .55rem .7rem;
    border-radius: 9px;
    font: inherit;
    font-size: .82rem;
    font-weight: 650;
    cursor: pointer;
  }
  .primary { border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); }
  .ghost { border: 1px solid var(--line); background: var(--surface-3); color: var(--ink); }
  .primary:disabled,
  .ghost:disabled { opacity: .55; cursor: not-allowed; }
  .primary:focus-visible,
  .ghost:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
