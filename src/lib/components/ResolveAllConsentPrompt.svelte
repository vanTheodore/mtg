<script lang="ts">
  /**
   * `WaitingFor::ResolveAllConsent` — CR 117.3d + CR 117.4.
   *
   * «Resolve all» is the table's shortcut for letting Phase resolve what is left
   * of the batch at once. Each priority representative is asked first, and the
   * prompt publishes only `epoch` and `representative`: the participant list, the
   * scope of the proposal and the auto-pass baseline are server-private and are
   * cleared from every viewer projection, so this block names the seat being asked
   * and promises nothing about who already granted.
   *
   * The answers are the engine's own `RespondResolveAllConsent` envelopes, taken
   * from `legal.actions`: the prompt can outlive the run that issued it, and an
   * answer rebuilt from the epoch on screen would be accepted by this component
   * and refused by the reducer.
   */
  import { session } from '#lib/game/session.svelte.ts';

  const prompt = $derived(session.resolveAllPrompt);
  const mine = $derived(prompt !== null && prompt.representative === session.snapshot?.viewer);
  const offered = $derived(prompt !== null && (prompt.grantOffered || prompt.declineOffered));
</script>

{#if prompt && mine}
  <div
    class="prompt"
    aria-label="Consentimiento para resolver todo"
    data-resolve-all
    data-resolve-all-representative={prompt.representative}
    data-resolve-all-epoch={prompt.epoch}
    data-resolve-all-offers={prompt.grantOffered ? (prompt.declineOffered ? 'both' : 'grant') : prompt.declineOffered ? 'decline' : 'none'}>
    <strong>¿Autorizas resolver todo?</strong>
    <p class="hint" data-resolve-all-rule>
      Phase pregunta a cada representante de prioridad antes de resolver en bloque lo que queda de la
      pila (CR 117.3d + CR 117.4). Te pregunta a ti como representante del asiento
      {prompt.representative + 1}.
    </p>
    <p class="hint" data-resolve-all-private>
      Lo que la mesa no puede decir: quién más ha concedido, a cuántos asientos vincula la propuesta y
      cuántas resoluciones permite. El motor mantiene esa autoridad fuera de la vista y sólo publica a
      quién pregunta y con qué época.
    </p>
    {#if offered}
      <div class="row">
        {#if prompt.grantOffered}
          <button
            type="button"
            class="primary"
            data-resolve-all-grant
            disabled={session.busy}
            onclick={() => session.answerResolveAll(true)}>
            Sí, resolver todo
          </button>
        {/if}
        {#if prompt.declineOffered}
          <button
            type="button"
            class="ghost"
            data-resolve-all-decline
            disabled={session.busy}
            onclick={() => session.answerResolveAll(false)}>
            No, seguir paso a paso
          </button>
        {/if}
      </div>
      <p class="hint" data-resolve-all-epoch-note>
        Época {prompt.epoch}: una respuesta que llegue tarde y nombre otra época se rechaza, así que se
        manda la que ofrece el motor y no la que se lee en pantalla.
      </p>
    {:else}
      <p class="hint" data-resolve-all-waiting>
        El motor no ofrece ahora ninguna respuesta a este asiento para la época {prompt.epoch}: la
        propuesta ya no admite respuestas desde aquí.
      </p>
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
  .row { display: flex; gap: .4rem; flex-wrap: wrap; }
  .primary, .ghost {
    min-height: 44px;
    padding: .55rem .7rem;
    border-radius: 9px;
    border: 1px solid var(--line);
    font: inherit;
    font-size: .82rem;
    font-weight: 650;
    cursor: pointer;
  }
  .primary { border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); }
  .ghost { background: var(--surface-3); color: var(--ink); }
  .primary:disabled, .ghost:disabled { opacity: .55; cursor: not-allowed; }
  .primary:focus-visible, .ghost:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
