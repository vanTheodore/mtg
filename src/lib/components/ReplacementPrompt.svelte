<script lang="ts">
  /**
   * `WaitingFor::ReplacementChoice` — CR 616.1.
   *
   * One variant, three prompts, and the engine says which one it is (`kind`):
   *
   *   - `order` (CR 616.1e): several distinct replacements apply to the same
   *     event. The player picks **one** and the engine applies it, then asks again
   *     about whatever is still applicable (CR 616.1f) — so this is one pick per
   *     step, not a list to drag into an order. `lastAppliedDecides` is the
   *     engine's answer to whether the last one alone decides the outcome or the
   *     effects compose; the block repeats it instead of guessing.
   *   - `optionalBranch`: one «you may» replacement shown as its two branches.
   *   - `destination`: mutually exclusive destinations for a found card.
   *
   * Every slot Phase will accept has a button, described or not: the answer is a
   * position, and an index with no button would be a dead end.
   */
  import { session } from '#lib/game/session.svelte.ts';

  const prompt = $derived(session.replacementPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const count = $derived(prompt?.options.length ?? 0);
  const title = $derived(
    !prompt
      ? ''
      : prompt.kind === 'optional'
        ? 'Un reemplazo opcional'
        : prompt.kind === 'destination'
          ? '¿A dónde va la carta?'
          : '¿Qué reemplazo se aplica ahora?'
  );
  const label = (option: { index: number; description: string | null }) =>
    option.description ?? `Opción ${option.index + 1} · Phase no describió esta opción`;
</script>

{#if prompt && mine}
  <div
    class="prompt"
    aria-label="Reemplazos del suceso"
    data-replacement
    data-replacement-kind={prompt.kind}
    data-replacement-count={count}
    data-replacement-decides={prompt.lastAppliedDecides ? 'last' : 'compose'}>
    <strong>{title}</strong>
    <p class="hint" data-replacement-rule>
      {#if prompt.kind === 'optional'}
        CR 616.1: el reemplazo dice «puedes», así que la decisión es de quien lo controla. Cada rama
        es una respuesta; Phase aplica la que elijas.
      {:else if prompt.kind === 'destination'}
        CR 616.1: Phase encontró la carta y ofrece destinos alternativos. Los destinos no se suman:
        se elige uno.
      {:else}
        CR 616.1e: hay {count === 1 ? 'un reemplazo aplicable' : `${count} reemplazos aplicables`} al
        mismo suceso y elige el jugador afectado. Phase aplica el que elijas y vuelve a preguntar por
        los que sigan siendo aplicables (CR 616.1f): es una elección por paso, no un orden que se
        arrastre de una vez.
      {/if}
    </p>
    {#if prompt.kind === 'order'}
      <p class="hint" data-replacement-compose>
        {#if prompt.lastAppliedDecides}
          CR 616.1f: el último reemplazo que se aplique decide el resultado —los dos escriben el mismo
          dato y el segundo gana—, así que el orden sí cambia lo que pasa.
        {:else}
          Los dos efectos se componen —por ejemplo un doble y un añadido, contadores o maná— y ninguno
          decide solo el resultado (CR 616.1f).
        {/if}
      </p>
    {/if}
    <ul class="rows">
      {#each prompt.options as option (option.index)}
        <li>
          <button
            type="button"
            class="row"
            data-replacement-option={option.index}
            disabled={session.busy}
            onclick={() => session.chooseReplacement(option.index)}>
            <span class="text">{label(option)}</span>
            {#if option.sourceName}
              <span class="source">{option.sourceName}</span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
    {#if prompt.kind === 'order'}
      <p class="hint" data-replacement-again>
        Después de cada elección Phase puede volver a preguntar; esta ventana se cierra cuando no queda
        ningún reemplazo aplicable.
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
  .rows { margin: 0; padding: 0; list-style: none; display: grid; gap: .3rem; }
  .row {
    display: grid;
    gap: .1rem;
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
  .text { font-size: .84rem; font-weight: 650; }
  .source { font-size: .74rem; color: var(--ink-2); }
  .row:disabled { opacity: .55; cursor: not-allowed; }
  .row:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
