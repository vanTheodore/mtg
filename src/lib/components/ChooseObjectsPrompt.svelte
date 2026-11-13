<script lang="ts">
  /**
   * `WaitingFor::ChooseObjectsSelection` — CR 608.2c (a set of permanents chosen
   * while the effect is applied) and CR 115.10a (a described damage recipient,
   * which may be a seat).
   *
   * Neither is a *target*: nothing is announced, so ward, hexproof and protection
   * never restrict the pick — and that is exactly why a player can appear in the
   * list here and nowhere else. The engine publishes the window: at least `min`,
   * at most `max`, and an absent `max` means "any number" of the eligible objects.
   *
   * CR 608.2c: the picks become a **fresh tracked set** ("those creatures"), the
   * resolution scope for the rest of the effect. An empty selection is an empty
   * set, so it is legal exactly when `min` is zero.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { distinctTargetLabels, parseTarget, targetKey } from '#lib/game/interaction.ts';

  const prompt = $derived(session.chooseObjectsPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const labels = $derived(distinctTargetLabels(prompt?.eligible ?? [], objects));

  const windowLine = $derived.by(() => {
    if (!prompt) return '';
    const total = prompt.eligible.length;
    if (prompt.min === 1 && prompt.max === 1) {
      return prompt.recipient
        ? 'El daño va a la criatura o jugador que elijas al aplicarse: no es un objetivo, así que velo, antimaleficio y protección no lo impiden (CR 115.10a).'
        : 'Elige un permanente para la instrucción; se elige al aplicarse y no se anuncia como objetivo (CR 115.10a).';
    }
    if (prompt.min === 0 && prompt.max === total) {
      return `Puedes elegir cualquier número de estos ${total}, incluido ninguno: la elección es el conjunto que el resto del efecto llamará «esos» (CR 608.2c).`;
    }
    const atLeast = prompt.min > 0 ? `al menos ${prompt.min}` : 'ninguno';
    return `Elige entre ${atLeast} y ${prompt.max} de estos ${total}${prompt.openMax ? ' (el texto no pone tope: el tope es lo elegible)' : ''}. El conjunto elegido es la referencia de «esos» (CR 608.2c).`;
  });

  const countLine = $derived.by(() => {
    if (!prompt) return '';
    const picked = session.choosePick.length;
    const ceiling = prompt.openMax && prompt.max === prompt.eligible.length ? 'sin tope' : `hasta ${prompt.max}`;
    return `Elegidos ${picked} · mínimo ${prompt.min} · ${ceiling}`;
  });

  const confirmLabel = $derived.by(() => {
    if (!prompt) return '';
    const picked = session.choosePick.length;
    if (picked < prompt.min) {
      // Nothing to confirm yet, and the button says what is missing.
      return prompt.min === 1 ? 'Elige uno' : `Elige al menos ${prompt.min}`;
    }
    if (picked === 0) return 'Confirmar sin elegir ninguno';
    return `Confirmar ${picked === 1 ? 'uno' : `${picked}`} elegido${picked === 1 ? '' : 's'}`;
  });
</script>

{#if prompt && mine}
  <div
    class="prompt"
    aria-label="Elegir permanentes"
    data-choose-objects
    data-choose-recipient={prompt.recipient}
    data-choose-open-max={prompt.openMax}>
    <strong>{prompt.recipient ? 'Elegir el receptor del daño' : 'Elegir permanentes'}</strong>
    <p class="hint">{windowLine}</p>
    <p class="hint count" data-choose-count>{countLine}</p>
    {#if prompt.eligible.length}
      <ul class="rows">
        {#each prompt.eligible as target, index (targetKey(target))}
          {@const picked = session.chooseIsPicked(target)}
          <li>
            <button
              type="button"
              class="row"
              aria-pressed={picked}
              disabled={session.busy || (!picked && session.choosePick.length >= prompt.max)}
              data-choose-object={targetKey(target)}
              onclick={() => session.toggleChooseObject(target)}>
              <span class="tick" aria-hidden="true">{picked ? '✓' : ''}</span>
              <span class="name">{labels[index] ?? 'Objeto'}</span>
              <span class="kind">{parseTarget(target)?.kind === 'player' ? 'Jugador' : 'Permanente'}</span>
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="hint">Phase no publica objetos elegibles para esta elección.</p>
    {/if}
    <button
      type="button"
      class="primary"
      disabled={session.busy || !session.chooseReady}
      data-choose-ready={session.chooseReady}
      onclick={() => session.confirmChooseObjects()}>
      {confirmLabel}
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
  .count { font-weight: 650; color: var(--ink); }
  .rows { margin: 0; padding: 0; list-style: none; display: grid; gap: .3rem; }
  .row {
    display: flex;
    align-items: center;
    gap: .45rem;
    width: 100%;
    min-height: 44px;
    padding: .35rem .5rem;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--surface-3);
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .row[aria-pressed='true'] {
    border-color: var(--accent);
    background: var(--surface-1);
    box-shadow: inset 3px 0 0 var(--accent);
  }
  .row:disabled { opacity: .55; cursor: not-allowed; }
  .row:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .tick {
    width: 1.1ch;
    font-size: .9rem;
    font-weight: 800;
    color: var(--accent);
  }
  .name { flex: 1; font-size: .84rem; font-weight: 650; }
  .kind { font-size: .7rem; letter-spacing: .04em; text-transform: uppercase; color: var(--ink-2); }
  .primary {
    min-height: 44px;
    padding: .45rem .7rem;
    border: 1px solid var(--accent);
    border-radius: 9px;
    background: var(--accent);
    color: var(--accent-ink);
    font: inherit;
    font-size: .84rem;
    font-weight: 650;
    cursor: pointer;
  }
  .primary:disabled { opacity: .55; cursor: not-allowed; }
  .primary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
