<script lang="ts">
  /**
   * `WaitingFor::CipherEncodeChoice` — CR 702.99a.
   *
   * The controller may exile the resolving card encoded on one published
   * creature, or decline. Each button is the published `CipherEncode`. A
   * creature the prompt did not list is not a button, and decline exists only
   * when `creature: null` is itself legal. A `0` is a hidden creature, not a
   * host (CR 400.2). The encoded ability (CR 702.99c) is the engine's; this
   * block does not rebuild it.
   *
   * The other seat sees the hosts and gets no button.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { cipherOffers } from '#lib/game/interaction.ts';

  const prompt = $derived(session.cipherPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const offers = $derived(cipherOffers(session.snapshot?.legal.actions ?? []));
  const card = $derived(prompt?.cardId != null ? objects[String(prompt.cardId)] : undefined);
  const cardName = $derived(
    card && card.display_visible_to_viewer !== false ? card.name ?? '' : ''
  );
  const hidden = $derived(prompt?.creatures.filter((id) => id === 0).length ?? 0);

  function hostName(id: number) {
    if (id === 0) return '';
    const object = objects[String(id)];
    if (!object || object.display_visible_to_viewer === false) return '';
    return object.name ?? '';
  }
</script>

{#if prompt}
  <div
    class="prompt"
    aria-label="Cifrar"
    data-cipher
    data-cipher-count={prompt.creatures.length}
    data-cipher-hidden={hidden}>
    <strong>Cifrar{cardName ? ` · ${cardName}` : ''}</strong>
    <p class="hint" data-cipher-rule>
      CR 702.99a: puedes exiliar esta carta cifrada en una criatura que controles. Mientras siga cifrada, esa criatura puede lanzar una copia al hacer daño de combate a un jugador (CR 702.99c).
    </p>
    {#if !mine}
      <ul class="faces" data-cipher-faces>
        {#each prompt.creatures as id, index (`${id}-${index}`)}
          <li>{id === 0 || !hostName(id) ? 'Criatura oculta' : hostName(id)}</li>
        {/each}
      </ul>
      <p class="hint" data-cipher-other>
        Esto lo elige el Jugador {prompt.player + 1}: no es tu decisión (CR 400.2).
      </p>
    {:else}
      {#if hidden}
        <p class="hint" data-cipher-hidden-note>{hidden === 1 ? '1 criatura oculta' : `${hidden} criaturas ocultas`} no se puede cifrar desde aquí.</p>
      {/if}
      <div class="actions">
        {#each prompt.creatures as id, index (`${id}-${index}`)}
          {@const action = id === 0 ? undefined : offers.byCreature.get(id)}
          {#if action}
            <button
              type="button"
              class="primary"
              data-cipher-host={id}
              disabled={session.busy}
              onclick={() => session.answerCipher(action)}>
              Cifrar en {hostName(id) || `criatura ${id}`}
            </button>
          {/if}
        {/each}
        {#if offers.decline}
          <button
            type="button"
            class="ghost"
            data-cipher-decline
            disabled={session.busy}
            onclick={() => session.declineCipher()}>
            No cifrar
          </button>
        {/if}
      </div>
      {#if offers.decline}
        <p class="hint" data-cipher-decline-note>Si no cifras, la carta va al cementerio de su propietario.</p>
      {/if}
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
