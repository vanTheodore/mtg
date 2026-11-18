<script lang="ts">
  /**
   * `WaitingFor::EnlistChoice` — CR 508.1g + CR 702.154a. As a creature with enlist
   * attacks, you may tap **one** other untapped, nonattacking creature you control
   * whose power is less than or equal to the attacker's; if you do, the attacker
   * gets +X/+0 until end of turn, where X is the tapped creature's power.
   *
   * `eligible` is the engine's legal tap set for this occurrence: it already
   * applied power, tapped and attacking, so the block does not filter and does not
   * compute the bonus — it shows the power so the trade is legible and lets Phase
   * do the arithmetic. `remaining` is the queue of later enlist occurrences in the
   * same declaration, which is why this is one choice at a time.
   *
   * Declining is a real answer (`ChooseEnlist { target: null }`): enlist taps »up to
   * one», so «no alistar» is not a disabled button, it is a move.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { distinctTargetLabels, objectTarget } from '#lib/game/interaction.ts';

  const prompt = $derived(session.enlistPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const labels = $derived(
    distinctTargetLabels((prompt?.eligible ?? []).map((id) => objectTarget(id)), objects)
  );
  const nameOf = (id: number) => {
    const index = (prompt?.eligible ?? []).indexOf(id);
    return (index >= 0 ? labels[index] : undefined) ?? objects[String(id)]?.name ?? `Criatura ${id}`;
  };
  const pending = $derived(prompt?.remaining.length ?? 0);
  const attackerPower = $derived(prompt ? session.powerOf(prompt.attacker) : undefined);
</script>

{#if prompt && mine}
  <div
    class="prompt"
    aria-label="Alistar al atacar"
    data-enlist
    data-enlist-attacker={prompt.attacker}
    data-enlist-eligible={prompt.eligible.length}
    data-enlist-pending={pending}
    data-enlist-power={attackerPower ?? 'unpublished'}>
    <strong>Alistar · {nameOf(prompt.attacker)}</strong>
    <p class="hint" data-enlist-rule>
      CR 508.1g + CR 702.154a: puedes girar otra criatura desgirada que controles y que no ataque,
      con fuerza menor o igual a la del atacante. Si lo haces, el atacante recibe +X/+0 hasta el
      final del turno, donde X es la fuerza de la criatura girada. Phase ya aplicó la fuerza, la
      posición y el ataque al publicar esta lista; aquí no se filtra nada más.
    </p>
    <p class="hint" data-enlist-count>
      {pending === 0
        ? 'Es la última instancia de alistar de esta declaración.'
        : `Quedan ${pending} ${pending === 1 ? 'instancia' : 'instancias'} de alistar en esta declaración.`}
    </p>
    {#if prompt.hasEligible}
      <ul class="rows">
        {#each prompt.eligible as id (id)}
          {@const power = session.powerOf(id)}
          <li>
            <button
              type="button"
              class="row"
              data-enlist-option={id}
              disabled={session.busy}
              onclick={() => session.answerEnlist(id)}>
              <span class="name">{nameOf(id)}</span>
              <span class="power">
                {power === undefined ? 'fuerza sin publicar' : `fuerza ${power}`}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="hint" data-enlist-empty>Phase no publica criaturas que puedas girar: sólo queda rechazar.</p>
    {/if}
    <button
      type="button"
      class="ghost"
      data-enlist-decline
      disabled={session.busy}
      onclick={() => session.answerEnlist(null)}>
      No alistar
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
  .row:disabled { opacity: .55; cursor: not-allowed; }
  .row:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .name { font-size: .84rem; font-weight: 650; }
  .power { margin-left: auto; font-size: .74rem; color: var(--ink-2); }
  .ghost {
    justify-self: start;
    min-height: 44px;
    padding: .55rem .7rem;
    border-radius: 9px;
    border: 1px solid var(--line);
    background: var(--surface-3);
    color: var(--ink);
    font: inherit;
    font-size: .82rem;
    font-weight: 650;
    cursor: pointer;
  }
  .ghost:disabled { opacity: .55; cursor: not-allowed; }
  .ghost:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
