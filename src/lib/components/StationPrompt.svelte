<script lang="ts">
  /**
   * `WaitingFor::StationTarget` — CR 702.184a: the station ability's cost is
   * "tap **another** untapped creature you control", and the number of charge
   * counters the Spacecraft gets is that creature's power as the engine computes
   * it (CR 702.184c). So the pick is a quantity, not a permission, and it is
   * exactly one creature: not the sum the crew/saddle block composes.
   *
   * The prompt publishes only the candidates, never a contribution list, so the
   * block shows no counter count of its own: the printed power is not
   * necessarily what the engine charges, and the number arrives with the
   * resolution. Cancelling is a real answer here — the tap cost is not paid
   * until the announcement (CR 602.2b), so leaving costs nothing.
   */
  import { session } from '#lib/game/session.svelte.ts';

  const prompt = $derived(session.stationPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const spacecraft = $derived(prompt ? objects[String(prompt.spacecraftId)]?.name : undefined);
  const nameOf = (id: number) => objects[String(id)]?.name ?? `Objeto ${id}`;
</script>

{#if prompt && mine}
  <div class="prompt" aria-label="Estación: girar una criatura" data-station-prompt>
    <strong>Estación{spacecraft ? ` · ${spacecraft}` : ''}</strong>
    <p class="hint">
      Gira una criatura tuya: la nave recibe contadores de carga iguales a su fuerza tal
      como la calcula el motor (CR 702.184a), y eso puede no ser la fuerza impresa
      (CR 702.184c). Es una criatura, no una suma.
    </p>
    {#if prompt.creatures.length}
      <ul class="rows">
        {#each prompt.creatures as id (id)}
          <li>
            <button type="button" class="row" disabled={session.busy} onclick={() => session.stationTo(id)}>
              {nameOf(id)}
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="hint">Phase no ofrece criaturas para este coste.</p>
    {/if}
    <button type="button" class="ghost" disabled={session.busy} onclick={() => session.cancelCast()}>
      Cancelar: no girar nada
    </button>
    <p class="hint small">Todavía no se ha pagado nada: el coste se paga al anunciar (CR 602.2b).</p>
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
  .hint.small { font-size: .72rem; }
  .rows { margin: 0; padding: 0; list-style: none; display: grid; gap: .3rem; }
  .row, .ghost {
    width: 100%;
    min-height: 44px;
    padding: .45rem .55rem;
    border: 1px solid var(--line);
    border-radius: 9px;
    font: inherit;
    font-size: .84rem;
    font-weight: 650;
    text-align: left;
    cursor: pointer;
  }
  .row { background: var(--surface-3); color: var(--ink); }
  .ghost { background: transparent; color: var(--ink-2); }
  .row:disabled, .ghost:disabled { opacity: .55; cursor: not-allowed; }
  .row:focus-visible, .ghost:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
