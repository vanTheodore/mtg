<script lang="ts">
  /**
   * `WaitingFor::TopOrBottomChoice` — CR 608.2d.
   *
   * The effect-designated player chooses the library position. Each button is
   * the published `ChooseTopOrBottom`. `top: true` places the object at the
   * published `top_position` (omitted means the top; `NthFromTop` is n from
   * the top). `top: false` is always the bottom. A button exists only when
   * that boolean is already legal. A position this table cannot place is not
   * relabeled as the top.
   *
   * The other seat sees the object and gets no button (CR 400.2).
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { topOrBottomOffers } from '#lib/game/interaction.ts';

  const prompt = $derived(session.topOrBottomPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const offers = $derived(topOrBottomOffers(session.snapshot?.legal.actions ?? []));
  const card = $derived.by(() => {
    const id = prompt?.objectId;
    if (id == null || id === 0) return '';
    const object = objects[String(id)];
    if (!object || object.display_visible_to_viewer === false) return '';
    return object.name ?? '';
  });

  const topLabel = $derived.by(() => {
    if (!prompt || prompt.side === 'top') return 'Arriba de la biblioteca';
    if (prompt.side === 'nth' && prompt.nth !== null) {
      return prompt.nth === 2 ? 'La segunda desde arriba' : `La ${prompt.nth}.ª desde arriba`;
    }
    return 'La posición que publicó el motor';
  });
</script>

{#if prompt}
  <div class="prompt" aria-label="Elegir posición en la biblioteca" data-top-bottom data-top-bottom-side={prompt.side}>
    <strong>Elegir posición en la biblioteca</strong>
    {#if card}<p class="spell" data-top-bottom-card>{card}</p>{/if}
    <p class="hint" data-top-bottom-rule>
      CR 608.2d: eliges arriba o abajo de los que publicó el motor. Abajo es siempre el fondo. Arriba es la posición que ya fijó el efecto.
    </p>
    {#if prompt.side === 'unknown'}
      <p class="hint" data-top-bottom-unknown>El motor no dijo qué posición es la que no es el fondo.</p>
    {:else if prompt.side === 'other'}
      <p class="hint" data-top-bottom-other>La posición que no es el fondo no es la cima. Esta mesa no la renombra.</p>
    {/if}
    {#if !mine}
      <ul class="faces" data-top-bottom-faces>
        {#if offers.top}<li>{topLabel}</li>{/if}
        {#if offers.bottom}<li>Abajo de la biblioteca</li>{/if}
      </ul>
      <p class="hint" data-top-bottom-other-seat>
        Esta posición la elige el Jugador {prompt.player + 1}: no es tu decisión (CR 400.2).
      </p>
    {:else}
      <div class="actions">
        {#if offers.top}
          <button
            type="button"
            class="primary"
            data-top-bottom-top
            disabled={session.busy}
            onclick={() => session.answerTopOrBottom(offers.top!)}>
            {topLabel}
          </button>
        {/if}
        {#if offers.bottom}
          <button
            type="button"
            class="ghost"
            data-top-bottom-bottom
            disabled={session.busy}
            onclick={() => session.answerTopOrBottom(offers.bottom!)}>
            Abajo de la biblioteca
          </button>
        {/if}
      </div>
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
  .spell { margin: 0; font-size: .82rem; font-weight: 650; }
  .hint { margin: 0; font-size: .78rem; color: var(--ink-2); }
  .faces { margin: 0; padding-left: 1.1rem; font-size: .78rem; }
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
