<script lang="ts">
  /**
   * `WaitingFor::MeldPairChoice` — CR 701.42. Two permanents are exiled and, if
   * they are the printed halves, one card comes back fused. The engine freezes
   * **referents**, not names: every candidate carries `source_id`/`partner_id`
   * plus the printed names it expects and the card the pair would become, and the
   * answer (`ChooseMeldPair`) names both objects — a name would not say which copy.
   *
   * Two things the block says instead of hiding:
   *
   *   - With a single legal partner the engine does not ask — it melds straight
   *     away —, so this window only exists when several permanents could be the
   *     other half.
   *   - Choosing a pair does not guarantee the meld: the instruction exiles both
   *     referents first and only then checks that the tracked cards really are the
   *     canonical halves (CR 701.42b). If they are not, nothing comes back.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { distinctTargetLabels, objectTarget } from '#lib/game/interaction.ts';

  const prompt = $derived(session.meldPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  // One label pass over every candidate: two copies of the same half share a name.
  const labels = $derived(
    distinctTargetLabels((prompt?.choices ?? []).map((choice) => objectTarget(choice.partnerId)), objects)
  );
  const nameOf = (id: number) => objects[String(id)]?.name ?? `Permanente ${id}`;
  const labelOf = (id: number) => {
    const index = (prompt?.choices ?? []).findIndex((choice) => choice.partnerId === id);
    return (index >= 0 ? labels[index] : undefined) ?? nameOf(id);
  };
  const sourceName = $derived(prompt ? nameOf(prompt.sourceId) : '');
  const attacking = $derived((prompt?.choices ?? []).some((choice) => choice.attacking));
  const resultMention = $derived(prompt?.result ? `, ${prompt.result}` : '');
</script>

{#if prompt && mine}
  <div class="prompt" aria-label="Fusión" data-meld data-meld-choices={prompt.choices.length}>
    <strong>Fusión{prompt.result ? ` · ${prompt.result}` : ''}</strong>
    <p class="hint">
      CR 701.42: la fusión exilia dos permanentes y devuelve una sola carta al campo de
      batalla{resultMention}. Phase te pregunta porque hay más de una mitad posible; con una
      sola no preguntaría.
    </p>
    <p class="hint" data-meld-pair>
      Mitad fija: {sourceName}{prompt.expectedSource && prompt.expectedSource !== sourceName ? ` (la carta espera «${prompt.expectedSource}»)` : ''}
      · {prompt.choices.length} {prompt.choices.length === 1 ? 'pareja posible' : 'parejas posibles'}.
    </p>
    <ul class="rows">
      {#each prompt.choices as choice (choice.partnerId)}
        <li>
          <button
            type="button"
            class="row"
            data-meld-choice={choice.partnerId}
            disabled={session.busy}
            onclick={() => session.chooseMeldPair(choice)}>
            Fusionar con {labelOf(choice.partnerId)}
          </button>
        </li>
      {/each}
    </ul>
    {#if attacking}
      <p class="hint" data-meld-attacking>
        La carta fusionada entra girada y atacando, así que después elegirás a quién ataca (CR 508.4).
      </p>
    {/if}
    <p class="hint" data-meld-canonical>
      Elegir la pareja no la garantiza: el motor exilia los dos permanentes y después comprueba
      que las cartas son las dos mitades impresas; si no lo son, la fusión no ocurre (CR 701.42b).
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
