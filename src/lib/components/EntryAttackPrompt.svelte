<script lang="ts">
  /**
   * `WaitingFor::EntryAttackTargetChoice` — CR 508.4. A permanent that enters the
   * battlefield already attacking never went through the declare-attackers step
   * (CR 508.1), so its controller names the defending player, planeswalker or
   * battle it attacks. Ninjutsu (CR 702.49c), sneak (CR 702.190b) and every «put
   * it onto the battlefield tapped and attacking» instruction end up here.
   *
   * This is the generic window, not the melded one: the engine publishes
   * `object_id` —the real permanent— and no frozen selection, so the name comes
   * from the battlefield. It only pauses when there is more than one legal
   * destination; with one, the permanent enters attacking it and nothing is asked.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { attackLabel } from '#lib/game/interaction.ts';

  const prompt = $derived(session.entryAttackPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const entering = $derived(
    prompt ? objects[String(prompt.objectId)]?.name ?? `Carta ${prompt.objectId}` : ''
  );
  const key = (target: { type: string; data: number }) => `${target.type}:${target.data}`;
</script>

{#if prompt && mine}
  <div class="prompt" aria-label="A quién ataca el permanente que entra" data-entry-attack data-entry-attack-targets={prompt.targets.length}>
    <strong>Entra atacando · {entering}</strong>
    <p class="hint">
      CR 508.4: el permanente entra en el campo ya atacando —ninjutsu, sneak o un efecto que
      lo pone en el campo atacando— y no fue declarado atacante, así que eliges a quién ataca
      entre los destinos que Phase publica. Una batalla también es un destino legal (CR 310.5).
    </p>
    <p class="hint" data-entry-attack-count>
      {prompt.targets.length === 1 ? 'Hay 1 destino posible.' : `Hay ${prompt.targets.length} destinos posibles.`}
    </p>
    <ul class="rows">
      {#each prompt.targets as target (key(target))}
        <li>
          <button
            type="button"
            class="row"
            data-entry-attack-target={key(target)}
            disabled={session.busy}
            onclick={() => session.chooseEntryAttackTarget(target)}>
            Atacar a {attackLabel(target, objects)}
          </button>
        </li>
      {/each}
    </ul>
    <p class="hint" data-entry-attack-stale>
      Si el destino deja de ser legal antes de aplicarse, el permanente queda girado y atacando
      pero sin destino (CR 508.4a): el motor no vuelve a preguntar.
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
