<script lang="ts">
  /**
   * `WaitingFor::OptionalEffectChoice` — CR 608.2d ("you may …").
   *
   * The engine asks a yes/no question and publishes the instruction's own
   * wording, so the block never paraphrases a card text. Two boxes come from
   * the engine as well, not from card data:
   *   - "no volver a preguntar" exists only when the prompt carries a
   *     `may_trigger_key` (CR 603.5), because that key is what the engine can
   *     remember;
   *   - the wider "for this same card" scope exists only when the prompt says
   *     the engine offers it, and picking it implies remembering.
   */
  import { session } from '#lib/game/session.svelte.ts';

  const prompt = $derived(session.optionalEffectPrompt);
  // CR 608.2d: the same action answers two different questions. When the seat
  // asked does not control the source, the block has to say so — otherwise a
  // player reads "puedes" as their own trigger and looks for their permanent.
  const theirs = $derived(prompt?.asked === 'opponent');
  const others = $derived(prompt?.remaining.length ?? 0);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const source = $derived(prompt ? objects[String(prompt.sourceId)]?.name : undefined);
  const subject = $derived(
    prompt?.subjectId !== undefined ? objects[String(prompt.subjectId)]?.name : undefined
  );
</script>

{#if prompt && mine}
  <div class="prompt" aria-label="Efecto opcional" data-optional-effect>
    <strong>{theirs ? 'Otro jugador te pregunta' : 'Puedes'}{source ? ` · ${source}` : ''}</strong>
    <p class="hint">
      {prompt.description ?? 'Phase pregunta si quieres resolver este efecto.'}
    </p>
    {#if subject && subject !== source}
      <p class="hint">Afecta a {subject}.</p>
    {/if}
    {#if theirs}
      <p class="hint">
        La fuente no es tuya: la decisión sí. Phase pregunta a cada jugador en
        orden de turno{#if others > 0}, y después {others === 1 ? 'queda 1 jugador' : `quedan ${others} jugadores`}{/if}.
      </p>
    {/if}
    <div class="row">
      <button type="button" class="primary" disabled={session.busy} onclick={() => session.decideOptional(true)}>Sí, resolverlo</button>
      <button type="button" class="ghost" disabled={session.busy} onclick={() => session.decideOptional(false)}>No</button>
    </div>
    {#if prompt.rememberable}
      <div class="remember">
        <label>
          <input
            type="checkbox"
            checked={session.optionalRemember}
            onchange={(event) => {
              session.optionalRemember = event.currentTarget.checked;
              // The wider scope only makes sense while remembering.
              if (!event.currentTarget.checked) session.optionalSameCard = false;
            }} />
          <span>No volver a preguntar por este disparo</span>
        </label>
        {#if prompt.sameCardAvailable}
          <label>
            <input
              type="checkbox"
              checked={session.optionalSameCard}
              onchange={(event) => {
                session.optionalSameCard = event.currentTarget.checked;
                if (event.currentTarget.checked) session.optionalRemember = true;
              }} />
            <span>Tampoco para esta misma carta</span>
          </label>
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
  .hint { margin: 0; font-size: .8rem; color: var(--ink-2); }
  .row { display: flex; gap: .4rem; flex-wrap: wrap; }
  .primary, .ghost {
    min-height: 44px;
    padding: .5rem .8rem;
    border-radius: 9px;
    font: inherit;
    font-size: .84rem;
    font-weight: 650;
    cursor: pointer;
  }
  .primary { border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); }
  .ghost { border: 1px solid var(--line); background: var(--surface-3); color: var(--ink); }
  .primary:disabled, .ghost:disabled { opacity: .55; cursor: not-allowed; }
  .remember { display: grid; gap: .3rem; padding-top: .2rem; border-top: 1px solid var(--line); }
  label { display: flex; align-items: center; gap: .45rem; font-size: .78rem; min-height: 32px; }
  input[type='checkbox'] { width: 1.1rem; height: 1.1rem; accent-color: var(--accent); }
  .primary:focus-visible, .ghost:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
