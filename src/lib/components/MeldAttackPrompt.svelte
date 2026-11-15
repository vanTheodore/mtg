<script lang="ts">
  /**
   * `WaitingFor::MeldAttackTargetChoice` — CR 508.4. The melded permanent enters
   * tapped and attacking, and its controller picks one defending player,
   * planeswalker or battle. Phase publishes the whole legal topology
   * (`valid_targets`) and only pauses when there is more than one: with a single
   * destination the permanent simply enters attacking it.
   *
   * The context is the very `MeldSelection` the pair choice froze, so the block
   * names the card that is entering instead of re-reading the battlefield.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { attackLabel } from '#lib/game/interaction.ts';

  const prompt = $derived(session.meldAttackPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  // The engine commits the melded identity before asking, so the instruction's
  // result is the accurate name; the object is the fallback when it is absent.
  const entering = $derived(prompt ? prompt.result ?? objects[String(prompt.sourceId)]?.name ?? 'La carta fusionada' : '');
  const key = (target: { type: string; data: number }) => `${target.type}:${target.data}`;
</script>

{#if prompt && mine}
  <div class="prompt" aria-label="A quién ataca la fusión" data-meld-attack data-meld-attack-targets={prompt.targets.length}>
    <strong>Entra atacando · {entering}</strong>
    <p class="hint">
      CR 508.4: la carta fusionada entra girada y atacando, y no fue declarada atacante, así que
      eliges a quién ataca entre los destinos que Phase publica.
    </p>
    <p class="hint" data-meld-attack-count>
      {prompt.targets.length === 1 ? 'Hay 1 destino posible.' : `Hay ${prompt.targets.length} destinos posibles.`}
    </p>
    <ul class="rows">
      {#each prompt.targets as target (key(target))}
        <li>
          <button
            type="button"
            class="row"
            data-meld-attack-target={key(target)}
            disabled={session.busy}
            onclick={() => session.chooseMeldAttackTarget(target)}>
            Atacar a {attackLabel(target, objects)}
          </button>
        </li>
      {/each}
    </ul>
    <p class="hint" data-meld-attack-stale>
      Si el destino deja de ser legal antes de aplicarse, el permanente queda girado pero no
      atacando (CR 508.4a): el motor no te devuelve a esta ventana.
    </p>
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
    width: 100%;
    min-height: 44px;
    padding: .35rem .55rem;
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
  .row:disabled { opacity: .55; cursor: not-allowed; }
  .row:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
