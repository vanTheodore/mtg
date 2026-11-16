<script lang="ts">
  /**
   * `WaitingFor::UntapChoice` — CR 502.3. «You may choose not to untap this
   * permanent» (Vedalken Shackles class): Phase asks one permanent at a time and
   * re-prompts with the rest, so this is per-permanent consent, not a selection.
   *
   * `chosen_not_to_untap` is what the same untap step has already declined, and it
   * is shown because it explains why the board still looks tapped. Both answers are
   * real: untapping is the default, and declining is what the card is for.
   */
  import { session } from '#lib/game/session.svelte.ts';

  const prompt = $derived(session.untapPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const nameOf = (id: number) => objects[String(id)]?.name ?? `Objeto ${id}`;
  const first = $derived(prompt?.candidates[0] ?? null);
  const pending = $derived(prompt?.candidates.length ?? 0);
  const declined = $derived(prompt?.declined ?? []);
</script>

{#if prompt && mine && first !== null}
  <div
    class="prompt"
    aria-label="Enderezar o no un permanente"
    data-untap-choice
    data-untap-choice-object={first}
    data-untap-choice-pending={pending}
    data-untap-choice-declined={declined.length}
    data-untap-choice-progress={prompt.progress}>
    <strong>Enderezar · {nameOf(first)}</strong>
    <p class="hint" data-untap-choice-rule>
      CR 502.3: el paso de enderezar es del jugador activo, y esta carta permite elegir no enderezar un
      permanente. Phase pregunta uno a uno y aplica tu respuesta antes de pasar al siguiente.
    </p>
    <p class="hint" data-untap-choice-count>
      {pending === 1
        ? 'Es el último permanente por decidir en este paso.'
        : `Quedan ${pending} permanentes por decidir en este paso.`}
    </p>
    {#if prompt.progress === 'before-turn-based-actions'}
      <p class="hint" data-untap-choice-resume>
        Este paso viene de una partida guardada por una versión anterior: el motor lo reanuda desde
        su primera acción (faseo y día/noche) antes de enderezar, no a mitad del paso.
      </p>
    {/if}
    {#if declined.length}
      <p class="hint" data-untap-choice-so-far>
        Ya dejados girados: {declined.map(nameOf).join(', ')}.
      </p>
    {/if}
    <div class="row">
      <button
        type="button"
        class="primary"
        data-untap-choice-yes
        disabled={session.busy}
        onclick={() => session.chooseUntap(first, true)}>
        Enderezar {nameOf(first)}
      </button>
      <button
        type="button"
        class="ghost"
        data-untap-choice-no
        disabled={session.busy}
        onclick={() => session.chooseUntap(first, false)}>
        Dejarlo girado
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
  .row { display: flex; gap: .4rem; flex-wrap: wrap; }
  .primary, .ghost {
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
  .primary:disabled, .ghost:disabled { opacity: .55; cursor: not-allowed; }
  .primary:focus-visible, .ghost:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
