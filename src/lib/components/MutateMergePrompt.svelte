<script lang="ts">
  /**
   * `WaitingFor::MutateMergeChoice` — CR 702.140c + CR 730.2a.
   *
   * The mutating spell is already aimed at a legal target. The buttons are the
   * published `ChooseMutateMergeSide` actions. A side the engine did not publish
   * is not rebuilt. The side picks which component supplies the name, types and
   * power; it does not change the target's identity (CR 730.2c) and it does not
   * drop either component's abilities (CR 702.140e).
   *
   * The other seat sees the published sides and gets no button (CR 400.2).
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { mutateMergeOffers, type MergeSideName } from '#lib/game/interaction.ts';

  const prompt = $derived(session.mutateMergePrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const offers = $derived(mutateMergeOffers(session.snapshot?.legal.actions ?? []));
  const order: MergeSideName[] = ['Top', 'Bottom'];
  const sides = $derived(order.filter((side) => offers.bySide.has(side)));

  function visibleName(id: number | null) {
    if (id == null || id === 0) return '';
    const object = objects[String(id)];
    if (!object || object.display_visible_to_viewer === false) return '';
    return object.name ?? '';
  }

  const merging = $derived(visibleName(prompt?.mergingId ?? null));
  const target = $derived(visibleName(prompt?.targetId ?? null));
  const mergingLabel = $derived(merging || 'la criatura que muta');
  const targetLabel = $derived(target || 'la criatura objetivo');

  function sideLabel(side: MergeSideName) {
    return side === 'Top' ? 'Poner encima' : 'Poner debajo';
  }
  function sideNote(side: MergeSideName) {
    return side === 'Top'
      ? `Encima: el nombre lo pone ${mergingLabel}.`
      : `Debajo: el nombre lo conserva ${targetLabel}.`;
  }
</script>

{#if prompt}
  <div class="prompt" aria-label="Mutar" data-mutate data-mutate-count={sides.length}>
    <strong>Mutar{merging ? ` · ${merging}` : ''}{target ? ` sobre ${target}` : ''}</strong>
    <p class="hint" data-mutate-rule>
      CR 702.140c: el lado elige qué componente da el nombre, los tipos y la fuerza (CR 730.2a). Las habilidades de ambos se quedan (CR 702.140e). El permanente conserva la identidad del objetivo (CR 730.2c) y no vuelve a entrar.
    </p>
    {#if !mine}
      <ul class="faces" data-mutate-faces>
        {#each sides as side (side)}
          <li>{sideLabel(side)}. {sideNote(side)}</li>
        {/each}
      </ul>
      <p class="hint" data-mutate-other>
        Este lado lo elige el Jugador {prompt.player + 1}: no es tu decisión (CR 400.2).
      </p>
    {:else}
      <div class="actions">
        {#each sides as side (side)}
          {@const action = offers.bySide.get(side)}
          {#if action}
            <button
              type="button"
              class="primary"
              data-mutate-side={side}
              disabled={session.busy}
              onclick={() => session.answerMutateMerge(action)}>
              {sideLabel(side)}
            </button>
          {/if}
        {/each}
      </div>
      {#each sides as side (side)}
        <p class="hint" data-mutate-note={side}>{sideNote(side)}</p>
      {/each}
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
